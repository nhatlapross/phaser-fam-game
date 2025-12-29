// src/game/SocketService.ts
import { io, Socket } from 'socket.io-client';
import { EventBus } from './EventBus';
import {
    PlantUpdatePayload,
    LandUpdatePayload,
    SocketConnectionStatus,
    SOCKET_EVENTS,
    WaterPlantPayload,
    HarvestPlantPayload,
    GameActionResponse,
    ClaimWaterResponse,
} from './types/SocketTypes';

/**
 * SocketService - Manages WebSocket connection for real-time game updates
 * 
 * IMPORTANT: Connects to the /game namespace on the backend
 * 
 * Events emitted via EventBus:
 * - 'socket:connected' - When connection is established
 * - 'socket:disconnected' - When connection is lost
 * - 'socket:plant_update' - When a plant is updated (growth, water, wither)
 * - 'socket:land_update' - When a land plot changes (plant/harvest)
 * 
 * Client -> Server Events:
 * - 'claim_water' - Claim free water from well
 * - 'water_plant' - Water a plant
 * - 'harvest_plant' - Harvest a mature plant
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
            console.log('[SocketService] Already connected');
            return;
        }

        // Get token from parameter or localStorage
        const authToken = token || this.getAccessToken();
        if (!authToken) {
            console.warn('[SocketService] No auth token available, skipping connection');
            return;
        }

        this.status = 'connecting';
        
        // Connect to the /game namespace specifically
        const socketUrl = `${SocketService.API_BASE_URL}${SocketService.SOCKET_NAMESPACE}`;
        console.log('[SocketService] Connecting to:', socketUrl);
        console.log('[SocketService] Auth token (first 20 chars):', authToken.substring(0, 20) + '...');

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
        this.setupDebugListeners();
    }

    /**
     * Disconnect from the WebSocket server
     */
    public disconnect(): void {
        if (this.socket) {
            console.log('[SocketService] Disconnecting...');
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
            console.log('[SocketService] ✅ Connected successfully to /game namespace');
            console.log('[SocketService] Socket ID:', this.socket?.id);
            this.status = 'connected';
            this.reconnectAttempts = 0;
            EventBus.emit('socket:connected');
        });

        this.socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
            console.log('[SocketService] ❌ Disconnected:', reason);
            this.status = 'disconnected';
            EventBus.emit('socket:disconnected', reason);
        });

        this.socket.on(SOCKET_EVENTS.CONNECT_ERROR, (error) => {
            console.error('[SocketService] ⚠️ Connection error:', error.message);
            console.error('[SocketService] Error details:', error);
            this.status = 'error';
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[SocketService] Max reconnection attempts reached');
            }
        });

        // Game events
        this.socket.on(SOCKET_EVENTS.PLANT_UPDATE, (payload: PlantUpdatePayload) => {
            console.log('🌱 [SocketService] RECEIVED plant_update:', payload);
            console.log(`🌱 [SocketService] Land: ${payload.landId}, Stage: ${payload.plant.stage}`);
            EventBus.emit('socket:plant_update', payload);
        });

        this.socket.on(SOCKET_EVENTS.LAND_UPDATE, (payload: LandUpdatePayload) => {
            console.log('🏡 [SocketService] RECEIVED land_update:', payload);
            console.log(`🏡 [SocketService] Land: ${payload.landId}, Has plant: ${!!payload.plant}`);
            EventBus.emit('socket:land_update', payload);
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
            console.log(`📡 [SocketService] Incoming event: "${eventName}"`, args);
        });

        // Log outgoing events too
        this.socket.onAnyOutgoing((eventName: string, ...args: unknown[]) => {
            console.log(`📤 [SocketService] Outgoing event: "${eventName}"`, args);
        });

        // Additional connection debugging
        this.socket.io.on('error', (error) => {
            console.error('[SocketService] Manager error:', error);
        });

        this.socket.io.on('reconnect', (attempt) => {
            console.log('[SocketService] 🔄 Reconnected after', attempt, 'attempts');
        });

        this.socket.io.on('reconnect_attempt', (attempt) => {
            console.log('[SocketService] 🔄 Reconnection attempt:', attempt);
        });

        this.socket.io.on('reconnect_error', (error) => {
            console.error('[SocketService] 🔄 Reconnection error:', error);
        });

        this.socket.io.on('reconnect_failed', () => {
            console.error('[SocketService] 🔄 Reconnection failed permanently');
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
            console.warn('[SocketService] Cannot emit, socket not connected');
        }
    }

    // ==========================================
    // Game Action Methods (Client -> Server)
    // ==========================================

    /**
     * Claim free water from the well
     * Emit: 'claim_water', {}
     * @returns Promise that resolves with the server response
     */
    public claimWater(): Promise<ClaimWaterResponse> {
        return new Promise((resolve) => {
            if (!this.socket?.connected) {
                console.warn('[SocketService] Cannot claim water, socket not connected');
                resolve({ success: false, error: 'Socket not connected' });
                return;
            }

            console.log('💧 [SocketService] Emitting claim_water');
            this.socket.emit(SOCKET_EVENTS.CLAIM_WATER, {}, (response: ClaimWaterResponse) => {
                console.log('💧 [SocketService] claim_water response:', response);
                resolve(response);
            });

            // Timeout fallback if server doesn't respond with callback
            setTimeout(() => {
                resolve({ success: false, error: 'Request timeout' });
            }, 10000);
        });
    }

    /**
     * Water a plant
     * Emit: 'water_plant', { plantId: string }
     * @param plantId - The UUID of the plant to water
     * @returns Promise that resolves with the server response
     */
    public waterPlant(plantId: string): Promise<GameActionResponse> {
        return new Promise((resolve) => {
            if (!this.socket?.connected) {
                console.warn('[SocketService] Cannot water plant, socket not connected');
                resolve({ success: false, error: 'Socket not connected' });
                return;
            }

            const payload: WaterPlantPayload = { plantId };
            console.log('🌱 [SocketService] Emitting water_plant:', payload);
            this.socket.emit(SOCKET_EVENTS.WATER_PLANT, payload, (response: GameActionResponse) => {
                console.log('🌱 [SocketService] water_plant response:', response);
                resolve(response);
            });

            // Timeout fallback if server doesn't respond with callback
            setTimeout(() => {
                resolve({ success: false, error: 'Request timeout' });
            }, 10000);
        });
    }

    /**
     * Harvest a mature plant
     * Emit: 'harvest_plant', { plantId: string }
     * @param plantId - The UUID of the plant to harvest
     * @returns Promise that resolves with the server response
     */
    public harvestPlant(plantId: string): Promise<GameActionResponse> {
        return new Promise((resolve) => {
            if (!this.socket?.connected) {
                console.warn('[SocketService] Cannot harvest plant, socket not connected');
                resolve({ success: false, error: 'Socket not connected' });
                return;
            }

            const payload: HarvestPlantPayload = { plantId };
            console.log('🌾 [SocketService] Emitting harvest_plant:', payload);
            this.socket.emit(SOCKET_EVENTS.HARVEST_PLANT, payload, (response: GameActionResponse) => {
                console.log('🌾 [SocketService] harvest_plant response:', response);
                resolve(response);
            });

            // Timeout fallback if server doesn't respond with callback
            setTimeout(() => {
                resolve({ success: false, error: 'Request timeout' });
            }, 10000);
        });
    }

    /**
     * Debug method: Log current connection state
     */
    public debugConnectionState(): void {
        console.log('=== SocketService Debug Info ===');
        console.log('Status:', this.status);
        console.log('Socket ID:', this.socket?.id);
        console.log('Connected:', this.socket?.connected);
        console.log('Disconnected:', this.socket?.disconnected);
        console.log('Namespace:', SocketService.SOCKET_NAMESPACE);
        console.log('URL:', `${SocketService.API_BASE_URL}${SocketService.SOCKET_NAMESPACE}`);
        console.log('Reconnect attempts:', this.reconnectAttempts);
        console.log('================================');
    }
}

// Export singleton instance getter
export const getSocketService = (): SocketService => SocketService.getInstance();
