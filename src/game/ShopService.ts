// src/game/ShopService.ts

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
    reward?: {
        itemType?: string;
        amount?: number;
        effect?: string;
        gold?: number;
    };
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
                return null;
            }
        } catch (error) {
            console.error("Network error purchasing item:", error);
            return null;
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
                return null;
            }
        } catch (error) {
            console.error("Network error purchasing gem item:", error);
            return null;
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
}
