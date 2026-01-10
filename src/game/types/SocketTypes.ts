// Socket.IO event types for real-time game updates

/**
 * Plant data from WebSocket events
 * Matches the backend payload structure
 */
export interface SocketPlant {
    id: string;
    landId?: string;
    type: 'ALGAE' | 'MUSHROOM' | 'TREE';
    stage: 'SEED' | 'DIGGING' | 'SPROUT' | 'GROWING' | 'BLOOM' | 'MATURE' | 'DEAD';
    plantedAt: string;          // ISO date string
    waterBalance: number;       // Hours remaining
    isHarvestable: boolean;     // If true, show harvest button

    // Optional fields from extended plant data
    activeGrowthHours?: number;  // Accumulated growth progress
    witheredAt?: string | null;  // If present, the plant is currently withered
}

/**
 * Soil quality data from WebSocket events
 */
export interface SoilQuality {
    fertility: number;
    hydration: number;
}

/**
 * Land data from WebSocket events
 */
export interface SocketLand {
    id: string;
    plotIndex: number;
    plant?: SocketPlant;
    soilQuality: SoilQuality;
}

/**
 * Payload for plant_update event
 * Triggered when a plant grows, is watered, or changes state (withered/dead)
 */
export interface PlantUpdatePayload {
    landId: string;
    plant: SocketPlant;
}

/**
 * Payload for land_update event
 * Triggered when buying land, planting, or harvesting
 * Server sends an array of Land objects
 */
export type LandUpdatePayload = SocketLand[];

/**
 * Inventory item from WebSocket events
 */
export interface SocketInventoryItem {
    id: string;
    itemType: string;   // e.g., "SEED_COMMON", "FRUIT", "WATER"
    amount: number;
    location: string;   // "STORAGE" | "BACKPACK"
    // Optional extended fields
    name?: string;
    rarity?: string;
    category?: string;
    icon?: string;
}

/**
 * Payload for inventory_update event
 * Triggered when inventory changes (water used, items gained, etc.)
 */
export type InventoryUpdatePayload = SocketInventoryItem[];

/**
 * Payload for currency_update event
 * Triggered when gold or gems change
 */
export interface CurrencyUpdatePayload {
    gold: number;
    gem: number;
}

/**
 * Payload for action_success event
 * Triggered when a game action completes successfully
 */
export interface ActionSuccessPayload {
    action: string;
    data?: unknown;
    message?: string;
}

/**
 * Payload for action_error event
 * Triggered when a game action fails
 */
export interface ActionErrorPayload {
    action: string;
    message: string;
}

/**
 * Socket connection status
 */
export type SocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ==========================================
// Client -> Server Event Payloads
// ==========================================

/**
 * Payload for water_plant event (Client -> Server)
 */
export interface WaterPlantPayload {
    plantId: string;
}

/**
 * Payload for harvest_plant event (Client -> Server)
 */
export interface HarvestPlantPayload {
    plantId: string;
}

/**
 * Payload for buy_shop_item event (Client -> Server)
 * Used to purchase items from Gold or Gem shop via WebSocket
 */
export interface BuyShopItemPayload {
    shopType: 'GOLD' | 'GEM';
    itemKey: string;
}

/**
 * Response from server for water/harvest actions
 */
export interface GameActionResponse {
    success: boolean;
    message?: string;
    error?: string;
}

/**
 * Response from server for claim_water action
 */
export interface ClaimWaterResponse {
    success: boolean;
    message?: string;
    error?: string;
    amount?: number;
    nextClaimAt?: string;
}

/**
 * Socket event names
 */
export const SOCKET_EVENTS = {
    // Server -> Client events
    PLANT_UPDATE: 'plant_update',
    LAND_UPDATE: 'land_update',
    INVENTORY_UPDATE: 'inventory_update',
    CURRENCY_UPDATE: 'currency_update',
    ACTION_SUCCESS: 'action_success',
    ACTION_ERROR: 'action_error',
    
    // Client -> Server events
    CLAIM_WATER: 'claim_water',
    WATER_PLANT: 'water_plant',
    HARVEST_PLANT: 'harvest_plant',
    BUY_LAND: 'buy_land',
    BUY_SHOP_ITEM: 'buy_shop_item',
    
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
} as const;
