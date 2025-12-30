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

export interface ApplyFertilizerResponse {
    success: boolean;
    plant: {
        id: string;
        landId: string;
        type: string;
        stage: string;
        waterBalance: number;
        activeGrowthHours: number;
        witheredAt: string | null;
        isHarvestable: boolean;
    };
    stageChanged: boolean;
    oldStage: string;
    newStage: string;
    interactions: number;
    soilQuality: {
        fertility: number;
        hydration: number;
    };
    fertilizerUsed: string;
    effect: {
        growthBoost: number;
        soilFertilityBoost: number;
        duration: number;
    };
    message: string;
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
     * Apply fertilizer to a plant
     * POST /fertilizer/apply
     * @param landId The land ID where the plant is located
     * @param fertilizerType The type of fertilizer to apply (e.g., 'FERTILIZER_COMMON')
     * @returns A Promise that resolves to the response data, or null on failure
     */
    static async applyFertilizer(landId: string, fertilizerType: FertilizerApiType): Promise<ApplyFertilizerResponse | null> {
        const token = FertilizerService.getAccessToken();
        if (!token) {
            console.log('No access token available for applying fertilizer');
            return null;
        }

        const url = `${FertilizerService.API_BASE_URL}/fertilizer/apply`;
        console.log(`[FertilizerService] Applying fertilizer: POST ${url}`, { landId, fertilizerType });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ landId, fertilizerType }),
            });

            const responseText = await response.text();
            console.log(`[FertilizerService] Response status: ${response.status}, body:`, responseText);

            if (response.ok) {
                const data = JSON.parse(responseText);
                console.log(`[FertilizerService] Successfully applied ${fertilizerType} to land ${landId}`);
                return data as ApplyFertilizerResponse;
            } else {
                let errorMessage = 'Failed to apply fertilizer';
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.message || errorMessage;
                } catch {
                    // Use default message if parsing fails
                }
                console.error('[FertilizerService] Error:', response.status, errorMessage);
                return null;
            }
        } catch (error) {
            console.error('[FertilizerService] Network error applying fertilizer:', error);
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

    /**
     * Maps game fertilizer type to API fertilizer type
     */
    static mapToApiFertilizerType(gameType: GameFertilizerType): FertilizerApiType {
        switch (gameType) {
            case 'common':
                return 'FERTILIZER_COMMON';
            case 'rare':
                return 'FERTILIZER_RARE';
            case 'epic':
                return 'FERTILIZER_EPIC';
            case 'legendary':
                return 'FERTILIZER_LEGENDARY';
            default:
                return 'FERTILIZER_COMMON';
        }
    }
}
