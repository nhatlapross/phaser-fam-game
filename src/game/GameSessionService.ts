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
    metadata: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}

export interface CreateGameRequest {
    name: string;
    description: string;
}

export interface SubmitScoreRequest {
    gameId: string;
    score: number;
    metadata?: Record<string, any>;
}

export class GameSessionService {
    /**
     * Create a new game session
     */
    static async createSession(request: CreateGameRequest): Promise<GameSession | null> {
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
     * Submit score for a game session
     */
    static async submitScore(request: SubmitScoreRequest): Promise<GameScore | null> {
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
}
