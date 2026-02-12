// src/game/RedeemService.ts

import { UserService } from './UserService';
import { GameDataService } from './GameDataService';

export interface RedeemResponse {
    success: boolean;
    event?: {
        id?: string;
        name: string;
        code?: string;
        location?: string;
        startTime?: string;
        endTime?: string;
    };
    reward?: {
        itemType: string;
        itemName?: string;
        amount: number;
        icon?: string;
        probability?: number;
        message?: string;
    };
    message?: string;
}

export class RedeemService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    /**
     * Gets the stored access token from localStorage
     */
    private static getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('fam_game_access_token');
    }

    /**
     * Redeems a code via the check-in API
     * @param verificationCode The code to redeem
     * @param eventId The event ID (can be mocked for now)
     * @returns A Promise that resolves to the redeem response
     */
    static async redeemCode(verificationCode: string, eventId: string = 'c91fef29-f5a4-4e74-b6ee-48bab97d95be'): Promise<RedeemResponse> {
        const token = RedeemService.getAccessToken();
        if (!token) {
            return {
                success: false,
                message: 'Not authenticated'
            };
        }

        try {
            const response = await fetch(
                `${RedeemService.API_BASE_URL}/events/check-in`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        eventId,
                        verificationCode
                    })
                }
            );

            if (response.ok) {
                const data = await response.json();
                return {
                    success: data.success !== false,
                    event: data.event,
                    reward: data.reward,
                    message: data.reward?.message || data.message || 'Code redeemed successfully!'
                };
            } else {
                const errorData = await response.json().catch(() => ({}));
                return {
                    success: false,
                    message: errorData.message || 'Invalid or expired code'
                };
            }
        } catch (error) {
            return {
                success: false,
                message: 'Network error. Please try again.'
            };
        }
    }

    /**
     * Claim a redemption code
     * @param code The redemption code (e.g., "TESTCODE123")
     * @returns A Promise that resolves to the redeem response
     */
    static async claimRedemptionCode(code: string): Promise<RedeemResponse> {
        const token = RedeemService.getAccessToken();
        if (!token) {
            return {
                success: false,
                message: 'Not authenticated'
            };
        }

        // Get userId from token or localStorage
        const userId = RedeemService.getUserId();
        if (!userId) {
            return {
                success: false,
                message: 'User not found'
            };
        }

        try {
            const response = await fetch(
                `${RedeemService.API_BASE_URL}/redemption/claim`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({ userId, code })
                }
            );

            if (response.ok) {
                const data = await response.json();
                // API returns: { success, type, reward: { amount }, data }
                return {
                    success: data.success !== false,
                    type: data.type,
                    reward: data.reward,
                    message: data.message || 'Code redeemed successfully!'
                } as any;
            } else {
                const errorData = await response.json().catch(() => ({}));
                return {
                    success: false,
                    message: errorData.message || 'Invalid or expired code'
                };
            }
        } catch (error) {
            return {
                success: false,
                message: 'Network error. Please try again.'
            };
        }
    }

    /**
     * Gets the stored user ID from cached data or UserService
     */
    private static getUserId(): string | null {
        // Try GameDataService first (cached data)
        const cachedData = GameDataService.getCachedData();
        if (cachedData?.user?.id) {
            return cachedData.user.id;
        }
        
        // Fallback to UserService
        const user = UserService.getStoredUser();
        return user?.id || null;
    }

    /**
     * Offline check-in with a simple code (for manual input, not QR scan)
     * @param code The check-in code (e.g., "BANGKOK2025")
     * @returns A Promise that resolves to the redeem response
     */
    static async offlineCheckIn(code: string): Promise<RedeemResponse> {
        const token = RedeemService.getAccessToken();
        if (!token) {
            return {
                success: false,
                message: 'Not authenticated'
            };
        }

        try {
            const response = await fetch(
                `${RedeemService.API_BASE_URL}/events/offline-check-in`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({ code })
                }
            );

            if (response.ok) {
                const data = await response.json();
                return {
                    success: data.success !== false,
                    event: data.event,
                    reward: data.reward,
                    message: data.reward?.message || data.message || 'Check-in successful!'
                };
            } else {
                const errorData = await response.json().catch(() => ({}));
                return {
                    success: false,
                    message: errorData.message || 'Invalid or expired code'
                };
            }
        } catch (error) {
            return {
                success: false,
                message: 'Network error. Please try again.'
            };
        }
    }
}
