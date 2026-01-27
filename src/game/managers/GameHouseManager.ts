import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

/**
 * GameHouseManager - Manages game house interactions in Town Square
 * Shows mini games directly in DOM overlay without page navigation
 */

export interface MiniGameInfo {
    id: string;
    title: string;
    emoji: string;
    description: string;
}

export interface GameHouseManagerConfig {
    showToastMessage: (text: string, color: number) => void;
}

export class GameHouseManager {
    private scene: Scene;
    // Config stored for future use (e.g., toast messages)
    private config: GameHouseManagerConfig;
    
    // Modal state
    private modalOpen: boolean = false;
    private modalElement: HTMLDivElement | null = null;
    private currentGame: string | null = null;

    // Available games
    private games: MiniGameInfo[] = [
        {
            id: 'tetris',
            title: 'Tetris',
            emoji: '🎮',
            description: 'Score points by clearing rows',
        },
    ];

    constructor(scene: Scene, config: GameHouseManagerConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Open game selection modal
     */
    public openGameModal(_houseId: number) {
        if (this.modalOpen) return;
        this.modalOpen = true;

        // Pause the game scene
        this.scene.scene.pause();

        const isMobile = window.innerWidth < 500;

        // Create modal container
        this.modalElement = document.createElement('div');
        this.modalElement.id = 'game-house-modal';
        this.modalElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: 'PixelFont', Arial, sans-serif;
            touch-action: manipulation;
        `;

        // Create modal content - responsive
        const content = document.createElement('div');
        content.style.cssText = `
            background: linear-gradient(135deg, #3E2723 0%, #5D4037 100%);
            border: 4px solid #8B4513;
            border-radius: 16px;
            padding: ${isMobile ? '12px' : '16px'};
            max-width: ${isMobile ? '95%' : '400px'};
            width: ${isMobile ? '95%' : '90%'};
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            -webkit-overflow-scrolling: touch;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: ${isMobile ? '10px' : '12px'};
        `;

        const title = document.createElement('h2');
        title.textContent = '🏠 Arcade';
        title.style.cssText = `
            color: #FFD700;
            font-size: ${isMobile ? '18px' : '20px'};
            margin: 0;
            text-shadow: 2px 2px 0 #000;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #FF5722;
            font-size: ${isMobile ? '28px' : '24px'};
            cursor: pointer;
            padding: ${isMobile ? '8px' : '0'};
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        `;
        closeBtn.onclick = () => this.closeModal();

        header.appendChild(title);
        header.appendChild(closeBtn);
        content.appendChild(header);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.textContent = 'Choose a game!';
        subtitle.style.cssText = `
            color: #AAAAAA;
            font-size: ${isMobile ? '11px' : '12px'};
            margin: 0 0 ${isMobile ? '12px' : '16px'} 0;
            text-align: center;
        `;
        content.appendChild(subtitle);

        // Games grid - single column on mobile
        const gamesGrid = document.createElement('div');
        gamesGrid.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: ${isMobile ? '10px' : '12px'};
        `;

        this.games.forEach(game => {
            const card = this.createGameCard(game);
            gamesGrid.appendChild(card);
        });

        // Coming soon card
        const comingSoon = document.createElement('div');
        comingSoon.style.cssText = `
            background: #2D2D2D;
            border: 2px dashed #5D4037;
            border-radius: 12px;
            padding: ${isMobile ? '16px' : '20px'};
            text-align: center;
            opacity: 0.6;
        `;
        comingSoon.innerHTML = `
            <div style="font-size: ${isMobile ? '32px' : '40px'}; margin-bottom: 8px;">🎯</div>
            <div style="color: #888; font-size: ${isMobile ? '12px' : '14px'};">More games coming soon...</div>
        `;
        gamesGrid.appendChild(comingSoon);

        content.appendChild(gamesGrid);
        this.modalElement.appendChild(content);

        // Click outside to close
        this.modalElement.onclick = (e) => {
            if (e.target === this.modalElement) this.closeModal();
        };

        document.body.appendChild(this.modalElement);
    }

    /**
     * Create a game card element - responsive for mobile
     */
    private createGameCard(game: MiniGameInfo): HTMLDivElement {
        const isMobile = window.innerWidth < 500;
        
        const card = document.createElement('div');
        card.style.cssText = `
            background: #3D1A1A;
            border: 2px solid #5D4037;
            border-radius: 12px;
            padding: ${isMobile ? '16px' : '20px'};
            text-align: center;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        `;

        card.innerHTML = `
            <div style="font-size: ${isMobile ? '36px' : '48px'}; margin-bottom: ${isMobile ? '8px' : '12px'};">${game.emoji}</div>
            <div style="color: #FFD700; font-size: ${isMobile ? '16px' : '18px'}; font-weight: bold; margin-bottom: 8px; text-shadow: 2px 2px 0 #000;">${game.title}</div>
            <div style="color: #CCCCCC; font-size: ${isMobile ? '11px' : '12px'}; margin-bottom: ${isMobile ? '12px' : '16px'};">${game.description}</div>
            <div style="background: #7BC043; color: white; padding: ${isMobile ? '12px 16px' : '10px 20px'}; border-radius: 8px; border: 2px solid #5D9B3A; font-size: ${isMobile ? '13px' : '14px'};">
                Play Now
            </div>
        `;

        // Touch/hover effects
        card.onmouseenter = () => {
            if (!isMobile) {
                card.style.transform = 'scale(1.03)';
                card.style.boxShadow = '0 5px 20px rgba(255, 215, 0, 0.3)';
            }
        };
        card.onmouseleave = () => {
            card.style.transform = 'scale(1)';
            card.style.boxShadow = 'none';
        };
        
        // Touch feedback for mobile
        card.ontouchstart = () => {
            card.style.transform = 'scale(0.98)';
            card.style.background = '#4D2A2A';
        };
        card.ontouchend = () => {
            card.style.transform = 'scale(1)';
            card.style.background = '#3D1A1A';
        };
        
        card.onclick = (e) => {
            e.stopPropagation();
            this.openGame(game.id);
        };

        return card;
    }

    /**
     * Open a specific game
     */
    private openGame(gameId: string) {
        this.currentGame = gameId;
        
        const isMobile = window.innerWidth < 500;
        
        // Clear modal content and show game
        if (this.modalElement) {
            this.modalElement.innerHTML = '';
            
            // Create game container - full screen, centered
            const gameContainer = document.createElement('div');
            gameContainer.style.cssText = `
                background: linear-gradient(135deg, #0e203f 0%, #1a2942 50%, #0e203f 100%);
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: ${isMobile ? '45px 4px 4px 4px' : '50px 10px 10px 10px'};
                box-sizing: border-box;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
            `;

            // Back button - fixed at top
            const backBtn = document.createElement('button');
            backBtn.innerHTML = '← Back';
            backBtn.style.cssText = `
                position: fixed;
                top: ${isMobile ? '6px' : '10px'};
                left: ${isMobile ? '6px' : '10px'};
                background: #3E2723;
                color: white;
                border: 2px solid #5D4037;
                border-radius: 8px;
                padding: ${isMobile ? '8px 12px' : '8px 16px'};
                cursor: pointer;
                font-family: 'PixelFont', Arial, sans-serif;
                font-size: ${isMobile ? '10px' : '12px'};
                z-index: 100;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
            `;
            backBtn.onclick = () => this.backToGameList();
            
            // Touch feedback for back button
            backBtn.ontouchstart = () => {
                backBtn.style.background = '#5D4037';
            };
            backBtn.ontouchend = () => {
                backBtn.style.background = '#3E2723';
            };

            // Game wrapper - centered
            const gameWrapper = document.createElement('div');
            gameWrapper.id = 'mini-game-wrapper';
            gameWrapper.style.cssText = `
                display: flex;
                justify-content: center;
                align-items: center;
            `;

            gameContainer.appendChild(backBtn);
            gameContainer.appendChild(gameWrapper);
            this.modalElement.appendChild(gameContainer);

            // Emit event to React to render the game
            EventBus.emit('minigame:open', { gameId, containerId: 'mini-game-wrapper' });
        }
    }

    /**
     * Go back to game list
     */
    private backToGameList() {
        // Emit event to unmount React game component
        EventBus.emit('minigame:close');
        this.currentGame = null;
        
        // Re-open the game selection modal
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
        this.modalOpen = false;
        this.openGameModal(1);
    }

    /**
     * Close modal and resume game
     */
    public closeModal() {
        if (!this.modalOpen) return;

        // Emit event to unmount React game component
        if (this.currentGame) {
            EventBus.emit('minigame:close');
            this.currentGame = null;
        }

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
