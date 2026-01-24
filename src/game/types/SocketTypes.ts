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
 * Payload for plant_seed event (Client -> Server)
 */
export interface PlantSeedPayload {
    landId: string;
    seedType: string;
}

/**
 * Plant seed success data in action_success response
 */
export interface PlantSeedSuccessData {
    plant: {
        id: string;
        type: string;
        stage: string;
        plantedAt: string;
    };
    message: string;
    phase: string;
    diggingTime: string;
    growingTime: string;
    totalTime: string;
    canWaterNow: boolean;
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

// ==========================================
// Mission WebSocket Types
// ==========================================

/**
 * Mission reward structure
 */
export interface MissionReward {
    xp: number;
    reputation: number;
    items: Array<{ type: string; amount: number }>;
}

/**
 * Mission status from WebSocket
 */
export type MissionStatus = 'active' | 'completed' | 'claimed' | 'pending';

/**
 * Payload for mission:submit_proof event (Client -> Server)
 */
export interface MissionSubmitProofPayload {
    missionId: string;
    proof: string;
}

/**
 * Payload for mission:claim_reward event (Client -> Server)
 */
export interface MissionClaimRewardPayload {
    missionId: string;
}

/**
 * Payload for mission:updated event (Server -> Client)
 * Received when a mission is updated (progress, status change, etc.)
 */
export interface MissionUpdatedPayload {
    id: string;
    userId: string;
    missionType: string;
    progress: number;
    target: number;
    status: MissionStatus;
    proof: string | null;
    createdAt: string;
    updatedAt: string;
    missionId: string;
    name: string;
    description: string;
    reward: MissionReward;
}

/**
 * Payload for mission:claimed event (Server -> Client)
 * Received when a mission reward is successfully claimed
 */
export interface MissionClaimedPayload {
    success: boolean;
    missionId: string;
    rewards: MissionReward;
}

// ==========================================
// Event Checkin WebSocket Types
// ==========================================

/**
 * Event information from WebSocket
 */
export interface SocketEvent {
    id: string;
    name: string;
    location: string;
    startTime: string;  // ISO date string
    endTime: string;    // ISO date string
}

/**
 * Event checkin reward from WebSocket
 */
export interface EventCheckinReward {
    itemType: string;   // e.g., "SEED_ALGAE"
    amount: number;     // Amount received
    totalAmount: number; // User's new total for this item
}

/**
 * Payload for event_checkin event (Client -> Server)
 */
export interface EventCheckinPayload {
    eventId: string;
    verificationCode?: string;
}

/**
 * Success data for event_checkin action_success response
 */
export interface EventCheckinSuccessData {
    success: true;
    event: SocketEvent;
    reward: EventCheckinReward;
}

// ==========================================
// Quiz WebSocket Types
// ==========================================

/**
 * Payload for quiz:start event (Client -> Server)
 */
export interface QuizStartPayload {
    quizId: string;
}

/**
 * Quiz answer structure for submission
 */
export interface QuizAnswerSubmit {
    questionId: string;
    answer: string;
}

/**
 * Payload for quiz:submit event (Client -> Server)
 */
export interface QuizSubmitPayload {
    quizId: string;
    answers: QuizAnswerSubmit[];
}

/**
 * Quiz info in started response
 */
export interface QuizStartedInfo {
    id: string;
    title: string;
    timePerQuestion: number;
    totalQuestions: number;
}

/**
 * Payload for quiz:started event (Server -> Client)
 */
export interface QuizStartedPayload {
    success: boolean;
    attemptId: string;
    quiz: QuizStartedInfo;
    message: string;
}

/**
 * Quiz result structure
 */
export interface QuizResultData {
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    xpEarned: number;
    goldEarned: number;
    badgeEarned: string | null;
    isPerfect: boolean;
}

/**
 * Answer result in quiz result
 */
export interface QuizAnswerResult {
    questionId: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
}

/**
 * Payload for quiz:result event (Server -> Client)
 */
export interface QuizResultPayload {
    success: boolean;
    result: QuizResultData;
    answers: QuizAnswerResult[];
    message: string;
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
    
    // Mission events (Server -> Client)
    MISSION_UPDATED: 'mission:updated',
    MISSION_CLAIMED: 'mission:claimed',
    
    // Quiz events (Server -> Client)
    QUIZ_STARTED: 'quiz:started',
    QUIZ_RESULT: 'quiz:result',
    
    // Client -> Server events
    CLAIM_WATER: 'claim_water',
    WATER_PLANT: 'water_plant',
    HARVEST_PLANT: 'harvest_plant',
    PLANT_SEED: 'plant_seed',
    BUY_LAND: 'buy_land',
    BUY_SHOP_ITEM: 'buy_shop_item',
    
    // Mission events (Client -> Server)
    MISSION_SUBMIT_PROOF: 'mission:submit_proof',
    MISSION_CLAIM_REWARD: 'mission:claim_reward',
    
    // Quiz events (Client -> Server)
    QUIZ_START: 'quiz:start',
    QUIZ_SUBMIT: 'quiz:submit',
    
    // Event checkin events (Client -> Server)
    EVENT_CHECKIN: 'event_checkin',
    
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
} as const;
