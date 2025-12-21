import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import {
    PlantType,
    FertilizerType,
    ToolbarItem,
    ChestSlot,
    PLANT_TYPES,
    FERTILIZER_TYPES,
    CROP_DEFINITIONS
} from '../types/GameTypes';
import { GameDataService } from '../GameDataService';
import { InventoryService, InventoryItem } from '../InventoryService';

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
    showToastMessage: (text: string, color: number) => void;
    playSuccessSound: () => void;
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
    private selectedChestItemIndex: number = -1;
    private chestSlotBgs: Phaser.GameObjects.Rectangle[] = [];

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
        this.selectedChestItemIndex = -1;
        this.chestSlotBgs = [];

        const screenWidth = this.scene.scale.width;

        // Panel positioned on right side, below profile card area
        // 2x3 grid = 6 slots
        const gridSlotSize = 40;
        const gridSlotSpacing = 5;
        const gridCols = 2;
        const gridRows = 3;
        const panelPadding = 8;

        const gridWidth = gridCols * gridSlotSize + (gridCols - 1) * gridSlotSpacing;
        const gridHeight = gridRows * gridSlotSize + (gridRows - 1) * gridSlotSpacing;
        const panelWidth = gridWidth + panelPadding * 2;
        const panelHeight = gridHeight + panelPadding * 2 + 60; // Extra space for capacity + button

        // Position on right side, below profile card
        const panelX = screenWidth - panelWidth / 2 - 10;
        const panelY = 218; // Moved down to not cover profile card

        // Background panel
        const panelBg = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x5D4037);
        panelBg.setStrokeStyle(2, 0x3E2723);
        panelBg.setDepth(5200);
        panelBg.setAlpha(0);
        this.scene.cameras.main.ignore(panelBg);
        this.chestPanelElements.push(panelBg);

        // Fade in animation
        this.scene.tweens.add({
            targets: panelBg,
            alpha: 0.95,
            duration: 150,
            ease: 'Quad.easeOut'
        });

        // Grid starting position
        const gridStartX = panelX - gridWidth / 2 + gridSlotSize / 2;
        const gridStartY = panelY - gridHeight / 2 + gridSlotSize / 2 - 10;

        // Use backpack data from cached inventory (new system)
        const cachedData = GameDataService.getCachedData();
        const backpackItems: InventoryItem[] = cachedData?.inventory?.backpack?.backpack ?? [];

        // Create 2x3 grid (6 slots)
        this.scene.time.delayedCall(50, () => {
            for (let row = 0; row < gridRows; row++) {
                for (let col = 0; col < gridCols; col++) {
                    const slotIndex = row * gridCols + col;
                    const slotX = gridStartX + col * (gridSlotSize + gridSlotSpacing);
                    const slotY = gridStartY + row * (gridSlotSize + gridSlotSpacing);

                    // Slot background
                    const slotBg = this.scene.add.rectangle(slotX, slotY, gridSlotSize, gridSlotSize, 0xD4C4A8);
                    slotBg.setStrokeStyle(2, 0x8B7355);
                    slotBg.setDepth(5203);
                    slotBg.setAlpha(0);
                    slotBg.setInteractive({ useHandCursor: true });
                    this.scene.cameras.main.ignore(slotBg);
                    this.chestPanelElements.push(slotBg);
                    this.chestSlotBgs.push(slotBg);

                    // Fade in animation
                    this.scene.tweens.add({
                        targets: slotBg,
                        alpha: 1,
                        duration: 80,
                        delay: slotIndex * 15
                    });

                    // Check if this slot has items from backpack
                    const item = backpackItems[slotIndex];
                    if (item && item.amount > 0) {
                        const iconKey = InventoryService.getItemIcon(item.itemType);
                        const itemIcon = this.scene.add.image(slotX, slotY - 2, iconKey);
                        itemIcon.setDisplaySize(gridSlotSize - 12, gridSlotSize - 12);
                        itemIcon.setDepth(5204);
                        itemIcon.setAlpha(0);
                        this.scene.cameras.main.ignore(itemIcon);
                        this.chestPanelElements.push(itemIcon);

                        this.scene.tweens.add({
                            targets: itemIcon,
                            alpha: 1,
                            duration: 80,
                            delay: slotIndex * 15
                        });

                        // Show count badge
                        const countText = this.scene.add.text(
                            slotX + gridSlotSize / 2 - 3,
                            slotY + gridSlotSize / 2 - 3,
                            item.amount.toString(),
                            {
                                fontSize: '10px',
                                fontFamily: 'PixelFont',
                                color: '#ffffff',
                                resolution: 2
                            }
                        );
                        countText.setOrigin(1, 1);
                        countText.setDepth(5205);
                        countText.setStroke('#5D4037', 2);
                        countText.setAlpha(0);
                        this.scene.cameras.main.ignore(countText);
                        this.chestPanelElements.push(countText);

                        this.scene.tweens.add({
                            targets: countText,
                            alpha: 1,
                            duration: 80,
                            delay: slotIndex * 15
                        });

                        // Click handler for slot selection
                        slotBg.on('pointerdown', () => this.onChestSlotClick(slotIndex, item));
                        slotBg.on('pointerover', () => {
                            if (this.selectedChestItemIndex !== slotIndex) {
                                slotBg.setFillStyle(0xE8DCC8);
                            }
                        });
                        slotBg.on('pointerout', () => {
                            if (this.selectedChestItemIndex !== slotIndex) {
                                slotBg.setFillStyle(0xD4C4A8);
                            }
                        });
                    }
                }
            }

            // Capacity indicator
            // const backpackCapacity = cachedData?.inventory?.backpack?.capacity;
            // const usedSlots = backpackCapacity?.used ?? backpackItems.length;
            // const totalSlots = backpackCapacity?.total ?? 20;
            // const capacityText = this.scene.add.text(
            //     panelX,
            //     panelY + panelHeight / 2 - 45,
            //     `${usedSlots}/${totalSlots}`,
            //     {
            //         fontSize: '9px',
            //         fontFamily: 'PixelFont',
            //         color: usedSlots >= totalSlots ? '#FF5252' : '#FFFFFF',
            //         resolution: 2
            //     }
            // );
            // capacityText.setOrigin(0.5);
            // capacityText.setDepth(5201);
            // capacityText.setAlpha(0);
            // this.scene.cameras.main.ignore(capacityText);
            // this.chestPanelElements.push(capacityText);

            // this.scene.tweens.add({
            //     targets: capacityText,
            //     alpha: 1,
            //     duration: 100
            // });

            // "Move to Warehouse" button
            const moveBtn = this.scene.add.rectangle(panelX, panelY + panelHeight / 2 - 18, panelWidth - 16, 24, 0x8B7355);
            moveBtn.setStrokeStyle(2, 0x5D4037);
            moveBtn.setDepth(5202);
            moveBtn.setAlpha(0.5);
            moveBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(moveBtn);
            this.chestPanelElements.push(moveBtn);

            const moveBtnText = this.scene.add.text(panelX, panelY + panelHeight / 2 - 18, '→ Warehouse', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            moveBtnText.setOrigin(0.5);
            moveBtnText.setDepth(5203);
            moveBtnText.setStroke('#5D4037', 1);
            this.scene.cameras.main.ignore(moveBtnText);
            this.chestPanelElements.push(moveBtnText);

            moveBtn.on('pointerdown', () => this.moveSelectedToWarehouse(backpackItems));
            moveBtn.on('pointerover', () => {
                if (this.selectedChestItemIndex >= 0) {
                    moveBtn.setFillStyle(0xA08060);
                }
            });
            moveBtn.on('pointerout', () => moveBtn.setFillStyle(0x8B7355));
        });
    }

    private getTotalChestItems(): number {
        const cachedData = GameDataService.getCachedData();
        const backpackItems = cachedData?.inventory?.backpack?.backpack ?? [];
        return backpackItems.reduce((total, item) => total + (item?.amount || 0), 0);
    }

    private onChestSlotClick(slotIndex: number, _item: InventoryItem): void {
        // Deselect previous slot
        if (this.selectedChestItemIndex >= 0 && this.selectedChestItemIndex < this.chestSlotBgs.length) {
            const prevSlot = this.chestSlotBgs[this.selectedChestItemIndex];
            if (prevSlot && prevSlot.active) {
                prevSlot.setFillStyle(0xD4C4A8);
                prevSlot.setStrokeStyle(2, 0x8B7355);
            }
        }

        // Toggle selection
        if (this.selectedChestItemIndex === slotIndex) {
            this.selectedChestItemIndex = -1;
            return;
        }

        // Select new slot
        this.selectedChestItemIndex = slotIndex;
        const slotBg = this.chestSlotBgs[slotIndex];
        if (slotBg && slotBg.active) {
            slotBg.setFillStyle(0xFFD700); // Gold highlight
            slotBg.setStrokeStyle(2, 0xB8860B);
        }
    }

    private moveSelectedToWarehouse(backpackItems: InventoryItem[]): void {
        // Check if an item is selected
        if (this.selectedChestItemIndex < 0) {
            this.callbacks.showToastMessage('Select an item first!', 0xFF5252);
            return;
        }

        const selectedItem = backpackItems[this.selectedChestItemIndex];
        if (!selectedItem || selectedItem.amount <= 0) {
            this.callbacks.showToastMessage('Invalid item!', 0xFF5252);
            return;
        }

        // 1. OPTIMISTIC UI - Update BOTH caches immediately
        GameDataService.removeFromBackpackCache(selectedItem.itemType, selectedItem.amount);
        GameDataService.addToStorageCache(selectedItem.itemType, selectedItem.amount);

        // 2. Instant feedback
        this.callbacks.playSuccessSound();
        this.callbacks.showToastMessage('Moved to warehouse!', 0x4CAF50);
        this.selectedChestItemIndex = -1;
        this.closeChestPanel();
        // Toolbar will auto-update via closeChestPanel -> updateToolbar with new cache values

        // 3. Background API call
        InventoryService.moveToStorage(selectedItem.itemType, selectedItem.amount)
            .then(async (result) => {
                if (result && result.success) {
                    // Sync with server data
                    await GameDataService.refreshBackpack();
                    await GameDataService.refreshStorage();
                } else {
                    // Rollback cache on failure
                    await GameDataService.refreshBackpack();
                    this.callbacks.showToastMessage(result?.message || 'Sync failed', 0xFF5252);
                }
            })
            .catch(async (error) => {
                console.error('Error moving to warehouse:', error);
                // Rollback cache on error
                await GameDataService.refreshBackpack();
                this.callbacks.showToastMessage('Sync error!', 0xFF5252);
            });
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
