import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { CheckinData, GAME_CONSTANTS } from '../types/GameTypes';
import { StreakService, StreakStatusResponse, StreakHistoryResponse } from '../StreakService';
import { GameDataService } from '../GameDataService';
import { useGameState } from '../hooks/useGameState';

interface CheckinCallbacks {
    playSuccessSound: () => void;
    // Note: Data refresh is now handled by GameDataService.refreshAndUpdateUI()
}

/**
 * Manages the daily check-in system
 * Handles check-in modal, streak tracking, and rewards
 */
export class CheckinManager extends BaseManager {
    private checkinSign!: Phaser.GameObjects.Image;
    private notificationIcon!: Phaser.GameObjects.Image;
    private callbacks: CheckinCallbacks;
    private cachedStreakStatus: StreakStatusResponse | null = null;
    private cachedStreakHistory: StreakHistoryResponse | null = null;

    constructor(scene: Phaser.Scene, callbacks: CheckinCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Set streak data from external cache (e.g., GameDataService)
     * Use this to avoid duplicate API calls
     */
    public setStreakFromCache(status: StreakStatusResponse | null, history: StreakHistoryResponse | null): void {
        this.cachedStreakStatus = status;
        this.cachedStreakHistory = history;
        console.log('CheckinManager: Streak data set from external cache', {
            status: status ? 'loaded' : 'null',
            historyCount: history?.checkins?.length ?? 0
        });
        // Update notification icon visibility
        this.updateNotificationIcon();
    }

    /**
     * Create the check-in sign on the map
     */
    public createCheckinSign(tileSize: number): void {
        const centerX = 25;
        const centerY = 25;
        // Position in front of warehouse (warehouse is at centerY - 5)
        const signX = (centerX - 2) * tileSize + tileSize / 2;
        const signY = (centerY - 4) * tileSize + tileSize / 2;

        this.checkinSign = this.scene.add.image(signX, signY, 'icon-checkin');
        this.checkinSign.setDisplaySize(16, 16);
        this.checkinSign.setDepth(signY);
        this.checkinSign.setInteractive({ useHandCursor: true });

        this.checkinSign.on('pointerdown', () => {
            this.open();
        });

        // Setup hover effect with tint + shadow
        this.setupHoverEffect(this.checkinSign, 6);

        // Create notification icon above the sign (hidden by default)
        this.notificationIcon = this.scene.add.image(signX, signY - 14, 'icon-problem');
        this.notificationIcon.setDisplaySize(12, 12);
        this.notificationIcon.setDepth(signY + 100);
        this.notificationIcon.setVisible(false);
    }

    /**
     * Get the check-in sign sprite for camera ignore setup
     */
    public getCheckinSign(): Phaser.GameObjects.Image {
        return this.checkinSign;
    }

    /**
     * Get the notification icon for camera ignore setup
     */
    public getNotificationIcon(): Phaser.GameObjects.Image {
        return this.notificationIcon;
    }

    /**
     * Update notification icon visibility based on check-in status
     * Shows icon when user can check-in (hasn't checked in today)
     */
    public updateNotificationIcon(): void {
        if (!this.notificationIcon) return;

        // Check from cached status first, then fallback to local check
        const canCheckin = this.cachedStreakStatus
            ? this.cachedStreakStatus.canCheckinNow
            : this.canCheckinToday();

        this.notificationIcon.setVisible(canCheckin);
    }

    /**
     * Open the check-in modal
     */
    public async open(): Promise<void> {
        if (this.isOpen) return;
        this.isOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 360;
        const modalHeight = 180;
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

        // Close on overlay click
        overlay.on('pointerdown', () => this.close());

        // Use cached data - show immediately if available
        if (this.cachedStreakStatus || this.cachedStreakHistory) {
            console.log('CheckinManager: Using cached streak data');
            this.scene.time.delayedCall(100, () => {
                this.createModalContent(modalX, modalY, modalWidth, modalHeight, this.cachedStreakStatus, this.cachedStreakHistory);
            });
        } else {
            // Show loading state immediately, then fetch data
            console.log('CheckinManager: No cache, showing loading then fetching');
            const loadingText = this.scene.add.text(modalX, modalY, 'Loading...', {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            loadingText.setOrigin(0.5);
            loadingText.setDepth(5302);
            loadingText.setAlpha(0);
            this.scene.cameras.main.ignore(loadingText);
            this.addElement(loadingText);

            this.scene.tweens.add({
                targets: loadingText,
                alpha: 1,
                duration: 150,
                delay: 100
            });

            // Fetch data in background
            const [streakStatus, streakHistory] = await Promise.all([
                StreakService.getStatus(),
                StreakService.getHistory(7)
            ]);

            // Cache the fetched data
            this.cachedStreakStatus = streakStatus;
            this.cachedStreakHistory = streakHistory;

            // Remove loading text and show content
            loadingText.destroy();
            this.elements = this.elements.filter(el => el !== loadingText);
            
            if (this.isOpen) { // Guard: check if modal is still open
                this.createModalContent(modalX, modalY, modalWidth, modalHeight, streakStatus, streakHistory);
            }
        }
    }

    /**
     * Close the check-in modal
     */
    public close(): void {
        this.isOpen = false;
        this.destroyElements();
    }

    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number, streakStatus: StreakStatusResponse | null, streakHistory: StreakHistoryResponse | null): void {
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
        const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 35, 'Daily Streak', {
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

        // Subtitle
        const subtitle = this.scene.add.text(modalX, modalY - modalHeight / 2 + 52, '7-day cycle. Resets if missed.', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#8D6E63',
            resolution: 2
        });
        subtitle.setOrigin(0.5);
        subtitle.setDepth(5302);
        subtitle.setAlpha(0);
        this.scene.cameras.main.ignore(subtitle);
        this.addElement(subtitle);

        this.scene.tweens.add({ targets: subtitle, alpha: 1, duration: 150, delay: 50 });

        // Get checkin data - prefer API history, fallback to localStorage
        const checkinData = this.getCheckinData();
        
        // Use API status if available
        const canCheckin = streakStatus ? streakStatus.canCheckinNow : this.canCheckinToday();
        const currentStreak = streakStatus ? streakStatus.currentStreak : checkinData.streak;
        
        // Get checked streak days from history API (streakDay is 1-7)
        // IMPORTANT: Only include days from the CURRENT cycle (streakDay <= currentStreak)
        // If currentStreak is 0, no days should be shown as checked (cycle has reset)
        const checkedStreakDays: number[] = [];
        if (streakHistory && streakHistory.checkins.length > 0 && currentStreak > 0) {
            streakHistory.checkins.forEach(checkin => {
                // Only include checkins that are part of the current streak
                // streakDay should be <= currentStreak to be in the current cycle
                if (checkin.streakDay <= currentStreak && !checkedStreakDays.includes(checkin.streakDay)) {
                    checkedStreakDays.push(checkin.streakDay);
                }
            });
            console.log('Checked streak days from current cycle:', checkedStreakDays, '(currentStreak:', currentStreak, ')');
        } else {
            console.log('No checked days - currentStreak is', currentStreak);
        }

        // Rewards configuration based on the image
        // Day 1 (Mon): 100 Gold, Day 2 (Tue): 1 Glove, Day 3 (Wed): 20 Gem
        // Day 4 (Thu): 2 Algae Seed, Day 5 (Fri): 1 Pesticide, Day 6 (Sat): 200 Gold, Day 7 (Sun): 1 Mushroom Seed
        const rewards = [
            { day: 'Day 1', icon: '💰', label: 'x100', color: '#FFD700' },      // Mon - 100 Gold
            { day: 'Day 2', icon: '🧤', label: 'x1', color: '#98D8C8' },        // Tue - 1 Glove
            { day: 'Day 3', icon: '💎', label: 'x20', color: '#E066FF' },       // Wed - 20 Gem
            { day: 'Day 4', icon: null, image: 'algae-seed', label: 'x2', color: '#4ade80' }, // Thu - 2 Algae Seed
            { day: 'Day 5', icon: '🧪', label: 'x1', color: '#FF6B6B' },        // Fri - 1 Pesticide
            { day: 'Day 6', icon: '💰', label: 'x200', color: '#FFD700' },      // Sat - 200 Gold
            { day: 'Day 7', icon: null, image: 'mushroom-seed', label: 'x1', color: '#fbbf24' }, // Sun - 1 Mushroom Seed
        ];

        // Day boxes - 7 days in a row
        const dayBoxSize = 36;
        const daySpacing = 6;
        const totalWidth = 7 * dayBoxSize + 6 * daySpacing;
        const startX = modalX - totalWidth / 2 + dayBoxSize / 2;
        const dayY = modalY - 5;

        rewards.forEach((reward, index) => {
            const dayX = startX + index * (dayBoxSize + daySpacing) + 10;

            // streakDay is 1-7 (Day 1 to Day 7 in the cycle)
            const streakDay = index + 1;
            
            // Check if this day is checked using history API data
            const isChecked = checkedStreakDays.includes(streakDay);
            
            // Determine if this is the next day to check in
            // Next day = currentStreak + 1 (if canCheckin is true)
            const nextStreakDay = currentStreak + 1;
            const isNextDay = canCheckin && streakDay === nextStreakDay;

            // Day box background
            const boxFrame = isChecked ? 6 : (isNextDay ? 6 : 7);
            const dayBox = this.scene.add.sprite(dayX, dayY, 'square-buttons', boxFrame);
            dayBox.setDisplaySize(dayBoxSize, dayBoxSize + 8);
            dayBox.setDepth(5302);
            dayBox.setAlpha(0);
            this.scene.cameras.main.ignore(dayBox);
            this.addElement(dayBox);

            if (isChecked) {
                dayBox.setTint(0x4ade80);
            } else if (!isNextDay) {
                dayBox.setTint(0x888888);
            }

            // Day label (Day 1, Day 2, etc.)
            const dayLabel = this.scene.add.text(dayX, dayY - 18, reward.day, {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: isNextDay ? '#FFFFFF' : '#CCCCCC',
                resolution: 2
            });
            dayLabel.setOrigin(0.5);
            dayLabel.setDepth(5303);
            dayLabel.setStroke('#5D4037', 1);
            dayLabel.setAlpha(0);
            this.scene.cameras.main.ignore(dayLabel);
            this.addElement(dayLabel);

            // Icon or image
            if (reward.image) {
                const rewardIcon = this.scene.add.image(dayX, dayY - 2, reward.image);
                rewardIcon.setDisplaySize(20, 20);
                rewardIcon.setDepth(5303);
                rewardIcon.setAlpha(0);
                if (isChecked) rewardIcon.setTint(0xffffff);
                else if (!isNextDay) rewardIcon.setTint(0x888888);
                this.scene.cameras.main.ignore(rewardIcon);
                this.addElement(rewardIcon);

                this.scene.tweens.add({
                    targets: rewardIcon,
                    alpha: 1,
                    duration: 150,
                    delay: index * 30
                });
            } else if (reward.icon) {
                const iconText = this.scene.add.text(dayX, dayY - 2, reward.icon, {
                    fontSize: '14px',
                    resolution: 2
                });
                iconText.setOrigin(0.5);
                iconText.setDepth(5303);
                iconText.setAlpha(0);
                this.scene.cameras.main.ignore(iconText);
                this.addElement(iconText);

                this.scene.tweens.add({
                    targets: iconText,
                    alpha: 1,
                    duration: 150,
                    delay: index * 30
                });
            }

            // Quantity label
            const quantityText = this.scene.add.text(dayX, dayY + 18, reward.label, {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: isChecked ? '#FFFFFF' : reward.color,
                resolution: 2
            });
            quantityText.setOrigin(0.5);
            quantityText.setDepth(5303);
            quantityText.setStroke('#5D4037', 1);
            quantityText.setAlpha(0);
            this.scene.cameras.main.ignore(quantityText);
            this.addElement(quantityText);

            // Checkmark overlay for checked days
            if (isChecked) {
                this.createCheckmark(dayX, dayY, index * 30);
            }

            // Fade in
            this.scene.tweens.add({
                targets: [dayBox, dayLabel, quantityText],
                alpha: 1,
                duration: 150,
                delay: index * 30
            });

            // Make next day's box clickable if can check in
            console.log(`Day ${streakDay}: canCheckin=${canCheckin}, isNextDay=${isNextDay}, isChecked=${isChecked}, nextStreakDay=${nextStreakDay}`);
            if (isNextDay && !isChecked) {
                dayBox.setInteractive({ useHandCursor: true });
                dayBox.on('pointerover', () => dayBox.setTint(0xffff88));
                dayBox.on('pointerout', () => dayBox.clearTint());
                dayBox.on('pointerdown', () => {
                    this.performCheckin(streakDay, dayBox, quantityText, checkinData);
                });
            }
        });

        // Add a dedicated Check In button if canCheckin is true
        if (canCheckin) {
            const nextDay = currentStreak + 1;
            const btnY = dayY + 45;
            const checkinBtn = this.scene.add.sprite(modalX, btnY, 'square-buttons', 6);
            checkinBtn.setDisplaySize(100, 28);
            checkinBtn.setDepth(5302);
            checkinBtn.setAlpha(0);
            checkinBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(checkinBtn);
            this.addElement(checkinBtn);

            const checkinBtnText = this.scene.add.text(modalX, btnY, `Check In Day ${nextDay}`, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            checkinBtnText.setOrigin(0.5);
            checkinBtnText.setDepth(5303);
            checkinBtnText.setStroke('#5D4037', 2);
            checkinBtnText.setAlpha(0);
            this.scene.cameras.main.ignore(checkinBtnText);
            this.addElement(checkinBtnText);

            this.scene.tweens.add({
                targets: [checkinBtn, checkinBtnText],
                alpha: 1,
                duration: 150,
                delay: 250
            });

            checkinBtn.on('pointerover', () => checkinBtn.setTint(0x88ff88));
            checkinBtn.on('pointerout', () => checkinBtn.clearTint());
            checkinBtn.on('pointerdown', () => {
                // Find the day box for the next day
                const dayIndex = nextDay - 1;
                const dayX = startX + dayIndex * (dayBoxSize + daySpacing) + 10;
                // Get the elements we need - we'll create a simple version
                checkinBtn.disableInteractive();
                checkinBtnText.setText('...');
                this.performCheckinSimple(nextDay, checkinBtn, checkinBtnText, checkinData);
            });
        } else if (streakStatus && streakStatus.nextCheckinAt) {
            // Show "Come back" message with countdown
            const btnY = dayY + 45;
            const nextCheckinDate = new Date(streakStatus.nextCheckinAt);
            const now = new Date();
            const diffMs = nextCheckinDate.getTime() - now.getTime();
            
            let countdownText = '';
            if (diffMs > 0) {
                const hours = Math.floor(diffMs / (1000 * 60 * 60));
                const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                if (hours > 0) {
                    countdownText = `Come back in ${hours}h ${mins}m`;
                } else {
                    countdownText = `Come back in ${mins}m`;
                }
            } else {
                countdownText = 'Check-in available!';
            }

            const waitText = this.scene.add.text(modalX, btnY, countdownText, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFA726',
                resolution: 2
            });
            waitText.setOrigin(0.5);
            waitText.setDepth(5302);
            waitText.setStroke('#5D4037', 2);
            waitText.setAlpha(0);
            this.scene.cameras.main.ignore(waitText);
            this.addElement(waitText);

            this.scene.tweens.add({
                targets: waitText,
                alpha: 1,
                duration: 150,
                delay: 250
            });
        }

        // Streak info - move down if button/message is shown
        const infoY = (canCheckin || (streakStatus && streakStatus.nextCheckinAt)) ? dayY + 75 : dayY + 45;
        const streakText = this.scene.add.text(modalX, infoY, `Current Streak: ${currentStreak} day${currentStreak !== 1 ? 's' : ''}`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        streakText.setOrigin(0.5);
        streakText.setDepth(5302);
        streakText.setStroke('#5D4037', 2);
        streakText.setAlpha(0);
        this.scene.cameras.main.ignore(streakText);
        this.addElement(streakText);

        this.scene.tweens.add({ targets: streakText, alpha: 1, duration: 150, delay: 200 });
    }

    private async performCheckinSimple(
        streakDay: number,
        btn: Phaser.GameObjects.Sprite,
        btnText: Phaser.GameObjects.Text,
        checkinData: CheckinData
    ): Promise<void> {
        // Show optimistic feedback
        this.showCheckinReward('Checking in...', 0x4ade80);
        this.callbacks.playSuccessSound();

        try {
            const result = await StreakService.checkin();

            if (result.success) {
                const successResult = result as {
                    success: true;
                    streakDay: number;
                    currentStreak: number;
                    rewards: { gold: number; ruby: number; items: string[] };
                    message: string;
                    nextCheckinAt: string;
                };

                // Update local data
                const today = this.getTodayString();
                this.saveCheckinData({
                    checkedDays: [...checkinData.checkedDays, streakDay],
                    lastCheckin: today,
                    streak: successResult.currentStreak
                });

                // Show rewards
                const rewardParts: string[] = [];
                if (successResult.rewards.gold > 0) {
                    rewardParts.push(`+${successResult.rewards.gold} Gold`);
                    // Update GLOBAL STATE immediately (single source of truth)
                    const gameState = useGameState(this.scene);
                    gameState.addGold(successResult.rewards.gold);
                }
                if (successResult.rewards.ruby > 0) {
                    rewardParts.push(`+${successResult.rewards.ruby} Ruby`);
                    // Update GLOBAL STATE for gems (ruby = gem)
                    const gameState = useGameState(this.scene);
                    gameState.addGem(successResult.rewards.ruby);
                }
                if (successResult.rewards.items && successResult.rewards.items.length > 0) {
                    rewardParts.push(...successResult.rewards.items.map(item => `+${item}`));
                }

                this.showCheckinReward(rewardParts.length > 0 ? rewardParts.join(', ') + '!' : 'Check-in successful!', 0x4ade80);

                // Update button to show "Come back in..." message
                btn.disableInteractive();
                btn.setTint(0x888888);
                
                // Calculate countdown for next check-in
                const nextCheckinDate = new Date(successResult.nextCheckinAt);
                const now = new Date();
                const diffMs = nextCheckinDate.getTime() - now.getTime();
                
                let countdownText = 'Come back tomorrow!';
                if (diffMs > 0) {
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    if (hours > 0) {
                        countdownText = `Come back in ${hours}h ${mins}m`;
                    } else {
                        countdownText = `Come back in ${mins}m`;
                    }
                }
                btnText.setText(countdownText);
                btnText.setColor('#FFA726');

                // Find and update the day box that was just checked in
                // The day box is at index (streakDay - 1) in the elements array
                // We need to add a checkmark to the corresponding day box
                this.addCheckmarkToDayBox(streakDay);

                // Also refresh data from API (runs in background, will sync with actual values)
                GameDataService.refreshAndUpdateUI();

                // Clear local cache
                this.cachedStreakStatus = null;
                this.cachedStreakHistory = null;
            } else {
                const errorResult = result as { success: false; message?: string; error?: string };
                this.showCheckinReward(errorResult.message || errorResult.error || 'Check-in failed!', 0xef4444);
                btn.setInteractive({ useHandCursor: true });
                btnText.setText(`Check In Day ${streakDay}`);
            }
        } catch (error) {
            this.showCheckinReward('Network error! Try again', 0xef4444);
            btn.setInteractive({ useHandCursor: true });
            btnText.setText(`Check In Day ${streakDay}`);
        }
    }

    /**
     * Create a checkmark at the specified position
     */
    private createCheckmark(x: number, y: number, delay: number = 0, animate: boolean = true): Phaser.GameObjects.Text {
        const checkmark = this.scene.add.text(x, y, '✓', {
            fontSize: '20px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        checkmark.setOrigin(0.5);
        checkmark.setDepth(5304);
        checkmark.setStroke('#2d5a2d', 3);
        this.scene.cameras.main.ignore(checkmark);
        this.addElement(checkmark);

        if (animate) {
            if (delay > 0) {
                checkmark.setAlpha(0);
                this.scene.tweens.add({
                    targets: checkmark,
                    alpha: 1,
                    duration: 150,
                    delay: delay
                });
            } else {
                // Immediate bounce animation for check-in action
                checkmark.setScale(0.5);
                this.scene.tweens.add({
                    targets: checkmark,
                    scale: 1,
                    duration: 200,
                    ease: 'Back.easeOut'
                });
            }
        }

        return checkmark;
    }

    /**
     * Add checkmark to a specific day box after successful check-in
     */
    private addCheckmarkToDayBox(streakDay: number): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        
        const dayBoxSize = 36;
        const daySpacing = 6;
        const totalWidth = 7 * dayBoxSize + 6 * daySpacing;
        const startX = modalX - totalWidth / 2 + dayBoxSize / 2;
        const dayY = modalY - 5;
        
        const dayIndex = streakDay - 1;
        const dayX = startX + dayIndex * (dayBoxSize + daySpacing) + 10;

        // Find and update the day box tint
        this.elements.forEach(element => {
            if (element instanceof Phaser.GameObjects.Sprite && 
                Math.abs(element.x - dayX) < 5 && 
                Math.abs(element.y - dayY) < 5) {
                element.setTint(0x4ade80);
                element.disableInteractive();
            }
        });

        // Add checkmark with bounce animation
        this.createCheckmark(dayX, dayY, 0, true);

        // Update quantity text color to white
        this.elements.forEach(element => {
            if (element instanceof Phaser.GameObjects.Text && 
                Math.abs(element.x - dayX) < 5 && 
                Math.abs(element.y - (dayY + 18)) < 5) {
                element.setColor('#FFFFFF');
            }
        });
    }

    private async performCheckin(
        dayIndex: number,
        dayBox: Phaser.GameObjects.Sprite,
        quantityText: Phaser.GameObjects.Text,
        checkinData: CheckinData
    ): Promise<void> {
        // Disable button immediately to prevent double clicks
        dayBox.disableInteractive();

        // === OPTIMISTIC UPDATE: Update UI immediately ===
        const today = this.getTodayString();
        const previousCheckedDays = [...checkinData.checkedDays];
        const previousStreak = checkinData.streak;

        // 1. Update UI immediately - show checked state
        dayBox.setTint(0x4ade80);
        quantityText.setColor('#FFFFFF');

        // 2. Add checkmark immediately
        const checkmark = this.scene.add.text(dayBox.x, dayBox.y, '✓', {
            fontSize: '20px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        checkmark.setOrigin(0.5);
        checkmark.setDepth(5304);
        checkmark.setStroke('#2d5a2d', 3);
        this.scene.cameras.main.ignore(checkmark);
        this.addElement(checkmark);

        // 3. Animate check
        this.scene.tweens.add({
            targets: dayBox,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 100,
            yoyo: true
        });

        // 4. Show optimistic reward message
        this.showCheckinReward('Check-in successful!', 0x4ade80);

        // 5. Play success sound immediately
        this.callbacks.playSuccessSound();

        // 6. Save optimistic data locally
        if (!checkinData.checkedDays.includes(dayIndex)) {
            checkinData.checkedDays.push(dayIndex);
        }
        this.saveCheckinData({
            checkedDays: checkinData.checkedDays,
            lastCheckin: today,
            streak: checkinData.streak + 1
        });

        // === BACKGROUND API CALL ===
        try {
            const result = await StreakService.checkin();

            if (result.success) {
                const successResult = result as {
                    success: true;
                    streakDay: number;
                    currentStreak: number;
                    rewards: { gold: number; ruby: number; items: string[] };
                    message: string;
                    nextCheckinAt?: string;
                };

                // Update with actual streak from API
                this.saveCheckinData({
                    checkedDays: checkinData.checkedDays,
                    lastCheckin: today,
                    streak: successResult.currentStreak
                });

                // Show actual rewards (update the floating message)
                const rewardParts: string[] = [];
                const gameState = useGameState(this.scene);
                if (successResult.rewards.gold > 0) {
                    rewardParts.push(`+${successResult.rewards.gold} Gold`);
                    // Update GLOBAL STATE immediately
                    gameState.addGold(successResult.rewards.gold);
                }
                if (successResult.rewards.ruby > 0) {
                    rewardParts.push(`+${successResult.rewards.ruby} Ruby`);
                    // Update GLOBAL STATE for gems
                    gameState.addGem(successResult.rewards.ruby);
                }
                if (successResult.rewards.items.length > 0) {
                    rewardParts.push(...successResult.rewards.items.map(item => `+${item}`));
                }

                if (rewardParts.length > 0) {
                    this.showCheckinReward(rewardParts.join(', ') + '!', 0x4ade80);
                }

                // Update the "Check In Day X" button to show "Come back" message
                this.updateCheckinButtonAfterSuccess(successResult);

                // Also refresh from API to sync with server (runs in background)
                GameDataService.refreshAndUpdateUI();
            } else {
                // === ROLLBACK on failure ===
                const errorResult = result as { success: false; message: string };

                // Restore previous state
                this.saveCheckinData({
                    checkedDays: previousCheckedDays,
                    lastCheckin: checkinData.lastCheckin,
                    streak: previousStreak
                });

                // Restore UI
                dayBox.clearTint();
                dayBox.setTint(0x888888);
                quantityText.setColor('#CCCCCC');
                checkmark.destroy();

                // Re-enable button
                dayBox.setInteractive({ useHandCursor: true });
                dayBox.on('pointerover', () => dayBox.setTint(0xffff88));
                dayBox.on('pointerout', () => dayBox.clearTint());

                // Show error
                this.showCheckinReward(errorResult.message || 'Check-in failed!', 0xef4444);
            }
        } catch (error) {
            // === ROLLBACK on network error ===
            this.saveCheckinData({
                checkedDays: previousCheckedDays,
                lastCheckin: checkinData.lastCheckin,
                streak: previousStreak
            });

            dayBox.clearTint();
            dayBox.setTint(0x888888);
            quantityText.setColor('#CCCCCC');
            checkmark.destroy();

            dayBox.setInteractive({ useHandCursor: true });
            this.showCheckinReward('Network error! Try again', 0xef4444);
        }

        // Clear cached data so fresh data is fetched when modal reopens
        this.cachedStreakStatus = null;
        this.cachedStreakHistory = null;
    }

    /**
     * Update the "Check In Day X" button after successful check-in from day box click
     */
    private updateCheckinButtonAfterSuccess(result: { nextCheckinAt?: string; streakDay: number }): void {
        // Find the check-in button and its text in elements
        // The button text contains "Check In Day"
        let checkinBtn: Phaser.GameObjects.Sprite | null = null;
        let checkinBtnText: Phaser.GameObjects.Text | null = null;

        for (const element of this.elements) {
            if (element instanceof Phaser.GameObjects.Text) {
                const text = element.text;
                if (text.includes('Check In Day')) {
                    checkinBtnText = element;
                    break;
                }
            }
        }

        // Find the button sprite near the text
        if (checkinBtnText !== null) {
            const textX = (checkinBtnText as Phaser.GameObjects.Text).x;
            const textY = (checkinBtnText as Phaser.GameObjects.Text).y;

            for (const element of this.elements) {
                if (element instanceof Phaser.GameObjects.Sprite &&
                    Math.abs(element.x - textX) < 10 &&
                    Math.abs(element.y - textY) < 10 &&
                    element.texture.key === 'square-buttons') {
                    checkinBtn = element;
                    break;
                }
            }
        }

        if (checkinBtn && checkinBtnText) {
            // Disable the button
            checkinBtn.disableInteractive();
            checkinBtn.setTint(0x888888);

            // Calculate countdown for next check-in
            let countdownText = 'Come back tomorrow!';
            if (result.nextCheckinAt) {
                const nextCheckinDate = new Date(result.nextCheckinAt);
                const now = new Date();
                const diffMs = nextCheckinDate.getTime() - now.getTime();
                
                if (diffMs > 0) {
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    if (hours > 0) {
                        countdownText = `Come back in ${hours}h ${mins}m`;
                    } else {
                        countdownText = `Come back in ${mins}m`;
                    }
                }
            }

            checkinBtnText.setText(countdownText);
            checkinBtnText.setColor('#FFA726');
        }
    }

    private showCheckinReward(text: string, color: number): void {
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
        rewardText.setTint(color);
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

    // Storage helpers
    private getCheckinData(): CheckinData {
        if (typeof window === 'undefined') {
            return { checkedDays: [], lastCheckin: '', streak: 0 };
        }
        const stored = localStorage.getItem(GAME_CONSTANTS.CHECKIN_STORAGE_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch {
                return { checkedDays: [], lastCheckin: '', streak: 0 };
            }
        }
        return { checkedDays: [], lastCheckin: '', streak: 0 };
    }

    private saveCheckinData(data: CheckinData): void {
        if (typeof window !== 'undefined') {
            localStorage.setItem(GAME_CONSTANTS.CHECKIN_STORAGE_KEY, JSON.stringify(data));
        }
    }

    private getTodayString(): string {
        const today = new Date();
        return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    }

    private canCheckinToday(): boolean {
        const data = this.getCheckinData();
        return data.lastCheckin !== this.getTodayString();
    }
}
