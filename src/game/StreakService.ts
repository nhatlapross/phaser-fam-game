// src/game/StreakService.ts

export interface StreakRewards {
    gold: number;
    ruby: number;
    items: string[];
}

export interface StreakRewardItem {
    itemType: string;
    amount: number;
    name: string;
    rarity: string;
    icon: string;
}

export interface NextRewards {
    gold: number;
    ruby: number;
    items: StreakRewardItem[];
}

export interface StreakStatusResponse {
    currentStreak: number;
    lastCheckinAt: string | null;
    nextCheckinAt: string;
    totalCycles: number;
    canCheckinNow: boolean;
    nextRewards: NextRewards;
    daysUntilCycleComplete: number;
}

export interface CheckinResponse {
    success: boolean;
    streakDay: number;
    currentStreak: number;
    totalCycles: number;
    rewards: StreakRewards;
    nextCheckinAt: string;
    message: string;
}

export interface CheckinErrorResponse {
    success: false;
    error: string;
    message: string;
}

export interface HistoryCheckin {
    id: string;
    streakDay: number; // 1-7 representing Day 1 to Day 7
    rewards: StreakRewards;
    checkinAt: string;
}

export interface StreakHistoryResponse {
    checkins: HistoryCheckin[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export class StreakService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

    /**
     * Gets the stored access token from localStorage
     */
    private static getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('fam_game_access_token');
    }

    /**
     * Performs daily check-in via API
     * @returns A Promise that resolves to the check-in response
     */
    static async checkin(): Promise<CheckinResponse | CheckinErrorResponse> {
        const token = StreakService.getAccessToken();
        if (!token) {
            return {
                success: false,
                error: 'UNAUTHORIZED',
                message: 'No access token available'
            };
        }

        try {
            const response = await fetch(
                `${StreakService.API_BASE_URL}/streak/checkin`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const data = await response.json();

            if (response.ok && data.success) {
                return data as CheckinResponse;
            } else {
                return {
                    success: false,
                    error: data.error || 'CHECKIN_FAILED',
                    message: data.message || 'Check-in failed'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: 'NETWORK_ERROR',
                message: 'Network error occurred'
            };
        }
    }

    /**
     * Gets the current streak status from API
     * @returns A Promise that resolves to the streak status, or null on failure
     */
    static async getStatus(): Promise<StreakStatusResponse | null> {
        const token = StreakService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${StreakService.API_BASE_URL}/streak/status`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                return data as StreakStatusResponse;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Gets the check-in history from API
     * @param limit Number of records to fetch (default 7 for current cycle)
     * @returns A Promise that resolves to the history response, or null on failure
     */
    static async getHistory(limit: number = 7): Promise<StreakHistoryResponse | null> {
        const token = StreakService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${StreakService.API_BASE_URL}/streak/history?page=1&limit=${limit}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                return data as StreakHistoryResponse;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }
}
