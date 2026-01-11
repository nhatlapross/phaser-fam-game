// src/game/scenes/GameLoader.ts
// Scene that loads all API data before entering the main game
// Supports instant loading from localStorage cache

import { Scene } from 'phaser';
import { GameDataService } from '../GameDataService';
import { GameCache, CACHE_KEYS } from '../utils/GameCache';

export class GameLoader extends Scene {
    private loadingText!: Phaser.GameObjects.Text;
    private progressBar!: Phaser.GameObjects.Rectangle;
    private progressBarBg!: Phaser.GameObjects.Rectangle;
    private statusText!: Phaser.GameObjects.Text;

    constructor() {
        super('GameLoader');
    }

    create() {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        // Beautiful farm background
        const bg = this.add.image(centerX, centerY, 'start-background');
        bg.setDisplaySize(this.scale.width, this.scale.height);

        // Game name logo
        const gameName = this.add.image(centerX, centerY - 80, 'game-name');
        gameName.setScale(0.8);

        // Loading title
        this.loadingText = this.add.text(centerX, centerY + 40, 'Loading Game Data...', {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            resolution: 2
        });
        this.loadingText.setOrigin(0.5);
        this.loadingText.setStroke('#5D4037', 3);

        // Progress bar background (wood style)
        const barWidth = 200;
        this.progressBarBg = this.add.rectangle(centerX, centerY + 70, barWidth, 16, 0x5D4037);
        this.progressBarBg.setStrokeStyle(2, 0x3E2723);

        // Progress bar fill
        this.progressBar = this.add.rectangle(centerX - barWidth / 2 + 3, centerY + 70, 4, 10, 0x8BC34A);
        this.progressBar.setOrigin(0, 0.5);

        // Status text
        this.statusText = this.add.text(centerX, centerY + 100, 'Connecting to server...', {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            resolution: 2
        });
        this.statusText.setOrigin(0.5);
        this.statusText.setStroke('#5D4037', 2);

        // Start loading data
        this.loadGameData();
    }

    private async loadGameData() {
        try {
            // Check if we have cached data for faster loading
            const hasCache = GameCache.has(CACHE_KEYS.GAME_DATA);

            if (hasCache) {
                // Instant load from cache
                this.statusText.setText('Loading from cache...');
                this.updateProgress(80);
            } else {
                this.statusText.setText('Fetching user profile...');
            }

            await this.delay(100); // Small delay for UI feedback

            // Update progress callback
            const onProgress = (progress: number) => {
                this.updateProgress(progress);
            };

            // Fetch all game data (will use cache if available)
            const gameData = await GameDataService.fetchAllGameData(onProgress);

            // Update status based on what was loaded
            if (gameData.user) {
                this.statusText.setText(`Welcome back, ${gameData.user.username || 'Farmer'}!`);
            } else {
                this.statusText.setText('Ready to play!');
            }

            // Shorter delay for cached load, longer for fresh load
            const transitionDelay = hasCache ? 200 : 500;
            await this.delay(transitionDelay);

            // Transition to game
            this.transitionToGame();

        } catch (error) {
            console.error('Error loading game data:', error);
            this.statusText.setText('Error loading data. Entering game...');
            this.statusText.setColor('#ef4444');

            // Still try to enter game after error
            await this.delay(1500);
            this.transitionToGame();
        }
    }

    private updateProgress(progress: number) {
        // Update progress bar width (barWidth 200 - 6 padding = 194 max)
        const width = Math.max(4, (194 * progress) / 100);
        this.progressBar.width = width;

        // Update status text based on progress
        if (progress < 20) {
            this.statusText.setText('Fetching user profile...');
        } else if (progress < 40) {
            this.statusText.setText('Loading garden data...');
        } else if (progress < 60) {
            this.statusText.setText('Loading inventory...');
        } else if (progress < 80) {
            this.statusText.setText('Loading missions...');
        } else if (progress < 100) {
            this.statusText.setText('Finalizing...');
        } else {
            this.statusText.setText('Complete!');
        }
    }

    private transitionToGame() {
        // Safety check
        if (!this.cameras || !this.cameras.main || !this.scene.isActive('GameLoader')) {
            if (this.scene) {
                this.scene.start('ProfileScene');
            }
            return;
        }

        // Check if this is a new user who needs transformation effect
        const showTransformation = localStorage.getItem('fam_game_show_transformation') === 'true';
        const isNewUser = localStorage.getItem('fam_game_is_new_user') === 'true';
        
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            if (showTransformation) {
                // New user - show transformation effect first
                this.scene.start('Transformation');
            } else {
                // Existing user - go directly to ProfileScene
                this.scene.start('ProfileScene', { isNewUser });
            }
            
            // Clear the flags after use
            if (isNewUser) {
                localStorage.removeItem('fam_game_is_new_user');
            }
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => {
            this.time.delayedCall(ms, resolve);
        });
    }
}
