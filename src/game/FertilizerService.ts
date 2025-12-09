// src/game/FertilizerService.ts

export type FertilizerRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type FertilizerApiType = 'FERTILIZER_COMMON' | 'FERTILIZER_RARE' | 'FERTILIZER_EPIC' | 'FERTILIZER_LEGENDARY';
export type GameFertilizerType = 'common' | 'rare' | 'epic' | 'legendary';

export interface FertilizerItem {
    type: FertilizerApiType;
    amount: number;
    rarity: FertilizerRarity;
}

export interface FertilizerInventoryResponse {
    fertilizers: FertilizerItem[];
    total: number;
}

export class FertilizerService {
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
     * Fetches the user's fertilizer inventory from the API
     * @returns A Promise that resolves to fertilizer inventory response, or null on failure
     */
    static async getFertilizerInventory(): Promise<FertilizerInventoryResponse | null> {
        const token = FertilizerService.getAccessToken();
        if (!token) {
            console.log('No access token available for fertilizer inventory');
            return null;
        }

        try {
            const response = await fetch(
                `${FertilizerService.API_BASE_URL}/fertilizer/inventory`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                if (data && Array.isArray(data.fertilizers)) {
                    return data as FertilizerInventoryResponse;
                } else {
                    console.warn('Fertilizer inventory response format unexpected:', data);
                    return null;
                }
            } else if (response.status === 404 || response.status === 204) {
                // No inventory found
                return null;
            } else {
                console.error(
                    'Error fetching fertilizer inventory:',
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error('Network error fetching fertilizer inventory:', error);
            return null;
        }
    }

    /**
     * Maps API fertilizer type to game fertilizer type
     */
    static mapFertilizerType(apiType: string): GameFertilizerType {
        switch (apiType.toUpperCase()) {
            case 'FERTILIZER_COMMON':
                return 'common';
            case 'FERTILIZER_RARE':
                return 'rare';
            case 'FERTILIZER_EPIC':
                return 'epic';
            case 'FERTILIZER_LEGENDARY':
                return 'legendary';
            default:
                return 'common'; // Default fallback
        }
    }
}
