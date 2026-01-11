/**
 * GameCache - localStorage-based caching with TTL for game data
 * Enables instant game loading from cached data with background refresh
 */

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
    version: string;
}

// Cache version - increment when data structure changes
const CACHE_VERSION = '1.0.0';

// Cache keys
export const CACHE_KEYS = {
    GAME_DATA: 'overguild_game_data',
    USER_PROFILE: 'overguild_user_profile',
    LAST_SYNC: 'overguild_last_sync',
} as const;

// TTL settings (in milliseconds)
export const CACHE_TTL = {
    GAME_DATA: 5 * 60 * 1000,       // 5 minutes - full game data
    USER_PROFILE: 10 * 60 * 1000,   // 10 minutes - user profile
    GARDEN: 2 * 60 * 1000,          // 2 minutes - garden (changes frequently)
    INVENTORY: 5 * 60 * 1000,       // 5 minutes - inventory
    SHOP: 30 * 60 * 1000,           // 30 minutes - shop catalog (rarely changes)
    STATIC: 24 * 60 * 60 * 1000,    // 24 hours - static data
} as const;

// Stale threshold - when to trigger background refresh (percentage of TTL)
const STALE_THRESHOLD = 0.5; // Refresh when 50% of TTL has passed

export class GameCache {
    /**
     * Check if localStorage is available
     */
    static isAvailable(): boolean {
        try {
            const testKey = '__cache_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get item from cache
     * Returns null if not found, expired, or version mismatch
     */
    static get<T>(key: string): T | null {
        if (!this.isAvailable()) return null;

        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;

            const entry: CacheEntry<T> = JSON.parse(raw);

            // Check version
            if (entry.version !== CACHE_VERSION) {
                console.log(`[GameCache] Version mismatch for ${key}, clearing cache`);
                localStorage.removeItem(key);
                return null;
            }

            // Check expiration
            if (Date.now() > entry.expiresAt) {
                console.log(`[GameCache] Cache expired for ${key}`);
                localStorage.removeItem(key);
                return null;
            }

            return entry.data;
        } catch (error) {
            console.error(`[GameCache] Error reading ${key}:`, error);
            localStorage.removeItem(key);
            return null;
        }
    }

    /**
     * Set item in cache with TTL
     */
    static set<T>(key: string, data: T, ttl: number): boolean {
        if (!this.isAvailable()) return false;

        try {
            const entry: CacheEntry<T> = {
                data,
                timestamp: Date.now(),
                expiresAt: Date.now() + ttl,
                version: CACHE_VERSION,
            };

            localStorage.setItem(key, JSON.stringify(entry));
            console.log(`[GameCache] Saved ${key} (TTL: ${ttl / 1000}s)`);
            return true;
        } catch (error) {
            console.error(`[GameCache] Error saving ${key}:`, error);
            // If quota exceeded, try to clear old caches
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                this.clearAll();
            }
            return false;
        }
    }

    /**
     * Check if cache entry is stale (should trigger background refresh)
     */
    static isStale(key: string, ttl: number): boolean {
        if (!this.isAvailable()) return true;

        try {
            const raw = localStorage.getItem(key);
            if (!raw) return true;

            const entry: CacheEntry<unknown> = JSON.parse(raw);
            const age = Date.now() - entry.timestamp;
            return age > ttl * STALE_THRESHOLD;
        } catch {
            return true;
        }
    }

    /**
     * Get cache age in milliseconds
     */
    static getAge(key: string): number | null {
        if (!this.isAvailable()) return null;

        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;

            const entry: CacheEntry<unknown> = JSON.parse(raw);
            return Date.now() - entry.timestamp;
        } catch {
            return null;
        }
    }

    /**
     * Check if cache exists and is valid
     */
    static has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Remove item from cache
     */
    static remove(key: string): void {
        if (!this.isAvailable()) return;
        localStorage.removeItem(key);
        console.log(`[GameCache] Removed ${key}`);
    }

    /**
     * Clear all game caches
     */
    static clearAll(): void {
        if (!this.isAvailable()) return;

        Object.values(CACHE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        console.log('[GameCache] Cleared all caches');
    }

    /**
     * Get cache statistics
     */
    static getStats(): {
        available: boolean;
        entries: { key: string; age: number | null; size: number }[];
        totalSize: number;
    } {
        const entries: { key: string; age: number | null; size: number }[] = [];
        let totalSize = 0;

        if (this.isAvailable()) {
            Object.values(CACHE_KEYS).forEach(key => {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const size = raw.length * 2; // UTF-16 = 2 bytes per char
                    entries.push({
                        key,
                        age: this.getAge(key),
                        size,
                    });
                    totalSize += size;
                }
            });
        }

        return {
            available: this.isAvailable(),
            entries,
            totalSize,
        };
    }

    /**
     * Format age for display
     */
    static formatAge(ms: number | null): string {
        if (ms === null) return 'N/A';
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
        return `${Math.round(ms / 3600000)}h`;
    }

    /**
     * Format size for display
     */
    static formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
}
