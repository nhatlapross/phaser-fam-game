import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { UserService } from '../UserService';
import { BadgeService, ApiBadge } from '../BadgeService';
import { GameDataService } from '../GameDataService';

interface WelcomeCallbacks {
    showToastMessage: (text: string, color: number) => void;
    onClose?: () => void;
}

/**
 * Manages the welcome modal shown after registration
 * Displays user info, wallet address, and claimable badges
 */
export class WelcomeManager extends BaseManager {
    private callbacks: WelcomeCallbacks;
    private modalElements: Phaser.GameObjects.GameObject[] = [];
    private badgeElements: Phaser.GameObjects.GameObject[] = [];
    private claimFormElements: Phaser.GameObjects.GameObject[] = [];
    private claimFormOpen: boolean = false;
    private proofInput: HTMLInputElement | null = null;
    private allBadges: ApiBadge[] = [];

    constructor(scene: Phaser.Scene, callbacks: WelcomeCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Open the welcome modal
     */
    public async open(): Promise<void> {
        if (this.isOpen) return;
        this.isOpen = true;

        // Fetch all badges with status
        this.allBadges = await BadgeService.getAllBadges();

        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();
        if (!user) {
            this.isOpen = false;
            return;
        }

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 320;
        const modalHeight = 420;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(
            screenWidth / 2, screenHeight / 2,
            screenWidth, screenHeight,
            0x000000, 0.7
        );
        overlay.setDepth(6000);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.modalElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(6001);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.modalElements.push(modalBg);

        // Animate modal
        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 250,
            ease: 'Back.easeOut'
        });

        this.scene.time.delayedCall(150, () => {
            this.createModalContent(modalX, modalY, modalWidth, modalHeight, user);
        });

        overlay.on('pointerdown', () => this.close());
    }

    /**
     * Close the welcome modal
     */
    public close(): void {
        if (this.claimFormOpen) {
            this.closeClaimForm();
        }

        this.isOpen = false;
        this.modalElements.forEach(el => el?.destroy?.());
        this.modalElements = [];
        this.badgeElements.forEach(el => el?.destroy?.());
        this.badgeElements = [];

        this.callbacks.onClose?.();
    }

    private createModalContent(
        modalX: number,
        modalY: number,
        modalWidth: number,
        modalHeight: number,
        user: any
    ): void {
        const modalTop = modalY - modalHeight / 2;

        // Close button
        const closeBtnBg = this.scene.add.sprite(
            modalX + modalWidth / 2 - 25,
            modalTop + 20,
            'square-buttons', 7
        );
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(6002);
        closeBtnBg.setInteractive({ useHandCursor: true });
        closeBtnBg.setAlpha(0);
        this.scene.cameras.main.ignore(closeBtnBg);
        this.modalElements.push(closeBtnBg);

        const closeText = this.scene.add.text(
            modalX + modalWidth / 2 - 25,
            modalTop + 20,
            'X',
            { fontSize: '12px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2 }
        );
        closeText.setOrigin(0.5);
        closeText.setDepth(6003);
        closeText.setStroke('#5D4037', 2);
        closeText.setAlpha(0);
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

        // Welcome title
        const title = this.scene.add.text(modalX, modalTop + 40, '🎉 Welcome!', {
            fontSize: '18px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(6002);
        title.setStroke('#5D4037', 3);
        title.setAlpha(0);
        this.scene.cameras.main.ignore(title);
        this.modalElements.push(title);

        this.scene.tweens.add({ targets: title, alpha: 1, duration: 200, delay: 50 });

        // User info section
        const infoStartY = modalTop + 75;
        this.createUserInfoSection(modalX, infoStartY, modalWidth, user);

        // Badges section
        const badgesStartY = infoStartY + 90;
        this.createBadgesSection(modalX, badgesStartY, modalWidth, modalHeight - (badgesStartY - modalTop) - 60);

        // Continue button
        const continueY = modalY + modalHeight / 2 - 35;
        this.createContinueButton(modalX, continueY);
    }

    private createUserInfoSection(centerX: number, startY: number, width: number, user: any): void {
        const leftX = centerX - width / 2 + 30;

        // Username
        const nameLabel = this.scene.add.text(leftX, startY, '👤 Username:', {
            fontSize: '11px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        nameLabel.setDepth(6002);
        nameLabel.setStroke('#5D4037', 2);
        nameLabel.setAlpha(0);
        this.scene.cameras.main.ignore(nameLabel);
        this.modalElements.push(nameLabel);

        const nameValue = this.scene.add.text(leftX + 90, startY, user.username || 'Player', {
            fontSize: '11px', fontFamily: 'PixelFont', color: '#FFF8E1', resolution: 2
        });
        nameValue.setDepth(6002);
        nameValue.setStroke('#5D4037', 2);
        nameValue.setAlpha(0);
        this.scene.cameras.main.ignore(nameValue);
        this.modalElements.push(nameValue);

        // Wallet address
        const walletLabel = this.scene.add.text(leftX, startY + 22, '💳 Wallet:', {
            fontSize: '11px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        walletLabel.setDepth(6002);
        walletLabel.setStroke('#5D4037', 2);
        walletLabel.setAlpha(0);
        this.scene.cameras.main.ignore(walletLabel);
        this.modalElements.push(walletLabel);

        const shortWallet = `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
        const walletValue = this.scene.add.text(leftX + 90, startY + 22, shortWallet, {
            fontSize: '10px', fontFamily: 'PixelFont', color: '#FFF8E1', resolution: 2
        });
        walletValue.setDepth(6002);
        walletValue.setStroke('#5D4037', 2);
        walletValue.setAlpha(0);
        this.scene.cameras.main.ignore(walletValue);
        this.modalElements.push(walletValue);

        // XP
        const xpLabel = this.scene.add.text(leftX, startY + 44, '⭐ XP:', {
            fontSize: '11px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        xpLabel.setDepth(6002);
        xpLabel.setStroke('#5D4037', 2);
        xpLabel.setAlpha(0);
        this.scene.cameras.main.ignore(xpLabel);
        this.modalElements.push(xpLabel);

        const xpValue = this.scene.add.text(leftX + 90, startY + 44, `${user.xp}`, {
            fontSize: '11px', fontFamily: 'PixelFont', color: '#FFF8E1', resolution: 2
        });
        xpValue.setDepth(6002);
        xpValue.setStroke('#5D4037', 2);
        xpValue.setAlpha(0);
        this.scene.cameras.main.ignore(xpValue);
        this.modalElements.push(xpValue);

        // Animate all
        this.scene.tweens.add({
            targets: [nameLabel, nameValue, walletLabel, walletValue, xpLabel, xpValue],
            alpha: 1,
            duration: 200,
            delay: 100
        });
    }

    private createBadgesSection(centerX: number, startY: number, width: number, height: number): void {
        // Section title
        const claimedCount = this.allBadges.filter(b => b.status === 'CLAIMED').length;
        const totalCount = this.allBadges.length;
        
        const sectionTitle = this.scene.add.text(centerX, startY, `🏆 Badges (${claimedCount}/${totalCount})`, {
            fontSize: '14px', fontFamily: 'PixelFont', color: '#FFD700', resolution: 2
        });
        sectionTitle.setOrigin(0.5);
        sectionTitle.setDepth(6002);
        sectionTitle.setStroke('#5D4037', 2);
        sectionTitle.setAlpha(0);
        this.scene.cameras.main.ignore(sectionTitle);
        this.modalElements.push(sectionTitle);

        this.scene.tweens.add({ targets: sectionTitle, alpha: 1, duration: 200, delay: 150 });

        // Badge list container
        const listStartY = startY + 25;
        const badgeHeight = 45;

        this.allBadges.forEach((badge, index) => {
            const y = listStartY + index * badgeHeight;
            this.createBadgeRow(centerX, y, width - 40, badge, index);
        });
    }

    private createBadgeRow(centerX: number, y: number, width: number, badge: ApiBadge, index: number): void {
        const isClaimed = badge.status === 'CLAIMED';
        const isPending = badge.status === 'PENDING';
        // const canClaim = badge.status === 'CAN_CLAIM' || badge.status === 'COMPLETED';
        const canClaim = badge.status === 'CAN_CLAIM';
        const isLocked = badge.status === 'LOCKED';
        const leftX = centerX - width / 2;

        // Badge row background - different colors based on status
        let bgColor = 0x3E2723; // LOCKED
        let strokeColor = 0x5D4037;
        
        if (isClaimed) {
            bgColor = 0x4a5568;
            strokeColor = 0x68d391;
        } else if (canClaim) {
            bgColor = 0x2d5a3d;
            strokeColor = 0x4ade80;
        } else if (isPending) {
            bgColor = 0x5D4037;
            strokeColor = 0xfbbf24;
        }
        
        const rowBg = this.scene.add.rectangle(
            centerX, y + 15,
            width, 40,
            bgColor,
            0.8
        );
        rowBg.setDepth(6002);
        rowBg.setStrokeStyle(1, strokeColor);
        rowBg.setAlpha(0);
        this.scene.cameras.main.ignore(rowBg);
        this.badgeElements.push(rowBg);

        // Badge icon
        let iconEmoji = '🔒';
        if (isClaimed) iconEmoji = '🏆';
        else if (canClaim) iconEmoji = '🏆';
        else if (isPending) iconEmoji = '⏳';
        
        const icon = this.scene.add.text(leftX + 20, y + 15, iconEmoji, {
            fontSize: '20px', resolution: 2
        });
        icon.setOrigin(0.5);
        icon.setDepth(6003);
        icon.setAlpha(isClaimed || canClaim ? 1 : 0.4);
        this.scene.cameras.main.ignore(icon);
        this.badgeElements.push(icon);

        // Badge name - color based on status
        let nameColor = '#9CA3AF'; // gray for LOCKED
        if (isClaimed) nameColor = '#68d391';
        else if (canClaim) nameColor = '#4ade80';
        else if (isPending) nameColor = '#fbbf24';
        
        const name = this.scene.add.text(leftX + 45, y + 8, badge.name, {
            fontSize: '10px', fontFamily: 'PixelFont',
            color: nameColor,
            resolution: 2
        });
        name.setDepth(6003);
        name.setStroke('#5D4037', 1);
        name.setAlpha(0);
        this.scene.cameras.main.ignore(name);
        this.badgeElements.push(name);

        // Badge description
        const desc = this.scene.add.text(leftX + 45, y + 22, badge.description, {
            fontSize: '8px', fontFamily: 'PixelFont', color: '#BCAAA4', resolution: 2,
            wordWrap: { width: width - 120 }
        });
        desc.setDepth(6003);
        desc.setAlpha(0);
        this.scene.cameras.main.ignore(desc);
        this.badgeElements.push(desc);

        // Status display based on badge status
        if (isClaimed) {
            const claimedText = this.scene.add.text(centerX + width / 2 - 45, y + 15, '✓ Claimed', {
                fontSize: '9px', fontFamily: 'PixelFont', color: '#68d391', resolution: 2
            });
            claimedText.setOrigin(0.5);
            claimedText.setDepth(6003);
            claimedText.setAlpha(0);
            this.scene.cameras.main.ignore(claimedText);
            this.badgeElements.push(claimedText);

            this.scene.tweens.add({
                targets: claimedText,
                alpha: 1,
                duration: 200,
                delay: 200 + index * 50
            });
        } else if (isPending) {
            const pendingText = this.scene.add.text(centerX + width / 2 - 45, y + 15, '⏳ Pending', {
                fontSize: '9px', fontFamily: 'PixelFont', color: '#fbbf24', resolution: 2
            });
            pendingText.setOrigin(0.5);
            pendingText.setDepth(6003);
            pendingText.setAlpha(0);
            this.scene.cameras.main.ignore(pendingText);
            this.badgeElements.push(pendingText);

            this.scene.tweens.add({
                targets: pendingText,
                alpha: 1,
                duration: 200,
                delay: 200 + index * 50
            });
        } else if (isLocked) {
            const lockedText = this.scene.add.text(centerX + width / 2 - 45, y + 15, '🔒 Locked', {
                fontSize: '9px', fontFamily: 'PixelFont', color: '#9CA3AF', resolution: 2
            });
            lockedText.setOrigin(0.5);
            lockedText.setDepth(6003);
            lockedText.setAlpha(0);
            this.scene.cameras.main.ignore(lockedText);
            this.badgeElements.push(lockedText);

            this.scene.tweens.add({
                targets: lockedText,
                alpha: 1,
                duration: 200,
                delay: 200 + index * 50
            });
        } else if (canClaim) {
            // Claim button for CAN_CLAIM badges
            const claimBtnBg = this.scene.add.sprite(
                centerX + width / 2 - 40,
                y + 15,
                'square-buttons', 6
            );
            claimBtnBg.setDisplaySize(60, 24);
            claimBtnBg.setDepth(6003);
            claimBtnBg.setTint(0x4ade80);
            claimBtnBg.setInteractive({ useHandCursor: true });
            claimBtnBg.setAlpha(0);
            this.scene.cameras.main.ignore(claimBtnBg);
            this.badgeElements.push(claimBtnBg);

            const claimText = this.scene.add.text(
                centerX + width / 2 - 40,
                y + 15,
                'Claim',
                { fontSize: '9px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2 }
            );
            claimText.setOrigin(0.5);
            claimText.setDepth(6004);
            claimText.setStroke('#2d6a4f', 1);
            claimText.setAlpha(0);
            this.scene.cameras.main.ignore(claimText);
            this.badgeElements.push(claimText);

            claimBtnBg.on('pointerdown', () => this.openClaimForm(badge));
            claimBtnBg.on('pointerover', () => claimBtnBg.setTint(0x86efac));
            claimBtnBg.on('pointerout', () => claimBtnBg.setTint(0x4ade80));

            this.scene.tweens.add({
                targets: [claimBtnBg, claimText],
                alpha: 1,
                duration: 200,
                delay: 200 + index * 50
            });
        }

        // Animate row
        this.scene.tweens.add({
            targets: [rowBg, icon, name, desc],
            alpha: (target: Phaser.GameObjects.GameObject) => target === icon && (isLocked || isPending) ? 0.4 : 1,
            duration: 200,
            delay: 200 + index * 50
        });
    }

    private createContinueButton(centerX: number, y: number): void {
        const btnBg = this.scene.add.sprite(centerX, y, 'square-buttons', 6);
        btnBg.setDisplaySize(120, 36);
        btnBg.setDepth(6002);
        btnBg.setTint(0x4ade80);
        btnBg.setInteractive({ useHandCursor: true });
        btnBg.setAlpha(0);
        this.scene.cameras.main.ignore(btnBg);
        this.modalElements.push(btnBg);

        const btnText = this.scene.add.text(centerX, y, 'Continue', {
            fontSize: '12px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        btnText.setOrigin(0.5);
        btnText.setDepth(6003);
        btnText.setStroke('#2d6a4f', 2);
        btnText.setAlpha(0);
        this.scene.cameras.main.ignore(btnText);
        this.modalElements.push(btnText);

        this.scene.tweens.add({
            targets: [btnBg, btnText],
            alpha: 1,
            duration: 200,
            delay: 300
        });

        btnBg.on('pointerdown', () => this.close());
        btnBg.on('pointerover', () => btnBg.setTint(0x86efac));
        btnBg.on('pointerout', () => btnBg.setTint(0x4ade80));
    }

    private openClaimForm(badge: ApiBadge): void {
        if (this.claimFormOpen) return;
        this.claimFormOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const formWidth = 280;
        const formHeight = 200;
        const formX = screenWidth / 2;
        const formY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(
            screenWidth / 2, screenHeight / 2,
            screenWidth, screenHeight,
            0x000000, 0.8
        );
        overlay.setDepth(6100);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.claimFormElements.push(overlay);

        // Form background
        const formBg = this.scene.add.sprite(formX, formY, 'settings-panel', 1);
        formBg.setDisplaySize(formWidth, formHeight);
        formBg.setDepth(6101);
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
        const title = this.scene.add.text(formX, formY - formHeight / 2 + 30, `Unlock: ${badge.name}`, {
            fontSize: '12px', fontFamily: 'PixelFont', color: '#FFD700', resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(6102);
        title.setStroke('#5D4037', 2);
        title.setAlpha(0);
        this.scene.cameras.main.ignore(title);
        this.claimFormElements.push(title);

        // Instructions
        const instructions = this.scene.add.text(formX, formY - 35, 'Submit proof (link or description):', {
            fontSize: '9px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2,
            wordWrap: { width: formWidth - 40 },
            align: 'center'
        });
        instructions.setOrigin(0.5);
        instructions.setDepth(6102);
        instructions.setStroke('#5D4037', 1);
        instructions.setAlpha(0);
        this.scene.cameras.main.ignore(instructions);
        this.claimFormElements.push(instructions);

        // Note about verification
        const note = this.scene.add.text(formX, formY + 70, '⏳ Admin will verify your proof', {
            fontSize: '8px', fontFamily: 'PixelFont', color: '#fbbf24', resolution: 2
        });
        note.setOrigin(0.5);
        note.setDepth(6102);
        note.setAlpha(0);
        this.scene.cameras.main.ignore(note);
        this.claimFormElements.push(note);

        this.scene.time.delayedCall(100, () => {
            this.scene.tweens.add({ targets: [title, instructions, note], alpha: 1, duration: 150 });
            this.createProofInput(formX, formY, badge);
        });

        overlay.on('pointerdown', () => this.closeClaimForm());
    }

    private createProofInput(formX: number, formY: number, badge: ApiBadge): void {
        // HTML input for proof
        this.proofInput = document.createElement('input');
        this.proofInput.type = 'text';
        this.proofInput.placeholder = 'https://twitter.com/...';
        this.proofInput.maxLength = 200;
        this.proofInput.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -15px);
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
                await this.submitProof(badge);
                e.preventDefault();
            } else if (e.key === 'Escape') {
                this.closeClaimForm();
                e.preventDefault();
            }
            e.stopPropagation();
        });
        this.proofInput.addEventListener('keyup', (e) => e.stopPropagation());
        this.proofInput.addEventListener('keypress', (e) => e.stopPropagation());
        this.proofInput.focus();

        // Buttons
        const btnY = formY + 35;

        // Submit button
        const submitBtnBg = this.scene.add.sprite(formX - 50, btnY, 'square-buttons', 6);
        submitBtnBg.setDisplaySize(80, 32);
        submitBtnBg.setDepth(6102);
        submitBtnBg.setTint(0x4ade80);
        submitBtnBg.setInteractive({ useHandCursor: true });
        submitBtnBg.setAlpha(0);
        this.scene.cameras.main.ignore(submitBtnBg);
        this.claimFormElements.push(submitBtnBg);

        const submitText = this.scene.add.text(formX - 50, btnY, 'Submit', {
            fontSize: '11px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        submitText.setOrigin(0.5);
        submitText.setDepth(6103);
        submitText.setStroke('#2d6a4f', 2);
        submitText.setAlpha(0);
        this.scene.cameras.main.ignore(submitText);
        this.claimFormElements.push(submitText);

        // Cancel button
        const cancelBtnBg = this.scene.add.sprite(formX + 50, btnY, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(80, 32);
        cancelBtnBg.setDepth(6102);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        cancelBtnBg.setAlpha(0);
        this.scene.cameras.main.ignore(cancelBtnBg);
        this.claimFormElements.push(cancelBtnBg);

        const cancelText = this.scene.add.text(formX + 50, btnY, 'Cancel', {
            fontSize: '11px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        cancelText.setOrigin(0.5);
        cancelText.setDepth(6103);
        cancelText.setStroke('#5D4037', 2);
        cancelText.setAlpha(0);
        this.scene.cameras.main.ignore(cancelText);
        this.claimFormElements.push(cancelText);

        this.scene.tweens.add({
            targets: [submitBtnBg, submitText, cancelBtnBg, cancelText],
            alpha: 1,
            duration: 150
        });

        submitBtnBg.on('pointerdown', () => this.submitProof(badge));
        submitBtnBg.on('pointerover', () => submitBtnBg.setTint(0x86efac));
        submitBtnBg.on('pointerout', () => submitBtnBg.setTint(0x4ade80));

        cancelBtnBg.on('pointerdown', () => this.closeClaimForm());
        cancelBtnBg.on('pointerover', () => cancelBtnBg.setTint(0xcccccc));
        cancelBtnBg.on('pointerout', () => cancelBtnBg.clearTint());
    }

    private async submitProof(badge: ApiBadge): Promise<void> {
        const proof = this.proofInput?.value.trim();
        if (!proof) {
            this.callbacks.showToastMessage('Please enter proof', 0xfbbf24);
            return;
        }

        const result = await BadgeService.claimBadge(badge.id, proof);

        if (result.success) {
            this.callbacks.showToastMessage('⏳ Proof submitted! Waiting for verification.', 0x4ade80);
            this.closeClaimForm();
            // Refresh badges display
            this.allBadges = await BadgeService.getAllBadges();
            this.refreshBadgesDisplay();
        } else {
            this.callbacks.showToastMessage(result.message, 0xef4444);
        }
    }

    private closeClaimForm(): void {
        this.claimFormOpen = false;

        if (this.proofInput?.parentNode) {
            this.proofInput.parentNode.removeChild(this.proofInput);
        }
        this.proofInput = null;

        this.claimFormElements.forEach(el => el?.destroy?.());
        this.claimFormElements = [];
    }

    private refreshBadgesDisplay(): void {
        // Clear existing badge elements
        this.badgeElements.forEach(el => el?.destroy?.());
        this.badgeElements = [];

        // Recreate badges section
        const screenHeight = this.scene.scale.height;
        const modalHeight = 420;
        const modalTop = screenHeight / 2 - modalHeight / 2;
        const badgesStartY = modalTop + 75 + 90;

        const centerX = this.scene.scale.width / 2;
        const width = 320 - 40;

        this.allBadges.forEach((badge, index) => {
            const y = badgesStartY + 25 + index * 45;
            this.createBadgeRow(centerX, y, width, badge, index);
        });
    }

    public destroy(): void {
        this.closeClaimForm();
        this.close();
        super.destroy();
    }
}
