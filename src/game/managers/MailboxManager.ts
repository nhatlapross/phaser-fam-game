import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { PlantType, FertilizerType, GAME_CONSTANTS } from '../types/GameTypes';
import { MissionService, Mission } from '../MissionService';
import { RedeemService } from '../RedeemService';

interface MailboxCallbacks {
    getSeedCounts: () => Record<PlantType, number>;
    getFertilizerCounts: () => Record<FertilizerType, number>;
    updateToolbar: () => void;
    showToastMessage: (text: string, color: number) => void;
}

/**
 * Manages the mailbox/mission system
 * Handles missions display, redeem codes, and QR scanner
 */
export class MailboxManager extends BaseManager {
    private mailboxSprite!: Phaser.GameObjects.Sprite;
    private activeTab: 'missions' | 'redeem' = 'missions';
    private callbacks: MailboxCallbacks;
    private cachedMissions: Mission[] | null = null;
    private missionsCacheTime: number = 0;
    private redeemResultElements: Phaser.GameObjects.GameObject[] = [];
    private qrScannerContainer: HTMLDivElement | null = null;
    private redeemInput: HTMLInputElement | null = null;
    private shouldCloseMailbox: boolean = false;
    private tileSize: number;

    constructor(scene: Phaser.Scene, callbacks: MailboxCallbacks, tileSize: number) {
        super(scene);
        this.callbacks = callbacks;
        this.tileSize = tileSize;
    }

    /**
     * Create the mailbox sprite on the map
     */
    public createMailbox(): void {
        const centerX = 25;
        const centerY = 25;
        const factoryY = (centerY - 5) * this.tileSize;
        const mailboxX = (centerX + 4) * this.tileSize + this.tileSize / 2;
        const mailboxY = factoryY + 16;

        // Create animation
        if (!this.scene.anims.exists('mailbox-idle')) {
            this.scene.anims.create({
                key: 'mailbox-idle',
                frames: this.scene.anims.generateFrameNumbers('mailbox', { start: 0, end: 4 }),
                frameRate: 3,
                repeat: -1
            });
        }

        this.mailboxSprite = this.scene.add.sprite(mailboxX, mailboxY, 'mailbox');
        this.mailboxSprite.setDisplaySize(32, 32);
        this.mailboxSprite.setDepth(mailboxY + 16);
        this.mailboxSprite.setInteractive({ useHandCursor: true });
        this.mailboxSprite.play('mailbox-idle');

        this.mailboxSprite.on('pointerdown', () => {
            this.open();
        });

        // Setup hover effect with tint + shadow
        this.setupHoverEffect(this.mailboxSprite, 8);

        // Add decorative bushes below mailbox
        const bushY = mailboxY + 16;
        const bushFrame1 = 27; // Bush sprite frame
        const bushFrame2 = 28; // Another bush sprite frame

        // Left bush
        const leftBush = this.scene.add.sprite(mailboxX - 12, bushY, 'basic-plants', bushFrame1);
        leftBush.setOrigin(0.5);
        leftBush.setDepth(bushY);

        // Right bush
        const rightBush = this.scene.add.sprite(mailboxX + 12, bushY, 'basic-plants', bushFrame2);
        rightBush.setOrigin(0.5);
        rightBush.setDepth(bushY);

        // Center bush (slightly lower)
        const centerBush = this.scene.add.sprite(mailboxX, bushY + 6, 'basic-plants', bushFrame1);
        centerBush.setOrigin(0.5);
        centerBush.setDepth(bushY + 6);
    }

    /**
     * Get mailbox sprite for camera ignore
     */
    public getMailboxSprite(): Phaser.GameObjects.Sprite {
        return this.mailboxSprite;
    }

    /**
     * Force refresh missions cache
     */
    public refreshCache(): void {
        this.cachedMissions = null;
        this.missionsCacheTime = 0;
    }

    /**
     * Preload missions data to avoid lag when opening modal
     * Call this early in game initialization
     */
    public async preloadMissions(): Promise<void> {
        const missions = await MissionService.getMissions();
        if (missions) {
            this.cachedMissions = missions;
            this.missionsCacheTime = Date.now();
        }
    }

    /**
     * Open the mailbox modal
     */
    public open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.activeTab = 'missions';

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 300;
        const modalHeight = 280;
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
     * Close the mailbox modal
     */
    public close(): void {
        this.isOpen = false;
        this.cleanupRedeemInput();
        this.destroyElements();
    }

    private cleanupRedeemInput(): void {
        if (this.redeemInput && this.redeemInput.parentNode) {
            this.redeemInput.parentNode.removeChild(this.redeemInput);
        }
        this.redeemInput = null;
    }

    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        // Title
        const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 40, 'Mailbox', {
            fontSize: '14px',
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

        // Tab buttons
        const tabY = modalY - modalHeight / 2 + 65;
        const tabWidth = 90;
        const tabHeight = 26;

        // Missions tab
        const missionsTabBg = this.scene.add.sprite(modalX - 55, tabY, 'square-buttons', 6);
        missionsTabBg.setDisplaySize(tabWidth, tabHeight);
        missionsTabBg.setDepth(5302);
        missionsTabBg.setAlpha(0);
        missionsTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(missionsTabBg);
        this.addElement(missionsTabBg);

        const missionsTabText = this.scene.add.text(modalX - 55, tabY, 'Missions', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        missionsTabText.setOrigin(0.5);
        missionsTabText.setDepth(5303);
        missionsTabText.setStroke('#5D4037', 1);
        missionsTabText.setAlpha(0);
        this.scene.cameras.main.ignore(missionsTabText);
        this.addElement(missionsTabText);

        // Redeem tab
        const redeemTabBg = this.scene.add.sprite(modalX + 55, tabY, 'square-buttons', 7);
        redeemTabBg.setDisplaySize(tabWidth, tabHeight);
        redeemTabBg.setDepth(5302);
        redeemTabBg.setAlpha(0);
        redeemTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(redeemTabBg);
        this.addElement(redeemTabBg);

        const redeemTabText = this.scene.add.text(modalX + 55, tabY, 'Redeem', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        redeemTabText.setOrigin(0.5);
        redeemTabText.setDepth(5303);
        redeemTabText.setStroke('#5D4037', 1);
        redeemTabText.setAlpha(0);
        this.scene.cameras.main.ignore(redeemTabText);
        this.addElement(redeemTabText);

        this.scene.tweens.add({
            targets: [missionsTabBg, missionsTabText, redeemTabBg, redeemTabText],
            alpha: 1,
            duration: 150
        });

        // Refresh button (same style as close button, positioned 5px left of close)
        const refreshBtnX = modalX + modalWidth / 2 - 45; // 25 (close pos) + 24 (close size) + 5 (gap)
        const refreshBtnY = modalY - modalHeight / 2 + 35;

        const refreshBtnBg = this.scene.add.sprite(refreshBtnX, refreshBtnY, 'square-buttons', 6);
        refreshBtnBg.setDisplaySize(24, 24);
        refreshBtnBg.setDepth(5302);
        refreshBtnBg.setAlpha(0);
        refreshBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(refreshBtnBg);
        this.addElement(refreshBtnBg);

        const refreshBtn = this.scene.add.text(refreshBtnX, refreshBtnY, '↻', {
            fontSize: '12px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            resolution: 2
        });
        refreshBtn.setOrigin(0.5);
        refreshBtn.setDepth(5303);
        refreshBtn.setAlpha(0);
        this.scene.cameras.main.ignore(refreshBtn);
        this.addElement(refreshBtn);

        this.scene.tweens.add({ targets: [refreshBtnBg, refreshBtn], alpha: 1, duration: 150 });

        // Content area
        const contentY = modalY + 20;
        const contentElements: Phaser.GameObjects.GameObject[] = [];

        // Scrollable area setup
        const scrollAreaTop = modalY - modalHeight / 2 + 85;
        const scrollAreaHeight = 160;

        // Create mask
        const maskGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(modalX - modalWidth / 2 + 10, scrollAreaTop, modalWidth - 20, scrollAreaHeight);
        const scrollMask = maskGraphics.createGeometryMask();
        this.addElement(maskGraphics);

        let scrollOffset = 0;
        let maxScrollOffset = 0;
        let isDragging = false;
        let lastPointerY = 0;

        const showMissionsContent = async () => {
            contentElements.forEach(el => el.destroy());
            contentElements.length = 0;
            scrollOffset = 0;

            missionsTabBg.setTexture('square-buttons', 6);
            redeemTabBg.setTexture('square-buttons', 7);

            let missions: Mission[] | null = null;
            const now = Date.now();

            if (this.cachedMissions && (now - this.missionsCacheTime) < GAME_CONSTANTS.MISSIONS_CACHE_DURATION) {
                missions = this.cachedMissions;
            } else {
                const loadingText = this.scene.add.text(modalX, contentY, 'Loading missions...', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    resolution: 2
                });
                loadingText.setOrigin(0.5);
                loadingText.setDepth(5302);
                loadingText.setStroke('#5D4037', 2);
                this.scene.cameras.main.ignore(loadingText);
                this.addElement(loadingText);
                contentElements.push(loadingText);

                missions = await MissionService.getMissions();

                if (missions) {
                    this.cachedMissions = missions;
                    this.missionsCacheTime = now;
                }

                loadingText.destroy();
                contentElements.length = 0;
            }

            if (!missions || missions.length === 0) {
                const noMissionsText = this.scene.add.text(modalX, contentY, 'No missions available', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#999999',
                    resolution: 2
                });
                noMissionsText.setOrigin(0.5);
                noMissionsText.setDepth(5302);
                noMissionsText.setStroke('#5D4037', 2);
                this.scene.cameras.main.ignore(noMissionsText);
                this.addElement(noMissionsText);
                contentElements.push(noMissionsText);
                return;
            }

            const cardHeight = 38;
            const cardSpacing = 45;
            const totalContentHeight = missions.length * cardSpacing;
            maxScrollOffset = Math.max(0, totalContentHeight - scrollAreaHeight);

            const updateScrollPositions = () => {
                contentElements.forEach((el: Phaser.GameObjects.GameObject) => {
                    const gameObj = el as unknown as { y: number; originalY?: number };
                    if (gameObj.originalY !== undefined) {
                        gameObj.y = gameObj.originalY - scrollOffset;
                    }
                });
            };

            missions.forEach((mission, index) => {
                const baseY = scrollAreaTop + 20 + index * cardSpacing;
                const isDone = mission.status === 'completed' || mission.status === 'claimed';
                const progressPercent = (mission.progress / mission.target) * 100;

                const cardWidth = 230;
                const cardX = modalX + 10;

                // Card border
                const cardBorder = this.scene.add.rectangle(cardX, baseY, cardWidth + 3, cardHeight + 3, 0x8B7355);
                cardBorder.setDepth(5302);
                cardBorder.setMask(scrollMask);
                this.scene.cameras.main.ignore(cardBorder);
                this.addElement(cardBorder);
                contentElements.push(cardBorder);
                (cardBorder as any).originalY = baseY;

                // Card background
                const cardBg = this.scene.add.rectangle(cardX, baseY, cardWidth, cardHeight, 0xD4C4A8);
                cardBg.setDepth(5303);
                cardBg.setInteractive({ useHandCursor: true });
                cardBg.setMask(scrollMask);
                this.scene.cameras.main.ignore(cardBg);
                this.addElement(cardBg);
                contentElements.push(cardBg);
                (cardBg as any).originalY = baseY;

                // Status icon
                const iconX = cardX - cardWidth / 2 + 15;
                const iconBg = this.scene.add.circle(iconX, baseY, 8, isDone ? 0x4ade80 : 0xfbbf24);
                iconBg.setDepth(5304);
                iconBg.setMask(scrollMask);
                this.scene.cameras.main.ignore(iconBg);
                this.addElement(iconBg);
                contentElements.push(iconBg);
                (iconBg as any).originalY = baseY;

                const statusIcon = this.scene.add.text(iconX, baseY, isDone ? '✓' : '!', {
                    fontSize: '10px',
                    fontFamily: 'Arial',
                    color: '#FFFFFF',
                    resolution: 2
                });
                statusIcon.setOrigin(0.5);
                statusIcon.setDepth(5305);
                statusIcon.setMask(scrollMask);
                this.scene.cameras.main.ignore(statusIcon);
                this.addElement(statusIcon);
                contentElements.push(statusIcon);
                (statusIcon as any).originalY = baseY;

                // Mission name
                const nameX = cardX - cardWidth / 2 + 30;
                const nameY = baseY - 8;
                const missionName = this.scene.add.text(nameX, nameY, mission.name, {
                    fontSize: '9px',
                    fontFamily: 'PixelFont',
                    color: isDone ? '#16a34a' : '#5D4037',
                    resolution: 2
                });
                missionName.setOrigin(0, 0.5);
                missionName.setDepth(5304);
                missionName.setMask(scrollMask);
                this.scene.cameras.main.ignore(missionName);
                this.addElement(missionName);
                contentElements.push(missionName);
                (missionName as any).originalY = nameY;

                // Progress bar
                const barWidth = 120;
                const barHeight = 8;
                const barX = cardX - cardWidth / 2 + 35;
                const barY = baseY + 8;

                const barBorder = this.scene.add.rectangle(barX, barY, barWidth + 2, barHeight + 2, 0x8B7355);
                barBorder.setOrigin(0, 0.5);
                barBorder.setDepth(5304);
                barBorder.setMask(scrollMask);
                this.scene.cameras.main.ignore(barBorder);
                this.addElement(barBorder);
                contentElements.push(barBorder);
                (barBorder as any).originalY = barY;

                const progressBarBg = this.scene.add.rectangle(barX + 1, barY, barWidth, barHeight, 0xFFF8E1);
                progressBarBg.setOrigin(0, 0.5);
                progressBarBg.setDepth(5305);
                progressBarBg.setMask(scrollMask);
                this.scene.cameras.main.ignore(progressBarBg);
                this.addElement(progressBarBg);
                contentElements.push(progressBarBg);
                (progressBarBg as any).originalY = barY;

                const fillWidth = Math.max(2, (barWidth * progressPercent) / 100);
                const progressBarFill = this.scene.add.rectangle(barX + 1, barY, fillWidth, barHeight, isDone ? 0x22c55e : 0xf59e0b);
                progressBarFill.setOrigin(0, 0.5);
                progressBarFill.setDepth(5306);
                progressBarFill.setMask(scrollMask);
                this.scene.cameras.main.ignore(progressBarFill);
                this.addElement(progressBarFill);
                contentElements.push(progressBarFill);
                (progressBarFill as any).originalY = barY;

                // Progress text
                const progressText = this.scene.add.text(cardX + cardWidth / 2 - 25, baseY, `${mission.progress}/${mission.target}`, {
                    fontSize: '9px',
                    fontFamily: 'PixelFont',
                    color: isDone ? '#16a34a' : '#5D4037',
                    resolution: 2
                });
                progressText.setOrigin(0.5);
                progressText.setDepth(5304);
                progressText.setMask(scrollMask);
                this.scene.cameras.main.ignore(progressText);
                this.addElement(progressText);
                contentElements.push(progressText);
                (progressText as any).originalY = baseY;

                // Hover effects
                cardBg.on('pointerover', () => {
                    cardBg.setFillStyle(0xE8D9C0);
                    missionName.setColor('#f59e0b');
                });
                cardBg.on('pointerout', () => {
                    cardBg.setFillStyle(0xD4C4A8);
                    missionName.setColor(isDone ? '#16a34a' : '#5D4037');
                });

                cardBg.on('pointerdown', () => {
                    this.showMissionDetails(mission);
                });
            });

            // Scroll zone
            const scrollZone = this.scene.add.zone(modalX, scrollAreaTop + scrollAreaHeight / 2, modalWidth - 20, scrollAreaHeight);
            scrollZone.setInteractive();
            scrollZone.setDepth(5310);
            this.scene.cameras.main.ignore(scrollZone);
            this.addElement(scrollZone);
            contentElements.push(scrollZone);

            scrollZone.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, _dy: number, dz: number) => {
                scrollOffset = Phaser.Math.Clamp(scrollOffset + dz * 0.5, 0, maxScrollOffset);
                updateScrollPositions();
            });

            scrollZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                isDragging = true;
                lastPointerY = pointer.y;
            });

            this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
                if (isDragging && this.isOpen) {
                    const deltaY = lastPointerY - pointer.y;
                    scrollOffset = Phaser.Math.Clamp(scrollOffset + deltaY, 0, maxScrollOffset);
                    lastPointerY = pointer.y;
                    updateScrollPositions();
                }
            });

            this.scene.input.on('pointerup', () => {
                isDragging = false;
            });
        };

        const showRedeemContent = () => {
            contentElements.forEach(el => el.destroy());
            contentElements.length = 0;

            missionsTabBg.setTexture('square-buttons', 7);
            redeemTabBg.setTexture('square-buttons', 6);

            // Label
            const codeLabel = this.scene.add.text(modalX, contentY - 50, 'Enter Redeem Code:', {
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
            contentElements.push(codeLabel);

            // HTML input
            this.redeemInput = document.createElement('input');
            this.redeemInput.type = 'text';
            this.redeemInput.placeholder = 'Enter code here...';
            this.redeemInput.maxLength = 100;
            this.redeemInput.style.cssText = `
                position: fixed;
                left: 50%;
                top: 50%;
                transform: translate(-70%, -10px);
                width: 160px;
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
            document.body.appendChild(this.redeemInput);
            this.redeemInput.focus();

            // QR button
            const qrBtnBg = this.scene.add.sprite(modalX + 95, contentY - 20, 'square-buttons', 6);
            qrBtnBg.setDisplaySize(40, 32);
            qrBtnBg.setDepth(5302);
            qrBtnBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(qrBtnBg);
            this.addElement(qrBtnBg);
            contentElements.push(qrBtnBg);

            const qrText = this.scene.add.text(modalX + 95, contentY - 20, 'QR', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            qrText.setOrigin(0.5);
            qrText.setDepth(5303);
            qrText.setStroke('#5D4037', 1);
            this.scene.cameras.main.ignore(qrText);
            this.addElement(qrText);
            contentElements.push(qrText);

            qrBtnBg.on('pointerdown', () => this.openQRScanner());
            qrBtnBg.on('pointerover', () => qrBtnBg.setTint(0xcccccc));
            qrBtnBg.on('pointerout', () => qrBtnBg.clearTint());

            // Redeem button (extended width to near QR button)
            const redeemBtnBg = this.scene.add.sprite(modalX + 10, contentY + 40, 'square-buttons', 6);
            redeemBtnBg.setDisplaySize(145, 32);
            redeemBtnBg.setDepth(5302);
            redeemBtnBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(redeemBtnBg);
            this.addElement(redeemBtnBg);
            contentElements.push(redeemBtnBg);

            const redeemBtnText = this.scene.add.text(modalX + 10, contentY + 40, 'Redeem', {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            redeemBtnText.setOrigin(0.5);
            redeemBtnText.setDepth(5303);
            redeemBtnText.setStroke('#5D4037', 1);
            this.scene.cameras.main.ignore(redeemBtnText);
            this.addElement(redeemBtnText);
            contentElements.push(redeemBtnText);

            redeemBtnBg.on('pointerdown', () => {
                const code = this.redeemInput?.value.trim();
                if (code) {
                    this.processRedeemCode(code);
                    if (this.redeemInput) this.redeemInput.value = '';
                }
            });
            redeemBtnBg.on('pointerover', () => redeemBtnBg.setTint(0xcccccc));
            redeemBtnBg.on('pointerout', () => redeemBtnBg.clearTint());
        };

        // Tab handlers
        missionsTabBg.on('pointerdown', () => {
            if (this.activeTab !== 'missions') {
                this.activeTab = 'missions';
                this.cleanupRedeemInput();
                showMissionsContent();
            }
        });
        missionsTabBg.on('pointerover', () => missionsTabBg.setTint(0xcccccc));
        missionsTabBg.on('pointerout', () => missionsTabBg.clearTint());

        redeemTabBg.on('pointerdown', () => {
            if (this.activeTab !== 'redeem') {
                this.activeTab = 'redeem';
                showRedeemContent();
            }
        });
        redeemTabBg.on('pointerover', () => redeemTabBg.setTint(0xcccccc));
        redeemTabBg.on('pointerout', () => redeemTabBg.clearTint());

        // Refresh handler
        refreshBtnBg.on('pointerdown', () => {
            this.refreshCache();
            this.scene.tweens.add({
                targets: refreshBtn,
                angle: 360,
                duration: 500,
                ease: 'Power2',
                onComplete: () => refreshBtn.setAngle(0)
            });
            if (this.activeTab === 'missions') {
                showMissionsContent();
            }
        });
        refreshBtnBg.on('pointerover', () => refreshBtnBg.setTint(0xcccccc));
        refreshBtnBg.on('pointerout', () => refreshBtnBg.clearTint());

        // Show initial content
        showMissionsContent();

        // Close button
        const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 +35, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setAlpha(0);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 +35, 'X', {
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

    private showMissionDetails(mission: Mission): void {
        // Simple details popup - can be expanded later
        const message = `${mission.name}\n${mission.description}\nProgress: ${mission.progress}/${mission.target}`;
        this.callbacks.showToastMessage(message, 0xffffff);
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
                    const qrData = JSON.parse(decodedText);
                    if (qrData.eventId && qrData.verificationCode) {
                        this.callbacks.showToastMessage('QR Code scanned! Redeeming...', 0x4ade80);
                        this.processRedeemCodeWithEventId(qrData.verificationCode, qrData.eventId);
                    } else {
                        this.callbacks.showToastMessage('Invalid QR code format', 0xef4444);
                    }
                } catch {
                    if (this.redeemInput) {
                        this.redeemInput.value = decodedText;
                    }
                    this.callbacks.showToastMessage('QR Code scanned!', 0x4ade80);
                }
            }).catch(() => {});
        };

        html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            qrCodeSuccessCallback,
            () => {}
        ).catch(() => {
            this.callbacks.showToastMessage('Camera access denied', 0xef4444);
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

    private async processRedeemCode(code: string): Promise<void> {
        this.showRedeemResultModal(true, 'Validating code...', undefined, true);

        try {
            const result = await RedeemService.redeemCode(code);
            this.handleRedeemResult(result);
        } catch {
            this.showRedeemResultModal(false, 'Error validating code. Please try again.');
        }
    }

    private async processRedeemCodeWithEventId(code: string, eventId: string): Promise<void> {
        this.showRedeemResultModal(true, 'Validating code...', undefined, true);

        try {
            const result = await RedeemService.redeemCode(code, eventId);
            this.handleRedeemResult(result);
        } catch {
            this.showRedeemResultModal(false, 'Error validating code. Please try again.');
        }
    }

    private handleRedeemResult(result: any): void {
        if (result.success && result.reward) {
            let rewardMessage = '';
            if (result.event) {
                rewardMessage += `Event: ${result.event.name}\n`;
            }
            if (result.reward.message) {
                rewardMessage += result.reward.message + '\n';
            }
            rewardMessage += `Reward: ${result.reward.itemType}\nAmount: ${result.reward.amount}`;

            this.showRedeemResultModal(true, rewardMessage, undefined, false, true);

            this.scene.time.delayedCall(3000, () => {
                this.closeRedeemResultModal();
                this.close();
            });
        } else {
            this.showRedeemResultModal(false, result.message || 'Invalid or expired code');
        }
    }

    private showRedeemResultModal(success: boolean, message: string, icon?: string, isLoading: boolean = false, shouldClose: boolean = false): void {
        this.shouldCloseMailbox = shouldClose;
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

        // Hide main modal elements
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

        this.scene.time.delayedCall(100, () => {
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
                spinner.lineStyle(2, 0x4a90e2, 1);
                spinner.beginPath();
                spinner.arc(modalX, modalY - 5, 15, Phaser.Math.DegToRad(0), Phaser.Math.DegToRad(270), false);
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

            const msgText = this.scene.add.text(modalX, modalY + 30, message, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2,
                align: 'center'
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
        this.redeemResultElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.redeemResultElements = [];

        if (!this.shouldCloseMailbox) {
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
        this.shouldCloseMailbox = false;
    }

    public destroy(): void {
        this.cleanupRedeemInput();
        this.closeQRScanner();
        this.redeemResultElements.forEach(el => { if (el && el.destroy) el.destroy(); });
        super.destroy();
    }
}
