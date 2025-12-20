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
import { PlantType } from './types/GameTypes';

// Types for pre-loaded data
export interface UserData {
    id: string;
    address: string;
    username: string | null;
    avatar: string | null;
    xp: number;
    reputationScore: number;
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
            cashShopResult
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
            ShopService.getCashShop()
        ]);

        onProgress?.(80);

        // Extract results with fallbacks
        const gameData: GameData = {
            user: userResult.status === 'fulfilled' ? userResult.value : null,
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
            cashShopItems: gameData.shop.cashShop?.items?.length ?? 0
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
            this.refreshFruits()
        ]);
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
