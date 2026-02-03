import React, { useEffect, useState, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { EventBus } from '@/game/EventBus';
import { GameSessionService, GameSession } from '@/game/GameSessionService';
import { getSocketService } from '@/game/SocketService';
import { ActionSuccessPayload, ActionErrorPayload } from '@/game/types/SocketTypes';
import Tetris from './Games/Tetris/tetris';
import Snake from './Games/Snake/snake';
import BrickBreaker from './Games/BrickBreaker/brickbreaker';
import Minesweeper from './Games/Minesweeper/minesweeper';

// Game configurations
const GAME_CONFIGS: Record<string, { name: string; description: string }> = {
    tetris: {
        name: 'Tetris',
        description: 'Classic block puzzle game',
    },
    snake: {
        name: 'Snake',
        description: 'Classic snake game',
    },
    brickbreaker: {
        name: 'Brick Breaker',
        description: 'Break all the bricks',
    },
    minesweeper: {
        name: 'Minesweeper',
        description: 'Find all the mines',
    },
};

// Store root reference for cleanup
let gameRoot: Root | null = null;

/**
 * Mini Game Renderer - Renders mini games in DOM overlay
 * Listens to EventBus events from Phaser GameHouseManager
 */
export function initMiniGameOverlay() {
    const handleOpenGame = ({ gameId, containerId }: { gameId: string; containerId: string }) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Cleanup previous root if exists
        if (gameRoot) {
            gameRoot.unmount();
            gameRoot = null;
        }

        // Create new root and render game wrapper with loading
        gameRoot = createRoot(container);
        
        const config = GAME_CONFIGS[gameId];
        if (config) {
            gameRoot.render(<GameWrapper gameId={gameId} config={config} />);
        } else {
            gameRoot.render(
                <div style={{ color: 'white', textAlign: 'center', padding: '40px' }}>
                    Game not found
                </div>
            );
        }
    };

    const handleCloseGame = () => {
        if (gameRoot) {
            gameRoot.unmount();
            gameRoot = null;
        }
    };

    // Listen to events
    EventBus.on('minigame:open', handleOpenGame);
    EventBus.on('minigame:close', handleCloseGame);

    // Return cleanup function
    return () => {
        EventBus.off('minigame:open', handleOpenGame);
        EventBus.off('minigame:close', handleCloseGame);
        if (gameRoot) {
            gameRoot.unmount();
            gameRoot = null;
        }
    };
}

interface GameWrapperProps {
    gameId: string;
    config: { name: string; description: string };
}

/**
 * Game wrapper with session management
 */
function GameWrapper({ gameId, config }: GameWrapperProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [session, setSession] = useState<GameSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmittingScore, setIsSubmittingScore] = useState(false);
    const [scoreSubmitted, setScoreSubmitted] = useState(false); // Prevent duplicate submissions
    const startTimeRef = useRef<number>(0);

    // Get or create game session on mount
    useEffect(() => {
        const initGame = async () => {
            setIsLoading(true);
            setError(null);
            
            // Get existing game or create new one (only creates once per user)
            const result = await GameSessionService.getOrCreateGame(
                config.name,
                config.description
            );
            
            if (result) {
                setSession(result);
                startTimeRef.current = Date.now();
            } else {
                setError('Failed to initialize game. Please try again.');
            }
            
            setIsLoading(false);
        };
        
        initGame();
    }, [config]);

    // Listen for WebSocket responses
    useEffect(() => {
        const handleScoreSuccess = (payload: ActionSuccessPayload) => {
            if (payload.action === 'save_score') {
                setIsSubmittingScore(false);
            }
        };

        const handleScoreError = (payload: ActionErrorPayload) => {
            if (payload.action === 'save_score') {
                setIsSubmittingScore(false);
            }
        };

        EventBus.on('socket:action_success', handleScoreSuccess);
        EventBus.on('socket:action_error', handleScoreError);

        return () => {
            EventBus.off('socket:action_success', handleScoreSuccess);
            EventBus.off('socket:action_error', handleScoreError);
        };
    }, []);

    const handleGameOver = async (score: number) => {
        if (!session || scoreSubmitted) {
            return;
        }
        
        setScoreSubmitted(true);
        setIsSubmittingScore(true);
        
        const playTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Try WebSocket first, fallback to REST API
        const socketService = getSocketService();
        if (socketService.isConnected()) {
            socketService.saveScore(session.id, score, {
                time: playTime,
                gameType: gameId,
            });
        } else {
            // Fallback to REST API
            await GameSessionService.submitScore(session.id, score, {
                time: playTime,
                gameType: gameId,
            });
            setIsSubmittingScore(false);
        }
    };

    const handleRestart = () => {
        // Reset for new game round
        setScoreSubmitted(false);
        startTimeRef.current = Date.now();
    };

    // Loading state
    if (isLoading) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '300px',
                color: 'white',
                gap: '16px',
            }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    border: '4px solid #5D4037',
                    borderTop: '4px solid #FFD700',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                }} />
                <p style={{ 
                    fontFamily: 'PixelFont, Arial, sans-serif',
                    color: '#FFD700',
                }}>
                    Starting...
                </p>
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '300px',
                color: 'white',
                gap: '16px',
                padding: '20px',
            }}>
                <p style={{ 
                    fontFamily: 'PixelFont, Arial, sans-serif',
                    color: '#ff5252',
                    textAlign: 'center',
                }}>
                    {error}
                </p>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        padding: '12px 24px',
                        backgroundColor: '#7BC043',
                        color: 'white',
                        borderRadius: '8px',
                        border: '2px solid #5D9B3A',
                        cursor: 'pointer',
                        fontFamily: 'PixelFont, Arial, sans-serif',
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    // Session ready - render game immediately
    switch (gameId) {
        case 'tetris':
            return (
                <>
                    <Tetris onGameOver={handleGameOver} onRestart={handleRestart} />
                    {isSubmittingScore && (
                        <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.8)',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            color: '#FFD700',
                            fontFamily: 'PixelFont, Arial, sans-serif',
                            fontSize: '12px',
                        }}>
                            Saving score...
                        </div>
                    )}
                </>
            );
        case 'snake':
            return (
                <>
                    <Snake onGameOver={handleGameOver} onRestart={handleRestart} />
                    {isSubmittingScore && (
                        <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.8)',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            color: '#FFD700',
                            fontFamily: 'PixelFont, Arial, sans-serif',
                            fontSize: '12px',
                        }}>
                            Saving score...
                        </div>
                    )}
                </>
            );
        case 'brickbreaker':
            return (
                <>
                    <BrickBreaker onGameOver={handleGameOver} onRestart={handleRestart} />
                    {isSubmittingScore && (
                        <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.8)',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            color: '#FFD700',
                            fontFamily: 'PixelFont, Arial, sans-serif',
                            fontSize: '12px',
                        }}>
                            Saving score...
                        </div>
                    )}
                </>
            );
        case 'minesweeper':
            return (
                <>
                    <Minesweeper onGameOver={handleGameOver} onRestart={handleRestart} />
                    {isSubmittingScore && (
                        <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.8)',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            color: '#FFD700',
                            fontFamily: 'PixelFont, Arial, sans-serif',
                            fontSize: '12px',
                        }}>
                            Saving score...
                        </div>
                    )}
                </>
            );
        default:
            return (
                <div style={{ color: 'white', textAlign: 'center', padding: '40px' }}>
                    Game not found
                </div>
            );
    }
}
