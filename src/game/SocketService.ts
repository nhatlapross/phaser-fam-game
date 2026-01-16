// src/game/SocketService.ts
import { io, Socket } from 'socket.io-client';
import { EventBus } from './EventBus';
import {
    PlantUpdatePayload,
    LandUpdatePayload,
    InventoryUpdatePayload,
    CurrencyUpdatePayload,
    ActionSuccessPayload,
    ActionErrorPayload,
    SocketConnectionStatus,
    SOCKET_EVENTS,
    WaterPlantPayload,
    HarvestPlantPayload,
    BuyShopItemPayload,
    MissionSubmitProofPayload,
    MissionClaimRewardPayload,
    MissionUpdatedPayload,
    MissionClaimedPayload,
} from './types/SocketTypes';

/**
 * SocketService - Manages WebSocket connection for real-time game updates
 * 
 * IMPORTANT: Connects to the /game namespace on the backend
 * 
 * Events emitted via EventBus (Server -> Client):
 * - 'socket:connected' - When connection is established
 * - 'socket:disconnected' - When connection is lost
 * - 'socket:plant_update' - When a plant is updated (growth, water, wither)
 * - 'socket:land_update' - When land plots change (buy land, plant, harvest)
 * - 'socket:inventory_update' - When inventory changes (water, seeds, fruits)
 * - 'socket:currency_update' - When gold or gems change
 * - 'socket:action_success' - When a game action completes successfully
 * - 'socket:action_error' - When a game action fails
 * - 'socket:mission_updated' - When a mission is updated
 * - 'socket:mission_claimed' - When a mission reward is claimed
 * 
 * Client -> Server Events (fire-and-forget, responses come via events above):
 * - 'claim_water' - Claim free water from well
 * - 'water_plant' - Water a plant
 * - 'harvest_plant' - Harvest a mature plant
 * - 'buy_land' - Buy a new land plot
 * - 'mission:submit_proof' - Submit proof for a mission
 * - 'mission:claim_reward' - Claim reward for a completed mission
 */
export class SocketService {
    private static instance: SocketService | null = null;
    private socket: Socket | null = null;
    private status: SocketConnectionStatus = 'disconnected';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;

    // Base URL without namespace
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    // Socket.IO namespace for game events
    private static SOCKET_NAMESPACE = '/game';

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    /**
     * Get current connection status
     */
    public getStatus(): SocketConnectionStatus {
        return this.status;
    }

    /**
     * Check if socket is connected
     */
    public isConnected(): boolean {
        return this.status === 'connected' && this.socket?.connected === true;
    }

    /**
     * Connect to the WebSocket server
     * @param token - JWT access token for authentication
     */
    public connect(token?: string): void {
        if (this.socket?.connected) {
            return;
        }

        // Get token from parameter or localStorage
        const authToken = token || this.getAccessToken();
        if (!authToken) {
            return;
        }

        this.status = 'connecting';
        
        // Connect to the /game namespace specifically
        const socketUrl = `${SocketService.API_BASE_URL}${SocketService.SOCKET_NAMESPACE}`;

        this.socket = io(socketUrl, {
            auth: {
                token: authToken,
            },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            // Force new connection to avoid stale connections
            forceNew: true,
        });

        this.setupEventListeners();
        //this.setupDebugListeners();
    }

    /**
     * Disconnect from the WebSocket server
     */
    public disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.status = 'disconnected';
            this.reconnectAttempts = 0;
        }
    }

    /**
     * Setup socket event listeners
     */
    private setupEventListeners(): void {
        if (!this.socket) return;

        // Connection events
        this.socket.on(SOCKET_EVENTS.CONNECT, () => {
            this.status = 'connected';
            this.reconnectAttempts = 0;
            EventBus.emit('socket:connected');
        });

        this.socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
            this.status = 'disconnected';
            EventBus.emit('socket:disconnected', reason);
        });

        this.socket.on(SOCKET_EVENTS.CONNECT_ERROR, (error) => {
            this.status = 'error';
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            }
        });

        // Game events - Server -> Client
        this.socket.on(SOCKET_EVENTS.PLANT_UPDATE, (payload: PlantUpdatePayload) => {
            EventBus.emit('socket:plant_update', payload);
        });

        this.socket.on(SOCKET_EVENTS.LAND_UPDATE, (payload: LandUpdatePayload) => {
            EventBus.emit('socket:land_update', payload);
        });

        this.socket.on(SOCKET_EVENTS.INVENTORY_UPDATE, (payload: InventoryUpdatePayload) => {
            EventBus.emit('socket:inventory_update', payload);
        });

        this.socket.on(SOCKET_EVENTS.CURRENCY_UPDATE, (payload: CurrencyUpdatePayload) => {
            EventBus.emit('socket:currency_update', payload);
        });

        this.socket.on(SOCKET_EVENTS.ACTION_SUCCESS, (payload: ActionSuccessPayload) => {
            EventBus.emit('socket:action_success', payload);
        });

        this.socket.on(SOCKET_EVENTS.ACTION_ERROR, (payload: ActionErrorPayload) => {
            EventBus.emit('socket:action_error', payload);
        });

        // Mission events - Server -> Client
        this.socket.on(SOCKET_EVENTS.MISSION_UPDATED, (payload: MissionUpdatedPayload) => {
            EventBus.emit('socket:mission_updated', payload);
        });

        this.socket.on(SOCKET_EVENTS.MISSION_CLAIMED, (payload: MissionClaimedPayload) => {
            EventBus.emit('socket:mission_claimed', payload);
        });
    }

    /**
     * Setup debug listeners to catch all events (for troubleshooting)
     */
    private setupDebugListeners(): void {
        if (!this.socket) return;

        // Wildcard listener - catches ALL incoming events
        // This helps identify event name mismatches
        this.socket.onAny((eventName: string, ...args: unknown[]) => {
        });

        // Log outgoing events too
        this.socket.onAnyOutgoing((eventName: string, ...args: unknown[]) => {
        });

        // Additional connection debugging
        this.socket.io.on('error', (error) => {
        });

        this.socket.io.on('reconnect', (attempt) => {
        });

        this.socket.io.on('reconnect_attempt', (attempt) => {
        });

        this.socket.io.on('reconnect_error', (error) => {
        });

        this.socket.io.on('reconnect_failed', () => {
        });
    }

    /**
     * Get access token from localStorage
     */
    private getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('fam_game_access_token');
    }

    /**
     * Get the socket ID (useful for debugging)
     */
    public getSocketId(): string | null {
        return this.socket?.id || null;
    }

    /**
     * Manually emit an event to the server (if needed)
     */
    public emit(event: string, data?: unknown): void {
        if (this.socket?.connected) {
            this.socket.emit(event, data);
        } else {
        }
    }

    // ==========================================
    // Game Action Methods (Client -> Server)
    // Fire-and-forget: responses come via event listeners
    // ==========================================

    /**
     * Claim free water from the well
     * Emit: 'claim_water', {}
     * Response comes via 'inventory_update' and 'action_success' events
     */
    public claimWater(): void {
        if (!this.socket?.connected) {
            return;
        }
        this.socket.emit(SOCKET_EVENTS.CLAIM_WATER, {});
    }

    /**
     * Water a plant
     * Emit: 'water_plant', { plantId: string }
     * Response comes via 'plant_update', 'inventory_update', and 'action_success' events
     * @param plantId - The UUID of the plant to water
     */
    public waterPlant(plantId: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: WaterPlantPayload = { plantId };
        this.socket.emit(SOCKET_EVENTS.WATER_PLANT, payload);
    }

    /**
     * Harvest a mature plant
     * Emit: 'harvest_plant', { plantId: string }
     * Response comes via 'land_update', 'inventory_update', and 'action_success' events
     * @param plantId - The UUID of the plant to harvest
     */
    public harvestPlant(plantId: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: HarvestPlantPayload = { plantId };
        this.socket.emit(SOCKET_EVENTS.HARVEST_PLANT, payload);
    }

    /**
     * Buy a new land plot
     * Emit: 'buy_land', {}
     * Response comes via 'land_update', 'inventory_update', and 'action_success' events
     */
    public buyLand(): void {
        if (!this.socket?.connected) {
            return;
        }

        this.socket.emit(SOCKET_EVENTS.BUY_LAND, {});
    }

    /**
     * Buy an item from the shop (Gold or Gem shop)
     * Emit: 'buy_shop_item', { shopType: "GOLD" | "GEM", itemKey: string }
     * Response comes via:
     * - 'action_success' with purchase details
     * - 'currency_update' with new balances
     * - 'inventory_update' if item has rewards (seeds/tools)
     * - 'land_update' if land plot was unlocked (GEM shop)
     * @param shopType - "GOLD" or "GEM"
     * @param itemKey - The item key to purchase
     */
    public buyShopItem(shopType: 'GOLD' | 'GEM', itemKey: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: BuyShopItemPayload = { shopType, itemKey };
        this.socket.emit(SOCKET_EVENTS.BUY_SHOP_ITEM, payload);
    }

    // ==========================================
    // Mission Action Methods (Client -> Server)
    // Fire-and-forget: responses come via event listeners
    // ==========================================

    /**
     * Submit proof for a mission
     * Emit: 'mission:submit_proof', { missionId: string, proof: string }
     * Response comes via 'mission:updated' event
     * @param missionId - The mission ID
     * @param proof - The proof string (URL or description)
     */
    public submitMissionProof(missionId: string, proof: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: MissionSubmitProofPayload = { missionId, proof };
        this.socket.emit(SOCKET_EVENTS.MISSION_SUBMIT_PROOF, payload);
    }

    /**
     * Claim reward for a completed mission
     * Emit: 'mission:claim_reward', { missionId: string }
     * Response comes via 'mission:claimed' event
     * @param missionId - The mission ID to claim reward for
     */
    public claimMissionReward(missionId: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: MissionClaimRewardPayload = { missionId };
        this.socket.emit(SOCKET_EVENTS.MISSION_CLAIM_REWARD, payload);
    }
}

// Export singleton instance getter
export const getSocketService = (): SocketService => SocketService.getInstance();
