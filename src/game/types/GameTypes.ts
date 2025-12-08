import Phaser from 'phaser';

// Plant types based on API (ALGAE, MUSHROOM, TREE)
export type PlantType = 'algae' | 'mushroom' | 'tree';

// Fertilizer types
export type FertilizerType = 'common' | 'rare' | 'epic';

// Plant stages according to proposal:
// 0: Seed (Hạt)
// 1: Sprout (Mầm)
// 2: Young Plant (Cây non)
// 3: Mature (Trưởng thành)
// 4: Flower (Hoa) - After this stage, plant cannot die
// 5: Fruit (Quả) - Ready to harvest
export const PLANT_STAGES = {
    SEED: 0,
    SPROUT: 1,
    YOUNG: 2,
    MATURE: 3,
    FLOWER: 4,
    FRUIT: 5
} as const;

// Death timer: 72 hours in real time = 72 * 60 * 60 * 1000 ms
// Configurable via NEXT_PUBLIC_DEATH_TIMER_MS environment variable
// Default: 5 minutes (300000ms) for demo, Production: 72 hours (259200000ms)
export const DEATH_TIMER_MS = parseInt(process.env.NEXT_PUBLIC_DEATH_TIMER_MS || '300000', 10);

// Tile state for farm plots
export interface TileState {
    tilled: boolean;
    planted: boolean;
    plantStage: number; // 0-5 based on PLANT_STAGES
    cropType: PlantType | null;
    plantSprite?: Phaser.GameObjects.Image;
    isDead?: boolean;
    isWilted?: boolean; // Plant is wilted (for stages >= FLOWER)
    lastCareTime?: number; // Timestamp of last watering/fertilizing
    healthBarBg?: Phaser.GameObjects.Rectangle; // Health bar background
    healthBarFill?: Phaser.GameObjects.Rectangle; // Health bar fill (green->red)
    locked?: boolean; // Whether plot is locked (needs to be purchased)
    plotIndex?: number; // Index of plot (0-15 for 4x4 grid)
    plantId?: string; // Plant ID from backend API (for watering, harvesting, etc.)
    landId?: string; // Land ID from backend API (for planting)
}

// Crop definition for plant assets
export interface CropDefinition {
    name: string;
    seedImage: string;
    growthImages: string[]; // 5 stages
    fruitImage: string;
    deathImage: string;
}

// Crop definitions for all plant types
export const CROP_DEFINITIONS: Record<PlantType, CropDefinition> = {
    algae: {
        name: 'Algae',
        seedImage: 'algae-seed',
        growthImages: ['algae-plant-1', 'algae-plant-2', 'algae-plant-3', 'algae-plant-4', 'algae-plant-5'],
        fruitImage: 'algae-fruit',
        deathImage: 'algae-plant-death'
    },
    mushroom: {
        name: 'Mushroom',
        seedImage: 'mushroom-seed',
        growthImages: ['mushroom-plant-1', 'mushroom-plant-2', 'mushroom-plant-3', 'mushroom-plant-4', 'mushroom-plant-5'],
        fruitImage: 'mushroom-fruit',
        deathImage: 'mushroom-plant-death'
    },
    tree: {
        name: 'Tree',
        seedImage: 'tree-seed', // Placeholder: use technical seed sprite
        growthImages: ['tree-plant-1', 'tree-plant-2', 'tree-plant-3', 'tree-plant-4', 'tree-plant-5'],
        fruitImage: 'tree-fruit',
        deathImage: 'tree-plant-death'
    }
};

// Available plant types for seed selection
export const PLANT_TYPES: PlantType[] = ['algae', 'mushroom', 'tree'];

// Fertilizer types array
export const FERTILIZER_TYPES: FertilizerType[] = ['common', 'rare', 'epic'];

// Toolbar item definition
export interface ToolbarItem {
    type: 'tool' | 'seed';
    name: string;
    count?: number;
}

// Chest inventory slot
export interface ChestSlot {
    type: PlantType;
    count: number;
}

// Check-in data structure
export interface CheckinData {
    checkedDays: number[];
    lastCheckin: string;
    streak: number;
}

// Shop item definition
export interface ShopItem {
    key: string;
    name: string;
    description: string;
    price: number;
    currency: 'gold' | 'gem' | 'cash';
    icon: string;
    limit?: string; // e.g., "1/week", "1/day"
}

// Shop purchase limits
export interface ShopPurchaseLimits {
    shovel: { count: number; lastReset: number };
    growthWater: { count: number; lastReset: number };
    mushroomExchange: { count: number; lastReset: number };
}

// Phygital Exchange reward types
export type ExchangeRewardType = 'tote' | 'lottery' | 'razer' | 'voucher' | 'gold' | 'iphone' | 'seed_nft';

// Phygital Exchange reward definition
export interface ExchangeReward {
    id: ExchangeRewardType;
    name: string;
    nameVi: string;
    treeCost: number;
    mushroomCost: number;
    sporeCost: number;
    icon: string; // emoji or image key
    color: string;
}

// Phygital Exchange rewards table
// Cost format: treeCost / mushroomCost / sporeCost (user needs ALL to exchange)
export const EXCHANGE_REWARDS: ExchangeReward[] = [
    { id: 'tote', name: 'Tote Bag', nameVi: 'Túi Tote', treeCost: 1, mushroomCost: 7, sporeCost: 14, icon: '👜', color: '#8B4513' },
    { id: 'lottery', name: 'Lottery Ticket', nameVi: 'Vé Lottery', treeCost: 5, mushroomCost: 50, sporeCost: 100, icon: '🎟️', color: '#FFD700' },
    { id: 'razer', name: 'Razer Headset', nameVi: 'Tai nghe Razer', treeCost: 10, mushroomCost: 200, sporeCost: 400, icon: '🎧', color: '#00FF00' },
    { id: 'voucher', name: 'Voucher $300', nameVi: 'Voucher $300', treeCost: 50, mushroomCost: 1000, sporeCost: 2000, icon: '💵', color: '#85bb65' },
    { id: 'gold', name: '1 Gold Bar 9999', nameVi: '1 Chỉ Vàng 9999', treeCost: 100, mushroomCost: 2000, sporeCost: 4000, icon: '🥇', color: '#FFD700' },
    { id: 'iphone', name: 'Latest iPhone', nameVi: 'iPhone Mới Nhất', treeCost: 150, mushroomCost: 3000, sporeCost: 6000, icon: '📱', color: '#A2AAAD' },
    { id: 'seed_nft', name: '1 Seed NFT', nameVi: '1 Seed NFT', treeCost: 0, mushroomCost: 5000, sporeCost: 10000, icon: '🌱', color: '#4ade80' },
];

// Game constants
export const GAME_CONSTANTS = {
    TILE_SIZE: 16,
    MAP_WIDTH: 50,
    MAP_HEIGHT: 50,
    TOTAL_FARM_PLOTS: 16,
    INITIAL_OWNED_PLOTS: 2,
    CHEST_SLOTS: 12,
    MAX_PER_SLOT: 5,
    FRUITS_PER_FERTILIZER: 3,
    MISSIONS_CACHE_DURATION: 60000, // 1 minute
    CHECKIN_STORAGE_KEY: 'fam_game_checkin_data'
} as const;

// Interface for scene reference (to be used by managers)
export interface IFarmingScene extends Phaser.Scene {
    // Currency
    playerGold: number;
    playerGems: number;

    // Inventory
    seedCounts: Record<PlantType, number>;
    fertilizerCounts: Record<FertilizerType, number>;
    chestInventory: ChestSlot[];
    toolbarItems: ToolbarItem[];
    selectedToolIndex: number;
    selectedSeedIndex: number;
    selectedFertilizerIndex: number;

    // Farm state
    farmLandStates: Map<string, TileState>;
    ownedPlotsCount: number;

    // UI state
    uiCamera: Phaser.Cameras.Scene2D.Camera;

    // Methods that managers may need to call
    updateToolbar(): void;
    showFloatingMessage(message: string, tileX: number, tileY: number): void;
    showToastMessage(text: string, color: number): void;
}
