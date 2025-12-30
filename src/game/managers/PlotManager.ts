import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { ShopService, GemShopItem } from '../ShopService';
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

        // Use cached gem shop data (pre-loaded during game init)
        const cachedData = GameDataService.getCachedData();
        const gemShopData = cachedData?.shop?.gemShop;

        if (!gemShopData) {
            this.callbacks.showFloatingMessage('Shop data not loaded', tileX, tileY);
            this.isModalOpen = false;
            return;
        }

        // Find the land slot item for this plot
        const itemKey = `LAND_SLOT_${plotIndex + 1}`;
        const plotItem = gemShopData.items.find(item => item.key === itemKey);

        if (!plotItem) {
            this.callbacks.showFloatingMessage('Plot not available', tileX, tileY);
            this.isModalOpen = false;
            return;
        }

        // Show modal with plot info from cache
        this.showPlotModal(tileX, tileY, plotIndex, plotItem, gemShopData.user.balanceGem);
    }

    private showPlotModal(
        tileX: number,
        tileY: number,
        plotIndex: number,
        plotItem: GemShopItem,
        userBalanceGem: number
    ): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 240;
        const modalHeight = 180;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
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
            this.createModalContent(modalX, modalY, plotIndex, plotItem, userBalanceGem, tileX, tileY, overlay);
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
        plotItem: GemShopItem,
        userBalanceGem: number,
        tileX: number,
        tileY: number,
        overlay: Phaser.GameObjects.Rectangle
    ): void {
        const cost = plotItem.priceGem;
        const isAvailable = plotItem.available !== false;
        const canAfford = plotItem.affordable && userBalanceGem >= cost;

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
        const priceText = this.scene.add.text(modalX, modalY + 15, `Price: ${cost} 💎`, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        priceText.setOrigin(0.5);
        priceText.setDepth(5402);
        this.scene.cameras.main.ignore(priceText);
        this.modalElements.push(priceText);

        // User balance
        const balanceText = this.scene.add.text(modalX, modalY + 35, `You have: ${userBalanceGem} 💎`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: canAfford ? '#4ade80' : '#ef4444',
            resolution: 2
        });
        balanceText.setOrigin(0.5);
        balanceText.setDepth(5402);
        this.scene.cameras.main.ignore(balanceText);
        this.modalElements.push(balanceText);

        // Availability status
        if (!isAvailable) {
            const statusText = this.scene.add.text(modalX, modalY + 50, 'Already Purchased', {
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

        // Buy button (disabled if not available or can't afford)
        const canBuy = isAvailable && canAfford;
        const buyBtnBg = this.scene.add.sprite(modalX - 40, modalY + 70, 'square-buttons', canBuy ? 6 : 7);
        buyBtnBg.setDisplaySize(70, 28);
        buyBtnBg.setDepth(5402);
        buyBtnBg.setInteractive({ useHandCursor: canBuy });
        this.scene.cameras.main.ignore(buyBtnBg);
        this.modalElements.push(buyBtnBg);

        const buyBtnText = this.scene.add.text(modalX - 40, modalY + 70, 'Buy', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: canBuy ? '#FFFFFF' : '#999999',
            resolution: 2
        });
        buyBtnText.setOrigin(0.5);
        buyBtnText.setDepth(5403);
        this.scene.cameras.main.ignore(buyBtnText);
        this.modalElements.push(buyBtnText);

        if (canBuy) {
            buyBtnBg.on('pointerover', () => buyBtnBg.setTint(0xcccccc));
            buyBtnBg.on('pointerout', () => buyBtnBg.clearTint());
            buyBtnBg.on('pointerdown', () => {
                this.purchasePlot(tileX, tileY, plotIndex, plotItem);
            });
        }

        // Cancel button
        const cancelBtnBg = this.scene.add.sprite(modalX + 40, modalY + 70, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(70, 28);
        cancelBtnBg.setDepth(5402);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cancelBtnBg);
        this.modalElements.push(cancelBtnBg);

        const cancelBtnText = this.scene.add.text(modalX + 40, modalY + 70, 'Cancel', {
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

    private async purchasePlot(tileX: number, tileY: number, plotIndex: number, plotItem: GemShopItem): Promise<void> {
        const ownedPlotsCount = this.callbacks.getOwnedPlotsCount();
        const playerGems = this.callbacks.getPlayerGems();

        // Store previous values for rollback
        const previousOwnedPlots = ownedPlotsCount;
        const previousGems = playerGems;

        // 1. OPTIMISTIC UPDATE - Deduct gems and unlock plot immediately
        this.callbacks.setPlayerGems(playerGems - plotItem.priceGem);
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

        // 2. TRY WEBSOCKET FIRST - Buy land via WebSocket (fire-and-forget)
        const usedWebSocket = ShopService.buyLandWS();
        
        if (usedWebSocket) {
            // WebSocket sent - UI updates will come via land_update and action_success events
            console.log('[PlotManager] Buy land sent via WebSocket');
            return;
        }

        // 3. FALL BACK TO REST API if WebSocket not available
        try {
            const result = await ShopService.purchaseGemItem(plotItem.key, 1);
            
            if (!result || !result.success) {
                // ROLLBACK on failure
                this.callbacks.setPlayerGems(previousGems);
                this.callbacks.setOwnedPlotsCount(previousOwnedPlots);
                
                // Re-lock the plot
                if (state) {
                    state.locked = true;
                }
                
                this.callbacks.refreshProfileUI();
                this.callbacks.showFloatingMessage(result?.message || 'Purchase failed!', tileX, tileY);
                console.error('Failed to purchase plot:', result?.message);
            } else {
                // SYNC with server data
                await GameDataService.refreshAndUpdateUI();
            }
        } catch (error) {
            // ROLLBACK on network error
            this.callbacks.setPlayerGems(previousGems);
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
