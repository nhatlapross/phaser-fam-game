// src/game/InventoryService.ts

import { UserService } from './UserService';

export interface InventoryItem {
    id: string;
    itemType: string;
    amount: number;
    location: string;
    name: string;
    rarity: string;
    category: string;
    icon: string;
}

export interface BackpackResponse {
    userId: string;
    backpack: InventoryItem[];
    capacity: {
        total: number;
        used: number;
        available: number;
        max?: number;
    };
}

export interface StorageResponse {
    userId: string;
    storage: InventoryItem[];
    summary: {
        totalTypes: number;
        totalItems: number;
        categories?: number;
    };
}

export interface MoveItemResponse {
    success: boolean;
    item: InventoryItem | null;
    message: string;
}

export class InventoryService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    /**
     * Get backpack items (items player is carrying - chest in game)
     */
    static async getBackpack(): Promise<BackpackResponse | null> {
        const token = UserService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${InventoryService.API_BASE_URL}/inventory/backpack`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: BackpackResponse = await response.json();
                return data;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Get storage items (warehouse in game)
     */
    static async getStorage(): Promise<StorageResponse | null> {
        const token = UserService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${InventoryService.API_BASE_URL}/inventory/storage`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: StorageResponse = await response.json();
                return data;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Move item from storage to backpack (warehouse -> chest)
     */
    static async moveToBackpack(itemType: string, amount: number): Promise<MoveItemResponse | null> {
        const token = UserService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${InventoryService.API_BASE_URL}/inventory/move-to-backpack`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ itemType, amount }),
                }
            );

            if (response.ok) {
                const data: MoveItemResponse = await response.json();
                return data;
            } else {
                const errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    return {
                        success: false,
                        item: null,
                        message: errorJson.message || 'Failed to move item'
                    };
                } catch {
                    return {
                        success: false,
                        item: null,
                        message: 'Failed to move item'
                    };
                }
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Move item from backpack to storage (chest -> warehouse)
     */
    static async moveToStorage(itemType: string, amount: number): Promise<MoveItemResponse | null> {
        const token = UserService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${InventoryService.API_BASE_URL}/inventory/move-to-storage`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ itemType, amount }),
                }
            );

            if (response.ok) {
                const data: MoveItemResponse = await response.json();
                return data;
            } else {
                const errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    return {
                        success: false,
                        item: null,
                        message: errorJson.message || 'Failed to move item'
                    };
                } catch {
                    return {
                        success: false,
                        item: null,
                        message: 'Failed to move item'
                    };
                }
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Get icon for item type
     */
    static getItemIcon(itemType: string): string {
        const iconMap: Record<string, string> = {
            // Fruits
            'FRUIT_ALGAE': 'algae-fruit',
            'FRUIT_MUSHROOM': 'mushroom-fruit',
            'FRUIT_TREE': 'tree-fruit',
            'FRUIT_SOCIAL': 'social-fruit',
            'FRUIT_TECHNICAL': 'technical-fruit',
            'FRUIT_BRANDED': 'branded-fruit',
            // Seeds
            'SEED_COMMON': 'algae-seed',
            'SEED_RARE': 'mushroom-seed',
            'SEED_EPIC': 'tree-seed',
            'SEED_ALGAE': 'algae-seed',
            'SEED_MUSHROOM': 'mushroom-seed',
            'SEED_TREE': 'tree-seed',
            'SEED_SOCIAL': 'social-seed',
            'SEED_TECHNICAL': 'technical-seed',
            'SEED_BRANDED': 'branded-seed',
            // Fertilizers
            'FERTILIZER_COMMON': 'icon-fertilizer',
            'FERTILIZER_RARE': 'icon-fertilizer',
            'FERTILIZER_EPIC': 'icon-fertilizer',
            'FERTILIZER_LEGENDARY': 'icon-fertilizer',
            // Tools
            'BUG_GLOVE': 'icon-bug-glove',
            'PESTICIDE': 'icon-bug-glove',
            'SHOVEL': 'icon-hand',
            'FISH_FOOD': 'icon-fertilizer',
            // Water
            'WATER': 'icon-watercan',
            'GROWTH_WATER': 'icon-watercan',
        };
        return iconMap[itemType] || 'icon-fertilizer';
    }

    /**
     * Get display name for item type
     */
    static getItemName(itemType: string): string {
        const nameMap: Record<string, string> = {
            // Fruits
            'FRUIT_ALGAE': 'Algae',
            'FRUIT_MUSHROOM': 'Mushroom',
            'FRUIT_TREE': 'Tree Fruit',
            'FRUIT_SOCIAL': 'Social Fruit',
            'FRUIT_TECHNICAL': 'Technical Fruit',
            'FRUIT_BRANDED': 'Branded Fruit',
            // Seeds
            'SEED_COMMON': 'Common Seed',
            'SEED_RARE': 'Rare Seed',
            'SEED_EPIC': 'Epic Seed',
            'SEED_ALGAE': 'Algae Seed',
            'SEED_MUSHROOM': 'Mushroom Spore',
            'SEED_TREE': 'Tree Seed',
            'SEED_SOCIAL': 'Social Seed',
            'SEED_TECHNICAL': 'Technical Seed',
            'SEED_BRANDED': 'Branded Seed',
            // Fertilizers
            'FERTILIZER_COMMON': 'Common Fertilizer',
            'FERTILIZER_RARE': 'Rare Fertilizer',
            'FERTILIZER_EPIC': 'Epic Fertilizer',
            'FERTILIZER_LEGENDARY': 'Legend Fertilizer',
            // Tools
            'BUG_GLOVE': 'Bug Glove',
            'PESTICIDE': 'Pesticide',
            'SHOVEL': 'Shovel',
            'FISH_FOOD': 'Fish Food',
            // Water
            'WATER': 'Water',
            'GROWTH_WATER': 'Growth Water',
        };
        return nameMap[itemType] || itemType;
    }
}
