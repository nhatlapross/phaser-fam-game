// src/game/types/ChatTypes.ts
// Socket.IO event types for Chat Gateway (/chat)

/**
 * Message type enum
 */
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE';

/**
 * Chat message structure
 */
export interface ChatMessage {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    type: MessageType;
    createdAt: string; // ISO date string
}

// ==========================================
// Client -> Server Event Payloads
// ==========================================

/**
 * Payload for joinConversation event (Client -> Server)
 */
export interface JoinConversationPayload {
    conversationId: string;
}

/**
 * Payload for leaveConversation event (Client -> Server)
 */
export interface LeaveConversationPayload {
    conversationId: string;
}

/**
 * Payload for sendMessage event (Client -> Server)
 */
export interface SendMessagePayload {
    conversationId: string;
    content: string;
    type?: MessageType; // Default: TEXT
}

/**
 * Payload for typing event (Client -> Server)
 */
export interface TypingPayload {
    conversationId: string;
    isTyping: boolean;
}

/**
 * Payload for markRead event (Client -> Server)
 */
export interface MarkReadPayload {
    conversationId: string;
}

// ==========================================
// Server -> Client Event Payloads
// ==========================================

/**
 * Payload for newMessage event (Server -> Client)
 */
export type NewMessagePayload = ChatMessage;

/**
 * Payload for messageNotification event (Server -> Client)
 */
export interface MessageNotificationPayload {
    conversationId: string;
    message: ChatMessage;
}

/**
 * Payload for userTyping event (Server -> Client)
 */
export interface UserTypingPayload {
    userId: string;
    conversationId: string;
    isTyping: boolean;
}

/**
 * Payload for messageRead event (Server -> Client)
 */
export interface MessageReadPayload {
    userId: string;
    conversationId: string;
}

/**
 * Chat socket event names
 */
export const CHAT_EVENTS = {
    // Server -> Client events
    NEW_MESSAGE: 'newMessage',
    MESSAGE_NOTIFICATION: 'messageNotification',
    USER_TYPING: 'userTyping',
    MESSAGE_READ: 'messageRead',
    
    // Client -> Server events
    JOIN_CONVERSATION: 'joinConversation',
    LEAVE_CONVERSATION: 'leaveConversation',
    SEND_MESSAGE: 'sendMessage',
    TYPING: 'typing',
    MARK_READ: 'markRead',
    
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
} as const;
