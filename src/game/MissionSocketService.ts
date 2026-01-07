// src/game/MissionSocketService.ts
import { io, Socket } from 'socket.io-client';
import { EventBus } from './EventBus';
import { Mission } from './MissionService';

// Socket event names for mission gateway
export const MISSION_SOCKET_EVENTS = {
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
    
    // Client -> Server
    SUBMIT_PROOF: 'mission:submit_proof',
    
    // Server -> Client
    MISSION_UPDATED: 'mission:updated',
} as const;

// Payload types
export interface SubmitProofPayload {
    missionId: string;
    proof: string;
}

export interface MissionUpdatedPayload extends Mission {
    missionId: string; // config id (different from id which is db uuid)
}

export type MissionSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * MissionSocketService - Manages WebSocket connection for mission features
 * 
 * IMPORTANT: Connects to the /mission namespace on the backend
 * Auth: Uses query param ?userId=USER_UUID (different from other gateways)
 * 
 * Events emitted via EventBus (Server -> Client):
 * - 'mission_socket:connected' - When connection is established
 * - 'mission_socket:disconnected' - When connection is lost
 * - 'mission_socket:mission_updated' - When a mission is updated
 * 
 * Client -> Server Events:
 * - 'mission:submit_proof' - Submit proof for a mission
 */
export class MissionSocketService {
    private static instance: MissionSocketService | null = null;
    private socket: Socket | null = null;
    private status: MissionSocketConnectionStatus = 'disconnected';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;

    // Base URL without namespace
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    // Socket.IO namespace for mission events
    private static SOCKET_NAMESPACE = '/mission';

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): MissionSocketService {
        if (!MissionSocketService.instance) {
            MissionSocketService.instance = new MissionSocketService();
        }
        return MissionSocketService.instance;
    }

    /**
     * Get current connection status
     */
    public getStatus(): MissionSocketConnectionStatus {
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
     * @param userId - User UUID for authentication (query param)
     */
    public connect(userId?: string): void {
        if (this.socket?.connected) {
            console.log('[MissionSocketService] Already connected');
            return;
        }

        // Get userId from parameter or localStorage
        const authUserId = userId || this.getUserId();
        if (!authUserId) {
            console.warn('[MissionSocketService] No userId available, skipping connection');
            return;
        }

        this.status = 'connecting';
        
        // Connect to the /mission namespace with userId as query param
        const socketUrl = `${MissionSocketService.API_BASE_URL}${MissionSocketService.SOCKET_NAMESPACE}`;
        console.log('[MissionSocketService] Connecting to:', socketUrl);
        console.log('[MissionSocketService] UserId:', authUserId);

        this.socket = io(socketUrl, {
            query: {
                userId: authUserId,
            },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
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
            console.log('[MissionSocketService] Disconnecting...');
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
        this.socket.on(MISSION_SOCKET_EVENTS.CONNECT, () => {
            console.log('[MissionSocketService] ✅ Connected successfully to /mission namespace');
            console.log('[MissionSocketService] Socket ID:', this.socket?.id);
            this.status = 'connected';
            this.reconnectAttempts = 0;
            EventBus.emit('mission_socket:connected');
        });

        this.socket.on(MISSION_SOCKET_EVENTS.DISCONNECT, (reason) => {
            console.log('[MissionSocketService] ❌ Disconnected:', reason);
            this.status = 'disconnected';
            EventBus.emit('mission_socket:disconnected', reason);
        });

        this.socket.on(MISSION_SOCKET_EVENTS.CONNECT_ERROR, (error) => {
            console.error('[MissionSocketService] ⚠️ Connection error:', error.message);
            this.status = 'error';
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[MissionSocketService] Max reconnection attempts reached');
            }
        });

        // Mission events - Server -> Client
        this.socket.on(MISSION_SOCKET_EVENTS.MISSION_UPDATED, (payload: MissionUpdatedPayload) => {
            console.log('📋 [MissionSocketService] RECEIVED mission:updated:', payload);
            EventBus.emit('mission_socket:mission_updated', payload);
        });
    }

    /**
     * Setup debug listeners
     */
    private setupDebugListeners(): void {
        if (!this.socket) return;

        this.socket.onAny((eventName: string, ...args: unknown[]) => {
            console.log(`📡 [MissionSocketService] Incoming event: "${eventName}"`, args);
        });

        this.socket.onAnyOutgoing((eventName: string, ...args: unknown[]) => {
            console.log(`📤 [MissionSocketService] Outgoing event: "${eventName}"`, args);
        });

        this.socket.io.on('reconnect', (attempt) => {
            console.log('[MissionSocketService] 🔄 Reconnected after', attempt, 'attempts');
        });

        this.socket.io.on('reconnect_failed', () => {
            console.error('[MissionSocketService] 🔄 Reconnection failed permanently');
        });
    }

    /**
     * Get userId from localStorage (from stored user data)
     */
    private getUserId(): string | null {
        if (typeof window === 'undefined') return null;
        const userData = localStorage.getItem('fam_game_user');
        if (userData) {
            try {
                const user = JSON.parse(userData);
                return user.id || null;
            } catch {
                return null;
            }
        }
        return null;
    }

    /**
     * Get the socket ID
     */
    public getSocketId(): string | null {
        return this.socket?.id || null;
    }

    // ==========================================
    // Mission Action Methods (Client -> Server)
    // ==========================================

    /**
     * Submit proof for a mission via WebSocket
     * Emit: 'mission:submit_proof', { missionId: string, proof: string }
     * Response comes via 'mission:updated' event
     * @param missionId - The mission ID
     * @param proof - The proof URL (link or IPFS image URL)
     * @returns true if emitted successfully, false if not connected
     */
    public submitProof(missionId: string, proof: string): boolean {
        if (!this.socket?.connected) {
            console.warn('[MissionSocketService] Cannot submit proof, socket not connected');
            return false;
        }

        const payload: SubmitProofPayload = { missionId, proof };
        console.log('📋 [MissionSocketService] Emitting mission:submit_proof:', payload);
        this.socket.emit(MISSION_SOCKET_EVENTS.SUBMIT_PROOF, payload);
        return true;
    }

    /**
     * Debug method: Log current connection state
     */
    public debugConnectionState(): void {
        console.log('=== MissionSocketService Debug Info ===');
        console.log('Status:', this.status);
        console.log('Socket ID:', this.socket?.id);
        console.log('Connected:', this.socket?.connected);
        console.log('Namespace:', MissionSocketService.SOCKET_NAMESPACE);
        console.log('URL:', `${MissionSocketService.API_BASE_URL}${MissionSocketService.SOCKET_NAMESPACE}`);
        console.log('========================================');
    }
}

// Export singleton instance getter
export const getMissionSocketService = (): MissionSocketService => MissionSocketService.getInstance();
