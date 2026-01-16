// src/game/LobbySocketService.ts
import { io, Socket } from 'socket.io-client';
import { EventBus } from './EventBus';
import {
    UserLobbyState,
    LobbyStatePayload,
    UserJoinedPayload,
    UserLeftPayload,
    UserMovedPayload,
    LobbyChatPayload,
    EmoteReceivedPayload,
    InteractionEffectPayload,
    MovePayload,
    ChatPayload,
    EmotePayload,
    InteractPayload,
    LOBBY_EVENTS,
} from './types/LobbyTypes';
import { SocketConnectionStatus } from './types/SocketTypes';

/**
 * LobbySocketService - Manages WebSocket connection for lobby/multiplayer features
 * 
 * IMPORTANT: Connects to the /lobby namespace on the backend
 * 
 * Events emitted via EventBus (Server -> Client):
 * - 'lobby:connected' - When connection is established
 * - 'lobby:disconnected' - When connection is lost
 * - 'lobby:state' - Initial state of all users in lobby
 * - 'lobby:user_joined' - When a user joins the lobby
 * - 'lobby:user_left' - When a user leaves the lobby
 * - 'lobby:user_moved' - When a user moves
 * - 'lobby:chat' - When a chat message is received
 * - 'lobby:emote' - When an emote is received
 * - 'lobby:interaction' - When an interaction effect occurs
 * 
 * Client -> Server Events (fire-and-forget):
 * - 'move' - Move character position
 * - 'chat_global' - Send global chat message
 * - 'chat_proximity' - Send proximity chat message
 * - 'emote' - Send emote
 * - 'interact' - Interact with another user/object
 */
export class LobbySocketService {
    private static instance: LobbySocketService | null = null;
    private socket: Socket | null = null;
    private status: SocketConnectionStatus = 'disconnected';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;

    // Base URL without namespace
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    // Socket.IO namespace for lobby events
    private static SOCKET_NAMESPACE = '/lobby';

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): LobbySocketService {
        if (!LobbySocketService.instance) {
            LobbySocketService.instance = new LobbySocketService();
        }
        return LobbySocketService.instance;
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
        
        // Connect to the /lobby namespace
        const socketUrl = `${LobbySocketService.API_BASE_URL}${LobbySocketService.SOCKET_NAMESPACE}`;

        this.socket = io(socketUrl, {
            auth: {
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
        this.socket.on(LOBBY_EVENTS.CONNECT, () => {
            this.status = 'connected';
            this.reconnectAttempts = 0;
            EventBus.emit('lobby:connected');
        });

        this.socket.on(LOBBY_EVENTS.DISCONNECT, (reason) => {
            this.status = 'disconnected';
            EventBus.emit('lobby:disconnected', reason);
        });

        this.socket.on(LOBBY_EVENTS.CONNECT_ERROR, (error) => {
            this.status = 'error';
            this.reconnectAttempts++;
        });

        // Lobby events - Server -> Client
        this.socket.on(LOBBY_EVENTS.LOBBY_STATE, (payload: LobbyStatePayload) => {
            EventBus.emit('lobby:state', payload);
        });

        this.socket.on(LOBBY_EVENTS.USER_JOINED, (payload: UserJoinedPayload) => {
            EventBus.emit('lobby:user_joined', payload);
        });

        this.socket.on(LOBBY_EVENTS.USER_LEFT, (payload: UserLeftPayload) => {
            EventBus.emit('lobby:user_left', payload);
        });

        this.socket.on(LOBBY_EVENTS.USER_MOVED, (payload: UserMovedPayload) => {
            EventBus.emit('lobby:user_moved', payload);
        });

        this.socket.on(LOBBY_EVENTS.LOBBY_CHAT, (payload: LobbyChatPayload) => {
            EventBus.emit('lobby:chat', payload);
        });

        this.socket.on(LOBBY_EVENTS.EMOTE, (payload: EmoteReceivedPayload) => {
            EventBus.emit('lobby:emote', payload);
        });

        this.socket.on(LOBBY_EVENTS.INTERACTION_EFFECT, (payload: InteractionEffectPayload) => {
            EventBus.emit('lobby:interaction', payload);
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
    // Client -> Server Events
    // ==========================================

    /**
     * Move character to a new position
     * Emit: 'move', { x, y, zone? }
     */
    public move(x: number, y: number, zone?: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: MovePayload = { x, y };
        if (zone) payload.zone = zone;
        
        this.socket.emit(LOBBY_EVENTS.MOVE, payload);
    }

    /**
     * Send a global chat message
     * Emit: 'chat_global', { message }
     */
    public chatGlobal(message: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: ChatPayload = { message };
        this.socket.emit(LOBBY_EVENTS.CHAT_GLOBAL, payload);
    }

    /**
     * Send a proximity chat message (nearby users only)
     * Emit: 'chat_proximity', { message }
     */
    public chatProximity(message: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: ChatPayload = { message };
        this.socket.emit(LOBBY_EVENTS.CHAT_PROXIMITY, payload);
    }

    /**
     * Send an emote
     * Emit: 'emote', { emoteId }
     */
    public emote(emoteId: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: EmotePayload = { emoteId };
        this.socket.emit(LOBBY_EVENTS.EMOTE_SEND, payload);
    }

    /**
     * Interact with another user or object
     * Emit: 'interact', { targetId, action }
     */
    public interact(targetId: string, action: string): void {
        if (!this.socket?.connected) {
            return;
        }

        const payload: InteractPayload = { targetId, action };
        this.socket.emit(LOBBY_EVENTS.INTERACT, payload);
    }
}

// Export singleton instance getter
export const getLobbySocketService = (): LobbySocketService => LobbySocketService.getInstance();
