// src/game/GameDataService.ts
// Service to batch fetch all game data during loading screen
// Supports localStorage caching for instant game loading on subsequent visits

import { UserService } from './UserService';
import { GardenService, GardenResponse } from './GardenService';
import { SeedService, SeedInventoryItem } from './SeedService';
import { FertilizerService, FertilizerInventoryResponse } from './FertilizerService';
import { FruitService } from './FruitService';
import { MissionService, Mission } from './MissionService';
import { QuizService, Quiz } from './QuizService';
import { EventService, GameEvent } from './EventService';
import { StreakService, StreakStatusResponse, StreakHistoryResponse } from './StreakService';
import { ShopService, GoldShopResponse, GemShopResponse, CashShopResponse } from './ShopService';
import { InventoryService, StorageResponse, BackpackResponse, InventoryItem } from './InventoryService';
import { BadgeService, SoulboundToken, ApiBadge } from './BadgeService';
import { PlantType } from './types/GameTypes';
import { GameCache, CACHE_KEYS, CACHE_TTL } from './utils/GameCache';
import { EventBus } from './EventBus';

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
    quizzes: Quiz[] | null;
    events: GameEvent[] | null;
    streak: StreakData;
    shop: ShopData;
    inventory: InventoryData;
    badges: SoulboundToken[];
    allBadges: ApiBadge[];
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
     *
     * Loading strategy:
     * 1. Check localStorage cache first
     * 2. If valid cache exists → return immediately (instant load!)
     * 3. If cache is stale but exists → return cached, trigger background refresh
     * 4. If no cache → fetch from API (normal load)
     *
     * @param onProgress Optional callback for progress updates (0-100)
     * @param forceRefresh Skip cache and always fetch from API
     * @returns Promise<GameData> with all pre-loaded data
     */
    static async fetchAllGameData(
        onProgress?: (progress: number) => void,
        forceRefresh: boolean = false
    ): Promise<GameData> {
        const token = UserService.getAccessToken();

        if (!token) {
            const emptyData: GameData = {
                user: null,
                garden: [],
                seeds: [],
                fertilizers: null,
                fruits: [],
                currencies: { gold: 0, gem: 0 },
                missions: null,
                quizzes: null,
                events: null,
                streak: { status: null, history: null },
                shop: { goldShop: null, gemShop: null, cashShop: null },
                inventory: { storage: null, backpack: null },
                badges: [],
                allBadges: [],
                loadedAt: Date.now()
            };
            cachedGameData = emptyData;
            return emptyData;
        }

        // Check localStorage cache first (unless force refresh)
        if (!forceRefresh) {
            const localCache = GameCache.get<GameData>(CACHE_KEYS.GAME_DATA);
            if (localCache) {
                const cacheAge = GameCache.getAge(CACHE_KEYS.GAME_DATA);

                // Update in-memory cache
                cachedGameData = localCache;
                onProgress?.(100);

                // If cache is stale, trigger background refresh
                if (GameCache.isStale(CACHE_KEYS.GAME_DATA, CACHE_TTL.GAME_DATA)) {
                    this.fetchAndCacheInBackground();
                }

                return localCache;
            }
        } else {
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
            quizzesResult,
            eventsResult,
            streakStatusResult,
            streakHistoryResult,
            goldShopResult,
            gemShopResult,
            cashShopResult,
            storageResult,
            backpackResult,
            badgesResult,
            allBadgesResult
        ] = await Promise.allSettled([
            UserService.getUserProfile(),
            GardenService.getGarden(),
            SeedService.getSeedInventory(),
            FertilizerService.getFertilizerInventory(),
            FruitService.getFruitInventory(),
            FruitService.getCurrencyBalances(),
            MissionService.getMissions(),
            QuizService.getActiveQuizzes(),
            EventService.getActiveEvents(),
            StreakService.getStatus(),
            StreakService.getHistory(7),
            ShopService.getGoldShop(),
            ShopService.getGemShop(),
            ShopService.getCashShop(),
            InventoryService.getStorage(),
            InventoryService.getBackpack(),
            BadgeService.fetchSoulboundTokens(),
            BadgeService.getAllBadges()
        ]);

        onProgress?.(80);

        // Extract results with fallbacks
        // Get stored user data (from login) which contains wallet addresses
        const storedUser = UserService.getStoredUser();
        const profileUser = userResult.status === 'fulfilled' ? userResult.value : null;
        
        // Merge user data: profile data + wallet addresses from login + characterType
        let mergedUser: UserData | null = null;
        if (profileUser) {
            // For characterType: prefer storedUser (from register/login) over profile API
            // because profile API may return default value (1) even if user selected different character
            // Only use profileUser.characterType if storedUser doesn't have one
            const characterType = storedUser?.characterType || profileUser.characterType || 1;
            
            mergedUser = {
                ...profileUser,
                // Preserve wallet addresses from stored user (login response)
                walletAddressSui: profileUser.walletAddressSui || storedUser?.walletAddressSui,
                walletAddressAptos: profileUser.walletAddressAptos || storedUser?.walletAddressAptos,
                walletAddressCardano: profileUser.walletAddressCardano || storedUser?.walletAddressCardano,
                // Use the determined characterType
                characterType,
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
            quizzes: quizzesResult.status === 'fulfilled' ? quizzesResult.value : null,
            events: eventsResult.status === 'fulfilled' ? eventsResult.value : null,
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
            badges: badgesResult.status === 'fulfilled' ? badgesResult.value : [],
            allBadges: allBadgesResult.status === 'fulfilled' ? allBadgesResult.value : [],
            loadedAt: Date.now()
        };

        // Log any failures for debugging
        if (userResult.status === 'rejected') {
        }
        if (gardenResult.status === 'rejected') {
        }
        if (seedsResult.status === 'rejected') {
        }
        if (fertilizersResult.status === 'rejected') {
        }
        if (fruitsResult.status === 'rejected') {
        }
        if (currenciesResult.status === 'rejected') {
        }
        if (missionsResult.status === 'rejected') {
        }
        if (quizzesResult.status === 'rejected') {
        }
        if (eventsResult.status === 'rejected') {
        }
        if (streakStatusResult.status === 'rejected') {
        }
        if (streakHistoryResult.status === 'rejected') {
        }
        if (goldShopResult.status === 'rejected') {
        }
        if (gemShopResult.status === 'rejected') {
        }
        if (cashShopResult.status === 'rejected') {
        }
        if (storageResult.status === 'rejected') {
        }
        if (backpackResult.status === 'rejected') {
        }

        onProgress?.(100);

        // Cache the data in memory
        cachedGameData = gameData;

        // Save to localStorage for next visit
        this.saveToLocalStorage(gameData);

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
     * Clears both in-memory and localStorage cache
     */
    static clearCache(): void {
        cachedGameData = null;
        GameCache.remove(CACHE_KEYS.GAME_DATA);
    }

    // ============================================
    // localStorage caching methods
    // ============================================

    /**
     * Save game data to localStorage
     */
    private static saveToLocalStorage(data: GameData): void {
        const saved = GameCache.set(CACHE_KEYS.GAME_DATA, data, CACHE_TTL.GAME_DATA);
        if (saved) {
        }
    }

    /**
     * Public method to persist current cached data to localStorage
     * Call this after updating cachedData directly (e.g., from WebSocket updates)
     */
    public static persistCache(): void {
        if (cachedGameData) {
            this.saveToLocalStorage(cachedGameData);
        }
    }

    /**
     * Fetch and cache data in background (non-blocking)
     * Used for stale-while-revalidate pattern
     */
    private static async fetchAndCacheInBackground(): Promise<void> {
        try {
            // Fetch fresh data without progress callback
            const freshData = await this.fetchFromAPI();

            // Update caches
            cachedGameData = freshData;
            this.saveToLocalStorage(freshData);

            // Trigger UI update if callback is registered
            this.triggerUIUpdate();
        } catch (error) {
            // Keep using stale cache - don't clear it
        }
    }

    /**
     * Internal method to fetch data from API without cache logic
     */
    private static async fetchFromAPI(): Promise<GameData> {
        // Fetch all data in parallel using Promise.allSettled
        const [
            userResult,
            gardenResult,
            seedsResult,
            fertilizersResult,
            fruitsResult,
            currenciesResult,
            missionsResult,
            quizzesResult,
            eventsResult,
            streakStatusResult,
            streakHistoryResult,
            goldShopResult,
            gemShopResult,
            cashShopResult,
            storageResult,
            backpackResult,
            badgesResult,
            allBadgesResult
        ] = await Promise.allSettled([
            UserService.getUserProfile(),
            GardenService.getGarden(),
            SeedService.getSeedInventory(),
            FertilizerService.getFertilizerInventory(),
            FruitService.getFruitInventory(),
            FruitService.getCurrencyBalances(),
            MissionService.getMissions(),
            QuizService.getActiveQuizzes(),
            EventService.getActiveEvents(),
            StreakService.getStatus(),
            StreakService.getHistory(7),
            ShopService.getGoldShop(),
            ShopService.getGemShop(),
            ShopService.getCashShop(),
            InventoryService.getStorage(),
            InventoryService.getBackpack(),
            BadgeService.fetchSoulboundTokens(),
            BadgeService.getAllBadges()
        ]);

        // Extract results with fallbacks
        const storedUser = UserService.getStoredUser();
        const profileUser = userResult.status === 'fulfilled' ? userResult.value : null;

        let mergedUser: UserData | null = null;
        if (profileUser) {
            const characterType = storedUser?.characterType || profileUser.characterType || 1;
            mergedUser = {
                ...profileUser,
                walletAddressSui: profileUser.walletAddressSui || storedUser?.walletAddressSui,
                walletAddressAptos: profileUser.walletAddressAptos || storedUser?.walletAddressAptos,
                walletAddressCardano: profileUser.walletAddressCardano || storedUser?.walletAddressCardano,
                characterType,
            };
        } else if (storedUser) {
            mergedUser = storedUser;
        }

        return {
            user: mergedUser,
            garden: gardenResult.status === 'fulfilled' ? gardenResult.value : [],
            seeds: seedsResult.status === 'fulfilled' ? seedsResult.value : [],
            fertilizers: fertilizersResult.status === 'fulfilled' ? fertilizersResult.value : null,
            fruits: fruitsResult.status === 'fulfilled' ? fruitsResult.value : [],
            currencies: currenciesResult.status === 'fulfilled'
                ? currenciesResult.value
                : { gold: 0, gem: 0 },
            missions: missionsResult.status === 'fulfilled' ? missionsResult.value : null,
            quizzes: quizzesResult.status === 'fulfilled' ? quizzesResult.value : null,
            events: eventsResult.status === 'fulfilled' ? eventsResult.value : null,
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
            badges: badgesResult.status === 'fulfilled' ? badgesResult.value : [],
            allBadges: allBadgesResult.status === 'fulfilled' ? allBadgesResult.value : [],
            loadedAt: Date.now()
        };
    }

    /**
     * Get cache statistics for debugging
     */
    static getCacheStats(): {
        inMemory: boolean;
        localStorage: boolean;
        age: string;
        isStale: boolean;
        size: string;
    } {
        const stats = GameCache.getStats();
        const gameDataEntry = stats.entries.find(e => e.key === CACHE_KEYS.GAME_DATA);

        return {
            inMemory: cachedGameData !== null,
            localStorage: GameCache.has(CACHE_KEYS.GAME_DATA),
            age: GameCache.formatAge(gameDataEntry?.age ?? null),
            isStale: GameCache.isStale(CACHE_KEYS.GAME_DATA, CACHE_TTL.GAME_DATA),
            size: GameCache.formatSize(gameDataEntry?.size ?? 0)
        };
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

    static async refreshQuizzes(): Promise<Quiz[] | null> {
        const quizzes = await QuizService.getActiveQuizzes();
        if (cachedGameData) {
            cachedGameData.quizzes = quizzes;
        }
        return quizzes;
    }

    static async refreshEvents(): Promise<GameEvent[] | null> {
        const events = await EventService.getActiveEvents();
        if (cachedGameData) {
            cachedGameData.events = events;
        }
        return events;
    }

    static async refreshGoldShop(): Promise<GoldShopResponse | null> {
        const goldShop = await ShopService.getGoldShop();
        if (cachedGameData) {
            cachedGameData.shop.goldShop = goldShop;
        }
        return goldShop;
    }

    /**
     * Update currency balances in all cached locations
     * Ensures Single Source of Truth consistency across User, Currencies, and Shops
     */
    static updateCurrency(gold: number, gem: number): void {
        if (!cachedGameData) return;

        // 1. Update main currencies object
        if (cachedGameData.currencies) {
            cachedGameData.currencies.gold = gold;
            cachedGameData.currencies.gem = gem;
        } else {
            cachedGameData.currencies = { gold, gem };
        }

        // 2. Update user profile
        if (cachedGameData.user) {
            cachedGameData.user.balanceGold = gold;
            cachedGameData.user.balanceGem = gem;
            cachedGameData.user.gold = gold; // Some parts might use this
            cachedGameData.user.gem = gem;   // Some parts might use this
        }

        // 3. Update shop snapshots to prevent stale data in modals
        if (cachedGameData.shop) {
            if (cachedGameData.shop.gemShop?.user) {
                cachedGameData.shop.gemShop.user.balanceGem = gem;
            }
            if (cachedGameData.shop.goldShop?.user) {
                cachedGameData.shop.goldShop.user.balanceGold = gold;
            }
        }

        // Persist to local storage
        this.persistCache();
        
        // Notify UI listeners
        this.notifyDataUpdated();
    }

    /**
     * Refresh only the Gem Shop data
     * Call this after a purchase to update availability
     */
    static async refreshGemShop(): Promise<GemShopResponse | null> {
        const gemShop = await ShopService.getGemShop();
        if (cachedGameData && gemShop) {
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
        if (storage && storage.storage) {
            storage.storage = storage.storage.filter(item => !['GOLD', 'GEM', 'RUBY'].includes(item.itemType));
        }
        if (cachedGameData) {
            cachedGameData.inventory.storage = storage;
        }
        return storage;
    }

    static async refreshBackpack(): Promise<BackpackResponse | null> {
        const backpack = await InventoryService.getBackpack();
        if (backpack && backpack.backpack) {
            backpack.backpack = backpack.backpack.filter(item => !['GOLD', 'GEM', 'RUBY'].includes(item.itemType));
        }
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
        
        const IGNORED_ITEMS = ['GOLD', 'GEM', 'RUBY'];
        
        if (storage && storage.storage) {
            storage.storage = storage.storage.filter(item => !IGNORED_ITEMS.includes(item.itemType));
        }
        
        if (backpack && backpack.backpack) {
            backpack.backpack = backpack.backpack.filter(item => !IGNORED_ITEMS.includes(item.itemType));
        }

        const inventoryData: InventoryData = { storage, backpack };
        if (cachedGameData) {
            cachedGameData.inventory = inventoryData;
        }
        return inventoryData;
    }

    static async refreshBadges(): Promise<{ badges: SoulboundToken[]; allBadges: ApiBadge[] }> {
        const [badges, allBadges] = await Promise.all([
            BadgeService.fetchSoulboundTokens(),
            BadgeService.getAllBadges()
        ]);
        if (cachedGameData) {
            cachedGameData.badges = badges;
            cachedGameData.allBadges = allBadges;
        }
        return { badges, allBadges };
    }

    static async refreshAllBadges(): Promise<ApiBadge[]> {
        const allBadges = await BadgeService.getAllBadges();
        if (cachedGameData) {
            cachedGameData.allBadges = allBadges;
        }
        return allBadges;
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
            this.refreshFruits(),
            this.refreshGemShop() // Refresh gem shop to update land availability
        ]);
        // Update localStorage cache with refreshed data
        if (cachedGameData) {
            this.saveToLocalStorage(cachedGameData);
        }
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
        // Update localStorage cache with refreshed data
        if (cachedGameData) {
            this.saveToLocalStorage(cachedGameData);
        }
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
     * Public method to trigger UI update
     * Call this when data has been modified externally (e.g. via WebSocket)
     */
    static notifyDataUpdated(): void {
        this.triggerUIUpdate();
    }

    /**
     * Trigger UI update callback if registered
     */
    private static triggerUIUpdate(): void {
        if (this.uiUpdateCallback) {
            this.uiUpdateCallback();
        }
        // Always emit EventBus event for any listeners (backup mechanism)
        EventBus.emit('gamedata:updated');
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

    // ============================================
    // WebSocket-based cache updates
    // ============================================

    /**
     * Update storage cache from WebSocket inventory_update payload
     * Called when receiving inventory_update event from server
     * @param items Array of inventory items from WebSocket
     */
    static updateStorageCacheFromSocket(items: Array<{ itemType: string; amount: number; location?: string }>): void {
        if (!cachedGameData?.inventory?.storage) {
            // Initialize storage if not exists
            if (cachedGameData) {
                cachedGameData.inventory = cachedGameData.inventory || { storage: null, backpack: null };
                cachedGameData.inventory.storage = {
                    userId: '',
                    storage: [],
                    summary: { totalItems: 0, totalTypes: 0, categories: 0 }
                };
            }
        }

        if (!cachedGameData?.inventory?.storage?.storage) return;

        const storage = cachedGameData.inventory.storage.storage;
        const IGNORED_ITEMS = ['GOLD', 'GEM', 'RUBY'];

        // Update each item in the cache
        items.forEach(item => {
            // Filter out currency items
            if (IGNORED_ITEMS.includes(item.itemType)) return;

            // Only update STORAGE items (or items without location specified)
            if (item.location && item.location !== 'STORAGE') return;

            const existingIndex = storage.findIndex(s => s.itemType === item.itemType);

            if (item.amount <= 0) {
                // Remove item if amount is 0 or negative
                if (existingIndex >= 0) {
                    storage.splice(existingIndex, 1);
                }
            } else if (existingIndex >= 0) {
                // Update existing item
                storage[existingIndex].amount = item.amount;
            } else {
                // Add new item
                storage.push({
                    id: `ws-${Date.now()}-${item.itemType}`,
                    itemType: item.itemType,
                    amount: item.amount,
                    location: 'STORAGE',
                    name: item.itemType,
                    rarity: 'common',
                    category: 'item',
                    icon: ''
                });
            }
        });

        // Update summary
        if (cachedGameData.inventory.storage.summary) {
            cachedGameData.inventory.storage.summary.totalItems = storage.reduce((sum, item) => sum + item.amount, 0);
            cachedGameData.inventory.storage.summary.totalTypes = storage.length;
        }

        this.notifyDataUpdated();
    }

    /**
     * Update backpack cache from WebSocket inventory_update payload
     * Called when receiving inventory_update event from server
     * @param items Array of inventory items from WebSocket
     */
    static updateBackpackCacheFromSocket(items: Array<{ itemType: string; amount: number; location?: string }>): void {
        if (!cachedGameData?.inventory?.backpack) {
            // Initialize backpack if not exists
            if (cachedGameData) {
                cachedGameData.inventory = cachedGameData.inventory || { storage: null, backpack: null };
                cachedGameData.inventory.backpack = {
                    userId: '',
                    backpack: [],
                    capacity: { total: 100, used: 0, max: 100, available: 100 }
                };
            }
        }

        if (!cachedGameData?.inventory?.backpack?.backpack) return;

        const backpack = cachedGameData.inventory.backpack.backpack;
        const IGNORED_ITEMS = ['GOLD', 'GEM', 'RUBY'];

        // Update each item in the cache
        items.forEach(item => {
            // Filter out currency items
            if (IGNORED_ITEMS.includes(item.itemType)) return;

            // Only update BACKPACK items (or items without location specified)
            if (item.location && item.location !== 'BACKPACK') return;

            const existingIndex = backpack.findIndex(b => b.itemType === item.itemType);

            if (item.amount <= 0) {
                // Remove item if amount is 0 or negative
                if (existingIndex >= 0) {
                    backpack.splice(existingIndex, 1);
                }
            } else if (existingIndex >= 0) {
                // Update existing item
                backpack[existingIndex].amount = item.amount;
            } else {
                // Add new item
                backpack.push({
                    id: `ws-${Date.now()}-${item.itemType}`,
                    itemType: item.itemType,
                    amount: item.amount,
                    location: 'BACKPACK',
                    name: item.itemType,
                    rarity: 'common',
                    category: 'item',
                    icon: ''
                });
            }
        });

        // Update capacity
        if (cachedGameData.inventory.backpack.capacity) {
            const totalUsed = backpack.reduce((sum, item) => sum + item.amount, 0);
            const maxCapacity = cachedGameData.inventory.backpack.capacity.max ?? cachedGameData.inventory.backpack.capacity.total;
            cachedGameData.inventory.backpack.capacity.used = totalUsed;
            cachedGameData.inventory.backpack.capacity.available = maxCapacity - totalUsed;
        }

        this.notifyDataUpdated();
    }
}
