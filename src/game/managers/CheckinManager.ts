import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { CheckinData, GAME_CONSTANTS } from '../types/GameTypes';

interface CheckinCallbacks {
    onRewardWater: () => void;
    onRewardMushroomSeed: () => void;
    updateToolbar: () => void;
}

/**
 * Manages the daily check-in system
 * Handles check-in modal, streak tracking, and rewards
 */
export class CheckinManager extends BaseManager {
    private checkinSign!: Phaser.GameObjects.Image;
    private callbacks: CheckinCallbacks;

    constructor(scene: Phaser.Scene, callbacks: CheckinCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Create the check-in sign on the map
     */
    public createCheckinSign(tileSize: number): void {
        const centerX = 25;
        const centerY = 25;
        const signX = (centerX - 3) * tileSize + tileSize / 2;
        const signY = (centerY - 1) * tileSize + tileSize / 2;

        this.checkinSign = this.scene.add.image(signX, signY, 'icon-checkin');
        this.checkinSign.setDisplaySize(16, 16);
        this.checkinSign.setDepth(signY);
        this.checkinSign.setInteractive({ useHandCursor: true });

        this.checkinSign.on('pointerdown', () => {
            this.open();
        });

        // Setup hover effect with tint + shadow
        this.setupHoverEffect(this.checkinSign, 6);
    }

    /**
     * Get the check-in sign sprite for camera ignore setup
     */
    public getCheckinSign(): Phaser.GameObjects.Image {
        return this.checkinSign;
    }

    /**
     * Open the check-in modal
     */
    public open(): void {
        if (this.isOpen) return;
        this.isOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 320;
        const modalHeight = 220;
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

        // Title and content
        this.scene.time.delayedCall(100, () => {
            this.createModalContent(modalX, modalY, modalWidth, modalHeight);
        });

        // Close on overlay click
        overlay.on('pointerdown', () => this.close());
    }

    /**
     * Close the check-in modal
     */
    public close(): void {
        this.isOpen = false;
        this.destroyElements();
    }

    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        // Title
        const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 35, 'Daily Check-in', {
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

        // Get checkin data
        const checkinData = this.getCheckinData();
        const todayDayOfWeek = this.getDayOfWeek();
        const canCheckin = this.canCheckinToday();

        // Day boxes
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayBoxSize = 38;
        const daySpacing = 8;
        const rowSpacing = 45;
        const row1Y = modalY - 35;
        const row2Y = row1Y + rowSpacing;

        dayNames.forEach((dayName, index) => {
            let dayX: number;
            let dayY: number;

            if (index < 4) {
                const row1StartX = modalX - (4 * (dayBoxSize + daySpacing) - daySpacing) / 2 + dayBoxSize / 2;
                dayX = row1StartX + index * (dayBoxSize + daySpacing);
                dayY = row1Y;
            } else {
                const row2StartX = modalX - (3 * (dayBoxSize + daySpacing) - daySpacing) / 2 + dayBoxSize / 2;
                dayX = row2StartX + (index - 4) * (dayBoxSize + daySpacing);
                dayY = row2Y;
            }

            const isToday = index === todayDayOfWeek;
            const isChecked = checkinData.checkedDays.includes(index);

            // Day box
            const boxFrame = isChecked ? 6 : (isToday ? 6 : 7);
            const dayBox = this.scene.add.sprite(dayX, dayY, 'square-buttons', boxFrame);
            dayBox.setDisplaySize(dayBoxSize, dayBoxSize);
            dayBox.setDepth(5302);
            dayBox.setAlpha(0);
            this.scene.cameras.main.ignore(dayBox);
            this.addElement(dayBox);

            if (isChecked) {
                dayBox.setTint(0x4ade80);
            } else if (!isToday) {
                dayBox.setTint(0x888888);
            }

            // Day name text
            const dayText = this.scene.add.text(dayX, dayY - 10, dayName, {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            dayText.setOrigin(0.5);
            dayText.setDepth(5303);
            dayText.setStroke('#5D4037', 1);
            dayText.setAlpha(0);
            this.scene.cameras.main.ignore(dayText);
            this.addElement(dayText);

            // Checkmark or day number
            const checkSymbol = isChecked ? '✓' : (index + 1).toString();
            const checkText = this.scene.add.text(dayX, dayY + 6, checkSymbol, {
                fontSize: isChecked ? '12px' : '10px',
                fontFamily: 'PixelFont',
                color: isChecked ? '#FFFFFF' : '#FFF8E1',
                resolution: 2
            });
            checkText.setOrigin(0.5);
            checkText.setDepth(5303);
            checkText.setStroke('#5D4037', 1);
            checkText.setAlpha(0);
            this.scene.cameras.main.ignore(checkText);
            this.addElement(checkText);

            // Fade in
            this.scene.tweens.add({
                targets: [dayBox, dayText, checkText],
                alpha: 1,
                duration: 150,
                delay: index * 30
            });

            // Make today's box clickable
            if (isToday && canCheckin && !isChecked) {
                dayBox.setInteractive({ useHandCursor: true });
                dayBox.on('pointerover', () => dayBox.setTint(0xffff88));
                dayBox.on('pointerout', () => dayBox.clearTint());
                dayBox.on('pointerdown', () => {
                    this.performCheckin(index, dayBox, checkText, checkinData);
                });
            }
        });

        // Streak info
        const infoY = row2Y + 35;
        const streakText = this.scene.add.text(modalX, infoY, `Current Streak: ${checkinData.streak} day${checkinData.streak !== 1 ? 's' : ''}`, {
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

        // Reward info
        const rewardInfo = this.scene.add.text(modalX, infoY + 16, 'Check in to get 1 Water!', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        rewardInfo.setOrigin(0.5);
        rewardInfo.setDepth(5302);
        rewardInfo.setStroke('#2d5a2d', 1);
        rewardInfo.setAlpha(0);
        this.scene.cameras.main.ignore(rewardInfo);
        this.addElement(rewardInfo);

        this.scene.tweens.add({ targets: rewardInfo, alpha: 1, duration: 150, delay: 250 });

        // 7-day streak bonus
        const bonusInfo = this.scene.add.text(modalX, infoY + 30, '7-day streak = Mushroom Seed!', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#fbbf24',
            resolution: 2
        });
        bonusInfo.setOrigin(0.5);
        bonusInfo.setDepth(5302);
        bonusInfo.setStroke('#5D4037', 1);
        bonusInfo.setAlpha(0);
        this.scene.cameras.main.ignore(bonusInfo);
        this.addElement(bonusInfo);

        this.scene.tweens.add({ targets: bonusInfo, alpha: 1, duration: 150, delay: 300 });

        // Close button
        const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 30, modalY - modalHeight / 2 + 35, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setAlpha(0);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(modalX + modalWidth / 2 - 30, modalY - modalHeight / 2 + 35, 'X', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5303);
        closeText.setStroke('#5D4037', 1);
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
    }

    private performCheckin(
        dayIndex: number,
        dayBox: Phaser.GameObjects.Sprite,
        checkText: Phaser.GameObjects.Text,
        checkinData: CheckinData
    ): void {
        const today = this.getTodayString();

        // Calculate streak
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;

        let newStreak = 1;
        if (checkinData.lastCheckin === yesterdayString) {
            newStreak = checkinData.streak + 1;
        }

        // Update checked days
        if (!checkinData.checkedDays.includes(dayIndex)) {
            checkinData.checkedDays.push(dayIndex);
        }

        // Save
        this.saveCheckinData({
            checkedDays: checkinData.checkedDays,
            lastCheckin: today,
            streak: newStreak
        });

        // Update UI
        dayBox.setTint(0x4ade80);
        checkText.setText('✓');
        checkText.setFontSize(12);
        dayBox.disableInteractive();

        // Animate check
        this.scene.tweens.add({
            targets: dayBox,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 100,
            yoyo: true
        });

        // Give reward: +1 water
        this.callbacks.onRewardWater();
        this.showCheckinReward('+1 Water!', 0x4ade80);

        // Check for 7-day streak bonus
        if (newStreak >= 7 && newStreak % 7 === 0) {
            this.callbacks.onRewardMushroomSeed();
            this.scene.time.delayedCall(1000, () => {
                this.showCheckinReward('+1 Mushroom Seed!', 0xfbbf24);
            });
        }

        // Update toolbar
        this.callbacks.updateToolbar();
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

    private getDayOfWeek(): number {
        return new Date().getDay();
    }

    private canCheckinToday(): boolean {
        const data = this.getCheckinData();
        return data.lastCheckin !== this.getTodayString();
    }
}
