// src/game/scenes/GameLoader.ts
// Scene that loads all API data before entering the main game

import { Scene } from 'phaser';
import { GameDataService } from '../GameDataService';

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

        // Background
        this.cameras.main.setBackgroundColor('#1a1a2e');

        // Loading title
        this.loadingText = this.add.text(centerX, centerY - 80, 'Loading Game Data...', {
            fontSize: '28px',
            fontFamily: 'Arial',
            color: '#4ade80',
        });
        this.loadingText.setOrigin(0.5);

        // Progress bar background
        this.progressBarBg = this.add.rectangle(centerX, centerY, 400, 24, 0x333333);
        this.progressBarBg.setStrokeStyle(2, 0x4ade80);

        // Progress bar fill
        this.progressBar = this.add.rectangle(centerX - 196, centerY, 4, 18, 0x4ade80);
        this.progressBar.setOrigin(0, 0.5);

        // Status text
        this.statusText = this.add.text(centerX, centerY + 50, 'Connecting to server...', {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#86efac',
        });
        this.statusText.setOrigin(0.5);

        // Start loading data
        this.loadGameData();
    }

    private async loadGameData() {
        try {
            // Update progress callback
            const onProgress = (progress: number) => {
                this.updateProgress(progress);
            };

            this.statusText.setText('Fetching user profile...');
            await this.delay(100); // Small delay for UI feedback

            // Fetch all game data
            const gameData = await GameDataService.fetchAllGameData(onProgress);

            // Update status based on what was loaded
            if (gameData.user) {
                this.statusText.setText(`Welcome back, ${gameData.user.username || 'Farmer'}!`);
            } else {
                this.statusText.setText('Ready to play!');
            }

            // Small delay to show completion
            await this.delay(500);

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
        // Update progress bar width (max 392px for full width)
        const width = Math.max(4, (392 * progress) / 100);
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
                this.scene.start('FarmingGame');
            }
            return;
        }

        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('FarmingGame');
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => {
            this.time.delayedCall(ms, resolve);
        });
    }
}
