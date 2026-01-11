import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { PlantType, FertilizerType, GAME_CONSTANTS } from '../types/GameTypes';
import { MissionService, Mission } from '../MissionService';
import { RedeemService } from '../RedeemService';
import { GameDataService } from '../GameDataService';
import { getMissionSocketService, MissionUpdatedPayload } from '../MissionSocketService';
import { EventBus } from '../EventBus';
import { SocialSubmissionManager } from './SocialSubmissionManager';

interface MailboxCallbacks {
    getSeedCounts: () => Record<PlantType, number>;
    getFertilizerCounts: () => Record<FertilizerType, number>;
    showToastMessage: (text: string, color: number) => void;
    playSuccessSound: () => void;
    // Note: UI refresh is now handled by GameDataService.refreshAndUpdateUI()
}

// Submission type for missions - kept for backward compatibility
type SubmissionType = 'link' | 'image';

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
    private missionDetailElements: Phaser.GameObjects.GameObject[] = [];
    private qrScannerContainer: HTMLDivElement | null = null;
    private redeemInput: HTMLInputElement | null = null;
    private socialLinkInput: HTMLInputElement | null = null;
    private imageFileInput: HTMLInputElement | null = null;
    private uploadedImageUrl: string | null = null;
    private currentSubmissionType: SubmissionType = 'link';
    private shouldCloseMailbox: boolean = false;
    private tileSize: number;
    private socialSubmissionManager: SocialSubmissionManager | null = null;

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
     * Set missions from external cache (e.g., GameDataService)
     * Use this to avoid duplicate API calls
     */
    public setMissionsFromCache(missions: Mission[] | null): void {
        if (missions) {
            this.cachedMissions = missions;
            this.missionsCacheTime = Date.now();
            console.log('MailboxManager: Missions set from external cache:', missions.length);
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
        // Responsive modal size - increased height for better visibility
        const modalWidth = Math.min(300, screenWidth * 0.9);
        const modalHeight = Math.min(340, screenHeight * 0.85);
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
        this.closeMissionDetails();
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

        // Tab buttons - responsive sizing
        const tabY = modalY - modalHeight / 2 + 65;
        const tabWidth = Math.min(90, modalWidth * 0.32);
        const tabHeight = 24;
        const tabSpacing = Math.min(55, modalWidth * 0.2);

        // Missions tab
        const missionsTabBg = this.scene.add.sprite(modalX - tabSpacing, tabY, 'square-buttons', 6);
        missionsTabBg.setDisplaySize(tabWidth, tabHeight);
        missionsTabBg.setDepth(5302);
        missionsTabBg.setAlpha(0);
        missionsTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(missionsTabBg);
        this.addElement(missionsTabBg);

        const missionsTabText = this.scene.add.text(modalX - tabSpacing, tabY, 'Missions', {
            fontSize: '9px',
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
        const redeemTabBg = this.scene.add.sprite(modalX + tabSpacing, tabY, 'square-buttons', 7);
        redeemTabBg.setDisplaySize(tabWidth, tabHeight);
        redeemTabBg.setDepth(5302);
        redeemTabBg.setAlpha(0);
        redeemTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(redeemTabBg);
        this.addElement(redeemTabBg);

        const redeemTabText = this.scene.add.text(modalX + tabSpacing, tabY, 'Redeem', {
            fontSize: '9px',
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

        // Scrollable area setup - increased height
        const scrollAreaTop = modalY - modalHeight / 2 + 85;
        const scrollAreaHeight = 220;

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

        const showMissionsContent = () => {
            contentElements.forEach(el => el.destroy());
            contentElements.length = 0;
            scrollOffset = 0;

            missionsTabBg.setTexture('square-buttons', 6);
            redeemTabBg.setTexture('square-buttons', 7);

            // Use cached data directly - no background refresh
            // Cache is loaded on game start and updated only after user actions
            const missions: Mission[] | null = this.cachedMissions;

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
                const isPending = mission.status === 'pending';
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

                // Status icon - different colors for different states
                const iconX = cardX - cardWidth / 2 + 15;
                const iconColor = isDone ? 0x4ade80 : (isPending ? 0xfbbf24 : 0x3b82f6);
                const iconBg = this.scene.add.circle(iconX, baseY, 8, iconColor);
                iconBg.setDepth(5304);
                iconBg.setMask(scrollMask);
                this.scene.cameras.main.ignore(iconBg);
                this.addElement(iconBg);
                contentElements.push(iconBg);
                (iconBg as any).originalY = baseY;

                const statusIconText = isDone ? '✓' : (isPending ? '⏳' : '!');
                const statusIcon = this.scene.add.text(iconX, baseY, statusIconText, {
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

                // Mission name - different colors for different states
                const nameX = cardX - cardWidth / 2 + 30;
                const nameY = baseY - 8;
                const nameColor = isDone ? '#16a34a' : (isPending ? '#d97706' : '#5D4037');
                const missionName = this.scene.add.text(nameX, nameY, mission.name, {
                    fontSize: '9px',
                    fontFamily: 'PixelFont',
                    color: nameColor,
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
                const barWidth = 100;
                const barHeight = 10;
                const barX = cardX - cardWidth / 2 + 35;
                const barY = baseY + 8;
                const isClaimed = mission.status === 'claimed';
                const isCompleted = mission.status === 'completed';

                const barBorder = this.scene.add.rectangle(barX, barY, barWidth + 2, barHeight + 2, 0x8B7355);
                barBorder.setOrigin(0, 0.5);
                barBorder.setDepth(5304);
                barBorder.setMask(scrollMask);
                this.scene.cameras.main.ignore(barBorder);
                this.addElement(barBorder);
                contentElements.push(barBorder);
                (barBorder as any).originalY = barY;

                const progressBarBg = this.scene.add.rectangle(barX + 1, barY, barWidth, barHeight, 0x3E2723);
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

                // Progress text on the bar (white text with dark stroke for visibility)
                const progressText = this.scene.add.text(barX + barWidth / 2, barY, `${mission.progress}/${mission.target}`, {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    resolution: 2
                });
                progressText.setOrigin(0.5);
                progressText.setDepth(5307);
                progressText.setStroke('#000000', 2);
                progressText.setMask(scrollMask);
                this.scene.cameras.main.ignore(progressText);
                this.addElement(progressText);
                contentElements.push(progressText);
                (progressText as any).originalY = barY;

                // Right side: Reward display OR Claim button OR Claimed checkmark
                const rightSideX = cardX + cardWidth / 2 - 30;

                if (isClaimed) {
                    // Show green checkmark for claimed missions
                    const claimedCheck = this.scene.add.text(rightSideX, baseY, '✓', {
                        fontSize: '16px',
                        fontFamily: 'Arial',
                        color: '#22c55e',
                        resolution: 2
                    });
                    claimedCheck.setOrigin(0.5);
                    claimedCheck.setDepth(5304);
                    claimedCheck.setStroke('#166534', 2);
                    claimedCheck.setMask(scrollMask);
                    this.scene.cameras.main.ignore(claimedCheck);
                    this.addElement(claimedCheck);
                    contentElements.push(claimedCheck);
                    (claimedCheck as any).originalY = baseY;
                } else if (isCompleted) {
                    // Show Claim button for completed missions
                    const claimBtnBg = this.scene.add.rectangle(rightSideX, baseY, 50, 20, 0x22c55e);
                    claimBtnBg.setDepth(5304);
                    claimBtnBg.setStrokeStyle(1, 0x166534);
                    claimBtnBg.setInteractive({ useHandCursor: true });
                    claimBtnBg.setMask(scrollMask);
                    this.scene.cameras.main.ignore(claimBtnBg);
                    this.addElement(claimBtnBg);
                    contentElements.push(claimBtnBg);
                    (claimBtnBg as any).originalY = baseY;

                    const claimBtnText = this.scene.add.text(rightSideX, baseY, 'Claim', {
                        fontSize: '8px',
                        fontFamily: 'PixelFont',
                        color: '#FFFFFF',
                        resolution: 2
                    });
                    claimBtnText.setOrigin(0.5);
                    claimBtnText.setDepth(5305);
                    claimBtnText.setStroke('#166534', 1);
                    claimBtnText.setMask(scrollMask);
                    this.scene.cameras.main.ignore(claimBtnText);
                    this.addElement(claimBtnText);
                    contentElements.push(claimBtnText);
                    (claimBtnText as any).originalY = baseY;

                    claimBtnBg.on('pointerover', () => claimBtnBg.setFillStyle(0x4ade80));
                    claimBtnBg.on('pointerout', () => claimBtnBg.setFillStyle(0x22c55e));
                    claimBtnBg.on('pointerdown', (pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                        event.stopPropagation();
                        this.claimMissionReward(mission.id);
                    });
                } else {
                    // Show all rewards for active/pending missions - auto wrap with right alignment
                    const rewardParts: string[] = [];
                    if (mission.reward) {
                        if (mission.reward.xp && mission.reward.xp > 0) {
                            rewardParts.push(`⭐${mission.reward.xp}`);
                        }
                        if (mission.reward.reputation && mission.reward.reputation > 0) {
                            rewardParts.push(`🏆${mission.reward.reputation}`);
                        }
                        if (mission.reward.items && mission.reward.items.length > 0) {
                            mission.reward.items.forEach(item => {
                                const icon = item.type === 'gold' ? '💰' : item.type === 'gem' ? '💎' : '🎁';
                                rewardParts.push(`${icon}${item.amount}`);
                            });
                        }
                    }

                    // Determine items per row based on total count
                    // 1-2: all in 1 row, 3-4: 2 per row, 5+: 3 per row
                    const total = rewardParts.length;
                    const maxPerRow = total <= 2 ? total : (total <= 4 ? 2 : 3);

                    // Split into rows
                    const rows: string[][] = [];
                    for (let i = 0; i < total; i += maxPerRow) {
                        rows.push(rewardParts.slice(i, i + maxPerRow));
                    }

                    const rowHeight = 11;
                    const totalRows = rows.length;
                    const startY = baseY - ((totalRows - 1) * rowHeight) / 2;

                    rows.forEach((row, rowIdx) => {
                        const rowText = row.join(' ');
                        const rewardY = startY + rowIdx * rowHeight;

                        const rewardDisplay = this.scene.add.text(rightSideX, rewardY, rowText, {
                            fontSize: '8px',
                            fontFamily: 'PixelFont',
                            color: '#fbbf24',
                            resolution: 2,
                            align: 'center'
                        });
                        rewardDisplay.setOrigin(0.5);
                        rewardDisplay.setDepth(5304);
                        rewardDisplay.setStroke('#92400e', 1);
                        rewardDisplay.setMask(scrollMask);
                        this.scene.cameras.main.ignore(rewardDisplay);
                        this.addElement(rewardDisplay);
                        contentElements.push(rewardDisplay);
                        (rewardDisplay as any).originalY = rewardY;
                    });
                }

                // Hover effects
                cardBg.on('pointerover', () => {
                    cardBg.setFillStyle(0xE8D9C0);
                    missionName.setColor('#f59e0b');
                });
                cardBg.on('pointerout', () => {
                    cardBg.setFillStyle(0xD4C4A8);
                    missionName.setColor(isDone ? '#16a34a' : '#5D4037');
                });

                // Track click start position to differentiate from drag
                let clickStartY = 0;
                cardBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                    clickStartY = pointer.y;
                    isDragging = true;
                    lastPointerY = pointer.y;
                });
                cardBg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
                    // Only trigger click if pointer didn't move much (not a drag)
                    if (Math.abs(pointer.y - clickStartY) < 10) {
                        this.showMissionDetails(mission);
                    }
                    isDragging = false;
                });
            });

            // Scroll handling via scene input (don't use zone to avoid blocking card clicks)
            // Handle wheel scroll on the modal area
            this.scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, _dy: number, dz: number) => {
                if (this.isOpen && this.activeTab === 'missions') {
                    scrollOffset = Phaser.Math.Clamp(scrollOffset + dz * 0.5, 0, maxScrollOffset);
                    updateScrollPositions();
                }
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

            // HTML input - positioned relative to game canvas and modal
            this.redeemInput = document.createElement('input');
            this.redeemInput.type = 'text';
            this.redeemInput.placeholder = 'Enter code here...';
            this.redeemInput.maxLength = 150;

            // Get game canvas position for accurate placement
            const canvas = this.scene.game.canvas;
            const canvasRect = canvas.getBoundingClientRect();
            const scaleX = canvasRect.width / this.scene.scale.width;
            const scaleY = canvasRect.height / this.scene.scale.height;

            // Calculate input size based on modal width (not canvas)
            const scaledModalWidth = modalWidth * scaleX;
            const inputWidth = Math.min(180, scaledModalWidth * 2);

            // Position at modal center
            const inputLeft = canvasRect.left + (modalX * scaleX);
            const inputTop = canvasRect.top + ((contentY - 20) * scaleY);

            this.redeemInput.style.cssText = `
                position: fixed;
                left: ${inputLeft}px;
                top: ${inputTop}px;
                transform: translateX(-55%);
                width: ${inputWidth}px;
                padding: 5px 8px;
                font-size: 10px;
                font-family: 'PixelFont', monospace;
                border: 2px solid #5D4037;
                border-radius: 5px;
                background-color: #FFF8E1;
                color: #5D4037;
                outline: none;
                text-align: center;
                z-index: 10001;
                box-sizing: border-box;
            `;
            document.body.appendChild(this.redeemInput);
            this.redeemInput.focus();

            // QR button - responsive positioning
            const qrBtnX = modalX + modalWidth / 2 - 60; // Position near right edge of modal
            const qrBtnY = contentY - 15;
            const qrBtnBg = this.scene.add.sprite(qrBtnX, qrBtnY, 'square-buttons', 6);
            qrBtnBg.setDisplaySize(36, 28);
            qrBtnBg.setDepth(5302);
            qrBtnBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(qrBtnBg);
            this.addElement(qrBtnBg);
            contentElements.push(qrBtnBg);

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
            contentElements.push(qrText);

            qrBtnBg.on('pointerdown', () => this.openQRScanner());
            qrBtnBg.on('pointerover', () => qrBtnBg.setTint(0xcccccc));
            qrBtnBg.on('pointerout', () => qrBtnBg.clearTint());

            // Redeem button - responsive width based on modal
            const redeemBtnWidth = Math.min(145, modalWidth * 0.5);
            const redeemBtnBg = this.scene.add.sprite(modalX, contentY + 40, 'square-buttons', 6);
            redeemBtnBg.setDisplaySize(redeemBtnWidth, 30);
            redeemBtnBg.setDepth(5302);
            redeemBtnBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(redeemBtnBg);
            this.addElement(redeemBtnBg);
            contentElements.push(redeemBtnBg);

            const redeemBtnText = this.scene.add.text(modalX, contentY + 40, 'Redeem', {
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
        refreshBtnBg.on('pointerdown', async () => {
            // Show loading animation
            this.scene.tweens.add({
                targets: refreshBtn,
                angle: 360,
                duration: 500,
                ease: 'Power2',
                onComplete: () => refreshBtn.setAngle(0)
            });
            
            // Fetch fresh missions from API
            await this.preloadMissions();
            
            // Refresh content
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
        // Create mission detail modal
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 320;
        // Increase height to fit rewards section
        const modalHeight = mission.type === 'social' ? 420 : 360;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.7);
        overlay.setDepth(5400);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.missionDetailElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5401);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.missionDetailElements.push(modalBg);

        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.scene.time.delayedCall(100, () => {
            // Close button
            const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'square-buttons', 7);
            closeBtnBg.setDisplaySize(24, 24);
            closeBtnBg.setDepth(5402);
            closeBtnBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(closeBtnBg);
            this.missionDetailElements.push(closeBtnBg);

            const closeText = this.scene.add.text(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'X', {
                fontSize: '14px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            closeText.setOrigin(0.5);
            closeText.setDepth(5403);
            closeText.setStroke('#5D4037', 2);
            this.scene.cameras.main.ignore(closeText);
            this.missionDetailElements.push(closeText);

            closeBtnBg.on('pointerdown', () => this.closeMissionDetails());
            closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
            closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

            // Mission name
            const title = this.scene.add.text(modalX + 15, modalY - modalHeight / 2 + 45, mission.name, {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2,
                wordWrap: { width: modalWidth - 80 }
            });
            title.setOrigin(0.5);
            title.setDepth(5402);
            title.setStroke('#5D4037', 2);
            this.scene.cameras.main.ignore(title);
            this.missionDetailElements.push(title);

            // Mission type badge
            const typeColor = mission.type === 'social' ? 0x3b82f6 : 0x22c55e;
            const typeLabel = mission.type.charAt(0).toUpperCase() + mission.type.slice(1);
            const typeBadge = this.scene.add.rectangle(modalX + 15, modalY - modalHeight / 2 + 70, 60, 16, typeColor);
            typeBadge.setDepth(5402);
            this.scene.cameras.main.ignore(typeBadge);
            this.missionDetailElements.push(typeBadge);

            const typeText = this.scene.add.text(modalX + 15, modalY - modalHeight / 2 + 70, typeLabel, {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            typeText.setOrigin(0.5);
            typeText.setDepth(5403);
            this.scene.cameras.main.ignore(typeText);
            this.missionDetailElements.push(typeText);

            // Description - position closer to type badge
            const description = this.scene.add.text(modalX + 15, modalY - modalHeight / 2 + 95, mission.description, {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#FFF8E1',
                resolution: 2,
                wordWrap: { width: modalWidth - 80 },
                align: 'center'
            });
            description.setOrigin(0.5, 0);
            description.setDepth(5402);
            description.setStroke('#5D4037', 1);
            this.scene.cameras.main.ignore(description);
            this.missionDetailElements.push(description);

            // Progress bar
            const barWidth = 160;
            const barHeight = 12;
            const barY = modalY - 40;
            const progressPercent = Math.min((mission.progress / mission.target) * 100, 100);

            const barBg = this.scene.add.rectangle(modalX + 15, barY, barWidth, barHeight, 0x5D4037);
            barBg.setDepth(5402);
            this.scene.cameras.main.ignore(barBg);
            this.missionDetailElements.push(barBg);

            const barFillWidth = Math.max(2, (barWidth - 4) * progressPercent / 100);
            const barFill = this.scene.add.rectangle(modalX + 15 - (barWidth - 4) / 2 + barFillWidth / 2, barY, barFillWidth, barHeight - 4,
                mission.status === 'completed' || mission.status === 'claimed' ? 0x22c55e : 0xf59e0b);
            barFill.setDepth(5403);
            this.scene.cameras.main.ignore(barFill);
            this.missionDetailElements.push(barFill);

            const progressText = this.scene.add.text(modalX + 15, barY, `${mission.progress}/${mission.target}`, {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            progressText.setOrigin(0.5);
            progressText.setDepth(5404);
            progressText.setStroke('#000000', 2);
            this.scene.cameras.main.ignore(progressText);
            this.missionDetailElements.push(progressText);

            // Reward section - compact styled box with icons
            const rewardSectionY = barY + 25;
            const rewardX = modalX + 10;
            
            // Reward section background - smaller
            const rewardBg = this.scene.add.rectangle(rewardX, rewardSectionY + 20, modalWidth - 95, 50, 0x3E2723, 0.8);
            rewardBg.setStrokeStyle(2, 0x5D4037);
            rewardBg.setDepth(5402);
            this.scene.cameras.main.ignore(rewardBg);
            this.missionDetailElements.push(rewardBg);

            // Reward title
            const rewardTitle = this.scene.add.text(rewardX, rewardSectionY + 2, '🎁 Rewards', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#fbbf24',
                resolution: 2
            });
            rewardTitle.setOrigin(0.5);
            rewardTitle.setDepth(5403);
            rewardTitle.setStroke('#5D4037', 2);
            this.scene.cameras.main.ignore(rewardTitle);
            this.missionDetailElements.push(rewardTitle);

            // Display rewards with icons
            const rewardItems: { icon: string; text: string; color: string }[] = [];
            
            if (mission.reward) {
                if (mission.reward.xp && mission.reward.xp > 0) {
                    rewardItems.push({ icon: '⭐', text: `${mission.reward.xp} XP`, color: '#a855f7' });
                }
                if (mission.reward.reputation && mission.reward.reputation > 0) {
                    rewardItems.push({ icon: '🏆', text: `${mission.reward.reputation} Rep`, color: '#f59e0b' });
                }
                if (mission.reward.items && mission.reward.items.length > 0) {
                    mission.reward.items.forEach(item => {
                        const itemIcon = this.getItemIcon(item.type);
                        rewardItems.push({ icon: itemIcon, text: `${item.amount} ${item.type}`, color: '#4ade80' });
                    });
                }
            }

            if (rewardItems.length === 0) {
                const noRewardText = this.scene.add.text(rewardX, rewardSectionY + 22, 'Complete to earn rewards!', {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: '#a3a3a3',
                    resolution: 2
                });
                noRewardText.setOrigin(0.5);
                noRewardText.setDepth(5403);
                this.scene.cameras.main.ignore(noRewardText);
                this.missionDetailElements.push(noRewardText);
            } else {
                // Calculate layout for reward items (horizontal layout) - compact
                const itemSpacing = Math.min(60, (modalWidth - 60) / rewardItems.length);
                const totalWidth = (rewardItems.length - 1) * itemSpacing;
                const startX = rewardX - totalWidth / 2;

                rewardItems.forEach((item, index) => {
                    const itemX = startX + index * itemSpacing;
                    const itemY = rewardSectionY + 22;

                    // Icon - smaller
                    const iconText = this.scene.add.text(itemX, itemY - 3, item.icon, {
                        fontSize: '14px',
                        resolution: 2
                    });
                    iconText.setOrigin(0.5);
                    iconText.setDepth(5403);
                    this.scene.cameras.main.ignore(iconText);
                    this.missionDetailElements.push(iconText);

                    // Value text - smaller
                    const valueText = this.scene.add.text(itemX, itemY + 12, item.text, {
                        fontSize: '7px',
                        fontFamily: 'PixelFont',
                        color: item.color,
                        resolution: 2
                    });
                    valueText.setOrigin(0.5);
                    valueText.setDepth(5403);
                    valueText.setStroke('#000000', 1);
                    this.scene.cameras.main.ignore(valueText);
                    this.missionDetailElements.push(valueText);
                });
            }

            // Adjust positions for status/action buttons - after rewards
            const actionY = rewardSectionY + 75;

            // Handle different mission states
            if (mission.status === 'active') {
                // Active mission - show submission form for social missions
                if (mission.type === 'social') {
                    // Use reusable SocialSubmissionManager
                    this.socialSubmissionManager = new SocialSubmissionManager(this.scene, {
                        showToastMessage: (text, color) => this.callbacks.showToastMessage(text, color),
                        playSuccessSound: () => this.callbacks.playSuccessSound(),
                        onSubmitSuccess: async () => {
                            this.closeMissionDetails();
                            await this.preloadMissions();
                            this.close();
                            this.open();
                        }
                    });
                    this.socialSubmissionManager.create({
                        modalX: modalX + 15,
                        modalY,
                        modalWidth,
                        modalHeight,
                        actionY,
                        missionId: mission.id,
                        baseDepth: 5402
                    });
                    // Add elements to detail elements for cleanup
                    this.missionDetailElements.push(...this.socialSubmissionManager.getElements());
                } else {
                    // For non-social active missions, show "In Progress" status
                    const inProgressLabel = this.scene.add.text(modalX, actionY, '🔄 In Progress', {
                        fontSize: '10px',
                        fontFamily: 'PixelFont',
                        color: '#3b82f6',
                        resolution: 2
                    });
                    inProgressLabel.setOrigin(0.5);
                    inProgressLabel.setDepth(5402);
                    inProgressLabel.setStroke('#1e3a8a', 2);
                    this.scene.cameras.main.ignore(inProgressLabel);
                    this.missionDetailElements.push(inProgressLabel);
                }
            } else if (mission.status === 'completed') {
                // Completed mission - admin approved, show claim button
                
                // Show "Approved" status for social missions
                if (mission.type === 'social') {
                    const approvedLabel = this.scene.add.text(modalX, actionY, '✅ Approved', {
                        fontSize: '10px',
                        fontFamily: 'PixelFont',
                        color: '#4ade80',
                        resolution: 2
                    });
                    approvedLabel.setOrigin(0.5);
                    approvedLabel.setDepth(5402);
                    approvedLabel.setStroke('#166534', 2);
                    this.scene.cameras.main.ignore(approvedLabel);
                    this.missionDetailElements.push(approvedLabel);
                }

                // Claim button
                const claimBtnBg = this.scene.add.sprite(modalX, modalY + modalHeight / 2 - 30, 'square-buttons', 6);
                claimBtnBg.setDisplaySize(120, 30);
                claimBtnBg.setTint(0x4ade80);
                claimBtnBg.setDepth(5402);
                claimBtnBg.setInteractive({ useHandCursor: true });
                this.scene.cameras.main.ignore(claimBtnBg);
                this.missionDetailElements.push(claimBtnBg);

                const claimText = this.scene.add.text(modalX, modalY + modalHeight / 2 - 30, '🎁 Claim Reward', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    resolution: 2
                });
                claimText.setOrigin(0.5);
                claimText.setDepth(5403);
                claimText.setStroke('#166534', 2);
                this.scene.cameras.main.ignore(claimText);
                this.missionDetailElements.push(claimText);

                claimBtnBg.on('pointerdown', () => this.claimMissionReward(mission.id));
                claimBtnBg.on('pointerover', () => claimBtnBg.setTint(0x86efac));
                claimBtnBg.on('pointerout', () => claimBtnBg.setTint(0x4ade80));
            } else if (mission.status === 'pending') {
                // Pending mission - proof submitted, waiting for review
                const pendingLabel = this.scene.add.text(modalX, actionY, '⏳ Pending Review', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#fbbf24',
                    resolution: 2
                });
                pendingLabel.setOrigin(0.5);
                pendingLabel.setDepth(5402);
                pendingLabel.setStroke('#92400e', 2);
                this.scene.cameras.main.ignore(pendingLabel);
                this.missionDetailElements.push(pendingLabel);

                // Show submitted proof if available
                if (mission.proof) {
                    const proofLabel = this.scene.add.text(modalX, actionY + 20, 'Proof submitted ✓', {
                        fontSize: '8px',
                        fontFamily: 'PixelFont',
                        color: '#a3a3a3',
                        resolution: 2
                    });
                    proofLabel.setOrigin(0.5);
                    proofLabel.setDepth(5402);
                    this.scene.cameras.main.ignore(proofLabel);
                    this.missionDetailElements.push(proofLabel);
                }
            } else if (mission.status === 'claimed') {
                // Already claimed - show completed status
                const claimedLabel = this.scene.add.text(modalX, actionY, '✅ Reward Claimed', {
                    fontSize: '11px',
                    fontFamily: 'PixelFont',
                    color: '#22c55e',
                    resolution: 2
                });
                claimedLabel.setOrigin(0.5);
                claimedLabel.setDepth(5402);
                claimedLabel.setStroke('#166534', 2);
                this.scene.cameras.main.ignore(claimedLabel);
                this.missionDetailElements.push(claimedLabel);
            }
        });

        overlay.on('pointerdown', () => this.closeMissionDetails());
    }

    /**
     * Get icon for item type
     */
    private getItemIcon(itemType: string): string {
        const iconMap: Record<string, string> = {
            'gold': '💰',
            'gem': '💎',
            'ruby': '💎',
            'seed': '🌱',
            'water': '💧',
            'fertilizer': '🧪',
            'glove': '🧤',
            'pesticide': '🧴',
            'algae-seed': '🌿',
            'mushroom-seed': '🍄',
            'carrot-seed': '🥕',
            'tomato-seed': '🍅',
            'fruit': '🍎',
            'xp': '⭐',
            'reputation': '🏆',
        };
        
        // Try exact match first
        const lowerType = itemType.toLowerCase();
        if (iconMap[lowerType]) {
            return iconMap[lowerType];
        }
        
        // Try partial match
        for (const [key, icon] of Object.entries(iconMap)) {
            if (lowerType.includes(key)) {
                return icon;
            }
        }
        
        return '🎁'; // Default icon
    }

    private closeMissionDetails(): void {
        // Cleanup social submission manager
        if (this.socialSubmissionManager) {
            this.socialSubmissionManager.destroy();
            this.socialSubmissionManager = null;
        }

        // Cleanup social link input (legacy - kept for backward compatibility)
        if (this.socialLinkInput && this.socialLinkInput.parentNode) {
            this.socialLinkInput.parentNode.removeChild(this.socialLinkInput);
        }
        this.socialLinkInput = null;

        // Cleanup image file input (legacy - kept for backward compatibility)
        if (this.imageFileInput && this.imageFileInput.parentNode) {
            this.imageFileInput.parentNode.removeChild(this.imageFileInput);
        }
        this.imageFileInput = null;
        this.uploadedImageUrl = null;
        this.currentSubmissionType = 'link';

        // Destroy all mission detail elements
        this.missionDetailElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.missionDetailElements = [];
    }

    /**
     * Create submission form with tabs for Link or Image upload
     */
    private createSubmissionForm(
        modalX: number, 
        modalY: number, 
        modalWidth: number, 
        modalHeight: number, 
        actionY: number, 
        missionId: string
    ): void {
        // Reset state
        this.currentSubmissionType = 'link';
        this.uploadedImageUrl = null;

        // Tab buttons for Link / Image - position at actionY
        const tabY = actionY;
        const tabWidth = 70;
        const tabHeight = 22;
        const tabSpacing = 10;

        // Link tab
        const linkTabBg = this.scene.add.rectangle(
            modalX - tabWidth / 2 - tabSpacing / 2,
            tabY,
            tabWidth,
            tabHeight,
            0x4ade80
        );
        linkTabBg.setDepth(5402);
        linkTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(linkTabBg);
        this.missionDetailElements.push(linkTabBg);

        const linkTabText = this.scene.add.text(modalX - tabWidth / 2 - tabSpacing / 2, tabY, '🔗 Link', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        linkTabText.setOrigin(0.5);
        linkTabText.setDepth(5403);
        this.scene.cameras.main.ignore(linkTabText);
        this.missionDetailElements.push(linkTabText);

        // Image tab
        const imageTabBg = this.scene.add.rectangle(
            modalX + tabWidth / 2 + tabSpacing / 2,
            tabY,
            tabWidth,
            tabHeight,
            0x5D4037
        );
        imageTabBg.setDepth(5402);
        imageTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(imageTabBg);
        this.missionDetailElements.push(imageTabBg);

        const imageTabText = this.scene.add.text(modalX + tabWidth / 2 + tabSpacing / 2, tabY, '📷 Image', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        imageTabText.setOrigin(0.5);
        imageTabText.setDepth(5403);
        this.scene.cameras.main.ignore(imageTabText);
        this.missionDetailElements.push(imageTabText);

        // Content area - below tabs
        const contentY = tabY + 30;

        // Create link input (default visible)
        const linkInputContainer = this.createLinkInput(modalX, contentY);

        // Create image upload area (hidden by default)
        const imageUploadContainer = this.createImageUploadArea(modalX, contentY);
        imageUploadContainer.setVisible(false);

        // Tab click handlers
        linkTabBg.on('pointerdown', () => {
            this.currentSubmissionType = 'link';
            linkTabBg.setFillStyle(0x4ade80);
            imageTabBg.setFillStyle(0x5D4037);
            linkInputContainer.setVisible(true);
            imageUploadContainer.setVisible(false);
            // Show/hide HTML input
            if (this.socialLinkInput) this.socialLinkInput.style.display = 'block';
        });

        imageTabBg.on('pointerdown', () => {
            this.currentSubmissionType = 'image';
            linkTabBg.setFillStyle(0x5D4037);
            imageTabBg.setFillStyle(0x4ade80);
            linkInputContainer.setVisible(false);
            imageUploadContainer.setVisible(true);
            // Hide HTML input when on image tab
            if (this.socialLinkInput) this.socialLinkInput.style.display = 'none';
        });

        // Submit button - at bottom of modal
        const submitBtnBg = this.scene.add.sprite(modalX, modalY + modalHeight / 2 - 38, 'square-buttons', 6);
        submitBtnBg.setDisplaySize(100, 28);
        submitBtnBg.setDepth(5402);
        submitBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(submitBtnBg);
        this.missionDetailElements.push(submitBtnBg);

        const submitText = this.scene.add.text(modalX, modalY + modalHeight / 2 - 38, 'Submit', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        submitText.setOrigin(0.5);
        submitText.setDepth(5403);
        submitText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(submitText);
        this.missionDetailElements.push(submitText);

        submitBtnBg.on('pointerdown', () => {
            if (this.currentSubmissionType === 'link') {
                const link = this.socialLinkInput?.value.trim();
                if (link) {
                    this.submitMissionProof(missionId, 'link', link);
                } else {
                    this.callbacks.showToastMessage('Please enter a valid link', 0xef4444);
                }
            } else {
                if (this.uploadedImageUrl) {
                    this.submitMissionProof(missionId, 'image', this.uploadedImageUrl);
                } else {
                    this.callbacks.showToastMessage('Please upload an image first', 0xef4444);
                }
            }
        });
        submitBtnBg.on('pointerover', () => submitBtnBg.setTint(0xcccccc));
        submitBtnBg.on('pointerout', () => submitBtnBg.clearTint());
    }

    /**
     * Create link input field
     */
    private createLinkInput(modalX: number, contentY: number): Phaser.GameObjects.Container {
        const container = this.scene.add.container(0, 0);
        container.setDepth(5402);
        this.scene.cameras.main.ignore(container);
        this.missionDetailElements.push(container);

        // Label
        const label = this.scene.add.text(modalX, contentY, 'Paste your link:', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        label.setOrigin(0.5);
        this.scene.cameras.main.ignore(label);
        container.add(label);

        // Input background placeholder (visual guide)
        const inputBg = this.scene.add.rectangle(modalX, contentY + 25, 180, 28, 0xFFF8E1);
        inputBg.setStrokeStyle(2, 0x5D4037);
        this.scene.cameras.main.ignore(inputBg);
        container.add(inputBg);

        // Create HTML input - position relative to contentY
        this.socialLinkInput = document.createElement('input');
        this.socialLinkInput.type = 'text';
        this.socialLinkInput.placeholder = 'https://...';

        const canvas = this.scene.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / this.scene.scale.width;
        const scaleY = canvasRect.height / this.scene.scale.height;
        
        const inputWidth = 176 * scaleX;
        const inputLeft = canvasRect.left + modalX * scaleX;
        const inputTop = canvasRect.top + (contentY + 25) * scaleY;

        this.socialLinkInput.style.cssText = `
            position: fixed;
            left: ${inputLeft}px;
            top: ${inputTop}px;
            transform: translate(-50%, -50%);
            width: ${inputWidth}px;
            padding: 6px 10px;
            font-size: 10px;
            font-family: 'PixelFont', monospace;
            border: none;
            background-color: transparent;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
            box-sizing: border-box;
        `;
        document.body.appendChild(this.socialLinkInput);
        this.socialLinkInput.focus();

        return container;
    }

    /**
     * Create image upload area
     */
    private createImageUploadArea(modalX: number, contentY: number): Phaser.GameObjects.Container {
        const container = this.scene.add.container(0, 0);
        container.setDepth(5402);
        this.scene.cameras.main.ignore(container);
        this.missionDetailElements.push(container);

        // Upload button/area
        const uploadBg = this.scene.add.rectangle(modalX, contentY + 5, 160, 40, 0x3E2723, 0.8);
        uploadBg.setStrokeStyle(2, 0x5D4037, 1);
        uploadBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(uploadBg);
        container.add(uploadBg);

        const uploadText = this.scene.add.text(modalX, contentY + 5, '📤 Click to upload image', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        uploadText.setOrigin(0.5);
        this.scene.cameras.main.ignore(uploadText);
        container.add(uploadText);

        // Status text
        const statusText = this.scene.add.text(modalX, contentY + 35, '', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        statusText.setOrigin(0.5);
        this.scene.cameras.main.ignore(statusText);
        container.add(statusText);

        // Hidden file input
        this.imageFileInput = document.createElement('input');
        this.imageFileInput.type = 'file';
        this.imageFileInput.accept = 'image/*';
        this.imageFileInput.style.display = 'none';
        document.body.appendChild(this.imageFileInput);

        // Handle file selection
        this.imageFileInput.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;

            // Validate file
            if (!file.type.startsWith('image/')) {
                this.callbacks.showToastMessage('Please select an image file', 0xef4444);
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                this.callbacks.showToastMessage('Image must be less than 5MB', 0xef4444);
                return;
            }

            // Show uploading status
            uploadText.setText('⏳ Uploading...');
            statusText.setText('Please wait...');
            uploadBg.setFillStyle(0x5D4037, 0.5); // Dim while uploading

            try {
                const { IPFSService } = await import('../../services/ipfsService');
                const ipfsUrl = await IPFSService.uploadImage(file);
                
                this.uploadedImageUrl = ipfsUrl;
                uploadText.setText('✅ Image uploaded!');
                uploadBg.setFillStyle(0x166534, 0.8); // Green background on success
                statusText.setText(file.name.length > 25 ? file.name.slice(0, 22) + '...' : file.name);
                statusText.setColor('#4ade80');
                this.callbacks.showToastMessage('Image uploaded successfully!', 0x4ade80);
            } catch (error: any) {
                console.error('Upload error:', error);
                uploadText.setText('❌ Upload failed');
                uploadBg.setFillStyle(0x7f1d1d, 0.8); // Red background on error
                statusText.setText('Click to try again');
                statusText.setColor('#ef4444');
                
                // Show specific error message
                const errorMsg = error?.message || 'Failed to upload image';
                this.callbacks.showToastMessage(errorMsg, 0xef4444);
                
                // Reset after 3 seconds
                this.scene.time.delayedCall(3000, () => {
                    uploadText.setText('📤 Click to upload image');
                    uploadBg.setFillStyle(0x3E2723, 0.8);
                    statusText.setText('');
                });
            }
        });

        // Click handler
        uploadBg.on('pointerdown', () => {
            this.imageFileInput?.click();
        });
        uploadBg.on('pointerover', () => uploadBg.setStrokeStyle(2, 0x4ade80, 1));
        uploadBg.on('pointerout', () => uploadBg.setStrokeStyle(2, 0x5D4037, 1));

        return container;
    }

    /**
     * Submit mission proof (link or image URL) via WebSocket
     */
    private async submitMissionProof(missionId: string, type: SubmissionType, proof: string): Promise<void> {
        const isImage = type === 'image';
        this.callbacks.showToastMessage(isImage ? 'Submitting image proof...' : 'Submitting link...', 0x4a90e2);

        const missionSocketService = getMissionSocketService();

        // Try WebSocket first
        if (missionSocketService.isConnected()) {
            console.log('[MailboxManager] Submitting proof via WebSocket');
            
            // Setup one-time listener for mission update response
            const handleMissionUpdated = (payload: MissionUpdatedPayload) => {
                if (payload.id === missionId || payload.missionId === missionId) {
                    // Remove listener after receiving response
                    EventBus.off('mission_socket:mission_updated', handleMissionUpdated);
                    
                    if (payload.status === 'pending') {
                        this.callbacks.showToastMessage('✅ Proof submitted! Pending review.', 0x22c55e);
                        this.callbacks.playSuccessSound();
                        this.closeMissionDetails();
                        
                        // Update cached mission
                        if (this.cachedMissions) {
                            const index = this.cachedMissions.findIndex(m => m.id === missionId);
                            if (index !== -1) {
                                this.cachedMissions[index] = {
                                    ...this.cachedMissions[index],
                                    status: payload.status,
                                    proof: payload.proof,
                                };
                            }
                        }
                        
                        // Refresh missions list
                        this.close();
                        this.open();
                    } else {
                        this.callbacks.showToastMessage('❌ Failed to submit. Please try again.', 0xef4444);
                    }
                }
            };

            EventBus.on('mission_socket:mission_updated', handleMissionUpdated);
            
            // Set timeout to remove listener if no response
            this.scene.time.delayedCall(10000, () => {
                EventBus.off('mission_socket:mission_updated', handleMissionUpdated);
            });

            // Emit submit proof event
            missionSocketService.submitProof(missionId, proof);
        } else {
            // Fallback to REST API
            console.log('[MailboxManager] WebSocket not connected, using REST API');
            try {
                const result = await MissionService.submitProof(missionId, proof);

                if (result) {
                    this.callbacks.showToastMessage('✅ Proof submitted! Pending review.', 0x22c55e);
                    this.callbacks.playSuccessSound();
                    this.closeMissionDetails();
                    
                    // Refresh missions from API before reopening
                    await this.preloadMissions();
                    
                    // Refresh missions list
                    this.close();
                    this.open();
                } else {
                    this.callbacks.showToastMessage('❌ Failed to submit. Please try again.', 0xef4444);
                }
            } catch (error: any) {
                console.error('Error submitting proof:', error);
                const errorMsg = error?.message || 'Network error. Please check your connection.';
                this.callbacks.showToastMessage(`❌ ${errorMsg}`, 0xef4444);
            }
        }
    }

    private async submitSocialLink(missionId: string, link: string): Promise<void> {
        // Redirect to submitMissionProof for consistency
        await this.submitMissionProof(missionId, 'link', link);
    }

    private async claimMissionReward(missionId: string): Promise<void> {
        this.callbacks.showToastMessage('Claiming reward...', 0x4a90e2);

        try {
            const result = await MissionService.claimMissionReward(missionId);

            if (result) {
                this.callbacks.showToastMessage('🎉 Reward claimed!', 0x22c55e);
                this.closeMissionDetails();
                
                // Refresh missions from API before reopening
                await this.preloadMissions();
                
                // Refresh all data and UI via GameDataService
                GameDataService.refreshAndUpdateUI();
                
                // Refresh missions list
                this.close();
                this.open();
            } else {
                this.callbacks.showToastMessage('❌ Failed to claim reward', 0xef4444);
            }
        } catch {
            this.callbacks.showToastMessage('❌ Error claiming reward', 0xef4444);
        }
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

            // Play success sound for successful redeem
            this.callbacks.playSuccessSound();

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
        this.closeMissionDetails();
        this.closeQRScanner();
        this.redeemResultElements.forEach(el => { if (el && el.destroy) el.destroy(); });
        super.destroy();
    }
}
