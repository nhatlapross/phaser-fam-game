import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { TileState, PlantType, PLANT_STAGES, CROP_DEFINITIONS, getMaxWaterHours } from '../types/GameTypes';

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

// Stage names matching backend
const STAGE_NAMES: Record<number, string> = {
    [PLANT_STAGES.DIGGING]: 'Digging',
    [PLANT_STAGES.SEED]: 'Seed',
    [PLANT_STAGES.SPROUT]: 'Sprout',
    [PLANT_STAGES.GROWING]: 'Growing',
    [PLANT_STAGES.BLOOM]: 'Bloom',
    [PLANT_STAGES.MATURE]: 'Mature'
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

        // Count hydration info rows
        if (tileState.hydration) {
            infoRows += 2; // Health + Water status
        }

        // Count growth info rows
        if (tileState.growth) {
            if (tileState.growth.progress !== undefined) infoRows++;
            if (tileState.growth.hoursRemaining !== undefined) infoRows++;
        }

        // Count plant info rows
        if (tileState.plantInfo) {
            if (tileState.plantInfo.lastWateredAt) infoRows++;
            if (tileState.plantInfo.plantedAt) infoRows++;
        }

        // Count soil quality row
        if (tileState.soilQuality) infoRows++;

        // Status row is always shown
        infoRows++;

        // Add button space if harvest available
        const stage = tileState.plantStage;
        const buttonSpace = (!tileState.isDead && stage === PLANT_STAGES.MATURE) ? 50 : 20;

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
     * Get current stage image key and frame index
     * Returns { key, frame } where frame is undefined for individual images
     *
     * For 2-stage plants (algae, mushroom):
     * DIGGING(0), SEED(1), SPROUT(2) -> frame 0 (seedling)
     * GROWING(3), BLOOM(4) -> frame 2 (mature) - skip frame 1
     * MATURE(5) -> fruit image
     *
     * For 3-stage plants (tree):
     * DIGGING(0), SEED(1) -> frame 0 / image 1 (seedling)
     * SPROUT(2), GROWING(3) -> frame 1 / image 2 (growing)
     * BLOOM(4) -> frame 2 / image 3 (mature)
     * MATURE(5) -> fruit image
     */
    private getPlantImageKey(cropType: PlantType, stage: number, isDead: boolean): { key: string; frame?: number } {
        const cropDef = CROP_DEFINITIONS[cropType];

        if (isDead) {
            return { key: cropDef.deathImage };
        } else if (stage === PLANT_STAGES.MATURE) {
            return { key: cropDef.fruitImage };
        } else if (stage >= PLANT_STAGES.DIGGING && stage <= PLANT_STAGES.BLOOM) {
            if (cropDef.spritesheet) {
                if (cropDef.stageCount === 2) {
                    // 2-stage plants (algae, mushroom)
                    // Use frame 0 for early stages, frame 2 for later stages (skip frame 1)
                    const frameIndex = stage <= PLANT_STAGES.SPROUT ? 0 : 2;
                    return { key: cropDef.spritesheet, frame: frameIndex };
                } else if (cropDef.stageCount === 3) {
                    // 3-stage plants (tree with spritesheet)
                    let frameIndex: number;
                    if (stage <= PLANT_STAGES.SEED) {
                        frameIndex = 0;
                    } else if (stage <= PLANT_STAGES.GROWING) {
                        frameIndex = 1;
                    } else {
                        frameIndex = 2;
                    }
                    return { key: cropDef.spritesheet, frame: frameIndex };
                }
            }
            
            // Fallback to growth images (tree without spritesheet)
            if (cropDef.growthImages && cropDef.growthImages.length > 0) {
                let imageIndex: number;
                if (stage <= PLANT_STAGES.SEED) {
                    imageIndex = 0;
                } else if (stage <= PLANT_STAGES.GROWING) {
                    imageIndex = 1;
                } else {
                    imageIndex = 2;
                }
                imageIndex = Math.min(imageIndex, cropDef.growthImages.length - 1);
                return { key: cropDef.growthImages[imageIndex] };
            }
        }
        
        // Fallback
        if (cropDef.spritesheet) {
            return { key: cropDef.spritesheet, frame: 0 };
        }
        return { key: cropDef.growthImages?.[0] || 'default-plant' };
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

        // Map API stage to visual stage based on plant type
        // Algae/Mushroom: 2 visual stages, Tree: 3 visual stages
        let visualStage: number;
        let totalVisualStages: number;
        let stageName: string;

        if (cropDef.stageCount === 2) {
            // 2-stage plants (algae, mushroom)
            // DIGGING(0), SEED(1), SPROUT(2) → visual 1 (Seedling)
            // GROWING(3), BLOOM(4) → visual 2 (Mature)
            // MATURE(5) → Harvest
            totalVisualStages = 2;
            if (stage === PLANT_STAGES.MATURE) {
                visualStage = 2;
                stageName = 'Harvest';
            } else if (stage <= PLANT_STAGES.SPROUT) {
                visualStage = 1;
                stageName = 'Seedling';
            } else {
                visualStage = 2;
                stageName = 'Mature';
            }
        } else if (cropDef.stageCount === 3) {
            // 3-stage plants (tree)
            // DIGGING(0), SEED(1) → visual 1 (Seedling)
            // SPROUT(2), GROWING(3) → visual 2 (Growing)
            // BLOOM(4) → visual 3 (Mature)
            // MATURE(5) → Harvest
            totalVisualStages = 3;
            if (stage === PLANT_STAGES.MATURE) {
                visualStage = 3;
                stageName = 'Harvest';
            } else if (stage <= PLANT_STAGES.SEED) {
                visualStage = 1;
                stageName = 'Seedling';
            } else if (stage <= PLANT_STAGES.GROWING) {
                visualStage = 2;
                stageName = 'Growing';
            } else {
                visualStage = 3;
                stageName = 'Mature';
            }
        } else {
            // Fallback
            totalVisualStages = cropDef.stageCount || 3;
            stageName = STAGE_NAMES[stage] || 'Unknown';
            visualStage = Math.min(stage + 1, totalVisualStages);
        }

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
        const plantImageData = this.getPlantImageKey(cropType, stage, tileState.isDead || false);
        const plantImage = plantImageData.frame !== undefined
            ? this.scene.add.image(modalX, modalTop + 85, plantImageData.key, plantImageData.frame)
            : this.scene.add.image(modalX, modalTop + 85, plantImageData.key);
        plantImage.setDisplaySize(64, 64);
        plantImage.setDepth(5302);
        this.scene.cameras.main.ignore(plantImage);
        this.addElement(plantImage);

        // Apply wilted tint if needed
        if (tileState.isWilted && !tileState.isDead) {
            plantImage.setTint(0xccaa66);
        }

        // Stage name below image (display visual stage out of total visual stages)
        const stageText = this.scene.add.text(modalX, modalTop + 125, `Stage: ${stageName} (${visualStage}/${totalVisualStages})`, {
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

        // Hydration info (health/water status) - Priority display
        if (tileState.hydration) {
            // Use waterBalance and plant-type-specific max hours for accurate display
            const waterBalance = tileState.hydration.waterBalance ?? 0;
            const plantType = tileState.cropType || 'algae';
            const maxWaterHours = getMaxWaterHours(plantType);
            const healthPercent = Math.min(Math.round((waterBalance / maxWaterHours) * 100), 100);
            let healthColor = '#4CAF50';
            if (healthPercent <= 30) healthColor = '#F44336';
            else if (healthPercent <= 60) healthColor = '#FF9800';
            this.createInfoRow(leftX, currentY, 'Hydration:', `${healthPercent}% (${waterBalance}h)`, healthColor);
            currentY += lineHeight;

            // Hydration status
            const statusColor = tileState.hydration.status === 'HEALTHY' ? '#4CAF50' :
                               tileState.hydration.status === 'WITHERING' ? '#FF9800' : '#F44336';
            this.createInfoRow(leftX, currentY, 'Water:', tileState.hydration.status, statusColor);
            currentY += lineHeight;
        }

        // Growth info
        if (tileState.growth) {
            // Growth progress
            if (tileState.growth.progress !== undefined) {
                this.createInfoRow(leftX, currentY, 'Growth:', `${tileState.growth.progress}%`);
                currentY += lineHeight;
            }

            // Hours remaining to fully grown
            if (tileState.growth.hoursRemaining !== undefined) {
                this.createInfoRow(leftX, currentY, 'Time Left:', `${tileState.growth.hoursRemaining}h`);
                currentY += lineHeight;
            }
        }

        // Plant info from API
        if (tileState.plantInfo) {
            // Last watered time
            if (tileState.plantInfo.lastWateredAt) {
                const wateredDate = new Date(tileState.plantInfo.lastWateredAt);
                const wateredStr = this.formatDateTime(wateredDate);
                this.createInfoRow(leftX, currentY, 'Watered:', wateredStr);
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

        // Soil quality (optional)
        if (tileState.soilQuality) {
            const soilColor = tileState.soilQuality.fertility >= 50 ? '#4CAF50' : '#FF9800';
            this.createInfoRow(leftX, currentY, 'Soil:', `${tileState.soilQuality.fertility}% fertile`, soilColor);
            currentY += lineHeight;
        }

        // Status from hydration
        let statusText = 'Healthy';
        let statusColor = '#4CAF50';
        if (tileState.hydration) {
            statusText = tileState.hydration.status;
            if (tileState.hydration.isDead) {
                statusText = 'Dead';
                statusColor = '#F44336';
            } else if (tileState.hydration.isWithering) {
                statusText = 'Needs Water!';
                statusColor = '#FF9800';
            }
        } else if (tileState.isDead) {
            statusText = 'Dead';
            statusColor = '#F44336';
        } else if (tileState.isWilted) {
            statusText = 'Wilted';
            statusColor = '#FF9800';
        }
        this.createInfoRow(leftX, currentY, 'Status:', statusText, statusColor);

        // Harvest button (only show if at mature stage and not dead)
        if (!tileState.isDead && stage === PLANT_STAGES.MATURE) {
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
