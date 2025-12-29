// Socket.IO event types for real-time plant updates

/**
 * Plant data from WebSocket events
 * Matches the backend payload structure
 */
export interface SocketPlant {
    id: string;
    landId: string;
    type: 'ALGAE' | 'MUSHROOM' | 'TREE';
    stage: 'DIGGING' | 'SEED' | 'SPROUT' | 'GROWING' | 'BLOOM' | 'MATURE' | 'DEAD';

    // Growth & Hydration
    waterBalance: number;       // Remaining water in hours
    activeGrowthHours: number;  // Accumulated growth progress

    // Status
    witheredAt?: string | null; // If present, the plant is currently withered
    isHarvestable: boolean;     // If true, show harvest button
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
 * Triggered when planting (Empty -> Plant) or harvesting (Plant -> Empty)
 */
export interface LandUpdatePayload {
    landId: string;
    plotIndex: number;
    plant: SocketPlant | null;
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
    
    // Client -> Server events
    CLAIM_WATER: 'claim_water',
    WATER_PLANT: 'water_plant',
    HARVEST_PLANT: 'harvest_plant',
    
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
} as const;
