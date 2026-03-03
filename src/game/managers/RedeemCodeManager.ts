import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { RedeemService } from '../RedeemService';
import { GameDataService } from '../GameDataService';
import { useGameState } from '../hooks/useGameState';

interface RedeemCodeCallbacks {
    showToastMessage?: (text: string, color: number) => void;
    playSuccessSound?: () => void;
}

/**
 * Manages the redeem code modal
 * Extracted from MailboxManager for reuse in QuickActionsManager
 */
export class RedeemCodeManager extends BaseManager {
    private callbacks: RedeemCodeCallbacks;
    private redeemInput: HTMLInputElement | null = null;
    private redeemResultElements: Phaser.GameObjects.GameObject[] = [];
    private shouldCloseModal: boolean = false;
    private qrScannerContainer: HTMLDivElement | null = null;
    private resultModalDelayedCall: Phaser.Time.TimerEvent | null = null;
    private resizeListener: (() => void) | null = null;
    private redeemInputGameCoordinates: { x: number, y: number, width: number, height: number } | null = null;

    constructor(scene: Phaser.Scene, callbacks: RedeemCodeCallbacks = {}) {
        super(scene);
        this.callbacks = callbacks;
    }

    private isPortraitMode(): boolean {
        return window.innerHeight > window.innerWidth;
    }

    private updateInputPosition(): void {
        if (!this.redeemInput || !this.redeemInputGameCoordinates) return;

        const gameWidth = this.scene.scale.width;
        const gameHeight = this.scene.scale.height;
        
        // Target dimensions in game units
        const inputWidthGame = this.redeemInputGameCoordinates.width;
        const inputHeightGame = this.redeemInputGameCoordinates.height;
        
        // Input center in game coordinates
        const inputCenterX = this.redeemInputGameCoordinates.x;
        const inputCenterY = this.redeemInputGameCoordinates.y;

        const isPortrait = this.isPortraitMode();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (isPortrait) {
            // In portrait mode, the game is rotated 90deg clockwise via CSS
            // Game X -> Screen Y, Game Y -> Screen X (inverted)
            const scaleX = viewportHeight / gameWidth;
            const scaleY = viewportWidth / gameHeight;

            // Transform game coordinates to screen coordinates
            // For rotated view:
            // Screen X corresponds to Game Y (inverted)
            // Screen Y corresponds to Game X
            const screenX = viewportWidth - (inputCenterY / gameHeight) * viewportWidth;
            const screenY = (inputCenterX / gameWidth) * viewportHeight;

            const screenWidth = inputWidthGame * scaleX;
            const screenHeight = inputHeightGame * scaleY;

            this.redeemInput.style.cssText = `
                position: fixed;
                left: ${screenX}px;
                top: ${screenY}px;
                width: ${screenWidth}px;
                height: ${screenHeight}px;
                transform: translate(-50%, -50%) rotate(90deg);
                padding: 4px 8px;
                font-size: ${12 * Math.min(scaleX, scaleY)}px;
                font-family: 'Arial', sans-serif;
                border: 2px solid #5D4037;
                border-radius: 5px;
                background-color: #FFF8E1;
                color: #5D4037;
                outline: none;
                text-align: center;
                z-index: 10001;
                box-sizing: border-box;
            `;
        } else {
            // Landscape
            const scaleX = viewportWidth / gameWidth;
            const scaleY = viewportHeight / gameHeight;

            const screenX = inputCenterX * scaleX;
            const screenY = inputCenterY * scaleY;

            const screenWidth = inputWidthGame * scaleX;
            const screenHeight = inputHeightGame * scaleY;

            this.redeemInput.style.cssText = `
                position: fixed;
                left: ${screenX}px;
                top: ${screenY}px;
                width: ${screenWidth}px;
                height: ${screenHeight}px;
                transform: translate(-50%, -50%);
                padding: 4px 8px;
                font-size: ${12 * Math.min(scaleX, scaleY)}px;
                font-family: 'Arial', sans-serif;
                border: 2px solid #5D4037;
                border-radius: 5px;
                background-color: #FFF8E1;
                color: #5D4037;
                outline: none;
                text-align: center;
                z-index: 10001;
                box-sizing: border-box;
            `;
        }
    }

    /**
     * Open the redeem code modal
     */
    public open(): void {
        if (this.isOpen) return;
        this.isOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = Math.min(280, screenWidth * 0.85);
        const modalHeight = Math.min(200, screenHeight * 0.5);
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.6);
        overlay.setDepth(5300);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.addElement(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5301);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.addElement(modalBg);

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
            this.createModalContent(modalX, modalY, modalWidth, modalHeight);
        });

        overlay.on('pointerdown', () => this.close());
    }

    /**
     * Close the redeem code modal
     */
    public close(): void {
        this.isOpen = false;
        this.cleanupRedeemInput();
        this.closeQRScanner();
        this.destroyElements();
    }

    private cleanupRedeemInput(): void {
        if (this.redeemInput && this.redeemInput.parentNode) {
            this.redeemInput.parentNode.removeChild(this.redeemInput);
        }
        this.redeemInput = null;
        this.redeemInputGameCoordinates = null;

        if (this.resizeListener) {
            window.removeEventListener('resize', this.resizeListener);
            this.resizeListener = null;
        }
        
        // Re-enable keyboard input
        if (this.scene.input.keyboard) {
            this.scene.input.keyboard.enabled = true;
        }
    }

    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        const contentY = modalY;

        // Title
        const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 35, '🎁 Redeem Code', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5302);
        title.setStroke('#5D4037', 2);
        title.setAlpha(0);
        this.scene.cameras.main.ignore(title);
        this.addElement(title);
        this.scene.tweens.add({ targets: title, alpha: 1, duration: 150 });

        // Label
        const codeLabel = this.scene.add.text(modalX, contentY - 35, 'Enter Redeem Code:', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        codeLabel.setOrigin(0.5);
        codeLabel.setDepth(5302);
        codeLabel.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(codeLabel);
        this.addElement(codeLabel);

        // HTML input
        this.redeemInput = document.createElement('input');
        this.redeemInput.type = 'text';
        this.redeemInput.placeholder = 'Enter code here...';
        this.redeemInput.maxLength = 150;

        // Calculate dynamic layout
        const margin = 25;
        const qrSize = 36;
        const gap = 2;
        const inputHeight = 28;
        
        // Calculate input width to fill available space
        const contentWidth = modalWidth - (margin * 2);
        const inputWidth = contentWidth - qrSize - gap - 10;
        
        // Calculate center positions
        const startX = modalX - (modalWidth / 2) + margin + 15;
        const inputCenterX = startX + (inputWidth / 2);
        const qrCenterX = startX + inputWidth + gap + (qrSize / 2);

        // Store game coordinates for resize updates
        this.redeemInputGameCoordinates = {
            x: inputCenterX,
            y: contentY - 5,
            width: inputWidth,
            height: inputHeight
        };

        this.redeemInput.style.cssText = `
            position: fixed;
            padding: 5px 8px;
            font-size: 10px;
            font-family: 'Arial', sans-serif;
            border: 2px solid #5D4037;
            border-radius: 5px;
            background-color: #FFF8E1;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
            box-sizing: border-box;
        `;

        // Add resize listener
        if (!this.resizeListener) {
            this.resizeListener = () => this.updateInputPosition();
            window.addEventListener('resize', this.resizeListener);
        }

        this.updateInputPosition();
        document.body.appendChild(this.redeemInput);

        // QR button
        const qrBtnX = qrCenterX;
        const qrBtnY = contentY - 5;
        const qrBtnBg = this.scene.add.sprite(qrBtnX, qrBtnY, 'square-buttons', 6);
        qrBtnBg.setDisplaySize(36, 28);
        qrBtnBg.setDepth(5302);
        qrBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(qrBtnBg);
        this.addElement(qrBtnBg);

        const qrText = this.scene.add.text(qrBtnX, qrBtnY, 'QR', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        qrText.setOrigin(0.5);
        qrText.setDepth(5303);
        qrText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(qrText);
        this.addElement(qrText);

        qrBtnBg.on('pointerdown', () => this.openQRScanner());
        qrBtnBg.on('pointerover', () => qrBtnBg.setTint(0xcccccc));
        qrBtnBg.on('pointerout', () => qrBtnBg.clearTint());

        // Redeem button
        const redeemBtnWidth = Math.min(145, modalWidth * 0.5);
        const redeemBtnBg = this.scene.add.sprite(modalX, contentY + 45, 'square-buttons', 6);
        redeemBtnBg.setDisplaySize(redeemBtnWidth, 30);
        redeemBtnBg.setDepth(5302);
        redeemBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(redeemBtnBg);
        this.addElement(redeemBtnBg);

        const redeemBtnText = this.scene.add.text(modalX, contentY + 45, 'Redeem', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        redeemBtnText.setOrigin(0.5);
        redeemBtnText.setDepth(5303);
        redeemBtnText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(redeemBtnText);
        this.addElement(redeemBtnText);

        redeemBtnBg.on('pointerdown', () => {
            const code = this.redeemInput?.value.trim();
            if (code) {
                this.processRedeemCode(code);
                if (this.redeemInput) this.redeemInput.value = '';
            }
        });
        redeemBtnBg.on('pointerover', () => redeemBtnBg.setTint(0xcccccc));
        redeemBtnBg.on('pointerout', () => redeemBtnBg.clearTint());

        // Input event listeners
        if (this.redeemInput) {
            this.redeemInput.addEventListener('keydown', (e) => e.stopPropagation());
            this.redeemInput.addEventListener('keyup', (e) => e.stopPropagation());
            this.redeemInput.addEventListener('keypress', (e) => e.stopPropagation());

            this.redeemInput.addEventListener('focus', () => {
                if (this.scene.input.keyboard) {
                    this.scene.input.keyboard.enabled = false;
                }
                redeemBtnBg.setInteractive(false);
                redeemBtnBg.setTint(0xcccccc);
            });

            this.redeemInput.addEventListener('blur', () => {
                if (this.scene.input.keyboard) {
                    this.scene.input.keyboard.enabled = true;
                }
                redeemBtnBg.setInteractive({ useHandCursor: true });
                redeemBtnBg.clearTint();
            });

            this.redeemInput.focus();
        }

        // Close button
        const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setAlpha(0);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'X', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5303);
        closeText.setStroke('#5D4037', 1);
        closeText.setAlpha(0);
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
    }

    private async processRedeemCode(code: string): Promise<void> {
        this.showRedeemResultModal(true, 'Validating code...', undefined, true);

        try {
            // Use redemption/claim API
            const result = await RedeemService.claimRedemptionCode(code);
            this.handleRedeemResult(result);
        } catch {
            this.showRedeemResultModal(false, 'Error validating code. Please try again.');
        }
    }

    private handleRedeemResult(result: any): void {
        if (result.success && result.reward) {
            let itemType = result.reward.itemType || result.reward.type;
            if (!itemType && result.type === 'GOLD') {
                itemType = 'GOLD';
            }

            let rewardMessage = '';
            if (result.event) {
                rewardMessage += `Event: ${result.event.name}\n`;
            }
            if (result.reward.message) {
                rewardMessage += result.reward.message + '\n';
            }
            rewardMessage += `Reward: ${itemType}\nAmount: ${result.reward.amount || 1}`;

            this.callbacks.playSuccessSound?.();
            
            // Optimistic update to prevent lag and ensure immediate feedback
            const cachedData = GameDataService.getCachedData();
            if (cachedData && cachedData.user && result.reward) {
                const amount = parseInt(String(result.reward.amount || 1), 10);

                if (itemType === 'GOLD') {
                    const currentGold = parseInt(String(cachedData.user.balanceGold || 0), 10);
                    const currentGem = parseInt(String(cachedData.user.balanceGem || 0), 10);
                    
                    // Update GameState directly for immediate UI feedback BEFORE notifying UI listeners
                    useGameState(this.scene).setCurrency(currentGold + amount, currentGem);
                    
                    // Update cache and notify listeners
                    GameDataService.updateCurrency(currentGold + amount, currentGem);
                } else if (itemType === 'GEM') {
                    const currentGold = parseInt(String(cachedData.user.balanceGold || 0), 10);
                    const currentGem = parseInt(String(cachedData.user.balanceGem || 0), 10);
                    
                    // Update GameState directly for immediate UI feedback BEFORE notifying UI listeners
                    useGameState(this.scene).setCurrency(currentGold, currentGem + amount);
                    
                    // Update cache and notify listeners
                    GameDataService.updateCurrency(currentGold, currentGem + amount);
                } else if (['ALGAE', 'MUSHROOM', 'TREE'].includes(itemType)) {
                    GameDataService.updateSeed(itemType, amount);
                } else if (itemType.startsWith('FERTILIZER_')) {
                    GameDataService.updateFertilizer(itemType, amount);
                } else {
                    // Fallback for unknown items
                    GameDataService.refreshAndUpdateUI();
                }
            } else {
                GameDataService.refreshAndUpdateUI();
            }

            this.showRedeemResultModal(true, rewardMessage, undefined, false, true);

            this.scene.time.delayedCall(3000, () => {
                this.closeRedeemResultModal();
                this.close();
            });
        } else {
            this.showRedeemResultModal(false, result.message || 'Invalid or expired code');
        }
    }

    private showRedeemResultModal(success: boolean, message: string, _icon?: string, isLoading: boolean = false, shouldClose: boolean = false): void {
        this.shouldCloseModal = shouldClose;
        this.closeRedeemResultModal();

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 180;
        const modalHeight = 140;

        if (this.redeemInput) {
            this.redeemInput.style.display = 'none';
        }

        this.elements.forEach(el => {
            if (el && 'setVisible' in el) {
                (el as Phaser.GameObjects.Sprite).setVisible(false);
            }
        });

        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.5);
        overlay.setDepth(5500);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.redeemResultElements.push(overlay);

        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5501);
        this.scene.cameras.main.ignore(modalBg);
        this.redeemResultElements.push(modalBg);

        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Cancel any pending delayed call from previous modal
        if (this.resultModalDelayedCall) {
            this.resultModalDelayedCall.destroy();
            this.resultModalDelayedCall = null;
        }

        this.resultModalDelayedCall = this.scene.time.delayedCall(100, () => {
            this.resultModalDelayedCall = null;
            const titleText = isLoading ? 'Loading...' : (success ? 'Success!' : 'Failed');
            const strokeColor = isLoading ? '#4a90e2' : (success ? '#2d7a3d' : '#8b1a1a');

            const title = this.scene.add.text(modalX, modalY - 45, titleText, {
                fontSize: '14px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            title.setOrigin(0.5);
            title.setDepth(5502);
            title.setStroke(strokeColor, 3);
            this.scene.cameras.main.ignore(title);
            this.redeemResultElements.push(title);

            if (isLoading) {
                const spinner = this.scene.add.graphics();
                spinner.setPosition(modalX, modalY - 5);
                spinner.lineStyle(2, 0x4a90e2, 1);
                spinner.beginPath();
                spinner.arc(0, 0, 15, Phaser.Math.DegToRad(0), Phaser.Math.DegToRad(270), false);
                spinner.strokePath();
                spinner.setDepth(5502);
                this.scene.cameras.main.ignore(spinner);
                this.redeemResultElements.push(spinner);
                this.scene.tweens.add({ targets: spinner, angle: 360, duration: 1000, repeat: -1, ease: 'Linear' });
            } else if (!success) {
                const failIcon = this.scene.add.text(modalX, modalY - 5, '✗', {
                    fontSize: '32px',
                    fontFamily: 'PixelFont',
                    color: '#ef4444',
                    resolution: 2
                });
                failIcon.setOrigin(0.5);
                failIcon.setDepth(5502);
                this.scene.cameras.main.ignore(failIcon);
                this.redeemResultElements.push(failIcon);
            }

            const msgText = this.scene.add.text(modalX + 10, modalY + 30, message, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2,
                align: 'center',
                wordWrap: { width: 160 }
            });
            msgText.setOrigin(0.5);
            msgText.setDepth(5502);
            msgText.setStroke('#5D4037', 2);
            this.scene.cameras.main.ignore(msgText);
            this.redeemResultElements.push(msgText);

            const okBtnBg = this.scene.add.sprite(modalX, modalY + 55, 'square-buttons', 6);
            okBtnBg.setDisplaySize(70, 28);
            okBtnBg.setDepth(5502);
            okBtnBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(okBtnBg);
            this.redeemResultElements.push(okBtnBg);

            const okText = this.scene.add.text(modalX, modalY + 55, 'OK', {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            okText.setOrigin(0.5);
            okText.setDepth(5503);
            okText.setStroke('#5D4037', 2);
            this.scene.cameras.main.ignore(okText);
            this.redeemResultElements.push(okText);

            okBtnBg.on('pointerdown', () => this.closeRedeemResultModal());
            okBtnBg.on('pointerover', () => okBtnBg.setTint(0xcccccc));
            okBtnBg.on('pointerout', () => okBtnBg.clearTint());
        });

        overlay.on('pointerdown', () => this.closeRedeemResultModal());
    }

    private closeRedeemResultModal(): void {
        // Cancel any pending delayed call
        if (this.resultModalDelayedCall) {
            this.resultModalDelayedCall.destroy();
            this.resultModalDelayedCall = null;
        }

        // Stop all tweens on result elements before destroying
        this.redeemResultElements.forEach(el => {
            if (el) {
                this.scene.tweens.killTweensOf(el);
                if (el.destroy) el.destroy();
            }
        });
        this.redeemResultElements = [];

        if (!this.shouldCloseModal) {
            this.elements.forEach(el => {
                if (el && 'setVisible' in el) {
                    (el as Phaser.GameObjects.Sprite).setVisible(true);
                }
            });
            if (this.redeemInput) {
                this.redeemInput.style.display = 'block';
                this.redeemInput.value = '';
            }
        }
        this.shouldCloseModal = false;
    }

    private openQRScanner(): void {
        if (this.qrScannerContainer) return;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        // Hide redeem input while scanning
        if (this.redeemInput) {
            this.redeemInput.style.display = 'none';
        }

        // Create scanner container
        this.qrScannerContainer = document.createElement('div');
        this.qrScannerContainer.id = 'qr-scanner-container';
        
        const canvas = this.scene.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / screenWidth;
        const scaleY = canvasRect.height / screenHeight;
        
        const scannerWidth = Math.min(250, screenWidth * 0.8) * scaleX;
        const scannerHeight = Math.min(300, screenHeight * 0.6) * scaleY;
        
        this.qrScannerContainer.style.cssText = `
            position: fixed;
            left: ${canvasRect.left + (screenWidth * scaleX - scannerWidth) / 2}px;
            top: ${canvasRect.top + (screenHeight * scaleY - scannerHeight) / 2}px;
            width: ${scannerWidth}px;
            height: ${scannerHeight}px;
            background: #1a1a2e;
            border: 3px solid #5D4037;
            border-radius: 10px;
            z-index: 10002;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px;
            box-sizing: border-box;
        `;

        // Title
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = `
            color: white;
            font-family: 'PixelFont', monospace;
            font-size: 14px;
            margin-bottom: 10px;
            text-align: center;
        `;
        titleDiv.textContent = '📷 Scan QR Code';
        this.qrScannerContainer.appendChild(titleDiv);

        // Video container
        const videoContainer = document.createElement('div');
        videoContainer.id = 'qr-reader';
        videoContainer.style.cssText = `
            width: 100%;
            flex: 1;
            background: #000;
            border-radius: 5px;
            overflow: hidden;
        `;
        this.qrScannerContainer.appendChild(videoContainer);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `
            margin-top: 10px;
            padding: 8px 20px;
            font-family: 'PixelFont', monospace;
            font-size: 12px;
            background: #5D4037;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        `;
        closeBtn.onclick = () => this.closeQRScanner();
        this.qrScannerContainer.appendChild(closeBtn);

        document.body.appendChild(this.qrScannerContainer);

        // Initialize QR scanner
        this.initQRScanner();
    }

    private async initQRScanner(): Promise<void> {
        try {
            const { Html5Qrcode } = await import('html5-qrcode');
            const html5QrCode = new Html5Qrcode('qr-reader');
            
            await html5QrCode.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 200, height: 200 }
                },
                (decodedText) => {
                    html5QrCode.stop().then(() => {
                        this.handleQRResult(decodedText);
                        this.closeQRScanner();
                    });
                },
                () => {}
            );
        } catch (err) {
            console.error('QR Scanner error:', err);
            this.callbacks.showToastMessage?.('Camera access denied', 0xef4444);
            this.closeQRScanner();
        }
    }

    private handleQRResult(decodedText: string): void {
        try {
            const qrData = JSON.parse(decodedText);
            if (qrData.eventId && qrData.verificationCode) {
                this.callbacks.showToastMessage?.('QR Code scanned! Redeeming...', 0x4ade80);
                this.processRedeemCodeWithEventId(qrData.verificationCode, qrData.eventId);
            } else {
                this.callbacks.showToastMessage?.('Invalid QR code format', 0xef4444);
            }
        } catch {
            if (this.redeemInput) {
                this.redeemInput.value = decodedText;
            }
            this.callbacks.showToastMessage?.('QR Code scanned!', 0x4ade80);
        }
    }

    private async processRedeemCodeWithEventId(code: string, _eventId: string): Promise<void> {
        this.showRedeemResultModal(true, 'Validating code...', undefined, true);

        try {
            // Use redemption/claim API (eventId not needed for this API)
            const result = await RedeemService.claimRedemptionCode(code);
            this.handleRedeemResult(result);
        } catch {
            this.showRedeemResultModal(false, 'Error validating code. Please try again.');
        }
    }

    private closeQRScanner(): void {
        if (this.qrScannerContainer && this.qrScannerContainer.parentNode) {
            this.qrScannerContainer.parentNode.removeChild(this.qrScannerContainer);
        }
        this.qrScannerContainer = null;

        if (this.redeemInput) {
            this.redeemInput.style.display = 'block';
        }
    }

    public destroy(): void {
        this.cleanupRedeemInput();
        this.closeQRScanner();
        this.redeemResultElements.forEach(el => { if (el && el.destroy) el.destroy(); });
        super.destroy();
    }
}