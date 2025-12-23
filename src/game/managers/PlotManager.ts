import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { ShopService, CashShopItem } from '../ShopService';
import { GameDataService } from '../GameDataService';

// Plot Manager Callbacks
export interface PlotManagerCallbacks {
    // Getters
    getPlayerGems: () => number;
    getOwnedPlotsCount: () => number;
    getLockedPlotOverlays: () => Map<string, Phaser.GameObjects.GameObject>;
    getFarmLandStates: () => Map<string, { locked?: boolean }>;

    // Setters
    setPlayerGems: (gems: number) => void;
    setOwnedPlotsCount: (count: number) => void;

    // Actions
    refreshProfileUI: () => void;
    showFloatingMessage: (message: string, tileX: number, tileY: number) => void;
}

export class PlotManager extends BaseManager {
    private callbacks: PlotManagerCallbacks;
    private modalElements: Phaser.GameObjects.GameObject[] = [];
    private isModalOpen: boolean = false;

    constructor(scene: Phaser.Scene, callbacks: PlotManagerCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    // ========== Public Methods ==========

    public showBuyPlotModal(tileX: number, tileY: number, plotIndex: number): void {
        if (this.isModalOpen) return;

        const ownedPlotsCount = this.callbacks.getOwnedPlotsCount();

        // Can only buy the next plot in sequence
        if (plotIndex !== ownedPlotsCount) {
            console.log('Must buy plots in order! Next plot to buy:', ownedPlotsCount);
            this.callbacks.showFloatingMessage(`Buy plot ${ownedPlotsCount + 1} first!`, tileX, tileY);
            return;
        }

        this.isModalOpen = true;

        // Fetch plot info from cash shop API
        this.fetchAndShowPlotModal(tileX, tileY, plotIndex);
    }

    private async fetchAndShowPlotModal(tileX: number, tileY: number, plotIndex: number): Promise<void> {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        // Show loading overlay
        const overlay = this.scene.add.rectangle(
            screenWidth / 2,
            screenHeight / 2,
            screenWidth,
            screenHeight,
            0x000000,
            0.6
        );
        overlay.setDepth(5400);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.modalElements.push(overlay);

        const loadingText = this.scene.add.text(screenWidth / 2, screenHeight / 2, 'Loading...', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        loadingText.setOrigin(0.5);
        loadingText.setDepth(5401);
        this.scene.cameras.main.ignore(loadingText);
        this.modalElements.push(loadingText);

        // Fetch cash shop data
        const cashShop = await ShopService.getCashShop();
        
        // Remove loading text
        loadingText.destroy();
        const loadingIndex = this.modalElements.indexOf(loadingText);
        if (loadingIndex > -1) this.modalElements.splice(loadingIndex, 1);

        if (!cashShop) {
            this.callbacks.showFloatingMessage('Failed to load plot info', tileX, tileY);
            this.closeBuyPlotModal();
            return;
        }

        // Find the land slot item for this plot
        const itemKey = `LAND_SLOT_${plotIndex + 1}`;
        const plotItem = cashShop.items.find(item => item.key === itemKey);

        if (!plotItem) {
            this.callbacks.showFloatingMessage('Plot not available', tileX, tileY);
            this.closeBuyPlotModal();
            return;
        }

        // Show modal with plot info
        this.showPlotModal(tileX, tileY, plotIndex, plotItem, overlay);
    }

    private showPlotModal(
        tileX: number,
        tileY: number,
        plotIndex: number,
        plotItem: CashShopItem,
        overlay: Phaser.GameObjects.Rectangle
    ): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 240;
        const modalHeight = 180;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5401);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.modalElements.push(modalBg);

        // Animate modal
        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.scene.time.delayedCall(100, () => {
            this.createModalContent(modalX, modalY, plotIndex, plotItem, tileX, tileY, overlay);
        });
    }

    public closeBuyPlotModal(): void {
        this.isModalOpen = false;
        this.modalElements.forEach(el => el.destroy());
        this.modalElements = [];
    }

    public isBuyPlotModalOpen(): boolean {
        return this.isModalOpen;
    }

    // ========== Private Methods ==========

    private createModalContent(
        modalX: number,
        modalY: number,
        plotIndex: number,
        plotItem: CashShopItem,
        tileX: number,
        tileY: number,
        overlay: Phaser.GameObjects.Rectangle
    ): void {
        const playerGems = this.callbacks.getPlayerGems();
        const cost = plotItem.priceUSD;
        const isAvailable = plotItem.available;

        // Title
        const title = this.scene.add.text(modalX, modalY - 60, plotItem.name, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5402);
        title.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(title);
        this.modalElements.push(title);

        // Icon
        const iconText = this.scene.add.text(modalX, modalY - 35, plotItem.icon, {
            fontSize: '20px',
            resolution: 2
        });
        iconText.setOrigin(0.5);
        iconText.setDepth(5402);
        this.scene.cameras.main.ignore(iconText);
        this.modalElements.push(iconText);

        // Description
        const descText = this.scene.add.text(modalX, modalY - 10, plotItem.description, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#CCCCCC',
            resolution: 2,
            wordWrap: { width: 200 }
        });
        descText.setOrigin(0.5);
        descText.setDepth(5402);
        this.scene.cameras.main.ignore(descText);
        this.modalElements.push(descText);

        // Price
        const priceText = this.scene.add.text(modalX, modalY + 15, `Price: $${cost} USD`, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        priceText.setOrigin(0.5);
        priceText.setDepth(5402);
        this.scene.cameras.main.ignore(priceText);
        this.modalElements.push(priceText);

        // Availability status
        if (!isAvailable) {
            const statusText = this.scene.add.text(modalX, modalY + 35, 'Already Purchased', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#4ade80',
                resolution: 2
            });
            statusText.setOrigin(0.5);
            statusText.setDepth(5402);
            this.scene.cameras.main.ignore(statusText);
            this.modalElements.push(statusText);
        }

        // Buy button (disabled if not available)
        const buyBtnBg = this.scene.add.sprite(modalX - 40, modalY + 60, 'square-buttons', isAvailable ? 6 : 7);
        buyBtnBg.setDisplaySize(70, 28);
        buyBtnBg.setDepth(5402);
        buyBtnBg.setInteractive({ useHandCursor: isAvailable });
        this.scene.cameras.main.ignore(buyBtnBg);
        this.modalElements.push(buyBtnBg);

        const buyBtnText = this.scene.add.text(modalX - 40, modalY + 60, 'Buy', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: isAvailable ? '#FFFFFF' : '#999999',
            resolution: 2
        });
        buyBtnText.setOrigin(0.5);
        buyBtnText.setDepth(5403);
        this.scene.cameras.main.ignore(buyBtnText);
        this.modalElements.push(buyBtnText);

        if (isAvailable) {
            buyBtnBg.on('pointerover', () => buyBtnBg.setTint(0xcccccc));
            buyBtnBg.on('pointerout', () => buyBtnBg.clearTint());
            buyBtnBg.on('pointerdown', () => {
                this.purchasePlot(tileX, tileY, plotIndex, plotItem);
            });
        }

        // Cancel button
        const cancelBtnBg = this.scene.add.sprite(modalX + 40, modalY + 60, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(70, 28);
        cancelBtnBg.setDepth(5402);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cancelBtnBg);
        this.modalElements.push(cancelBtnBg);

        const cancelBtnText = this.scene.add.text(modalX + 40, modalY + 60, 'Cancel', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        cancelBtnText.setOrigin(0.5);
        cancelBtnText.setDepth(5403);
        this.scene.cameras.main.ignore(cancelBtnText);
        this.modalElements.push(cancelBtnText);

        cancelBtnBg.on('pointerover', () => cancelBtnBg.setTint(0xcccccc));
        cancelBtnBg.on('pointerout', () => cancelBtnBg.clearTint());
        cancelBtnBg.on('pointerdown', () => {
            this.closeBuyPlotModal();
        });

        // Close on overlay click
        overlay.on('pointerdown', () => {
            this.closeBuyPlotModal();
        });
    }

    private async purchasePlot(tileX: number, tileY: number, plotIndex: number, plotItem: CashShopItem): Promise<void> {
        const ownedPlotsCount = this.callbacks.getOwnedPlotsCount();

        // Store previous values for rollback
        const previousOwnedPlots = ownedPlotsCount;

        // 1. OPTIMISTIC UPDATE - Unlock plot immediately
        this.callbacks.setOwnedPlotsCount(ownedPlotsCount + 1);

        // Update state
        const key = `${tileX},${tileY}`;
        const farmLandStates = this.callbacks.getFarmLandStates();
        const state = farmLandStates.get(key);
        if (state) {
            state.locked = false;
        }

        // Remove lock overlay
        const lockedPlotOverlays = this.callbacks.getLockedPlotOverlays();
        const lockOverlay = lockedPlotOverlays.get(key);
        if (lockOverlay) {
            lockOverlay.destroy();
            lockedPlotOverlays.delete(key);
        }

        // Update UI
        this.callbacks.refreshProfileUI();

        // Close modal
        this.closeBuyPlotModal();

        // Show success message
        this.callbacks.showFloatingMessage('Plot purchased!', tileX, tileY);

        console.log('Purchased plot', plotIndex + 1);

        // 2. CALL API - Purchase land slot via cash shop
        const paymentId = `local-payment-${Date.now()}`; // Temporary payment ID
        
        try {
            const result = await ShopService.purchaseCashItem(plotItem.key, paymentId, 'local');
            
            if (!result || !result.success) {
                // 3. ROLLBACK on failure
                this.callbacks.setOwnedPlotsCount(previousOwnedPlots);
                
                // Re-lock the plot
                if (state) {
                    state.locked = true;
                }
                
                this.callbacks.refreshProfileUI();
                this.callbacks.showFloatingMessage(result?.message || 'Purchase failed!', tileX, tileY);
                console.error('Failed to purchase plot:', result?.message);
            } else {
                // 4. SYNC with server data
                await GameDataService.refreshAndUpdateUI();
            }
        } catch (error) {
            // ROLLBACK on network error
            this.callbacks.setOwnedPlotsCount(previousOwnedPlots);
            
            if (state) {
                state.locked = true;
            }
            
            this.callbacks.refreshProfileUI();
            this.callbacks.showFloatingMessage('Network error!', tileX, tileY);
            console.error('Network error purchasing plot:', error);
        }
    }

    // ========== Cleanup ==========

    public destroy(): void {
        this.closeBuyPlotModal();
        super.destroy();
    }
}
