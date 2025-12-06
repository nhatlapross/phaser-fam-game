import Phaser from 'phaser';
import { BaseManager } from './BaseManager';

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

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 220;
        const modalHeight = 160;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Cost calculation: (plotIndex + 1) * 100 gems
        const cost = (plotIndex + 1) * 100;

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
            this.createModalContent(modalX, modalY, plotIndex, cost, tileX, tileY, overlay);
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
        cost: number,
        tileX: number,
        tileY: number,
        overlay: Phaser.GameObjects.Rectangle
    ): void {
        const playerGems = this.callbacks.getPlayerGems();
        const hasEnough = playerGems >= cost;

        // Title
        const title = this.scene.add.text(modalX, modalY - 50, 'Buy Plot', {
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

        // Plot number
        const plotText = this.scene.add.text(modalX, modalY - 25, `Plot #${plotIndex + 1}`, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        plotText.setOrigin(0.5);
        plotText.setDepth(5402);
        this.scene.cameras.main.ignore(plotText);
        this.modalElements.push(plotText);

        // Cost
        const costText = this.scene.add.text(modalX, modalY, `Price: ${cost} gem`, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        costText.setOrigin(0.5);
        costText.setDepth(5402);
        this.scene.cameras.main.ignore(costText);
        this.modalElements.push(costText);

        // Current gems
        const gemsText = this.scene.add.text(modalX, modalY + 20, `You have: ${playerGems} gem`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: hasEnough ? '#4ade80' : '#ef4444',
            resolution: 2
        });
        gemsText.setOrigin(0.5);
        gemsText.setDepth(5402);
        this.scene.cameras.main.ignore(gemsText);
        this.modalElements.push(gemsText);

        // Buy button
        const buyBtnBg = this.scene.add.sprite(modalX - 40, modalY + 50, 'square-buttons', hasEnough ? 6 : 7);
        buyBtnBg.setDisplaySize(70, 28);
        buyBtnBg.setDepth(5402);
        buyBtnBg.setInteractive({ useHandCursor: hasEnough });
        this.scene.cameras.main.ignore(buyBtnBg);
        this.modalElements.push(buyBtnBg);

        const buyBtnText = this.scene.add.text(modalX - 40, modalY + 50, 'Buy', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: hasEnough ? '#FFFFFF' : '#999999',
            resolution: 2
        });
        buyBtnText.setOrigin(0.5);
        buyBtnText.setDepth(5403);
        this.scene.cameras.main.ignore(buyBtnText);
        this.modalElements.push(buyBtnText);

        if (hasEnough) {
            buyBtnBg.on('pointerover', () => buyBtnBg.setTint(0xcccccc));
            buyBtnBg.on('pointerout', () => buyBtnBg.clearTint());
            buyBtnBg.on('pointerdown', () => {
                this.purchasePlot(tileX, tileY, plotIndex, cost);
            });
        }

        // Cancel button
        const cancelBtnBg = this.scene.add.sprite(modalX + 40, modalY + 50, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(70, 28);
        cancelBtnBg.setDepth(5402);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cancelBtnBg);
        this.modalElements.push(cancelBtnBg);

        const cancelBtnText = this.scene.add.text(modalX + 40, modalY + 50, 'Cancel', {
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

    private purchasePlot(tileX: number, tileY: number, plotIndex: number, cost: number): void {
        const playerGems = this.callbacks.getPlayerGems();
        const ownedPlotsCount = this.callbacks.getOwnedPlotsCount();

        // Deduct gems
        this.callbacks.setPlayerGems(playerGems - cost);
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

        // Update UI (refresh profile to show updated gems)
        this.callbacks.refreshProfileUI();

        // Close modal
        this.closeBuyPlotModal();

        // Show success message
        this.callbacks.showFloatingMessage('Plot purchased!', tileX, tileY);

        console.log('Purchased plot', plotIndex + 1, '- Gems left:', this.callbacks.getPlayerGems());
    }

    // ========== Cleanup ==========

    public destroy(): void {
        this.closeBuyPlotModal();
        super.destroy();
    }
}
