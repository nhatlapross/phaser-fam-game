// src/game/FertilizerService.ts

export interface FertilizerInventoryItem {
    id: string;
    user_id: string;
    item_id: string;
    quantity: number;
    createdAt: string;
    updatedAt: string;
    items: {
        id: string;
        name: string;
        type: 'FERTILIZER_COMMON' | 'FERTILIZER_RARE' | 'FERTILIZER_EPIC';
        description: string;
        createdAt: string;
        updatedAt: string;
    };
}

export class FertilizerService {
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
     * Fetches the user's fertilizer inventory from the API
     * @returns A Promise that resolves to an array of fertilizer inventory items, or empty array on failure
     */
    static async getFertilizerInventory(): Promise<FertilizerInventoryItem[]> {
        const token = FertilizerService.getAccessToken();
        if (!token) {
            console.log('No access token available for fertilizer inventory');
            return [];
        }

        try {
            const response = await fetch(
                `${FertilizerService.API_BASE_URL}/fertilizer/inventory`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                // Ensure we always return an array
                if (Array.isArray(data)) {
                    return data as FertilizerInventoryItem[];
                } else {
                    console.warn('Fertilizer inventory response is not an array:', data);
                    return [];
                }
            } else if (response.status === 404 || response.status === 204) {
                // No inventory found, return empty array
                return [];
            } else {
                console.error(
                    "Error fetching fertilizer inventory:",
                    response.statusText,
                    await response.text()
                );
                return [];
            }
        } catch (error) {
            console.error("Network error fetching fertilizer inventory:", error);
            return [];
        }
    }

    /**
     * Maps API fertilizer type to game fertilizer type
     */
    static mapFertilizerType(apiType: string): 'common' | 'rare' | 'epic' {
        switch (apiType.toUpperCase()) {
            case 'FERTILIZER_COMMON':
                return 'common';
            case 'FERTILIZER_RARE':
                return 'rare';
            case 'FERTILIZER_EPIC':
                return 'epic';
            default:
                return 'common'; // Default fallback
        }
    }
}
