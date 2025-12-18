import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { ShopService } from '../ShopService';

interface WellCallbacks {
    getWaterCount: () => number;
    addWater: (amount: number) => void;
    updateToolbar: () => void;
    playSuccessSound: () => void;
}

/**
 * Manages the water well system
 * Handles well object, animation, and water claiming modal
 */
export class WellManager extends BaseManager {
    private wellSprite!: Phaser.GameObjects.Sprite;
    private tutorSprite!: Phaser.GameObjects.Sprite;
    private callbacks: WellCallbacks;
    private tileSize: number;
    private updateTimer?: Phaser.Time.TimerEvent;
    private nextClaimAt: Date | null = null;
    private isClaimingWater: boolean = false;

    constructor(scene: Phaser.Scene, callbacks: WellCallbacks, tileSize: number) {
        super(scene);
        this.callbacks = callbacks;
        this.tileSize = tileSize;
    }

    /**
     * Create the well object on the map
     */
    public createWell(): void {
        // Position: right of the farm area
        // Farm center is at (25, 25), 4x4 grid goes from (24,24) to (27,27)
        // Well will be at (29, 26) - to the right of the farm
        const centerX = 25;
        const centerY = 25;
        const wellTileX = centerX + 5;
        const wellTileY = centerY;

        const wellX = wellTileX * this.tileSize + this.tileSize / 2;
        const wellY = wellTileY * this.tileSize + this.tileSize / 2;

        // Create well animation if not exists
        if (!this.scene.anims.exists('well-anim')) {
            this.scene.anims.create({
                key: 'well-anim',
                frames: this.scene.anims.generateFrameNumbers('well', { start: 0, end: 1 }),
                frameRate: 2,
                repeat: -1
            });
        }

        // Create well sprite with larger size
        this.wellSprite = this.scene.add.sprite(wellX, wellY, 'well', 0);
        this.wellSprite.setDisplaySize(48, 48);
        this.wellSprite.setDepth(wellY + 10);
        this.wellSprite.setInteractive({ useHandCursor: true });

        // Play animation
        this.wellSprite.play('well-anim');

        // Click handler
        this.wellSprite.on('pointerdown', () => {
            this.open();
        });

        // Setup hover effect with tint + shadow
        this.setupHoverEffect(this.wellSprite, 6);

        // Create turtle tutor next to the well (on the right side)
        this.createTutor(wellX, wellY);
    }

    /**
     * Create the turtle tutor sprite
     */
    private createTutor(wellX: number, wellY: number): void {
        // Create tutor idle animation if not exists
        if (!this.scene.anims.exists('tutor-idle')) {
            this.scene.anims.create({
                key: 'tutor-idle',
                frames: this.scene.anims.generateFrameNumbers('tutor', { start: 0, end: 1 }),
                frameRate: 2,
                repeat: -1
            });
        }

        // Position turtle to the right of the well
        const tutorX = wellX + 24;
        const tutorY = wellY + 8;

        // Create tutor sprite (same size as player character: 48x48)
        this.tutorSprite = this.scene.add.sprite(tutorX, tutorY, 'tutor', 0);
        this.tutorSprite.setDisplaySize(24, 30);
        // Set depth higher than well so turtle appears in front
        this.tutorSprite.setDepth(wellY + 20);

        // Play idle animation
        this.tutorSprite.play('tutor-idle');
    }

    /**
     * Get the tutor sprite for external access
     */
    public getTutorSprite(): Phaser.GameObjects.Sprite {
        return this.tutorSprite;
    }

    /**
     * Get the well sprite for camera ignore setup
     */
    public getWellSprite(): Phaser.GameObjects.Sprite {
        return this.wellSprite;
    }

    /**
     * Check if water can be claimed now
     */
    private canClaimWater(): boolean {
        if (!this.nextClaimAt) return true; // First time or no data
        return new Date() >= this.nextClaimAt;
    }

    /**
     * Get time until next water is available (in seconds)
     */
    private getTimeUntilNextWater(): number {
        if (!this.nextClaimAt) return 0;
        const now = new Date();
        if (now >= this.nextClaimAt) return 0;
        return Math.ceil((this.nextClaimAt.getTime() - now.getTime()) / 1000);
    }

    /**
     * Fetch water status from API
     */
    private async fetchWaterStatus(): Promise<void> {
        const status = await ShopService.getWaterStatus();
        if (status) {
            if (status.isReady) {
                this.nextClaimAt = null; // Can claim now
            } else if (status.nextClaimAt) {
                this.nextClaimAt = new Date(status.nextClaimAt);
            }
        }
    }

    /**
     * Open the well modal
     */
    public async open(): Promise<void> {
        if (this.isOpen) return;
        this.isOpen = true;

        // Fetch water status from API
        await this.fetchWaterStatus();

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 280;
        const modalHeight = 200;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.6);
        overlay.setDepth(5300);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.addElement(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5301);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.addElement(modalBg);

        // Animate modal
        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Create modal content after animation
        this.scene.time.delayedCall(100, () => {
            this.createModalContent(modalX, modalY, modalWidth, modalHeight);
        });

        // Close on overlay click
        overlay.on('pointerdown', () => this.close());
    }

    /**
     * Close the well modal
     */
    public close(): void {
        this.isOpen = false;
        if (this.updateTimer) {
            this.updateTimer.destroy();
            this.updateTimer = undefined;
        }
        this.destroyElements();
    }

    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        // Close button
        const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 30, modalY - modalHeight / 2 + 35, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setAlpha(0);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(modalX + modalWidth / 2 - 30, modalY - modalHeight / 2 + 35, 'X', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5303);
        closeText.setStroke('#5D4037', 2);
        closeText.setAlpha(0);
        this.scene.cameras.main.ignore(closeText);
        this.addElement(closeText);

        this.scene.tweens.add({
            targets: [closeBtnBg, closeText],
            alpha: 1,
            duration: 150
        });

        closeBtnBg.on('pointerdown', () => this.close());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Title
        const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 35, 'Water Well', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5302);
        title.setStroke('#5D4037', 2);
        title.setAlpha(0);
        this.scene.cameras.main.ignore(title);
        this.addElement(title);

        this.scene.tweens.add({ targets: title, alpha: 1, duration: 150 });

        // Well icon
        const wellIcon = this.scene.add.sprite(modalX, modalY - 25, 'well', 0);
        wellIcon.setDisplaySize(48, 48);
        wellIcon.setDepth(5302);
        wellIcon.setAlpha(0);
        this.scene.cameras.main.ignore(wellIcon);
        this.addElement(wellIcon);

        this.scene.tweens.add({ targets: wellIcon, alpha: 1, duration: 150, delay: 50 });

        // Status text (shows if water is available or countdown)
        const statusText = this.scene.add.text(modalX, modalY + 15, '', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#4FC3F7',
            resolution: 2
        });
        statusText.setOrigin(0.5);
        statusText.setDepth(5302);
        statusText.setStroke('#1565C0', 2);
        statusText.setAlpha(0);
        this.scene.cameras.main.ignore(statusText);
        this.addElement(statusText);

        this.scene.tweens.add({ targets: statusText, alpha: 1, duration: 150, delay: 100 });

        // Timer text (shows countdown to next water)
        const timerText = this.scene.add.text(modalX, modalY + 35, '', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#5e5b5aff',
            resolution: 2
        });
        timerText.setOrigin(0.5);
        timerText.setDepth(5302);
        timerText.setAlpha(0);
        this.scene.cameras.main.ignore(timerText);
        this.addElement(timerText);

        this.scene.tweens.add({ targets: timerText, alpha: 1, duration: 150, delay: 100 });

        // Claim button
        const claimBtnY = modalY + 58;
        const canClaimInitial = this.canClaimWater();
        const claimBtnBg = this.scene.add.sprite(modalX, claimBtnY, 'square-buttons', canClaimInitial ? 6 : 7);
        claimBtnBg.setDisplaySize(100, 32);
        claimBtnBg.setDepth(5302);
        claimBtnBg.setAlpha(0);
        if (canClaimInitial) {
            claimBtnBg.setInteractive({ useHandCursor: true });
        }
        this.scene.cameras.main.ignore(claimBtnBg);
        this.addElement(claimBtnBg);

        const claimBtnText = this.scene.add.text(modalX, claimBtnY, canClaimInitial ? 'Claim' : 'Wait...', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: canClaimInitial ? '#FFFFFF' : '#999999',
            resolution: 2
        });
        claimBtnText.setOrigin(0.5);
        claimBtnText.setDepth(5303);
        claimBtnText.setStroke('#5D4037', 2);
        claimBtnText.setAlpha(0);
        this.scene.cameras.main.ignore(claimBtnText);
        this.addElement(claimBtnText);

        // Update timer display and button state
        const updateTimerDisplay = () => {
            const canClaim = this.canClaimWater();

            if (canClaim) {
                statusText.setText('💧 Water Ready!');
                statusText.setColor('#4CAF50');
                timerText.setText('Click to collect');
                // Enable button
                claimBtnBg.setTexture('square-buttons', 6);
                claimBtnBg.setInteractive({ useHandCursor: true });
                claimBtnText.setText('Claim');
                claimBtnText.setColor('#FFFFFF');
            } else {
                statusText.setText('⏳ Recharging...');
                statusText.setColor('#FFA726');
                const seconds = this.getTimeUntilNextWater();
                const hours = Math.floor(seconds / 3600);
                const mins = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                if (hours > 0) {
                    timerText.setText(`Next: ${hours}h ${mins}m ${secs}s`);
                } else if (mins > 0) {
                    timerText.setText(`Next: ${mins}m ${secs}s`);
                } else {
                    timerText.setText(`Next: ${secs}s`);
                }
                // Disable button
                claimBtnBg.setTexture('square-buttons', 7);
                claimBtnBg.disableInteractive();
                claimBtnText.setText('Wait...');
                claimBtnText.setColor('#999999');
            }
        };

        updateTimerDisplay();

        // Update timer every second
        this.updateTimer = this.scene.time.addEvent({
            delay: 1000,
            callback: updateTimerDisplay,
            loop: true
        });

        this.scene.tweens.add({
            targets: [claimBtnBg, claimBtnText],
            alpha: 1,
            duration: 150,
            delay: 150
        });

        claimBtnBg.on('pointerover', () => {
            if (this.canClaimWater()) claimBtnBg.setTint(0x88ff88);
        });
        claimBtnBg.on('pointerout', () => claimBtnBg.clearTint());
        claimBtnBg.on('pointerdown', () => {
            if (this.canClaimWater()) {
                this.claimWaterFromAPI(statusText, timerText, claimBtnBg, claimBtnText);
            }
        });

        // Description
        const descText = this.scene.add.text(modalX, modalY + modalHeight / 2 - 25, '+3h Growth Time per Water', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#8D6E63',
            resolution: 2
        });
        descText.setOrigin(0.5);
        descText.setDepth(5302);
        descText.setAlpha(0);
        this.scene.cameras.main.ignore(descText);
        this.addElement(descText);

        this.scene.tweens.add({ targets: descText, alpha: 1, duration: 150, delay: 200 });
    }

    private async claimWaterFromAPI(
        statusText: Phaser.GameObjects.Text,
        timerText: Phaser.GameObjects.Text,
        claimBtn: Phaser.GameObjects.Sprite,
        claimBtnText: Phaser.GameObjects.Text
    ): Promise<void> {
        if (this.isClaimingWater) return;
        this.isClaimingWater = true;

        // === OPTIMISTIC UPDATE: Update UI immediately ===
        const optimisticAmount = 1; // Default water amount
        const previousWaterCount = this.callbacks.getWaterCount();

        // 1. Show success immediately
        this.callbacks.addWater(optimisticAmount);
        this.callbacks.playSuccessSound();
        this.callbacks.updateToolbar();
        this.showClaimReward(`+${optimisticAmount} Water!`);

        // 2. Update UI to recharging state
        statusText.setText('⏳ Recharging...');
        statusText.setColor('#FFA726');

        // 3. Set optimistic next claim time (4 hours from now)
        const optimisticNextClaim = new Date(Date.now() + 4 * 60 * 60 * 1000);
        this.nextClaimAt = optimisticNextClaim;

        // 4. Disable button
        claimBtn.disableInteractive();
        claimBtnText.setText('Claimed');

        // === BACKGROUND API CALL ===
        try {
            const result = await ShopService.claimFreeWater();

            if (result && result.success) {
                // API success - update with actual values
                const actualAmount = result.amount;

                // Adjust water if different from optimistic
                if (actualAmount !== optimisticAmount) {
                    const diff = actualAmount - optimisticAmount;
                    this.callbacks.addWater(diff);
                    this.callbacks.updateToolbar();
                }

                // Update with actual next claim time
                if (result.nextClaimAt) {
                    this.nextClaimAt = new Date(result.nextClaimAt);
                }
            } else {
                // === ROLLBACK on failure ===
                this.callbacks.addWater(-optimisticAmount); // Remove added water
                this.callbacks.updateToolbar();

                // Show error
                const errorMsg = result?.message || 'Failed! Please try again';
                this.showClaimReward(errorMsg);

                // Restore UI to claimable state
                statusText.setText('💧 Water Ready!');
                statusText.setColor('#4CAF50');
                timerText.setText('Click to collect');

                // Update next claim time from error response if available
                if (result?.nextClaimAt) {
                    this.nextClaimAt = new Date(result.nextClaimAt);
                } else {
                    this.nextClaimAt = null; // Allow retry
                }

                // Re-enable button
                claimBtn.setInteractive({ useHandCursor: true });
                claimBtnText.setText('Claim');
            }
        } catch (error) {
            // === ROLLBACK on network error ===
            this.callbacks.addWater(-optimisticAmount);
            this.callbacks.updateToolbar();
            this.showClaimReward('Network error! Try again');

            statusText.setText('💧 Water Ready!');
            statusText.setColor('#4CAF50');
            timerText.setText('Click to collect');
            this.nextClaimAt = null;

            claimBtn.setInteractive({ useHandCursor: true });
            claimBtnText.setText('Claim');
        }

        this.isClaimingWater = false;
    }

    private showClaimReward(text: string): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        const rewardText = this.scene.add.text(screenWidth / 2, screenHeight / 2 - 40, text, {
            fontSize: '16px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        rewardText.setOrigin(0.5);
        rewardText.setDepth(5400);
        rewardText.setStroke('#000000', 3);
        rewardText.setTint(0x4FC3F7);
        this.scene.cameras.main.ignore(rewardText);

        this.scene.tweens.add({
            targets: rewardText,
            y: screenHeight / 2 - 80,
            alpha: 0,
            duration: 1500,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                rewardText.destroy();
            }
        });
    }

    public destroy(): void {
        if (this.updateTimer) {
            this.updateTimer.destroy();
            this.updateTimer = undefined;
        }
        super.destroy();
    }
}
