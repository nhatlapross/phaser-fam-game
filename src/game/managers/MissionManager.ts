import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { MissionService, Mission } from '../MissionService';
import { GameDataService } from '../GameDataService';
import { SocialSubmissionManager } from './SocialSubmissionManager';
import { EventBus } from '../EventBus';

interface MissionManagerCallbacks {
    showToastMessage?: (text: string, color: number) => void;
    playSuccessSound?: () => void;
}

/**
 * Manages mission modal, list, detail, and WebSocket interactions
 */
export class MissionManager extends BaseManager {
    private callbacks: MissionManagerCallbacks;
    private modalElements: Phaser.GameObjects.GameObject[] = [];
    private missionDetailElements: Phaser.GameObjects.GameObject[] = [];
    private socialSubmissionManager: SocialSubmissionManager | null = null;
    
    private missionModalOpen: boolean = false;
    private cachedMissions: Mission[] | null = null;
    private pendingClaimMissionId: string | null = null;

    constructor(scene: Phaser.Scene, callbacks: MissionManagerCallbacks = {}) {
        super(scene);
        this.callbacks = callbacks;
        
        // Listen for mission updates from WebSocket
        this.setupMissionSocketListeners();
        
        // Auto-connect MissionSocket
        this.connectMissionSocket();
    }

    /**
     * Connect to MissionSocket service
     */
    private connectMissionSocket(): void {
        const { getMissionSocketService } = require('../MissionSocketService');
        const missionSocketService = getMissionSocketService();
        
        if (!missionSocketService.isConnected()) {
            console.log('[MissionManager] Auto-connecting MissionSocket...');
            missionSocketService.connect();
        }
    }

    /**
     * Setup listeners for mission socket events
     */
    private setupMissionSocketListeners(): void {
        EventBus.on('mission_socket:mission_updated', this.onMissionUpdated, this);
        EventBus.on('mission_socket:mission_claimed', this.onMissionClaimed, this);
    }

    /**
     * Handle mission updated event from WebSocket
     */
    private onMissionUpdated(payload: any): void {
        console.log('[MissionManager] Mission updated via WebSocket:', payload);
        
        // Update cached missions with new data
        if (this.cachedMissions) {
            const index = this.cachedMissions.findIndex(m => m.id === payload.id || m.id === payload.missionId);
            if (index !== -1) {
                this.cachedMissions[index] = { 
                    ...this.cachedMissions[index], 
                    status: payload.status,
                    progress: payload.progress ?? this.cachedMissions[index].progress,
                    proof: payload.proof ?? this.cachedMissions[index].proof,
                };
                console.log('[MissionManager] Updated cached mission:', this.cachedMissions[index]);
            }
        }
        
        // Also update GameDataService cache
        const cachedData = GameDataService.getCachedData();
        if (cachedData?.missions) {
            const index = cachedData.missions.findIndex(m => m.id === payload.id || m.id === payload.missionId);
            if (index !== -1) {
                cachedData.missions[index] = {
                    ...cachedData.missions[index],
                    status: payload.status,
                    progress: payload.progress ?? cachedData.missions[index].progress,
                    proof: payload.proof ?? cachedData.missions[index].proof,
                };
                GameDataService.persistCache();
            }
        }
        
        // Refresh UI if mission modal is open
        if (this.missionModalOpen) {
            this.refreshMissionList();
        }
        
        // Show toast notification based on status
        if (payload.status === 'completed') {
            this.callbacks.showToastMessage?.(`🎉 Mission "${payload.name}" approved! Ready to claim!`, 0x4ade80);
        } else if (payload.status === 'pending') {
            this.callbacks.showToastMessage?.(`✅ Mission "${payload.name}" submitted! Waiting for approval.`, 0xf59e0b);
        }
    }

    /**
     * Handle mission claimed event from WebSocket
     */
    private async onMissionClaimed(payload: any): Promise<void> {
        console.log('[MissionManager] Mission claimed via WebSocket:', payload);
        
        if (payload.success) {
            const missionUUID = this.pendingClaimMissionId;
            console.log('[MissionManager] Pending claim mission UUID:', missionUUID);
            
            this.pendingClaimMissionId = null;
            
            // Update cached mission status
            if (this.cachedMissions && missionUUID) {
                const index = this.cachedMissions.findIndex(m => m.id === missionUUID);
                if (index !== -1) {
                    this.cachedMissions[index].status = 'claimed';
                }
            }
            
            // Also update GameDataService cache
            const cachedData = GameDataService.getCachedData();
            if (cachedData?.missions && missionUUID) {
                const index = cachedData.missions.findIndex(m => m.id === missionUUID);
                if (index !== -1) {
                    cachedData.missions[index].status = 'claimed';
                    GameDataService.persistCache();
                }
            }
            
            this.closeMissionDetails();
            
            if (this.missionModalOpen) {
                this.refreshMissionList();
            }
            
            // Show reward notification
            const rewards = payload.rewards;
            if (rewards) {
                let rewardText = '🎁 Rewards: ';
                if (rewards.xp) rewardText += `+${rewards.xp} XP `;
                if (rewards.reputation) rewardText += `+${rewards.reputation} Rep `;
                if (rewards.items?.length) {
                    rewards.items.forEach((item: any) => {
                        rewardText += `+${item.amount} ${item.type} `;
                    });
                }
                this.callbacks.showToastMessage?.(rewardText.trim(), 0x4ade80);
            }
            
            await GameDataService.refreshAndUpdateUI();
        } else {
            this.callbacks.showToastMessage?.('❌ Failed to claim reward', 0xef4444);
        }
    }

    /**
     * Refresh mission list UI
     */
    private refreshMissionList(): void {
        if (this.missionModalOpen) {
            this.close();
            this.scene.time.delayedCall(100, () => {
                this.open();
            });
        }
    }

    /**
     * Open mission modal
     */
    public async open(): Promise<void> {
        if (this.missionModalOpen) return;
        this.missionModalOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 300;
        const modalHeight = 340;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.6);
        overlay.setDepth(5300);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.modalElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5301);
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
            this.createModalContent(modalX, modalY, modalWidth, modalHeight);
        });

        overlay.on('pointerdown', () => this.close());
    }

    /**
     * Close mission modal
     */
    public close(): void {
        this.missionModalOpen = false;
        this.modalElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.modalElements = [];
    }

    /**
     * Check if modal is open
     */
    public getIsOpen(): boolean {
        return this.missionModalOpen;
    }

    /**
     * Refresh cache
     */
    public refreshCache(): void {
        this.cachedMissions = null;
    }

    /**
     * Get cached missions for notification badge
     */
    public getCachedMissions(): Mission[] | null {
        return this.cachedMissions;
    }

    /**
     * Set cached missions
     */
    public setCachedMissions(missions: Mission[]): void {
        this.cachedMissions = missions;
    }


    /**
     * Create mission modal content
     */
    private async createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): Promise<void> {
        // Title
        const title = this.scene.add.text(modalX + 15, modalY - modalHeight / 2 + 40, 'Missions', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5302);
        title.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(title);
        this.modalElements.push(title);

        // Close button
        const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.modalElements.push(closeBtnBg);

        const closeText = this.scene.add.text(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'X', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5303);
        closeText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(closeText);
        this.modalElements.push(closeText);

        closeBtnBg.on('pointerdown', () => this.close());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Scrollable area setup
        const scrollAreaTop = modalY - modalHeight / 2 + 65;
        const scrollAreaHeight = 240;

        // Create mask
        const maskGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(modalX - modalWidth / 2 + 10, scrollAreaTop, modalWidth - 20, scrollAreaHeight);
        const scrollMask = maskGraphics.createGeometryMask();
        this.modalElements.push(maskGraphics);

        // Try to use cached data first for instant display
        const cachedData = GameDataService.getCachedData();
        let missions = cachedData?.missions || this.cachedMissions;
        
        // If no cache, show loading and fetch
        if (!missions) {
            const loadingText = this.scene.add.text(modalX, modalY, '⏳ Loading missions...', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#BCAAA4',
                resolution: 2
            });
            loadingText.setOrigin(0.5);
            loadingText.setDepth(5302);
            this.scene.cameras.main.ignore(loadingText);
            this.modalElements.push(loadingText);

            missions = await MissionService.getMissions();
            
            // Remove loading indicator
            loadingText.destroy();
            const loadingIndex = this.modalElements.indexOf(loadingText);
            if (loadingIndex > -1) this.modalElements.splice(loadingIndex, 1);
        }

        if (missions) {
            this.cachedMissions = missions;
            // Update GameDataService cache
            const cachedData = GameDataService.getCachedData();
            if (cachedData) {
                cachedData.missions = missions;
                GameDataService.persistCache();
            }
        }

        if (!missions || missions.length === 0) {
            const noMissionsText = this.scene.add.text(modalX, modalY, 'No missions available', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#999999',
                resolution: 2
            });
            noMissionsText.setOrigin(0.5);
            noMissionsText.setDepth(5302);
            this.scene.cameras.main.ignore(noMissionsText);
            this.modalElements.push(noMissionsText);
            return;
        }

        this.renderMissionList(missions, modalX, scrollAreaTop, scrollAreaHeight, scrollMask);
    }

    /**
     * Render mission list with scroll support
     */
    private renderMissionList(
        missions: Mission[], 
        modalX: number, 
        scrollAreaTop: number, 
        scrollAreaHeight: number,
        scrollMask: Phaser.Display.Masks.GeometryMask
    ): void {
        const contentElements: Phaser.GameObjects.GameObject[] = [];
        const cardHeight = 38;
        const cardSpacing = 45;
        const totalContentHeight = missions.length * cardSpacing;
        let scrollOffset = 0;
        const maxScrollOffset = Math.max(0, totalContentHeight - scrollAreaHeight);

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
            const isPending = mission.status === 'pending';
            const isCompleted = mission.status === 'completed';
            const isClaimed = mission.status === 'claimed';
            const isDone = isPending || isCompleted || isClaimed;
            const displayProgress = isDone ? mission.target : mission.progress;
            const progressPercent = (displayProgress / mission.target) * 100;

            const cardWidth = 230;
            const cardX = modalX + 10;

            // Card border
            const cardBorder = this.scene.add.rectangle(cardX, baseY, cardWidth + 3, cardHeight + 3, 0x8B7355);
            cardBorder.setDepth(5302);
            cardBorder.setMask(scrollMask);
            this.scene.cameras.main.ignore(cardBorder);
            this.modalElements.push(cardBorder);
            contentElements.push(cardBorder);
            (cardBorder as any).originalY = baseY;

            // Card background
            const cardBg = this.scene.add.rectangle(cardX, baseY, cardWidth, cardHeight, 0xD4C4A8);
            cardBg.setDepth(5303);
            cardBg.setInteractive({ useHandCursor: true });
            cardBg.setMask(scrollMask);
            this.scene.cameras.main.ignore(cardBg);
            this.modalElements.push(cardBg);
            contentElements.push(cardBg);
            (cardBg as any).originalY = baseY;

            // Status icon
            const iconX = cardX - cardWidth / 2 + 15;
            const iconColor = isPending ? 0xf59e0b : (isDone ? 0x4ade80 : 0x3b82f6);
            const iconBg = this.scene.add.circle(iconX, baseY, 8, iconColor);
            iconBg.setDepth(5304);
            iconBg.setMask(scrollMask);
            this.scene.cameras.main.ignore(iconBg);
            this.modalElements.push(iconBg);
            contentElements.push(iconBg);
            (iconBg as any).originalY = baseY;

            const statusIconText = isPending ? '✓' : (isDone ? '✓' : '!');
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
            this.modalElements.push(statusIcon);
            contentElements.push(statusIcon);
            (statusIcon as any).originalY = baseY;

            // Mission name
            const nameX = cardX - cardWidth / 2 + 30;
            const nameY = baseY - 8;
            const nameColor = isPending ? '#d97706' : (isDone ? '#16a34a' : '#5D4037');
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
            this.modalElements.push(missionName);
            contentElements.push(missionName);
            (missionName as any).originalY = nameY;

            // Hover effects
            cardBg.on('pointerover', () => {
                cardBg.setFillStyle(0xE8D9C0);
                missionName.setColor('#f59e0b');
            });
            cardBg.on('pointerout', () => {
                cardBg.setFillStyle(0xD4C4A8);
                missionName.setColor(isPending ? '#d97706' : (isDone ? '#16a34a' : '#5D4037'));
            });

            // Click to show detail
            let clickStartY = 0;
            cardBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                clickStartY = pointer.y;
            });
            cardBg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
                if (Math.abs(pointer.y - clickStartY) < 10) {
                    this.showMissionDetails(mission);
                }
            });

            // Progress bar
            const barWidth = 100;
            const barHeight = 10;
            const barX = cardX - cardWidth / 2 + 35;
            const barY = baseY + 8;
            const canClaim = isCompleted;

            const barBorder = this.scene.add.rectangle(barX, barY, barWidth + 2, barHeight + 2, 0x8B7355);
            barBorder.setOrigin(0, 0.5);
            barBorder.setDepth(5304);
            barBorder.setMask(scrollMask);
            this.scene.cameras.main.ignore(barBorder);
            this.modalElements.push(barBorder);
            contentElements.push(barBorder);
            (barBorder as any).originalY = barY;

            const progressBarBg = this.scene.add.rectangle(barX + 1, barY, barWidth, barHeight, 0x3E2723);
            progressBarBg.setOrigin(0, 0.5);
            progressBarBg.setDepth(5305);
            progressBarBg.setMask(scrollMask);
            this.scene.cameras.main.ignore(progressBarBg);
            this.modalElements.push(progressBarBg);
            contentElements.push(progressBarBg);
            (progressBarBg as any).originalY = barY;

            const fillWidth = Math.max(2, (barWidth * progressPercent) / 100);
            const barColor = isPending ? 0xf59e0b : (isDone ? 0x22c55e : 0xf59e0b);
            const progressBarFill = this.scene.add.rectangle(barX + 1, barY, fillWidth, barHeight, barColor);
            progressBarFill.setOrigin(0, 0.5);
            progressBarFill.setDepth(5306);
            progressBarFill.setMask(scrollMask);
            this.scene.cameras.main.ignore(progressBarFill);
            this.modalElements.push(progressBarFill);
            contentElements.push(progressBarFill);
            (progressBarFill as any).originalY = barY;

            const progressText = this.scene.add.text(barX + barWidth / 2, barY, `${displayProgress}/${mission.target}`, {
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
            this.modalElements.push(progressText);
            contentElements.push(progressText);
            (progressText as any).originalY = barY;

            // Right side: Reward or Claim button or Checkmark or Pending indicator
            const rightSideX = cardX + cardWidth / 2 - 30;

            if (isClaimed) {
                this.renderClaimedCheckmark(rightSideX, baseY, scrollMask, contentElements);
            } else if (canClaim) {
                this.renderClaimButton(rightSideX, baseY, scrollMask, contentElements, mission);
            } else if (isPending) {
                this.renderPendingIndicator(rightSideX, baseY, scrollMask, contentElements);
            } else {
                this.renderRewards(rightSideX, baseY, scrollMask, contentElements, mission);
            }
        });

        // Scroll handling
        const wheelHandler = (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, _dy: number, dz: number) => {
            if (this.missionModalOpen) {
                scrollOffset = Phaser.Math.Clamp(scrollOffset + dz * 0.5, 0, maxScrollOffset);
                updateScrollPositions();
            }
        };
        this.scene.input.on('wheel', wheelHandler);
    }

    private renderClaimedCheckmark(x: number, y: number, scrollMask: Phaser.Display.Masks.GeometryMask, contentElements: Phaser.GameObjects.GameObject[]): void {
        const claimedCheck = this.scene.add.text(x, y, '✓', {
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
        this.modalElements.push(claimedCheck);
        contentElements.push(claimedCheck);
        (claimedCheck as any).originalY = y;
    }

    private renderPendingIndicator(x: number, y: number, scrollMask: Phaser.Display.Masks.GeometryMask, contentElements: Phaser.GameObjects.GameObject[]): void {
        const pendingBtnBg = this.scene.add.rectangle(x, y, 50, 20, 0xf59e0b);
        pendingBtnBg.setDepth(5304);
        pendingBtnBg.setStrokeStyle(1, 0xd97706);
        pendingBtnBg.setMask(scrollMask);
        this.scene.cameras.main.ignore(pendingBtnBg);
        this.modalElements.push(pendingBtnBg);
        contentElements.push(pendingBtnBg);
        (pendingBtnBg as any).originalY = y;

        const pendingBtnText = this.scene.add.text(x, y, '✓ Completed', {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        pendingBtnText.setOrigin(0.5);
        pendingBtnText.setDepth(5305);
        pendingBtnText.setStroke('#92400e', 1);
        pendingBtnText.setMask(scrollMask);
        this.scene.cameras.main.ignore(pendingBtnText);
        this.modalElements.push(pendingBtnText);
        contentElements.push(pendingBtnText);
        (pendingBtnText as any).originalY = y;
    }

    private renderClaimButton(x: number, y: number, scrollMask: Phaser.Display.Masks.GeometryMask, contentElements: Phaser.GameObjects.GameObject[], mission: Mission): void {
        const claimBtnBg = this.scene.add.rectangle(x, y, 50, 20, 0x22c55e);
        claimBtnBg.setDepth(5304);
        claimBtnBg.setStrokeStyle(1, 0x166534);
        claimBtnBg.setInteractive({ useHandCursor: true });
        claimBtnBg.setMask(scrollMask);
        this.scene.cameras.main.ignore(claimBtnBg);
        this.modalElements.push(claimBtnBg);
        contentElements.push(claimBtnBg);
        (claimBtnBg as any).originalY = y;

        const claimBtnText = this.scene.add.text(x, y, 'Claim', {
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
        this.modalElements.push(claimBtnText);
        contentElements.push(claimBtnText);
        (claimBtnText as any).originalY = y;

        claimBtnBg.on('pointerover', () => claimBtnBg.setFillStyle(0x4ade80));
        claimBtnBg.on('pointerout', () => claimBtnBg.setFillStyle(0x22c55e));
        claimBtnBg.on('pointerdown', () => {
            claimBtnBg.disableInteractive();
            claimBtnBg.setFillStyle(0x6b7280);
            claimBtnText.setText('...');
            this.claimMissionRewardWS(mission.id);
        });
    }

    private renderRewards(x: number, baseY: number, scrollMask: Phaser.Display.Masks.GeometryMask, contentElements: Phaser.GameObjects.GameObject[], mission: Mission): void {
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
            if (mission.reward.gift) {
                rewardParts.push(`🎁${mission.reward.gift}`);
            }
        }

        const total = rewardParts.length;
        if (total === 0) return;

        const maxPerRow = total <= 2 ? total : (total <= 4 ? 2 : 3);
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

            const rewardDisplay = this.scene.add.text(x, rewardY, rowText, {
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
            this.modalElements.push(rewardDisplay);
            contentElements.push(rewardDisplay);
            (rewardDisplay as any).originalY = rewardY;
        });
    }


    /**
     * Show mission details modal
     */
    private showMissionDetails(mission: Mission): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 320;
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
            this.createMissionDetailContent(mission, modalX, modalY, modalWidth, modalHeight);
        });

        overlay.on('pointerdown', () => this.closeMissionDetails());
    }

    /**
     * Create mission detail content
     */
    private createMissionDetailContent(mission: Mission, modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
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

        // Description
        const description = this.scene.add.text(modalX + 15, modalY - modalHeight / 2 + 95, mission.description, {
            fontSize: '11px',
            fontFamily: 'Roboto, Arial, sans-serif',
            color: '#FFFFFF',
            resolution: 2,
            wordWrap: { width: modalWidth - 80 },
            align: 'center'
        });
        description.setOrigin(0.5, 0);
        description.setDepth(5402);
        description.setStroke('#000000', 3);
        this.scene.cameras.main.ignore(description);
        this.missionDetailElements.push(description);

        // Progress bar
        const barWidth = 160;
        const barHeight = 12;
        const barY = modalY - 40;
        const isDoneDetail = mission.status === 'pending' || mission.status === 'completed' || mission.status === 'claimed';
        const displayProgressDetail = isDoneDetail ? mission.target : mission.progress;
        const progressPercent = Math.min((displayProgressDetail / mission.target) * 100, 100);

        const barBg = this.scene.add.rectangle(modalX + 15, barY, barWidth, barHeight, 0x5D4037);
        barBg.setDepth(5402);
        this.scene.cameras.main.ignore(barBg);
        this.missionDetailElements.push(barBg);

        const barFillWidth = Math.max(2, (barWidth - 4) * progressPercent / 100);
        const barFillColor = mission.status === 'pending' ? 0xf59e0b : 
            (mission.status === 'completed' || mission.status === 'claimed' ? 0x22c55e : 0xf59e0b);
        const barFill = this.scene.add.rectangle(modalX + 15 - (barWidth - 4) / 2 + barFillWidth / 2, barY, barFillWidth, barHeight - 4, barFillColor);
        barFill.setDepth(5403);
        this.scene.cameras.main.ignore(barFill);
        this.missionDetailElements.push(barFill);

        const progressText = this.scene.add.text(modalX + 15, barY, `${displayProgressDetail}/${mission.target}`, {
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

        // Reward section
        this.createRewardSection(mission, modalX, barY + 25, modalWidth);

        // Status/action section
        this.createActionSection(mission, modalX, modalY, modalWidth, modalHeight, barY + 100);
    }

    /**
     * Create reward section in detail modal
     */
    private createRewardSection(mission: Mission, modalX: number, rewardSectionY: number, modalWidth: number): void {
        const rewardX = modalX + 10;

        const rewardBg = this.scene.add.rectangle(rewardX, rewardSectionY + 20, modalWidth - 95, 50, 0x3E2723, 0.8);
        rewardBg.setStrokeStyle(2, 0x5D4037);
        rewardBg.setDepth(5402);
        this.scene.cameras.main.ignore(rewardBg);
        this.missionDetailElements.push(rewardBg);

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
            if (mission.reward.gift) {
                rewardItems.push({ icon: '🎁', text: mission.reward.gift, color: '#ec4899' });
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
            const itemSpacing = Math.min(60, (modalWidth - 60) / rewardItems.length);
            const totalWidth = (rewardItems.length - 1) * itemSpacing;
            const startX = rewardX - totalWidth / 2;

            rewardItems.forEach((item, index) => {
                const itemX = startX + index * itemSpacing;
                const itemY = rewardSectionY + 22;

                const iconText = this.scene.add.text(itemX, itemY - 3, item.icon, {
                    fontSize: '14px',
                    resolution: 2
                });
                iconText.setOrigin(0.5);
                iconText.setDepth(5403);
                this.scene.cameras.main.ignore(iconText);
                this.missionDetailElements.push(iconText);

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
    }

    /**
     * Create action section in detail modal
     */
    private createActionSection(mission: Mission, modalX: number, modalY: number, modalWidth: number, modalHeight: number, actionY: number): void {
        if (mission.status === 'active') {
            if (mission.type === 'social') {
                this.socialSubmissionManager = new SocialSubmissionManager(this.scene, {
                    showToastMessage: (text, color) => this.callbacks.showToastMessage?.(text, color),
                    playSuccessSound: () => this.callbacks.playSuccessSound?.(),
                    onSubmitSuccess: () => {
                        this.closeMissionDetails();
                        this.refreshMissionList();
                    }
                });
                this.socialSubmissionManager.create({
                    modalX,
                    modalY,
                    modalWidth,
                    modalHeight,
                    actionY,
                    missionId: mission.id,
                    baseDepth: 5402
                });
                this.missionDetailElements.push(...this.socialSubmissionManager.getElements());
            } else {
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

            claimBtnBg.on('pointerdown', () => {
                claimBtnBg.disableInteractive();
                claimBtnBg.setTint(0x6b7280);
                claimText.setText('Claiming...');
                this.claimMissionRewardWS(mission.id);
            });
            claimBtnBg.on('pointerover', () => claimBtnBg.setTint(0x86efac));
            claimBtnBg.on('pointerout', () => claimBtnBg.setTint(0x4ade80));
        } else if (mission.status === 'pending') {
            // Show completed label for pending missions (no action needed)
            const completedLabel = this.scene.add.text(modalX, actionY, '✓ Completed', {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#22c55e',
                resolution: 2
            });
            completedLabel.setOrigin(0.5);
            completedLabel.setDepth(5402);
            completedLabel.setStroke('#166534', 2);
            this.scene.cameras.main.ignore(completedLabel);
            this.missionDetailElements.push(completedLabel);
        } else if (mission.status === 'claimed') {
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
    }

    /**
     * Close mission details modal
     */
    private closeMissionDetails(): void {
        if (this.socialSubmissionManager) {
            this.socialSubmissionManager.destroy();
            this.socialSubmissionManager = null;
        }

        this.missionDetailElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.missionDetailElements = [];
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
            'shovel': '🔧',
            'default': '🎁'
        };
        return iconMap[itemType] || iconMap['default'];
    }

    /**
     * Claim mission reward via WebSocket
     */
    private async claimMissionRewardWS(missionId: string): Promise<void> {
        const { getMissionSocketService } = require('../MissionSocketService');
        const missionSocketService = getMissionSocketService();
        
        this.pendingClaimMissionId = missionId;
        
        if (!missionSocketService.isConnected()) {
            console.log('[MissionManager] MissionSocket not connected, attempting to connect...');
            const connected = await this.waitForMissionSocketConnection(missionSocketService, 3000);
            
            if (connected) {
                console.log('[MissionManager] MissionSocket connected successfully');
            }
        }
        
        if (missionSocketService.isConnected()) {
            console.log('[MissionManager] Claiming reward via WebSocket:', missionId);
            missionSocketService.claimReward(missionId);
        } else {
            console.log('[MissionManager] WebSocket not connected, using REST API');
            this.pendingClaimMissionId = null;
            this.claimMissionRewardREST(missionId);
        }
    }

    /**
     * Wait for MissionSocketService to connect
     */
    private waitForMissionSocketConnection(socketService: any, timeout: number): Promise<boolean> {
        return new Promise((resolve) => {
            if (socketService.isConnected()) {
                resolve(true);
                return;
            }

            let resolved = false;

            const onConnected = () => {
                if (!resolved) {
                    resolved = true;
                    EventBus.off('mission_socket:connected', onConnected);
                    resolve(true);
                }
            };

            EventBus.on('mission_socket:connected', onConnected);
            socketService.connect();

            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    EventBus.off('mission_socket:connected', onConnected);
                    resolve(socketService.isConnected());
                }
            }, timeout);
        });
    }

    /**
     * Claim mission reward via REST API (fallback)
     */
    private async claimMissionRewardREST(missionId: string): Promise<void> {
        const result = await MissionService.claimMissionReward(missionId);
        if (result) {
            this.callbacks.showToastMessage?.('🎉 Reward claimed!', 0x22c55e);
            this.cachedMissions = null;
            this.close();
            this.open();
            GameDataService.refreshAndUpdateUI();
        }
    }

    /**
     * Cleanup
     */
    public destroy(): void {
        EventBus.off('mission_socket:mission_updated', this.onMissionUpdated, this);
        EventBus.off('mission_socket:mission_claimed', this.onMissionClaimed, this);
        
        this.closeMissionDetails();
        this.close();
        super.destroy();
    }
}
