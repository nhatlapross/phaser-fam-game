import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { PlantType, ChestSlot, EXCHANGE_REWARDS, ExchangeReward } from '../types/GameTypes';

interface FactoryCallbacks {
    getChestInventory: () => ChestSlot[];
    getPlayer: () => Phaser.Physics.Arcade.Sprite;
    updateToolbar: () => void;
    closeSeedSelector: () => void;
    closeChestPanel: () => void;
    showToastMessage: (text: string, color: number) => void;
}

/**
 * Manages the Phygital Exchange system
 * Handles fruit/mushroom/spore to real rewards conversion
 */
export class FactoryManager extends BaseManager {
    private factorySprite!: Phaser.GameObjects.Sprite;
    private factoryWorking: boolean = false;
    private callbacks: FactoryCallbacks;
    private tileSize: number;
    private idleAnimEvent?: Phaser.Time.TimerEvent;
    private scrollOffset: number = 0;
    private maxScrollOffset: number = 0;
    private contentElements: Phaser.GameObjects.GameObject[] = [];
    private confirmElements: Phaser.GameObjects.GameObject[] = [];

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
     * Get fruit count in chest by type
     */
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

    /**
     * Open the factory modal (Phygital Exchange)
     */
    public open(): void {
        this.close();
        this.isOpen = true;
        this.callbacks.closeSeedSelector();
        this.callbacks.closeChestPanel();
        this.scrollOffset = 0;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        const panelWidth = 300;
        const panelHeight = 300;
        const panelX = screenWidth / 2;
        const panelY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.6);
        overlay.setDepth(5299);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.addElement(overlay);
        overlay.on('pointerdown', () => this.close());

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

        // Close button
        const closeBtnBg = this.scene.add.sprite(panelX + panelWidth / 2 - 25, panelY - panelHeight / 2 + 35, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setAlpha(0);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(panelX + panelWidth / 2 - 25, panelY - panelHeight / 2 + 35, 'X', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5303);
        closeText.setAlpha(0);
        closeText.setStroke('#5D4037', 2);
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
        const title = this.scene.add.text(panelX, panelY - panelHeight / 2 + 38, 'Phygital Exchange', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5301);
        title.setStroke('#5D4037', 2);
        title.setAlpha(0);
        this.scene.cameras.main.ignore(title);
        this.addElement(title);

        this.scene.tweens.add({
            targets: title,
            alpha: 1,
            duration: 200,
            delay: 100
        });

        // Current inventory display
        const treeCount = this.getFruitCountInChest('tree');
        const mushroomCount = this.getFruitCountInChest('mushroom');
        const algaeCount = this.getFruitCountInChest('algae');

        const inventoryY = panelY - panelHeight / 2 + 58;
        const invStartX = panelX - 80;

        // Tree fruit count
        const treeIcon = this.scene.add.text(invStartX, inventoryY, '🌳', { fontSize: '12px', resolution: 2 });
        treeIcon.setOrigin(0.5);
        treeIcon.setDepth(5302);
        this.scene.cameras.main.ignore(treeIcon);
        this.addElement(treeIcon);

        const treeText = this.scene.add.text(invStartX + 15, inventoryY, `${treeCount}`, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        treeText.setOrigin(0, 0.5);
        treeText.setDepth(5302);
        this.scene.cameras.main.ignore(treeText);
        this.addElement(treeText);

        // Mushroom count
        const mushIcon = this.scene.add.text(invStartX + 50, inventoryY, '🍄', { fontSize: '12px', resolution: 2 });
        mushIcon.setOrigin(0.5);
        mushIcon.setDepth(5302);
        this.scene.cameras.main.ignore(mushIcon);
        this.addElement(mushIcon);

        const mushText = this.scene.add.text(invStartX + 65, inventoryY, `${mushroomCount}`, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#f59e0b',
            resolution: 2
        });
        mushText.setOrigin(0, 0.5);
        mushText.setDepth(5302);
        this.scene.cameras.main.ignore(mushText);
        this.addElement(mushText);

        // Algae/Spore count
        const sporeIcon = this.scene.add.text(invStartX + 110, inventoryY, '🧬', { fontSize: '12px', resolution: 2 });
        sporeIcon.setOrigin(0.5);
        sporeIcon.setDepth(5302);
        this.scene.cameras.main.ignore(sporeIcon);
        this.addElement(sporeIcon);

        const sporeText = this.scene.add.text(invStartX + 125, inventoryY, `${algaeCount}`, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#3b82f6',
            resolution: 2
        });
        sporeText.setOrigin(0, 0.5);
        sporeText.setDepth(5302);
        this.scene.cameras.main.ignore(sporeText);
        this.addElement(sporeText);

        // Table header - positioned relative to panel center
        const tableOffsetX = 15; // Shift table to the right
        const headerY = panelY - 75;
        const col1X = panelX - 100 + tableOffsetX; // Reward name - more to the left
        const col2X = panelX + 20 + tableOffsetX;   // Cost
        const col3X = panelX + 80 + tableOffsetX;  // Action button - moved to right edge

        const headerBg = this.scene.add.rectangle(panelX + tableOffsetX, headerY, panelWidth - 70, 16, 0x5D4037);
        headerBg.setDepth(5301);
        this.scene.cameras.main.ignore(headerBg);
        this.addElement(headerBg);

        const headerReward = this.scene.add.text(col1X, headerY, 'Reward', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        headerReward.setOrigin(0, 0.5);
        headerReward.setDepth(5302);
        this.scene.cameras.main.ignore(headerReward);
        this.addElement(headerReward);

        const headerCost = this.scene.add.text(col2X, headerY, 'Cost', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        headerCost.setOrigin(0.5, 0.5);
        headerCost.setDepth(5302);
        this.scene.cameras.main.ignore(headerCost);
        this.addElement(headerCost);

        const headerAction = this.scene.add.text(col3X, headerY, 'Action', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        headerAction.setOrigin(0.5, 0.5);
        headerAction.setDepth(5302);
        this.scene.cameras.main.ignore(headerAction);
        this.addElement(headerAction);

        // Scrollable area - inside the panel
        const scrollAreaTop = headerY + 12;
        const scrollAreaHeight = 180;

        // Create mask for scroll area - use screen coordinates
        const maskGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(panelX - panelWidth / 2 + 30 + tableOffsetX, scrollAreaTop, panelWidth - 70, scrollAreaHeight);
        const scrollMask = maskGraphics.createGeometryMask();
        this.addElement(maskGraphics);

        // Reward rows
        const rowHeight = 28;
        const totalContentHeight = EXCHANGE_REWARDS.length * rowHeight;
        this.maxScrollOffset = Math.max(0, totalContentHeight - scrollAreaHeight);

        this.contentElements = [];

        const updateScrollPositions = () => {
            this.contentElements.forEach((el: Phaser.GameObjects.GameObject) => {
                const gameObj = el as unknown as { y: number; originalY?: number };
                if (gameObj.originalY !== undefined) {
                    gameObj.y = gameObj.originalY - this.scrollOffset;
                }
            });
        };

        // Drag scroll variables
        let isDragging = false;
        let lastPointerY = 0;

        this.scene.time.delayedCall(150, () => {
            EXCHANGE_REWARDS.forEach((reward, index) => {
                const baseY = scrollAreaTop + 14 + index * rowHeight;

                // Check if user can afford ALL required resources
                const hasEnoughTree = reward.treeCost === 0 || treeCount >= reward.treeCost;
                const hasEnoughMushroom = mushroomCount >= reward.mushroomCost;
                const hasEnoughSpore = algaeCount >= reward.sporeCost;
                const canAfford = hasEnoughTree && hasEnoughMushroom && hasEnoughSpore;

                // Row background
                const rowBg = this.scene.add.rectangle(panelX + tableOffsetX, baseY, panelWidth - 70, rowHeight - 2, index % 2 === 0 ? 0xD4C4A8 : 0xC4B498);
                rowBg.setDepth(5302);
                rowBg.setMask(scrollMask);
                rowBg.setInteractive();
                this.scene.cameras.main.ignore(rowBg);
                this.addElement(rowBg);
                this.contentElements.push(rowBg);
                (rowBg as any).originalY = baseY;

                // Drag handlers for scroll
                rowBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                    isDragging = true;
                    lastPointerY = pointer.y;
                });

                // Reward name with icon
                const nameText = this.scene.add.text(col1X, baseY, `${reward.icon} ${reward.name}`, {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: canAfford ? '#3d2817' : '#888888',
                    resolution: 2
                });
                nameText.setOrigin(0, 0.5);
                nameText.setStroke('#00000033', 1);
                nameText.setDepth(5303);
                nameText.setMask(scrollMask);
                this.scene.cameras.main.ignore(nameText);
                this.addElement(nameText);
                this.contentElements.push(nameText);
                (nameText as any).originalY = baseY;

                // Cost display - show all 3 costs: Tree / Mushroom / Spore
                let costParts: string[] = [];
                if (reward.treeCost > 0) {
                    costParts.push(`🌳${reward.treeCost}`);
                }
                costParts.push(`🍄${reward.mushroomCost}`);
                costParts.push(`🧬${reward.sporeCost}`);
                const costDisplay = costParts.join('/');

                const costText = this.scene.add.text(col2X, baseY, costDisplay, {
                    fontSize: '7px',
                    fontFamily: 'PixelFont',
                    color: canAfford ? '#16a34a' : '#ef4444',
                    resolution: 2
                });
                costText.setOrigin(0.5);
                costText.setDepth(5303);
                costText.setMask(scrollMask);
                this.scene.cameras.main.ignore(costText);
                this.addElement(costText);
                this.contentElements.push(costText);
                (costText as any).originalY = baseY;

                // Change button
                const btnBg = this.scene.add.sprite(col3X, baseY, 'square-buttons', canAfford ? 6 : 7);
                btnBg.setDisplaySize(50, 18);
                btnBg.setDepth(5303);
                btnBg.setMask(scrollMask);
                this.scene.cameras.main.ignore(btnBg);
                this.addElement(btnBg);
                this.contentElements.push(btnBg);
                (btnBg as any).originalY = baseY;

                const btnText = this.scene.add.text(col3X, baseY, 'Change', {
                    fontSize: '7px',
                    fontFamily: 'PixelFont',
                    color: canAfford ? '#FFFFFF' : '#999999',
                    resolution: 2
                });
                btnText.setOrigin(0.5);
                btnText.setDepth(5304);
                btnText.setMask(scrollMask);
                this.scene.cameras.main.ignore(btnText);
                this.addElement(btnText);
                this.contentElements.push(btnText);
                (btnText as any).originalY = baseY;

                if (canAfford) {
                    btnBg.setInteractive({ useHandCursor: true });
                    btnBg.on('pointerover', () => btnBg.setTint(0xaaffaa));
                    btnBg.on('pointerout', () => btnBg.clearTint());
                    btnBg.on('pointerdown', () => {
                        this.showExchangeConfirm(reward, treeCount, mushroomCount, algaeCount);
                    });
                }
            });
        });

        // Scroll handling - wheel
        this.scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, _dy: number, dz: number) => {
            if (this.isOpen) {
                this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + dz * 0.5, 0, this.maxScrollOffset);
                updateScrollPositions();
            }
        });

        // Scroll handling - drag
        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (isDragging && this.isOpen) {
                const deltaY = lastPointerY - pointer.y;
                this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + deltaY, 0, this.maxScrollOffset);
                lastPointerY = pointer.y;
                updateScrollPositions();
            }
        });

        this.scene.input.on('pointerup', () => {
            isDragging = false;
        });
    }

    /**
     * Show confirmation dialog for exchange
     * User needs ALL resources (tree + mushroom + spore) to exchange
     */
    private showExchangeConfirm(reward: ExchangeReward, _treeCount: number, _mushroomCount: number, _sporeCount: number): void {
        // Clear any existing confirm elements
        this.confirmElements.forEach(el => el.destroy());
        this.confirmElements = [];

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 220;
        const modalHeight = 160;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.7);
        overlay.setDepth(5400);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.confirmElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5401);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.confirmElements.push(modalBg);

        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.scene.time.delayedCall(100, () => {
            // Title
            const title = this.scene.add.text(modalX, modalY - 55, `Exchange for ${reward.name}?`, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            title.setOrigin(0.5);
            title.setDepth(5402);
            title.setStroke('#5D4037', 2);
            this.scene.cameras.main.ignore(title);
            this.confirmElements.push(title);

            // Reward icon
            const rewardIcon = this.scene.add.text(modalX, modalY - 25, reward.icon, {
                fontSize: '24px',
                resolution: 2
            });
            rewardIcon.setOrigin(0.5);
            rewardIcon.setDepth(5402);
            this.scene.cameras.main.ignore(rewardIcon);
            this.confirmElements.push(rewardIcon);

            // Total cost label
            const costLabel = this.scene.add.text(modalX, modalY + 5, 'Total Cost:', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#FFF8E1',
                resolution: 2
            });
            costLabel.setOrigin(0.5);
            costLabel.setDepth(5402);
            this.scene.cameras.main.ignore(costLabel);
            this.confirmElements.push(costLabel);

            // Build cost display showing all required resources
            let costParts: string[] = [];
            if (reward.treeCost > 0) {
                costParts.push(`🌳${reward.treeCost}`);
            }
            costParts.push(`🍄${reward.mushroomCost}`);
            costParts.push(`🧬${reward.sporeCost}`);
            const totalCostDisplay = costParts.join(' + ');

            const costText = this.scene.add.text(modalX, modalY + 22, totalCostDisplay, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#fef08a',
                resolution: 2
            });
            costText.setOrigin(0.5);
            costText.setDepth(5402);
            this.scene.cameras.main.ignore(costText);
            this.confirmElements.push(costText);

            // Buttons row
            const btnY = modalY + 52;
            const btnSpacing = 70;

            // Confirm button
            const confirmBtn = this.scene.add.sprite(modalX - btnSpacing / 2, btnY, 'square-buttons', 6);
            confirmBtn.setDisplaySize(60, 24);
            confirmBtn.setDepth(5402);
            confirmBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(confirmBtn);
            this.confirmElements.push(confirmBtn);

            const confirmText = this.scene.add.text(modalX - btnSpacing / 2, btnY, 'Confirm', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            confirmText.setOrigin(0.5);
            confirmText.setDepth(5403);
            confirmText.setStroke('#2d5016', 1);
            this.scene.cameras.main.ignore(confirmText);
            this.confirmElements.push(confirmText);

            confirmBtn.on('pointerdown', () => {
                this.executeExchange(reward);
            });
            confirmBtn.on('pointerover', () => confirmBtn.setTint(0xaaffaa));
            confirmBtn.on('pointerout', () => confirmBtn.clearTint());

            // Cancel button
            const cancelBtn = this.scene.add.sprite(modalX + btnSpacing / 2, btnY, 'square-buttons', 7);
            cancelBtn.setDisplaySize(60, 24);
            cancelBtn.setDepth(5402);
            cancelBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(cancelBtn);
            this.confirmElements.push(cancelBtn);

            const cancelText = this.scene.add.text(modalX + btnSpacing / 2, btnY, 'Cancel', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            cancelText.setOrigin(0.5);
            cancelText.setDepth(5403);
            cancelText.setStroke('#5D4037', 1);
            this.scene.cameras.main.ignore(cancelText);
            this.confirmElements.push(cancelText);

            cancelBtn.on('pointerdown', () => this.closeConfirmModal());
            cancelBtn.on('pointerover', () => cancelBtn.setTint(0xcccccc));
            cancelBtn.on('pointerout', () => cancelBtn.clearTint());
        });

        overlay.on('pointerdown', () => this.closeConfirmModal());
    }

    /**
     * Close only the confirm modal
     */
    private closeConfirmModal(): void {
        this.confirmElements.forEach(el => el.destroy());
        this.confirmElements = [];
    }

    /**
     * Execute the exchange - deducts ALL required resources (tree + mushroom + algae/spore)
     */
    private executeExchange(reward: ExchangeReward): void {
        const chestInventory = this.callbacks.getChestInventory();

        // Helper function to remove items of a specific type from chest
        const removeFromChest = (plantType: PlantType, amount: number): boolean => {
            if (amount === 0) return true; // No cost for this type

            let remaining = amount;
            for (let i = 0; i < chestInventory.length && remaining > 0; i++) {
                const slot = chestInventory[i];
                if (slot && slot.type === plantType && slot.count > 0) {
                    const toRemove = Math.min(slot.count, remaining);
                    slot.count -= toRemove;
                    remaining -= toRemove;

                    if (slot.count <= 0) {
                        chestInventory[i] = { type: plantType, count: 0 };
                    }
                }
            }
            return remaining === 0;
        };

        // Remove ALL required resources
        const treeSuccess = removeFromChest('tree', reward.treeCost);
        const mushroomSuccess = removeFromChest('mushroom', reward.mushroomCost);
        const algaeSuccess = removeFromChest('algae', reward.sporeCost);

        if (treeSuccess && mushroomSuccess && algaeSuccess) {
            this.callbacks.updateToolbar();
            this.closeConfirmModal();
            this.close();

            // Show success animation
            this.playWorkingAnimation();

            // Show success message after animation
            this.scene.time.delayedCall(2000, () => {
                this.callbacks.showToastMessage(`Successfully exchanged for ${reward.name}!`, 0x22c55e);
            });
        } else {
            // This shouldn't happen if canAfford check is correct, but show error just in case
            this.callbacks.showToastMessage('Not enough resources!', 0xef4444);
        }
    }

    /**
     * Close the factory modal
     */
    public close(): void {
        this.isOpen = false;
        this.contentElements = [];
        this.closeConfirmModal();
        this.destroyElements();
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

        this.scene.time.delayedCall(2000, () => {
            this.factoryWorking = false;
            this.factorySprite.setTexture('factory-1');
            workingAnim.destroy();
        });
    }

    public destroy(): void {
        if (this.idleAnimEvent) {
            this.idleAnimEvent.destroy();
        }
        this.contentElements = [];
        this.confirmElements = [];
        super.destroy();
    }
}
