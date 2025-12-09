// src/game/GameDataService.ts
// Service to batch fetch all game data during loading screen

import { UserService } from './UserService';
import { GardenService, GardenResponse } from './GardenService';
import { SeedService, SeedInventoryItem } from './SeedService';
import { FertilizerService, FertilizerInventoryResponse } from './FertilizerService';
import { FruitService } from './FruitService';
import { MissionService, Mission } from './MissionService';
import { StreakService, StreakStatusResponse, StreakHistoryResponse } from './StreakService';
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
    balanceRuby?: number;
}

export interface CurrencyBalances {
    gold: number;
    ruby: number;
}

export interface FruitInventoryItem {
    type: PlantType;
    count: number;
}

export interface StreakData {
    status: StreakStatusResponse | null;
    history: StreakHistoryResponse | null;
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
                currencies: { gold: 0, ruby: 0 },
                missions: null,
                streak: { status: null, history: null },
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
            streakHistoryResult
        ] = await Promise.allSettled([
            UserService.getUserProfile(),
            GardenService.getGarden(),
            SeedService.getSeedInventory(),
            FertilizerService.getFertilizerInventory(),
            FruitService.getFruitInventory(),
            FruitService.getCurrencyBalances(),
            MissionService.getMissions(),
            StreakService.getStatus(),
            StreakService.getHistory(7)
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
                : { gold: 0, ruby: 0 },
            missions: missionsResult.status === 'fulfilled' ? missionsResult.value : null,
            streak: {
                status: streakStatusResult.status === 'fulfilled' ? streakStatusResult.value : null,
                history: streakHistoryResult.status === 'fulfilled' ? streakHistoryResult.value : null
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
            ruby: gameData.currencies.ruby,
            missions: gameData.missions?.length ?? 0,
            streakStatus: gameData.streak.status ? 'loaded' : 'null',
            streakHistory: gameData.streak.history?.checkins?.length ?? 0
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
}
