import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import {
    PlantType,
    FertilizerType,
    ToolbarItem,
    ChestSlot,
    PLANT_TYPES,
    FERTILIZER_TYPES,
    CROP_DEFINITIONS,
    GAME_CONSTANTS
} from '../types/GameTypes';

// Toolbar Manager Callbacks
export interface ToolbarManagerCallbacks {
    // Getters
    getToolbarItems: () => ToolbarItem[];
    getSeedCounts: () => Record<PlantType, number>;
    getFertilizerCounts: () => Record<FertilizerType, number>;
    getChestInventory: () => ChestSlot[];
    getSelectedToolIndex: () => number;
    getSelectedSeedIndex: () => number;
    getSelectedFertilizerIndex: () => number;
    getChestOpen: () => boolean;

    // Setters
    setSelectedToolIndex: (index: number) => void;
    setSelectedSeedIndex: (index: number) => void;
    setSelectedFertilizerIndex: (index: number) => void;
    setChestOpen: (open: boolean) => void;

    // Actions
    onSeedOptionClicked: () => void;
}

export class ToolbarManager extends BaseManager {
    private callbacks: ToolbarManagerCallbacks;

    // UI element arrays
    private toolbarElements: Phaser.GameObjects.GameObject[] = [];
    private toolbarSlots: Phaser.GameObjects.Sprite[] = [];
    private seedSelectorElements: Phaser.GameObjects.GameObject[] = [];
    private fertilizerSelectorElements: Phaser.GameObjects.GameObject[] = [];
    private chestPanelElements: Phaser.GameObjects.GameObject[] = [];

    // State
    private seedSelectorOpen: boolean = false;
    private fertilizerSelectorOpen: boolean = false;

    // Constants
    private readonly SLOT_SIZE = 48;
    private readonly SLOT_SPACING = 8;

    constructor(scene: Phaser.Scene, callbacks: ToolbarManagerCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    // ========== Public Methods ==========

    public createToolbar(): void {
        const { SLOT_SIZE, SLOT_SPACING } = this;
        const toolbarItems = this.callbacks.getToolbarItems();
        const numSlots = toolbarItems.length;
        const totalWidth = (SLOT_SIZE + SLOT_SPACING) * numSlots - SLOT_SPACING;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        const startX = (screenWidth - totalWidth) / 2;
        const startY = screenHeight - SLOT_SIZE - 20;

        // Clear previous elements
        this.toolbarElements.forEach(el => el.destroy());
        this.toolbarElements = [];
        this.toolbarSlots = [];

        // Toolbar background
        const toolbarBg = this.scene.add.rectangle(
            screenWidth / 2,
            startY + SLOT_SIZE / 2,
            totalWidth + 24,
            SLOT_SIZE + 20,
            0x5D4037,
            0.95
        );
        toolbarBg.setStrokeStyle(3, 0x3E2723);
        toolbarBg.setDepth(5000);
        this.scene.cameras.main.ignore(toolbarBg);
        this.toolbarElements.push(toolbarBg);

        const selectedToolIndex = this.callbacks.getSelectedToolIndex();

        // Create slots
        for (let i = 0; i < numSlots; i++) {
            const slotX = startX + i * (SLOT_SIZE + SLOT_SPACING) + SLOT_SIZE / 2;
            const slotY = startY + SLOT_SIZE / 2;

            // Slot background
            const bg = this.scene.add.sprite(slotX, slotY, 'square-buttons', 6);
            bg.setDisplaySize(SLOT_SIZE, SLOT_SIZE);
            bg.setDepth(5001);
            this.scene.cameras.main.ignore(bg);
            this.toolbarElements.push(bg);
            this.toolbarSlots.push(bg);

            // Selection highlight
            if (i === selectedToolIndex) {
                const highlight = this.scene.add.rectangle(slotX, slotY, SLOT_SIZE + 6, SLOT_SIZE + 6);
                highlight.setStrokeStyle(3, 0xFFD700);
                highlight.setFillStyle(0, 0);
                highlight.setDepth(5002);
                this.scene.cameras.main.ignore(highlight);
                this.toolbarElements.push(highlight);
            }

            const item = toolbarItems[i];
            this.renderSlotContent(item, slotX, slotY, i);

            // Make slot interactive
            bg.setInteractive();
            bg.on('pointerdown', () => {
                if (item.type === 'seed') {
                    this.toggleSeedSelector();
                    this.closeChestPanel();
                    this.closeFertilizerSelector();
                } else if (item.name === 'fertilizer') {
                    this.toggleFertilizerSelector();
                    this.closeSeedSelector();
                    this.closeChestPanel();
                } else if (item.name === 'chest') {
                    this.toggleChestPanel();
                    this.closeSeedSelector();
                    this.closeFertilizerSelector();
                } else {
                    this.closeSeedSelector();
                    this.closeFertilizerSelector();
                    this.closeChestPanel();
                }
                this.selectToolbarSlot(i);
            });
        }
    }

    public updateToolbar(): void {
        this.createToolbar();
    }

    public getSelectedPlantType(): PlantType {
        return PLANT_TYPES[this.callbacks.getSelectedSeedIndex()];
    }

    public getSelectedFertilizerType(): FertilizerType {
        return FERTILIZER_TYPES[this.callbacks.getSelectedFertilizerIndex()];
    }

    public closeSeedSelector(): void {
        this.seedSelectorOpen = false;
        this.seedSelectorElements.forEach(el => el.destroy());
        this.seedSelectorElements = [];
    }

    public closeFertilizerSelector(): void {
        this.fertilizerSelectorOpen = false;
        this.fertilizerSelectorElements.forEach(el => el.destroy());
        this.fertilizerSelectorElements = [];
    }

    public closeChestPanel(): void {
        this.callbacks.setChestOpen(false);
        this.chestPanelElements.forEach(el => el.destroy());
        this.chestPanelElements = [];
        this.updateToolbar();
    }

    public closeAllSelectors(): void {
        this.closeSeedSelector();
        this.closeFertilizerSelector();
        this.closeChestPanel();
    }

    public getToolbarElements(): Phaser.GameObjects.GameObject[] {
        return this.toolbarElements;
    }

    public getSeedSelectorElements(): Phaser.GameObjects.GameObject[] {
        return this.seedSelectorElements;
    }

    public getFertilizerSelectorElements(): Phaser.GameObjects.GameObject[] {
        return this.fertilizerSelectorElements;
    }

    public getChestPanelElements(): Phaser.GameObjects.GameObject[] {
        return this.chestPanelElements;
    }

    public isSeedSelectorOpen(): boolean {
        return this.seedSelectorOpen;
    }

    public isFertilizerSelectorOpen(): boolean {
        return this.fertilizerSelectorOpen;
    }

    // ========== Private Methods ==========

    private renderSlotContent(item: ToolbarItem, slotX: number, slotY: number, _index: number): void {
        const { SLOT_SIZE } = this;

        if (item.type === 'seed') {
            this.renderSeedSlot(slotX, slotY);
        } else if (item.name === 'chest') {
            this.renderChestSlot(slotX, slotY);
        } else if (item.name === 'fertilizer') {
            this.renderFertilizerSlot(slotX, slotY);
        } else {
            this.renderToolSlot(item, slotX, slotY);
        }
    }

    private renderSeedSlot(slotX: number, slotY: number): void {
        const { SLOT_SIZE } = this;
        const selectedSeedIndex = this.callbacks.getSelectedSeedIndex();
        const selectedSeedType = PLANT_TYPES[selectedSeedIndex];
        const cropDef = CROP_DEFINITIONS[selectedSeedType];
        const seedCounts = this.callbacks.getSeedCounts();

        // Seed icon
        const icon = this.scene.add.image(slotX, slotY, cropDef.seedImage);
        icon.setDisplaySize(SLOT_SIZE - 8, SLOT_SIZE - 8);
        icon.setDepth(5003);
        this.scene.cameras.main.ignore(icon);
        this.toolbarElements.push(icon);

        // Small indicator arrow
        const arrow = this.scene.add.text(slotX + SLOT_SIZE / 2 - 6, slotY - SLOT_SIZE / 2 + 4, '▼', {
            fontSize: '10px',
            color: '#FFD700'
        });
        arrow.setDepth(5004);
        this.scene.cameras.main.ignore(arrow);
        this.toolbarElements.push(arrow);

        // Count display
        const currentSeedCount = seedCounts[selectedSeedType];
        const countText = this.scene.add.text(
            slotX + SLOT_SIZE / 2 - 4,
            slotY + SLOT_SIZE / 2 - 4,
            currentSeedCount.toString(),
            {
                fontSize: '14px',
                color: currentSeedCount > 0 ? '#ffffff' : '#ff6666',
                backgroundColor: '#000000cc',
                padding: { x: 4, y: 2 }
            }
        );
        countText.setOrigin(1, 1);
        countText.setDepth(5004);
        this.scene.cameras.main.ignore(countText);
        this.toolbarElements.push(countText);
    }

    private renderChestSlot(slotX: number, slotY: number): void {
        const { SLOT_SIZE } = this;
        const chestOpen = this.callbacks.getChestOpen();

        // Chest icon
        const chestFrame = chestOpen ? 4 : 0;
        const icon = this.scene.add.sprite(slotX, slotY, 'chest', chestFrame);
        icon.setDisplaySize(SLOT_SIZE + 50, SLOT_SIZE + 50);
        icon.setDepth(5003);
        this.scene.cameras.main.ignore(icon);
        this.toolbarElements.push(icon);

        // Show total items in chest
        const totalItems = this.getTotalChestItems();
        if (totalItems > 0) {
            const countText = this.scene.add.text(
                slotX + SLOT_SIZE / 2 - 4,
                slotY + SLOT_SIZE / 2 - 4,
                totalItems.toString(),
                {
                    fontSize: '14px',
                    color: '#ffffff',
                    backgroundColor: '#000000cc',
                    padding: { x: 4, y: 2 }
                }
            );
            countText.setOrigin(1, 1);
            countText.setDepth(5004);
            this.scene.cameras.main.ignore(countText);
            this.toolbarElements.push(countText);
        }
    }

    private renderFertilizerSlot(slotX: number, slotY: number): void {
        const { SLOT_SIZE } = this;
        const selectedFertilizerIndex = this.callbacks.getSelectedFertilizerIndex();
        const selectedFertilizerType = FERTILIZER_TYPES[selectedFertilizerIndex];
        const fertilizerCounts = this.callbacks.getFertilizerCounts();

        // Fertilizer icon
        const icon = this.scene.add.sprite(slotX, slotY, 'icon-fertilizer');
        icon.setDisplaySize(SLOT_SIZE - 12, SLOT_SIZE - 12);
        icon.setDepth(5003);
        this.scene.cameras.main.ignore(icon);
        this.toolbarElements.push(icon);

        // Small indicator arrow
        const arrow = this.scene.add.text(slotX + SLOT_SIZE / 2 - 6, slotY - SLOT_SIZE / 2 + 4, '▼', {
            fontSize: '10px',
            color: '#FFD700'
        });
        arrow.setDepth(5004);
        this.scene.cameras.main.ignore(arrow);
        this.toolbarElements.push(arrow);

        // Count display
        const currentFertilizerCount = fertilizerCounts[selectedFertilizerType];
        const countText = this.scene.add.text(
            slotX + SLOT_SIZE / 2 - 4,
            slotY + SLOT_SIZE / 2 - 4,
            currentFertilizerCount.toString(),
            {
                fontSize: '14px',
                color: currentFertilizerCount > 0 ? '#ffffff' : '#ff6666',
                backgroundColor: '#000000cc',
                padding: { x: 4, y: 2 }
            }
        );
        countText.setOrigin(1, 1);
        countText.setDepth(5004);
        this.scene.cameras.main.ignore(countText);
        this.toolbarElements.push(countText);
    }

    private renderToolSlot(item: ToolbarItem, slotX: number, slotY: number): void {
        const { SLOT_SIZE } = this;

        let iconKey = '';
        if (item.name === 'wateringCan') iconKey = 'icon-watercan';
        else if (item.name === 'hand') iconKey = 'icon-hand';
        else if (item.name === 'digest') iconKey = 'icon-digest';

        if (iconKey) {
            const icon = this.scene.add.sprite(slotX, slotY, iconKey);
            icon.setDisplaySize(SLOT_SIZE - 12, SLOT_SIZE - 12);
            icon.setDepth(5003);
            this.scene.cameras.main.ignore(icon);
            this.toolbarElements.push(icon);

            // Count display
            if (item.count !== undefined && item.count >= 0) {
                const countText = this.scene.add.text(
                    slotX + SLOT_SIZE / 2 - 4,
                    slotY + SLOT_SIZE / 2 - 4,
                    item.count.toString(),
                    {
                        fontSize: '14px',
                        color: '#ffffff',
                        backgroundColor: '#000000cc',
                        padding: { x: 4, y: 2 }
                    }
                );
                countText.setOrigin(1, 1);
                countText.setDepth(5004);
                this.scene.cameras.main.ignore(countText);
                this.toolbarElements.push(countText);
            }
        }
    }

    private toggleSeedSelector(): void {
        if (this.seedSelectorOpen) {
            this.closeSeedSelector();
        } else {
            this.openSeedSelector();
        }
    }

    private openSeedSelector(): void {
        this.closeSeedSelector();
        this.seedSelectorOpen = true;

        const { SLOT_SIZE, SLOT_SPACING } = this;
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const toolbarItems = this.callbacks.getToolbarItems();
        const numSlots = toolbarItems.length;
        const totalWidth = (SLOT_SIZE + SLOT_SPACING) * numSlots - SLOT_SPACING;
        const startX = (screenWidth - totalWidth) / 2;
        const startY = screenHeight - SLOT_SIZE - 20;

        const seedSlotIndex = toolbarItems.findIndex(item => item.type === 'seed');
        const seedSlotX = startX + seedSlotIndex * (SLOT_SIZE + SLOT_SPACING) + SLOT_SIZE / 2;
        const selectorY = startY - 10;

        const selectedSeedIndex = this.callbacks.getSelectedSeedIndex();
        const seedCounts = this.callbacks.getSeedCounts();

        // Selector background
        const selectorBg = this.scene.add.rectangle(
            seedSlotX,
            selectorY - (PLANT_TYPES.length * (SLOT_SIZE + 4)) / 2,
            SLOT_SIZE + 16,
            PLANT_TYPES.length * (SLOT_SIZE + 4) + 8,
            0x5D4037,
            0.95
        );
        selectorBg.setStrokeStyle(2, 0x3E2723);
        selectorBg.setDepth(5100);
        this.scene.cameras.main.ignore(selectorBg);
        this.seedSelectorElements.push(selectorBg);

        // Create seed options
        PLANT_TYPES.forEach((plantType, index) => {
            const cropDef = CROP_DEFINITIONS[plantType];
            const optionY = selectorY - (SLOT_SIZE + 4) * (index + 1);

            // Option background
            const optionBg = this.scene.add.sprite(seedSlotX, optionY, 'square-buttons',
                index === selectedSeedIndex ? 4 : 6);
            optionBg.setDisplaySize(SLOT_SIZE, SLOT_SIZE);
            optionBg.setDepth(5101);
            optionBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(optionBg);
            this.seedSelectorElements.push(optionBg);

            // Seed icon
            const icon = this.scene.add.image(seedSlotX, optionY, cropDef.seedImage);
            icon.setDisplaySize(SLOT_SIZE - 8, SLOT_SIZE - 8);
            icon.setDepth(5102);
            this.scene.cameras.main.ignore(icon);
            this.seedSelectorElements.push(icon);

            // Seed count
            const seedCount = seedCounts[plantType];
            const countText = this.scene.add.text(
                seedSlotX + SLOT_SIZE / 2 - 4,
                optionY + SLOT_SIZE / 2 - 4,
                seedCount.toString(),
                {
                    fontSize: '12px',
                    color: seedCount > 0 ? '#ffffff' : '#ff6666',
                    backgroundColor: '#000000cc',
                    padding: { x: 3, y: 1 }
                }
            );
            countText.setOrigin(1, 1);
            countText.setDepth(5103);
            this.scene.cameras.main.ignore(countText);
            this.seedSelectorElements.push(countText);

            // Click handler
            optionBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                event.stopPropagation();
                this.callbacks.onSeedOptionClicked();
                this.callbacks.setSelectedSeedIndex(index);
                this.closeSeedSelector();
                this.updateToolbar();
            });

            optionBg.on('pointerover', () => {
                optionBg.setFrame(4);
            });
            optionBg.on('pointerout', () => {
                optionBg.setFrame(index === selectedSeedIndex ? 4 : 6);
            });
        });
    }

    private toggleFertilizerSelector(): void {
        if (this.fertilizerSelectorOpen) {
            this.closeFertilizerSelector();
        } else {
            this.openFertilizerSelector();
        }
    }

    private openFertilizerSelector(): void {
        this.closeFertilizerSelector();
        this.fertilizerSelectorOpen = true;

        const { SLOT_SIZE, SLOT_SPACING } = this;
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const toolbarItems = this.callbacks.getToolbarItems();
        const numSlots = toolbarItems.length;
        const totalWidth = (SLOT_SIZE + SLOT_SPACING) * numSlots - SLOT_SPACING;
        const startX = (screenWidth - totalWidth) / 2;
        const startY = screenHeight - SLOT_SIZE - 20;

        const fertilizerSlotIndex = toolbarItems.findIndex(item => item.name === 'fertilizer');
        const fertilizerSlotX = startX + fertilizerSlotIndex * (SLOT_SIZE + SLOT_SPACING) + SLOT_SIZE / 2;
        const selectorY = startY - 10;

        const selectedFertilizerIndex = this.callbacks.getSelectedFertilizerIndex();
        const fertilizerCounts = this.callbacks.getFertilizerCounts();
        const fertilizerColors = { common: 0x888888, rare: 0x4488ff, epic: 0xaa44ff, legendary: 0xffaa00 };

        // Selector background
        const selectorBg = this.scene.add.rectangle(
            fertilizerSlotX,
            selectorY - (FERTILIZER_TYPES.length * (SLOT_SIZE + 4)) / 2,
            SLOT_SIZE + 16,
            FERTILIZER_TYPES.length * (SLOT_SIZE + 4) + 8,
            0x5D4037,
            0.95
        );
        selectorBg.setStrokeStyle(2, 0x3E2723);
        selectorBg.setDepth(5100);
        this.scene.cameras.main.ignore(selectorBg);
        this.fertilizerSelectorElements.push(selectorBg);

        // Create fertilizer options
        FERTILIZER_TYPES.forEach((fertilizerType, index) => {
            const optionY = selectorY - (SLOT_SIZE + 4) * (index + 1);

            // Option background
            const optionBg = this.scene.add.sprite(fertilizerSlotX, optionY, 'square-buttons',
                index === selectedFertilizerIndex ? 4 : 6);
            optionBg.setDisplaySize(SLOT_SIZE, SLOT_SIZE);
            optionBg.setDepth(5101);
            optionBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(optionBg);
            this.fertilizerSelectorElements.push(optionBg);

            // Fertilizer icon with color tint
            const icon = this.scene.add.sprite(fertilizerSlotX, optionY, 'icon-fertilizer');
            icon.setDisplaySize(SLOT_SIZE - 8, SLOT_SIZE - 8);
            icon.setTint(fertilizerColors[fertilizerType]);
            icon.setDepth(5102);
            this.scene.cameras.main.ignore(icon);
            this.fertilizerSelectorElements.push(icon);

            // Fertilizer count
            const fertilizerCount = fertilizerCounts[fertilizerType];
            const countText = this.scene.add.text(
                fertilizerSlotX + SLOT_SIZE / 2 - 4,
                optionY + SLOT_SIZE / 2 - 4,
                fertilizerCount.toString(),
                {
                    fontSize: '12px',
                    color: fertilizerCount > 0 ? '#ffffff' : '#ff6666',
                    backgroundColor: '#000000cc',
                    padding: { x: 3, y: 1 }
                }
            );
            countText.setOrigin(1, 1);
            countText.setDepth(5103);
            this.scene.cameras.main.ignore(countText);
            this.fertilizerSelectorElements.push(countText);

            // Click handler
            optionBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                event.stopPropagation();
                this.callbacks.setSelectedFertilizerIndex(index);
                this.closeFertilizerSelector();
                this.updateToolbar();
            });

            optionBg.on('pointerover', () => {
                optionBg.setFrame(4);
            });
            optionBg.on('pointerout', () => {
                optionBg.setFrame(index === selectedFertilizerIndex ? 4 : 6);
            });
        });
    }

    private toggleChestPanel(): void {
        if (this.callbacks.getChestOpen()) {
            this.closeChestPanel();
        } else {
            this.openChestPanel();
        }
    }

    private openChestPanel(): void {
        this.closeChestPanel();
        this.callbacks.setChestOpen(true);
        this.updateToolbar();

        const { SLOT_SIZE, SLOT_SPACING } = this;
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        // Get chest slot position for animation origin
        const toolbarItems = this.callbacks.getToolbarItems();
        const numSlots = toolbarItems.length;
        const totalToolbarWidth = (SLOT_SIZE + SLOT_SPACING) * numSlots - SLOT_SPACING;
        const toolbarStartX = (screenWidth - totalToolbarWidth) / 2;
        const chestSlotIndex = toolbarItems.findIndex(item => item.name === 'chest');
        const chestSlotX = toolbarStartX + chestSlotIndex * (SLOT_SIZE + SLOT_SPACING) + SLOT_SIZE / 2;
        const chestSlotY = screenHeight - SLOT_SIZE - 20 + SLOT_SIZE / 2;

        // Panel dimensions
        const panelWidth = 190;
        const panelHeight = 250;
        const panelX = screenWidth / 2;
        const panelY = screenHeight / 2 - 30;

        // Background panel
        const panelBg = this.scene.add.sprite(panelX, panelY, 'settings-panel', 1);
        panelBg.setDisplaySize(panelWidth, panelHeight);
        panelBg.setDepth(5200);
        panelBg.setInteractive();
        panelBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(panelBg);
        this.chestPanelElements.push(panelBg);

        // Animation: scale from chest position
        panelBg.setScale(0);
        panelBg.setPosition(chestSlotX, chestSlotY);
        this.scene.tweens.add({
            targets: panelBg,
            x: panelX,
            y: panelY,
            scaleX: panelWidth / 125,
            scaleY: panelHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Grid layout: 3 columns x 4 rows = 12 slots
        const gridSlotSize = 44;
        const gridSlotSpacing = 6;
        const gridWidth = 3 * gridSlotSize + 2 * gridSlotSpacing;
        const gridHeight = 4 * gridSlotSize + 3 * gridSlotSpacing;
        const gridStartX = panelX - gridWidth / 2 + gridSlotSize / 2;
        const gridStartY = panelY - gridHeight / 2 + gridSlotSize / 2;

        const chestInventory = this.callbacks.getChestInventory();

        // Delay grid elements to appear after panel animation
        this.scene.time.delayedCall(150, () => {
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 3; col++) {
                    const slotIndex = row * 3 + col;
                    const slotX = gridStartX + col * (gridSlotSize + gridSlotSpacing);
                    const slotY = gridStartY + row * (gridSlotSize + gridSlotSpacing);

                    // Slot background
                    const slotBg = this.scene.add.sprite(slotX, slotY, 'square-buttons', 6);
                    slotBg.setDisplaySize(gridSlotSize, gridSlotSize);
                    slotBg.setDepth(5203);
                    slotBg.setAlpha(0);
                    this.scene.cameras.main.ignore(slotBg);
                    this.chestPanelElements.push(slotBg);

                    // Fade in animation
                    this.scene.tweens.add({
                        targets: slotBg,
                        alpha: 1,
                        duration: 100,
                        delay: slotIndex * 20
                    });

                    // Check if this slot has items
                    const slotData = chestInventory[slotIndex];
                    if (slotData && slotData.count > 0) {
                        const cropDef = CROP_DEFINITIONS[slotData.type];
                        const fruitIcon = this.scene.add.image(slotX, slotY, cropDef.fruitImage);
                        fruitIcon.setDisplaySize(gridSlotSize - 10, gridSlotSize - 10);
                        fruitIcon.setDepth(5204);
                        fruitIcon.setAlpha(0);
                        this.scene.cameras.main.ignore(fruitIcon);
                        this.chestPanelElements.push(fruitIcon);

                        this.scene.tweens.add({
                            targets: fruitIcon,
                            alpha: 1,
                            duration: 100,
                            delay: slotIndex * 20
                        });

                        // Show count
                        const countText = this.scene.add.text(
                            slotX + gridSlotSize / 2 - 4,
                            slotY + gridSlotSize / 2 - 4,
                            slotData.count.toString(),
                            {
                                fontSize: '12px',
                                color: '#ffffff',
                                backgroundColor: '#000000cc',
                                padding: { x: 3, y: 1 }
                            }
                        );
                        countText.setOrigin(1, 1);
                        countText.setDepth(5205);
                        countText.setAlpha(0);
                        this.scene.cameras.main.ignore(countText);
                        this.chestPanelElements.push(countText);

                        this.scene.tweens.add({
                            targets: countText,
                            alpha: 1,
                            duration: 100,
                            delay: slotIndex * 20
                        });
                    }
                }
            }

            // Capacity indicator at bottom
            const totalItems = this.getTotalChestItems();
            const maxCapacity = GAME_CONSTANTS.CHEST_SLOTS * GAME_CONSTANTS.MAX_PER_SLOT;
            const capacityText = this.scene.add.text(
                panelX,
                panelY + panelHeight / 2 - 23,
                `${totalItems} / ${maxCapacity}`,
                {
                    fontSize: '11px',
                    color: totalItems >= maxCapacity ? '#ff0000' : '#5D4037'
                }
            );
            capacityText.setOrigin(0.5);
            capacityText.setDepth(5201);
            capacityText.setAlpha(0);
            this.scene.cameras.main.ignore(capacityText);
            this.chestPanelElements.push(capacityText);

            this.scene.tweens.add({
                targets: capacityText,
                alpha: 1,
                duration: 150
            });
        });
    }

    private getTotalChestItems(): number {
        const chestInventory = this.callbacks.getChestInventory();
        return chestInventory.reduce((total, slot) => total + (slot?.count || 0), 0);
    }

    private selectToolbarSlot(index: number): void {
        const toolbarItems = this.callbacks.getToolbarItems();
        if (index < 0 || index >= toolbarItems.length) return;
        this.callbacks.setSelectedToolIndex(index);
        this.updateToolbar();
    }

    // ========== Cleanup ==========

    public destroy(): void {
        this.toolbarElements.forEach(el => el.destroy());
        this.toolbarElements = [];
        this.toolbarSlots = [];
        this.seedSelectorElements.forEach(el => el.destroy());
        this.seedSelectorElements = [];
        this.fertilizerSelectorElements.forEach(el => el.destroy());
        this.fertilizerSelectorElements = [];
        this.chestPanelElements.forEach(el => el.destroy());
        this.chestPanelElements = [];
        super.destroy();
    }
}
