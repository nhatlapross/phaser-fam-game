import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { PlantType, ChestSlot, CROP_DEFINITIONS, PLANT_TYPES, GAME_CONSTANTS, FertilizerType } from '../types/GameTypes';

interface FactoryCallbacks {
    getChestInventory: () => ChestSlot[];
    getFertilizerCounts: () => Record<FertilizerType, number>;
    getPlayer: () => Phaser.Physics.Arcade.Sprite;
    updateToolbar: () => void;
    closeSeedSelector: () => void;
    closeChestPanel: () => void;
}

/**
 * Manages the factory system
 * Handles fruit to fertilizer conversion
 */
export class FactoryManager extends BaseManager {
    private factorySprite!: Phaser.GameObjects.Sprite;
    private factoryWorking: boolean = false;
    private droppedFertilizers: Phaser.GameObjects.Sprite[] = [];
    private callbacks: FactoryCallbacks;
    private tileSize: number;
    private idleAnimEvent?: Phaser.Time.TimerEvent;

    constructor(scene: Phaser.Scene, callbacks: FactoryCallbacks, tileSize: number) {
        super(scene);
        this.callbacks = callbacks;
        this.tileSize = tileSize;
    }

    /**
     * Create the factory sprite on the map
     */
    public createFactory(): void {
        const centerX = 25;
        const centerY = 25;
        const factoryX = centerX * this.tileSize + this.tileSize / 2;
        const factoryY = (centerY - 5) * this.tileSize;

        this.factorySprite = this.scene.add.sprite(factoryX, factoryY, 'factory-1');
        this.factorySprite.setDisplaySize(64, 64);
        this.factorySprite.setDepth(factoryY + 20);
        this.factorySprite.setInteractive({ useHandCursor: true });

        // Create idle animation
        this.idleAnimEvent = this.scene.time.addEvent({
            delay: 500,
            callback: () => {
                if (!this.factoryWorking) {
                    const currentFrame = this.factorySprite.texture.key;
                    const nextFrame = currentFrame === 'factory-1' ? 'factory-2' : 'factory-1';
                    this.factorySprite.setTexture(nextFrame);
                }
            },
            loop: true
        });

        this.factorySprite.on('pointerdown', () => {
            this.toggle();
        });

        // Setup hover effect with tint + shadow
        this.setupHoverEffect(this.factorySprite, 12);
    }

    /**
     * Get the factory sprite for camera ignore setup
     */
    public getFactorySprite(): Phaser.GameObjects.Sprite {
        return this.factorySprite;
    }

    /**
     * Get dropped fertilizers for camera ignore setup
     */
    public getDroppedFertilizers(): Phaser.GameObjects.Sprite[] {
        return this.droppedFertilizers;
    }

    /**
     * Check if factory is working
     */
    public isWorking(): boolean {
        return this.factoryWorking;
    }

    /**
     * Toggle factory modal
     */
    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open the factory modal
     */
    public open(): void {
        this.close();
        this.isOpen = true;
        this.callbacks.closeSeedSelector();
        this.callbacks.closeChestPanel();

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        const panelWidth = 220;
        const panelHeight = 200;
        const panelX = screenWidth / 2;
        const panelY = screenHeight / 2 - 30;

        // Background panel
        const panelBg = this.scene.add.sprite(panelX, panelY, 'settings-panel', 1);
        panelBg.setDisplaySize(panelWidth, panelHeight);
        panelBg.setDepth(5300);
        panelBg.setAlpha(0);
        panelBg.setInteractive();
        panelBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(panelBg);
        this.addElement(panelBg);

        this.scene.tweens.add({
            targets: panelBg,
            alpha: 1,
            scaleX: panelWidth / 125,
            scaleY: panelHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Subtitle
        const subtitle = this.scene.add.text(panelX, panelY - panelHeight/2 + 38, '3 Fruits = 1 Fertilizer', {
            fontSize: '10px',
            color: '#8D6E63'
        });
        subtitle.setOrigin(0.5);
        subtitle.setDepth(5301);
        subtitle.setAlpha(0);
        this.scene.cameras.main.ignore(subtitle);
        this.addElement(subtitle);

        this.scene.tweens.add({
            targets: subtitle,
            alpha: 1,
            duration: 200,
            delay: 100
        });

        // Fruit selection buttons (2x2 grid)
        const buttonSize = 48;
        const buttonSpacing = 10;
        const gridWidth = 2 * buttonSize + buttonSpacing;
        const gridStartX = panelX - gridWidth / 2 + buttonSize / 2;
        const gridStartY = panelY - 30;

        this.scene.time.delayedCall(150, () => {
            PLANT_TYPES.forEach((plantType, index) => {
                const row = Math.floor(index / 2);
                const col = index % 2;
                const btnX = gridStartX + col * (buttonSize + buttonSpacing);
                const btnY = gridStartY + row * (buttonSize + buttonSpacing);

                const fruitCount = this.getFruitCountInChest(plantType);
                const canConvert = fruitCount >= GAME_CONSTANTS.FRUITS_PER_FERTILIZER;

                // Button background
                const btnBg = this.scene.add.sprite(btnX, btnY, 'square-buttons', canConvert ? 6 : 7);
                btnBg.setDisplaySize(buttonSize, buttonSize);
                btnBg.setDepth(5302);
                btnBg.setAlpha(0);
                this.scene.cameras.main.ignore(btnBg);
                this.addElement(btnBg);

                if (canConvert) {
                    btnBg.setInteractive({ useHandCursor: true });
                    btnBg.on('pointerover', () => btnBg.setFrame(4));
                    btnBg.on('pointerout', () => btnBg.setFrame(6));
                    btnBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                        event.stopPropagation();
                        this.convertFruitToFertilizer(plantType);
                    });
                }

                this.scene.tweens.add({
                    targets: btnBg,
                    alpha: 1,
                    duration: 100,
                    delay: index * 50
                });

                // Fruit icon
                const cropDef = CROP_DEFINITIONS[plantType];
                const fruitIcon = this.scene.add.image(btnX, btnY - 5, cropDef.fruitImage);
                fruitIcon.setDisplaySize(buttonSize - 12, buttonSize - 12);
                fruitIcon.setDepth(5303);
                fruitIcon.setAlpha(0);
                if (!canConvert) fruitIcon.setTint(0x666666);
                this.scene.cameras.main.ignore(fruitIcon);
                this.addElement(fruitIcon);

                this.scene.tweens.add({
                    targets: fruitIcon,
                    alpha: 1,
                    duration: 100,
                    delay: index * 50
                });

                // Count text
                const countText = this.scene.add.text(btnX + buttonSize/2 - 4, btnY + buttonSize/2 - 4, fruitCount.toString(), {
                    fontSize: '12px',
                    color: canConvert ? '#ffffff' : '#ff6666',
                    backgroundColor: '#000000cc',
                    padding: { x: 3, y: 1 }
                });
                countText.setOrigin(1, 1);
                countText.setDepth(5304);
                countText.setAlpha(0);
                this.scene.cameras.main.ignore(countText);
                this.addElement(countText);

                this.scene.tweens.add({
                    targets: countText,
                    alpha: 1,
                    duration: 100,
                    delay: index * 50
                });
            });

            // Close button
            const closeBtn = this.scene.add.text(panelX, panelY + panelHeight/2 - 25, 'Close', {
                fontSize: '12px',
                color: '#5D4037',
                backgroundColor: '#D7CCC8',
                padding: { x: 12, y: 4 }
            });
            closeBtn.setOrigin(0.5);
            closeBtn.setDepth(5305);
            closeBtn.setAlpha(0);
            closeBtn.setInteractive({ useHandCursor: true });
            closeBtn.on('pointerover', () => closeBtn.setBackgroundColor('#BCAAA4'));
            closeBtn.on('pointerout', () => closeBtn.setBackgroundColor('#D7CCC8'));
            closeBtn.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                event.stopPropagation();
                this.close();
            });
            this.scene.cameras.main.ignore(closeBtn);
            this.addElement(closeBtn);

            this.scene.tweens.add({
                targets: closeBtn,
                alpha: 1,
                duration: 150
            });
        });
    }

    /**
     * Close the factory modal
     */
    public close(): void {
        this.isOpen = false;
        this.destroyElements();
    }

    private getFruitCountInChest(fruitType: PlantType): number {
        let total = 0;
        const chestInventory = this.callbacks.getChestInventory();
        for (const slot of chestInventory) {
            if (slot && slot.type === fruitType) {
                total += slot.count;
            }
        }
        return total;
    }

    private removeFruitsFromChest(fruitType: PlantType, amount: number): boolean {
        let remaining = amount;
        const chestInventory = this.callbacks.getChestInventory();
        for (let i = 0; i < chestInventory.length && remaining > 0; i++) {
            const slot = chestInventory[i];
            if (slot && slot.type === fruitType && slot.count > 0) {
                const toRemove = Math.min(slot.count, remaining);
                slot.count -= toRemove;
                remaining -= toRemove;

                if (slot.count <= 0) {
                    chestInventory[i] = { type: fruitType, count: 0 };
                }
            }
        }
        return remaining === 0;
    }

    private convertFruitToFertilizer(fruitType: PlantType): void {
        const fruitCount = this.getFruitCountInChest(fruitType);
        if (fruitCount < GAME_CONSTANTS.FRUITS_PER_FERTILIZER) {
            return;
        }

        if (this.factoryWorking) {
            return;
        }

        if (this.removeFruitsFromChest(fruitType, GAME_CONSTANTS.FRUITS_PER_FERTILIZER)) {
            this.close();
            this.playWorkingAnimation();
            this.callbacks.updateToolbar();
        }
    }

    private playWorkingAnimation(): void {
        this.factoryWorking = true;
        let frame = 3;

        const workingAnim = this.scene.time.addEvent({
            delay: 150,
            callback: () => {
                frame = frame === 3 ? 4 : 3;
                this.factorySprite.setTexture(`factory-${frame}`);
            },
            loop: true
        });

        this.scene.time.delayedCall(5000, () => {
            this.factoryWorking = false;
            this.factorySprite.setTexture('factory-1');
            workingAnim.destroy();
            this.spawnFertilizerBag();
        });
    }

    private spawnFertilizerBag(): void {
        const centerX = 25;
        const centerY = 25;
        const factoryX = centerX * this.tileSize + this.tileSize / 2;
        const factoryY = (centerY - 5) * this.tileSize;

        const bagX = factoryX + 40;
        const bagY = factoryY + 20;

        const fertilizerBag = this.scene.add.sprite(bagX, bagY, 'icon-fertilizer');
        fertilizerBag.setDepth(bagY);
        fertilizerBag.setInteractive({ useHandCursor: true });

        const targetSize = 24;
        const originalWidth = fertilizerBag.width;
        const targetScale = targetSize / originalWidth;

        fertilizerBag.setScale(0);

        fertilizerBag.on('pointerdown', () => {
            this.pickupFertilizer(fertilizerBag);
        });

        this.scene.tweens.add({
            targets: fertilizerBag,
            scaleX: targetScale,
            scaleY: targetScale,
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: fertilizerBag,
                    y: bagY - 5,
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        });

        this.droppedFertilizers.push(fertilizerBag);
    }

    private pickupFertilizer(bag: Phaser.GameObjects.Sprite): void {
        const player = this.callbacks.getPlayer();
        const distance = Phaser.Math.Distance.Between(
            player.x, player.y,
            bag.x, bag.y
        );

        if (distance > 50) {
            return;
        }

        const fertilizerCounts = this.callbacks.getFertilizerCounts();
        fertilizerCounts.common++;
        this.callbacks.updateToolbar();

        this.scene.tweens.add({
            targets: bag,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            y: bag.y - 20,
            duration: 200,
            onComplete: () => {
                bag.destroy();
                const index = this.droppedFertilizers.indexOf(bag);
                if (index > -1) {
                    this.droppedFertilizers.splice(index, 1);
                }
            }
        });
    }

    public destroy(): void {
        if (this.idleAnimEvent) {
            this.idleAnimEvent.destroy();
        }
        this.droppedFertilizers.forEach(bag => bag.destroy());
        this.droppedFertilizers = [];
        super.destroy();
    }
}
