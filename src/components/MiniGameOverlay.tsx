import React, { useEffect, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { EventBus } from '@/game/EventBus';
import Tetris from './Games/Tetris/tetris';

interface MiniGameState {
    gameId: string | null;
    containerId: string | null;
}

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

        // Create new root and render game
        gameRoot = createRoot(container);
        
        switch (gameId) {
            case 'tetris':
                gameRoot.render(<TetrisWrapper />);
                break;
            default:
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

/**
 * Tetris wrapper with score handling
 */
function TetrisWrapper() {
    const handleGameOver = (score: number) => {
        console.log('Tetris game over! Score:', score);
        // TODO: Save score to backend
    };

    return <Tetris onGameOver={handleGameOver} />;
}
