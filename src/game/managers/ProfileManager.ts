import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { UserService } from '../UserService';
import { GameDataService } from '../GameDataService';
import { EventBus } from '../EventBus';
import { useGameState } from '../hooks/useGameState';
import { NFTVoucherManager, SAMPLE_VOUCHERS } from './NFTVoucherManager';
import { BadgeService, AVAILABLE_BADGES, Badge } from '../BadgeService';

interface ProfileCallbacks {
    onLogout: () => void;
    onWalletConnected: (address: string) => void;
}

/**
 * Manages the user profile UI and modal
 * Handles profile display, editing, avatar upload, and logout
 */
export class ProfileManager extends BaseManager {
    private callbacks: ProfileCallbacks;
    private profileElements: Phaser.GameObjects.GameObject[] = [];
    private modalElements: Phaser.GameObjects.GameObject[] = [];
    private editFormElements: Phaser.GameObjects.GameObject[] = [];
    private avatarImage: Phaser.GameObjects.Image | null = null;
    private loadedAvatarUrl: string | null = null;
    private editFormOpen: boolean = false;
    private editInput: HTMLInputElement | null = null;
    private fileInput: HTMLInputElement | null = null;
    
    // Tab system
    private activeTab: 'profile' | 'vouchers' | 'badges' = 'profile';
    private tabElements: Phaser.GameObjects.GameObject[] = [];
    private profileContentElements: Phaser.GameObjects.GameObject[] = [];
    private voucherManager: NFTVoucherManager | null = null;
    
    // Badges tab scrolling
    private badgesScrollY: number = 0;
    private badgesContainer: Phaser.GameObjects.Container | null = null;
    private badgesMask: Phaser.GameObjects.Graphics | null = null;

    constructor(scene: Phaser.Scene, callbacks: ProfileCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Create the profile UI in top-right corner
     */
    public createProfileUI(): void {
        // Safety check - ensure scene is still active
        if (!this.isSceneActive()) {
            return;
        }

        this.destroyProfileElements();
        this.avatarImage = null;
        this.loadedAvatarUrl = null;

        // Use GameDataService (pre-fetched data) as primary source, fallback to localStorage
        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();
        if (!user) return;

        const screenWidth = this.scene.scale.width;
        const padding = 10;
        const avatarSize = 50;
        const panelWidth = 140;
        const panelHeight = 105;

        const panelX = screenWidth - panelWidth / 2 - padding;
        const panelY = panelHeight / 2 + padding;

        // Background panel
        const bg = this.scene.add.sprite(panelX, panelY, 'settings-panel', 1);
        bg.setDisplaySize(panelWidth, panelHeight);
        bg.setDepth(5020);
        bg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(bg);
        this.profileElements.push(bg);

        // Avatar frame
        const avatarBgX = panelX - panelWidth / 2 + 18 + avatarSize / 2;
        const avatarBgY = panelY - 5;

        const avatarFrame = this.scene.add.sprite(avatarBgX, avatarBgY, 'square-buttons', 6);
        avatarFrame.setDisplaySize(avatarSize + 10, avatarSize + 10);
        avatarFrame.setDepth(5021);
        this.scene.cameras.main.ignore(avatarFrame);
        this.profileElements.push(avatarFrame);

        // Avatar image
        if (user.avatar) {
            this.loadExternalAvatar(user.avatar, avatarBgX, avatarBgY, avatarSize);
        } else {
            const avatar = this.scene.add.image(avatarBgX, avatarBgY, 'default-avatar');
            avatar.setDisplaySize(avatarSize, avatarSize);
            avatar.setDepth(5022);
            this.scene.cameras.main.ignore(avatar);
            this.profileElements.push(avatar);
            this.avatarImage = avatar;
        }

        // Info section
        const infoX = avatarBgX + avatarSize / 2 + 8;
        const infoStartY = panelY - 28;

        // Username
        const username = user.username || 'Player';
        const nameText = this.scene.add.text(infoX, infoStartY, username.length > 7 ? username.slice(0, 6) + '..' : username, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2
        });
        nameText.setDepth(5023);
        this.scene.cameras.main.ignore(nameText);
        this.profileElements.push(nameText);

        // Wallet address
        const shortWallet = `${user.address.slice(0, 4)}..${user.address.slice(-4)}`;
        const walletText = this.scene.add.text(infoX, infoStartY + 14, shortWallet, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#8D6E63',
            resolution: 2
        });
        walletText.setDepth(5023);
        this.scene.cameras.main.ignore(walletText);
        this.profileElements.push(walletText);

        // XP
        const xpText = this.scene.add.text(infoX, infoStartY + 28, `XP: ${user.xp}`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2
        });
        xpText.setDepth(5023);
        this.scene.cameras.main.ignore(xpText);
        this.profileElements.push(xpText);

        // Score
        const scoreText = this.scene.add.text(infoX, infoStartY + 42, `Sc: ${user.reputationScore}`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2
        });
        scoreText.setDepth(5023);
        this.scene.cameras.main.ignore(scoreText);
        this.profileElements.push(scoreText);

        // Currency row - READ FROM GLOBAL GAME STATE (single source of truth)
        const currencyY = panelY + panelHeight / 2 - 22;
        const currencyStartX = panelX - panelWidth / 2 + 25;

        // Get currency from global game state instead of user object
        const gameState = useGameState(this.scene);
        const goldBalance = gameState.getGold();
        const gemBalance = gameState.getGem();

        const goldText = this.scene.add.text(currencyStartX, currencyY, `💰 ${goldBalance}`, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        goldText.setDepth(5023);
        goldText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(goldText);
        this.profileElements.push(goldText);

        const gemText = this.scene.add.text(currencyStartX + 60, currencyY, `💎 ${gemBalance}`, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        gemText.setDepth(5023);
        gemText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(gemText);
        this.profileElements.push(gemText);

        // Click to open modal
        bg.on('pointerdown', () => this.open());
        bg.on('pointerover', () => bg.setTint(0xcccccc));
        bg.on('pointerout', () => bg.clearTint());
    }

    /**
     * Get profile elements for camera ignore
     */
    public getProfileElements(): Phaser.GameObjects.GameObject[] {
        return this.profileElements;
    }

    private destroyProfileElements(): void {
        this.profileElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.profileElements = [];
    }

    private loadExternalAvatar(url: string, x: number, y: number, size: number): void {
        if (this.loadedAvatarUrl === url && this.avatarImage) {
            return;
        }

        const key = 'avatar-' + Date.now();
        this.scene.load.image(key, url);
        this.scene.load.once('complete', () => {
            if (this.scene.textures.exists(key)) {
                const avatar = this.scene.add.image(x, y, key);
                avatar.setDisplaySize(size, size);
                avatar.setDepth(5022);
                this.scene.cameras.main.ignore(avatar);
                this.profileElements.push(avatar);
                this.avatarImage = avatar;
                this.loadedAvatarUrl = url;
            }
        });
        this.scene.load.start();
    }

    private loadModalAvatar(url: string, x: number, y: number, size: number): void {
        const key = 'modal-avatar-' + Date.now();
        this.scene.load.image(key, url);
        this.scene.load.once('complete', () => {
            if (this.scene.textures.exists(key)) {
                const avatar = this.scene.add.image(x, y, key);
                avatar.setDisplaySize(size, size);
                avatar.setDepth(5103);
                avatar.setAlpha(0);
                this.scene.cameras.main.ignore(avatar);
                this.profileContentElements.push(avatar);
                this.scene.tweens.add({ targets: avatar, alpha: 1, duration: 150 });
            }
        });
        this.scene.load.start();
    }

    /**
     * Open the profile modal
     */
    public open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.activeTab = 'profile';

        // Use GameDataService (pre-fetched data) as primary source, fallback to localStorage
        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();
        if (!user) return;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 300;
        const modalHeight = 380;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.5);
        overlay.setDepth(5100);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.modalElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5101);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.modalElements.push(modalBg);

        // Animate
        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.scene.time.delayedCall(100, () => {
            this.createTabs(modalX, modalY, modalWidth, modalHeight);
            this.createModalContent(modalX, modalY, modalWidth, modalHeight, user);
        });

        overlay.on('pointerdown', () => this.close());
    }

    /**
     * Close the profile modal
     */
    public close(): void {
        this.isOpen = false;
        this.modalElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.modalElements = [];
        
        // Cleanup tab elements
        this.tabElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.tabElements = [];
        
        // Cleanup profile content
        this.profileContentElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.profileContentElements = [];
        
        // Cleanup voucher manager
        if (this.voucherManager) {
            this.voucherManager.destroy();
            this.voucherManager = null;
        }

        // Cleanup badges tab
        if (this.badgesContainer) {
            this.badgesContainer.destroy();
            this.badgesContainer = null;
        }
        if (this.badgesMask) {
            this.badgesMask.destroy();
            this.badgesMask = null;
        }
        this.badgesScrollY = 0;
    }

    /**
     * Create tab buttons for Profile, Vouchers, and Badges
     */
    private createTabs(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        const tabY = modalY - modalHeight / 2 + 75;
        const tabWidth = 75;
        const tabHeight = 26;
        const tabSpacing = 8;
        const totalWidth = tabWidth * 3 + tabSpacing * 2;
        const startX = modalX - totalWidth / 2 + tabWidth / 2 + 10;

        // Profile tab
        const profileTabBg = this.scene.add.rectangle(
            startX,
            tabY,
            tabWidth,
            tabHeight,
            this.activeTab === 'profile' ? 0x5D4037 : 0x3E2723,
            1
        );
        profileTabBg.setStrokeStyle(2, this.activeTab === 'profile' ? 0xFFD700 : 0x5D4037);
        profileTabBg.setDepth(5102);
        profileTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(profileTabBg);
        this.tabElements.push(profileTabBg);

        const profileTabText = this.scene.add.text(
            startX,
            tabY,
            '👤 Profile',
            {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: this.activeTab === 'profile' ? '#FFD700' : '#BCAAA4',
                resolution: 2
            }
        );
        profileTabText.setOrigin(0.5);
        profileTabText.setDepth(5103);
        this.scene.cameras.main.ignore(profileTabText);
        this.tabElements.push(profileTabText);

        // Vouchers tab
        const vouchersTabBg = this.scene.add.rectangle(
            startX + tabWidth + tabSpacing,
            tabY,
            tabWidth,
            tabHeight,
            this.activeTab === 'vouchers' ? 0x5D4037 : 0x3E2723,
            1
        );
        vouchersTabBg.setStrokeStyle(2, this.activeTab === 'vouchers' ? 0xFFD700 : 0x5D4037);
        vouchersTabBg.setDepth(5102);
        vouchersTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(vouchersTabBg);
        this.tabElements.push(vouchersTabBg);

        const vouchersTabText = this.scene.add.text(
            startX + tabWidth + tabSpacing,
            tabY,
            '🎁 Vouchers',
            {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: this.activeTab === 'vouchers' ? '#FFD700' : '#BCAAA4',
                resolution: 2
            }
        );
        vouchersTabText.setOrigin(0.5);
        vouchersTabText.setDepth(5103);
        this.scene.cameras.main.ignore(vouchersTabText);
        this.tabElements.push(vouchersTabText);

        // Badges tab
        const badgesTabBg = this.scene.add.rectangle(
            startX + (tabWidth + tabSpacing) * 2,
            tabY,
            tabWidth,
            tabHeight,
            this.activeTab === 'badges' ? 0x5D4037 : 0x3E2723,
            1
        );
        badgesTabBg.setStrokeStyle(2, this.activeTab === 'badges' ? 0xFFD700 : 0x5D4037);
        badgesTabBg.setDepth(5102);
        badgesTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(badgesTabBg);
        this.tabElements.push(badgesTabBg);

        const badgesTabText = this.scene.add.text(
            startX + (tabWidth + tabSpacing) * 2,
            tabY,
            '🏅 Badges',
            {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: this.activeTab === 'badges' ? '#FFD700' : '#BCAAA4',
                resolution: 2
            }
        );
        badgesTabText.setOrigin(0.5);
        badgesTabText.setDepth(5103);
        this.scene.cameras.main.ignore(badgesTabText);
        this.tabElements.push(badgesTabText);

        // Tab click handlers
        profileTabBg.on('pointerdown', () => {
            if (this.activeTab !== 'profile') {
                this.activeTab = 'profile';
                this.refreshModalContent(modalX, modalY, modalWidth, modalHeight);
            }
        });
        profileTabBg.on('pointerover', () => {
            if (this.activeTab !== 'profile') profileTabBg.setFillStyle(0x4E342E, 1);
        });
        profileTabBg.on('pointerout', () => {
            if (this.activeTab !== 'profile') profileTabBg.setFillStyle(0x3E2723, 1);
        });

        vouchersTabBg.on('pointerdown', () => {
            if (this.activeTab !== 'vouchers') {
                this.activeTab = 'vouchers';
                this.refreshModalContent(modalX, modalY, modalWidth, modalHeight);
            }
        });
        vouchersTabBg.on('pointerover', () => {
            if (this.activeTab !== 'vouchers') vouchersTabBg.setFillStyle(0x4E342E, 1);
        });
        vouchersTabBg.on('pointerout', () => {
            if (this.activeTab !== 'vouchers') vouchersTabBg.setFillStyle(0x3E2723, 1);
        });

        badgesTabBg.on('pointerdown', () => {
            if (this.activeTab !== 'badges') {
                this.activeTab = 'badges';
                this.refreshModalContent(modalX, modalY, modalWidth, modalHeight);
            }
        });
        badgesTabBg.on('pointerover', () => {
            if (this.activeTab !== 'badges') badgesTabBg.setFillStyle(0x4E342E, 1);
        });
        badgesTabBg.on('pointerout', () => {
            if (this.activeTab !== 'badges') badgesTabBg.setFillStyle(0x3E2723, 1);
        });

        // Animate tabs
        [profileTabBg, profileTabText, vouchersTabBg, vouchersTabText, badgesTabBg, badgesTabText].forEach(el => {
            (el as any).setAlpha(0);
            this.scene.tweens.add({ targets: el, alpha: 1, duration: 150 });
        });
    }

    /**
     * Refresh modal content when switching tabs
     */
    private refreshModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        // Clear current content
        this.profileContentElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.profileContentElements = [];

        if (this.voucherManager) {
            this.voucherManager.destroy();
            this.voucherManager = null;
        }

        // Update tab styles
        this.tabElements.forEach(el => el.destroy());
        this.tabElements = [];
        this.createTabs(modalX, modalY, modalWidth, modalHeight);

        // Create new content
        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();
        if (user) {
            this.createModalContent(modalX, modalY, modalWidth, modalHeight, user);
        }
    }

    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number, user: any): void {
        // Close button (always visible)
        const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 50, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5102);
        closeBtnBg.setAlpha(0);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.modalElements.push(closeBtnBg);

        const closeText = this.scene.add.text(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 50, 'X', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5103);
        closeText.setAlpha(0);
        closeText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(closeText);
        this.modalElements.push(closeText);

        this.scene.tweens.add({
            targets: [closeBtnBg, closeText],
            alpha: 1,
            duration: 150
        });

        closeBtnBg.on('pointerdown', () => this.close());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Content area starts below tabs
        const contentStartY = modalY - modalHeight / 2 + 100;
        const contentHeight = modalHeight - 80;

        if (this.activeTab === 'profile') {
            this.createProfileContent(modalX, contentStartY, modalWidth, contentHeight, user);
        } else if (this.activeTab === 'vouchers') {
            this.createVouchersContent(modalX, contentStartY, modalWidth, contentHeight);
        } else if (this.activeTab === 'badges') {
            this.createBadgesTabContent(modalX, contentStartY, modalWidth, contentHeight);
        }
    }

    /**
     * Create profile tab content
     */
    private createProfileContent(modalX: number, contentStartY: number, modalWidth: number, contentHeight: number, user: any): void {
        const avatarY = contentStartY + 30;
        const avatarSize = 64;

        // Avatar frame
        const avatarFrame = this.scene.add.sprite(modalX, avatarY, 'square-buttons', 6);
        avatarFrame.setDisplaySize(avatarSize + 12, avatarSize + 12);
        avatarFrame.setDepth(5102);
        avatarFrame.setAlpha(0);
        avatarFrame.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(avatarFrame);
        this.profileContentElements.push(avatarFrame);

        this.scene.tweens.add({ targets: avatarFrame, alpha: 1, duration: 150 });

        // Avatar image - load actual avatar if available
        if (user.avatar) {
            this.loadModalAvatar(user.avatar, modalX, avatarY, avatarSize);
        } else {
            const modalAvatar = this.scene.add.image(modalX, avatarY, 'default-avatar');
            modalAvatar.setDisplaySize(avatarSize, avatarSize);
            modalAvatar.setDepth(5103);
            modalAvatar.setAlpha(0);
            this.scene.cameras.main.ignore(modalAvatar);
            this.profileContentElements.push(modalAvatar);
            this.scene.tweens.add({ targets: modalAvatar, alpha: 1, duration: 150 });
        }

        // Edit avatar button
        const editAvatarBtn = this.scene.add.text(modalX, avatarY + avatarSize / 2 + 12, 'Edit Avatar', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        editAvatarBtn.setOrigin(0.5);
        editAvatarBtn.setDepth(5104);
        editAvatarBtn.setAlpha(0);
        editAvatarBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(editAvatarBtn);
        this.profileContentElements.push(editAvatarBtn);

        this.scene.tweens.add({ targets: editAvatarBtn, alpha: 1, duration: 150 });

        editAvatarBtn.on('pointerdown', () => this.openEditField('avatar', user.avatar || ''));
        editAvatarBtn.on('pointerover', () => editAvatarBtn.setColor('#86efac'));
        editAvatarBtn.on('pointerout', () => editAvatarBtn.setColor('#4ade80'));

        avatarFrame.on('pointerdown', () => this.openEditField('avatar', user.avatar || ''));
        avatarFrame.on('pointerover', () => avatarFrame.setTint(0xcccccc));
        avatarFrame.on('pointerout', () => avatarFrame.clearTint());

        // Profile fields
        const fieldStartY = avatarY + avatarSize / 2 + 35;
        const fieldSpacing = 26;
        const labelX = modalX - modalWidth / 2 + 40;
        const valueX = modalX - modalWidth / 2 + 95;
        const editX = modalX + modalWidth / 2 - 35;

        // Username
        this.createProfileField('Name', user.username || 'Not set', labelX, valueX, editX, fieldStartY, 'username', user);

        // Wallet Address with copy button
        this.createWalletField(user.address, labelX, modalX, fieldStartY + fieldSpacing, modalWidth);

        // XP (read-only)
        this.createReadOnlyField('XP:', user.xp.toString(), labelX, valueX, fieldStartY + fieldSpacing * 2);

        // Score (read-only)
        this.createReadOnlyField('Score:', user.reputationScore.toString(), labelX, valueX, fieldStartY + fieldSpacing * 3);

        // Logout button
        const logoutY = contentStartY + contentHeight - 60;
        const logoutBg = this.scene.add.sprite(modalX, logoutY, 'square-buttons', 7);
        logoutBg.setDisplaySize(110, 34);
        logoutBg.setDepth(5102);
        logoutBg.setAlpha(0);
        logoutBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(logoutBg);
        this.profileContentElements.push(logoutBg);

        const logoutText = this.scene.add.text(modalX, logoutY, 'Log Out', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        logoutText.setOrigin(0.5);
        logoutText.setDepth(5103);
        logoutText.setAlpha(0);
        logoutText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(logoutText);
        this.profileContentElements.push(logoutText);

        this.scene.tweens.add({
            targets: [logoutBg, logoutText],
            alpha: 1,
            duration: 150,
            delay: 100
        });

        logoutBg.on('pointerdown', () => {
            this.close();
            this.handleLogout();
        });
        logoutBg.on('pointerover', () => logoutBg.setTint(0xcccccc));
        logoutBg.on('pointerout', () => logoutBg.clearTint());
    }

    /**
     * Create vouchers tab content
     */
    private createVouchersContent(modalX: number, contentStartY: number, modalWidth: number, contentHeight: number): void {
        // Initialize voucher manager
        this.voucherManager = new NFTVoucherManager(this.scene, {
            showToastMessage: (text, color) => {
                // Simple toast - can be enhanced
                console.log(`[Voucher] ${text}`);
            }
        });

        // Load sample vouchers (replace with API call later)
        this.voucherManager.loadVouchers(SAMPLE_VOUCHERS);

        // Calculate center of content area
        // contentStartY is the TOP of the content area
        const centerY = contentStartY + contentHeight / 2;
        const listWidth = modalWidth - 60;
        const listHeight = contentHeight - 20;

        // Create voucher list
        const voucherElements = this.voucherManager.createVoucherList(
            modalX + 10,
            centerY,
            listWidth,
            listHeight,
            5200
        );

        // Track elements for cleanup
        voucherElements.forEach(el => this.profileContentElements.push(el));
    }

    /**
     * Create badges tab content - Grid of all badges (6 columns, scrollable)
     */
    private createBadgesTabContent(modalX: number, contentStartY: number, modalWidth: number, contentHeight: number): void {
        // Reset scroll position
        this.badgesScrollY = 0;

        // Grid configuration
        const columns = 5;
        const cellSize = 35;
        const cellSpacing = 10;
        const gridWidth = columns * cellSize + (columns - 1) * cellSpacing;
        const startX = modalX - gridWidth / 2 + cellSize / 2 + 10;
        const startY = contentStartY + 20;

        // Create container for scrollable content
        this.badgesContainer = this.scene.add.container(0, 25);
        this.badgesContainer.setDepth(5150);
        this.scene.cameras.main.ignore(this.badgesContainer);
        this.profileContentElements.push(this.badgesContainer);

        // Create mask for scrolling area
        const maskGraphics = this.scene.add.graphics();
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(
            modalX - modalWidth / 2 + 40,
            contentStartY,
            modalWidth - 60,
            contentHeight - 40
        );
        const mask = maskGraphics.createGeometryMask();
        this.badgesContainer.setMask(mask);
        this.badgesMask = maskGraphics;
        this.scene.cameras.main.ignore(maskGraphics);

        // Get all badges
        const allBadges = AVAILABLE_BADGES;
        const rows = Math.ceil(allBadges.length / columns);

        allBadges.forEach((badge, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const x = startX + col * (cellSize + cellSpacing);
            const y = startY + row * (cellSize + cellSpacing);

            const isClaimed = BadgeService.isBadgeClaimed(badge.id);

            // Badge background
            const badgeBg = this.scene.add.rectangle(x, y, cellSize, cellSize, isClaimed ? 0x2d5a3d : 0x3E2723, 0.8);
            badgeBg.setStrokeStyle(2, isClaimed ? 0x4ade80 : 0x5D4037);
            badgeBg.setInteractive({ useHandCursor: true });
            this.badgesContainer!.add(badgeBg);

            // Badge icon
            const badgeIcon = this.scene.add.text(x, y - 3, badge.icon, {
                fontSize: '18px',
                resolution: 2
            });
            badgeIcon.setOrigin(0.5);
            badgeIcon.setAlpha(isClaimed ? 1 : 0.4);
            this.badgesContainer!.add(badgeIcon);

            // Hover tooltip
            badgeBg.on('pointerover', () => {
                this.showBadgeTooltip(x, y - cellSize / 2 + 10, badge, isClaimed);
                badgeBg.setStrokeStyle(2, 0xFFD700);
            });
            badgeBg.on('pointerout', () => {
                this.hideBadgeTooltip();
                badgeBg.setStrokeStyle(2, isClaimed ? 0x4ade80 : 0x5D4037);
            });

            // Glow animation for claimed badges
            if (isClaimed) {
                this.scene.tweens.add({
                    targets: badgeIcon,
                    scale: 1.1,
                    duration: 800,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        });

        // Calculate if scrolling is needed
        const totalHeight = rows * (cellSize + cellSpacing);
        const visibleHeight = contentHeight - 60;
        const maxScroll = Math.max(0, totalHeight - visibleHeight);

        // Enable scrolling if content exceeds visible area
        if (maxScroll > 0) {
            // Scroll indicator
            const scrollHint = this.scene.add.text(modalX, contentStartY + contentHeight - 25, '↕ Scroll for more', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#BCAAA4',
                resolution: 2
            });
            scrollHint.setOrigin(0.5);
            scrollHint.setDepth(5151);
            this.scene.cameras.main.ignore(scrollHint);
            this.profileContentElements.push(scrollHint);

            // Mouse wheel scrolling
            this.scene.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => {
                if (!this.badgesContainer || this.activeTab !== 'badges') return;
                
                // Check if pointer is within modal bounds
                const modalLeft = modalX - modalWidth / 2;
                const modalRight = modalX + modalWidth / 2;
                const modalTop = contentStartY;
                const modalBottom = contentStartY + contentHeight;
                
                if (pointer.x >= modalLeft && pointer.x <= modalRight &&
                    pointer.y >= modalTop && pointer.y <= modalBottom) {
                    this.badgesScrollY = Phaser.Math.Clamp(
                        this.badgesScrollY + deltaY * 0.5,
                        0,
                        maxScroll
                    );
                    this.badgesContainer.y = -this.badgesScrollY;
                }
            });
        }

        // Title
        const title = this.scene.add.text(modalX, contentStartY + 5, 'All Badges', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5151);
        title.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(title);
        this.profileContentElements.push(title);

        // Stats
        const claimedCount = allBadges.filter(b => BadgeService.isBadgeClaimed(b.id)).length;
        const statsText = this.scene.add.text(modalX, contentStartY + contentHeight - 10, `${claimedCount}/${allBadges.length} Collected`, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        statsText.setOrigin(0.5);
        statsText.setDepth(5151);
        this.scene.cameras.main.ignore(statsText);
        this.profileContentElements.push(statsText);
    }

    private badgeTooltip: Phaser.GameObjects.Container | null = null;

    private showBadgeTooltip(x: number, y: number, badge: Badge, isClaimed: boolean): void {
        this.hideBadgeTooltip();

        const container = this.scene.add.container(x, y);
        container.setDepth(5200);
        this.scene.cameras.main.ignore(container);

        const bg = this.scene.add.rectangle(0, 0, 100, 32, 0x3E2723, 0.95);
        bg.setStrokeStyle(1, 0x5D4037);
        container.add(bg);

        const nameText = this.scene.add.text(0, -6, badge.name, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: isClaimed ? '#4ade80' : '#FFFFFF',
            resolution: 2
        });
        nameText.setOrigin(0.5);
        container.add(nameText);

        const statusText = this.scene.add.text(0, 6, isClaimed ? '✓ Claimed' : 'Not claimed', {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: isClaimed ? '#4ade80' : '#BCAAA4',
            resolution: 2
        });
        statusText.setOrigin(0.5);
        container.add(statusText);

        this.badgeTooltip = container;
        this.profileContentElements.push(container);

        container.setAlpha(0);
        container.setScale(0.8);
        this.scene.tweens.add({
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

    private createProfileField(label: string, value: string, labelX: number, valueX: number, editX: number, y: number, fieldName: string, user: any): void {
        const labelText = this.scene.add.text(labelX, y, label + ':', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        labelText.setDepth(5102);
        labelText.setAlpha(0);
        labelText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(labelText);
        this.profileContentElements.push(labelText);

        const displayValue = value.length > 10 ? value.slice(0, 9) + '..' : value;
        const valueText = this.scene.add.text(valueX, y, displayValue, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        valueText.setDepth(5102);
        valueText.setAlpha(0);
        valueText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(valueText);
        this.profileContentElements.push(valueText);

        const editBtn = this.scene.add.text(editX - 18, y, 'Edit', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        editBtn.setDepth(5102);
        editBtn.setAlpha(0);
        editBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(editBtn);
        this.profileContentElements.push(editBtn);

        this.scene.tweens.add({
            targets: [labelText, valueText, editBtn],
            alpha: 1,
            duration: 150,
            delay: 50
        });

        editBtn.on('pointerdown', () => this.openEditField(fieldName, value));
        editBtn.on('pointerover', () => editBtn.setColor('#86efac'));
        editBtn.on('pointerout', () => editBtn.setColor('#4ade80'));
    }

    private createReadOnlyField(label: string, value: string, labelX: number, valueX: number, y: number): void {
        const labelText = this.scene.add.text(labelX, y, label, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        labelText.setDepth(5102);
        labelText.setAlpha(0);
        labelText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(labelText);
        this.profileContentElements.push(labelText);

        const valueText = this.scene.add.text(valueX, y, value, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        valueText.setDepth(5102);
        valueText.setAlpha(0);
        valueText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(valueText);
        this.profileContentElements.push(valueText);

        this.scene.tweens.add({
            targets: [labelText, valueText],
            alpha: 1,
            duration: 150,
            delay: 50
        });
    }

    private createWalletField(address: string, labelX: number, centerX: number, y: number, modalWidth: number): void {
        const labelText = this.scene.add.text(labelX, y, 'Wallet:', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        labelText.setDepth(5102);
        labelText.setAlpha(0);
        labelText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(labelText);
        this.profileContentElements.push(labelText);

        // Show shortened address
        const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        const addressText = this.scene.add.text(labelX + 50, y, shortAddress, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        addressText.setDepth(5102);
        addressText.setAlpha(0);
        addressText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(addressText);
        this.profileContentElements.push(addressText);

        // Copy button
        const copyBtnX = centerX + modalWidth / 2 - 53;
        const copyBtn = this.scene.add.text(copyBtnX, y, 'Copy', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        copyBtn.setDepth(5102);
        copyBtn.setAlpha(0);
        copyBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(copyBtn);
        this.profileContentElements.push(copyBtn);

        this.scene.tweens.add({
            targets: [labelText, addressText, copyBtn],
            alpha: 1,
            duration: 150,
            delay: 50
        });

        copyBtn.on('pointerdown', async () => {
            try {
                await navigator.clipboard.writeText(address);
                copyBtn.setText('Copied!');
                copyBtn.setColor('#86efac');
                this.scene.time.delayedCall(1500, () => {
                    copyBtn.setText('Copy');
                    copyBtn.setColor('#4ade80');
                });
            } catch {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = address;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                copyBtn.setText('Copied!');
                copyBtn.setColor('#86efac');
                this.scene.time.delayedCall(1500, () => {
                    copyBtn.setText('Copy');
                    copyBtn.setColor('#4ade80');
                });
            }
        });
        copyBtn.on('pointerover', () => copyBtn.setColor('#86efac'));
        copyBtn.on('pointerout', () => {
            if (copyBtn.text === 'Copy') copyBtn.setColor('#4ade80');
        });
    }

    private openEditField(fieldName: string, currentValue: string): void {
        if (this.editFormOpen) return;
        this.editFormOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const formWidth = 280;
        const formHeight = fieldName === 'avatar' ? 200 : 160;
        const formX = screenWidth / 2;
        const formY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.7);
        overlay.setDepth(5200);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.editFormElements.push(overlay);

        // Form background
        const formBg = this.scene.add.sprite(formX, formY, 'settings-panel', 1);
        formBg.setDisplaySize(formWidth, formHeight);
        formBg.setDepth(5201);
        formBg.setInteractive();
        formBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(formBg);
        this.editFormElements.push(formBg);

        formBg.setScale(0);
        this.scene.tweens.add({
            targets: formBg,
            scaleX: formWidth / 125,
            scaleY: formHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        const titleText = fieldName === 'avatar' ? 'Edit Avatar' : 'Edit Username';
        const title = this.scene.add.text(formX, formY - formHeight / 2 + 30, titleText, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5202);
        title.setStroke('#5D4037', 2);
        title.setAlpha(0);
        this.scene.cameras.main.ignore(title);
        this.editFormElements.push(title);

        this.scene.time.delayedCall(100, () => {
            this.scene.tweens.add({ targets: title, alpha: 1, duration: 150 });

            if (fieldName === 'avatar') {
                this.createAvatarEditForm(formX, formY, currentValue);
            } else {
                this.createTextEditForm(formX, formY, fieldName, currentValue);
            }
        });

        overlay.on('pointerdown', () => this.closeEditForm());
    }

    private createTextEditForm(formX: number, formY: number, fieldName: string, currentValue: string): void {
        this.editInput = document.createElement('input');
        this.editInput.type = 'text';
        this.editInput.value = currentValue;
        this.editInput.placeholder = `Enter ${fieldName}...`;
        this.editInput.maxLength = 20;
        this.editInput.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -20px);
            width: 200px;
            padding: 10px 15px;
            font-size: 14px;
            font-family: 'PixelFont', monospace;
            border: 3px solid #5D4037;
            border-radius: 8px;
            background-color: #FFF8E1;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
        `;
        document.body.appendChild(this.editInput);

        this.editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const newValue = this.editInput?.value.trim();
                if (newValue && newValue !== currentValue) {
                    this.updateUserField(fieldName, newValue);
                }
                this.closeEditForm();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                this.closeEditForm();
                e.preventDefault();
            }
            e.stopPropagation();
        });
        this.editInput.addEventListener('keyup', (e) => e.stopPropagation());
        this.editInput.addEventListener('keypress', (e) => e.stopPropagation());
        this.editInput.focus();

        // Buttons
        this.createEditFormButtons(formX, formY + 40, fieldName, currentValue);
    }

    private createAvatarEditForm(formX: number, formY: number, currentValue: string): void {
        // URL label
        const urlLabel = this.scene.add.text(formX, formY - 35, 'Enter Image URL:', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        urlLabel.setOrigin(0.5);
        urlLabel.setDepth(5202);
        urlLabel.setStroke('#5D4037', 2);
        urlLabel.setAlpha(0);
        this.scene.cameras.main.ignore(urlLabel);
        this.editFormElements.push(urlLabel);

        this.scene.tweens.add({ targets: urlLabel, alpha: 1, duration: 150 });

        // Input
        this.editInput = document.createElement('input');
        this.editInput.type = 'text';
        this.editInput.value = currentValue;
        this.editInput.placeholder = 'https://example.com/avatar.png';
        this.editInput.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -15px);
            width: 220px;
            padding: 8px 12px;
            font-size: 12px;
            font-family: 'PixelFont', monospace;
            border: 3px solid #5D4037;
            border-radius: 8px;
            background-color: #FFF8E1;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
        `;
        document.body.appendChild(this.editInput);

        this.editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const newValue = this.editInput?.value.trim();
                if (newValue && newValue !== currentValue) {
                    this.updateUserField('avatar', newValue);
                }
                this.closeEditForm();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                this.closeEditForm();
                e.preventDefault();
            }
            e.stopPropagation();
        });
        this.editInput.addEventListener('keyup', (e) => e.stopPropagation());
        this.editInput.addEventListener('keypress', (e) => e.stopPropagation());
        this.editInput.focus();

        // Or label
        const orLabel = this.scene.add.text(formX, formY + 20, '- or -', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        orLabel.setOrigin(0.5);
        orLabel.setDepth(5202);
        orLabel.setStroke('#5D4037', 2);
        orLabel.setAlpha(0);
        this.scene.cameras.main.ignore(orLabel);
        this.editFormElements.push(orLabel);

        this.scene.tweens.add({ targets: orLabel, alpha: 1, duration: 150, delay: 50 });

        // Upload button
        const uploadBtnBg = this.scene.add.sprite(formX, formY + 45, 'square-buttons', 6);
        uploadBtnBg.setDisplaySize(120, 28);
        uploadBtnBg.setDepth(5202);
        uploadBtnBg.setAlpha(0);
        uploadBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(uploadBtnBg);
        this.editFormElements.push(uploadBtnBg);

        const uploadText = this.scene.add.text(formX, formY + 45, 'Upload Image', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        uploadText.setOrigin(0.5);
        uploadText.setDepth(5203);
        uploadText.setStroke('#5D4037', 2);
        uploadText.setAlpha(0);
        this.scene.cameras.main.ignore(uploadText);
        this.editFormElements.push(uploadText);

        this.scene.tweens.add({
            targets: [uploadBtnBg, uploadText],
            alpha: 1,
            duration: 150,
            delay: 50
        });

        // File input
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        document.body.appendChild(this.fileInput);

        uploadBtnBg.on('pointerdown', () => this.fileInput?.click());
        uploadBtnBg.on('pointerover', () => uploadBtnBg.setTint(0xcccccc));
        uploadBtnBg.on('pointerout', () => uploadBtnBg.clearTint());

        this.fileInput.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                uploadText.setText('Uploading...');
                uploadBtnBg.disableInteractive();

                try {
                    const { IPFSService } = await import('../../services/ipfsService');
                    const ipfsUrl = await IPFSService.uploadImage(file);
                    if (this.editInput) this.editInput.value = ipfsUrl;
                    uploadText.setText('Uploaded!');
                    uploadText.setColor('#4ade80');
                    setTimeout(() => {
                        uploadText.setText('Upload Image');
                        uploadText.setColor('#FFFFFF');
                        uploadBtnBg.setInteractive({ useHandCursor: true });
                    }, 2000);
                } catch {
                    uploadText.setText('Upload Failed');
                    uploadText.setColor('#ff4444');
                    setTimeout(() => {
                        uploadText.setText('Upload Image');
                        uploadText.setColor('#FFFFFF');
                        uploadBtnBg.setInteractive({ useHandCursor: true });
                    }, 2000);
                }
            }
        });

        // Buttons
        this.createEditFormButtons(formX, formY + 80, 'avatar', currentValue);
    }

    private createEditFormButtons(formX: number, formY: number, fieldName: string, currentValue: string): void {
        const saveBtnBg = this.scene.add.sprite(formX - 50, formY, 'square-buttons', 6);
        saveBtnBg.setDisplaySize(80, 32);
        saveBtnBg.setDepth(5202);
        saveBtnBg.setAlpha(0);
        saveBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(saveBtnBg);
        this.editFormElements.push(saveBtnBg);

        const saveText = this.scene.add.text(formX - 50, formY, 'Save', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        saveText.setOrigin(0.5);
        saveText.setDepth(5203);
        saveText.setStroke('#5D4037', 2);
        saveText.setAlpha(0);
        this.scene.cameras.main.ignore(saveText);
        this.editFormElements.push(saveText);

        const cancelBtnBg = this.scene.add.sprite(formX + 50, formY, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(80, 32);
        cancelBtnBg.setDepth(5202);
        cancelBtnBg.setAlpha(0);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cancelBtnBg);
        this.editFormElements.push(cancelBtnBg);

        const cancelText = this.scene.add.text(formX + 50, formY, 'Cancel', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        cancelText.setOrigin(0.5);
        cancelText.setDepth(5203);
        cancelText.setStroke('#5D4037', 2);
        cancelText.setAlpha(0);
        this.scene.cameras.main.ignore(cancelText);
        this.editFormElements.push(cancelText);

        this.scene.tweens.add({
            targets: [saveBtnBg, saveText, cancelBtnBg, cancelText],
            alpha: 1,
            duration: 150
        });

        saveBtnBg.on('pointerdown', () => {
            const newValue = this.editInput?.value.trim();
            if (newValue && newValue !== currentValue) {
                this.updateUserField(fieldName, newValue);
            }
            this.closeEditForm();
        });
        saveBtnBg.on('pointerover', () => saveBtnBg.setTint(0xcccccc));
        saveBtnBg.on('pointerout', () => saveBtnBg.clearTint());

        cancelBtnBg.on('pointerdown', () => this.closeEditForm());
        cancelBtnBg.on('pointerover', () => cancelBtnBg.setTint(0xcccccc));
        cancelBtnBg.on('pointerout', () => cancelBtnBg.clearTint());
    }

    private closeEditForm(): void {
        this.editFormOpen = false;

        if (this.editInput && this.editInput.parentNode) {
            this.editInput.parentNode.removeChild(this.editInput);
        }
        this.editInput = null;

        if (this.fileInput && this.fileInput.parentNode) {
            this.fileInput.parentNode.removeChild(this.fileInput);
        }
        this.fileInput = null;

        this.editFormElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.editFormElements = [];
    }

    private async updateUserField(fieldName: string, value: string): Promise<void> {
        const updates: { username?: string; avatar?: string } = {};
        if (fieldName === 'username') {
            updates.username = value;
        } else if (fieldName === 'avatar') {
            updates.avatar = value;
        }

        const updatedUser = await UserService.updateUser(updates);
        if (updatedUser) {
            this.close();
            this.createProfileUI();
            this.open();
        }
    }

    private handleLogout(): void {
        EventBus.emit('disconnect-wallet');
        this.destroyProfileElements();
        UserService.clearAuthData();
        this.callbacks.onLogout();
    }

    public destroy(): void {
        this.closeEditForm();
        this.close();
        this.destroyProfileElements();
        super.destroy();
    }
}
