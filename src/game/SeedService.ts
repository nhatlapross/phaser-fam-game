// src/game/SeedService.ts

export interface SeedInventoryItem {
    id: string;
    userId: string;
    type: 'ALGAE' | 'MUSHROOM' | 'TREE';
    rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
    quantity: number;
    createdAt: string;
    updatedAt: string;
}

export class SeedService {
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
     * Fetches the user's seed inventory from the API
     * @returns A Promise that resolves to an array of seed inventory items, or empty array on failure
     */
    static async getSeedInventory(): Promise<SeedInventoryItem[]> {
        const token = SeedService.getAccessToken();
        if (!token) {
            return [];
        }

        try {
            const response = await fetch(
                `${SeedService.API_BASE_URL}/seed/inventory`,
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
                    return data as SeedInventoryItem[];
                } else {
                    return [];
                }
            } else if (response.status === 404 || response.status === 204) {
                // No inventory found, return empty array
                return [];
            } else {
                return [];
            }
        } catch (error) {
            return [];
        }
    }

    /**
     * Maps API seed type to game plant type
     */
    static mapSeedTypeToPlantType(apiType: string): 'algae' | 'mushroom' | 'tree' {
        switch (apiType.toUpperCase()) {
            case 'ALGAE':
                return 'algae';
            case 'MUSHROOM':
                return 'mushroom';
            case 'TREE':
                return 'tree';
            default:
                return 'algae'; // Default fallback
        }
    }

    /**
     * Maps game plant type to API seed type
     */
    static mapPlantTypeToApiSeedType(plantType: 'algae' | 'mushroom' | 'tree'): string {
        switch (plantType) {
            case 'algae':
                return 'ALGAE';
            case 'mushroom':
                return 'MUSHROOM';
            case 'tree':
                return 'TREE';
            default:
                return 'ALGAE';
        }
    }

    /**
     * Plants a seed on a land plot via API
     * @param landId The land plot identifier
     * @param plantType The type of seed to plant
     * @returns A Promise that resolves to the plantId if successful, null otherwise
     */
    static async plantSeed(landId: string, plantType: 'algae' | 'mushroom' | 'tree'): Promise<string | null> {
        const token = SeedService.getAccessToken();
        if (!token) {
            return null;
        }

        const seedType = SeedService.mapPlantTypeToApiSeedType(plantType);

        try {
            const response = await fetch(
                `${SeedService.API_BASE_URL}/plant/plant`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        landId,
                        seedType
                    })
                }
            );

            if (response.ok) {
                const data = await response.json();
                // Extract plantId from response - could be in different locations
                const plantId = data?.plant?.id || data?.id || data?.plantId;
                return plantId || null;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }
}
