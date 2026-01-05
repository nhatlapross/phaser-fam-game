// src/game/GameDataService.ts
// Service to batch fetch all game data during loading screen

import { UserService } from './UserService';
import { GardenService, GardenResponse } from './GardenService';
import { SeedService, SeedInventoryItem } from './SeedService';
import { FertilizerService, FertilizerInventoryResponse } from './FertilizerService';
import { FruitService } from './FruitService';
import { MissionService, Mission } from './MissionService';
import { StreakService, StreakStatusResponse, StreakHistoryResponse } from './StreakService';
import { ShopService, GoldShopResponse, GemShopResponse, CashShopResponse } from './ShopService';
import { InventoryService, StorageResponse, BackpackResponse } from './InventoryService';
import { PlantType } from './types/GameTypes';

// Types for pre-loaded data
export interface UserData {
    id: string;
    address: string;
    walletAddress?: string;
    walletAddressSui?: string;
    walletAddressAptos?: string;
    walletAddressCardano?: string;
    username: string | null;
    avatar: string | null;
    characterType: number; // 1-5, maps to character index 0-4
    xp: number;
    reputationScore: number;
    gold?: number;
    gem?: number;
    landsCount: number;
    plantsCount: number;
    network: string;
    balanceGold?: number;
    balanceGem?: number;
}

export interface CurrencyBalances {
    gold: number;
    gem: number;
}

export interface FruitInventoryItem {
    type: PlantType;
    count: number;
}

export interface StreakData {
    status: StreakStatusResponse | null;
    history: StreakHistoryResponse | null;
}

export interface ShopData {
    goldShop: GoldShopResponse | null;
    gemShop: GemShopResponse | null;
    cashShop: CashShopResponse | null;
}

export interface InventoryData {
    storage: StorageResponse | null;
    backpack: BackpackResponse | null;
}

export interface GameData {
    user: UserData | null;
    garden: GardenResponse;
    seeds: SeedInventoryItem[];
    fertilizers: FertilizerInventoryResponse | null;
    fruits: FruitInventoryItem[];
    currencies: CurrencyBalances;
    missions: Mission[] | null;
    streak: StreakData;
    shop: ShopData;
    inventory: InventoryData;
    loadedAt: number;
}

// Singleton storage for pre-loaded data
let cachedGameData: GameData | null = null;

export class GameDataService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    /**
     * Batch fetch all game data in parallel
     * Call this during loading screen before entering the game
     * @param onProgress Optional callback for progress updates (0-100)
     * @returns Promise<GameData> with all pre-loaded data
     */
    static async fetchAllGameData(onProgress?: (progress: number) => void): Promise<GameData> {
        const token = UserService.getAccessToken();

        if (!token) {
            console.log('No access token, returning empty game data');
            const emptyData: GameData = {
                user: null,
                garden: [],
                seeds: [],
                fertilizers: null,
                fruits: [],
                currencies: { gold: 0, gem: 0 },
                missions: null,
                streak: { status: null, history: null },
                shop: { goldShop: null, gemShop: null, cashShop: null },
                inventory: { storage: null, backpack: null },
                loadedAt: Date.now()
            };
            cachedGameData = emptyData;
            return emptyData;
        }

        onProgress?.(10);

        // Fetch all data in parallel using Promise.allSettled
        // This ensures all requests complete even if some fail
        const [
            userResult,
            gardenResult,
            seedsResult,
            fertilizersResult,
            fruitsResult,
            currenciesResult,
            missionsResult,
            streakStatusResult,
            streakHistoryResult,
            goldShopResult,
            gemShopResult,
            cashShopResult,
            storageResult,
            backpackResult
        ] = await Promise.allSettled([
            UserService.getUserProfile(),
            GardenService.getGarden(),
            SeedService.getSeedInventory(),
            FertilizerService.getFertilizerInventory(),
            FruitService.getFruitInventory(),
            FruitService.getCurrencyBalances(),
            MissionService.getMissions(),
            StreakService.getStatus(),
            StreakService.getHistory(7),
            ShopService.getGoldShop(),
            ShopService.getGemShop(),
            ShopService.getCashShop(),
            InventoryService.getStorage(),
            InventoryService.getBackpack()
        ]);

        onProgress?.(80);

        // Extract results with fallbacks
        // Get stored user data (from login) which contains wallet addresses
        const storedUser = UserService.getStoredUser();
        const profileUser = userResult.status === 'fulfilled' ? userResult.value : null;
        
        // Merge user data: profile data + wallet addresses from login
        let mergedUser: UserData | null = null;
        if (profileUser) {
            mergedUser = {
                ...profileUser,
                // Preserve wallet addresses from stored user (login response)
                walletAddressSui: profileUser.walletAddressSui || storedUser?.walletAddressSui,
                walletAddressAptos: profileUser.walletAddressAptos || storedUser?.walletAddressAptos,
                walletAddressCardano: profileUser.walletAddressCardano || storedUser?.walletAddressCardano,
            };
        } else if (storedUser) {
            mergedUser = storedUser;
        }

        const gameData: GameData = {
            user: mergedUser,
            garden: gardenResult.status === 'fulfilled' ? gardenResult.value : [],
            seeds: seedsResult.status === 'fulfilled' ? seedsResult.value : [],
            fertilizers: fertilizersResult.status === 'fulfilled' ? fertilizersResult.value : null,
            fruits: fruitsResult.status === 'fulfilled' ? fruitsResult.value : [],
            currencies: currenciesResult.status === 'fulfilled'
                ? currenciesResult.value
                : { gold: 0, gem: 0 },
            missions: missionsResult.status === 'fulfilled' ? missionsResult.value : null,
            streak: {
                status: streakStatusResult.status === 'fulfilled' ? streakStatusResult.value : null,
                history: streakHistoryResult.status === 'fulfilled' ? streakHistoryResult.value : null
            },
            shop: {
                goldShop: goldShopResult.status === 'fulfilled' ? goldShopResult.value : null,
                gemShop: gemShopResult.status === 'fulfilled' ? gemShopResult.value : null,
                cashShop: cashShopResult.status === 'fulfilled' ? cashShopResult.value : null
            },
            inventory: {
                storage: storageResult.status === 'fulfilled' ? storageResult.value : null,
                backpack: backpackResult.status === 'fulfilled' ? backpackResult.value : null
            },
            loadedAt: Date.now()
        };

        // Log any failures for debugging
        if (userResult.status === 'rejected') {
            console.error('Failed to fetch user profile:', userResult.reason);
        }
        if (gardenResult.status === 'rejected') {
            console.error('Failed to fetch garden:', gardenResult.reason);
        }
        if (seedsResult.status === 'rejected') {
            console.error('Failed to fetch seeds:', seedsResult.reason);
        }
        if (fertilizersResult.status === 'rejected') {
            console.error('Failed to fetch fertilizers:', fertilizersResult.reason);
        }
        if (fruitsResult.status === 'rejected') {
            console.error('Failed to fetch fruits:', fruitsResult.reason);
        }
        if (currenciesResult.status === 'rejected') {
            console.error('Failed to fetch currencies:', currenciesResult.reason);
        }
        if (missionsResult.status === 'rejected') {
            console.error('Failed to fetch missions:', missionsResult.reason);
        }
        if (streakStatusResult.status === 'rejected') {
            console.error('Failed to fetch streak status:', streakStatusResult.reason);
        }
        if (streakHistoryResult.status === 'rejected') {
            console.error('Failed to fetch streak history:', streakHistoryResult.reason);
        }
        if (goldShopResult.status === 'rejected') {
            console.error('Failed to fetch gold shop:', goldShopResult.reason);
        }
        if (gemShopResult.status === 'rejected') {
            console.error('Failed to fetch gem shop:', gemShopResult.reason);
        }
        if (cashShopResult.status === 'rejected') {
            console.error('Failed to fetch cash shop:', cashShopResult.reason);
        }
        if (storageResult.status === 'rejected') {
            console.error('Failed to fetch storage:', storageResult.reason);
        }
        if (backpackResult.status === 'rejected') {
            console.error('Failed to fetch backpack:', backpackResult.reason);
        }

        onProgress?.(100);

        // Cache the data
        cachedGameData = gameData;

        console.log('All game data loaded:', {
            user: gameData.user?.username,
            gardenPlots: gameData.garden.length,
            seedTypes: gameData.seeds.length,
            fertilizerTypes: gameData.fertilizers?.fertilizers?.length ?? 0,
            fruitSlots: gameData.fruits.length,
            gold: gameData.currencies.gold,
            gem: gameData.currencies.gem,
            missions: gameData.missions?.length ?? 0,
            streakStatus: gameData.streak.status ? 'loaded' : 'null',
            streakHistory: gameData.streak.history?.checkins?.length ?? 0,
            goldShopItems: gameData.shop.goldShop?.items?.length ?? 0,
            gemShopItems: gameData.shop.gemShop?.items?.length ?? 0,
            cashShopItems: gameData.shop.cashShop?.items?.length ?? 0,
            storageItems: gameData.inventory.storage?.storage?.length ?? 0,
            backpackItems: gameData.inventory.backpack?.backpack?.length ?? 0
        });

        return gameData;
    }

    /**
     * Get cached game data
     * Returns null if data hasn't been fetched yet
     */
    static getCachedData(): GameData | null {
        return cachedGameData;
    }

    /**
     * Check if cached data is still fresh (within maxAge milliseconds)
     * @param maxAge Maximum age in milliseconds (default: 5 minutes)
     */
    static isCacheValid(maxAge: number = 5 * 60 * 1000): boolean {
        if (!cachedGameData) return false;
        return Date.now() - cachedGameData.loadedAt < maxAge;
    }

    /**
     * Clear cached data (call when logging out or switching accounts)
     */
    static clearCache(): void {
        cachedGameData = null;
    }

    /**
     * Refresh specific parts of the cache
     * Useful when you know only certain data has changed
     */
    static async refreshUserProfile(): Promise<UserData | null> {
        const user = await UserService.getUserProfile();
        if (cachedGameData) {
            cachedGameData.user = user;
        }
        return user;
    }

    static async refreshGarden(): Promise<GardenResponse> {
        const garden = await GardenService.getGarden();
        if (cachedGameData) {
            cachedGameData.garden = garden;
        }
        return garden;
    }

    static async refreshSeeds(): Promise<SeedInventoryItem[]> {
        const seeds = await SeedService.getSeedInventory();
        if (cachedGameData) {
            cachedGameData.seeds = seeds;
        }
        return seeds;
    }

    static async refreshFertilizers(): Promise<FertilizerInventoryResponse | null> {
        const fertilizers = await FertilizerService.getFertilizerInventory();
        if (cachedGameData) {
            cachedGameData.fertilizers = fertilizers;
        }
        return fertilizers;
    }

    static async refreshFruits(): Promise<FruitInventoryItem[]> {
        const fruits = await FruitService.getFruitInventory();
        if (cachedGameData) {
            cachedGameData.fruits = fruits;
        }
        return fruits;
    }

    static async refreshCurrencies(): Promise<CurrencyBalances> {
        const currencies = await FruitService.getCurrencyBalances();
        if (cachedGameData) {
            cachedGameData.currencies = currencies;
        }
        return currencies;
    }

    static async refreshMissions(): Promise<Mission[] | null> {
        const missions = await MissionService.getMissions();
        if (cachedGameData) {
            cachedGameData.missions = missions;
        }
        return missions;
    }

    static async refreshGoldShop(): Promise<GoldShopResponse | null> {
        const goldShop = await ShopService.getGoldShop();
        if (cachedGameData) {
            cachedGameData.shop.goldShop = goldShop;
        }
        return goldShop;
    }

    static async refreshGemShop(): Promise<GemShopResponse | null> {
        const gemShop = await ShopService.getGemShop();
        if (cachedGameData) {
            cachedGameData.shop.gemShop = gemShop;
        }
        return gemShop;
    }

    static async refreshCashShop(): Promise<CashShopResponse | null> {
        const cashShop = await ShopService.getCashShop();
        if (cachedGameData) {
            cachedGameData.shop.cashShop = cashShop;
        }
        return cashShop;
    }

    static async refreshAllShops(): Promise<ShopData> {
        const [goldShop, gemShop, cashShop] = await Promise.all([
            ShopService.getGoldShop(),
            ShopService.getGemShop(),
            ShopService.getCashShop()
        ]);
        const shopData: ShopData = { goldShop, gemShop, cashShop };
        if (cachedGameData) {
            cachedGameData.shop = shopData;
        }
        return shopData;
    }

    static async refreshStreak(): Promise<StreakData> {
        const [status, history] = await Promise.all([
            StreakService.getStatus(),
            StreakService.getHistory(7)
        ]);
        const streakData: StreakData = { status, history };
        if (cachedGameData) {
            cachedGameData.streak = streakData;
        }
        return streakData;
    }

    static async refreshStorage(): Promise<StorageResponse | null> {
        const storage = await InventoryService.getStorage();
        if (cachedGameData) {
            cachedGameData.inventory.storage = storage;
        }
        return storage;
    }

    static async refreshBackpack(): Promise<BackpackResponse | null> {
        const backpack = await InventoryService.getBackpack();
        if (cachedGameData) {
            cachedGameData.inventory.backpack = backpack;
        }
        return backpack;
    }

    static async refreshWarehouseInventory(): Promise<InventoryData> {
        const [storage, backpack] = await Promise.all([
            InventoryService.getStorage(),
            InventoryService.getBackpack()
        ]);
        const inventoryData: InventoryData = { storage, backpack };
        if (cachedGameData) {
            cachedGameData.inventory = inventoryData;
        }
        return inventoryData;
    }

    // ============================================
    // Optimistic cache updates (instant UI feedback)
    // ============================================

    /**
     * Optimistically remove item from backpack cache (before API call)
     * Used for instant UI updates when moving items to warehouse
     */
    static removeFromBackpackCache(itemType: string, amount: number): void {
        if (!cachedGameData?.inventory?.backpack?.backpack) return;

        const backpack = cachedGameData.inventory.backpack.backpack;
        const itemIndex = backpack.findIndex(item => item.itemType === itemType);

        if (itemIndex >= 0) {
            const item = backpack[itemIndex];
            if (item.amount <= amount) {
                // Remove item entirely
                backpack.splice(itemIndex, 1);
            } else {
                // Decrease amount
                item.amount -= amount;
            }
            // Update capacity
            if (cachedGameData.inventory.backpack.capacity) {
                cachedGameData.inventory.backpack.capacity.used -= amount;
                cachedGameData.inventory.backpack.capacity.available += amount;
            }
        }
    }

    /**
     * Optimistically remove item from storage cache (before API call)
     * Used for instant UI updates when moving items to backpack
     */
    static removeFromStorageCache(itemType: string, amount: number): void {
        if (!cachedGameData?.inventory?.storage?.storage) return;

        const storage = cachedGameData.inventory.storage.storage;
        const itemIndex = storage.findIndex(item => item.itemType === itemType);

        if (itemIndex >= 0) {
            const item = storage[itemIndex];
            if (item.amount <= amount) {
                // Remove item entirely
                storage.splice(itemIndex, 1);
            } else {
                // Decrease amount
                item.amount -= amount;
            }
            // Update summary
            if (cachedGameData.inventory.storage.summary) {
                cachedGameData.inventory.storage.summary.totalItems -= amount;
                if (storage[itemIndex]?.amount === 0 || !storage.find(i => i.itemType === itemType)) {
                    cachedGameData.inventory.storage.summary.totalTypes -= 1;
                }
            }
        }
    }

    /**
     * Optimistically add item to backpack cache (before API call)
     * Used for instant UI updates when moving items from warehouse to chest
     */
    static addToBackpackCache(itemType: string, amount: number): void {
        if (!cachedGameData?.inventory?.backpack) return;

        // Initialize backpack array if needed
        if (!cachedGameData.inventory.backpack.backpack) {
            cachedGameData.inventory.backpack.backpack = [];
        }

        const backpack = cachedGameData.inventory.backpack.backpack;
        const existingItem = backpack.find(item => item.itemType === itemType);

        if (existingItem) {
            // Increase existing item amount
            existingItem.amount += amount;
        } else {
            // Add new item to backpack
            backpack.push({
                id: `temp-${Date.now()}`,
                itemType: itemType,
                amount: amount,
                location: 'BACKPACK',
                name: itemType,
                rarity: 'common',
                category: 'item',
                icon: ''
            });
        }

        // Update capacity
        if (cachedGameData.inventory.backpack.capacity) {
            cachedGameData.inventory.backpack.capacity.used += amount;
            cachedGameData.inventory.backpack.capacity.available -= amount;
        }
    }

    /**
     * Optimistically add item to storage cache (before API call)
     * Used for instant UI updates when moving items from chest to warehouse
     */
    static addToStorageCache(itemType: string, amount: number): void {
        if (!cachedGameData?.inventory?.storage) return;

        // Initialize storage array if needed
        if (!cachedGameData.inventory.storage.storage) {
            cachedGameData.inventory.storage.storage = [];
        }

        const storage = cachedGameData.inventory.storage.storage;
        const existingItem = storage.find(item => item.itemType === itemType);

        if (existingItem) {
            // Increase existing item amount
            existingItem.amount += amount;
        } else {
            // Add new item to storage
            storage.push({
                id: `temp-${Date.now()}`,
                itemType: itemType,
                amount: amount,
                location: 'STORAGE',
                name: itemType,
                rarity: 'common',
                category: 'item',
                icon: ''
            });
            // Update types count
            if (cachedGameData.inventory.storage.summary) {
                cachedGameData.inventory.storage.summary.totalTypes += 1;
            }
        }

        // Update summary
        if (cachedGameData.inventory.storage.summary) {
            cachedGameData.inventory.storage.summary.totalItems += amount;
        }
    }

    // ============================================
    // Convenience methods for common refresh patterns
    // ============================================

    /**
     * Refresh inventory data (seeds, fertilizers, fruits)
     * Use after: planting, using fertilizer, harvesting
     */
    static async refreshInventory(): Promise<void> {
        await Promise.all([
            this.refreshSeeds(),
            this.refreshFertilizers(),
            this.refreshFruits()
        ]);
    }

    /**
     * Refresh profile and currencies
     * Use after: check-in, shop purchase, rewards
     */
    static async refreshProfileAndCurrencies(): Promise<void> {
        await Promise.all([
            this.refreshUserProfile(),
            this.refreshCurrencies()
        ]);
    }

    /**
     * Refresh all data commonly changed after an action
     * Use after: check-in, shop purchase, factory exchange
     */
    static async refreshAfterAction(): Promise<void> {
        await Promise.all([
            this.refreshUserProfile(),
            this.refreshCurrencies(),
            this.refreshSeeds(),
            this.refreshFertilizers(),
            this.refreshFruits()
        ]);
    }

    /**
     * Refresh garden data
     * Use after: planting, watering, harvesting, fertilizing
     */
    static async refreshAfterGardenAction(): Promise<void> {
        await Promise.all([
            this.refreshGarden(),
            this.refreshSeeds(),
            this.refreshFertilizers(),
            this.refreshFruits(),
            this.refreshStorage()
        ]);
        this.triggerUIUpdate();
    }

    // ============================================
    // Event-based UI update system
    // ============================================

    private static uiUpdateCallback: (() => void) | null = null;

    /**
     * Register a callback to be called after any refresh
     * FarmingGame should call this to auto-update UI
     */
    static setUIUpdateCallback(callback: () => void): void {
        this.uiUpdateCallback = callback;
    }

    /**
     * Clear the UI update callback
     */
    static clearUIUpdateCallback(): void {
        this.uiUpdateCallback = null;
    }

    /**
     * Trigger UI update callback if registered
     */
    private static triggerUIUpdate(): void {
        if (this.uiUpdateCallback) {
            this.uiUpdateCallback();
        }
    }

    /**
     * Refresh after action and trigger UI update
     * This is the main method managers should call
     */
    static async refreshAndUpdateUI(): Promise<void> {
        await this.refreshAfterAction();
        this.triggerUIUpdate();
    }

    /**
     * Refresh profile/currencies and trigger UI update
     */
    static async refreshProfileAndUpdateUI(): Promise<void> {
        await this.refreshProfileAndCurrencies();
        this.triggerUIUpdate();
    }

    /**
     * Refresh inventory and trigger UI update
     */
    static async refreshInventoryAndUpdateUI(): Promise<void> {
        await this.refreshInventory();
        this.triggerUIUpdate();
    }
}
