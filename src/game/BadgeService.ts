// src/game/BadgeService.ts

import { UserService } from './UserService';

// Badge definition (for predefined badges)
export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string; // emoji or image key
    color: string;
    requirement: string; // Description of how to unlock
    isClaimable: boolean; // Can be claimed with code/QR
}

// User's badge status (legacy format for local storage)
export interface UserBadge {
    badgeId: string;
    claimed: boolean;
    claimedAt?: string;
    code?: string; // Code used to claim (if applicable)
}

// Soulbound Token from API
export interface SoulboundToken {
    id: string;
    userId: string;
    name: string;
    metadata: {
        rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
        category: string;
        description: string;
        badgeType?: string;
        inputCode?: string;
    };
    issuedAt: string;
}

// API Response for fetching tokens
export interface SoulboundTokensResponse {
    tokens: SoulboundToken[];
    total: number;
    byCategory: Record<string, SoulboundToken[]>;
}

// Rarity colors
const RARITY_COLORS: Record<string, string> = {
    'COMMON': '#9CA3AF',
    'UNCOMMON': '#22C55E',
    'RARE': '#3B82F6',
    'EPIC': '#A855F7',
    'LEGENDARY': '#F59E0B'
};

// Rarity icons
const RARITY_ICONS: Record<string, string> = {
    'COMMON': '⚪',
    'UNCOMMON': '🟢',
    'RARE': '🔵',
    'EPIC': '🟣',
    'LEGENDARY': '🟡'
};

// Available badges in the game (predefined, for unlock section)
export const AVAILABLE_BADGES: Badge[] = [
    {
        id: 'early_adopter',
        name: 'Early Adopter',
        description: 'One of the first players to join',
        icon: '🌟',
        color: '#FFD700',
        requirement: 'Register during beta period',
        isClaimable: true
    },
    {
        id: 'event_participant',
        name: 'Event Participant',
        description: 'Attended an official event',
        icon: '🎪',
        color: '#FF6B6B',
        requirement: 'Scan QR at event booth',
        isClaimable: true
    },
    {
        id: 'community_member',
        name: 'Community Member',
        description: 'Joined the community',
        icon: '👥',
        color: '#4ECDC4',
        requirement: 'Join Discord/Telegram',
        isClaimable: true
    },
    {
        id: 'beta_tester',
        name: 'Beta Tester',
        description: 'Helped test the game',
        icon: '🧪',
        color: '#9B59B6',
        requirement: 'Participate in beta testing',
        isClaimable: true
    },
    {
        id: 'ambassador',
        name: 'Ambassador',
        description: 'Official game ambassador',
        icon: '🏅',
        color: '#E74C3C',
        requirement: 'Apply for ambassador program',
        isClaimable: true
    },
    {
        id: 'first_harvest',
        name: 'First Harvest',
        description: 'Harvested your first crop',
        icon: '🌾',
        color: '#4ade80',
        requirement: 'Complete first harvest',
        isClaimable: false
    },
    {
        id: 'master_farmer',
        name: 'Master Farmer',
        description: 'Reached farming mastery',
        icon: '👨‍🌾',
        color: '#8B4513',
        requirement: 'Harvest 100 crops',
        isClaimable: false
    },
    {
        id: 'social_butterfly',
        name: 'Social Butterfly',
        description: 'Made many friends',
        icon: '🦋',
        color: '#FF69B4',
        requirement: 'Add 10 friends',
        isClaimable: false
    }
];

const STORAGE_KEY_BADGES = 'fam_game_user_badges';
const STORAGE_KEY_TOKENS = 'fam_game_soulbound_tokens';

export class BadgeService {
    private static API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    // Cached tokens from API
    private static cachedTokens: SoulboundToken[] = [];

    /**
     * Get user's badges from local storage (cached) - legacy format
     */
    static getStoredBadges(): UserBadge[] {
        if (typeof window === 'undefined') return [];
        const data = localStorage.getItem(STORAGE_KEY_BADGES);
        if (data) {
            try {
                return JSON.parse(data);
            } catch {
                return [];
            }
        }
        return [];
    }

    /**
     * Save badges to local storage
     */
    private static saveBadges(badges: UserBadge[]): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE_KEY_BADGES, JSON.stringify(badges));
    }

    /**
     * Get cached soulbound tokens
     */
    static getCachedTokens(): SoulboundToken[] {
        if (this.cachedTokens.length > 0) return this.cachedTokens;
        
        // Try to load from localStorage
        if (typeof window === 'undefined') return [];
        const data = localStorage.getItem(STORAGE_KEY_TOKENS);
        if (data) {
            try {
                this.cachedTokens = JSON.parse(data);
                return this.cachedTokens;
            } catch {
                return [];
            }
        }
        return [];
    }

    /**
     * Save tokens to local storage
     */
    private static saveTokens(tokens: SoulboundToken[]): void {
        this.cachedTokens = tokens;
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(tokens));
    }

    /**
     * Fetch user's soulbound tokens from API
     * GET /soulbound-tokens
     */
    static async fetchSoulboundTokens(): Promise<SoulboundToken[]> {
        const token = UserService.getAccessToken();
        if (!token) return this.getCachedTokens();

        try {
            const response = await fetch(`${BadgeService.API_BASE_URL}/soulbound-tokens`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data: SoulboundTokensResponse = await response.json();
                const tokens = data.tokens || [];
                
                // Save to cache and localStorage
                this.saveTokens(tokens);
                
                // Also update legacy UserBadge format for backward compatibility
                const userBadges: UserBadge[] = tokens.map(t => ({
                    badgeId: t.metadata?.badgeType?.toLowerCase() || t.id,
                    claimed: true,
                    claimedAt: t.issuedAt
                }));
                this.saveBadges(userBadges);
                
                console.log(`[BadgeService] Fetched ${tokens.length} soulbound tokens`);
                return tokens;
            } else {
                console.error('Error fetching soulbound tokens:', response.statusText);
            }
        } catch (error) {
            console.error('Network error fetching soulbound tokens:', error);
        }

        return this.getCachedTokens();
    }

    /**
     * Fetch user's badges from API (legacy - redirects to fetchSoulboundTokens)
     */
    static async fetchUserBadges(): Promise<UserBadge[]> {
        await this.fetchSoulboundTokens();
        return this.getStoredBadges();
    }

    /**
     * Claim a badge using a code
     * Calls POST /soulbound-tokens/claim
     */
    static async claimBadgeWithCode(badgeId: string, code: string): Promise<{ success: boolean; message: string; badgeName?: string }> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, message: 'Not authenticated' };
        }

        try {
            const response = await fetch(`${BadgeService.API_BASE_URL}/soulbound-tokens/claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Extract badge info from response
                const tokenData = data.token as SoulboundToken;
                const claimedBadgeId = tokenData?.metadata?.badgeType?.toLowerCase() || badgeId;
                const badgeName = tokenData?.name || 'Badge';

                // Update cached tokens
                if (tokenData) {
                    const tokens = this.getCachedTokens();
                    tokens.push(tokenData);
                    this.saveTokens(tokens);
                }

                // Update legacy local storage
                const badges = this.getStoredBadges();
                const existingIndex = badges.findIndex(b => b.badgeId === claimedBadgeId);
                const newBadge: UserBadge = {
                    badgeId: claimedBadgeId,
                    claimed: true,
                    claimedAt: tokenData?.issuedAt || new Date().toISOString(),
                    code
                };

                if (existingIndex >= 0) {
                    badges[existingIndex] = newBadge;
                } else {
                    badges.push(newBadge);
                }
                this.saveBadges(badges);

                return { 
                    success: true, 
                    message: data.message || `Badge "${badgeName}" claimed successfully!`,
                    badgeName 
                };
            } else {
                return { success: false, message: data.message || 'Invalid code or badge already claimed' };
            }
        } catch (error) {
            console.error('Error claiming badge:', error);
            return { success: false, message: 'Network error. Please try again.' };
        }
    }

    /**
     * Check if a badge is claimed by the user
     */
    static isBadgeClaimed(badgeId: string): boolean {
        // Check in cached tokens first
        const tokens = this.getCachedTokens();
        const foundInTokens = tokens.some(t => 
            t.metadata?.badgeType?.toLowerCase() === badgeId.toLowerCase() ||
            t.id === badgeId
        );
        if (foundInTokens) return true;

        // Fallback to legacy storage
        const badges = this.getStoredBadges();
        return badges.some(b => b.badgeId === badgeId && b.claimed);
    }

    /**
     * Get badge definition by ID
     */
    static getBadgeById(badgeId: string): Badge | undefined {
        return AVAILABLE_BADGES.find(b => b.id === badgeId);
    }

    /**
     * Get all claimable badges (that can be unlocked with code/QR)
     */
    static getClaimableBadges(): Badge[] {
        return AVAILABLE_BADGES.filter(b => b.isClaimable);
    }

    /**
     * Get rarity color for a token
     */
    static getRarityColor(rarity: string): string {
        return RARITY_COLORS[rarity] || RARITY_COLORS['COMMON'];
    }

    /**
     * Get rarity icon for a token
     */
    static getRarityIcon(rarity: string): string {
        return RARITY_ICONS[rarity] || RARITY_ICONS['COMMON'];
    }

    /**
     * Clear badges data (on logout)
     */
    static clearBadges(): void {
        this.cachedTokens = [];
        if (typeof window === 'undefined') return;
        localStorage.removeItem(STORAGE_KEY_BADGES);
        localStorage.removeItem(STORAGE_KEY_TOKENS);
    }
}
