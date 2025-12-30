// src/game/ChatSocketService.ts
import { io, Socket } from 'socket.io-client';
import { EventBus } from './EventBus';
import {
    ChatMessage,
    MessageType,
    NewMessagePayload,
    MessageNotificationPayload,
    UserTypingPayload,
    MessageReadPayload,
    JoinConversationPayload,
    LeaveConversationPayload,
    SendMessagePayload,
    TypingPayload,
    MarkReadPayload,
    CHAT_EVENTS,
} from './types/ChatTypes';
import { SocketConnectionStatus } from './types/SocketTypes';

/**
 * ChatSocketService - Manages WebSocket connection for chat/messaging features
 * 
 * IMPORTANT: Connects to the /chat namespace on the backend
 * 
 * Events emitted via EventBus (Server -> Client):
 * - 'chat:connected' - When connection is established
 * - 'chat:disconnected' - When connection is lost
 * - 'chat:new_message' - When a new message is received
 * - 'chat:notification' - When a message notification is received
 * - 'chat:user_typing' - When a user starts/stops typing
 * - 'chat:message_read' - When messages are marked as read
 * 
 * Client -> Server Events:
 * - 'joinConversation' - Subscribe to conversation updates
 * - 'leaveConversation' - Unsubscribe from conversation
 * - 'sendMessage' - Send a message
 * - 'typing' - Send typing indicator
 * - 'markRead' - Mark messages as read
 */
export class ChatSocketService {
    private static instance: ChatSocketService | null = null;
    private socket: Socket | null = null;
    private status: SocketConnectionStatus = 'disconnected';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private joinedConversations: Set<string> = new Set();

    // Base URL without namespace
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    // Socket.IO namespace for chat events
    private static SOCKET_NAMESPACE = '/chat';

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): ChatSocketService {
        if (!ChatSocketService.instance) {
            ChatSocketService.instance = new ChatSocketService();
        }
        return ChatSocketService.instance;
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
     * Get list of joined conversation IDs
     */
    public getJoinedConversations(): string[] {
        return Array.from(this.joinedConversations);
    }

    /**
     * Connect to the WebSocket server
     * @param token - JWT access token for authentication
     */
    public connect(token?: string): void {
        if (this.socket?.connected) {
            console.log('[ChatSocketService] Already connected');
            return;
        }

        // Get token from parameter or localStorage
        const authToken = token || this.getAccessToken();
        if (!authToken) {
            console.warn('[ChatSocketService] No auth token available, skipping connection');
            return;
        }

        this.status = 'connecting';
        
        // Connect to the /chat namespace
        const socketUrl = `${ChatSocketService.API_BASE_URL}${ChatSocketService.SOCKET_NAMESPACE}`;
        console.log('[ChatSocketService] Connecting to:', socketUrl);

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
        this.setupDebugListeners();
    }

    /**
     * Disconnect from the WebSocket server
     */
    public disconnect(): void {
        if (this.socket) {
            console.log('[ChatSocketService] Disconnecting...');
            this.joinedConversations.clear();
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
        this.socket.on(CHAT_EVENTS.CONNECT, () => {
            console.log('[ChatSocketService] ✅ Connected to /chat namespace');
            console.log('[ChatSocketService] Socket ID:', this.socket?.id);
            this.status = 'connected';
            this.reconnectAttempts = 0;
            
            // Rejoin conversations after reconnect
            this.rejoinConversations();
            
            EventBus.emit('chat:connected');
        });

        this.socket.on(CHAT_EVENTS.DISCONNECT, (reason) => {
            console.log('[ChatSocketService] ❌ Disconnected:', reason);
            this.status = 'disconnected';
            EventBus.emit('chat:disconnected', reason);
        });

        this.socket.on(CHAT_EVENTS.CONNECT_ERROR, (error) => {
            console.error('[ChatSocketService] ⚠️ Connection error:', error.message);
            this.status = 'error';
            this.reconnectAttempts++;
        });

        // Chat events - Server -> Client
        this.socket.on(CHAT_EVENTS.NEW_MESSAGE, (payload: NewMessagePayload) => {
            console.log('💬 [ChatSocketService] RECEIVED newMessage:', payload.id, 'in', payload.conversationId);
            EventBus.emit('chat:new_message', payload);
        });

        this.socket.on(CHAT_EVENTS.MESSAGE_NOTIFICATION, (payload: MessageNotificationPayload) => {
            console.log('🔔 [ChatSocketService] RECEIVED messageNotification:', payload.conversationId);
            EventBus.emit('chat:notification', payload);
        });

        this.socket.on(CHAT_EVENTS.USER_TYPING, (payload: UserTypingPayload) => {
            console.log('✍️ [ChatSocketService] RECEIVED userTyping:', payload.userId, payload.isTyping ? 'typing' : 'stopped');
            EventBus.emit('chat:user_typing', payload);
        });

        this.socket.on(CHAT_EVENTS.MESSAGE_READ, (payload: MessageReadPayload) => {
            console.log('👁️ [ChatSocketService] RECEIVED messageRead:', payload.userId, 'in', payload.conversationId);
            EventBus.emit('chat:message_read', payload);
        });
    }

    /**
     * Setup debug listeners
     */
    private setupDebugListeners(): void {
        if (!this.socket) return;

        this.socket.onAny((eventName: string, ...args: unknown[]) => {
            console.log(`📡 [ChatSocketService] Incoming: "${eventName}"`, args);
        });

        this.socket.onAnyOutgoing((eventName: string, ...args: unknown[]) => {
            console.log(`📤 [ChatSocketService] Outgoing: "${eventName}"`, args);
        });

        this.socket.io.on('reconnect', (attempt) => {
            console.log('[ChatSocketService] 🔄 Reconnected after', attempt, 'attempts');
        });

        this.socket.io.on('reconnect_failed', () => {
            console.error('[ChatSocketService] 🔄 Reconnection failed');
        });
    }

    /**
     * Rejoin conversations after reconnect
     */
    private rejoinConversations(): void {
        if (this.joinedConversations.size > 0) {
            console.log('[ChatSocketService] Rejoining', this.joinedConversations.size, 'conversations');
            this.joinedConversations.forEach(conversationId => {
                this.socket?.emit(CHAT_EVENTS.JOIN_CONVERSATION, { conversationId });
            });
        }
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
     * Join a conversation (subscribe to updates)
     * Emit: 'joinConversation', { conversationId }
     */
    public joinConversation(conversationId: string): void {
        if (!this.socket?.connected) {
            console.warn('[ChatSocketService] Cannot join conversation, not connected');
            return;
        }

        const payload: JoinConversationPayload = { conversationId };
        console.log('📥 [ChatSocketService] Emitting joinConversation:', conversationId);
        this.socket.emit(CHAT_EVENTS.JOIN_CONVERSATION, payload);
        this.joinedConversations.add(conversationId);
    }

    /**
     * Leave a conversation (unsubscribe from updates)
     * Emit: 'leaveConversation', { conversationId }
     */
    public leaveConversation(conversationId: string): void {
        if (!this.socket?.connected) {
            console.warn('[ChatSocketService] Cannot leave conversation, not connected');
            return;
        }

        const payload: LeaveConversationPayload = { conversationId };
        console.log('📤 [ChatSocketService] Emitting leaveConversation:', conversationId);
        this.socket.emit(CHAT_EVENTS.LEAVE_CONVERSATION, payload);
        this.joinedConversations.delete(conversationId);
    }

    /**
     * Send a message to a conversation
     * Emit: 'sendMessage', { conversationId, content, type? }
     */
    public sendMessage(conversationId: string, content: string, type: MessageType = 'TEXT'): void {
        if (!this.socket?.connected) {
            console.warn('[ChatSocketService] Cannot send message, not connected');
            return;
        }

        const payload: SendMessagePayload = { conversationId, content, type };
        console.log('💬 [ChatSocketService] Emitting sendMessage:', conversationId, type);
        this.socket.emit(CHAT_EVENTS.SEND_MESSAGE, payload);
    }

    /**
     * Send typing indicator
     * Emit: 'typing', { conversationId, isTyping }
     */
    public setTyping(conversationId: string, isTyping: boolean): void {
        if (!this.socket?.connected) {
            console.warn('[ChatSocketService] Cannot send typing, not connected');
            return;
        }

        const payload: TypingPayload = { conversationId, isTyping };
        console.log('✍️ [ChatSocketService] Emitting typing:', conversationId, isTyping);
        this.socket.emit(CHAT_EVENTS.TYPING, payload);
    }

    /**
     * Mark messages as read in a conversation
     * Emit: 'markRead', { conversationId }
     */
    public markRead(conversationId: string): void {
        if (!this.socket?.connected) {
            console.warn('[ChatSocketService] Cannot mark read, not connected');
            return;
        }

        const payload: MarkReadPayload = { conversationId };
        console.log('👁️ [ChatSocketService] Emitting markRead:', conversationId);
        this.socket.emit(CHAT_EVENTS.MARK_READ, payload);
    }

    /**
     * Debug method: Log current connection state
     */
    public debugConnectionState(): void {
        console.log('=== ChatSocketService Debug Info ===');
        console.log('Status:', this.status);
        console.log('Socket ID:', this.socket?.id);
        console.log('Connected:', this.socket?.connected);
        console.log('Namespace:', ChatSocketService.SOCKET_NAMESPACE);
        console.log('URL:', `${ChatSocketService.API_BASE_URL}${ChatSocketService.SOCKET_NAMESPACE}`);
        console.log('Joined Conversations:', Array.from(this.joinedConversations));
        console.log('====================================');
    }
}

// Export singleton instance getter
export const getChatSocketService = (): ChatSocketService => ChatSocketService.getInstance();
