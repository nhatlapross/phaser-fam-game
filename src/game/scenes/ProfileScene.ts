import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { UserService } from '../UserService';
import { GameDataService } from '../GameDataService';
import { BadgeService, AVAILABLE_BADGES, Badge } from '../BadgeService';
import { PLAYABLE_CHARACTERS } from '../config/CharacterConfig';

/**
 * Profile Scene - Main profile screen with navigation options
 * Shows user info, badges with unlock buttons, and navigation to Garden/TownSquare
 */
export class ProfileScene extends Scene {
    private isNewUser: boolean = false;
    private characterSprite!: Phaser.GameObjects.Sprite;
    private badgeElements: Phaser.GameObjects.GameObject[] = [];
    private claimFormElements: Phaser.GameObjects.GameObject[] = [];
    private claimFormOpen: boolean = false;
    private codeInput: HTMLInputElement | null = null;
    private qrScannerContainer: HTMLDivElement | null = null;
    private currentBadge: Badge | null = null;

    constructor() {
        super('ProfileScene');
    }

    init(data?: { isNewUser?: boolean }) {
        this.isNewUser = data?.isNewUser || false;
    }

    create() {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        // Background
        const bg = this.add.image(centerX, centerY, 'start-background');
        bg.setDisplaySize(this.scale.width, this.scale.height);

        // Semi-transparent overlay
        const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.4);

        // Main panel
        this.createMainPanel(centerX, centerY);

        // Fade in
        this.cameras.main.fadeIn(500);

        EventBus.emit('current-scene-ready', this);
    }

    private createMainPanel(centerX: number, centerY: number) {
        const panelWidth = 320;
        const panelHeight = 450;

        // Panel background
        const panelBg = this.add.sprite(centerX, centerY, 'settings-panel', 1);
        panelBg.setDisplaySize(panelWidth, panelHeight);

        // Get user data
        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();

        if (!user) {
            this.scene.start('Login');
            return;
        }

        const panelTop = centerY - panelHeight / 2;

        // Title
        const title = this.add.text(centerX, panelTop + 60, 'Profile', {
            fontSize: '18px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setStroke('#5D4037', 3);

        // Character preview + name + wallets
        this.createCharacterSection(centerX, panelTop + 120, panelWidth, user);

        // Badges section (list format with unlock buttons) - only for NEW users
        if (this.isNewUser) {
            this.createBadgesSection(centerX, panelTop + 260, panelWidth);
        }

        // Navigation buttons
        this.createNavigationButtons(centerX + 15, panelTop + 390);

        // Logout button (small, top right)
        this.createLogoutButton(centerX + panelWidth / 2 - 30, panelTop + 60);
    }

    private createCharacterSection(centerX: number, y: number, panelWidth: number, user: any) {
        // Character frame
        const frame = this.add.sprite(centerX, y, 'square-buttons', 6);
        frame.setDisplaySize(70, 70);
        frame.setTint(0x5D4037);

        // Get character type from user data (1-5, maps to index 0-4)
        const characterType = user?.characterType || 1;
        const characterIndex = Math.max(0, Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1));
        const characterKey = PLAYABLE_CHARACTERS[characterIndex]?.key || 'bear';

        // Character sprite
        this.characterSprite = this.add.sprite(centerX, y, characterKey, 0);
        this.characterSprite.setScale(3);

        // Idle animation for the selected character
        const animKey = `profile-${characterKey}-idle`;
        if (!this.anims.exists(animKey)) {
            this.anims.create({
                key: animKey,
                frames: this.anims.generateFrameNumbers(characterKey, { start: 0, end: 3 }),
                frameRate: 6,
                repeat: -1
            });
        }
        this.characterSprite.play(animKey);

        // Username below character
        const nameText = this.add.text(centerX, y + 48, user.username || 'Farmer', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        nameText.setOrigin(0.5);
        nameText.setStroke('#5D4037', 2);

        // Multichain wallets section
        const walletsStartY = y + 68;
        this.createWalletsSection(centerX, walletsStartY, panelWidth, user);
    }

    private createWalletsSection(centerX: number, startY: number, panelWidth: number, user: any) {
        const leftX = centerX - panelWidth / 2 + 55;
        const lineHeight = 18;

        // Mock addresses for demo - will be replaced with real data from API
        const mockAptosAddress = '0x' + user.address.slice(2, 10) + '...' + 'aptos' + user.address.slice(-8);
        const mockSuiAddress = '0x' + user.address.slice(2, 10) + '...' + 'sui' + user.address.slice(-10);
        const mockCardanoAddress = 'addr1' + user.address.slice(2, 12) + '...' + user.address.slice(-12);

        // Wallet chains config (no icons, cleaner look)
        const wallets = [
            { chain: 'EVM', address: user.address, color: '#5D4037' },
            { chain: 'Aptos', address: mockAptosAddress, color: '#5D4037' },
            { chain: 'Sui', address: mockSuiAddress, color: '#5D4037' },
            { chain: 'Cardano', address: mockCardanoAddress, color: '#5D4037' }
        ];

        wallets.forEach((wallet, index) => {
            const y = startY + index * lineHeight;

            // Chain name (left) - no icon
            const chainLabel = this.add.text(leftX, y, `${wallet.chain}:`, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: wallet.color,
                resolution: 2
            });

            if (wallet.address) {
                // Shortened address (center) - darker color for better visibility
                const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
                const addrText = this.add.text(leftX + 70, y, shortAddr, {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#3E2723',
                    resolution: 2
                });

                // Copy button (right)
                const copyBtn = this.add.text(leftX + 190, y, 'Copy', {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: '#4ade80',
                    resolution: 2
                });
                copyBtn.setInteractive({ useHandCursor: true });
                copyBtn.on('pointerdown', async () => {
                    try {
                        await navigator.clipboard.writeText(wallet.address!);
                        copyBtn.setText('Copied!');
                        copyBtn.setColor('#86efac');
                        this.time.delayedCall(1500, () => {
                            copyBtn.setText('Copy');
                            copyBtn.setColor('#4ade80');
                        });
                    } catch {
                        console.log('Copy failed');
                    }
                });
                copyBtn.on('pointerover', () => copyBtn.setColor('#86efac'));
                copyBtn.on('pointerout', () => {
                    if (copyBtn.text === 'Copy') copyBtn.setColor('#4ade80');
                });
            } else {
                // Not connected
                const notConnected = this.add.text(leftX + 70, y, 'Not connected', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#6b7280',
                    resolution: 2
                });
            }
        });
    }

    private createBadgesSection(centerX: number, startY: number, panelWidth: number) {
        const leftX = centerX - panelWidth / 2 + 55;
        const rowHeight = 38;
        
        // Get only claimable badges for the list
        const claimableBadges = BadgeService.getClaimableBadges();

        claimableBadges.forEach((badge, index) => {
            const y = startY + index * rowHeight;
            this.createBadgeRow(leftX, y, panelWidth - 90, badge, index);
        });
    }

    private createBadgeRow(leftX: number, y: number, width: number, badge: Badge, index: number) {
        const isClaimed = BadgeService.isBadgeClaimed(badge.id);

        // Row background
        const rowBg = this.add.rectangle(
            leftX + width / 2,
            y + 15,
            width,
            34,
            isClaimed ? 0x2d5a3d : 0x3E2723,
            0.7
        );
        rowBg.setStrokeStyle(1, isClaimed ? 0x4ade80 : 0x5D4037);
        this.badgeElements.push(rowBg);

        // Badge icon
        const icon = this.add.text(leftX + 20, y + 15, badge.icon, {
            fontSize: '18px',
            resolution: 2
        });
        icon.setOrigin(0.5);
        icon.setAlpha(isClaimed ? 1 : 0.5);
        this.badgeElements.push(icon);

        // Badge name
        const name = this.add.text(leftX + 45, y + 8, badge.name, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: isClaimed ? '#4ade80' : '#FFFFFF',
            resolution: 2
        });
        name.setStroke('#5D4037', 1);
        this.badgeElements.push(name);

        // Badge description/requirement
        const desc = this.add.text(leftX + 45, y + 22, badge.requirement, {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        this.badgeElements.push(desc);

        // Unlock button or Claimed status
        const btnX = leftX + width - 35;

        if (isClaimed) {
            const claimedText = this.add.text(btnX, y + 15, '✓ Claimed', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#4ade80',
                resolution: 2
            });
            claimedText.setOrigin(0.5);
            this.badgeElements.push(claimedText);
        } else {
            // Unlock button
            const unlockBtnBg = this.add.sprite(btnX, y + 15, 'square-buttons', 6);
            unlockBtnBg.setDisplaySize(55, 24);
            unlockBtnBg.setTint(0x4ade80);
            unlockBtnBg.setInteractive({ useHandCursor: true });
            this.badgeElements.push(unlockBtnBg);

            const unlockText = this.add.text(btnX, y + 15, 'Unlock', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            unlockText.setOrigin(0.5);
            unlockText.setStroke('#166534', 1);
            this.badgeElements.push(unlockText);

            unlockBtnBg.on('pointerdown', () => this.openClaimForm(badge));
            unlockBtnBg.on('pointerover', () => unlockBtnBg.setTint(0x86efac));
            unlockBtnBg.on('pointerout', () => unlockBtnBg.setTint(0x4ade80));
        }

        // Animate row entrance
        [rowBg, icon, name, desc].forEach(el => {
            (el as any).setAlpha(0);
            this.tweens.add({
                targets: el,
                alpha: (el === icon && !isClaimed) ? 0.5 : ((el as any).alpha !== undefined ? 1 : 0.7),
                duration: 200,
                delay: 100 + index * 50
            });
        });
    }

    private openClaimForm(badge: Badge) {
        if (this.claimFormOpen) return;
        this.claimFormOpen = true;

        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const formWidth = 260;
        const formHeight = 160;

        // Overlay
        const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.8);
        overlay.setDepth(100);
        overlay.setInteractive();
        this.claimFormElements.push(overlay);

        // Form background
        const formBg = this.add.sprite(centerX, centerY, 'settings-panel', 1);
        formBg.setDisplaySize(formWidth, formHeight);
        formBg.setDepth(101);
        formBg.setInteractive();
        formBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.claimFormElements.push(formBg);

        formBg.setScale(0);
        this.tweens.add({
            targets: formBg,
            scaleX: formWidth / 125,
            scaleY: formHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        const title = this.add.text(centerX, centerY - formHeight / 2 + 28, `🔓 ${badge.name}`, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(102);
        title.setStroke('#5D4037', 2);
        this.claimFormElements.push(title);

        // Instructions
        const instructions = this.add.text(centerX, centerY - 20, 'Enter code or scan QR:', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        instructions.setOrigin(0.5);
        instructions.setDepth(102);
        this.claimFormElements.push(instructions);

        // Create input after animation
        this.time.delayedCall(150, () => {
            this.createCodeInput(centerX, centerY, badge);
        });

        overlay.on('pointerdown', () => this.closeClaimForm());
    }

    private createCodeInput(centerX: number, centerY: number, badge: Badge) {
        this.currentBadge = badge;
        
        // HTML input
        this.codeInput = document.createElement('input');
        this.codeInput.type = 'text';
        this.codeInput.placeholder = 'Enter code...';
        this.codeInput.maxLength = 20;
        this.codeInput.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-60%, 0);
            width: 140px;
            padding: 8px 12px;
            font-size: 14px;
            font-family: 'PixelFont', monospace;
            border: 3px solid #5D4037;
            border-radius: 8px;
            background-color: #FFF8E1;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
            text-transform: uppercase;
        `;
        document.body.appendChild(this.codeInput);

        this.codeInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                await this.submitClaimCode(badge);
                e.preventDefault();
            } else if (e.key === 'Escape') {
                this.closeClaimForm();
                e.preventDefault();
            }
            e.stopPropagation();
        });
        this.codeInput.addEventListener('keyup', (e) => e.stopPropagation());
        this.codeInput.addEventListener('keypress', (e) => e.stopPropagation());
        this.codeInput.focus();

        // QR button next to input
        const qrBtnBg = this.add.sprite(centerX + 75, centerY, 'square-buttons', 6);
        qrBtnBg.setDisplaySize(36, 28);
        qrBtnBg.setDepth(102);
        qrBtnBg.setInteractive({ useHandCursor: true });
        this.claimFormElements.push(qrBtnBg);

        const qrText = this.add.text(centerX + 75, centerY, 'QR', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        qrText.setOrigin(0.5);
        qrText.setDepth(103);
        qrText.setStroke('#5D4037', 1);
        this.claimFormElements.push(qrText);

        qrBtnBg.on('pointerdown', () => this.openQRScanner());
        qrBtnBg.on('pointerover', () => qrBtnBg.setTint(0xcccccc));
        qrBtnBg.on('pointerout', () => qrBtnBg.clearTint());

        // Buttons
        const btnY = centerY + 45;

        // Claim button
        const claimBtnBg = this.add.sprite(centerX - 45, btnY, 'square-buttons', 6);
        claimBtnBg.setDisplaySize(70, 28);
        claimBtnBg.setDepth(102);
        claimBtnBg.setTint(0x4ade80);
        claimBtnBg.setInteractive({ useHandCursor: true });
        this.claimFormElements.push(claimBtnBg);

        const claimText = this.add.text(centerX - 45, btnY, 'Claim', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        claimText.setOrigin(0.5);
        claimText.setDepth(103);
        claimText.setStroke('#166534', 1);
        this.claimFormElements.push(claimText);

        // Cancel button
        const cancelBtnBg = this.add.sprite(centerX + 45, btnY, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(70, 28);
        cancelBtnBg.setDepth(102);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.claimFormElements.push(cancelBtnBg);

        const cancelText = this.add.text(centerX + 45, btnY, 'Cancel', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        cancelText.setOrigin(0.5);
        cancelText.setDepth(103);
        cancelText.setStroke('#5D4037', 1);
        this.claimFormElements.push(cancelText);

        claimBtnBg.on('pointerdown', () => this.submitClaimCode(badge));
        claimBtnBg.on('pointerover', () => claimBtnBg.setTint(0x86efac));
        claimBtnBg.on('pointerout', () => claimBtnBg.setTint(0x4ade80));

        cancelBtnBg.on('pointerdown', () => this.closeClaimForm());
        cancelBtnBg.on('pointerover', () => cancelBtnBg.setTint(0xcccccc));
        cancelBtnBg.on('pointerout', () => cancelBtnBg.clearTint());
    }

    private async submitClaimCode(badge: Badge) {
        const code = this.codeInput?.value.trim().toUpperCase();
        if (!code) {
            this.showToast('Please enter a code', 0xfbbf24);
            return;
        }

        const result = await BadgeService.claimBadgeWithCode(badge.id, code);

        if (result.success) {
            this.showToast(`🎉 ${badge.name} unlocked!`, 0x4ade80);
            this.closeClaimForm();
            // Refresh badges display
            this.refreshBadgesDisplay();
        } else {
            this.showToast(result.message, 0xef4444);
        }
    }

    private closeClaimForm() {
        this.claimFormOpen = false;
        this.currentBadge = null;

        if (this.codeInput?.parentNode) {
            this.codeInput.parentNode.removeChild(this.codeInput);
        }
        this.codeInput = null;

        this.claimFormElements.forEach(el => (el as any)?.destroy?.());
        this.claimFormElements = [];
    }

    private async openQRScanner(): Promise<void> {
        const { Html5Qrcode } = await import('html5-qrcode');

        this.qrScannerContainer = document.createElement('div');
        this.qrScannerContainer.id = 'qr-scanner-container';
        this.qrScannerContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10002;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        `;

        const scannerElement = document.createElement('div');
        scannerElement.id = 'qr-reader';
        scannerElement.style.cssText = `
            width: 300px;
            height: 300px;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
        `;

        const styleTag = document.createElement('style');
        styleTag.setAttribute('data-qr-scanner', 'true');
        styleTag.textContent = `
            #qr-reader video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
            #qr-reader__dashboard_section { display: none !important; }
        `;
        document.head.appendChild(styleTag);

        const title = document.createElement('div');
        title.textContent = 'Scan QR Code';
        title.style.cssText = `color: white; font-family: 'PixelFont', monospace; font-size: 18px; margin-bottom: 20px;`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `margin-top: 20px; padding: 12px 30px; font-family: 'PixelFont', monospace; font-size: 14px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer;`;

        this.qrScannerContainer.appendChild(title);
        this.qrScannerContainer.appendChild(scannerElement);
        this.qrScannerContainer.appendChild(closeBtn);
        document.body.appendChild(this.qrScannerContainer);

        const html5QrCode = new Html5Qrcode('qr-reader');

        const qrCodeSuccessCallback = (decodedText: string) => {
            html5QrCode.stop().then(() => {
                this.closeQRScanner();
                try {
                    // Try to parse as JSON (for structured QR codes)
                    const qrData = JSON.parse(decodedText);
                    if (qrData.code) {
                        if (this.codeInput) {
                            this.codeInput.value = qrData.code;
                        }
                        this.showToast('QR Code scanned!', 0x4ade80);
                        // Auto submit if badge is set
                        if (this.currentBadge) {
                            this.submitClaimCode(this.currentBadge);
                        }
                    } else {
                        this.showToast('Invalid QR code format', 0xef4444);
                    }
                } catch {
                    // Plain text code
                    if (this.codeInput) {
                        this.codeInput.value = decodedText;
                    }
                    this.showToast('QR Code scanned!', 0x4ade80);
                }
            }).catch(() => {});
        };

        html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            qrCodeSuccessCallback,
            () => {}
        ).catch(() => {
            this.showToast('Camera access denied', 0xef4444);
            this.closeQRScanner();
        });

        closeBtn.addEventListener('click', () => {
            html5QrCode.stop().then(() => this.closeQRScanner()).catch(() => this.closeQRScanner());
        });
    }

    private closeQRScanner(): void {
        if (this.qrScannerContainer && this.qrScannerContainer.parentNode) {
            this.qrScannerContainer.parentNode.removeChild(this.qrScannerContainer);
        }
        this.qrScannerContainer = null;

        const styleTag = document.querySelector('style[data-qr-scanner]');
        if (styleTag) styleTag.remove();
    }

    private refreshBadgesDisplay() {
        // Clear existing badge elements
        this.badgeElements.forEach(el => (el as any)?.destroy?.());
        this.badgeElements = [];

        // Recreate badges section
        const centerX = this.scale.width / 2;
        const panelWidth = 320;
        const panelHeight = 450;
        const startY = this.scale.height / 2 - panelHeight / 2 + 220;
        const leftX = centerX - panelWidth / 2 + 25;

        const claimableBadges = BadgeService.getClaimableBadges();
        claimableBadges.forEach((badge, index) => {
            const y = startY + index * 38;
            this.createBadgeRow(leftX, y, panelWidth - 50, badge, index);
        });
    }

    private showToast(message: string, color: number) {
        const centerX = this.scale.width / 2;
        
        const toast = this.add.text(centerX, 50, message, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            backgroundColor: `#${color.toString(16).padStart(6, '0')}`,
            padding: { x: 15, y: 8 },
            resolution: 2
        });
        toast.setOrigin(0.5);
        toast.setDepth(200);

        this.tweens.add({
            targets: toast,
            y: 70,
            duration: 200,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: toast,
                    alpha: 0,
                    y: 50,
                    duration: 300,
                    delay: 2000,
                    onComplete: () => toast.destroy()
                });
            }
        });
    }

    private createNavigationButtons(centerX: number, y: number) {
        const buttonWidth = 115;
        const buttonHeight = 45;
        const spacing = 10;

        // Garden destination button (like Travel style)
        this.createDestinationButton(
            centerX - buttonWidth / 2 - spacing / 2,
            y,
            buttonWidth,
            buttonHeight,
            {
                name: 'GARDEN',
                nameVi: 'Vườn',
                description: 'Grow your plants',
                bgImage: 'place-farm',
                onClick: () => this.goToGarden()
            }
        );

        // Town Square destination button
        this.createDestinationButton(
            centerX + buttonWidth / 2 + spacing / 2,
            y,
            buttonWidth,
            buttonHeight,
            {
                name: 'SQUARE',
                nameVi: 'Quảng trường',
                description: 'Meet other farmers',
                bgImage: 'place-townsquare',
                onClick: () => this.goToTownSquare()
            }
        );
    }

    private createDestinationButton(
        x: number,
        y: number,
        width: number,
        height: number,
        destination: {
            name: string;
            nameVi: string;
            description: string;
            bgImage: string;
            onClick: () => void;
        }
    ): void {
        // Background image
        const bgImage = this.add.image(x, y, destination.bgImage);
        bgImage.setDisplaySize(width, height);

        // Border frame
        const border = this.add.rectangle(x, y, width, height);
        border.setStrokeStyle(2, 0x4a7c59);
        border.setFillStyle(0x000000, 0);

        // Make interactive
        bgImage.setInteractive({ useHandCursor: true });

        bgImage.on('pointerover', () => {
            bgImage.setTint(0xffffaa);
            border.setStrokeStyle(2, 0xFFD700);
        });

        bgImage.on('pointerout', () => {
            bgImage.clearTint();
            border.setStrokeStyle(2, 0x4a7c59);
        });

        bgImage.on('pointerdown', destination.onClick);

        // Semi-transparent overlay at bottom for text
        const textBg = this.add.rectangle(x, y + height / 2 - 10, width, 20, 0x000000, 0.7);

        // Name
        const nameText = this.add.text(x - width / 2 + 6, y + height / 2 - 15, destination.name, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        nameText.setOrigin(0, 0.5);
        nameText.setStroke('#000000', 2);

        // Description
        const descText = this.add.text(x - width / 2 + 6, y + height / 2 - 4, destination.description, {
            fontSize: '6px',
            fontFamily: 'PixelFont',
            color: '#CCCCCC',
            resolution: 2
        });
        descText.setOrigin(0, 0.5);

        // Animate entrance
        [bgImage, border, textBg, nameText, descText].forEach((el, i) => {
            el.setAlpha(0);
            this.tweens.add({
                targets: el,
                alpha: 1,
                duration: 200,
                delay: 200 + i * 20,
                ease: 'Quad.easeOut'
            });
        });
    }

    private createLogoutButton(x: number, y: number) {
        const btn = this.add.text(x, y, '🚪', {
            fontSize: '16px',
            resolution: 2
        });
        btn.setOrigin(0.5);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerdown', () => this.handleLogout());
        btn.on('pointerover', () => btn.setScale(1.2));
        btn.on('pointerout', () => btn.setScale(1));
    }

    private goToGarden() {
        localStorage.setItem('fam_game_destination', 'FarmingGame');
        
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('FarmingGame');
        });
    }

    private goToTownSquare() {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('TownSquare');
        });
    }

    private handleLogout() {
        EventBus.emit('disconnect-wallet');
        UserService.clearAuthData();
        BadgeService.clearBadges();
        
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('Login', { fromLogout: true });
        });
    }

    shutdown() {
        this.closeClaimForm();
        this.closeQRScanner();
    }
}
