/**
 * Game Session Service - Manage game sessions and scores
 */

import { UserService } from './UserService';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export interface GameSession {
    id: string;
    name: string;
    description: string;
    developerId: string;
    createdAt: string;
    updatedAt: string;
}

export interface GameScore {
    id: string;
    userId: string;
    gameId: string;
    score: number;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface CreateGameRequest {
    name: string;
    description: string;
}

export class GameSessionService {
    /**
     * Get all games for current user
     */
    static async getGames(): Promise<GameSession[]> {
        const token = UserService.getAccessToken();
        if (!token) {
            return [];
        }

        try {
            const response = await fetch(`${API_BASE_URL}/game`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                return await response.json();
            }
            return [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Get or create a game by name
     * Returns existing game if found, creates new one if not
     */
    static async getOrCreateGame(name: string, description: string): Promise<GameSession | null> {
        // Get current user ID from stored user data
        const user = UserService.getStoredUser();
        const userId = user?.id;
        
        // First, try to find existing game owned by current user
        const games = await this.getGames();
        const existingGame = games.find(g => g.name === name && g.developerId === userId);
        
        if (existingGame) {
            return existingGame;
        }

        // Create new game if not found
        return await this.createGame({ name, description });
    }

    /**
     * Create a new game
     */
    static async createGame(request: CreateGameRequest): Promise<GameSession | null> {
        const token = UserService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/game`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(request),
            });

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Submit score for a game (REST API fallback)
     */
    static async submitScore(gameId: string, score: number, metadata?: Record<string, unknown>): Promise<GameScore | null> {
        const token = UserService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/game/score`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ gameId, score, metadata }),
            });

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            return null;
        }
    }
}
