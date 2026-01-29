import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { EventBus } from '@/game/EventBus';
import MangaStudio from './Games/MangaStudio/MangaStudio';

// Store root reference for cleanup
let mangaRoot: Root | null = null;

/**
 * Manga Studio Overlay - Renders MangaStudio component in DOM overlay
 * Listens to EventBus events from Phaser MangaStudioManager
 */
export function initMangaStudioOverlay() {
    const handleOpen = ({ containerId }: { containerId: string }) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Cleanup previous root if exists
        if (mangaRoot) {
            mangaRoot.unmount();
            mangaRoot = null;
        }

        // Create new root and render MangaStudio
        mangaRoot = createRoot(container);
        mangaRoot.render(<MangaStudio />);
    };

    const handleClose = () => {
        if (mangaRoot) {
            mangaRoot.unmount();
            mangaRoot = null;
        }
    };

    // Listen to events
    EventBus.on('mangastudio:open', handleOpen);
    EventBus.on('mangastudio:close', handleClose);

    // Return cleanup function
    return () => {
        EventBus.off('mangastudio:open', handleOpen);
        EventBus.off('mangastudio:close', handleClose);
        if (mangaRoot) {
            mangaRoot.unmount();
            mangaRoot = null;
        }
    };
}
