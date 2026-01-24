// src/game/EventService.ts

export interface GameEvent {
    id: string;
    name: string;
    description: string;
    location: string;
    startTime: string;
    endTime: string;
    isClaimed?: boolean;
    status?: 'NOT_CLAIMED' | 'CLAIMED';
}

export interface EventCheckinResponse {
    success: boolean;
    event?: {
        id: string;
        name: string;
        location: string;
        startTime: string;
        endTime: string;
    };
    reward?: {
        itemType: string;
        amount: number;
        totalAmount: number;
    };
    message?: string;
}

export interface EventCheckinErrorResponse {
    success: false;
    error: string;
    message: string;
}

export class EventService {
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
     * Get all active events
     * @returns A Promise that resolves to the list of active events
     */
    static async getActiveEvents(): Promise<GameEvent[]> {
        const token = EventService.getAccessToken();
        if (!token) {
            return [];
        }

        try {
            const response = await fetch(
                `${EventService.API_BASE_URL}/events/active`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                return data;
            } else {
                return [];
            }
        } catch (error) {
            return [];
        }
    }

    /**
     * Check in to an event via REST API (fallback if WebSocket is not available)
     * @param eventId - The UUID of the event to check in to
     * @param verificationCode - Optional verification code for the event
     * @returns A Promise that resolves to the check-in response
     */
    static async checkinToEvent(eventId: string, verificationCode?: string): Promise<EventCheckinResponse | EventCheckinErrorResponse> {
        const token = EventService.getAccessToken();
        if (!token) {
            return {
                success: false,
                error: 'UNAUTHORIZED',
                message: 'No access token available'
            };
        }

        try {
            const body: { eventId: string; verificationCode?: string } = { eventId };
            if (verificationCode) {
                body.verificationCode = verificationCode;
            }

            const response = await fetch(
                `${EventService.API_BASE_URL}/events/check-in`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                }
            );

            const data = await response.json();

            if (response.ok && data.success) {
                return data as EventCheckinResponse;
            } else {
                return {
                    success: false,
                    error: data.error || 'CHECKIN_FAILED',
                    message: data.message || 'Event check-in failed'
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
     * Check in to an offline event with a redemption code
     * @param code - The offline event code (e.g., "BANGKOK2025")
     * @returns A Promise that resolves to the check-in response
     */
    static async offlineCheckin(code: string): Promise<EventCheckinResponse | EventCheckinErrorResponse> {
        const token = EventService.getAccessToken();
        if (!token) {
            return {
                success: false,
                error: 'UNAUTHORIZED',
                message: 'No access token available'
            };
        }

        try {
            const response = await fetch(
                `${EventService.API_BASE_URL}/events/offline-check-in`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ code }),
                }
            );

            const data = await response.json();

            if (response.ok && data.success) {
                return data as EventCheckinResponse;
            } else {
                return {
                    success: false,
                    error: data.error || 'OFFLINE_CHECKIN_FAILED',
                    message: data.message || 'Offline check-in failed'
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
     * Get offline reward rates
     * @returns A Promise that resolves to the offline reward rates
     */
    static async getOfflineRewardRates(): Promise<unknown> {
        const token = EventService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${EventService.API_BASE_URL}/events/offline-reward-rates`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                return data;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }
}
