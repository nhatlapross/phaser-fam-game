import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { PlantType, ChestSlot, EXCHANGE_REWARDS, ExchangeReward, CROP_DEFINITIONS } from '../types/GameTypes';
import { GameDataService } from '../GameDataService';

interface FactoryCallbacks {
    getChestInventory: () => ChestSlot[];
    getPlayer: () => Phaser.Physics.Arcade.Sprite;
    closeSeedSelector: () => void;
    closeChestPanel: () => void;
    showToastMessage: (text: string, color: number) => void;
    playSuccessSound: () => void;
    // Note: UI refresh is now handled by GameDataService.refreshAndUpdateUI()
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

        const panelWidth = 420;
        const panelHeight = 380;
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
        const closeBtnBg = this.scene.add.sprite(panelX + panelWidth / 2 - 30, panelY - panelHeight / 2 + 40, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(32, 32);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setAlpha(0);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(panelX + panelWidth / 2 - 30, panelY - panelHeight / 2 + 40, 'X', {
            fontSize: '18px',
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
        const title = this.scene.add.text(panelX, panelY - panelHeight / 2 + 42, 'Phygital Exchange', {
            fontSize: '16px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5301);
        title.setStroke('#5D4037', 3);
        title.setAlpha(0);
        this.scene.cameras.main.ignore(title);
        this.addElement(title);

        this.scene.tweens.add({
            targets: title,
            alpha: 1,
            duration: 200,
            delay: 100
        });

        // Current inventory display - centered
        const treeCount = this.getFruitCountInChest('tree');
        const mushroomCount = this.getFruitCountInChest('mushroom');
        const algaeCount = this.getFruitCountInChest('algae');

        const inventoryY = panelY - panelHeight / 2 + 68;
        const invSpacing = 70; // Space between each fruit group
        const invStartX = panelX - invSpacing; // Center the 3 groups

        // Tree fruit count - use image sprite like chest
        const treeIcon = this.scene.add.image(invStartX - invSpacing, inventoryY, CROP_DEFINITIONS.tree.fruitImage);
        treeIcon.setDisplaySize(24, 24);
        treeIcon.setDepth(5302);
        this.scene.cameras.main.ignore(treeIcon);
        this.addElement(treeIcon);

        const treeText = this.scene.add.text(invStartX - invSpacing + 16, inventoryY, `${treeCount}`, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#2d5016',
            resolution: 2
        });
        treeText.setOrigin(0, 0.5);
        treeText.setDepth(5302);
        treeText.setStroke('#000000', 2);
        this.scene.cameras.main.ignore(treeText);
        this.addElement(treeText);

        // Mushroom count - use image sprite like chest
        const mushIcon = this.scene.add.image(invStartX, inventoryY, CROP_DEFINITIONS.mushroom.fruitImage);
        mushIcon.setDisplaySize(24, 24);
        mushIcon.setDepth(5302);
        this.scene.cameras.main.ignore(mushIcon);
        this.addElement(mushIcon);

        const mushText = this.scene.add.text(invStartX + 16, inventoryY, `${mushroomCount}`, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#92400e',
            resolution: 2
        });
        mushText.setOrigin(0, 0.5);
        mushText.setDepth(5302);
        mushText.setStroke('#000000', 2);
        this.scene.cameras.main.ignore(mushText);
        this.addElement(mushText);

        // Algae/Spore count - use image sprite like chest
        const sporeIcon = this.scene.add.image(invStartX + invSpacing, inventoryY, CROP_DEFINITIONS.algae.fruitImage);
        sporeIcon.setDisplaySize(24, 24);
        sporeIcon.setDepth(5302);
        this.scene.cameras.main.ignore(sporeIcon);
        this.addElement(sporeIcon);

        const sporeText = this.scene.add.text(invStartX + invSpacing + 16, inventoryY, `${algaeCount}`, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#1e40af',
            resolution: 2
        });
        sporeText.setOrigin(0, 0.5);
        sporeText.setDepth(5302);
        sporeText.setStroke('#000000', 2);
        this.scene.cameras.main.ignore(sporeText);
        this.addElement(sporeText);

        // Table header - positioned relative to panel edges
        const tableWidth = panelWidth - 85; // Narrower table width
        const tableOffsetX = 12; // Center the table
        const headerY = panelY - 85; // Increased gap from inventory display (moved up)
        const tableLeftEdge = panelX - tableWidth / 2 + tableOffsetX;
        const tableRightEdge = panelX + tableWidth / 2 + tableOffsetX;
        const col1X = tableLeftEdge + 10;   // Formula column (left edge + padding)
        const col2X = panelX + tableOffsetX + 20; // Result column (center + offset)
        const col3X = tableRightEdge - 22; // Action button (right edge - padding, moved left 2px)

        const headerBg = this.scene.add.rectangle(panelX + tableOffsetX, headerY, tableWidth, 24, 0x5D4037);
        headerBg.setDepth(5301);
        this.scene.cameras.main.ignore(headerBg);
        this.addElement(headerBg);

        const headerFormula = this.scene.add.text(col1X, headerY, 'Formula', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        headerFormula.setOrigin(0, 0.5);
        headerFormula.setDepth(5302);
        this.scene.cameras.main.ignore(headerFormula);
        this.addElement(headerFormula);

        const headerResult = this.scene.add.text(col2X, headerY, 'Result', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        headerResult.setOrigin(0, 0.5);
        headerResult.setDepth(5302);
        this.scene.cameras.main.ignore(headerResult);
        this.addElement(headerResult);

        const headerAction = this.scene.add.text(col3X, headerY, '', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        headerAction.setOrigin(0.5, 0.5);
        headerAction.setDepth(5302);
        this.scene.cameras.main.ignore(headerAction);
        this.addElement(headerAction);

        // Scrollable area - inside the panel (taller to fit modal)
        const scrollAreaTop = headerY + 16;
        const scrollAreaHeight = 220;

        // Create mask for scroll area - use screen coordinates
        const maskGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(panelX - tableWidth / 2 + tableOffsetX, scrollAreaTop, tableWidth, scrollAreaHeight);
        const scrollMask = maskGraphics.createGeometryMask();
        this.addElement(maskGraphics);

        // Reward rows
        const rowHeight = 38;
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
                const rowBg = this.scene.add.rectangle(panelX + tableOffsetX, baseY, tableWidth, rowHeight - 2, index % 2 === 0 ? 0xD4C4A8 : 0xC4B498);
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

                // Column 1: Formula with image icons (e.g., "5 x tree + 7 x mushroom + 14 x algae")
                const iconSize = 18;
                let formulaX = col1X;

                // Tree cost (if > 0)
                if (reward.treeCost > 0) {
                    const treeNumText = this.scene.add.text(formulaX, baseY, `${reward.treeCost}`, {
                        fontSize: '12px',
                        fontFamily: 'PixelFont',
                        color: canAfford ? '#3d2817' : '#888888',
                        resolution: 2
                    });
                    treeNumText.setOrigin(0, 0.5);
                    treeNumText.setDepth(5303);
                    treeNumText.setMask(scrollMask);
                    this.scene.cameras.main.ignore(treeNumText);
                    this.addElement(treeNumText);
                    this.contentElements.push(treeNumText);
                    (treeNumText as any).originalY = baseY;
                    formulaX += treeNumText.width + 2;

                    const treeIconFormula = this.scene.add.image(formulaX + iconSize / 2, baseY, CROP_DEFINITIONS.tree.fruitImage);
                    treeIconFormula.setDisplaySize(iconSize, iconSize);
                    treeIconFormula.setDepth(5303);
                    treeIconFormula.setMask(scrollMask);
                    this.scene.cameras.main.ignore(treeIconFormula);
                    this.addElement(treeIconFormula);
                    this.contentElements.push(treeIconFormula);
                    (treeIconFormula as any).originalY = baseY;
                    formulaX += iconSize + 4;

                    const plusText1 = this.scene.add.text(formulaX, baseY, '+', {
                        fontSize: '12px',
                        fontFamily: 'PixelFont',
                        color: canAfford ? '#3d2817' : '#888888',
                        resolution: 2
                    });
                    plusText1.setOrigin(0, 0.5);
                    plusText1.setDepth(5303);
                    plusText1.setMask(scrollMask);
                    this.scene.cameras.main.ignore(plusText1);
                    this.addElement(plusText1);
                    this.contentElements.push(plusText1);
                    (plusText1 as any).originalY = baseY;
                    formulaX += plusText1.width + 4;
                }

                // Mushroom cost
                const mushNumText = this.scene.add.text(formulaX, baseY, `${reward.mushroomCost}`, {
                    fontSize: '12px',
                    fontFamily: 'PixelFont',
                    color: canAfford ? '#3d2817' : '#888888',
                    resolution: 2
                });
                mushNumText.setOrigin(0, 0.5);
                mushNumText.setDepth(5303);
                mushNumText.setMask(scrollMask);
                this.scene.cameras.main.ignore(mushNumText);
                this.addElement(mushNumText);
                this.contentElements.push(mushNumText);
                (mushNumText as any).originalY = baseY;
                formulaX += mushNumText.width + 2;

                const mushIconFormula = this.scene.add.image(formulaX + iconSize / 2, baseY, CROP_DEFINITIONS.mushroom.fruitImage);
                mushIconFormula.setDisplaySize(iconSize, iconSize);
                mushIconFormula.setDepth(5303);
                mushIconFormula.setMask(scrollMask);
                this.scene.cameras.main.ignore(mushIconFormula);
                this.addElement(mushIconFormula);
                this.contentElements.push(mushIconFormula);
                (mushIconFormula as any).originalY = baseY;
                formulaX += iconSize + 4;

                const plusText2 = this.scene.add.text(formulaX, baseY, '+', {
                    fontSize: '12px',
                    fontFamily: 'PixelFont',
                    color: canAfford ? '#3d2817' : '#888888',
                    resolution: 2
                });
                plusText2.setOrigin(0, 0.5);
                plusText2.setDepth(5303);
                plusText2.setMask(scrollMask);
                this.scene.cameras.main.ignore(plusText2);
                this.addElement(plusText2);
                this.contentElements.push(plusText2);
                (plusText2 as any).originalY = baseY;
                formulaX += plusText2.width + 4;

                // Algae/Spore cost
                const algaeNumText = this.scene.add.text(formulaX, baseY, `${reward.sporeCost}`, {
                    fontSize: '12px',
                    fontFamily: 'PixelFont',
                    color: canAfford ? '#3d2817' : '#888888',
                    resolution: 2
                });
                algaeNumText.setOrigin(0, 0.5);
                algaeNumText.setDepth(5303);
                algaeNumText.setMask(scrollMask);
                this.scene.cameras.main.ignore(algaeNumText);
                this.addElement(algaeNumText);
                this.contentElements.push(algaeNumText);
                (algaeNumText as any).originalY = baseY;
                formulaX += algaeNumText.width + 2;

                const algaeIconFormula = this.scene.add.image(formulaX + iconSize / 2, baseY, CROP_DEFINITIONS.algae.fruitImage);
                algaeIconFormula.setDisplaySize(iconSize, iconSize);
                algaeIconFormula.setDepth(5303);
                algaeIconFormula.setMask(scrollMask);
                this.scene.cameras.main.ignore(algaeIconFormula);
                this.addElement(algaeIconFormula);
                this.contentElements.push(algaeIconFormula);
                (algaeIconFormula as any).originalY = baseY;

                // Column 2: Result (icon + name)
                const resultText = this.scene.add.text(col2X, baseY, `${reward.icon} ${reward.name}`, {
                    fontSize: '12px',
                    fontFamily: 'PixelFont',
                    color: canAfford ? '#3d2817' : '#888888',
                    resolution: 2
                });
                resultText.setOrigin(0, 0.5);
                resultText.setStroke('#00000033', 1);
                resultText.setDepth(5303);
                resultText.setMask(scrollMask);
                this.scene.cameras.main.ignore(resultText);
                this.addElement(resultText);
                this.contentElements.push(resultText);
                (resultText as any).originalY = baseY;

                // Change button
                const btnBg = this.scene.add.sprite(col3X, baseY, 'square-buttons', canAfford ? 6 : 7);
                btnBg.setDisplaySize(65, 26);
                btnBg.setDepth(5303);
                btnBg.setMask(scrollMask);
                this.scene.cameras.main.ignore(btnBg);
                this.addElement(btnBg);
                this.contentElements.push(btnBg);
                (btnBg as any).originalY = baseY;

                const btnText = this.scene.add.text(col3X, baseY, 'Change', {
                    fontSize: '9px',
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
        const modalWidth = 280;
        const modalHeight = 200;

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
            const title = this.scene.add.text(modalX, modalY - 70, `Exchange for ${reward.name}?`, {
                fontSize: '14px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            title.setOrigin(0.5);
            title.setDepth(5402);
            title.setStroke('#5D4037', 3);
            this.scene.cameras.main.ignore(title);
            this.confirmElements.push(title);

            // Reward icon
            const rewardIcon = this.scene.add.text(modalX, modalY - 30, reward.icon, {
                fontSize: '32px',
                resolution: 2
            });
            rewardIcon.setOrigin(0.5);
            rewardIcon.setDepth(5402);
            this.scene.cameras.main.ignore(rewardIcon);
            this.confirmElements.push(rewardIcon);

            // Total cost label
            const costLabel = this.scene.add.text(modalX, modalY + 10, 'Total Cost:', {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#FFF8E1',
                resolution: 2
            });
            costLabel.setOrigin(0.5);
            costLabel.setDepth(5402);
            this.scene.cameras.main.ignore(costLabel);
            this.confirmElements.push(costLabel);

            // Build cost display with image icons
            const costIconSize = 18;
            let costDisplayX = modalX - 80;
            const costY = modalY + 32;

            // Tree cost (if > 0)
            if (reward.treeCost > 0) {
                const treeCostNum = this.scene.add.text(costDisplayX, costY, `${reward.treeCost}`, {
                    fontSize: '12px',
                    fontFamily: 'PixelFont',
                    color: '#fef08a',
                    resolution: 2
                });
                treeCostNum.setOrigin(0, 0.5);
                treeCostNum.setDepth(5402);
                this.scene.cameras.main.ignore(treeCostNum);
                this.confirmElements.push(treeCostNum);
                costDisplayX += treeCostNum.width + 2;

                const treeCostIcon = this.scene.add.image(costDisplayX + costIconSize / 2, costY, CROP_DEFINITIONS.tree.fruitImage);
                treeCostIcon.setDisplaySize(costIconSize, costIconSize);
                treeCostIcon.setDepth(5402);
                this.scene.cameras.main.ignore(treeCostIcon);
                this.confirmElements.push(treeCostIcon);
                costDisplayX += costIconSize + 4;

                const plusText1 = this.scene.add.text(costDisplayX, costY, '+', {
                    fontSize: '12px',
                    fontFamily: 'PixelFont',
                    color: '#fef08a',
                    resolution: 2
                });
                plusText1.setOrigin(0, 0.5);
                plusText1.setDepth(5402);
                this.scene.cameras.main.ignore(plusText1);
                this.confirmElements.push(plusText1);
                costDisplayX += plusText1.width + 4;
            }

            // Mushroom cost
            const mushCostNum = this.scene.add.text(costDisplayX, costY, `${reward.mushroomCost}`, {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#fef08a',
                resolution: 2
            });
            mushCostNum.setOrigin(0, 0.5);
            mushCostNum.setDepth(5402);
            this.scene.cameras.main.ignore(mushCostNum);
            this.confirmElements.push(mushCostNum);
            costDisplayX += mushCostNum.width + 2;

            const mushCostIcon = this.scene.add.image(costDisplayX + costIconSize / 2, costY, CROP_DEFINITIONS.mushroom.fruitImage);
            mushCostIcon.setDisplaySize(costIconSize, costIconSize);
            mushCostIcon.setDepth(5402);
            this.scene.cameras.main.ignore(mushCostIcon);
            this.confirmElements.push(mushCostIcon);
            costDisplayX += costIconSize + 4;

            const plusText2 = this.scene.add.text(costDisplayX, costY, '+', {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#fef08a',
                resolution: 2
            });
            plusText2.setOrigin(0, 0.5);
            plusText2.setDepth(5402);
            this.scene.cameras.main.ignore(plusText2);
            this.confirmElements.push(plusText2);
            costDisplayX += plusText2.width + 4;

            // Algae cost
            const algaeCostNum = this.scene.add.text(costDisplayX, costY, `${reward.sporeCost}`, {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#fef08a',
                resolution: 2
            });
            algaeCostNum.setOrigin(0, 0.5);
            algaeCostNum.setDepth(5402);
            this.scene.cameras.main.ignore(algaeCostNum);
            this.confirmElements.push(algaeCostNum);
            costDisplayX += algaeCostNum.width + 2;

            const algaeCostIcon = this.scene.add.image(costDisplayX + costIconSize / 2, costY, CROP_DEFINITIONS.algae.fruitImage);
            algaeCostIcon.setDisplaySize(costIconSize, costIconSize);
            algaeCostIcon.setDepth(5402);
            this.scene.cameras.main.ignore(algaeCostIcon);
            this.confirmElements.push(algaeCostIcon);

            // Buttons row
            const btnY = modalY + 70;
            const btnSpacing = 90;

            // Confirm button
            const confirmBtn = this.scene.add.sprite(modalX - btnSpacing / 2, btnY, 'square-buttons', 6);
            confirmBtn.setDisplaySize(75, 30);
            confirmBtn.setDepth(5402);
            confirmBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(confirmBtn);
            this.confirmElements.push(confirmBtn);

            const confirmText = this.scene.add.text(modalX - btnSpacing / 2, btnY, 'Confirm', {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            confirmText.setOrigin(0.5);
            confirmText.setDepth(5403);
            confirmText.setStroke('#2d5016', 2);
            this.scene.cameras.main.ignore(confirmText);
            this.confirmElements.push(confirmText);

            confirmBtn.on('pointerdown', () => {
                this.executeExchange(reward);
            });
            confirmBtn.on('pointerover', () => confirmBtn.setTint(0xaaffaa));
            confirmBtn.on('pointerout', () => confirmBtn.clearTint());

            // Cancel button
            const cancelBtn = this.scene.add.sprite(modalX + btnSpacing / 2, btnY, 'square-buttons', 7);
            cancelBtn.setDisplaySize(75, 30);
            cancelBtn.setDepth(5402);
            cancelBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(cancelBtn);
            this.confirmElements.push(cancelBtn);

            const cancelText = this.scene.add.text(modalX + btnSpacing / 2, btnY, 'Cancel', {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            cancelText.setOrigin(0.5);
            cancelText.setDepth(5403);
            cancelText.setStroke('#5D4037', 2);
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
            // Refresh all data and UI via GameDataService
            GameDataService.refreshAndUpdateUI();
            this.closeConfirmModal();
            this.close();

            // Play success sound
            this.callbacks.playSuccessSound();

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
