import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { UserService } from '../UserService';
import { GameDataService } from '../GameDataService';
import { EventBus } from '../EventBus';
import { useGameState } from '../hooks/useGameState';
import { NFTVoucherManager, SAMPLE_VOUCHERS } from './NFTVoucherManager';
import { BadgeService, Badge, SoulboundToken, ApiBadge } from '../BadgeService';
import { PLAYABLE_CHARACTERS } from '../config/CharacterConfig';
import { QuickActionsManager } from './QuickActionsManager';

interface ProfileCallbacks {
    onLogout: () => void;
    onWalletConnected: (address: string) => void;
    showToastMessage?: (text: string, color: number) => void;
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
    private badgesLoading: boolean = false;
    private userBadges: SoulboundToken[] = [];
    private allBadges: ApiBadge[] = [];
    
    // Claim form elements
    private claimFormElements: Phaser.GameObjects.GameObject[] = [];
    private claimFormOpen: boolean = false;
    private proofInput: HTMLInputElement | null = null;

    // Quick actions manager (mission button, etc.)
    private quickActionsManager: QuickActionsManager | null = null;

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
        console.log('[ProfileManager] createProfileUI - XP:', user?.xp, 'Rep:', user?.reputationScore);
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
            // Use character avatar image based on characterType
            const characterType = user.characterType || 1;
            const characterIndex = Math.max(0, Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1));
            const characterKey = PLAYABLE_CHARACTERS[characterIndex]?.key || 'bear';
            const avatarKey = `${characterKey}-avatar`;

            // Use character avatar image if available, fallback to sprite
            if (this.scene.textures.exists(avatarKey)) {
                const avatar = this.scene.add.image(avatarBgX, avatarBgY, avatarKey);
                avatar.setDisplaySize(avatarSize, avatarSize);
                avatar.setDepth(5022);
                this.scene.cameras.main.ignore(avatar);
                this.profileElements.push(avatar);
                this.avatarImage = avatar;
            } else {
                const avatar = this.scene.add.sprite(avatarBgX, avatarBgY, characterKey, 0);
                avatar.setDisplaySize(avatarSize, avatarSize);
                avatar.setDepth(5022);
                this.scene.cameras.main.ignore(avatar);
                this.profileElements.push(avatar);
                this.avatarImage = avatar as unknown as Phaser.GameObjects.Image;
            }
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

        // Create quick action buttons below profile panel
        if (!this.quickActionsManager) {
            this.quickActionsManager = new QuickActionsManager(this.scene, {
                showToastMessage: this.callbacks.showToastMessage
            });
        }
        this.quickActionsManager.createButtons(panelX + 25, panelY, panelWidth, panelHeight);
        
        // Add quick action button elements to profile elements for camera ignore
        this.quickActionsManager.getButtonElements().forEach(el => {
            this.profileElements.push(el);
        });
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
            // Use character avatar image based on characterType
            const characterType = user.characterType || 1;
            const characterIndex = Math.max(0, Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1));
            const characterKey = PLAYABLE_CHARACTERS[characterIndex]?.key || 'bear';
            const avatarKey = `${characterKey}-avatar`;

            // Use character avatar image if available, fallback to sprite
            if (this.scene.textures.exists(avatarKey)) {
                const modalAvatar = this.scene.add.image(modalX, avatarY, avatarKey);
                modalAvatar.setDisplaySize(avatarSize, avatarSize);
                modalAvatar.setDepth(5103);
                modalAvatar.setAlpha(0);
                this.scene.cameras.main.ignore(modalAvatar);
                this.profileContentElements.push(modalAvatar);
                this.scene.tweens.add({ targets: modalAvatar, alpha: 1, duration: 150 });
            } else {
                const modalAvatar = this.scene.add.sprite(modalX, avatarY, characterKey, 0);
                modalAvatar.setDisplaySize(avatarSize, avatarSize);
                modalAvatar.setDepth(5103);
                modalAvatar.setAlpha(0);
                this.scene.cameras.main.ignore(modalAvatar);
                this.profileContentElements.push(modalAvatar);
                this.scene.tweens.add({ targets: modalAvatar, alpha: 1, duration: 150 });
            }
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
        const labelX = modalX - modalWidth / 2 + 50;
        const valueX = modalX - modalWidth / 2 + 95;
        const editX = modalX + modalWidth / 2 - 35;

        // Username
        this.createProfileField('Name', user.username || 'Not set', labelX, valueX, editX, fieldStartY, 'username', user);

        // Wallet Address with copy button and More option
        this.createWalletField(user, labelX, modalX, fieldStartY + fieldSpacing, modalWidth);

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
     * Create badges tab content - Shows claimed badges and unclaimed badges list
     */
    private async createBadgesTabContent(modalX: number, contentStartY: number, modalWidth: number, contentHeight: number): Promise<void> {
        // Reset scroll position
        this.badgesScrollY = 0;

        // Show loading state
        const loadingText = this.scene.add.text(modalX, contentStartY + contentHeight / 2, 'Loading badges...', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        loadingText.setOrigin(0.5);
        loadingText.setDepth(5151);
        this.scene.cameras.main.ignore(loadingText);
        this.profileContentElements.push(loadingText);

        // Fetch all badges from API
        this.badgesLoading = true;
        try {
            this.allBadges = await BadgeService.getAllBadges();
        } catch (error) {
            console.error('[ProfileManager] Error fetching badges:', error);
            this.allBadges = [];
        }
        this.badgesLoading = false;

        // Guard: Check if modal was closed while loading
        if (!this.isOpen || this.activeTab !== 'badges') {
            if (loadingText.active) loadingText.destroy();
            return;
        }

        // Remove loading text
        if (loadingText.active) loadingText.destroy();

        // Filter badges by status - PENDING is considered as owned (user already submitted proof)
        const claimedBadges = this.allBadges.filter(b => b.status === 'CLAIMED' || b.status === 'PENDING');
        const unclaimedBadges = this.allBadges.filter(b => b.status !== 'CLAIMED' && b.status !== 'PENDING');

        // Create container for scrollable content
        this.badgesContainer = this.scene.add.container(0, 0);
        this.badgesContainer.setDepth(5150);
        this.scene.cameras.main.ignore(this.badgesContainer);
        this.profileContentElements.push(this.badgesContainer);

        // Create mask for scrolling area
        const maskGraphics = this.scene.add.graphics();
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(
            modalX - modalWidth / 2 + 20,
            contentStartY,
            modalWidth - 40,
            contentHeight - 10
        );
        const mask = maskGraphics.createGeometryMask();
        this.badgesContainer.setMask(mask);
        this.badgesMask = maskGraphics;
        this.scene.cameras.main.ignore(maskGraphics);
        maskGraphics.setVisible(false);

        let currentY = contentStartY + 10;
        const leftX = modalX - modalWidth / 2 + 30;
        const rowWidth = modalWidth - 80;

        // ===== MY BADGES SECTION =====
        const myBadgesTitle = this.scene.add.text(modalX, currentY, `🏆 My Badges (${claimedBadges.length})`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        myBadgesTitle.setOrigin(0.5);
        myBadgesTitle.setStroke('#5D4037', 2);
        this.badgesContainer.add(myBadgesTitle);
        currentY += 20;

        if (claimedBadges.length === 0) {
            const noBadges = this.scene.add.text(modalX, currentY + 10, 'No badges claimed yet', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#9CA3AF',
                resolution: 2
            });
            noBadges.setOrigin(0.5);
            this.badgesContainer.add(noBadges);
            currentY += 30;
        } else {
            // Display claimed badges in grid
            const columns = 5;
            const cellSize = 32;
            const cellSpacing = 8;
            const gridWidth = columns * cellSize + (columns - 1) * cellSpacing;
            const gridStartX = modalX - gridWidth / 2 + cellSize / 2;

            claimedBadges.forEach((badge, index) => {
                const col = index % columns;
                const row = Math.floor(index / columns);
                const x = gridStartX + col * (cellSize + cellSpacing);
                const y = currentY + row * (cellSize + cellSpacing) + cellSize / 2;

                const badgeBg = this.scene.add.rectangle(x, y, cellSize, cellSize, 0x2d5a3d, 0.8);
                badgeBg.setStrokeStyle(2, 0x4ade80);
                badgeBg.setInteractive({ useHandCursor: true });
                this.badgesContainer!.add(badgeBg);

                const badgeIcon = this.scene.add.text(x, y, '🏆', {
                    fontSize: '16px',
                    resolution: 2
                });
                badgeIcon.setOrigin(0.5);
                this.badgesContainer!.add(badgeIcon);

                badgeBg.on('pointerover', () => {
                    badgeBg.setStrokeStyle(2, 0xFFD700);
                    this.showApiBadgeTooltip(x, y - cellSize / 2 - 15, badge);
                });
                badgeBg.on('pointerout', () => {
                    badgeBg.setStrokeStyle(2, 0x4ade80);
                    this.hideBadgeTooltip();
                });
            });

            const claimedRows = Math.ceil(claimedBadges.length / columns);
            currentY += claimedRows * (cellSize + cellSpacing) + 15;
        }

        // ===== UNCLAIMED BADGES SECTION =====
        currentY += 10;
        const unclaimedTitle = this.scene.add.text(modalX, currentY, `🔓 Available Badges (${unclaimedBadges.length})`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        unclaimedTitle.setOrigin(0.5);
        unclaimedTitle.setStroke('#5D4037', 2);
        this.badgesContainer.add(unclaimedTitle);
        currentY += 20;

        if (unclaimedBadges.length === 0) {
            const allClaimed = this.scene.add.text(modalX, currentY + 10, 'All badges claimed! 🎉', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#4ade80',
                resolution: 2
            });
            allClaimed.setOrigin(0.5);
            this.badgesContainer.add(allClaimed);
            currentY += 30;
        } else {
            // Display unclaimed badges as rows
            const rowHeight = 32;
            unclaimedBadges.forEach((badge) => {
                this.createBadgeRow(leftX + 20, currentY, rowWidth, badge);
                currentY += rowHeight + 4;
            });
        }

        // Calculate scrolling
        const totalHeight = currentY - contentStartY + 20;
        const visibleHeight = contentHeight - 10;
        const maxScroll = Math.max(0, totalHeight - visibleHeight);

        if (maxScroll > 0) {
            // Mouse wheel scrolling
            this.scene.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => {
                if (!this.badgesContainer || this.activeTab !== 'badges') return;
                
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
                    this.badgesContainer!.y = -this.badgesScrollY;
                }
            });
        }
    }

    /**
     * Create a badge row for unclaimed badges
     */
    private createBadgeRow(leftX: number, y: number, width: number, badge: ApiBadge): void {
        const isPending = badge.status === 'PENDING';
        const isLocked = badge.status === 'LOCKED';
        // const canClaim = badge.status === 'CAN_CLAIM' || badge.status === 'COMPLETED';
        const canClaim = badge.status === 'CAN_CLAIM';
        
        const rowHeight = 28;
        const rowCenterY = y + rowHeight / 2;
        
        // Row background
        let bgColor = 0x4A4035;
        let strokeColor = 0x6B5B4D;
        
        if (canClaim) {
            bgColor = 0x2d5a3d;
            strokeColor = 0x4ade80;
        } else if (isPending) {
            bgColor = 0x6B5B3D;
            strokeColor = 0xfbbf24;
        }
        
        const rowBg = this.scene.add.rectangle(leftX + width / 2, rowCenterY, width, rowHeight, bgColor, 0.9);
        rowBg.setStrokeStyle(1, strokeColor);
        this.badgesContainer!.add(rowBg);

        // Badge icon
        let iconEmoji = '🔒';
        if (canClaim) iconEmoji = '🏆';
        else if (isPending) iconEmoji = '⏳';
        
        const icon = this.scene.add.text(leftX + 18, rowCenterY, iconEmoji, {
            fontSize: '12px',
            resolution: 2
        });
        icon.setOrigin(0.5);
        icon.setAlpha(isLocked ? 0.5 : 0.9);
        this.badgesContainer!.add(icon);

        // Badge name
        let nameColor = '#FFFFFF';
        if (canClaim) nameColor = '#4ade80';
        else if (isPending) nameColor = '#fbbf24';
        
        const name = this.scene.add.text(leftX + 35, rowCenterY, badge.name, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: nameColor,
            resolution: 2
        });
        name.setOrigin(0, 0.5);
        name.setStroke('#3E2723', 1);
        this.badgesContainer!.add(name);

        // Button/Status
        const btnX = leftX + width - 35;
        
        if (isLocked) {
            const unlockBtn = this.scene.add.rectangle(btnX, rowCenterY, 45, 20, 0x6b7280, 1);
            unlockBtn.setStrokeStyle(1, 0x9ca3af);
            unlockBtn.setInteractive({ useHandCursor: true });
            this.badgesContainer!.add(unlockBtn);

            const unlockText = this.scene.add.text(btnX, rowCenterY, 'Unlock', {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            unlockText.setOrigin(0.5);
            this.badgesContainer!.add(unlockText);

            unlockBtn.on('pointerdown', () => this.openBadgeClaimForm(badge));
            unlockBtn.on('pointerover', () => unlockBtn.setFillStyle(0x9ca3af, 1));
            unlockBtn.on('pointerout', () => unlockBtn.setFillStyle(0x6b7280, 1));
        } else if (isPending) {
            const pendingText = this.scene.add.text(btnX, rowCenterY, 'Pending', {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#fbbf24',
                resolution: 2
            });
            pendingText.setOrigin(0.5);
            pendingText.setStroke('#3E2723', 1);
            this.badgesContainer!.add(pendingText);
        } else if (canClaim) {
            const claimBtn = this.scene.add.rectangle(btnX, rowCenterY, 45, 20, 0x4ade80, 1);
            claimBtn.setStrokeStyle(1, 0x86efac);
            claimBtn.setInteractive({ useHandCursor: true });
            this.badgesContainer!.add(claimBtn);

            const claimText = this.scene.add.text(btnX, rowCenterY, 'Claim', {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            claimText.setOrigin(0.5);
            claimText.setStroke('#166534', 1);
            this.badgesContainer!.add(claimText);

            claimBtn.on('pointerdown', async () => {
                claimBtn.disableInteractive();
                claimBtn.setFillStyle(0x6b7280, 1);
                claimText.setText('...');
                
                this.callbacks.showToastMessage?.('⏳ Claiming...', 0x4a90e2);
                const result = await BadgeService.claimBadge(badge.id, '');
                
                if (result.success) {
                    this.callbacks.showToastMessage?.(`🎉 "${badge.name}" claimed!`, 0x4ade80);
                    
                    // Update badge status in local array
                    badge.status = 'CLAIMED';
                    
                    // Update UI: Change button to "Claimed" state
                    claimBtn.setFillStyle(0x374151, 1);
                    claimBtn.setAlpha(0.7);
                    claimText.setText('✓ Claimed');
                    claimText.setFontSize('6px');
                    claimText.setColor('#9CA3AF');
                    
                    // Update row background color to claimed style
                    rowBg.setFillStyle(0x3d5a3d, 0.9);
                    rowBg.setStrokeStyle(1, 0x4ade80);
                    
                    // Update icon
                    icon.setText('🏆');
                    icon.setAlpha(0.9);
                    
                    // Update name color
                    name.setColor('#4ade80');
                } else {
                    this.callbacks.showToastMessage?.(`❌ ${result.message}`, 0xef4444);
                    claimBtn.setInteractive({ useHandCursor: true });
                    claimBtn.setFillStyle(0x4ade80, 1);
                    claimText.setText('Claim');
                }
            });
            claimBtn.on('pointerover', () => claimBtn.setFillStyle(0x86efac, 1));
            claimBtn.on('pointerout', () => claimBtn.setFillStyle(0x4ade80, 1));
        }
    }

    /**
     * Show tooltip for API badge
     */
    private showApiBadgeTooltip(x: number, y: number, badge: ApiBadge): void {
        this.hideBadgeTooltip();

        const container = this.scene.add.container(x, y);
        container.setDepth(5200);
        this.scene.cameras.main.ignore(container);

        const bg = this.scene.add.rectangle(0, 0, 100, 28, 0x3E2723, 0.95);
        bg.setStrokeStyle(1, 0x5D4037);
        container.add(bg);

        const nameText = this.scene.add.text(0, 0, badge.name, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        nameText.setOrigin(0.5);
        container.add(nameText);

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

    /**
     * Open claim form for LOCKED badges
     */
    private openBadgeClaimForm(badge: ApiBadge): void {
        if (this.claimFormOpen) return;
        this.claimFormOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const formWidth = 280;
        const formHeight = 250;
        const formX = screenWidth / 2;
        const formY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(formX, formY, screenWidth, screenHeight, 0x000000, 0.8);
        overlay.setDepth(6000);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.claimFormElements.push(overlay);

        // Form background
        const formBg = this.scene.add.sprite(formX, formY, 'settings-panel', 1);
        formBg.setDisplaySize(formWidth, formHeight);
        formBg.setDepth(6001);
        formBg.setInteractive();
        formBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.scene.cameras.main.ignore(formBg);
        this.claimFormElements.push(formBg);

        formBg.setScale(0);
        this.scene.tweens.add({
            targets: formBg,
            scaleX: formWidth / 125,
            scaleY: formHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        const title = this.scene.add.text(formX, formY - formHeight / 2 + 25, `🔓 ${badge.name}`, {
            fontSize: '13px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(6002);
        title.setStroke('#3E2723', 3);
        this.scene.cameras.main.ignore(title);
        this.claimFormElements.push(title);

        // Description
        const description = this.scene.add.text(formX + 10, formY - formHeight / 2 + 50, badge.description, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#3E2723',
            resolution: 2,
            wordWrap: { width: formWidth - 60 },
            align: 'center',
            lineSpacing: 6
        });
        description.setOrigin(0.5);
        description.setDepth(6002);
        this.scene.cameras.main.ignore(description);
        this.claimFormElements.push(description);

        // Instructions
        const instructions = this.scene.add.text(formX, formY - 15, 'Submit proof (link or description):', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2
        });
        instructions.setOrigin(0.5);
        instructions.setDepth(6002);
        this.scene.cameras.main.ignore(instructions);
        this.claimFormElements.push(instructions);

        // Note
        const note = this.scene.add.text(formX, formY + 75, '⏳ Admin will verify your proof', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#f59e0b',
            resolution: 2
        });
        note.setOrigin(0.5);
        note.setDepth(6002);
        note.setStroke('#3E2723', 2);
        this.scene.cameras.main.ignore(note);
        this.claimFormElements.push(note);

        // Create input after animation
        this.scene.time.delayedCall(150, () => {
            this.createBadgeProofInput(formX, formY, badge);
        });

        overlay.on('pointerdown', () => this.closeBadgeClaimForm());
    }

    /**
     * Create proof input for badge claim form
     */
    private createBadgeProofInput(formX: number, formY: number, badge: ApiBadge): void {
        // HTML input
        this.proofInput = document.createElement('input');
        this.proofInput.type = 'text';
        this.proofInput.placeholder = 'https://twitter.com/...';
        this.proofInput.maxLength = 200;
        this.proofInput.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, 5px);
            width: 220px;
            padding: 10px 15px;
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
        document.body.appendChild(this.proofInput);

        this.proofInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                await this.submitBadgeProof(badge);
                e.preventDefault();
            } else if (e.key === 'Escape') {
                this.closeBadgeClaimForm();
                e.preventDefault();
            }
            e.stopPropagation();
        });
        this.proofInput.addEventListener('keyup', (e) => e.stopPropagation());
        this.proofInput.addEventListener('keypress', (e) => e.stopPropagation());
        this.proofInput.focus();

        // Buttons
        const btnY = formY + 50;

        // Submit button - using sprite like ProfileScene
        const submitBtnBg = this.scene.add.sprite(formX - 50, btnY, 'square-buttons', 6);
        submitBtnBg.setDisplaySize(80, 30);
        submitBtnBg.setDepth(6002);
        submitBtnBg.setTint(0x4ade80);
        submitBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(submitBtnBg);
        this.claimFormElements.push(submitBtnBg);

        const submitText = this.scene.add.text(formX - 50, btnY, 'Submit', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        submitText.setOrigin(0.5);
        submitText.setDepth(6003);
        submitText.setStroke('#166534', 2);
        this.scene.cameras.main.ignore(submitText);
        this.claimFormElements.push(submitText);

        // Cancel button - using sprite like ProfileScene
        const cancelBtnBg = this.scene.add.sprite(formX + 50, btnY, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(80, 30);
        cancelBtnBg.setDepth(6002);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cancelBtnBg);
        this.claimFormElements.push(cancelBtnBg);

        const cancelText = this.scene.add.text(formX + 50, btnY, 'Cancel', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        cancelText.setOrigin(0.5);
        cancelText.setDepth(6003);
        cancelText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(cancelText);
        this.claimFormElements.push(cancelText);

        submitBtnBg.on('pointerdown', () => {
            // Disable button and show loading state
            submitBtnBg.disableInteractive();
            submitBtnBg.setTint(0x6b7280);
            submitText.setText('Submitting...');
            this.submitBadgeProof(badge, submitBtnBg, submitText);
        });
        submitBtnBg.on('pointerover', () => submitBtnBg.setTint(0x86efac));
        submitBtnBg.on('pointerout', () => submitBtnBg.setTint(0x4ade80));

        cancelBtnBg.on('pointerdown', () => this.closeBadgeClaimForm());
        cancelBtnBg.on('pointerover', () => cancelBtnBg.setTint(0xcccccc));
        cancelBtnBg.on('pointerout', () => cancelBtnBg.clearTint());
    }

    /**
     * Submit proof for badge
     */
    private async submitBadgeProof(
        badge: ApiBadge, 
        submitBtn?: Phaser.GameObjects.Sprite, 
        submitText?: Phaser.GameObjects.Text
    ): Promise<void> {
        const proof = this.proofInput?.value.trim();
        if (!proof) {
            this.callbacks.showToastMessage?.('Please enter proof', 0xfbbf24);
            // Re-enable button
            if (submitBtn && submitText) {
                submitBtn.setInteractive({ useHandCursor: true });
                submitBtn.setTint(0x4ade80);
                submitText.setText('Submit');
            }
            return;
        }

        const result = await BadgeService.claimBadge(badge.id, proof);

        if (result.success) {
            this.callbacks.showToastMessage?.('⏳ Proof submitted! Waiting for verification.', 0x4ade80);
            
            // Update badge status in local array
            badge.status = 'PENDING';
            
            this.closeBadgeClaimForm();
            
            // Reload badges from API and refresh tab
            this.allBadges = await BadgeService.getAllBadges();
            this.refreshBadgesTab();
        } else {
            this.callbacks.showToastMessage?.(`❌ ${result.message}`, 0xef4444);
            // Re-enable button on error
            if (submitBtn && submitText) {
                submitBtn.setInteractive({ useHandCursor: true });
                submitBtn.setTint(0x4ade80);
                submitText.setText('Submit');
            }
        }
    }

    /**
     * Close badge claim form
     */
    private closeBadgeClaimForm(): void {
        this.claimFormOpen = false;

        if (this.proofInput?.parentNode) {
            this.proofInput.parentNode.removeChild(this.proofInput);
        }
        this.proofInput = null;

        this.claimFormElements.forEach(el => (el as any)?.destroy?.());
        this.claimFormElements = [];
    }

    /**
     * Refresh badges tab content
     */
    private async refreshBadgesTab(): Promise<void> {
        // Only clear badges-specific content, not tabs
        if (this.badgesContainer) {
            this.badgesContainer.destroy();
            this.badgesContainer = null;
        }
        if (this.badgesMask) {
            this.badgesMask.destroy();
            this.badgesMask = null;
        }
        this.badgesScrollY = 0;

        // Get modal dimensions - must match createModalContent
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 300;
        const modalHeight = 380;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const contentStartY = modalY - modalHeight / 2 + 100;
        const contentHeight = modalHeight - 80;

        // Recreate badges content
        await this.createBadgesTabContent(modalX, contentStartY, modalWidth, contentHeight);
    }

    /**
     * Show tooltip for soulbound token from API
     */
    private showSoulboundTokenTooltip(x: number, y: number, token: SoulboundToken): void {
        this.hideBadgeTooltip();

        const container = this.scene.add.container(x, y);
        container.setDepth(5200);
        this.scene.cameras.main.ignore(container);

        const bg = this.scene.add.rectangle(0, 0, 120, 50, 0x3E2723, 0.95);
        bg.setStrokeStyle(1, 0x5D4037);
        container.add(bg);

        // Token name
        const nameText = this.scene.add.text(0, -14, token.name, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        nameText.setOrigin(0.5);
        container.add(nameText);

        // Rarity
        const rarityText = this.scene.add.text(0, 0, token.metadata?.rarity || 'COMMON', {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: BadgeService.getRarityColor(token.metadata?.rarity || 'COMMON'),
            resolution: 2
        });
        rarityText.setOrigin(0.5);
        container.add(rarityText);

        // Category
        const categoryText = this.scene.add.text(0, 12, token.metadata?.category || 'Badge', {
            fontSize: '6px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        categoryText.setOrigin(0.5);
        container.add(categoryText);

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

    // Wallet modal elements
    private walletModalElements: Phaser.GameObjects.GameObject[] = [];
    private walletModalOpen: boolean = false;

    private createWalletField(user: any, labelX: number, centerX: number, y: number, modalWidth: number): void {
        const address = user.walletAddress || user.address;
        
        const labelText = this.scene.add.text(labelX, y, 'EVM:', {
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
        const addressText = this.scene.add.text(labelX + 35, y, shortAddress, {
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

        // Copy button - aligned under Edit button
        const editX = centerX + modalWidth / 2 - 55;
        const copyBtn = this.scene.add.text(editX , y, 'Copy', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        copyBtn.setDepth(5102);
        copyBtn.setAlpha(0);
        copyBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(copyBtn);
        this.profileContentElements.push(copyBtn);

        // Check if there are other wallets
        const hasOtherWallets = user.walletAddressAptos || user.walletAddressSui || user.walletAddressCardano;
        
        const elementsToAnimate = [labelText, addressText, copyBtn];

        if (hasOtherWallets) {
            // More button - opens modal
            const moreBtn = this.scene.add.text(labelX + 130, y, '▼ More', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#4a90e2',
                resolution: 2
            });
            moreBtn.setDepth(5102);
            moreBtn.setAlpha(0);
            moreBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(moreBtn);
            this.profileContentElements.push(moreBtn);
            elementsToAnimate.push(moreBtn);

            moreBtn.on('pointerdown', () => this.openWalletsModal(user));
            moreBtn.on('pointerover', () => moreBtn.setColor('#6bb3ff'));
            moreBtn.on('pointerout', () => moreBtn.setColor('#4a90e2'));
        }

        this.scene.tweens.add({
            targets: elementsToAnimate,
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
                    if (copyBtn.active) {
                        copyBtn.setText('Copy');
                        copyBtn.setColor('#4ade80');
                    }
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
                    if (copyBtn.active) {
                        copyBtn.setText('Copy');
                        copyBtn.setColor('#4ade80');
                    }
                });
            }
        });
        copyBtn.on('pointerover', () => copyBtn.setColor('#86efac'));
        copyBtn.on('pointerout', () => {
            if (copyBtn.text === 'Copy') copyBtn.setColor('#4ade80');
        });
    }

    /**
     * Open modal showing all wallet addresses
     */
    private openWalletsModal(user: any): void {
        if (this.walletModalOpen) return;
        this.walletModalOpen = true;

        const centerX = this.scene.scale.width / 2;
        const centerY = this.scene.scale.height / 2;
        const modalWidth = 280;
        const modalHeight = 180;

        // Overlay
        const overlay = this.scene.add.rectangle(centerX, centerY, this.scene.scale.width, this.scene.scale.height, 0x000000, 0.8);
        overlay.setDepth(5200);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.walletModalElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(centerX, centerY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5201);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.walletModalElements.push(modalBg);

        // Animate
        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        const title = this.scene.add.text(centerX, centerY - modalHeight / 2 + 25, '🔗 All Wallets', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5202);
        title.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(title);
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
            const rowY = listStartY + index * 24;

            const label = this.scene.add.text(leftX, rowY, `${wallet.chain}:`, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            label.setDepth(5202);
            label.setStroke('#5D4037', 1);
            this.scene.cameras.main.ignore(label);
            this.walletModalElements.push(label);

            if (wallet.address) {
                const shortAddr = `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`;
                const addrText = this.scene.add.text(leftX + 70, rowY, shortAddr, {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    fontStyle: 'bold',
                    resolution: 2
                });
                addrText.setDepth(5202);
                this.scene.cameras.main.ignore(addrText);
                this.walletModalElements.push(addrText);

                const copyBtn = this.scene.add.text(leftX + 185, rowY, 'Copy', {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: '#4ade80',
                    resolution: 2
                });
                copyBtn.setDepth(5202);
                copyBtn.setInteractive({ useHandCursor: true });
                this.scene.cameras.main.ignore(copyBtn);
                this.walletModalElements.push(copyBtn);

                copyBtn.on('pointerdown', async () => {
                    try {
                        await navigator.clipboard.writeText(wallet.address!);
                        copyBtn.setText('Copied!');
                        copyBtn.setColor('#86efac');
                        this.scene.time.delayedCall(1500, () => {
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
                const notLinked = this.scene.add.text(leftX + 70, rowY, 'Not linked', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#6b7280',
                    resolution: 2
                });
                notLinked.setDepth(5202);
                this.scene.cameras.main.ignore(notLinked);
                this.walletModalElements.push(notLinked);
            }
        });

        // Close button
        const closeBtn = this.scene.add.text(centerX + modalWidth / 2 - 20, centerY - modalHeight / 2 + 15, '✕', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeBtn.setOrigin(0.5);
        closeBtn.setDepth(5203);
        closeBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtn);
        this.walletModalElements.push(closeBtn);

        closeBtn.on('pointerdown', () => this.closeWalletsModal());
        closeBtn.on('pointerover', () => closeBtn.setColor('#ef4444'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#FFFFFF'));

        overlay.on('pointerdown', () => this.closeWalletsModal());
    }

    /**
     * Close wallets modal
     */
    private closeWalletsModal(): void {
        this.walletModalOpen = false;
        this.walletModalElements.forEach(el => {
            if (el && (el as any).destroy) (el as any).destroy();
        });
        this.walletModalElements = [];
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

    /**
     * Get mock badges for testing when API returns empty
     */
    private getMockBadges(): SoulboundToken[] {
        return [
            {
                id: 'mock-1',
                userId: 'user-1',
                name: 'Early Adopter',
                metadata: {
                    rarity: 'LEGENDARY',
                    category: 'Achievement',
                    description: 'One of the first players to join the game'
                },
                issuedAt: new Date().toISOString()
            },
            {
                id: 'mock-2',
                userId: 'user-1',
                name: 'Token2049 Veteran',
                metadata: {
                    rarity: 'EPIC',
                    category: 'Event',
                    description: 'Attended Token2049 event'
                },
                issuedAt: new Date().toISOString()
            },
            {
                id: 'mock-3',
                userId: 'user-1',
                name: 'Master Farmer',
                metadata: {
                    rarity: 'RARE',
                    category: 'Achievement',
                    description: 'Harvested 100 crops'
                },
                issuedAt: new Date().toISOString()
            },
            {
                id: 'mock-4',
                userId: 'user-1',
                name: 'Community Member',
                metadata: {
                    rarity: 'UNCOMMON',
                    category: 'Social',
                    description: 'Joined the community'
                },
                issuedAt: new Date().toISOString()
            },
            {
                id: 'mock-5',
                userId: 'user-1',
                name: 'First Harvest',
                metadata: {
                    rarity: 'COMMON',
                    category: 'Achievement',
                    description: 'Completed first harvest'
                },
                issuedAt: new Date().toISOString()
            },
            {
                id: 'mock-6',
                userId: 'user-1',
                name: 'Beta Tester',
                metadata: {
                    rarity: 'EPIC',
                    category: 'Achievement',
                    description: 'Participated in beta testing'
                },
                issuedAt: new Date().toISOString()
            },
            {
                id: 'mock-7',
                userId: 'user-1',
                name: 'Social Butterfly',
                metadata: {
                    rarity: 'RARE',
                    category: 'Social',
                    description: 'Made 10 friends'
                },
                issuedAt: new Date().toISOString()
            },
            {
                id: 'mock-8',
                userId: 'user-1',
                name: 'Ambassador',
                metadata: {
                    rarity: 'LEGENDARY',
                    category: 'Special',
                    description: 'Official game ambassador'
                },
                issuedAt: new Date().toISOString()
            }
        ];
    }

    public destroy(): void {
        this.closeEditForm();
        this.close();
        if (this.quickActionsManager) {
            this.quickActionsManager.destroy();
            this.quickActionsManager = null;
        }
        this.destroyProfileElements();
        super.destroy();
    }
}
