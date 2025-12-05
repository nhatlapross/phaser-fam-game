// src/game/SeedService.ts

export interface SeedInventoryItem {
    id: string;
    userId: string;
    type: 'SOCIAL' | 'TECH' | 'BRANDED' | 'MUSHROOM';
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
            console.log('No access token available for seed inventory');
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
                    console.warn('Seed inventory response is not an array:', data);
                    return [];
                }
            } else if (response.status === 404 || response.status === 204) {
                // No inventory found, return empty array
                return [];
            } else {
                console.error(
                    "Error fetching seed inventory:",
                    response.statusText,
                    await response.text()
                );
                return [];
            }
        } catch (error) {
            console.error("Network error fetching seed inventory:", error);
            return [];
        }
    }

    /**
     * Maps API seed type to game plant type
     */
    static mapSeedTypeToPlantType(apiType: string): 'social' | 'technical' | 'branded' | 'mushroom' {
        switch (apiType.toUpperCase()) {
            case 'SOCIAL':
                return 'social';
            case 'TECH':
            case 'TECHNICAL':
                return 'technical';
            case 'BRANDED':
                return 'branded';
            case 'MUSHROOM':
                return 'mushroom';
            default:
                return 'social'; // Default fallback
        }
    }

    /**
     * Maps game plant type to API seed type
     */
    static mapPlantTypeToApiSeedType(plantType: 'social' | 'technical' | 'branded' | 'mushroom'): string {
        switch (plantType) {
            case 'social':
                return 'SEED_SOCIAL';
            case 'technical':
                return 'SEED_TECH';
            case 'branded':
                return 'SEED_BRANDED';
            case 'mushroom':
                return 'SEED_MUSHROOM';
            default:
                return 'SEED_SOCIAL';
        }
    }

    /**
     * Plants a seed on a land plot via API
     * @param landId The land plot identifier
     * @param plantType The type of seed to plant
     * @returns A Promise that resolves to true if successful, false otherwise
     */
    static async plantSeed(landId: string, plantType: 'social' | 'technical' | 'branded' | 'mushroom'): Promise<boolean> {
        const token = SeedService.getAccessToken();
        if (!token) {
            console.log('No access token available for planting seed');
            return false;
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
                console.log(`Successfully planted ${plantType} seed on land ${landId}`);
                return true;
            } else {
                console.error(
                    "Error planting seed:",
                    response.statusText,
                    await response.text()
                );
                return false;
            }
        } catch (error) {
            console.error("Network error planting seed:", error);
            return false;
        }
    }
}
