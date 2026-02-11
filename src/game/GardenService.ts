// src/game/GardenService.ts

import { getSocketService } from './SocketService';

export interface Plant {
    id: string;
    type: 'ALGAE' | 'MUSHROOM' | 'TREE' | 'SOCIAL';
    typeName: string;
    name: string;
    stage: 'DIGGING' | 'SEED' | 'SPROUT' | 'GROWING' | 'BLOOM' | 'MATURE';
    stageName: string;
    plantedAt: string;
    lastWateredAt: string;
    waterBalance: number;
    waterCount?: number; // Legacy field
}

export interface Hydration {
    hoursToDeath: number;
    isDead: boolean;
    isWithering: boolean;
    status: 'HEALTHY' | 'WITHERING' | 'DEAD';
    message: string;
    waterBalance: number;
}

export interface Growth {
    activeGrowthHours: number;
    currentStage: string;
    hoursRemaining: number;
    progress: number;
    totalHoursNeeded: number;
}

export interface SoilQuality {
    fertility: number;
    hydration: number;
    status: string;
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
    hydration?: Hydration;
    growth?: Growth;
    soilQuality?: SoilQuality;
    progress?: Progress;
    config?: Config;
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
                    return [];
                }
            } else if (response.status === 404 || response.status === 204) {
                // No garden found, return empty array
                return [];
            } else {
                return [];
            }
        } catch (error) {
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
     * API stages: DIGGING (0) -> SEED (1) -> SPROUT (2) -> GROWING (3) -> BLOOM (4) -> MATURE (5)
     */
    static mapStageToGameStage(apiStage: string): number {
        switch (apiStage.toUpperCase()) {
            case 'DIGGING':
              return 1; // DIGGING -> Hạt (Seed) - Fix: User expects Stage 1 initially
            case 'SEED':
              return 1; // SEED
            case 'SPROUT':
              return 2; // SPROUT
            case 'GROWING':
              return 3; // GROWING -> Cây Non (Sapling)
            case 'BLOOM':
            case 'FLOWER':
              return 4; // BLOOM -> Quả (Fruit/Flower)
            case 'MATURE':
              return 5; // MATURE - ready to harvest
            case 'NEW':
              return 1; // NEW -> SEED
            default:
              return 1; // Default to SEED for unknown stages
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
    static async waterPlant(plantId: string): Promise<{ success: boolean; message?: string }> {
        const token = GardenService.getAccessToken();
        if (!token) {
            return { success: false, message: 'Not authenticated' };
        }

        const url = `${GardenService.API_BASE_URL}/plant/${plantId}/water`;

        try {
            const response = await fetch(url, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${token}`,
                },
            });

            const responseText = await response.text();

            if (response.ok) {
                return { success: true };
            } else {
                // Parse error message from response
                let errorMessage = 'Failed to water plant';
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.message || errorMessage;
                } catch {
                    // Use default message if parsing fails
                }
                return { success: false, message: errorMessage };
            }
        } catch (error) {
            return { success: false, message: 'Network error' };
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
                return true;
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Clears a land plot by removing the plant via API
     * @param landId The land ID from the backend
     * @returns A Promise that resolves to the response data if successful, null otherwise
     */
    static async clearLand(landId: string): Promise<{
        success: boolean;
        land: { id: string; plotIndex: number; plant: null };
        removedPlant: { type: string; stage: string } | null;
        message: string;
    } | null> {
        const token = GardenService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${GardenService.API_BASE_URL}/land/${landId}/clear`,
                {
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${token}`,
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

    // ==========================================
    // WebSocket-based Methods (Fire-and-forget)
    // UI updates come via socket event listeners
    // ==========================================

    /**
     * Waters a plant via WebSocket
     * Uses the game gateway: ws://localhost:3000/game
     * Emit: 'water_plant', { plantId: string }
     * Response comes via 'plant_update' and 'inventory_update' events
     * @param plantId The plant ID from the backend
     * @returns true if WebSocket was used, false if fell back to REST
     */
    static waterPlantWS(plantId: string): boolean {
        const socketService = getSocketService();
        
        if (!socketService.isConnected()) {
            return false;
        }
        socketService.waterPlant(plantId);
        return true;
    }

    /**
     * Harvests a plant via WebSocket
     * Uses the game gateway: ws://localhost:3000/game
     * Emit: 'harvest_plant', { plantId: string }
     * Response comes via 'land_update' and 'inventory_update' events
     * @param plantId The plant ID from the backend
     * @returns true if WebSocket was used, false if fell back to REST
     */
    static harvestPlantWS(plantId: string): boolean {
        const socketService = getSocketService();
        
        if (!socketService.isConnected()) {
            return false;
        }

        socketService.harvestPlant(plantId);
        return true;
    }
}
