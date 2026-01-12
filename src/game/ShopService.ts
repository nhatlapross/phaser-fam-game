// src/game/ShopService.ts

import { getSocketService } from './SocketService';

// Gold Shop Types
export interface GoldShopItem {
    key: string;
    name: string;
    description: string;
    priceGold: number;
    period?: 'DAY' | 'WEEK';
    limitPerPeriod?: number;
    icon: string;
    affordable: boolean;
    limit: number | null;
    purchased: number;
    remaining: number | null;
    exchangeRequirement?: {
        itemType: string;
        amount: number;
    };
    exchangeReward?: {
        itemType: string;
        amount: number;
    };
}

export interface GoldShopResponse {
    user: {
        id: string;
        balanceGold: number;
    };
    items: GoldShopItem[];
}

// Gem Shop Types
export interface GemShopItem {
    key: string;
    name: string;
    description: string;
    priceGem: number;
    icon: string;
    affordable: boolean;
    available?: boolean;
    reward?: {
        itemType?: string;
        amount?: number;
        effect?: string;
        gold?: number;
        landSlot?: number;
    };
    currentLandSlots?: number;
    maxLandSlot?: number;
}

export interface GemShopResponse {
    user: {
        id: string;
        balanceGem: number;
    };
    items: GemShopItem[];
}

// Cash Shop Types
export interface CashShopItem {
    key: string;
    name: string;
    description: string;
    priceUSD: number;
    icon: string;
    available: boolean;
    reward?: {
        gems?: number;
        landSlot?: number;
    };
    currentLandSlots?: number;
    maxLandSlot?: number;
}

export interface CashShopResponse {
    user: {
        id: string;
        currentLandSlots: number;
        maxLandSlot: number;
    };
    items: CashShopItem[];
}

// Purchase Response Types
export interface GoldPurchaseResponse {
    success: boolean;
    message: string;
    item: {
        key: string;
        name: string;
        description: string;
        priceGold: number;
        icon: string;
    };
    balanceGold: number;
    purchase: {
        id: string;
        userId: string;
        shopType: string;
        itemKey: string;
        quantity: number;
        createdAt: string;
    };
}

export interface GemPurchaseResponse {
    success: boolean;
    message: string;
    item: {
        key: string;
        name: string;
        description: string;
        priceGem: number;
        icon: string;
        reward?: {
            itemType?: string;
            amount?: number;
        };
    };
    balanceGem: number;
    balanceGold: number;
    purchase: {
        id: string;
        userId: string;
        shopType: string;
        itemKey: string;
        quantity: number;
        createdAt: string;
    };
}

export interface CashPurchaseResponse {
    success: boolean;
    message: string;
    item: {
        key: string;
        name: string;
        description: string;
        priceUSD: number;
        icon: string;
        reward?: {
            gems?: number;
            landSlot?: number;
        };
    };
    balanceGem: number;
    purchase: {
        id: string;
        userId: string;
        shopType: string;
        itemKey: string;
        quantity: number;
        createdAt: string;
    };
}

export interface FreeWaterResponse {
    success: boolean;
    message: string;
    item: string;
    amount: number;
    nextClaimAt: string;
}

export interface WaterStatusResponse {
    isReady: boolean;
    nextClaimAt: string;
    lastClaimedAt: string;
}

// Inventory Types
export interface InventoryItem {
    id: string;
    itemType: string;
    amount: number;
    name: string;
    rarity: string;
    category: string;
    icon: string;
    createdAt: string;
    updatedAt: string;
}

export interface InventoryResponse {
    userId: string;
    inventory: InventoryItem[];
    grouped: Record<string, InventoryItem[]>;
    summary: {
        totalItems: number;
        totalTypes: number;
        categories: number;
    };
}

export class ShopService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    private static getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('fam_game_access_token');
    }

    /**
     * Fetches the gold shop catalog
     */
    static async getGoldShop(): Promise<GoldShopResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for gold shop');
            return null;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/shop/gold`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                return await response.json();
            } else {
                console.error("Error fetching gold shop:", response.statusText);
                return null;
            }
        } catch (error) {
            console.error("Network error fetching gold shop:", error);
            return null;
        }
    }

    /**
     * Fetches the gem shop catalog
     */
    static async getGemShop(): Promise<GemShopResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for gem shop');
            return null;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/shop/gem`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                return await response.json();
            } else {
                console.error("Error fetching gem shop:", response.statusText);
                return null;
            }
        } catch (error) {
            console.error("Network error fetching gem shop:", error);
            return null;
        }
    }

    /**
     * Fetches the cash shop catalog
     */
    static async getCashShop(): Promise<CashShopResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for cash shop');
            return null;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/shop/cash`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                return await response.json();
            } else {
                console.error("Error fetching cash shop:", response.statusText);
                return null;
            }
        } catch (error) {
            console.error("Network error fetching cash shop:", error);
            return null;
        }
    }

    /**
     * Purchase an item from the gold shop
     */
    static async purchaseGoldItem(itemKey: string): Promise<GoldPurchaseResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for purchase');
            return null;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/shop/gold/purchase`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ itemKey }),
                }
            );

            if (response.ok) {
                return await response.json();
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error("Error purchasing item:", errorData.message || response.statusText);
                return { success: false, message: errorData.message || 'Purchase failed' } as GoldPurchaseResponse;
            }
        } catch (error) {
            console.error("Network error purchasing item:", error);
            return { success: false, message: 'Not ready to buy' } as GoldPurchaseResponse;
        }
    }

    /**
     * Purchase an item from the gem shop
     */
    static async purchaseGemItem(itemKey: string, quantity: number = 1): Promise<GemPurchaseResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for purchase');
            return null;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/shop/gem/purchase`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ itemKey, quantity }),
                }
            );

            if (response.ok) {
                return await response.json();
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error("Error purchasing gem item:", errorData.message || response.statusText);
                return { success: false, message: errorData.message || 'Purchase failed' } as GemPurchaseResponse;
            }
        } catch (error) {
            console.error("Network error purchasing gem item:", error);
            return { success: false, message: 'Network error' } as GemPurchaseResponse;
        }
    }

    /**
     * Purchase an item from the cash shop
     */
    static async purchaseCashItem(
        itemKey: string,
        paymentId: string,
        paymentProvider: string = 'stripe'
    ): Promise<CashPurchaseResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for purchase');
            return null;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/shop/cash/purchase`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ itemKey, paymentId, paymentProvider }),
                }
            );

            if (response.ok) {
                return await response.json();
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error("Error purchasing cash item:", errorData.message || response.statusText);
                return null;
            }
        } catch (error) {
            console.error("Network error purchasing cash item:", error);
            return null;
        }
    }

    /**
     * Get water count from inventory
     */
    static async getWaterCount(): Promise<number> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for inventory');
            return 0;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/inventory`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: InventoryResponse = await response.json();
                const waterItem = data.inventory.find(item => item.itemType === 'WATER');
                return waterItem?.amount || 0;
            } else {
                console.error("Error fetching inventory:", response.statusText);
                return 0;
            }
        } catch (error) {
            console.error("Network error fetching inventory:", error);
            return 0;
        }
    }

    /**
     * Get free water status
     */
    static async getWaterStatus(): Promise<WaterStatusResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for water status');
            return null;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/shop/water/status`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                return await response.json();
            } else {
                console.error("Error fetching water status:", response.statusText);
                return null;
            }
        } catch (error) {
            console.error("Network error fetching water status:", error);
            return null;
        }
    }

    /**
     * Claim free water from the well
     */
    static async claimFreeWater(): Promise<FreeWaterResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.log('No access token available for claiming water');
            return null;
        }

        try {
            const response = await fetch(
                `${this.API_BASE_URL}/shop/water/free`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                return await response.json();
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error("Error claiming free water:", errorData.message || response.statusText);
                return { success: false, message: errorData.message || 'Failed to claim water', item: '', amount: 0, nextClaimAt: '' };
            }
        } catch (error) {
            console.error("Network error claiming free water:", error);
            return null;
        }
    }

    /**
     * Claim free water via WebSocket (fire-and-forget)
     * Uses the game gateway: ws://localhost:3000/game
     * Emit: 'claim_water', {}
     * Response comes via 'inventory_update' and 'action_success' events
     * @returns true if WebSocket was used, false if not connected
     */
    static claimFreeWaterWS(): boolean {
        const socketService = getSocketService();
        
        if (!socketService.isConnected()) {
            console.log('[ShopService] WebSocket not connected');
            return false;
        }

        console.log('[ShopService] Claiming water via WebSocket');
        socketService.claimWater();
        return true;
    }

    /**
     * Buy land via WebSocket (fire-and-forget)
     * Uses the game gateway: ws://localhost:3000/game
     * Emit: 'buy_land', {}
     * Response comes via 'land_update' and 'action_success' events
     * @returns true if WebSocket was used, false if not connected
     */
    static buyLandWS(): boolean {
        const socketService = getSocketService();
        
        if (!socketService.isConnected()) {
            console.log('[ShopService] WebSocket not connected for buy_land');
            return false;
        }

        console.log('[ShopService] Buying land via WebSocket');
        socketService.buyLand();
        return true;
    }

    /**
     * Buy shop item via WebSocket (fire-and-forget)
     * Uses the game gateway: ws://localhost:3000/game
     * Emit: 'buy_shop_item', { shopType: "GOLD" | "GEM", itemKey: string }
     * Response comes via:
     * - 'action_success' with purchase details
     * - 'currency_update' with new balances
     * - 'inventory_update' if item has rewards (seeds/tools)
     * - 'land_update' if land plot was unlocked (GEM shop)
     * @param shopType - "GOLD" or "GEM"
     * @param itemKey - The item key to purchase
     * @returns true if WebSocket was used, false if not connected
     */
    static buyShopItemWS(shopType: 'GOLD' | 'GEM', itemKey: string): boolean {
        const socketService = getSocketService();
        
        if (!socketService.isConnected()) {
            console.log('[ShopService] WebSocket not connected for buy_shop_item');
            return false;
        }

        console.log(`[ShopService] Buying ${shopType} shop item via WebSocket:`, itemKey);
        socketService.buyShopItem(shopType, itemKey);
        return true;
    }
}
