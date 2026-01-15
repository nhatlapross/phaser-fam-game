// src/game/GameDataService.ts
// Service to batch fetch all game data during loading screen
// Supports localStorage caching for instant game loading on subsequent visits

import { UserService } from './UserService';
import { GardenService, GardenResponse } from './GardenService';
import { SeedService, SeedInventoryItem } from './SeedService';
import { FertilizerService, FertilizerInventoryResponse } from './FertilizerService';
import { FruitService } from './FruitService';
import { MissionService, Mission } from './MissionService';
import { QuizService, Quiz } from './QuizService';
import { EventService, GameEvent } from './EventService';
import { StreakService, StreakStatusResponse, StreakHistoryResponse } from './StreakService';
import { ShopService, GoldShopResponse, GemShopResponse, CashShopResponse } from './ShopService';
import { InventoryService, StorageResponse, BackpackResponse } from './InventoryService';
import { BadgeService, SoulboundToken } from './BadgeService';
import { PlantType } from './types/GameTypes';
import { GameCache, CACHE_KEYS, CACHE_TTL } from './utils/GameCache';
import { EventBus } from './EventBus';

// Types for pre-loaded data
export interface UserData {
    id: string;
    address: string;
    walletAddress?: string;
    walletAddressSui?: string;
    walletAddressAptos?: string;
    walletAddressCardano?: string;
    username: string | null;
    avatar: string | null;
    characterType: number; // 1-5, maps to character index 0-4
    xp: number;
    reputationScore: number;
    gold?: number;
    gem?: number;
    landsCount: number;
    plantsCount: number;
    network: string;
    balanceGold?: number;
    balanceGem?: number;
}

export interface CurrencyBalances {
    gold: number;
    gem: number;
}

export interface FruitInventoryItem {
    type: PlantType;
    count: number;
}

export interface StreakData {
    status: StreakStatusResponse | null;
    history: StreakHistoryResponse | null;
}

export interface ShopData {
    goldShop: GoldShopResponse | null;
    gemShop: GemShopResponse | null;
    cashShop: CashShopResponse | null;
}

export interface InventoryData {
    storage: StorageResponse | null;
    backpack: BackpackResponse | null;
}

export interface GameData {
    user: UserData | null;
    garden: GardenResponse;
    seeds: SeedInventoryItem[];
    fertilizers: FertilizerInventoryResponse | null;
    fruits: FruitInventoryItem[];
    currencies: CurrencyBalances;
    missions: Mission[] | null;
    quizzes: Quiz[] | null;
    events: GameEvent[] | null;
    streak: StreakData;
    shop: ShopData;
    inventory: InventoryData;
    badges: SoulboundToken[];
    loadedAt: number;
}

// Singleton storage for pre-loaded data
let cachedGameData: GameData | null = null;

export class GameDataService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    /**
     * Batch fetch all game data in parallel
     * Call this during loading screen before entering the game
     *
     * Loading strategy:
     * 1. Check localStorage cache first
     * 2. If valid cache exists → return immediately (instant load!)
     * 3. If cache is stale but exists → return cached, trigger background refresh
     * 4. If no cache → fetch from API (normal load)
     *
     * @param onProgress Optional callback for progress updates (0-100)
     * @param forceRefresh Skip cache and always fetch from API
     * @returns Promise<GameData> with all pre-loaded data
     */
    static async fetchAllGameData(
        onProgress?: (progress: number) => void,
        forceRefresh: boolean = false
    ): Promise<GameData> {
        const token = UserService.getAccessToken();

        if (!token) {
            console.log('No access token, returning empty game data');
            const emptyData: GameData = {
                user: null,
                garden: [],
                seeds: [],
                fertilizers: null,
                fruits: [],
                currencies: { gold: 0, gem: 0 },
                missions: null,
                quizzes: null,
                events: null,
                streak: { status: null, history: null },
                shop: { goldShop: null, gemShop: null, cashShop: null },
                inventory: { storage: null, backpack: null },
                badges: [],
                loadedAt: Date.now()
            };
            cachedGameData = emptyData;
            return emptyData;
        }

        // Check localStorage cache first (unless force refresh)
        if (!forceRefresh) {
            const localCache = GameCache.get<GameData>(CACHE_KEYS.GAME_DATA);
            if (localCache) {
                const cacheAge = GameCache.getAge(CACHE_KEYS.GAME_DATA);
                console.log(`[GameDataService] Found localStorage cache (age: ${GameCache.formatAge(cacheAge)})`);

                // Update in-memory cache
                cachedGameData = localCache;
                onProgress?.(100);

                // If cache is stale, trigger background refresh
                if (GameCache.isStale(CACHE_KEYS.GAME_DATA, CACHE_TTL.GAME_DATA)) {
                    console.log('[GameDataService] Cache is stale, refreshing in background...');
                    this.fetchAndCacheInBackground();
                }

                return localCache;
            }
            console.log('[GameDataService] No valid cache found, fetching from API...');
        } else {
            console.log('[GameDataService] Force refresh requested, fetching from API...');
        }

        onProgress?.(10);

        // Fetch all data in parallel using Promise.allSettled
        // This ensures all requests complete even if some fail
        const [
            userResult,
            gardenResult,
            seedsResult,
            fertilizersResult,
            fruitsResult,
            currenciesResult,
            missionsResult,
            quizzesResult,
            eventsResult,
            streakStatusResult,
            streakHistoryResult,
            goldShopResult,
            gemShopResult,
            cashShopResult,
            storageResult,
            backpackResult,
            badgesResult
        ] = await Promise.allSettled([
            UserService.getUserProfile(),
            GardenService.getGarden(),
            SeedService.getSeedInventory(),
            FertilizerService.getFertilizerInventory(),
            FruitService.getFruitInventory(),
            FruitService.getCurrencyBalances(),
            MissionService.getMissions(),
            QuizService.getActiveQuizzes(),
            EventService.getActiveEvents(),
            StreakService.getStatus(),
            StreakService.getHistory(7),
            ShopService.getGoldShop(),
            ShopService.getGemShop(),
            ShopService.getCashShop(),
            InventoryService.getStorage(),
            InventoryService.getBackpack(),
            BadgeService.fetchSoulboundTokens()
        ]);

        onProgress?.(80);

        // Extract results with fallbacks
        // Get stored user data (from login) which contains wallet addresses
        const storedUser = UserService.getStoredUser();
        const profileUser = userResult.status === 'fulfilled' ? userResult.value : null;
        
        // Merge user data: profile data + wallet addresses from login + characterType
        let mergedUser: UserData | null = null;
        if (profileUser) {
            // For characterType: prefer storedUser (from register/login) over profile API
            // because profile API may return default value (1) even if user selected different character
            // Only use profileUser.characterType if storedUser doesn't have one
            const characterType = storedUser?.characterType || profileUser.characterType || 1;
            
            mergedUser = {
                ...profileUser,
                // Preserve wallet addresses from stored user (login response)
                walletAddressSui: profileUser.walletAddressSui || storedUser?.walletAddressSui,
                walletAddressAptos: profileUser.walletAddressAptos || storedUser?.walletAddressAptos,
                walletAddressCardano: profileUser.walletAddressCardano || storedUser?.walletAddressCardano,
                // Use the determined characterType
                characterType,
            };
            
            console.log('[GameDataService] Merged user characterType:', characterType, 
                '(stored:', storedUser?.characterType, ', profile:', profileUser.characterType, ')');
        } else if (storedUser) {
            mergedUser = storedUser;
        }

        const gameData: GameData = {
            user: mergedUser,
            garden: gardenResult.status === 'fulfilled' ? gardenResult.value : [],
            seeds: seedsResult.status === 'fulfilled' ? seedsResult.value : [],
            fertilizers: fertilizersResult.status === 'fulfilled' ? fertilizersResult.value : null,
            fruits: fruitsResult.status === 'fulfilled' ? fruitsResult.value : [],
            currencies: currenciesResult.status === 'fulfilled'
                ? currenciesResult.value
                : { gold: 0, gem: 0 },
            missions: missionsResult.status === 'fulfilled' ? missionsResult.value : null,
            quizzes: quizzesResult.status === 'fulfilled' ? quizzesResult.value : null,
            events: eventsResult.status === 'fulfilled' ? eventsResult.value : null,
            streak: {
                status: streakStatusResult.status === 'fulfilled' ? streakStatusResult.value : null,
                history: streakHistoryResult.status === 'fulfilled' ? streakHistoryResult.value : null
            },
            shop: {
                goldShop: goldShopResult.status === 'fulfilled' ? goldShopResult.value : null,
                gemShop: gemShopResult.status === 'fulfilled' ? gemShopResult.value : null,
                cashShop: cashShopResult.status === 'fulfilled' ? cashShopResult.value : null
            },
            inventory: {
                storage: storageResult.status === 'fulfilled' ? storageResult.value : null,
                backpack: backpackResult.status === 'fulfilled' ? backpackResult.value : null
            },
            badges: badgesResult.status === 'fulfilled' ? badgesResult.value : [],
            loadedAt: Date.now()
        };

        // Log any failures for debugging
        if (userResult.status === 'rejected') {
            console.error('Failed to fetch user profile:', userResult.reason);
        }
        if (gardenResult.status === 'rejected') {
            console.error('Failed to fetch garden:', gardenResult.reason);
        }
        if (seedsResult.status === 'rejected') {
            console.error('Failed to fetch seeds:', seedsResult.reason);
        }
        if (fertilizersResult.status === 'rejected') {
            console.error('Failed to fetch fertilizers:', fertilizersResult.reason);
        }
        if (fruitsResult.status === 'rejected') {
            console.error('Failed to fetch fruits:', fruitsResult.reason);
        }
        if (currenciesResult.status === 'rejected') {
            console.error('Failed to fetch currencies:', currenciesResult.reason);
        }
        if (missionsResult.status === 'rejected') {
            console.error('Failed to fetch missions:', missionsResult.reason);
        }
        if (quizzesResult.status === 'rejected') {
            console.error('Failed to fetch quizzes:', quizzesResult.reason);
        }
        if (eventsResult.status === 'rejected') {
            console.error('Failed to fetch events:', eventsResult.reason);
        }
        if (streakStatusResult.status === 'rejected') {
            console.error('Failed to fetch streak status:', streakStatusResult.reason);
        }
        if (streakHistoryResult.status === 'rejected') {
            console.error('Failed to fetch streak history:', streakHistoryResult.reason);
        }
        if (goldShopResult.status === 'rejected') {
            console.error('Failed to fetch gold shop:', goldShopResult.reason);
        }
        if (gemShopResult.status === 'rejected') {
            console.error('Failed to fetch gem shop:', gemShopResult.reason);
        }
        if (cashShopResult.status === 'rejected') {
            console.error('Failed to fetch cash shop:', cashShopResult.reason);
        }
        if (storageResult.status === 'rejected') {
            console.error('Failed to fetch storage:', storageResult.reason);
        }
        if (backpackResult.status === 'rejected') {
            console.error('Failed to fetch backpack:', backpackResult.reason);
        }

        onProgress?.(100);

        // Cache the data in memory
        cachedGameData = gameData;

        // Save to localStorage for next visit
        this.saveToLocalStorage(gameData);

        console.log('All game data loaded:', {
            user: gameData.user?.username,
            gardenPlots: gameData.garden.length,
            seedTypes: gameData.seeds.length,
            fertilizerTypes: gameData.fertilizers?.fertilizers?.length ?? 0,
            fruitSlots: gameData.fruits.length,
            gold: gameData.currencies.gold,
            gem: gameData.currencies.gem,
            missions: gameData.missions?.length ?? 0,
            quizzes: gameData.quizzes?.length ?? 0,
            events: gameData.events?.length ?? 0,
            streakStatus: gameData.streak.status ? 'loaded' : 'null',
            streakHistory: gameData.streak.history?.checkins?.length ?? 0,
            goldShopItems: gameData.shop.goldShop?.items?.length ?? 0,
            gemShopItems: gameData.shop.gemShop?.items?.length ?? 0,
            cashShopItems: gameData.shop.cashShop?.items?.length ?? 0,
            storageItems: gameData.inventory.storage?.storage?.length ?? 0,
            backpackItems: gameData.inventory.backpack?.backpack?.length ?? 0
        });

        return gameData;
    }

    /**
     * Get cached game data
     * Returns null if data hasn't been fetched yet
     */
    static getCachedData(): GameData | null {
        return cachedGameData;
    }

    /**
     * Check if cached data is still fresh (within maxAge milliseconds)
     * @param maxAge Maximum age in milliseconds (default: 5 minutes)
     */
    static isCacheValid(maxAge: number = 5 * 60 * 1000): boolean {
        if (!cachedGameData) return false;
        return Date.now() - cachedGameData.loadedAt < maxAge;
    }

    /**
     * Clear cached data (call when logging out or switching accounts)
     * Clears both in-memory and localStorage cache
     */
    static clearCache(): void {
        cachedGameData = null;
        GameCache.remove(CACHE_KEYS.GAME_DATA);
        console.log('[GameDataService] Cleared all caches');
    }

    // ============================================
    // localStorage caching methods
    // ============================================

    /**
     * Save game data to localStorage
     */
    private static saveToLocalStorage(data: GameData): void {
        const saved = GameCache.set(CACHE_KEYS.GAME_DATA, data, CACHE_TTL.GAME_DATA);
        if (saved) {
            console.log('[GameDataService] Saved to localStorage');
        }
    }

    /**
     * Public method to persist current cached data to localStorage
     * Call this after updating cachedData directly (e.g., from WebSocket updates)
     */
    public static persistCache(): void {
        if (cachedGameData) {
            this.saveToLocalStorage(cachedGameData);
        }
    }

    /**
     * Fetch and cache data in background (non-blocking)
     * Used for stale-while-revalidate pattern
     */
    private static async fetchAndCacheInBackground(): Promise<void> {
        try {
            // Fetch fresh data without progress callback
            const freshData = await this.fetchFromAPI();

            // Update caches
            cachedGameData = freshData;
            this.saveToLocalStorage(freshData);

            console.log('[GameDataService] Background refresh completed');

            // Trigger UI update if callback is registered
            this.triggerUIUpdate();
        } catch (error) {
            console.error('[GameDataService] Background refresh failed:', error);
            // Keep using stale cache - don't clear it
        }
    }

    /**
     * Internal method to fetch data from API without cache logic
     */
    private static async fetchFromAPI(): Promise<GameData> {
        // Fetch all data in parallel using Promise.allSettled
        const [
            userResult,
            gardenResult,
            seedsResult,
            fertilizersResult,
            fruitsResult,
            currenciesResult,
            missionsResult,
            quizzesResult,
            eventsResult,
            streakStatusResult,
            streakHistoryResult,
            goldShopResult,
            gemShopResult,
            cashShopResult,
            storageResult,
            backpackResult,
            badgesResult
        ] = await Promise.allSettled([
            UserService.getUserProfile(),
            GardenService.getGarden(),
            SeedService.getSeedInventory(),
            FertilizerService.getFertilizerInventory(),
            FruitService.getFruitInventory(),
            FruitService.getCurrencyBalances(),
            MissionService.getMissions(),
            QuizService.getActiveQuizzes(),
            EventService.getActiveEvents(),
            StreakService.getStatus(),
            StreakService.getHistory(7),
            ShopService.getGoldShop(),
            ShopService.getGemShop(),
            ShopService.getCashShop(),
            InventoryService.getStorage(),
            InventoryService.getBackpack(),
            BadgeService.fetchSoulboundTokens()
        ]);

        // Extract results with fallbacks
        const storedUser = UserService.getStoredUser();
        const profileUser = userResult.status === 'fulfilled' ? userResult.value : null;

        let mergedUser: UserData | null = null;
        if (profileUser) {
            const characterType = storedUser?.characterType || profileUser.characterType || 1;
            mergedUser = {
                ...profileUser,
                walletAddressSui: profileUser.walletAddressSui || storedUser?.walletAddressSui,
                walletAddressAptos: profileUser.walletAddressAptos || storedUser?.walletAddressAptos,
                walletAddressCardano: profileUser.walletAddressCardano || storedUser?.walletAddressCardano,
                characterType,
            };
        } else if (storedUser) {
            mergedUser = storedUser;
        }

        return {
            user: mergedUser,
            garden: gardenResult.status === 'fulfilled' ? gardenResult.value : [],
            seeds: seedsResult.status === 'fulfilled' ? seedsResult.value : [],
            fertilizers: fertilizersResult.status === 'fulfilled' ? fertilizersResult.value : null,
            fruits: fruitsResult.status === 'fulfilled' ? fruitsResult.value : [],
            currencies: currenciesResult.status === 'fulfilled'
                ? currenciesResult.value
                : { gold: 0, gem: 0 },
            missions: missionsResult.status === 'fulfilled' ? missionsResult.value : null,
            quizzes: quizzesResult.status === 'fulfilled' ? quizzesResult.value : null,
            events: eventsResult.status === 'fulfilled' ? eventsResult.value : null,
            streak: {
                status: streakStatusResult.status === 'fulfilled' ? streakStatusResult.value : null,
                history: streakHistoryResult.status === 'fulfilled' ? streakHistoryResult.value : null
            },
            shop: {
                goldShop: goldShopResult.status === 'fulfilled' ? goldShopResult.value : null,
                gemShop: gemShopResult.status === 'fulfilled' ? gemShopResult.value : null,
                cashShop: cashShopResult.status === 'fulfilled' ? cashShopResult.value : null
            },
            inventory: {
                storage: storageResult.status === 'fulfilled' ? storageResult.value : null,
                backpack: backpackResult.status === 'fulfilled' ? backpackResult.value : null
            },
            badges: badgesResult.status === 'fulfilled' ? badgesResult.value : [],
            loadedAt: Date.now()
        };
    }

    /**
     * Get cache statistics for debugging
     */
    static getCacheStats(): {
        inMemory: boolean;
        localStorage: boolean;
        age: string;
        isStale: boolean;
        size: string;
    } {
        const stats = GameCache.getStats();
        const gameDataEntry = stats.entries.find(e => e.key === CACHE_KEYS.GAME_DATA);

        return {
            inMemory: cachedGameData !== null,
            localStorage: GameCache.has(CACHE_KEYS.GAME_DATA),
            age: GameCache.formatAge(gameDataEntry?.age ?? null),
            isStale: GameCache.isStale(CACHE_KEYS.GAME_DATA, CACHE_TTL.GAME_DATA),
            size: GameCache.formatSize(gameDataEntry?.size ?? 0)
        };
    }

    /**
     * Refresh specific parts of the cache
     * Useful when you know only certain data has changed
     */
    static async refreshUserProfile(): Promise<UserData | null> {
        console.log('[GameDataService] refreshUserProfile called');
        const user = await UserService.getUserProfile();
        console.log('[GameDataService] refreshUserProfile result - XP:', user?.xp, 'Rep:', user?.reputationScore);
        if (cachedGameData) {
            cachedGameData.user = user;
        }
        return user;
    }

    static async refreshGarden(): Promise<GardenResponse> {
        const garden = await GardenService.getGarden();
        if (cachedGameData) {
            cachedGameData.garden = garden;
        }
        return garden;
    }

    static async refreshSeeds(): Promise<SeedInventoryItem[]> {
        const seeds = await SeedService.getSeedInventory();
        if (cachedGameData) {
            cachedGameData.seeds = seeds;
        }
        return seeds;
    }

    static async refreshFertilizers(): Promise<FertilizerInventoryResponse | null> {
        const fertilizers = await FertilizerService.getFertilizerInventory();
        if (cachedGameData) {
            cachedGameData.fertilizers = fertilizers;
        }
        return fertilizers;
    }

    static async refreshFruits(): Promise<FruitInventoryItem[]> {
        const fruits = await FruitService.getFruitInventory();
        if (cachedGameData) {
            cachedGameData.fruits = fruits;
        }
        return fruits;
    }

    static async refreshCurrencies(): Promise<CurrencyBalances> {
        const currencies = await FruitService.getCurrencyBalances();
        if (cachedGameData) {
            cachedGameData.currencies = currencies;
        }
        return currencies;
    }

    static async refreshMissions(): Promise<Mission[] | null> {
        const missions = await MissionService.getMissions();
        if (cachedGameData) {
            cachedGameData.missions = missions;
        }
        return missions;
    }

    static async refreshQuizzes(): Promise<Quiz[] | null> {
        const quizzes = await QuizService.getActiveQuizzes();
        if (cachedGameData) {
            cachedGameData.quizzes = quizzes;
        }
        return quizzes;
    }

    static async refreshEvents(): Promise<GameEvent[] | null> {
        const events = await EventService.getActiveEvents();
        if (cachedGameData) {
            cachedGameData.events = events;
        }
        return events;
    }

    static async refreshGoldShop(): Promise<GoldShopResponse | null> {
        const goldShop = await ShopService.getGoldShop();
        if (cachedGameData) {
            cachedGameData.shop.goldShop = goldShop;
        }
        return goldShop;
    }

    static async refreshGemShop(): Promise<GemShopResponse | null> {
        const gemShop = await ShopService.getGemShop();
        if (cachedGameData) {
            cachedGameData.shop.gemShop = gemShop;
        }
        return gemShop;
    }

    static async refreshCashShop(): Promise<CashShopResponse | null> {
        const cashShop = await ShopService.getCashShop();
        if (cachedGameData) {
            cachedGameData.shop.cashShop = cashShop;
        }
        return cashShop;
    }

    static async refreshAllShops(): Promise<ShopData> {
        const [goldShop, gemShop, cashShop] = await Promise.all([
            ShopService.getGoldShop(),
            ShopService.getGemShop(),
            ShopService.getCashShop()
        ]);
        const shopData: ShopData = { goldShop, gemShop, cashShop };
        if (cachedGameData) {
            cachedGameData.shop = shopData;
        }
        return shopData;
    }

    static async refreshStreak(): Promise<StreakData> {
        const [status, history] = await Promise.all([
            StreakService.getStatus(),
            StreakService.getHistory(7)
        ]);
        const streakData: StreakData = { status, history };
        if (cachedGameData) {
            cachedGameData.streak = streakData;
        }
        return streakData;
    }

    static async refreshStorage(): Promise<StorageResponse | null> {
        const storage = await InventoryService.getStorage();
        if (cachedGameData) {
            cachedGameData.inventory.storage = storage;
        }
        return storage;
    }

    static async refreshBackpack(): Promise<BackpackResponse | null> {
        const backpack = await InventoryService.getBackpack();
        if (cachedGameData) {
            cachedGameData.inventory.backpack = backpack;
        }
        return backpack;
    }

    static async refreshWarehouseInventory(): Promise<InventoryData> {
        const [storage, backpack] = await Promise.all([
            InventoryService.getStorage(),
            InventoryService.getBackpack()
        ]);
        const inventoryData: InventoryData = { storage, backpack };
        if (cachedGameData) {
            cachedGameData.inventory = inventoryData;
        }
        return inventoryData;
    }

    // ============================================
    // Optimistic cache updates (instant UI feedback)
    // ============================================

    /**
     * Optimistically remove item from backpack cache (before API call)
     * Used for instant UI updates when moving items to warehouse
     */
    static removeFromBackpackCache(itemType: string, amount: number): void {
        if (!cachedGameData?.inventory?.backpack?.backpack) return;

        const backpack = cachedGameData.inventory.backpack.backpack;
        const itemIndex = backpack.findIndex(item => item.itemType === itemType);

        if (itemIndex >= 0) {
            const item = backpack[itemIndex];
            if (item.amount <= amount) {
                // Remove item entirely
                backpack.splice(itemIndex, 1);
            } else {
                // Decrease amount
                item.amount -= amount;
            }
            // Update capacity
            if (cachedGameData.inventory.backpack.capacity) {
                cachedGameData.inventory.backpack.capacity.used -= amount;
                cachedGameData.inventory.backpack.capacity.available += amount;
            }
        }
    }

    /**
     * Optimistically remove item from storage cache (before API call)
     * Used for instant UI updates when moving items to backpack
     */
    static removeFromStorageCache(itemType: string, amount: number): void {
        if (!cachedGameData?.inventory?.storage?.storage) return;

        const storage = cachedGameData.inventory.storage.storage;
        const itemIndex = storage.findIndex(item => item.itemType === itemType);

        if (itemIndex >= 0) {
            const item = storage[itemIndex];
            if (item.amount <= amount) {
                // Remove item entirely
                storage.splice(itemIndex, 1);
            } else {
                // Decrease amount
                item.amount -= amount;
            }
            // Update summary
            if (cachedGameData.inventory.storage.summary) {
                cachedGameData.inventory.storage.summary.totalItems -= amount;
                if (storage[itemIndex]?.amount === 0 || !storage.find(i => i.itemType === itemType)) {
                    cachedGameData.inventory.storage.summary.totalTypes -= 1;
                }
            }
        }
    }

    /**
     * Optimistically add item to backpack cache (before API call)
     * Used for instant UI updates when moving items from warehouse to chest
     */
    static addToBackpackCache(itemType: string, amount: number): void {
        if (!cachedGameData?.inventory?.backpack) return;

        // Initialize backpack array if needed
        if (!cachedGameData.inventory.backpack.backpack) {
            cachedGameData.inventory.backpack.backpack = [];
        }

        const backpack = cachedGameData.inventory.backpack.backpack;
        const existingItem = backpack.find(item => item.itemType === itemType);

        if (existingItem) {
            // Increase existing item amount
            existingItem.amount += amount;
        } else {
            // Add new item to backpack
            backpack.push({
                id: `temp-${Date.now()}`,
                itemType: itemType,
                amount: amount,
                location: 'BACKPACK',
                name: itemType,
                rarity: 'common',
                category: 'item',
                icon: ''
            });
        }

        // Update capacity
        if (cachedGameData.inventory.backpack.capacity) {
            cachedGameData.inventory.backpack.capacity.used += amount;
            cachedGameData.inventory.backpack.capacity.available -= amount;
        }
    }

    /**
     * Optimistically add item to storage cache (before API call)
     * Used for instant UI updates when moving items from chest to warehouse
     */
    static addToStorageCache(itemType: string, amount: number): void {
        if (!cachedGameData?.inventory?.storage) return;

        // Initialize storage array if needed
        if (!cachedGameData.inventory.storage.storage) {
            cachedGameData.inventory.storage.storage = [];
        }

        const storage = cachedGameData.inventory.storage.storage;
        const existingItem = storage.find(item => item.itemType === itemType);

        if (existingItem) {
            // Increase existing item amount
            existingItem.amount += amount;
        } else {
            // Add new item to storage
            storage.push({
                id: `temp-${Date.now()}`,
                itemType: itemType,
                amount: amount,
                location: 'STORAGE',
                name: itemType,
                rarity: 'common',
                category: 'item',
                icon: ''
            });
            // Update types count
            if (cachedGameData.inventory.storage.summary) {
                cachedGameData.inventory.storage.summary.totalTypes += 1;
            }
        }

        // Update summary
        if (cachedGameData.inventory.storage.summary) {
            cachedGameData.inventory.storage.summary.totalItems += amount;
        }
    }

    // ============================================
    // Convenience methods for common refresh patterns
    // ============================================

    /**
     * Refresh inventory data (seeds, fertilizers, fruits)
     * Use after: planting, using fertilizer, harvesting
     */
    static async refreshInventory(): Promise<void> {
        await Promise.all([
            this.refreshSeeds(),
            this.refreshFertilizers(),
            this.refreshFruits()
        ]);
    }

    /**
     * Refresh profile and currencies
     * Use after: check-in, shop purchase, rewards
     */
    static async refreshProfileAndCurrencies(): Promise<void> {
        await Promise.all([
            this.refreshUserProfile(),
            this.refreshCurrencies()
        ]);
    }

    /**
     * Refresh all data commonly changed after an action
     * Use after: check-in, shop purchase, factory exchange
     */
    static async refreshAfterAction(): Promise<void> {
        await Promise.all([
            this.refreshUserProfile(),
            this.refreshCurrencies(),
            this.refreshSeeds(),
            this.refreshFertilizers(),
            this.refreshFruits()
        ]);
        // Update localStorage cache with refreshed data
        if (cachedGameData) {
            this.saveToLocalStorage(cachedGameData);
        }
    }

    /**
     * Refresh garden data
     * Use after: planting, watering, harvesting, fertilizing
     */
    static async refreshAfterGardenAction(): Promise<void> {
        await Promise.all([
            this.refreshGarden(),
            this.refreshSeeds(),
            this.refreshFertilizers(),
            this.refreshFruits(),
            this.refreshStorage()
        ]);
        // Update localStorage cache with refreshed data
        if (cachedGameData) {
            this.saveToLocalStorage(cachedGameData);
        }
        this.triggerUIUpdate();
    }

    // ============================================
    // Event-based UI update system
    // ============================================

    private static uiUpdateCallback: (() => void) | null = null;

    /**
     * Register a callback to be called after any refresh
     * FarmingGame should call this to auto-update UI
     */
    static setUIUpdateCallback(callback: () => void): void {
        this.uiUpdateCallback = callback;
    }

    /**
     * Clear the UI update callback
     */
    static clearUIUpdateCallback(): void {
        this.uiUpdateCallback = null;
    }

    /**
     * Trigger UI update callback if registered
     */
    private static triggerUIUpdate(): void {
        console.log('[GameDataService] triggerUIUpdate called, callback registered:', !!this.uiUpdateCallback);
        if (this.uiUpdateCallback) {
            console.log('[GameDataService] Calling UI update callback...');
            this.uiUpdateCallback();
            console.log('[GameDataService] UI update callback completed');
        }
        // Always emit EventBus event for any listeners (backup mechanism)
        console.log('[GameDataService] Emitting gamedata:updated event');
        EventBus.emit('gamedata:updated');
    }

    /**
     * Refresh after action and trigger UI update
     * This is the main method managers should call
     */
    static async refreshAndUpdateUI(): Promise<void> {
        await this.refreshAfterAction();
        this.triggerUIUpdate();
    }

    /**
     * Refresh profile/currencies and trigger UI update
     */
    static async refreshProfileAndUpdateUI(): Promise<void> {
        await this.refreshProfileAndCurrencies();
        this.triggerUIUpdate();
    }

    /**
     * Refresh inventory and trigger UI update
     */
    static async refreshInventoryAndUpdateUI(): Promise<void> {
        await this.refreshInventory();
        this.triggerUIUpdate();
    }

    // ============================================
    // WebSocket-based cache updates
    // ============================================

    /**
     * Update storage cache from WebSocket inventory_update payload
     * Called when receiving inventory_update event from server
     * @param items Array of inventory items from WebSocket
     */
    static updateStorageCacheFromSocket(items: Array<{ itemType: string; amount: number; location?: string }>): void {
        if (!cachedGameData?.inventory?.storage) {
            // Initialize storage if not exists
            if (cachedGameData) {
                cachedGameData.inventory = cachedGameData.inventory || { storage: null, backpack: null };
                cachedGameData.inventory.storage = {
                    userId: '',
                    storage: [],
                    summary: { totalItems: 0, totalTypes: 0, categories: 0 }
                };
            }
        }

        if (!cachedGameData?.inventory?.storage?.storage) return;

        const storage = cachedGameData.inventory.storage.storage;

        // Update each item in the cache
        items.forEach(item => {
            // Only update STORAGE items (or items without location specified)
            if (item.location && item.location !== 'STORAGE') return;

            const existingIndex = storage.findIndex(s => s.itemType === item.itemType);

            if (item.amount <= 0) {
                // Remove item if amount is 0 or negative
                if (existingIndex >= 0) {
                    storage.splice(existingIndex, 1);
                }
            } else if (existingIndex >= 0) {
                // Update existing item
                storage[existingIndex].amount = item.amount;
            } else {
                // Add new item
                storage.push({
                    id: `ws-${Date.now()}-${item.itemType}`,
                    itemType: item.itemType,
                    amount: item.amount,
                    location: 'STORAGE',
                    name: item.itemType,
                    rarity: 'common',
                    category: 'item',
                    icon: ''
                });
            }
        });

        // Update summary
        if (cachedGameData.inventory.storage.summary) {
            cachedGameData.inventory.storage.summary.totalItems = storage.reduce((sum, item) => sum + item.amount, 0);
            cachedGameData.inventory.storage.summary.totalTypes = storage.length;
        }

        console.log('[GameDataService] Storage cache updated from WebSocket:', storage.length, 'items');
    }

    /**
     * Update backpack cache from WebSocket inventory_update payload
     * Called when receiving inventory_update event from server
     * @param items Array of inventory items from WebSocket
     */
    static updateBackpackCacheFromSocket(items: Array<{ itemType: string; amount: number; location?: string }>): void {
        if (!cachedGameData?.inventory?.backpack) {
            // Initialize backpack if not exists
            if (cachedGameData) {
                cachedGameData.inventory = cachedGameData.inventory || { storage: null, backpack: null };
                cachedGameData.inventory.backpack = {
                    userId: '',
                    backpack: [],
                    capacity: { total: 100, used: 0, max: 100, available: 100 }
                };
            }
        }

        if (!cachedGameData?.inventory?.backpack?.backpack) return;

        const backpack = cachedGameData.inventory.backpack.backpack;

        // Update each item in the cache
        items.forEach(item => {
            // Only update BACKPACK items (or items without location specified)
            if (item.location && item.location !== 'BACKPACK') return;

            const existingIndex = backpack.findIndex(b => b.itemType === item.itemType);

            if (item.amount <= 0) {
                // Remove item if amount is 0 or negative
                if (existingIndex >= 0) {
                    backpack.splice(existingIndex, 1);
                }
            } else if (existingIndex >= 0) {
                // Update existing item
                backpack[existingIndex].amount = item.amount;
            } else {
                // Add new item
                backpack.push({
                    id: `ws-${Date.now()}-${item.itemType}`,
                    itemType: item.itemType,
                    amount: item.amount,
                    location: 'BACKPACK',
                    name: item.itemType,
                    rarity: 'common',
                    category: 'item',
                    icon: ''
                });
            }
        });

        // Update capacity
        if (cachedGameData.inventory.backpack.capacity) {
            const totalUsed = backpack.reduce((sum, item) => sum + item.amount, 0);
            const maxCapacity = cachedGameData.inventory.backpack.capacity.max ?? cachedGameData.inventory.backpack.capacity.total;
            cachedGameData.inventory.backpack.capacity.used = totalUsed;
            cachedGameData.inventory.backpack.capacity.available = maxCapacity - totalUsed;
        }

        console.log('[GameDataService] Backpack cache updated from WebSocket:', backpack.length, 'items');
    }
}
