import Phaser from 'phaser';

// Plant types based on API (ALGAE, MUSHROOM, TREE)
export type PlantType = 'algae' | 'mushroom' | 'tree';

// Fertilizer types
export type FertilizerType = 'common' | 'rare' | 'epic' | 'legendary';

// Plant stages according to backend:
// 0: Digging - Initial phase after planting
// 1: Seed (Hạt) - Starting point of growth
// 2: Sprout (Mầm) - First signs of growth
// 3: Growing (Cây) - Vegetative growth phase
// 4: Bloom (Hoa) - Flowering/maturing phase
// 5: Mature (Quả/Chín) - Final stage, ready to harvest
export const PLANT_STAGES = {
    DIGGING: 0,
    SEED: 1,
    SPROUT: 2,
    GROWING: 3,
    BLOOM: 4,
    MATURE: 5
} as const;

// Death timer: 72 hours in real time = 72 * 60 * 60 * 1000 ms
// Configurable via NEXT_PUBLIC_DEATH_TIMER_MS environment variable
// Default: 5 minutes (300000ms) for demo, Production: 72 hours (259200000ms)
export const DEATH_TIMER_MS = parseInt(process.env.NEXT_PUBLIC_DEATH_TIMER_MS || '300000', 10);

// API Plant info stored in tile state
export interface PlantApiInfo {
    id: string;
    type: string;
    typeName?: string;
    name: string;
    stage: string;
    stageName?: string;
    plantedAt: string;
    lastWateredAt?: string;
    waterBalance?: number;
    waterCount?: number;
}

// API Hydration info - plant health/water status
export interface PlantHydration {
    hoursToDeath: number;
    isDead: boolean;
    isWithering: boolean;
    status: 'HEALTHY' | 'WITHERING' | 'DEAD';
    message: string;
    waterBalance: number;
}

// API Growth info - plant growth progress
export interface PlantGrowth {
    activeGrowthHours: number;
    currentStage: string;
    hoursRemaining: number;
    progress: number;
    totalHoursNeeded: number;
}

// API Soil Quality info
export interface SoilQuality {
    fertility: number;
    hydration: number;
    status: string;
}

// API Progress info stored in tile state
export interface PlantProgress {
    percentage: number;
    timeRemaining: string;
    stage: string;
    canWater: boolean;
}

// API Config info stored in tile state
export interface PlantConfig {
    diggingTime: string;
    growingTime: string;
    totalTime: string;
    baseYield: number;
}

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
    // API data
    plantInfo?: PlantApiInfo; // Full plant info from API
    hydration?: PlantHydration; // Hydration/health info from API
    growth?: PlantGrowth; // Growth progress info from API
    soilQuality?: SoilQuality; // Soil quality info from API
    progress?: PlantProgress; // Progress info from API (legacy)
    config?: PlantConfig; // Config info from API
    lastRefreshTime?: number; // Timestamp when this tile's data was last refreshed
}

// Crop definition for plant assets
export interface CropDefinition {
    name: string;
    seedImage: string;
    growthImages: string[]; // For tree: 5 individual images. For algae/mushroom: ignored (use spritesheet)
    fruitImage: string;
    deathImage: string;
    // For spritesheet-based plants (algae, mushroom)
    spritesheet?: string; // Spritesheet key (e.g., 'algae-spritesheet')
    stageCount: number; // Number of growth stages: 3 for algae/mushroom, 5 for tree
}

// Crop definitions for all plant types
export const CROP_DEFINITIONS: Record<PlantType, CropDefinition> = {
    algae: {
        name: 'Algae',
        seedImage: 'algae-seed',
        growthImages: [], // Uses spritesheet instead
        fruitImage: 'algae-fruit',
        deathImage: 'algae-plant-death',
        spritesheet: 'algae-spritesheet', // 2 visual stages: frame 0 (seedling), frame 2 (mature)
        stageCount: 2
    },
    mushroom: {
        name: 'Mushroom',
        seedImage: 'mushroom-seed',
        growthImages: [], // Uses spritesheet instead
        fruitImage: 'mushroom-fruit',
        deathImage: 'mushroom-plant-death',
        spritesheet: 'mushroom-spritesheet', // 2 visual stages: frame 0 (seedling), frame 2 (mature)
        stageCount: 2
    },
    tree: {
        name: 'Tree',
        seedImage: 'tree-seed',
        growthImages: ['tree-plant-1', 'tree-plant-2', 'tree-plant-3'], // 3 visual stages
        fruitImage: 'tree-fruit',
        deathImage: 'tree-plant-death',
        // No spritesheet - uses growthImages
        stageCount: 3
    }
};

// Available plant types for seed selection
export const PLANT_TYPES: PlantType[] = ['algae', 'mushroom', 'tree'];

// Fertilizer types array
export const FERTILIZER_TYPES: FertilizerType[] = ['common', 'rare', 'epic', 'legendary'];

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

// Plant hydration config (matches backend PLANT_CONFIGS)
// 1 Water Drop = 3 hours of waterBalance
export const WATER_DROP_HOURS = 3;

export const PLANT_WATER_CONFIG: Record<PlantType, { waterCapacityDrops: number; maxWaterHours: number }> = {
    algae: { waterCapacityDrops: 3, maxWaterHours: 3 * WATER_DROP_HOURS },      // 9 hours max
    mushroom: { waterCapacityDrops: 5, maxWaterHours: 5 * WATER_DROP_HOURS },   // 15 hours max
    tree: { waterCapacityDrops: 8, maxWaterHours: 8 * WATER_DROP_HOURS },       // 24 hours max
};

// Helper function to get max water hours for a plant type
export function getMaxWaterHours(plantType: PlantType | string): number {
    const type = plantType.toLowerCase() as PlantType;
    return PLANT_WATER_CONFIG[type]?.maxWaterHours ?? 9; // Default to algae
}

// Game constants
export const GAME_CONSTANTS = {
    TILE_SIZE: 16,
    MAP_WIDTH: 50,
    MAP_HEIGHT: 50,
    TOTAL_FARM_PLOTS: 16,
    INITIAL_OWNED_PLOTS: 2,
    CHEST_SLOTS: 6,      // Chest/Backpack slots (reduced from 12)
    MAX_PER_SLOT: 50,
    WAREHOUSE_SLOTS: 16, // Storage warehouse slots
    FRUITS_PER_FERTILIZER: 3,
    MISSIONS_CACHE_DURATION: 60000, // 1 minute
    CHECKIN_STORAGE_KEY: 'fam_game_checkin_data',
    CHARACTER_SCALE: 0.8 // Character sprite scale (0.8 = 80% of original size)
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
