// src/game/BadgeService.ts

import { UserService } from './UserService';

// Badge status from API
export type BadgeStatus = 'LOCKED' | 'CAN_CLAIM' | 'PENDING' | 'CLAIMED';

// Badge from API
export interface ApiBadge {
    id: string;
    slug: string;
    name: string;
    description: string;
    imageUrl: string;
    icon?: string; // Optional emoji icon for display
    requirements: {
        type: string;
        chain?: string;
        [key: string]: unknown;
    };
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    status: BadgeStatus;
}

// Claim response from API
export interface ClaimBadgeResponse {
    id: string;
    userId: string;
    badgeId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    proof: string;
    claimedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

// Legacy Badge definition (for backward compatibility)
export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    requirement: string;
    isClaimable: boolean;
}

// User's badge status (legacy format for local storage)
export interface UserBadge {
    badgeId: string;
    claimed: boolean;
    claimedAt?: string;
    code?: string;
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

export class BadgeService {
    private static API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    private static BADGES_KEY = 'fam_game_badges';
    private static TOKENS_KEY = 'fam_game_soulbound_tokens';

    /**
     * Get all badges with user status from API
     */
    static async getAllBadges(): Promise<ApiBadge[]> {
        const token = UserService.getAccessToken();
        if (!token) {
            console.log('No access token available for badges');
            return [];
        }

        try {
            const response = await fetch(`${BadgeService.API_BASE_URL}/badges`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data: ApiBadge[] = await response.json();
                console.log('Badges loaded:', data.length);
                return data;
            } else {
                console.error('Error fetching badges:', response.statusText);
                return [];
            }
        } catch (error) {
            console.error('Network error fetching badges:', error);
            return [];
        }
    }

    /**
     * Submit proof to claim a badge
     */
    static async claimBadge(badgeId: string, proof: string): Promise<{ success: boolean; message: string; data?: ClaimBadgeResponse }> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, message: 'Not authenticated' };
        }

        try {
            const response = await fetch(`${BadgeService.API_BASE_URL}/badges/${badgeId}/claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ proof })
            });

            const data = await response.json();

            if (response.ok) {
                return {
                    success: true,
                    message: 'Proof submitted! Waiting for admin verification.',
                    data
                };
            } else {
                return {
                    success: false,
                    message: data.message || 'Failed to submit proof'
                };
            }
        } catch (error) {
            console.error('Error claiming badge:', error);
            return { success: false, message: 'Network error. Please try again.' };
        }
    }

    /**
     * Get badges by status
     */
    static async getBadgesByStatus(status: BadgeStatus): Promise<ApiBadge[]> {
        const badges = await BadgeService.getAllBadges();
        return badges.filter(b => b.status === status);
    }

    /**
     * Get claimed badges
     */
    static async getClaimedBadges(): Promise<ApiBadge[]> {
        return BadgeService.getBadgesByStatus('CLAIMED');
    }

    /**
     * Get locked badges
     */
    static async getLockedBadges(): Promise<ApiBadge[]> {
        return BadgeService.getBadgesByStatus('LOCKED');
    }

    /**
     * Get pending badges (waiting for verification)
     */
    static async getPendingBadges(): Promise<ApiBadge[]> {
        return BadgeService.getBadgesByStatus('PENDING');
    }

    // ============ Legacy methods for backward compatibility ============

    /**
     * Get stored badges from localStorage (legacy)
     */
    static getStoredBadges(): UserBadge[] {
        if (typeof window === 'undefined') return [];
        const stored = localStorage.getItem(BadgeService.BADGES_KEY);
        return stored ? JSON.parse(stored) : [];
    }

    /**
     * Save badges to localStorage (legacy)
     */
    static saveBadges(badges: UserBadge[]): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem(BadgeService.BADGES_KEY, JSON.stringify(badges));
    }

    /**
     * Get cached soulbound tokens
     */
    static getCachedTokens(): SoulboundToken[] {
        if (typeof window === 'undefined') return [];
        const stored = localStorage.getItem(BadgeService.TOKENS_KEY);
        return stored ? JSON.parse(stored) : [];
    }

    /**
     * Save tokens to localStorage
     */
    static saveTokens(tokens: SoulboundToken[]): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem(BadgeService.TOKENS_KEY, JSON.stringify(tokens));
    }

    /**
     * Fetch soulbound tokens from API
     */
    static async fetchSoulboundTokens(): Promise<SoulboundToken[]> {
        const accessToken = UserService.getAccessToken();
        if (!accessToken) {
            console.log('No access token available for soulbound tokens');
            return this.getCachedTokens();
        }

        try {
            const response = await fetch(`${BadgeService.API_BASE_URL}/soulbound-tokens/my-tokens`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.ok) {
                const data: SoulboundTokensResponse = await response.json();
                const tokens = data.tokens || [];
                this.saveTokens(tokens);
                console.log('Soulbound tokens fetched:', tokens.length);
                return tokens;
            } else {
                console.error('Error fetching soulbound tokens:', response.statusText);
                return this.getCachedTokens();
            }
        } catch (error) {
            console.error('Network error fetching soulbound tokens:', error);
            return this.getCachedTokens();
        }
    }

    /**
     * Get rarity color
     */
    static getRarityColor(rarity: string): string {
        return RARITY_COLORS[rarity] || RARITY_COLORS['COMMON'];
    }

    /**
     * Get rarity icon
     */
    static getRarityIcon(rarity: string): string {
        return RARITY_ICONS[rarity] || RARITY_ICONS['COMMON'];
    }

    /**
     * Check if a badge is claimed by the user (legacy)
     */
    static isBadgeClaimed(badgeId: string): boolean {
        const tokens = this.getCachedTokens();
        const hasToken = tokens.some(t => 
            t.metadata?.badgeType?.toLowerCase() === badgeId.toLowerCase() ||
            t.name?.toLowerCase().includes(badgeId.toLowerCase())
        );
        if (hasToken) return true;

        const badges = this.getStoredBadges();
        return badges.some(b => b.badgeId === badgeId && b.claimed);
    }

    /**
     * Get user's claimed badges (legacy)
     */
    static getUserBadges(): UserBadge[] {
        return this.getStoredBadges();
    }

    /**
     * Clear all badge data from localStorage
     */
    static clearBadges(): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(BadgeService.BADGES_KEY);
        localStorage.removeItem(BadgeService.TOKENS_KEY);
    }
}
