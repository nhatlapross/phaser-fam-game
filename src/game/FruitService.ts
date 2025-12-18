// src/game/FruitService.ts

import { UserService } from './UserService';
import { PlantType } from './types/GameTypes';

interface FruitInventoryItem {
    id: string;
    itemType: string;
    amount: number;
    name: string;
    rarity: string;
    category: string;
    icon: string;
}

interface InventoryResponse {
    userId: string;
    inventory: FruitInventoryItem[];
}

export class FruitService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    /**
     * Maps API fruit type to PlantType
     */
    static mapFruitTypeToPlantType(itemType: string): PlantType | null {
        const mapping: Record<string, PlantType> = {
            'FRUIT_ALGAE': 'algae',
            'FRUIT_MUSHROOM': 'mushroom',
            'FRUIT_TREE': 'tree',
        };
        return mapping[itemType] || null;
    }

    /**
     * Maps PlantType to API fruit type
     */
    static mapPlantTypeToFruitType(plantType: PlantType): string {
        const mapping: Record<PlantType, string> = {
            'algae': 'FRUIT_ALGAE',
            'mushroom': 'FRUIT_MUSHROOM',
            'tree': 'FRUIT_TREE',
        };
        return mapping[plantType];
    }

    /**
     * Fetches fruit inventory from API
     * Returns array of { type: PlantType, count: number }
     */
    static async getFruitInventory(): Promise<{ type: PlantType; count: number }[]> {
        const token = UserService.getAccessToken();
        if (!token) {
            console.log("No access token available for fetching fruit inventory");
            return [];
        }

        try {
            // Fetch full inventory (category filter doesn't work correctly for FRUIT_*)
            const response = await fetch(
                `${FruitService.API_BASE_URL}/inventory`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: InventoryResponse = await response.json();
                const result: { type: PlantType; count: number }[] = [];

                // Filter items that start with FRUIT_ and map to PlantType
                for (const item of data.inventory) {
                    // Only process FRUIT_ALGAE, FRUIT_MUSHROOM, FRUIT_TREE
                    if (item.itemType.startsWith('FRUIT_')) {
                        const plantType = FruitService.mapFruitTypeToPlantType(item.itemType);
                        if (plantType && item.amount > 0) {
                            result.push({
                                type: plantType,
                                count: item.amount
                            });
                        }
                    }
                }

                console.log('Fruit inventory fetched:', result);
                return result;
            } else {
                console.error(
                    "Error fetching fruit inventory:",
                    response.statusText,
                    await response.text()
                );
                return [];
            }
        } catch (error) {
            console.error("Network error fetching fruit inventory:", error);
            return [];
        }
    }

    /**
     * Gets gold balance from inventory
     */
    static async getGoldBalance(): Promise<number> {
        const token = UserService.getAccessToken();
        if (!token) return 0;

        try {
            const response = await fetch(
                `${FruitService.API_BASE_URL}/inventory`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: InventoryResponse = await response.json();
                const goldItem = data.inventory.find(item => item.itemType === 'GOLD');
                return goldItem?.amount || 0;
            }
            return 0;
        } catch (error) {
            console.error("Error fetching gold balance:", error);
            return 0;
        }
    }

    /**
     * Gets ruby balance from inventory
     */
    static async getRubyBalance(): Promise<number> {
        const token = UserService.getAccessToken();
        if (!token) return 0;

        try {
            const response = await fetch(
                `${FruitService.API_BASE_URL}/inventory`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: InventoryResponse = await response.json();
                const rubyItem = data.inventory.find(item => item.itemType === 'RUBY');
                return rubyItem?.amount || 0;
            }
            return 0;
        } catch (error) {
            console.error("Error fetching ruby balance:", error);
            return 0;
        }
    }

    /**
     * Gets both gold and gem balances
     */
    static async getCurrencyBalances(): Promise<{ gold: number; gem: number }> {
        const token = UserService.getAccessToken();
        if (!token) return { gold: 0, gem: 0 };

        try {
            const response = await fetch(
                `${FruitService.API_BASE_URL}/inventory`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: InventoryResponse = await response.json();
                const goldItem = data.inventory.find(item => item.itemType === 'GOLD');
                const gemItem = data.inventory.find(item => item.itemType === 'GEM');
                return {
                    gold: goldItem?.amount || 0,
                    gem: gemItem?.amount || 0
                };
            }
            return { gold: 0, gem: 0 };
        } catch (error) {
            console.error("Error fetching currency balances:", error);
            return { gold: 0, gem: 0 };
        }
    }
}
