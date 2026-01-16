import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { InventoryService, InventoryItem } from '../InventoryService';
import { GameDataService } from '../GameDataService';

interface WarehouseCallbacks {
    getBackpackItems: () => InventoryItem[];
    showToastMessage: (text: string, color: number) => void;
    playSuccessSound: () => void;
    refreshInventory: () => Promise<void>;
    updateToolbar: () => void;
    getSelectedItem: () => { itemType: string; amount: number; source: 'backpack' | 'storage' } | null;
    setSelectedItem: (item: { itemType: string; amount: number; source: 'backpack' | 'storage' } | null) => void;
}

/**
 * Manages the Warehouse (Storage) system
 * Handles long-term item storage separate from backpack
 */
export class WarehouseManager extends BaseManager {
    private warehouseSprite!: Phaser.GameObjects.Sprite;
    private callbacks: WarehouseCallbacks;
    private tileSize: number;
    private storageItems: InventoryItem[] = [];
    private slotElements: Phaser.GameObjects.GameObject[] = [];
    private selectedSlotIndex: number = -1;

    // Constants for warehouse modal
    private readonly WAREHOUSE_SLOTS = 16;
    private readonly SLOTS_PER_ROW = 4;
    private readonly SLOT_SIZE = 30;  
    private readonly SLOT_SPACING = 8;
    private readonly PANEL_PADDING = 20;

    constructor(scene: Phaser.Scene, callbacks: WarehouseCallbacks, tileSize: number) {
        super(scene);
        this.callbacks = callbacks;
        this.tileSize = tileSize;
    }

    /**
     * Create the warehouse sprite on the map (same position as factory)
     */
    public createWarehouse(): void {
        const centerX = 25;
        const centerY = 25;
        const warehouseX = centerX * this.tileSize + this.tileSize / 2;
        const warehouseY = (centerY - 5) * this.tileSize - 30;

        this.warehouseSprite = this.scene.add.sprite(warehouseX, warehouseY, 'warehouse', 0);
        this.warehouseSprite.setDisplaySize(64, 72);
        this.warehouseSprite.setDepth(warehouseY + 20);
        this.warehouseSprite.setInteractive({ useHandCursor: true });

        this.warehouseSprite.on('pointerdown', () => {
            this.toggle();
        });

        // Setup hover effect with tint + shadow
        this.setupHoverEffect(this.warehouseSprite, 12);
    }

    /**
     * Get the warehouse sprite for camera setup
     */
    public getWarehouseSprite(): Phaser.GameObjects.Sprite {
        return this.warehouseSprite;
    }

    /**
     * Toggle warehouse modal
     */
    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open the warehouse modal
     */
    public open(): void {
        this.close();
        this.isOpen = true;
        this.selectedSlotIndex = -1;

        // Change to open frame
        this.warehouseSprite.setFrame(1);

        // Use cached storage data (pre-loaded during game initialization)
        // Filter out currency items (GOLD, RUBY, GEM) - these are on User model, not inventory
        const CURRENCY_ITEMS = ['GOLD', 'RUBY', 'GEM'];
        const cachedData = GameDataService.getCachedData();
        if (cachedData?.inventory?.storage) {
            this.storageItems = cachedData.inventory.storage.storage.filter(
                item => !CURRENCY_ITEMS.includes(item.itemType)
            );
        } else {
            this.storageItems = [];
        }

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        // Calculate grid dimensions
        const gridCols = this.SLOTS_PER_ROW;
        const gridRows = Math.ceil(this.WAREHOUSE_SLOTS / this.SLOTS_PER_ROW);
        const gridWidth = gridCols * this.SLOT_SIZE + (gridCols - 1) * this.SLOT_SPACING;
        const gridHeight = gridRows * this.SLOT_SIZE + (gridRows - 1) * this.SLOT_SPACING;

        // Panel size based on grid
        const panelWidth = gridWidth + this.PANEL_PADDING * 2;
        const panelHeight = gridHeight + this.PANEL_PADDING * 2 + 50 + 50; // 50 for title area, 50 for action area
        const panelX = screenWidth / 2;
        const panelY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(
            screenWidth / 2, screenHeight / 2,
            screenWidth, screenHeight,
            0x000000, 0.6
        );
        overlay.setDepth(5299);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.addElement(overlay);
        overlay.on('pointerdown', () => this.close());

        // Background panel (settings-panel sprite is 125x140)
        const panelBg = this.scene.add.sprite(panelX, panelY, 'settings-panel', 1);
        panelBg.setDisplaySize(panelWidth, panelHeight);
        panelBg.setDepth(5300);
        panelBg.setInteractive();
        panelBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(panelBg);
        this.addElement(panelBg);

        // Animation: start from scale 0 and animate to target scale
        const targetScaleX = panelWidth / 125;
        const targetScaleY = panelHeight / 140;
        panelBg.setScale(0);
        this.scene.tweens.add({
            targets: panelBg,
            scaleX: targetScaleX,
            scaleY: targetScaleY,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        const title = this.scene.add.text(panelX, panelY - panelHeight / 2 + 30, 'Warehouse', {
            fontSize: '14px',
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
        this.scene.tweens.add({ targets: title, alpha: 1, duration: 150 });

        // Close button
        const closeBtnBg = this.scene.add.sprite(panelX + panelWidth / 2 - 25, panelY - panelHeight / 2 + 30, 'square-buttons', 6);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setAlpha(0);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeBtnText = this.scene.add.text(panelX + panelWidth / 2 - 25, panelY - panelHeight / 2 + 30, 'X', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeBtnText.setOrigin(0.5);
        closeBtnText.setDepth(5303);
        closeBtnText.setAlpha(0);
        this.scene.cameras.main.ignore(closeBtnText);
        this.addElement(closeBtnText);

        this.scene.tweens.add({
            targets: [closeBtnBg, closeBtnText],
            alpha: 1,
            duration: 150
        });

        closeBtnBg.on('pointerdown', () => this.close());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Create content after animation
        this.scene.time.delayedCall(100, () => {
            // Create 4x4 grid of slots (offset up to account for title)
            this.createStorageGrid(panelX, panelY, gridWidth, gridHeight);

            // Bottom action area
            this.createActionArea(panelX, panelY + panelHeight / 2 - 35);
        });
    }

    /**
     * Create the 4x4 storage grid
     */
    private createStorageGrid(centerX: number, centerY: number, gridWidth: number, gridHeight: number): void {
        // Position grid relative to center
        const gridStartX = centerX - gridWidth / 2 + this.SLOT_SIZE / 2 + 5;
        const gridStartY = centerY - gridHeight / 2 + this.SLOT_SIZE / 2;

        for (let i = 0; i < this.WAREHOUSE_SLOTS; i++) {
            const row = Math.floor(i / this.SLOTS_PER_ROW);
            const col = i % this.SLOTS_PER_ROW;
            const slotX = gridStartX + col * (this.SLOT_SIZE + this.SLOT_SPACING);
            const slotY = gridStartY + row * (this.SLOT_SIZE + this.SLOT_SPACING);

            // Slot background
            const slotBg = this.scene.add.rectangle(slotX, slotY, this.SLOT_SIZE, this.SLOT_SIZE, 0xD4C4A8);
            slotBg.setStrokeStyle(2, 0x8B7355);
            slotBg.setDepth(5301);
            slotBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(slotBg);
            this.addElement(slotBg);
            this.slotElements.push(slotBg);

            // Check if there's an item for this slot
            const item = this.storageItems[i];
            if (item) {
                // Item icon (slot size - 12 to match chest panel)
                const iconSize = this.SLOT_SIZE - 12;
                const iconKey = InventoryService.getItemIcon(item.itemType);
                const icon = this.scene.add.image(slotX, slotY - 2, iconKey);
                icon.setDisplaySize(iconSize, iconSize);
                icon.setDepth(5302);

                // Apply tint for fertilizers based on rarity
                const fertilizerTints: Record<string, number> = {
                    'FERTILIZER_COMMON': 0x8B8B8B,    // Gray
                    'FERTILIZER_RARE': 0x4FC3F7,     // Blue
                    'FERTILIZER_EPIC': 0xBA68C8,     // Purple
                    'FERTILIZER_LEGENDARY': 0xFFD54F // Gold
                };
                if (fertilizerTints[item.itemType]) {
                    icon.setTint(fertilizerTints[item.itemType]);
                }

                this.scene.cameras.main.ignore(icon);
                this.addElement(icon);
                this.slotElements.push(icon);

                // Item count badge (bottom-right corner)
                const countBadge = this.scene.add.text(
                    slotX + this.SLOT_SIZE / 2 - 3,
                    slotY + this.SLOT_SIZE / 2 - 3,
                    `${item.amount}`,
                    {
                        fontSize: '10px',
                        fontFamily: 'PixelFont',
                        color: '#FFFFFF',
                        resolution: 2
                    }
                );
                countBadge.setOrigin(1, 1);
                countBadge.setDepth(5303);
                countBadge.setStroke('#5D4037', 2);
                this.scene.cameras.main.ignore(countBadge);
                this.addElement(countBadge);
                this.slotElements.push(countBadge);
            }

            // Click handler for slot
            const slotIndex = i;
            slotBg.on('pointerdown', () => this.onSlotClick(slotIndex, slotBg));
            slotBg.on('pointerover', () => {
                if (this.selectedSlotIndex !== slotIndex) {
                    slotBg.setFillStyle(0xE8DCC8);
                }
            });
            slotBg.on('pointerout', () => {
                if (this.selectedSlotIndex !== slotIndex) {
                    slotBg.setFillStyle(0xD4C4A8);
                }
            });
        }
    }

    /**
     * Handle slot click
     */
    private onSlotClick(slotIndex: number, slotBg: Phaser.GameObjects.Rectangle): void {
        const item = this.storageItems[slotIndex];
        const currentSelected = this.callbacks.getSelectedItem();

        // If there's a selected item from backpack, move it here
        if (currentSelected && currentSelected.source === 'backpack') {
            this.moveItemToStorage(currentSelected.itemType, currentSelected.amount);
            return;
        }

        // If clicking on an item, select it
        if (item) {
            // Deselect previous
            if (this.selectedSlotIndex >= 0) {
                const prevSlot = this.slotElements[this.selectedSlotIndex * 3] as Phaser.GameObjects.Rectangle;
                if (prevSlot) {
                    prevSlot.setFillStyle(0xD4C4A8);
                    prevSlot.setStrokeStyle(2, 0x8B7355);
                }
            }

            // Select this slot
            this.selectedSlotIndex = slotIndex;
            slotBg.setFillStyle(0xFFE082);
            slotBg.setStrokeStyle(3, 0xFFA000);

            // Set selected item
            this.callbacks.setSelectedItem({
                itemType: item.itemType,
                amount: item.amount,
                source: 'storage'
            });

            this.updateActionArea();
        }
    }

    /**
     * Create bottom action area
     */
    private createActionArea(centerX: number, y: number): void {
        // Move to Chest button
        const moveBtn = this.scene.add.sprite(centerX, y, 'square-buttons', 6);
        moveBtn.setDisplaySize(120, 32);
        moveBtn.setDepth(5302);
        moveBtn.setInteractive({ useHandCursor: true });
        moveBtn.setAlpha(0.5);
        this.scene.cameras.main.ignore(moveBtn);
        this.addElement(moveBtn);

        const moveBtnText = this.scene.add.text(centerX, y, 'Move to Chest', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        moveBtnText.setOrigin(0.5);
        moveBtnText.setDepth(5303);
        moveBtnText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(moveBtnText);
        this.addElement(moveBtnText);

        moveBtn.on('pointerdown', () => {
            const selected = this.callbacks.getSelectedItem();
            if (selected && selected.source === 'storage') {
                this.moveItemToBackpack(selected.itemType, selected.amount);
            }
        });
        moveBtn.on('pointerover', () => {
            const selected = this.callbacks.getSelectedItem();
            if (selected && selected.source === 'storage') {
                moveBtn.setTint(0xcccccc);
            }
        });
        moveBtn.on('pointerout', () => moveBtn.clearTint());
    }

    /**
     * Update action area based on selection
     */
    private updateActionArea(): void {
        // Action area updates handled by button state
    }

    /**
     * Move item from backpack to storage (Optimistic UI)
     */
    private moveItemToStorage(itemType: string, amount: number): void {
        // 1. OPTIMISTIC UI - Update BOTH caches immediately
        GameDataService.removeFromBackpackCache(itemType, amount);
        GameDataService.addToStorageCache(itemType, amount);

        // 2. Instant feedback
        this.callbacks.playSuccessSound();
        this.callbacks.showToastMessage('Moved to warehouse!', 0x4CAF50);
        this.callbacks.setSelectedItem(null);
        this.close();

        // 3. Background API call
        InventoryService.moveToStorage(itemType, amount)
            .then(async (result) => {
                if (result?.success) {
                    // Sync with server
                    await GameDataService.refreshWarehouseInventory();
                } else {
                    // Rollback on failure
                    await GameDataService.refreshBackpack();
                    this.callbacks.showToastMessage(result?.message || 'Sync failed', 0xFF5252);
                }
            })
            .catch(async (error) => {
                // Rollback on error
                await GameDataService.refreshBackpack();
                this.callbacks.showToastMessage('Sync error!', 0xFF5252);
            });
    }

    /**
     * Move item from storage to backpack (Optimistic UI)
     */
    private moveItemToBackpack(itemType: string, amount: number): void {
        // 1. OPTIMISTIC UI - Update BOTH caches immediately
        GameDataService.removeFromStorageCache(itemType, amount);
        GameDataService.addToBackpackCache(itemType, amount);

        // 2. Instant feedback
        this.callbacks.playSuccessSound();
        this.callbacks.showToastMessage('Moved to chest!', 0x4CAF50);
        this.callbacks.setSelectedItem(null);
        this.selectedSlotIndex = -1;
        this.close();

        // 3. Update toolbar immediately (chest count)
        this.callbacks.updateToolbar();

        // 4. Background API call
        InventoryService.moveToBackpack(itemType, amount)
            .then(async (result) => {
                if (result?.success) {
                    // Sync with server
                    await GameDataService.refreshWarehouseInventory();
                } else {
                    // Rollback on failure
                    await GameDataService.refreshStorage();
                    this.callbacks.showToastMessage(result?.message || 'Sync failed', 0xFF5252);
                }
            })
            .catch(async (error) => {
                // Rollback on error
                await GameDataService.refreshStorage();
                this.callbacks.showToastMessage('Sync error!', 0xFF5252);
            });
    }

    /**
     * Close the warehouse modal
     */
    public close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.selectedSlotIndex = -1;
        this.slotElements = [];

        // Change back to closed frame
        if (this.warehouseSprite) {
            this.warehouseSprite.setFrame(0);
        }

        // Clear selected item if it was from storage
        const selected = this.callbacks.getSelectedItem();
        if (selected?.source === 'storage') {
            this.callbacks.setSelectedItem(null);
        }

        this.destroyElements();
    }

    /**
     * Cleanup
     */
    public destroy(): void {
        this.close();
        if (this.warehouseSprite) {
            this.warehouseSprite.destroy();
        }
        super.destroy();
    }
}
