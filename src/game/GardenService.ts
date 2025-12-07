// src/game/GardenService.ts

export interface Plant {
    id: string;
    type: 'ALGAE' | 'MUSHROOM' | 'TREE';
    name: string;
    stage: 'SEED' | 'SPROUT' | 'YOUNG' | 'MATURE' | 'FLOWER' | 'FRUIT';
    plantedAt: string;
    waterCount: number;
}

export interface Progress {
    percentage: number;
    timeRemaining: string;
    stage: string;
    canWater: boolean;
}

export interface Config {
    diggingTime: string;
    growingTime: string;
    totalTime: string;
    baseYield: number;
}

export interface GardenPlot {
    landId: string;
    plotIndex: number;
    plant: Plant | null;
    progress: Progress;
    config: Config;
}

export type GardenResponse = GardenPlot[];

export class GardenService {
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
     * Fetches the user's garden data from the API
     * @returns A Promise that resolves to garden data (array of plots), or empty array on failure
     */
    static async getGarden(): Promise<GardenResponse> {
        const token = GardenService.getAccessToken();
        if (!token) {
            console.log('No access token available for garden data');
            return [];
        }

        try {
            const response = await fetch(
                `${GardenService.API_BASE_URL}/garden`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                // Ensure we return an array
                if (Array.isArray(data)) {
                    return data as GardenResponse;
                } else {
                    console.warn('Garden response is not an array:', data);
                    return [];
                }
            } else if (response.status === 404 || response.status === 204) {
                // No garden found, return empty array
                return [];
            } else {
                console.error(
                    "Error fetching garden:",
                    response.statusText,
                    await response.text()
                );
                return [];
            }
        } catch (error) {
            console.error("Network error fetching garden:", error);
            return [];
        }
    }

    /**
     * Maps API plant type to game plant type
     */
    static mapPlantTypeToGameType(apiType: string): 'algae' | 'mushroom' | 'tree' {
        switch (apiType.toUpperCase()) {
            case 'ALGAE':
                return 'algae';
            case 'MUSHROOM':
                return 'mushroom';
            case 'TREE':
                return 'tree';
            default:
                return 'algae';
        }
    }

    /**
     * Maps API plant stage to game plant stage (0-5)
     */
    static mapStageToGameStage(apiStage: string): number {
        switch (apiStage.toUpperCase()) {
            case 'SEED':
                // return 0; // SEED
            case 'SPROUT':
                return 1; // SPROUT
            case 'YOUNG':
                return 2; // YOUNG
            case 'MATURE':
                return 3; // MATURE
            case 'FLOWER':
                return 4; // FLOWER
            case 'FRUIT':
                return 5; // FRUIT
            default:
                return 1; // Default to SPROUT
        }
    }

    /**
     * Converts plot index to tile key (e.g., "24,24")
     * Assumes 4x4 grid starting at (24, 24)
     */
    static plotIndexToTileKey(plotIndex: number): string {
        const centerX = 24;
        const centerY = 24;
        const gridSize = 4;
        
        if (plotIndex < 0 || plotIndex >= 16) {
            console.warn(`Invalid plot index: ${plotIndex}`);
            return `${centerX},${centerY}`;
        }
        
        const row = Math.floor(plotIndex / gridSize);
        const col = plotIndex % gridSize;
        
        const x = centerX + col;
        const y = centerY + row;
        
        return `${x},${y}`;
    }

    /**
     * Waters a plant via API
     * @param plantId The plant ID from the backend
     * @returns A Promise that resolves to true if successful, false otherwise
     */
    static async waterPlant(plantId: string): Promise<boolean> {
        const token = GardenService.getAccessToken();
        if (!token) {
            console.log('No access token available for watering plant');
            return false;
        }

        try {
            const response = await fetch(
                `${GardenService.API_BASE_URL}/plant/${plantId}/water`,
                {
                    method: "PATCH",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                console.log(`Successfully watered plant ${plantId}`);
                return true;
            } else {
                console.error(
                    "Error watering plant:",
                    response.statusText,
                    await response.text()
                );
                return false;
            }
        } catch (error) {
            console.error("Network error watering plant:", error);
            return false;
        }
    }

    /**
     * Harvests fruits from a mature plant via API
     * @param plantId The plant ID from the backend
     * @returns A Promise that resolves to true if successful, false otherwise
     */
    static async harvestPlant(plantId: string): Promise<boolean> {
        const token = GardenService.getAccessToken();
        if (!token) {
            console.log('No access token available for harvesting plant');
            return false;
        }

        try {
            const response = await fetch(
                `${GardenService.API_BASE_URL}/plant/${plantId}/harvest`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                console.log(`Successfully harvested plant ${plantId}`);
                return true;
            } else {
                console.error(
                    "Error harvesting plant:",
                    response.statusText,
                    await response.text()
                );
                return false;
            }
        } catch (error) {
            console.error("Network error harvesting plant:", error);
            return false;
        }
    }
}
