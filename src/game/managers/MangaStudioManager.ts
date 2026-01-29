import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

/**
 * MangaStudioManager - Manages Cat House (Manga Studio) interactions
 * Opens modal for AI manga generation
 */

export interface MangaStudioManagerConfig {
    showToastMessage: (text: string, color: number) => void;
}

export class MangaStudioManager {
    private scene: Scene;
    private config: MangaStudioManagerConfig;
    
    // Modal state
    private modalOpen: boolean = false;
    private modalElement: HTMLDivElement | null = null;

    constructor(scene: Scene, config: MangaStudioManagerConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Open Manga Studio modal
     */
    public openModal() {
        if (this.modalOpen) return;
        this.modalOpen = true;

        // Pause the game scene
        this.scene.scene.pause();

        const isMobile = window.innerWidth < 500;

        // Create modal container
        this.modalElement = document.createElement('div');
        this.modalElement.id = 'manga-studio-modal';
        this.modalElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: 'PixelFont', Arial, sans-serif;
            touch-action: manipulation;
        `;

        // Create modal content
        const content = document.createElement('div');
        content.style.cssText = `
            background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%);
            border: 4px solid #5D4037;
            border-radius: 16px;
            padding: ${isMobile ? '12px' : '16px'};
            max-width: ${isMobile ? '95%' : '450px'};
            width: ${isMobile ? '95%' : '90%'};
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            -webkit-overflow-scrolling: touch;
            position: relative;
        `;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            background: none;
            border: none;
            color: #FF5722;
            font-size: ${isMobile ? '28px' : '24px'};
            cursor: pointer;
            padding: ${isMobile ? '8px' : '4px'};
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            z-index: 10;
        `;
        closeBtn.onclick = () => this.closeModal();
        content.appendChild(closeBtn);

        // Manga Studio wrapper
        const studioWrapper = document.createElement('div');
        studioWrapper.id = 'manga-studio-wrapper';
        studioWrapper.style.cssText = `
            display: flex;
            justify-content: center;
            padding-top: 20px;
        `;
        content.appendChild(studioWrapper);

        this.modalElement.appendChild(content);

        // Click outside to close
        this.modalElement.onclick = (e) => {
            if (e.target === this.modalElement) this.closeModal();
        };

        document.body.appendChild(this.modalElement);

        // Emit event to React to render MangaStudio component
        EventBus.emit('mangastudio:open', { containerId: 'manga-studio-wrapper' });
    }

    /**
     * Close modal and resume game
     */
    public closeModal() {
        if (!this.modalOpen) return;

        // Emit event to unmount React component
        EventBus.emit('mangastudio:close');

        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }

        this.modalOpen = false;

        // Resume the game scene
        this.scene.scene.resume();
    }

    /**
     * Check if modal is open
     */
    public getIsOpen(): boolean {
        return this.modalOpen;
    }

    /**
     * Cleanup
     */
    public destroy() {
        this.closeModal();
    }
}
