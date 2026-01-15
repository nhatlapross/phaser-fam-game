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
    priceUSD: number | null;  // null when price is not available
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
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetches the gem shop catalog
     */
    static async getGemShop(): Promise<GemShopResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
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
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetches the cash shop catalog
     */
    static async getCashShop(): Promise<CashShopResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
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
                const data = await response.json();
                
                // Transform items to match CashShopItem interface
                // API returns: { price: 0, currency: null, limitConfig: { priceUSD: 5 } }
                // We need: { priceUSD: 5 }
                if (data.items) {
                    data.items = data.items.map((item: any) => ({
                        key: item.key,
                        name: item.name,
                        description: item.description,
                        // Get priceUSD from limitConfig, fallback to price, or null if not available
                        priceUSD: item.limitConfig?.priceUSD ?? (item.currency && item.price ? item.price : null),
                        icon: item.icon || '',
                        // Item is available only if it has a valid price
                        available: item.available && (item.limitConfig?.priceUSD != null || (item.currency && item.price > 0)),
                        reward: item.rewardConfig,
                        currentLandSlots: data.user?.currentLandSlots,
                        maxLandSlot: data.user?.maxLandSlot,
                    }));
                }
                
                return data;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Purchase an item from the gold shop
     */
    static async purchaseGoldItem(itemKey: string): Promise<GoldPurchaseResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
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
                return { success: false, message: errorData.message || 'Purchase failed' } as GoldPurchaseResponse;
            }
        } catch (error) {
            return { success: false, message: 'Not ready to buy' } as GoldPurchaseResponse;
        }
    }

    /**
     * Purchase an item from the gem shop
     */
    static async purchaseGemItem(itemKey: string, quantity: number = 1): Promise<GemPurchaseResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
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
                return { success: false, message: errorData.message || 'Purchase failed' } as GemPurchaseResponse;
            }
        } catch (error) {
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
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Get water count from inventory
     */
    static async getWaterCount(): Promise<number> {
        const token = this.getAccessToken();
        if (!token) {
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
                return 0;
            }
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get free water status
     */
    static async getWaterStatus(): Promise<WaterStatusResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
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
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Claim free water from the well
     */
    static async claimFreeWater(): Promise<FreeWaterResponse | null> {
        const token = this.getAccessToken();
        if (!token) {
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
                return { success: false, message: errorData.message || 'Failed to claim water', item: '', amount: 0, nextClaimAt: '' };
            }
        } catch (error) {
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
            return false;
        }

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
            return false;
        }

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
            return false;
        }

        socketService.buyShopItem(shopType, itemKey);
        return true;
    }
}
