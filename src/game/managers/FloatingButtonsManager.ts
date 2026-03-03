import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { RedeemCodeManager } from './RedeemCodeManager';

interface FloatingButtonsCallbacks {
    showToastMessage?: (text: string, color: number) => void;
    playSuccessSound?: () => void;
}

/**
 * Manages floating circular action buttons
 * These buttons are displayed as a horizontal row of circular icons
 * Currently includes: Redeem Code (gift box)
 * Can be extended with more buttons in the future
 */
export class FloatingButtonsManager extends BaseManager {
    private callbacks: FloatingButtonsCallbacks;
    private buttonElements: Phaser.GameObjects.GameObject[] = [];
    
    // Managers for each button action
    private redeemCodeManager: RedeemCodeManager;
    
    // Button size and spacing
    private readonly buttonSize = 36;
    private readonly buttonSpacing = 10;

    constructor(scene: Phaser.Scene, callbacks: FloatingButtonsCallbacks = {}) {
        super(scene);
        this.callbacks = callbacks;
        
        // Initialize managers
        this.redeemCodeManager = new RedeemCodeManager(scene, callbacks);
    }

    /**
     * Create floating buttons at specified position
     * Buttons are arranged horizontally from right to left
     * @param x - Right edge X position
     * @param y - Y position (center of buttons)
     */
    public createButtons(x: number, y: number): void {
        this.destroyButtonElements();

        const buttons = [
            { icon: '🎁', tooltip: 'Redeem', action: () => this.redeemCodeManager.open(), color: 0xf59e0b },
            // Future buttons can be added here:
            // { icon: '📦', tooltip: 'Inventory', action: () => {}, color: 0x3b82f6 },
            // { icon: '⚙️', tooltip: 'Settings', action: () => {}, color: 0x6b7280 },
        ];

        buttons.forEach((btn, index) => {
            const btnX = x - (index * (this.buttonSize + this.buttonSpacing));
            this.createCircularButton(btnX, y, btn.icon, btn.tooltip, btn.action, btn.color);
        });
    }

    /**
     * Create a single circular button
     */
    private createCircularButton(
        x: number, 
        y: number, 
        icon: string, 
        _tooltip: string, 
        action: () => void,
        bgColor: number
    ): void {
        // Button background circle
        const btnBg = this.scene.add.circle(x, y, this.buttonSize / 2, bgColor);
        btnBg.setDepth(5020);
        btnBg.setStrokeStyle(2, 0x5D4037);
        btnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(btnBg);
        this.buttonElements.push(btnBg);

        // Inner circle for depth effect
        const innerCircle = this.scene.add.circle(x, y, this.buttonSize / 2 - 3, this.lightenColor(bgColor, 20));
        innerCircle.setDepth(5021);
        this.scene.cameras.main.ignore(innerCircle);
        this.buttonElements.push(innerCircle);

        // Icon text
        const iconText = this.scene.add.text(x, y, icon, {
            fontSize: '16px',
            resolution: 2
        });
        iconText.setOrigin(0.5);
        iconText.setDepth(5022);
        this.scene.cameras.main.ignore(iconText);
        this.buttonElements.push(iconText);

        // Hover effects
        btnBg.on('pointerover', () => {
            btnBg.setScale(1.1);
            innerCircle.setScale(1.1);
            iconText.setScale(1.1);
        });

        btnBg.on('pointerout', () => {
            btnBg.setScale(1);
            innerCircle.setScale(1);
            iconText.setScale(1);
        });

        btnBg.on('pointerdown', () => {
            // Press effect
            btnBg.setScale(0.95);
            innerCircle.setScale(0.95);
            iconText.setScale(0.95);
            
            this.scene.time.delayedCall(100, () => {
                btnBg.setScale(1);
                innerCircle.setScale(1);
                iconText.setScale(1);
                action();
            });
        });
    }

    /**
     * Lighten a color by a percentage
     */
    private lightenColor(color: number, percent: number): number {
        const r = Math.min(255, ((color >> 16) & 0xFF) + Math.floor(255 * percent / 100));
        const g = Math.min(255, ((color >> 8) & 0xFF) + Math.floor(255 * percent / 100));
        const b = Math.min(255, (color & 0xFF) + Math.floor(255 * percent / 100));
        return (r << 16) | (g << 8) | b;
    }

    /**
     * Get button elements for camera ignore
     */
    public getButtonElements(): Phaser.GameObjects.GameObject[] {
        return this.buttonElements;
    }

    /**
     * Destroy button elements
     */
    private destroyButtonElements(): void {
        this.buttonElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.buttonElements = [];
    }

    /**
     * Open redeem modal (for external calls)
     */
    public openRedeemModal(): void {
        this.redeemCodeManager.open();
    }

    /**
     * Close redeem modal (for external calls)
     */
    public closeRedeemModal(): void {
        this.redeemCodeManager.close();
    }

    /**
     * Destroy manager and cleanup
     */
    public destroy(): void {
        this.redeemCodeManager.destroy();
        this.destroyButtonElements();
        super.destroy();
    }
}
