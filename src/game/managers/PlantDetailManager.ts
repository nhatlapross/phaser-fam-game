import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { TileState, PlantType, PLANT_STAGES, CROP_DEFINITIONS } from '../types/GameTypes';

// Plant detail information
export interface PlantDetailInfo {
    tileState: TileState;
    tileX: number;
    tileY: number;
    healthPercentage?: number; // 0-100
}

interface PlantDetailCallbacks {
    onWater?: (plantId: string) => void;
    onHarvest?: (plantId: string) => void;
    onRemove?: (landId: string) => void;
}

// Stage names
const STAGE_NAMES: Record<number, string> = {
    [PLANT_STAGES.SEED]: 'Seed',
    [PLANT_STAGES.SPROUT]: 'Sprout',
    [PLANT_STAGES.YOUNG]: 'Young',
    [PLANT_STAGES.MATURE]: 'Mature',
    [PLANT_STAGES.FLOWER]: 'Flower',
    [PLANT_STAGES.FRUIT]: 'Fruit'
};

/**
 * Manages plant detail modal
 * Shows detailed information about a selected plant
 */
export class PlantDetailManager extends BaseManager {
    private callbacks: PlantDetailCallbacks;
    private currentPlantInfo: PlantDetailInfo | null = null;

    constructor(scene: Phaser.Scene, callbacks: PlantDetailCallbacks = {}) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Calculate modal height based on available info
     */
    private calculateModalHeight(plantInfo: PlantDetailInfo): number {
        const { tileState } = plantInfo;
        const baseHeight = 180; // Title, image, stage, status, padding
        const lineHeight = 20;
        let infoRows = 0;

        // Count progress info rows
        if (tileState.progress) {
            if (tileState.progress.percentage !== undefined) infoRows++;
            if (tileState.progress.timeRemaining) infoRows++;
            if (tileState.progress.canWater !== undefined) infoRows++;
        }

        // Count plant info rows
        if (tileState.plantInfo) {
            if (tileState.plantInfo.waterCount !== undefined && tileState.plantInfo.waterCount >= 0) infoRows++;
            if (tileState.plantInfo.plantedAt) infoRows++;
        }

        // Count config info rows
        if (tileState.config) {
            if (tileState.config.growingTime) infoRows++;
            if (tileState.config.baseYield !== undefined && tileState.config.baseYield > 0) infoRows++;
        }

        // Add button space if harvest available
        const stage = tileState.plantStage;
        const buttonSpace = (!tileState.isDead && stage === PLANT_STAGES.FRUIT) ? 50 : 20;

        return baseHeight + (infoRows * lineHeight) + buttonSpace;
    }

    /**
     * Open plant detail modal
     */
    public open(plantInfo: PlantDetailInfo): void {
        if (this.isOpen) return;
        if (!plantInfo.tileState.planted || !plantInfo.tileState.cropType) return;

        this.isOpen = true;
        this.currentPlantInfo = plantInfo;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 280;
        const modalHeight = this.calculateModalHeight(plantInfo);
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(
            screenWidth / 2, screenHeight / 2,
            screenWidth, screenHeight,
            0x000000, 0.6
        );
        overlay.setDepth(5300);
        overlay.setInteractive();
        overlay.on('pointerdown', () => this.close());
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

        // Animation
        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Create content after animation
        this.scene.time.delayedCall(100, () => {
            this.createModalContent(modalX, modalY, modalWidth, modalHeight, plantInfo);
        });
    }

    /**
     * Close modal
     */
    public close(): void {
        this.isOpen = false;
        this.currentPlantInfo = null;
        this.destroyElements();
    }

    /**
     * Get current stage image key
     */
    private getPlantImageKey(cropType: PlantType, stage: number, isDead: boolean): string {
        const cropDef = CROP_DEFINITIONS[cropType];

        if (isDead) {
            return cropDef.deathImage;
        } else if (stage === PLANT_STAGES.FRUIT) {
            return cropDef.fruitImage;
        } else if (stage === PLANT_STAGES.SEED) {
            return cropDef.seedImage;
        } else {
            // Stage 1-4 maps to growthImages[0-3]
            return cropDef.growthImages[stage - 1] || cropDef.growthImages[0];
        }
    }

    /**
     * Create modal content
     */
    private createModalContent(
        modalX: number,
        modalY: number,
        modalWidth: number,
        modalHeight: number,
        plantInfo: PlantDetailInfo
    ): void {
        const { tileState } = plantInfo;
        const cropType = tileState.cropType!;
        const stage = tileState.plantStage;
        const cropDef = CROP_DEFINITIONS[cropType];
        const plantName = cropDef.name; // 'Algae', 'Mushroom', 'Tree'
        const stageName = STAGE_NAMES[stage] || 'Unknown';

        // Close button
        const closeBtnX = modalX + modalWidth / 2 - 30;
        const closeBtnY = modalY - modalHeight / 2 + 40;

        const closeBtnBg = this.scene.add.sprite(closeBtnX, closeBtnY, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(closeBtnX, closeBtnY, 'X', {
            fontSize: '10px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5303);
        closeText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(closeText);
        this.addElement(closeText);

        closeBtnBg.on('pointerdown', () => this.close());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Calculate positions from modal top
        const modalTop = modalY - modalHeight / 2;

        // Title - Plant Name
        const title = this.scene.add.text(modalX, modalTop + 40, plantName.toUpperCase(), {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5302);
        title.setStroke('#5D4037', 3);
        this.scene.cameras.main.ignore(title);
        this.addElement(title);

        // Plant image - current stage
        const plantImageKey = this.getPlantImageKey(cropType, stage, tileState.isDead || false);
        const plantImage = this.scene.add.image(modalX, modalTop + 85, plantImageKey);
        plantImage.setDisplaySize(64, 64);
        plantImage.setDepth(5302);
        this.scene.cameras.main.ignore(plantImage);
        this.addElement(plantImage);

        // Apply wilted tint if needed
        if (tileState.isWilted && !tileState.isDead) {
            plantImage.setTint(0xccaa66);
        }

        // Stage name below image
        const stageText = this.scene.add.text(modalX, modalTop + 125, `Stage: ${stageName} (${stage}/5)`, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        stageText.setOrigin(0.5);
        stageText.setDepth(5302);
        stageText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(stageText);
        this.addElement(stageText);

        // Info section - positioned below stage text
        const infoStartY = modalTop + 150;
        const lineHeight = 20;
        const leftX = modalX - 80;
        let currentY = infoStartY;

        // Progress info from API
        if (tileState.progress) {
            // Progress percentage
            if (tileState.progress.percentage !== undefined) {
                this.createInfoRow(leftX, currentY, 'Progress:', `${tileState.progress.percentage}%`);
                currentY += lineHeight;
            }

            // Time remaining
            if (tileState.progress.timeRemaining) {
                this.createInfoRow(leftX, currentY, 'Time Left:', tileState.progress.timeRemaining);
                currentY += lineHeight;
            }

            // Can water
            if (tileState.progress.canWater !== undefined) {
                const canWaterText = tileState.progress.canWater ? 'Yes' : 'No';
                const canWaterColor = tileState.progress.canWater ? '#4CAF50' : '#F44336';
                this.createInfoRow(leftX, currentY, 'Can Water:', canWaterText, canWaterColor);
                currentY += lineHeight;
            }
        }

        // Plant info from API
        if (tileState.plantInfo) {
            // Water count (only if defined and > 0)
            if (tileState.plantInfo.waterCount !== undefined && tileState.plantInfo.waterCount >= 0) {
                this.createInfoRow(leftX, currentY, 'Watered:', `${tileState.plantInfo.waterCount} times`);
                currentY += lineHeight;
            }

            // Planted time
            if (tileState.plantInfo.plantedAt) {
                const plantedDate = new Date(tileState.plantInfo.plantedAt);
                const plantedStr = this.formatDateTime(plantedDate);
                this.createInfoRow(leftX, currentY, 'Planted:', plantedStr);
                currentY += lineHeight;
            }
        }

        // Config info from API
        if (tileState.config) {
            // Growing time
            if (tileState.config.growingTime) {
                this.createInfoRow(leftX, currentY, 'Grow Time:', tileState.config.growingTime);
                currentY += lineHeight;
            }

            // Base yield
            if (tileState.config.baseYield !== undefined && tileState.config.baseYield > 0) {
                this.createInfoRow(leftX, currentY, 'Base Yield:', `${tileState.config.baseYield}`);
                currentY += lineHeight;
            }
        }

        // Status
        let statusText = 'Healthy';
        let statusColor = '#4CAF50';
        if (tileState.isDead) {
            statusText = 'Dead';
            statusColor = '#F44336';
        } else if (tileState.isWilted) {
            statusText = 'Wilted';
            statusColor = '#FF9800';
        }
        this.createInfoRow(leftX, currentY, 'Status:', statusText, statusColor);

        // Harvest button (only show if at fruit stage and not dead)
        if (!tileState.isDead && stage === PLANT_STAGES.FRUIT) {
            const btnY = modalY + modalHeight / 2 - 40;
            this.createActionButton(
                modalX,
                btnY,
                80,
                28,
                'Harvest',
                () => {
                    if (tileState.plantId && this.callbacks.onHarvest) {
                        this.callbacks.onHarvest(tileState.plantId);
                        this.close();
                    }
                },
                0x4CAF50
            );
        }
    }

    /**
     * Create info row
     */
    private createInfoRow(x: number, y: number, label: string, value: string, valueColor: string = '#FFFFFF'): void {
        const labelText = this.scene.add.text(x, y, label, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        labelText.setOrigin(0, 0.5);
        labelText.setDepth(5302);
        labelText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(labelText);
        this.addElement(labelText);

        const valueText = this.scene.add.text(x + 85, y, value, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: valueColor,
            resolution: 2
        });
        valueText.setOrigin(0, 0.5);
        valueText.setDepth(5302);
        valueText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(valueText);
        this.addElement(valueText);
    }

    /**
     * Create health bar
     */
    private createHealthBar(x: number, y: number, percentage: number): void {
        const barWidth = 140;
        const barHeight = 10;

        // Background
        const bgBar = this.scene.add.rectangle(x, y, barWidth + 2, barHeight + 2, 0x333333);
        bgBar.setDepth(5302);
        this.scene.cameras.main.ignore(bgBar);
        this.addElement(bgBar);

        // Fill color based on percentage
        let fillColor = 0x4CAF50; // Green
        if (percentage < 30) {
            fillColor = 0xF44336; // Red
        } else if (percentage < 60) {
            fillColor = 0xFF9800; // Orange
        }

        // Fill bar
        const fillWidth = (barWidth * percentage) / 100;
        const fillBar = this.scene.add.rectangle(
            x - barWidth / 2 + fillWidth / 2,
            y,
            fillWidth,
            barHeight,
            fillColor
        );
        fillBar.setDepth(5303);
        this.scene.cameras.main.ignore(fillBar);
        this.addElement(fillBar);

        // Percentage text
        const percentText = this.scene.add.text(x, y, `${Math.round(percentage)}%`, {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        percentText.setOrigin(0.5);
        percentText.setDepth(5304);
        percentText.setStroke('#000000', 1);
        this.scene.cameras.main.ignore(percentText);
        this.addElement(percentText);
    }

    /**
     * Create action button
     */
    private createActionButton(
        x: number,
        y: number,
        width: number,
        height: number,
        text: string,
        onClick: () => void,
        color: number
    ): void {
        const btnBg = this.scene.add.sprite(x, y, 'square-buttons', 6);
        btnBg.setDisplaySize(width, height);
        btnBg.setDepth(5302);
        btnBg.setTint(color);
        btnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(btnBg);
        this.addElement(btnBg);

        const btnText = this.scene.add.text(x, y, text, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        btnText.setOrigin(0.5);
        btnText.setDepth(5303);
        btnText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(btnText);
        this.addElement(btnText);

        btnBg.on('pointerover', () => btnBg.setAlpha(0.8));
        btnBg.on('pointerout', () => btnBg.setAlpha(1));
        btnBg.on('pointerdown', onClick);
    }

    /**
     * Format time since timestamp
     */
    private formatTimeSince(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ago`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    /**
     * Format date time for display
     */
    private formatDateTime(date: Date): string {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${day}/${month} ${hours}:${minutes}`;
    }
}
