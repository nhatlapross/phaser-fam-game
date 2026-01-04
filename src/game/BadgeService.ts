// src/game/BadgeService.ts

import { UserService } from './UserService';

// Badge definition
export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string; // emoji or image key
    color: string;
    requirement: string; // Description of how to unlock
    isClaimable: boolean; // Can be claimed with code/QR
}

// User's badge status
export interface UserBadge {
    badgeId: string;
    claimed: boolean;
    claimedAt?: string;
    code?: string; // Code used to claim (if applicable)
}

// Available badges in the game
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

export class BadgeService {
    private static API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

    /**
     * Get user's badges from local storage (cached)
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
     * Fetch user's badges from API
     */
    static async fetchUserBadges(): Promise<UserBadge[]> {
        const token = UserService.getAccessToken();
        if (!token) return [];

        try {
            const response = await fetch(`${BadgeService.API_BASE_URL}/user/badges`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const badges: UserBadge[] = data.badges || [];
                BadgeService.saveBadges(badges);
                return badges;
            }
        } catch (error) {
            console.error('Error fetching badges:', error);
        }

        return BadgeService.getStoredBadges();
    }

    /**
     * Claim a badge using a code
     */
    static async claimBadgeWithCode(badgeId: string, code: string): Promise<{ success: boolean; message: string }> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, message: 'Not authenticated' };
        }

        try {
            const response = await fetch(`${BadgeService.API_BASE_URL}/user/badges/claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ badgeId, code })
            });

            const data = await response.json();

            if (response.ok) {
                // Update local storage
                const badges = BadgeService.getStoredBadges();
                const existingIndex = badges.findIndex(b => b.badgeId === badgeId);
                const newBadge: UserBadge = {
                    badgeId,
                    claimed: true,
                    claimedAt: new Date().toISOString(),
                    code
                };

                if (existingIndex >= 0) {
                    badges[existingIndex] = newBadge;
                } else {
                    badges.push(newBadge);
                }
                BadgeService.saveBadges(badges);

                return { success: true, message: data.message || 'Badge claimed successfully!' };
            } else {
                return { success: false, message: data.message || 'Failed to claim badge' };
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
        const badges = BadgeService.getStoredBadges();
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
     * Clear badges data (on logout)
     */
    static clearBadges(): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(STORAGE_KEY_BADGES);
    }
}
