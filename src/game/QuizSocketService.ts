// src/game/QuizSocketService.ts
import { io, Socket } from 'socket.io-client';
import { EventBus } from './EventBus';
import {
    QuizStartPayload,
    QuizSubmitPayload,
    QuizAnswerSubmit,
    QuizStartedPayload,
    QuizResultPayload,
} from './types/SocketTypes';

// Socket event names for quiz gateway
export const QUIZ_SOCKET_EVENTS = {
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
    
    // Client -> Server
    START: 'quiz:start',
    SUBMIT: 'quiz:submit',
    
    // Server -> Client
    STARTED: 'quiz:started',
    RESULT: 'quiz:result',
} as const;

export type QuizSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * QuizSocketService - Manages WebSocket connection for quiz features
 * 
 * IMPORTANT: Connects to the /quiz namespace on the backend
 * Auth: Uses query param ?token=JWT_TOKEN
 * 
 * Events emitted via EventBus (Server -> Client):
 * - 'quiz_socket:connected' - When connection is established
 * - 'quiz_socket:disconnected' - When connection is lost
 * - 'quiz_socket:started' - When a quiz is started
 * - 'quiz_socket:result' - When quiz results are received
 * 
 * Client -> Server Events:
 * - 'quiz:start' - Start a quiz
 * - 'quiz:submit' - Submit quiz answers
 */
export class QuizSocketService {
    private static instance: QuizSocketService | null = null;
    private socket: Socket | null = null;
    private status: QuizSocketConnectionStatus = 'disconnected';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;

    // Base URL without namespace
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    // Socket.IO namespace for quiz events
    private static SOCKET_NAMESPACE = '/quiz';

    private constructor() {}

    /**
     * Get singleton instance
     */
    public static getInstance(): QuizSocketService {
        if (!QuizSocketService.instance) {
            QuizSocketService.instance = new QuizSocketService();
        }
        return QuizSocketService.instance;
    }

    /**
     * Get current connection status
     */
    public getStatus(): QuizSocketConnectionStatus {
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
        
        // Connect to the /quiz namespace with token as query param
        const socketUrl = `${QuizSocketService.API_BASE_URL}${QuizSocketService.SOCKET_NAMESPACE}`;

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
        this.socket.on(QUIZ_SOCKET_EVENTS.CONNECT, () => {
            this.status = 'connected';
            this.reconnectAttempts = 0;
            EventBus.emit('quiz_socket:connected');
        });

        this.socket.on(QUIZ_SOCKET_EVENTS.DISCONNECT, (reason) => {
            this.status = 'disconnected';
            EventBus.emit('quiz_socket:disconnected', reason);
        });

        this.socket.on(QUIZ_SOCKET_EVENTS.CONNECT_ERROR, (error) => {
            this.status = 'error';
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            }
        });

        // Quiz events - Server -> Client
        this.socket.on(QUIZ_SOCKET_EVENTS.STARTED, (payload: QuizStartedPayload) => {
            EventBus.emit('quiz_socket:started', payload);
        });

        this.socket.on(QUIZ_SOCKET_EVENTS.RESULT, (payload: QuizResultPayload) => {
            EventBus.emit('quiz_socket:result', payload);
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
    // Quiz Action Methods (Client -> Server)
    // ==========================================

    /**
     * Start a quiz via WebSocket
     * Emit: 'quiz:start', { quizId: string }
     * Response comes via 'quiz:started' event
     * @param quizId - The quiz ID to start
     * @returns true if emitted successfully, false if not connected
     */
    public startQuiz(quizId: string): boolean {
        if (!this.socket?.connected) {
            return false;
        }

        const payload: QuizStartPayload = { quizId };
        this.socket.emit(QUIZ_SOCKET_EVENTS.START, payload);
        return true;
    }

    /**
     * Submit quiz answers via WebSocket
     * Emit: 'quiz:submit', { quizId: string, answers: [...] }
     * Response comes via 'quiz:result' event
     * @param quizId - The quiz ID
     * @param answers - Array of answers { questionId, answer }
     * @returns true if emitted successfully, false if not connected
     */
    public submitQuiz(quizId: string, answers: QuizAnswerSubmit[]): boolean {
        if (!this.socket?.connected) {
            return false;
        }

        const payload: QuizSubmitPayload = { quizId, answers };
        this.socket.emit(QUIZ_SOCKET_EVENTS.SUBMIT, payload);
        return true;
    }
}

// Export singleton instance getter
export const getQuizSocketService = (): QuizSocketService => QuizSocketService.getInstance();
