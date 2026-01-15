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
    CLAIM_REWARD: 'mission:claim_reward',
    
    // Server -> Client
    MISSION_UPDATED: 'mission:updated',
    MISSION_CLAIMED: 'mission:claimed',
} as const;

// Payload types
export interface SubmitProofPayload {
    missionId: string;
    proof: string;
}

export interface ClaimRewardPayload {
    missionId: string;
}

export interface MissionReward {
    xp: number;
    reputation: number;
    items: Array<{ type: string; amount: number }>;
}

export interface MissionUpdatedPayload extends Mission {
    missionId: string; // config id (different from id which is db uuid)
}

export interface MissionClaimedPayload {
    success: boolean;
    missionId: string;
    rewards: MissionReward;
}

export type MissionSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * MissionSocketService - Manages WebSocket connection for mission features
 * 
 * IMPORTANT: Connects to the /mission namespace on the backend
 * Auth: Uses query param ?token=JWT_TOKEN
 * 
 * Events emitted via EventBus (Server -> Client):
 * - 'mission_socket:connected' - When connection is established
 * - 'mission_socket:disconnected' - When connection is lost
 * - 'mission_socket:mission_updated' - When a mission is updated
 * - 'mission_socket:mission_claimed' - When a mission reward is claimed
 * 
 * Client -> Server Events:
 * - 'mission:submit_proof' - Submit proof for a mission
 * - 'mission:claim_reward' - Claim reward for a completed mission
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
     * @param token - JWT access token for authentication (query param)
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
        
        // Connect to the /mission namespace with token as query param
        const socketUrl = `${MissionSocketService.API_BASE_URL}${MissionSocketService.SOCKET_NAMESPACE}`;

        this.socket = io(socketUrl, {
            query: {
                token: authToken,
            },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
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
        this.socket.on(MISSION_SOCKET_EVENTS.CONNECT, () => {
            this.status = 'connected';
            this.reconnectAttempts = 0;
            EventBus.emit('mission_socket:connected');
        });

        this.socket.on(MISSION_SOCKET_EVENTS.DISCONNECT, (reason) => {
            this.status = 'disconnected';
            EventBus.emit('mission_socket:disconnected', reason);
        });

        this.socket.on(MISSION_SOCKET_EVENTS.CONNECT_ERROR, (error) => {
            this.status = 'error';
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            }
        });

        // Mission events - Server -> Client
        this.socket.on(MISSION_SOCKET_EVENTS.MISSION_UPDATED, (payload: MissionUpdatedPayload) => {
            EventBus.emit('mission_socket:mission_updated', payload);
        });

        this.socket.on(MISSION_SOCKET_EVENTS.MISSION_CLAIMED, (payload: MissionClaimedPayload) => {
            EventBus.emit('mission_socket:mission_claimed', payload);
        });
    }

    /**
     * Setup debug listeners
     */
    private setupDebugListeners(): void {
        if (!this.socket) return;

        this.socket.onAny((eventName: string, ...args: unknown[]) => {
        });

        this.socket.onAnyOutgoing((eventName: string, ...args: unknown[]) => {
        });

        this.socket.io.on('reconnect', (attempt) => {
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
            return false;
        }

        const payload: SubmitProofPayload = { missionId, proof };
        this.socket.emit(MISSION_SOCKET_EVENTS.SUBMIT_PROOF, payload);
        return true;
    }

    /**
     * Claim reward for a completed mission via WebSocket
     * Emit: 'mission:claim_reward', { missionId: string }
     * Response comes via 'mission:claimed' event
     * @param missionId - The mission ID to claim reward for
     * @returns true if emitted successfully, false if not connected
     */
    public claimReward(missionId: string): boolean {
        if (!this.socket?.connected) {
            return false;
        }

        const payload: ClaimRewardPayload = { missionId };
        this.socket.emit(MISSION_SOCKET_EVENTS.CLAIM_REWARD, payload);
        return true;
    }
}

// Export singleton instance getter
export const getMissionSocketService = (): MissionSocketService => MissionSocketService.getInstance();
