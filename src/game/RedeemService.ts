// src/game/RedeemService.ts

export interface RedeemResponse {
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
        message: string;
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
            console.log('No access token available for redeem code');
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
                console.log('Redeem code successful:', data);
                return {
                    success: data.success !== false,
                    event: data.event,
                    reward: data.reward,
                    message: data.reward?.message || data.message || 'Code redeemed successfully!'
                };
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('Error redeeming code:', response.statusText, errorData);
                return {
                    success: false,
                    message: errorData.message || 'Invalid or expired code'
                };
            }
        } catch (error) {
            console.error('Network error redeeming code:', error);
            return {
                success: false,
                message: 'Network error. Please try again.'
            };
        }
    }
}
