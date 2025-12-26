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

/**
 * Socket event names
 */
export const SOCKET_EVENTS = {
    PLANT_UPDATE: 'plant_update',
    LAND_UPDATE: 'land_update',
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
} as const;
