// src/game/types/LobbyTypes.ts
// Socket.IO event types for Lobby Gateway (/lobby)

/**
 * User state in the lobby
 */
export interface UserLobbyState {
    userId: string;
    socketId: string;
    username: string;
    avatar: string;
    title?: string;
    x: number;
    y: number;
    zone?: string;
    characterType: number;
}

/**
 * Payload for move event (Client -> Server)
 */
export interface MovePayload {
    x: number;
    y: number;
    zone?: string;
}

/**
 * Payload for chat events (Client -> Server)
 */
export interface ChatPayload {
    message: string;
}

/**
 * Payload for emote event (Client -> Server)
 */
export interface EmotePayload {
    emoteId: string;
}

/**
 * Payload for interact event (Client -> Server)
 */
export interface InteractPayload {
    targetId: string;
    action: string;
}

/**
 * Payload for lobby_state event (Server -> Client)
 * Initial state of all users in the lobby
 */
export type LobbyStatePayload = UserLobbyState[];

/**
 * Payload for user_joined event (Server -> Client)
 */
export type UserJoinedPayload = UserLobbyState;

/**
 * Payload for user_left event (Server -> Client)
 */
export interface UserLeftPayload {
    userId: string;
}

/**
 * Payload for user_moved event (Server -> Client)
 */
export type UserMovedPayload = UserLobbyState;

/**
 * Chat scope type
 */
export type ChatScope = 'GLOBAL' | 'PROXIMITY';

/**
 * Payload for lobby_chat event (Server -> Client)
 */
export interface LobbyChatPayload {
    userId: string;
    username: string;
    message: string;
    scope: ChatScope;
    timestamp: string; // ISO date string
}

/**
 * Payload for emote event (Server -> Client)
 */
export interface EmoteReceivedPayload {
    userId: string;
    emoteId: string;
}

/**
 * Payload for interaction_effect event (Server -> Client)
 */
export interface InteractionEffectPayload {
    sourceId: string;
    targetId: string;
    action: string;
}

/**
 * Lobby socket event names
 */
export const LOBBY_EVENTS = {
    // Server -> Client events
    LOBBY_STATE: 'lobby_state',
    USER_JOINED: 'user_joined',
    USER_LEFT: 'user_left',
    USER_MOVED: 'user_moved',
    LOBBY_CHAT: 'lobby_chat',
    EMOTE: 'emote',
    INTERACTION_EFFECT: 'interaction_effect',
    
    // Client -> Server events
    MOVE: 'move',
    CHAT_GLOBAL: 'chat_global',
    CHAT_PROXIMITY: 'chat_proximity',
    EMOTE_SEND: 'emote',
    INTERACT: 'interact',
    
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
} as const;
