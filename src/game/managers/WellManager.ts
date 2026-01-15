import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { ShopService } from '../ShopService';
import { GameDataService } from '../GameDataService';
import { useGameState } from '../hooks/useGameState';

interface WellCallbacks {
    getWaterCount: () => number;
    addWater: (amount: number) => void;
    playSuccessSound: () => void;
    // Note: UI refresh is now handled by GameDataService.refreshAndUpdateUI()
}

/**
 * Manages the water well system
 * Handles well object, animation, and water claiming modal
 */
export class WellManager extends BaseManager {
    private wellSprite!: Phaser.GameObjects.Sprite;
    private tutorSprite!: Phaser.GameObjects.Sprite;
    private notificationIcon!: Phaser.GameObjects.Image;
    private callbacks: WellCallbacks;
    private tileSize: number;
    private updateTimer?: Phaser.Time.TimerEvent;
    private nextClaimAt: Date | null = null;
    private isClaimingWater: boolean = false;
    private hasFetchedStatus: boolean = false; // Track if we've fetched from API

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

        // Create notification icon above the well (hidden by default)
        this.notificationIcon = this.scene.add.image(wellX, wellY - 28, 'icon-problem');
        this.notificationIcon.setDisplaySize(12, 12);
        this.notificationIcon.setDepth(wellY + 100);
        this.notificationIcon.setVisible(false);

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
     * Update notification icon visibility based on water claim status
     * Shows icon when water can be claimed
     */
    public updateNotificationIcon(): void {
        if (!this.notificationIcon) return;
        this.notificationIcon.setVisible(this.canClaimWater());
    }

    /**
     * Get the notification icon for external access
     */
    public getNotificationIcon(): Phaser.GameObjects.Image {
        return this.notificationIcon;
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
        try {
            const status = await ShopService.getWaterStatus();
            if (status) {
                if (status.isReady) {
                    this.nextClaimAt = null; // Can claim now
                } else if (status.nextClaimAt) {
                    this.nextClaimAt = new Date(status.nextClaimAt);
                }
            }
            this.hasFetchedStatus = true; // Mark as fetched
            // Update notification icon visibility
            this.updateNotificationIcon();
        } catch (error) {
            this.hasFetchedStatus = true; // Still mark as fetched to avoid infinite loading
            this.updateNotificationIcon();
        }
    }

    /**
     * Pre-fetch water status during game initialization
     * Call this when wallet connects to have data ready when modal opens
     */
    public prefetchWaterStatus(): void {
        this.fetchWaterStatus();
    }

    /**
     * Open the well modal
     */
    public open(): void {
        if (this.isOpen) return;
        this.isOpen = true;

        // Show modal immediately with cached/default state
        // API will update in background

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
        // Use class-level flag to track if we've fetched from API
        // This prevents showing "Claim" when we haven't fetched yet

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

        // Track previous countdown state to detect when it reaches 0
        let wasWaiting = !this.canClaimWater();
        let isRefreshing = false;

        // Update timer display and button state
        const updateTimerDisplay = () => {
            // Guard: check if modal is still open and elements exist
            if (!this.isOpen || !statusText.active || !timerText.active) {
                return;
            }

            const canClaim = this.canClaimWater();

            // Detect countdown completion: was waiting, now can claim
            if (wasWaiting && canClaim && !isRefreshing) {
                isRefreshing = true;
                // Countdown reached 0 - verify with API
                this.fetchWaterStatus().then(() => {
                    isRefreshing = false;
                    updateTimerDisplay(); // Update UI with fresh data
                });
            }
            wasWaiting = !canClaim;

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

        // Show cached state immediately - data is pre-fetched on game load
        // Only refresh after user actions (claim water)
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

        // Get global game state (single source of truth)
        const gameState = useGameState(this.scene);

        // === OPTIMISTIC UPDATE: Update UI immediately ===
        const optimisticAmount = 1; // Default water amount

        // 1. Show success immediately - update GLOBAL STATE and toolbar
        gameState.addWater(optimisticAmount);
        this.callbacks.addWater(optimisticAmount); // Also update toolbar data
        this.callbacks.playSuccessSound();
        this.showClaimReward(`+${optimisticAmount} Water!`);

        // 2. Update UI to recharging state
        statusText.setText('⏳ Recharging...');
        statusText.setColor('#FFA726');

        // 3. Set optimistic next claim time (4 hours from now)
        const optimisticNextClaim = new Date(Date.now() + 4 * 60 * 60 * 1000);
        this.nextClaimAt = optimisticNextClaim;
        this.updateNotificationIcon(); // Hide notification

        // 4. Disable button
        claimBtn.disableInteractive();
        claimBtnText.setText('Claimed');

        // === TRY WEBSOCKET FIRST, FALL BACK TO REST API ===
        const usedWebSocket = ShopService.claimFreeWaterWS();
        
        if (usedWebSocket) {
            // WebSocket sent - UI updates will come via inventory_update event
            // No need to wait for response, just mark as done
            this.isClaimingWater = false;
            return;
        }

        // Fall back to REST API
        try {
            const result = await ShopService.claimFreeWater();

            if (result && result.success) {
                // API success - update with actual values
                const actualAmount = result.amount;

                // Adjust water if different from optimistic
                if (actualAmount !== optimisticAmount) {
                    const diff = actualAmount - optimisticAmount;
                    gameState.addWater(diff);
                    this.callbacks.addWater(diff); // Also update toolbar data
                }

                // Update with actual next claim time
                if (result.nextClaimAt) {
                    this.nextClaimAt = new Date(result.nextClaimAt);
                }
            } else {
                // === ROLLBACK on failure ===
                gameState.addWater(-optimisticAmount); // Remove added water
                this.callbacks.addWater(-optimisticAmount); // Also rollback toolbar data

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
                this.updateNotificationIcon(); // Show notification if can retry

                // Re-enable button
                claimBtn.setInteractive({ useHandCursor: true });
                claimBtnText.setText('Claim');
            }
        } catch (error) {
            // === ROLLBACK on network error ===
            gameState.addWater(-optimisticAmount);
            this.callbacks.addWater(-optimisticAmount); // Also rollback toolbar data
            this.showClaimReward('Network error! Try again');

            statusText.setText('💧 Water Ready!');
            statusText.setColor('#4CAF50');
            timerText.setText('Click to collect');
            this.nextClaimAt = null;
            this.updateNotificationIcon(); // Show notification for retry

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
