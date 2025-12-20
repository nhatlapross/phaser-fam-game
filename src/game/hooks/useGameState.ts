// src/game/hooks/useGameState.ts
// Centralized game state management using phaser-hooks
// This is the SINGLE SOURCE OF TRUTH for all game data

import { withGlobalState, type HookState } from 'phaser-hooks';
import { PlantType } from '../types/GameTypes';

// ============================================
// State Types
// ============================================

export interface CurrencyState {
    gold: number;
    gem: number;
}

export interface SeedInventory {
    algae: number;
    mushroom: number;
    tree: number;
}

export interface FertilizerInventory {
    common: number;
    rare: number;
    epic: number;
    legendary: number;
}

export interface FruitSlot {
    type: PlantType;
    count: number;
}

export interface UserProfile {
    id: string;
    address: string;
    username: string | null;
    avatar: string | null;
    xp: number;
    reputationScore: number;
    landsCount: number;
    plantsCount: number;
}

export interface GameState {
    // Currency
    currency: CurrencyState;

    // Inventory
    seeds: SeedInventory;
    fertilizers: FertilizerInventory;
    fruits: FruitSlot[];
    waterCount: number;

    // User
    user: UserProfile | null;

    // Meta
    isInitialized: boolean;
    lastUpdated: number;
}

// ============================================
// Initial State
// ============================================

const initialGameState: GameState = {
    currency: {
        gold: 0,
        gem: 0,
    },
    seeds: {
        algae: 0,
        mushroom: 0,
        tree: 0,
    },
    fertilizers: {
        common: 0,
        rare: 0,
        epic: 0,
        legendary: 0,
    },
    fruits: [],
    waterCount: 0,
    user: null,
    isInitialized: false,
    lastUpdated: Date.now(),
};

// ============================================
// Custom Hook Type
// ============================================

export type GameStateHook = HookState<GameState> & {
    // Currency methods
    getGold: () => number;
    getGem: () => number;
    setGold: (amount: number) => void;
    setGem: (amount: number) => void;
    addGold: (amount: number) => void;
    addGem: (amount: number) => void;
    spendGold: (amount: number) => boolean;
    spendGem: (amount: number) => boolean;
    setCurrency: (gold: number, gem: number) => void;

    // Seed methods
    getSeeds: () => SeedInventory;
    getSeedCount: (type: PlantType) => number;
    setSeeds: (seeds: SeedInventory) => void;
    addSeed: (type: PlantType, count?: number) => void;
    useSeed: (type: PlantType) => boolean;

    // Fertilizer methods
    getFertilizers: () => FertilizerInventory;
    getFertilizerCount: (type: keyof FertilizerInventory) => number;
    setFertilizers: (fertilizers: FertilizerInventory) => void;
    addFertilizer: (type: keyof FertilizerInventory, count?: number) => void;
    useFertilizer: (type: keyof FertilizerInventory) => boolean;

    // Fruit methods
    getFruits: () => FruitSlot[];
    setFruits: (fruits: FruitSlot[]) => void;

    // Water methods
    getWaterCount: () => number;
    setWaterCount: (count: number) => void;
    useWater: () => boolean;
    addWater: (count: number) => void;

    // User methods
    getUser: () => UserProfile | null;
    setUser: (user: UserProfile | null) => void;

    // Initialization
    initialize: (data: Partial<GameState>) => void;
    isReady: () => boolean;
};

// ============================================
// Game State Hook
// ============================================

export function useGameState(scene: Phaser.Scene): GameStateHook {
    const state = withGlobalState<GameState>(scene, 'gameState', initialGameState);

    // ========== Currency Methods ==========

    const getGold = (): number => state.get().currency.gold;
    const getGem = (): number => state.get().currency.gem;

    const setGold = (amount: number): void => {
        state.patch({
            currency: { ...state.get().currency, gold: amount },
            lastUpdated: Date.now(),
        });
    };

    const setGem = (amount: number): void => {
        state.patch({
            currency: { ...state.get().currency, gem: amount },
            lastUpdated: Date.now(),
        });
    };

    const addGold = (amount: number): void => {
        const current = state.get();
        state.patch({
            currency: { ...current.currency, gold: current.currency.gold + amount },
            lastUpdated: Date.now(),
        });
    };

    const addGem = (amount: number): void => {
        const current = state.get();
        state.patch({
            currency: { ...current.currency, gem: current.currency.gem + amount },
            lastUpdated: Date.now(),
        });
    };

    const spendGold = (amount: number): boolean => {
        const current = state.get();
        if (current.currency.gold < amount) return false;
        state.patch({
            currency: { ...current.currency, gold: current.currency.gold - amount },
            lastUpdated: Date.now(),
        });
        return true;
    };

    const spendGem = (amount: number): boolean => {
        const current = state.get();
        if (current.currency.gem < amount) return false;
        state.patch({
            currency: { ...current.currency, gem: current.currency.gem - amount },
            lastUpdated: Date.now(),
        });
        return true;
    };

    const setCurrency = (gold: number, gem: number): void => {
        state.patch({
            currency: { gold, gem },
            lastUpdated: Date.now(),
        });
    };

    // ========== Seed Methods ==========

    const getSeeds = (): SeedInventory => state.get().seeds;

    const getSeedCount = (type: PlantType): number => state.get().seeds[type] ?? 0;

    const setSeeds = (seeds: SeedInventory): void => {
        state.patch({ seeds, lastUpdated: Date.now() });
    };

    const addSeed = (type: PlantType, count: number = 1): void => {
        const current = state.get();
        state.patch({
            seeds: { ...current.seeds, [type]: (current.seeds[type] ?? 0) + count },
            lastUpdated: Date.now(),
        });
    };

    const useSeed = (type: PlantType): boolean => {
        const current = state.get();
        if ((current.seeds[type] ?? 0) < 1) return false;
        state.patch({
            seeds: { ...current.seeds, [type]: current.seeds[type] - 1 },
            lastUpdated: Date.now(),
        });
        return true;
    };

    // ========== Fertilizer Methods ==========

    const getFertilizers = (): FertilizerInventory => state.get().fertilizers;

    const getFertilizerCount = (type: keyof FertilizerInventory): number =>
        state.get().fertilizers[type] ?? 0;

    const setFertilizers = (fertilizers: FertilizerInventory): void => {
        state.patch({ fertilizers, lastUpdated: Date.now() });
    };

    const addFertilizer = (type: keyof FertilizerInventory, count: number = 1): void => {
        const current = state.get();
        state.patch({
            fertilizers: { ...current.fertilizers, [type]: (current.fertilizers[type] ?? 0) + count },
            lastUpdated: Date.now(),
        });
    };

    const useFertilizer = (type: keyof FertilizerInventory): boolean => {
        const current = state.get();
        if ((current.fertilizers[type] ?? 0) < 1) return false;
        state.patch({
            fertilizers: { ...current.fertilizers, [type]: current.fertilizers[type] - 1 },
            lastUpdated: Date.now(),
        });
        return true;
    };

    // ========== Fruit Methods ==========

    const getFruits = (): FruitSlot[] => state.get().fruits;

    const setFruits = (fruits: FruitSlot[]): void => {
        state.patch({ fruits, lastUpdated: Date.now() });
    };

    // ========== Water Methods ==========

    const getWaterCount = (): number => state.get().waterCount;

    const setWaterCount = (count: number): void => {
        state.patch({ waterCount: count, lastUpdated: Date.now() });
    };

    const useWater = (): boolean => {
        const current = state.get();
        if (current.waterCount < 1) return false;
        state.patch({ waterCount: current.waterCount - 1, lastUpdated: Date.now() });
        return true;
    };

    const addWater = (count: number): void => {
        const current = state.get();
        state.patch({ waterCount: current.waterCount + count, lastUpdated: Date.now() });
    };

    // ========== User Methods ==========

    const getUser = (): UserProfile | null => state.get().user;

    const setUser = (user: UserProfile | null): void => {
        state.patch({ user, lastUpdated: Date.now() });
    };

    // ========== Initialization ==========

    const initialize = (data: Partial<GameState>): void => {
        const current = state.get();
        state.set({
            ...current,
            ...data,
            isInitialized: true,
            lastUpdated: Date.now(),
        });
    };

    const isReady = (): boolean => state.get().isInitialized;

    return {
        ...state,
        // Currency
        getGold,
        getGem,
        setGold,
        setGem,
        addGold,
        addGem,
        spendGold,
        spendGem,
        setCurrency,
        // Seeds
        getSeeds,
        getSeedCount,
        setSeeds,
        addSeed,
        useSeed,
        // Fertilizers
        getFertilizers,
        getFertilizerCount,
        setFertilizers,
        addFertilizer,
        useFertilizer,
        // Fruits
        getFruits,
        setFruits,
        // Water
        getWaterCount,
        setWaterCount,
        useWater,
        addWater,
        // User
        getUser,
        setUser,
        // Init
        initialize,
        isReady,
    };
}

// ============================================
// Singleton accessor for non-scene contexts
// ============================================

let gameStateInstance: GameStateHook | null = null;

export function getGameState(scene?: Phaser.Scene): GameStateHook | null {
    if (scene) {
        gameStateInstance = useGameState(scene);
    }
    return gameStateInstance;
}

export function clearGameState(): void {
    gameStateInstance = null;
}
