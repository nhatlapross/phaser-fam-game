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
        let plotItem = gemShopData.items.find(item => item.key === itemKey);

        // Fallback to generic expansion item if specific slot item not found
        if (!plotItem) {
            plotItem = gemShopData.items.find(item => item.key === 'LAND_SLOT_EXPANSION');
        }

        if (!plotItem) {
            // Attempt to refresh data if item is missing (e.g. newly unlocked)
            this.callbacks.showFloatingMessage('Loading...', tileX, tileY);
            
            GameDataService.refreshGemShop().then(shopData => {
                if (!shopData) {
                    this.callbacks.showFloatingMessage('Shop error', tileX, tileY);
                    this.isModalOpen = false;
                    return;
                }
                
                let newItem = shopData.items.find(item => item.key === itemKey);
                if (!newItem) {
                    newItem = shopData.items.find(item => item.key === 'LAND_SLOT_EXPANSION');
                }

                if (newItem) {
                    this.showPlotModal(tileX, tileY, plotIndex, newItem, this.callbacks.getPlayerGems());
                } else {
                    this.callbacks.showFloatingMessage('Plot not available', tileX, tileY);
                    this.isModalOpen = false;
                }
            }).catch(() => {
                this.callbacks.showFloatingMessage('Network error', tileX, tileY);
                this.isModalOpen = false;
            });
            
            return;
        }

        // Show modal with plot info from cache
        // Use live gem balance from callbacks (synced with FarmingGame/Profile) instead of cached shop snapshot
        this.showPlotModal(tileX, tileY, plotIndex, plotItem, this.callbacks.getPlayerGems());
    }

    public showRemovePlantModal(onConfirm: () => void): void {
        if (this.isModalOpen) return;
        this.isModalOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 240;
        const modalHeight = 150;
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
            this.createRemovePlantModalContent(modalX, modalY, overlay, onConfirm);
        });
    }

    public closeRemovePlantModal(): void {
        this.isModalOpen = false;
        this.modalElements.forEach(el => el.destroy());
        this.modalElements = [];
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
        const modalHeight = 210;
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

    private createRemovePlantModalContent(
        modalX: number,
        modalY: number,
        overlay: Phaser.GameObjects.Rectangle,
        onConfirm: () => void
    ): void {
        // Title
        const title = this.scene.add.text(modalX, modalY - 40, 'Remove Plant', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5402);
        title.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(title);
        this.modalElements.push(title);

        // Description
        const descText = this.scene.add.text(modalX + 10, modalY, 'Are you sure you want to remove this plant?', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2,
            align: 'center',
            wordWrap: { width: 200 }
        });
        descText.setOrigin(0.5);
        descText.setDepth(5402);
        descText.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(descText);
        this.modalElements.push(descText);

        // Confirm Button
        const confirmBtnBg = this.scene.add.sprite(modalX - 40, modalY + 40, 'square-buttons', 6);
        confirmBtnBg.setDisplaySize(70, 28);
        confirmBtnBg.setDepth(5402);
        confirmBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(confirmBtnBg);
        this.modalElements.push(confirmBtnBg);

        const confirmBtnText = this.scene.add.text(modalX - 40, modalY + 40, 'Confirm', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        confirmBtnText.setOrigin(0.5);
        confirmBtnText.setDepth(5403);
        confirmBtnText.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(confirmBtnText);
        this.modalElements.push(confirmBtnText);

        confirmBtnBg.on('pointerover', () => confirmBtnBg.setTint(0xcccccc));
        confirmBtnBg.on('pointerout', () => confirmBtnBg.clearTint());
        confirmBtnBg.on('pointerdown', () => {
            onConfirm();
            this.closeRemovePlantModal();
        });

        // Cancel Button
        const cancelBtnBg = this.scene.add.sprite(modalX + 40, modalY + 40, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(70, 28);
        cancelBtnBg.setDepth(5402);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cancelBtnBg);
        this.modalElements.push(cancelBtnBg);

        const cancelBtnText = this.scene.add.text(modalX + 40, modalY + 40, 'Cancel', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        cancelBtnText.setOrigin(0.5);
        cancelBtnText.setDepth(5403);
        cancelBtnText.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(cancelBtnText);
        this.modalElements.push(cancelBtnText);

        cancelBtnBg.on('pointerover', () => cancelBtnBg.setTint(0xcccccc));
        cancelBtnBg.on('pointerout', () => cancelBtnBg.clearTint());
        cancelBtnBg.on('pointerdown', () => {
            this.closeRemovePlantModal();
        });

        // Close on overlay click
        overlay.on('pointerdown', () => {
            this.closeRemovePlantModal();
        });
    }

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
        // Rely on client-side balance check instead of cached 'affordable' property
        // which might be stale if balance was updated without shop refresh
        const canAfford = userBalanceGem >= cost;

        // Title
        const title = this.scene.add.text(modalX, modalY - 75, plotItem.name, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5402);
        title.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(title);
        this.modalElements.push(title);

        // Icon (Lock Land Image)
        const iconImage = this.scene.add.image(modalX, modalY - 40, 'lock-land');
        iconImage.setOrigin(0.5);
        iconImage.setDisplaySize(48, 48); // Adjust size to fit nicely
        iconImage.setDepth(5402);
        this.scene.cameras.main.ignore(iconImage);
        this.modalElements.push(iconImage);

        // Description
        const descText = this.scene.add.text(modalX, modalY - 5, plotItem.description, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2,
            wordWrap: { width: 200 }
        });
        descText.setOrigin(0.5);
        descText.setDepth(5402);
        descText.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(descText);
        this.modalElements.push(descText);

        // Price
        const priceText = this.scene.add.text(modalX, modalY + 20, `Price: ${cost} 💎`, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        priceText.setOrigin(0.5);
        priceText.setDepth(5402);
        priceText.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(priceText);
        this.modalElements.push(priceText);

        // User balance
        const balanceText = this.scene.add.text(modalX, modalY + 40, `You have: ${userBalanceGem} 💎`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: canAfford ? '#FFFFFF' : '#ef4444',
            resolution: 2
        });
        balanceText.setOrigin(0.5);
        balanceText.setDepth(5402);
        balanceText.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(balanceText);
        this.modalElements.push(balanceText);

        // Availability status
        if (!isAvailable) {
            const statusText = this.scene.add.text(modalX, modalY + 55, 'Already Purchased', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            statusText.setOrigin(0.5);
            statusText.setDepth(5402);
            statusText.setStroke('#000000', 3);
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
        buyBtnText.setStroke('#000000', 3);
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
        cancelBtnText.setStroke('#000000', 3);
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

        // REFRESH SHOP DATA to unlock the next plot in the list
        // This is crucial if the backend only returns available items
        GameDataService.refreshGemShop().catch(err => console.error('Failed to refresh gem shop:', err));

        // 2. TRY WEBSOCKET FIRST - Buy land via WebSocket (fire-and-forget)
        const usedWebSocket = ShopService.buyLandWS();
        
        if (usedWebSocket) {
            // WebSocket sent - UI updates will come via land_update and action_success events
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
        }
    }

    // ========== Cleanup ==========

    public destroy(): void {
        this.closeBuyPlotModal();
        super.destroy();
    }
}
