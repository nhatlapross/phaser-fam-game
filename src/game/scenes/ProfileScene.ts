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
    
    // My Badges scrollable
    private myBadgesContainer!: Phaser.GameObjects.Container;
    private myBadgesMask!: Phaser.GameObjects.Graphics;
    private myBadgesScrollY: number = 0;
    private myBadgesMaxScrollY: number = 0;
    private myBadgesBounds: { x: number; y: number; width: number; height: number } | null = null;
    
    // Unlock Badges scrollable
    private unlockBadgesContainer!: Phaser.GameObjects.Container;
    private unlockBadgesMask!: Phaser.GameObjects.Graphics;
    private unlockBadgesScrollY: number = 0;
    private unlockBadgesMaxScrollY: number = 0;
    private unlockBadgesBounds: { x: number; y: number; width: number; height: number } | null = null;
    
    // Scroll state
    private activeScrollArea: 'myBadges' | 'unlockBadges' | null = null;
    private isDragging: boolean = false;
    private dragStartY: number = 0;
    private scrollStartY: number = 0;

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

        console.log('[ProfileScene] User data:', JSON.stringify(user, null, 2));

        if (!user) {
            this.scene.start('Login');
            return;
        }

        const panelTop = centerY - panelHeight / 2 + 30;

        // Title
        const title = this.add.text(centerX, panelTop + 30, '👤 Profile', {
            fontSize: '18px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setStroke('#5D4037', 3);

        // Character preview + name + wallets
        this.createCharacterSection(centerX, panelTop + 80, panelWidth, user);

        // My Badges section (inline with title)
        this.createMyBadgesSection(centerX + 10, panelTop + 175, panelWidth - 30);

        // Unlock Badges section (scrollable list)
        this.createUnlockBadgesSection(centerX + 10, panelTop + 210, panelWidth - 30);

        // Navigation buttons - at bottom
        this.createNavigationButtons(centerX + 10, panelTop + 350);

        // Logout button (small, top right)
        this.createLogoutButton(centerX + panelWidth / 2 - 30, panelTop + 30);
        
        // Setup global scroll handlers
        this.setupScrollHandlers();
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

        console.log(`[ProfileScene] Character: ${characterKey} (type: ${characterType}, index: ${characterIndex})`);

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

    // Track wallet modal state and elements
    private walletElements: Phaser.GameObjects.GameObject[] = [];
    private walletsUser: any = null;
    private walletModalElements: Phaser.GameObjects.GameObject[] = [];
    private walletModalOpen: boolean = false;

    private createWalletsSection(centerX: number, startY: number, panelWidth: number, user: any) {
        this.walletsUser = user;

        // Clear existing wallet elements
        this.walletElements.forEach(el => (el as any)?.destroy?.());
        this.walletElements = [];

        const leftX = centerX - panelWidth / 2 + 55;
        const evmAddress = user.walletAddress || user.address;

        // Show only EVM address
        const chainLabel = this.add.text(leftX, startY, 'EVM:', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        chainLabel.setStroke('#5D4037', 1);
        this.walletElements.push(chainLabel);

        if (evmAddress) {
            const shortAddr = `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}`;
            const addrText = this.add.text(leftX + 40, startY, shortAddr, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF', // White for better visibility
                fontStyle: 'bold',
                resolution: 2
            });
            addrText.setStroke('#5D4037', 1);
            this.walletElements.push(addrText);

            // Copy button
            const copyBtn = this.add.text(leftX + 140, startY, 'Copy', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#4ade80',
                resolution: 2
            });
            copyBtn.setInteractive({ useHandCursor: true });
            this.walletElements.push(copyBtn);

            copyBtn.on('pointerdown', async () => {
                try {
                    await navigator.clipboard.writeText(evmAddress);
                    copyBtn.setText('Copied!');
                    copyBtn.setColor('#86efac');
                    this.time.delayedCall(1500, () => {
                        if (copyBtn.active) {
                            copyBtn.setText('Copy');
                            copyBtn.setColor('#4ade80');
                        }
                    });
                } catch {
                    console.log('Copy failed');
                }
            });
            copyBtn.on('pointerover', () => copyBtn.setColor('#86efac'));
            copyBtn.on('pointerout', () => {
                if (copyBtn.text === 'Copy') copyBtn.setColor('#4ade80');
            });
        }

        // Check if there are other wallets
        const hasOtherWallets = user.walletAddressAptos || user.walletAddressSui || user.walletAddressCardano;

        if (hasOtherWallets) {
            // More button - opens modal
            const moreBtn = this.add.text(leftX + 185, startY, '▼ More', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#4a90e2',
                resolution: 2
            });
            moreBtn.setInteractive({ useHandCursor: true });
            this.walletElements.push(moreBtn);

            moreBtn.on('pointerdown', () => this.openWalletsModal(user));
            moreBtn.on('pointerover', () => moreBtn.setColor('#6bb3ff'));
            moreBtn.on('pointerout', () => moreBtn.setColor('#4a90e2'));
        }
    }

    /**
     * Open modal showing all wallet addresses
     */
    private openWalletsModal(user: any) {
        if (this.walletModalOpen) return;
        this.walletModalOpen = true;

        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const modalWidth = 280;
        const modalHeight = 180;

        // Overlay
        const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.8);
        overlay.setDepth(100);
        overlay.setInteractive();
        this.walletModalElements.push(overlay);

        // Modal background
        const modalBg = this.add.sprite(centerX, centerY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(101);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.walletModalElements.push(modalBg);

        // Animate
        modalBg.setScale(0);
        this.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        const title = this.add.text(centerX, centerY - modalHeight / 2 + 25, '🔗 All Wallets', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(102);
        title.setStroke('#5D4037', 2);
        this.walletModalElements.push(title);

        // All wallets list
        const wallets = [
            { chain: 'EVM', address: user.walletAddress || user.address },
            { chain: 'Aptos', address: user.walletAddressAptos },
            { chain: 'Sui', address: user.walletAddressSui },
            { chain: 'Cardano', address: user.walletAddressCardano }
        ];

        const listStartY = centerY - modalHeight / 2 + 50;
        const leftX = centerX - modalWidth / 2 + 45;

        wallets.forEach((wallet, index) => {
            const y = listStartY + index * 24;

            const label = this.add.text(leftX, y, `${wallet.chain}:`, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            label.setDepth(102);
            label.setStroke('#5D4037', 1);
            this.walletModalElements.push(label);

            if (wallet.address) {
                const shortAddr = `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`;
                const addrText = this.add.text(leftX + 70, y, shortAddr, {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    fontStyle: 'bold',
                    resolution: 2
                });
                addrText.setDepth(102);
                this.walletModalElements.push(addrText);

                const copyBtn = this.add.text(leftX + 185, y, 'Copy', {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: '#4ade80',
                    resolution: 2
                });
                copyBtn.setDepth(102);
                copyBtn.setInteractive({ useHandCursor: true });
                this.walletModalElements.push(copyBtn);

                copyBtn.on('pointerdown', async () => {
                    try {
                        await navigator.clipboard.writeText(wallet.address!);
                        copyBtn.setText('Copied!');
                        copyBtn.setColor('#86efac');
                        this.time.delayedCall(1500, () => {
                            if (copyBtn.active) {
                                copyBtn.setText('Copy');
                                copyBtn.setColor('#4ade80');
                            }
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
                const notLinked = this.add.text(leftX + 70, y, 'Not linked', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#6b7280',
                    resolution: 2
                });
                notLinked.setDepth(102);
                this.walletModalElements.push(notLinked);
            }
        });

        // Close button
        const closeBtn = this.add.text(centerX + modalWidth / 2 - 20, centerY - modalHeight / 2 + 15, '✕', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeBtn.setOrigin(0.5);
        closeBtn.setDepth(103);
        closeBtn.setInteractive({ useHandCursor: true });
        this.walletModalElements.push(closeBtn);

        closeBtn.on('pointerdown', () => this.closeWalletsModal());
        closeBtn.on('pointerover', () => closeBtn.setColor('#ff6b6b'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#FFFFFF'));

        overlay.on('pointerdown', () => this.closeWalletsModal());
    }

    private closeWalletsModal() {
        this.walletModalOpen = false;
        this.walletModalElements.forEach(el => (el as any)?.destroy?.());
        this.walletModalElements = [];
    }

    // Track badge modal state
    private badgeModalElements: Phaser.GameObjects.GameObject[] = [];
    private badgeModalOpen: boolean = false;

    /**
     * Create "My Badges" section with inline badges (max 5, with more button)
     */
    private createMyBadgesSection(centerX: number, startY: number, panelWidth: number) {
        const viewportWidth = panelWidth - 40;
        const leftX = centerX - viewportWidth / 2;

        // Section title
        const title = this.add.text(leftX + 10, startY, '🏆 My Badges', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setStroke('#5D4037', 2);
        this.badgeElements.push(title);

        const claimedBadges = AVAILABLE_BADGES.filter(b => BadgeService.isBadgeClaimed(b.id));

        // Show badges inline with title (max 5)
        const maxInlineBadges = 5;
        const badgesToShow = claimedBadges.slice(0, maxInlineBadges);
        const badgeSize = 22;
        const badgeSpacing = 4;
        const badgesStartX = leftX + 85; // After title

        if (claimedBadges.length === 0) {
            const noBadges = this.add.text(badgesStartX, startY, 'No badges yet', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#6b7280',
                resolution: 2
            });
            this.badgeElements.push(noBadges);
        } else {
            // Display badges inline
            badgesToShow.forEach((badge, index) => {
                const x = badgesStartX + index * (badgeSize + badgeSpacing) + badgeSize / 2;
                const y = startY + 5;

                const badgeBg = this.add.rectangle(x, y, badgeSize, badgeSize, 0x2d5a3d, 0.8);
                badgeBg.setStrokeStyle(1, 0x4ade80);
                badgeBg.setInteractive({ useHandCursor: true });
                this.badgeElements.push(badgeBg);

                const badgeIcon = this.add.text(x, y, badge.icon, {
                    fontSize: '12px',
                    resolution: 2
                });
                badgeIcon.setOrigin(0.5);
                this.badgeElements.push(badgeIcon);

                badgeBg.on('pointerover', () => {
                    badgeBg.setStrokeStyle(2, 0xFFD700);
                    this.showBadgeTooltip(x, y - badgeSize / 2 - 20, badge);
                });
                badgeBg.on('pointerout', () => {
                    badgeBg.setStrokeStyle(1, 0x4ade80);
                    this.hideBadgeTooltip();
                });
            });

            // Show "more" button if there are more than 5 badges
            if (claimedBadges.length > maxInlineBadges) {
                const moreX = badgesStartX + maxInlineBadges * (badgeSize + badgeSpacing) + 15;
                const moreBtn = this.add.text(moreX, startY + 5, `+${claimedBadges.length - maxInlineBadges}`, {
                    fontSize: '9px',
                    fontFamily: 'PixelFont',
                    color: '#4a90e2',
                    resolution: 2
                });
                moreBtn.setOrigin(0.5);
                moreBtn.setInteractive({ useHandCursor: true });
                this.badgeElements.push(moreBtn);

                moreBtn.on('pointerdown', () => this.openBadgesModal(claimedBadges));
                moreBtn.on('pointerover', () => moreBtn.setColor('#6bb3ff'));
                moreBtn.on('pointerout', () => moreBtn.setColor('#4a90e2'));
            }
        }

        // No scrollable container needed for inline badges
        this.myBadgesBounds = null;
        this.myBadgesMaxScrollY = 0;
    }

    /**
     * Open modal showing all badges
     */
    private openBadgesModal(badges: Badge[]) {
        if (this.badgeModalOpen) return;
        this.badgeModalOpen = true;

        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;
        const modalWidth = 280;
        const modalHeight = 220;

        // Overlay
        const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.8);
        overlay.setDepth(100);
        overlay.setInteractive();
        this.badgeModalElements.push(overlay);

        // Modal background
        const modalBg = this.add.sprite(centerX, centerY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(101);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.badgeModalElements.push(modalBg);

        // Animate
        modalBg.setScale(0);
        this.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        const title = this.add.text(centerX, centerY - modalHeight / 2 + 25, '🏆 All My Badges', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(102);
        title.setStroke('#5D4037', 2);
        this.badgeModalElements.push(title);

        // Badge grid
        const columns = 6;
        const cellSize = 32;
        const cellSpacing = 6;
        const gridWidth = columns * cellSize + (columns - 1) * cellSpacing;
        const gridStartX = centerX - gridWidth / 2 + cellSize / 2;
        const gridStartY = centerY - modalHeight / 2 + 55;

        badges.forEach((badge, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const x = gridStartX + col * (cellSize + cellSpacing);
            const y = gridStartY + row * (cellSize + cellSpacing);

            const badgeBg = this.add.rectangle(x, y, cellSize, cellSize, 0x2d5a3d, 0.8);
            badgeBg.setStrokeStyle(2, 0x4ade80);
            badgeBg.setDepth(102);
            badgeBg.setInteractive({ useHandCursor: true });
            this.badgeModalElements.push(badgeBg);

            const badgeIcon = this.add.text(x, y, badge.icon, {
                fontSize: '16px',
                resolution: 2
            });
            badgeIcon.setOrigin(0.5);
            badgeIcon.setDepth(103);
            this.badgeModalElements.push(badgeIcon);

            badgeBg.on('pointerover', () => {
                badgeBg.setStrokeStyle(2, 0xFFD700);
                this.showBadgeTooltipModal(x, y - cellSize / 2 - 20, badge);
            });
            badgeBg.on('pointerout', () => {
                badgeBg.setStrokeStyle(2, 0x4ade80);
                this.hideBadgeTooltipModal();
            });
        });

        // Close button
        const closeBtn = this.add.text(centerX + modalWidth / 2 - 20, centerY - modalHeight / 2 + 15, '✕', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeBtn.setOrigin(0.5);
        closeBtn.setDepth(103);
        closeBtn.setInteractive({ useHandCursor: true });
        this.badgeModalElements.push(closeBtn);

        closeBtn.on('pointerdown', () => this.closeBadgesModal());
        closeBtn.on('pointerover', () => closeBtn.setColor('#ff6b6b'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#FFFFFF'));

        overlay.on('pointerdown', () => this.closeBadgesModal());
    }

    private badgeModalTooltip: Phaser.GameObjects.Container | null = null;

    private showBadgeTooltipModal(x: number, y: number, badge: Badge): void {
        this.hideBadgeTooltipModal();

        const container = this.add.container(x, y);
        container.setDepth(150);

        const bg = this.add.rectangle(0, 0, 100, 32, 0x3E2723, 0.95);
        bg.setStrokeStyle(1, 0x5D4037);
        container.add(bg);

        const nameText = this.add.text(0, 0, badge.name, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        nameText.setOrigin(0.5);
        container.add(nameText);

        this.badgeModalTooltip = container;
        this.badgeModalElements.push(container);

        container.setAlpha(0);
        container.setScale(0.8);
        this.tweens.add({
            targets: container,
            alpha: 1,
            scale: 1,
            duration: 100,
            ease: 'Back.easeOut'
        });
    }

    private hideBadgeTooltipModal(): void {
        if (this.badgeModalTooltip) {
            this.badgeModalTooltip.destroy();
            this.badgeModalTooltip = null;
        }
    }

    private closeBadgesModal() {
        this.badgeModalOpen = false;
        this.badgeModalElements.forEach(el => (el as any)?.destroy?.());
        this.badgeModalElements = [];
        this.badgeModalTooltip = null;
    }

    /**
     * Create "Unlock Badges" section with scrollable list
     */
    private createUnlockBadgesSection(centerX: number, startY: number, panelWidth: number) {
        const viewportWidth = panelWidth - 40;
        const viewportHeight = 90; // Height for unlock badges list
        const leftX = centerX - viewportWidth / 2;

        const unclaimedBadges = BadgeService.getClaimableBadges().filter(b => !BadgeService.isBadgeClaimed(b.id));

        // Section title
        const title = this.add.text(leftX + 10, startY, `🔓 Unlock Badges (${unclaimedBadges.length})`, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setStroke('#5D4037', 2);

        if (unclaimedBadges.length === 0) {
            const allClaimed = this.add.text(centerX, startY + 40, 'All badges claimed! 🎉', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#4ade80',
                resolution: 2
            });
            allClaimed.setOrigin(0.5);
            return;
        }

        const contentStartY = startY + 16;

        // Create mask
        this.unlockBadgesMask = this.add.graphics();
        this.unlockBadgesMask.fillRect(leftX, contentStartY, viewportWidth, viewportHeight);
        const mask = this.unlockBadgesMask.createGeometryMask();

        // Create container
        this.unlockBadgesContainer = this.add.container(0, 0);
        this.unlockBadgesContainer.setMask(mask);

        // Create rows for each unclaimed badge
        const rowHeight = 32;
        unclaimedBadges.forEach((badge, index) => {
            const y = contentStartY + index * rowHeight;
            this.createUnlockBadgeRow(leftX + 10, y, viewportWidth - 20, badge);
        });

        const totalContentHeight = unclaimedBadges.length * rowHeight;
        this.unlockBadgesMaxScrollY = Math.max(0, totalContentHeight - viewportHeight);

        // Scroll indicator if needed
        if (this.unlockBadgesMaxScrollY > 0) {
            const scrollHint = this.add.text(centerX + viewportWidth / 2 - 15, startY, '↕', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#6b7280',
                resolution: 2
            });
            scrollHint.setAlpha(0.6);
        }

        // Store bounds for scroll detection (used in setupScrollHandlers)
        this.unlockBadgesBounds = { x: leftX, y: contentStartY, width: viewportWidth, height: viewportHeight };
    }

    private createUnlockBadgeRow(leftX: number, y: number, width: number, badge: Badge) {
        // Store original Y for visibility check
        const originalY = y;
        
        // Row background
        const rowBg = this.add.rectangle(leftX + width / 2, y + 12, width, 28, 0x3E2723, 0.7);
        rowBg.setStrokeStyle(1, 0x5D4037);
        this.unlockBadgesContainer.add(rowBg);
        this.badgeElements.push(rowBg);

        // Badge icon
        const icon = this.add.text(leftX + 18, y + 12, badge.icon, {
            fontSize: '14px',
            resolution: 2
        });
        icon.setOrigin(0.5);
        icon.setAlpha(0.5);
        this.unlockBadgesContainer.add(icon);
        this.badgeElements.push(icon);

        // Badge name
        const name = this.add.text(leftX + 38, y + 6, badge.name, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        name.setStroke('#5D4037', 1);
        this.unlockBadgesContainer.add(name);
        this.badgeElements.push(name);

        // Badge requirement
        const desc = this.add.text(leftX + 38, y + 18, badge.requirement, {
            fontSize: '6px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        this.unlockBadgesContainer.add(desc);
        this.badgeElements.push(desc);

        // Unlock button
        const btnX = leftX + width - 30;
        const unlockBtnBg = this.add.sprite(btnX, y + 12, 'square-buttons', 6);
        unlockBtnBg.setDisplaySize(50, 22);
        unlockBtnBg.setTint(0x4ade80);
        unlockBtnBg.setInteractive({ useHandCursor: true });
        this.unlockBadgesContainer.add(unlockBtnBg);
        this.badgeElements.push(unlockBtnBg);

        const unlockText = this.add.text(btnX, y + 12, 'Unlock', {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        unlockText.setOrigin(0.5);
        unlockText.setStroke('#166534', 1);
        this.unlockBadgesContainer.add(unlockText);
        this.badgeElements.push(unlockText);

        // Helper to check if button is visible
        const isButtonVisible = (): boolean => {
            if (!this.unlockBadgesBounds) return true;
            const visibleY = originalY - this.unlockBadgesScrollY;
            const bounds = this.unlockBadgesBounds;
            return visibleY + 12 >= bounds.y && visibleY + 12 <= bounds.y + bounds.height;
        };

        unlockBtnBg.on('pointerdown', () => {
            if (isButtonVisible()) {
                this.openClaimForm(badge);
            }
        });
        unlockBtnBg.on('pointerover', () => {
            if (isButtonVisible()) {
                unlockBtnBg.setTint(0x86efac);
            }
        });
        unlockBtnBg.on('pointerout', () => unlockBtnBg.setTint(0x4ade80));
    }

    private setupScrollHandlers() {
        // Mouse wheel scroll
        this.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => {
            // Check if pointer is within myBadges bounds
            if (this.myBadgesBounds && this.myBadgesMaxScrollY > 0) {
                const b = this.myBadgesBounds;
                if (pointer.x >= b.x && pointer.x <= b.x + b.width &&
                    pointer.y >= b.y && pointer.y <= b.y + b.height) {
                    this.myBadgesScrollY = Phaser.Math.Clamp(this.myBadgesScrollY + deltaY * 0.5, 0, this.myBadgesMaxScrollY);
                    this.myBadgesContainer.setY(-this.myBadgesScrollY);
                    return;
                }
            }
            
            // Check if pointer is within unlockBadges bounds
            if (this.unlockBadgesBounds && this.unlockBadgesMaxScrollY > 0) {
                const b = this.unlockBadgesBounds;
                if (pointer.x >= b.x && pointer.x <= b.x + b.width &&
                    pointer.y >= b.y && pointer.y <= b.y + b.height) {
                    this.unlockBadgesScrollY = Phaser.Math.Clamp(this.unlockBadgesScrollY + deltaY * 0.5, 0, this.unlockBadgesMaxScrollY);
                    this.unlockBadgesContainer.setY(-this.unlockBadgesScrollY);
                }
            }
        });

        // Touch/drag scroll - detect area on pointerdown
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Check myBadges area
            if (this.myBadgesBounds) {
                const b = this.myBadgesBounds;
                if (pointer.x >= b.x && pointer.x <= b.x + b.width &&
                    pointer.y >= b.y && pointer.y <= b.y + b.height) {
                    this.activeScrollArea = 'myBadges';
                    this.isDragging = true;
                    this.dragStartY = pointer.y;
                    this.scrollStartY = this.myBadgesScrollY;
                    return;
                }
            }
            
            // Check unlockBadges area
            if (this.unlockBadgesBounds) {
                const b = this.unlockBadgesBounds;
                if (pointer.x >= b.x && pointer.x <= b.x + b.width &&
                    pointer.y >= b.y && pointer.y <= b.y + b.height) {
                    this.activeScrollArea = 'unlockBadges';
                    this.isDragging = true;
                    this.dragStartY = pointer.y;
                    this.scrollStartY = this.unlockBadgesScrollY;
                }
            }
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!this.isDragging) return;
            
            const deltaY = this.dragStartY - pointer.y;
            
            if (this.activeScrollArea === 'myBadges' && this.myBadgesMaxScrollY > 0) {
                this.myBadgesScrollY = Phaser.Math.Clamp(this.scrollStartY + deltaY, 0, this.myBadgesMaxScrollY);
                this.myBadgesContainer.setY(-this.myBadgesScrollY);
            } else if (this.activeScrollArea === 'unlockBadges' && this.unlockBadgesMaxScrollY > 0) {
                this.unlockBadgesScrollY = Phaser.Math.Clamp(this.scrollStartY + deltaY, 0, this.unlockBadgesMaxScrollY);
                this.unlockBadgesContainer.setY(-this.unlockBadgesScrollY);
            }
        });

        this.input.on('pointerup', () => {
            this.isDragging = false;
            this.activeScrollArea = null;
        });
    }

    private badgeTooltip: Phaser.GameObjects.Container | null = null;

    private showBadgeTooltip(x: number, y: number, badge: Badge): void {
        this.hideBadgeTooltip();

        const container = this.add.container(x, y);
        container.setDepth(50);

        const bg = this.add.rectangle(0, 0, 90, 28, 0x3E2723, 0.95);
        bg.setStrokeStyle(1, 0x5D4037);
        container.add(bg);

        const nameText = this.add.text(0, 0, badge.name, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        nameText.setOrigin(0.5);
        container.add(nameText);

        this.badgeTooltip = container;

        container.setAlpha(0);
        container.setScale(0.8);
        this.tweens.add({
            targets: container,
            alpha: 1,
            scale: 1,
            duration: 100,
            ease: 'Back.easeOut'
        });
    }

    private hideBadgeTooltip(): void {
        if (this.badgeTooltip) {
            this.badgeTooltip.destroy();
            this.badgeTooltip = null;
        }
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

        // Show loading state
        this.showToast('⏳ Verifying code...', 0x4a90e2);

        const result = await BadgeService.claimBadgeWithCode(badge.id, code);

        if (result.success) {
            // Use badge name from API response if available
            const badgeName = result.badgeName || badge.name;
            this.showToast(`🎉 "${badgeName}" unlocked!`, 0x4ade80);
            this.closeClaimForm();
            // Refresh badges display
            this.refreshBadgesDisplay();
        } else {
            this.showToast(`❌ ${result.message}`, 0xef4444);
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

        // Destroy old containers and masks
        if (this.myBadgesContainer) {
            this.myBadgesContainer.destroy();
        }
        if (this.myBadgesMask) {
            this.myBadgesMask.destroy();
        }
        if (this.unlockBadgesContainer) {
            this.unlockBadgesContainer.destroy();
        }
        if (this.unlockBadgesMask) {
            this.unlockBadgesMask.destroy();
        }

        // Reset scroll
        this.myBadgesScrollY = 0;
        this.myBadgesMaxScrollY = 0;
        this.unlockBadgesScrollY = 0;
        this.unlockBadgesMaxScrollY = 0;

        // Recreate badges sections
        const centerX = this.scale.width / 2;
        const panelWidth = 320;
        const panelHeight = 450;
        const panelTop = this.scale.height / 2 - panelHeight / 2;

        this.createMyBadgesSection(centerX, panelTop + 215, panelWidth);
        this.createUnlockBadgesSection(centerX, panelTop + 295, panelWidth);
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
        this.closeBadgesModal();
        this.closeWalletsModal();
        this.walletElements.forEach(el => (el as any)?.destroy?.());
        this.walletElements = [];
    }
}
