import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { MissionService, Mission } from '../MissionService';
import { GameDataService } from '../GameDataService';
import { SocialSubmissionManager } from './SocialSubmissionManager';
import { EventService, GameEvent } from '../EventService';
import { RedeemService } from '../RedeemService';

interface QuickActionsCallbacks {
    showToastMessage?: (text: string, color: number) => void;
    playSuccessSound?: () => void;
}

/**
 * Manages quick action buttons below profile panel
 * Currently includes: Mission button, Events button
 * Can be extended with more buttons in the future
 */
export class QuickActionsManager extends BaseManager {
    private callbacks: QuickActionsCallbacks;
    private buttonElements: Phaser.GameObjects.GameObject[] = [];
    private modalElements: Phaser.GameObjects.GameObject[] = [];
    private missionModalOpen: boolean = false;
    private eventModalOpen: boolean = false;
    private cachedMissions: Mission[] | null = null;
    private cachedEvents: GameEvent[] | null = null;
    
    // Mission detail modal
    private missionDetailElements: Phaser.GameObjects.GameObject[] = [];
    private socialSubmissionManager: SocialSubmissionManager | null = null;
    
    // Event detail modal
    private eventDetailElements: Phaser.GameObjects.GameObject[] = [];
    private eventCheckInInput: HTMLInputElement | null = null;
    private qrScannerContainer: HTMLDivElement | null = null;
    
    // Mission notification elements
    private notificationBadge: Phaser.GameObjects.Container | null = null;
    private missionBtnBg: Phaser.GameObjects.Sprite | null = null;
    private pulseTween: Phaser.Tweens.Tween | null = null;
    private buttonGlowTween: Phaser.Tweens.Tween | null = null;
    
    // Event notification elements
    private eventNotificationBadge: Phaser.GameObjects.Container | null = null;
    private eventBtnBg: Phaser.GameObjects.Sprite | null = null;
    private eventPulseTween: Phaser.Tweens.Tween | null = null;
    private eventButtonGlowTween: Phaser.Tweens.Tween | null = null;

    constructor(scene: Phaser.Scene, callbacks: QuickActionsCallbacks = {}) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Create quick action buttons below profile panel
     * @param panelX - X position of profile panel center
     * @param panelY - Y position of profile panel center
     * @param panelWidth - Width of profile panel
     * @param panelHeight - Height of profile panel
     */
    public createButtons(panelX: number, panelY: number, panelWidth: number, panelHeight: number): void {
        this.destroyButtonElements();

        const btnY = panelY + panelHeight / 2 + 20;
        
        // Mission button
        this.missionBtnBg = this.scene.add.sprite(panelX, btnY, 'square-buttons', 6);
        this.missionBtnBg.setDisplaySize(panelWidth - 10, 28);
        this.missionBtnBg.setDepth(5020);
        this.missionBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(this.missionBtnBg);
        this.buttonElements.push(this.missionBtnBg);

        const missionBtnText = this.scene.add.text(panelX, btnY, '📋 Missions', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        missionBtnText.setOrigin(0.5);
        missionBtnText.setDepth(5021);
        missionBtnText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(missionBtnText);
        this.buttonElements.push(missionBtnText);

        this.missionBtnBg.on('pointerdown', () => this.openMissionModal());
        this.missionBtnBg.on('pointerover', () => {
            if (!this.buttonGlowTween) {
                this.missionBtnBg?.setTint(0xcccccc);
            }
        });
        this.missionBtnBg.on('pointerout', () => {
            if (!this.buttonGlowTween) {
                this.missionBtnBg?.clearTint();
            }
        });

        // Create mission notification badge (hidden by default)
        this.createNotificationBadge(panelX - 28, btnY);

        // Check for incomplete missions
        this.updateNotificationBadge();

        // Events button - below mission button
        const eventBtnY = btnY + 32;
        
        this.eventBtnBg = this.scene.add.sprite(panelX, eventBtnY, 'square-buttons', 6);
        this.eventBtnBg.setDisplaySize(panelWidth - 10, 28);
        this.eventBtnBg.setDepth(5020);
        this.eventBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(this.eventBtnBg);
        this.buttonElements.push(this.eventBtnBg);

        const eventBtnText = this.scene.add.text(panelX, eventBtnY, '🎉 Events', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        eventBtnText.setOrigin(0.5);
        eventBtnText.setDepth(5021);
        eventBtnText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(eventBtnText);
        this.buttonElements.push(eventBtnText);

        this.eventBtnBg.on('pointerdown', () => this.openEventModal());
        this.eventBtnBg.on('pointerover', () => {
            if (!this.eventButtonGlowTween) {
                this.eventBtnBg?.setTint(0xcccccc);
            }
        });
        this.eventBtnBg.on('pointerout', () => {
            if (!this.eventButtonGlowTween) {
                this.eventBtnBg?.clearTint();
            }
        });

        // Create event notification badge (hidden by default)
        this.createEventNotificationBadge(panelX - 28, eventBtnY);

        // Check for active events
        this.updateEventNotificationBadge();
    }

    /**
     * Create notification badge for incomplete missions
     */
    private createNotificationBadge(x: number, y: number): void {
        this.notificationBadge = this.scene.add.container(x, y);
        this.notificationBadge.setDepth(5022);
        this.scene.cameras.main.ignore(this.notificationBadge);
        
        // Badge background (red circle)
        const badgeBg = this.scene.add.circle(0, 0, 8, 0xef4444);
        badgeBg.setStrokeStyle(1, 0xb91c1c);
        this.notificationBadge.add(badgeBg);
        
        // Badge text (exclamation mark or count)
        const badgeText = this.scene.add.text(0, 0, '!', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        badgeText.setOrigin(0.5);
        badgeText.setName('badgeText');
        this.notificationBadge.add(badgeText);
        
        // Initially hidden
        this.notificationBadge.setVisible(false);
        this.buttonElements.push(this.notificationBadge);
    }

    /**
     * Update notification badge based on incomplete missions
     */
    public async updateNotificationBadge(): Promise<void> {
        if (!this.notificationBadge) return;

        // Get missions from cache or fetch
        const cachedData = GameDataService.getCachedData();
        let missions: Mission[] | null = cachedData?.missions || this.cachedMissions;
        
        if (!missions) {
            missions = await MissionService.getMissions();
            if (missions) {
                this.cachedMissions = missions;
            }
        }

        if (!missions) {
            this.notificationBadge.setVisible(false);
            this.stopPulseEffect();
            return;
        }

        // Count incomplete missions (active, pending, or completed but not claimed)
        const incompleteMissions = missions.filter(m => 
            m.status === 'active' || m.status === 'pending' || m.status === 'completed'
        );
        
        const count = incompleteMissions.length;
        
        if (count > 0) {
            // Update badge text
            const badgeText = this.notificationBadge.getByName('badgeText') as Phaser.GameObjects.Text;
            if (badgeText) {
                badgeText.setText(count > 9 ? '9+' : count.toString());
            }
            
            this.notificationBadge.setVisible(true);
            this.startPulseEffect();
        } else {
            this.notificationBadge.setVisible(false);
            this.stopPulseEffect();
        }
    }

    /**
     * Start pulse animation effect for badge and button glow
     */
    private startPulseEffect(): void {
        // Badge pulse
        if (!this.pulseTween && this.notificationBadge) {
            this.pulseTween = this.scene.tweens.add({
                targets: this.notificationBadge,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
        
        // Button glow effect - use timeline for color alternation
        if (!this.buttonGlowTween && this.missionBtnBg) {
            // Create a custom property to animate
            const glowTarget = { progress: 0 };
            this.buttonGlowTween = this.scene.tweens.add({
                targets: glowTarget,
                progress: 1,
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
                onUpdate: () => {
                    if (this.missionBtnBg) {
                        // Interpolate between normal (no tint) and orange/red
                        if (glowTarget.progress > 0.5) {
                            this.missionBtnBg.setTint(0xff6b35); // Orange-red color
                        } else {
                            this.missionBtnBg.clearTint();
                        }
                    }
                }
            });
        }
    }

    /**
     * Stop pulse animation effect
     */
    private stopPulseEffect(): void {
        if (this.pulseTween) {
            this.pulseTween.stop();
            this.pulseTween = null;
        }
        if (this.buttonGlowTween) {
            this.buttonGlowTween.stop();
            this.buttonGlowTween = null;
        }
        if (this.notificationBadge) {
            this.notificationBadge.setScale(1);
        }
        if (this.missionBtnBg) {
            this.missionBtnBg.clearTint();
        }
    }

    /**
     * Create notification badge for active events
     */
    private createEventNotificationBadge(x: number, y: number): void {
        this.eventNotificationBadge = this.scene.add.container(x, y);
        this.eventNotificationBadge.setDepth(5022);
        this.scene.cameras.main.ignore(this.eventNotificationBadge);
        
        // Badge background (green circle for events)
        const badgeBg = this.scene.add.circle(0, 0, 8, 0x22c55e);
        badgeBg.setStrokeStyle(1, 0x166534);
        this.eventNotificationBadge.add(badgeBg);
        
        // Badge text
        const badgeText = this.scene.add.text(0, 0, '!', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        badgeText.setOrigin(0.5);
        badgeText.setName('badgeText');
        this.eventNotificationBadge.add(badgeText);
        
        // Initially hidden
        this.eventNotificationBadge.setVisible(false);
        this.buttonElements.push(this.eventNotificationBadge);
    }

    /**
     * Update event notification badge based on active events
     */
    public async updateEventNotificationBadge(): Promise<void> {
        if (!this.eventNotificationBadge) return;

        // Get events from cache or fetch
        let events: GameEvent[] | null = this.cachedEvents;
        
        if (!events) {
            events = await EventService.getActiveEvents();
            if (events) {
                this.cachedEvents = events;
            }
        }

        if (!events || events.length === 0) {
            this.eventNotificationBadge.setVisible(false);
            this.stopEventPulseEffect();
            return;
        }

        const count = events.length;
        
        if (count > 0) {
            // Update badge text
            const badgeText = this.eventNotificationBadge.getByName('badgeText') as Phaser.GameObjects.Text;
            if (badgeText) {
                badgeText.setText(count > 9 ? '9+' : count.toString());
            }
            
            this.eventNotificationBadge.setVisible(true);
            this.startEventPulseEffect();
        } else {
            this.eventNotificationBadge.setVisible(false);
            this.stopEventPulseEffect();
        }
    }

    /**
     * Start pulse animation effect for event badge and button
     */
    private startEventPulseEffect(): void {
        // Badge pulse
        if (!this.eventPulseTween && this.eventNotificationBadge) {
            this.eventPulseTween = this.scene.tweens.add({
                targets: this.eventNotificationBadge,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
        
        // Button glow effect
        if (!this.eventButtonGlowTween && this.eventBtnBg) {
            const glowTarget = { progress: 0 };
            this.eventButtonGlowTween = this.scene.tweens.add({
                targets: glowTarget,
                progress: 1,
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
                onUpdate: () => {
                    if (this.eventBtnBg) {
                        if (glowTarget.progress > 0.5) {
                            this.eventBtnBg.setTint(0x4ade80); // Green color for events
                        } else {
                            this.eventBtnBg.clearTint();
                        }
                    }
                }
            });
        }
    }

    /**
     * Stop event pulse animation effect
     */
    private stopEventPulseEffect(): void {
        if (this.eventPulseTween) {
            this.eventPulseTween.stop();
            this.eventPulseTween = null;
        }
        if (this.eventButtonGlowTween) {
            this.eventButtonGlowTween.stop();
            this.eventButtonGlowTween = null;
        }
        if (this.eventNotificationBadge) {
            this.eventNotificationBadge.setScale(1);
        }
        if (this.eventBtnBg) {
            this.eventBtnBg.clearTint();
        }
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
        this.stopPulseEffect();
        this.stopEventPulseEffect();
        this.notificationBadge = null;
        this.missionBtnBg = null;
        this.eventNotificationBadge = null;
        this.eventBtnBg = null;
        this.buttonElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.buttonElements = [];
    }

    /**
     * Open mission modal
     */
    public async openMissionModal(): Promise<void> {
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

        overlay.on('pointerdown', () => this.closeMissionModal());
    }

    /**
     * Close mission modal
     */
    public closeMissionModal(): void {
        this.missionModalOpen = false;
        this.modalElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.modalElements = [];
        
        // Update notification badge after closing modal
        this.updateNotificationBadge();
    }

    /**
     * Check if mission modal is open
     */
    public isMissionModalOpen(): boolean {
        return this.missionModalOpen;
    }

    /**
     * Refresh missions cache
     */
    public refreshCache(): void {
        this.cachedMissions = null;
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

        closeBtnBg.on('pointerdown', () => this.closeMissionModal());
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

        // Load missions
        const cachedData = GameDataService.getCachedData();
        let missions: Mission[] | null = cachedData?.missions || this.cachedMissions;
        
        if (!missions) {
            missions = await MissionService.getMissions();
            if (missions) {
                this.cachedMissions = missions;
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
            const iconColor = isDone ? 0x4ade80 : (isPending ? 0xfbbf24 : 0x3b82f6);
            const iconBg = this.scene.add.circle(iconX, baseY, 8, iconColor);
            iconBg.setDepth(5304);
            iconBg.setMask(scrollMask);
            this.scene.cameras.main.ignore(iconBg);
            this.modalElements.push(iconBg);
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
            this.modalElements.push(statusIcon);
            contentElements.push(statusIcon);
            (statusIcon as any).originalY = baseY;

            // Mission name
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
            this.modalElements.push(missionName);
            contentElements.push(missionName);
            (missionName as any).originalY = nameY;

            // Hover effects for card
            cardBg.on('pointerover', () => {
                cardBg.setFillStyle(0xE8D9C0);
                missionName.setColor('#f59e0b');
            });
            cardBg.on('pointerout', () => {
                cardBg.setFillStyle(0xD4C4A8);
                missionName.setColor(isDone ? '#16a34a' : (isPending ? '#d97706' : '#5D4037'));
            });

            // Click to show detail - track drag to differentiate from scroll
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
            const isClaimed = mission.status === 'claimed';
            const isCompleted = mission.status === 'completed';

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
            const progressBarFill = this.scene.add.rectangle(barX + 1, barY, fillWidth, barHeight, isDone ? 0x22c55e : 0xf59e0b);
            progressBarFill.setOrigin(0, 0.5);
            progressBarFill.setDepth(5306);
            progressBarFill.setMask(scrollMask);
            this.scene.cameras.main.ignore(progressBarFill);
            this.modalElements.push(progressBarFill);
            contentElements.push(progressBarFill);
            (progressBarFill as any).originalY = barY;

            // Progress text on bar
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
            this.modalElements.push(progressText);
            contentElements.push(progressText);
            (progressText as any).originalY = barY;

            // Right side: Reward or Claim button or Checkmark
            const rightSideX = cardX + cardWidth / 2 - 30;

            if (isClaimed) {
                this.renderClaimedCheckmark(rightSideX, baseY, scrollMask, contentElements);
            } else if (isCompleted) {
                this.renderClaimButton(rightSideX, baseY, scrollMask, contentElements, mission);
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


    /**
     * Render claimed checkmark
     */
    private renderClaimedCheckmark(
        x: number, 
        y: number, 
        scrollMask: Phaser.Display.Masks.GeometryMask,
        contentElements: Phaser.GameObjects.GameObject[]
    ): void {
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

    /**
     * Render claim button
     */
    private renderClaimButton(
        x: number, 
        y: number, 
        scrollMask: Phaser.Display.Masks.GeometryMask,
        contentElements: Phaser.GameObjects.GameObject[],
        mission: Mission
    ): void {
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
        claimBtnBg.on('pointerdown', async () => {
            const result = await MissionService.claimMissionReward(mission.id);
            if (result) {
                if (this.callbacks.showToastMessage) {
                    this.callbacks.showToastMessage('🎉 Reward claimed!', 0x22c55e);
                }
                this.cachedMissions = null;
                this.closeMissionModal();
                this.openMissionModal();
                GameDataService.refreshAndUpdateUI();
            }
        });
    }

    /**
     * Render rewards display
     */
    private renderRewards(
        x: number, 
        baseY: number, 
        scrollMask: Phaser.Display.Masks.GeometryMask,
        contentElements: Phaser.GameObjects.GameObject[],
        mission: Mission
    ): void {
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

            // Reward section
            const rewardSectionY = barY + 25;
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

            // Status/action section
            const actionY = rewardSectionY + 75;

            if (mission.status === 'active') {
                if (mission.type === 'social') {
                    // Create social submission form
                    this.socialSubmissionManager = new SocialSubmissionManager(this.scene, {
                        showToastMessage: (text, color) => this.callbacks.showToastMessage?.(text, color),
                        playSuccessSound: () => this.callbacks.playSuccessSound?.(),
                        onSubmitSuccess: () => {
                            this.cachedMissions = null;
                            this.closeMissionDetails();
                            this.closeMissionModal();
                            this.openMissionModal();
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
                    // Add elements to detail elements for cleanup
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

                claimBtnBg.on('pointerdown', async () => {
                    const result = await MissionService.claimMissionReward(mission.id);
                    if (result) {
                        if (this.callbacks.showToastMessage) {
                            this.callbacks.showToastMessage('🎉 Reward claimed!', 0x22c55e);
                        }
                        this.cachedMissions = null;
                        this.closeMissionDetails();
                        this.closeMissionModal();
                        this.openMissionModal();
                        GameDataService.refreshAndUpdateUI();
                    }
                });
                claimBtnBg.on('pointerover', () => claimBtnBg.setTint(0x86efac));
                claimBtnBg.on('pointerout', () => claimBtnBg.setTint(0x4ade80));
            } else if (mission.status === 'pending') {
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
     * Close mission details modal
     */
    private closeMissionDetails(): void {
        // Cleanup social submission manager
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

    // ==================== EVENT MODAL METHODS ====================

    /**
     * Open event modal
     */
    public async openEventModal(): Promise<void> {
        if (this.eventModalOpen) return;
        this.eventModalOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 320;
        const modalHeight = 360;
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
            this.createEventModalContent(modalX, modalY, modalWidth, modalHeight);
        });

        overlay.on('pointerdown', () => this.closeEventModal());
    }

    /**
     * Close event modal
     */
    public closeEventModal(): void {
        this.eventModalOpen = false;
        this.modalElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.modalElements = [];
        
        // Update notification badge after closing modal
        this.updateEventNotificationBadge();
    }

    /**
     * Create event modal content
     */
    private async createEventModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): Promise<void> {
        // Title
        const title = this.scene.add.text(modalX + 15, modalY - modalHeight / 2 + 40, '🎉 Active Events', {
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

        closeBtnBg.on('pointerdown', () => this.closeEventModal());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Scrollable area setup
        const scrollAreaTop = modalY - modalHeight / 2 + 65;
        const scrollAreaHeight = 260;

        // Create mask
        const maskGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(modalX - modalWidth / 2 + 10, scrollAreaTop, modalWidth - 20, scrollAreaHeight);
        const scrollMask = maskGraphics.createGeometryMask();
        this.modalElements.push(maskGraphics);

        // Load events
        let events: GameEvent[] | null = this.cachedEvents;
        
        if (!events) {
            events = await EventService.getActiveEvents();
            if (events) {
                this.cachedEvents = events;
            }
        }

        if (!events || events.length === 0) {
            const noEventsText = this.scene.add.text(modalX + 15, modalY, '🚧 No active events', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#999999',
                resolution: 2
            });
            noEventsText.setOrigin(0.5);
            noEventsText.setDepth(5302);
            this.scene.cameras.main.ignore(noEventsText);
            this.modalElements.push(noEventsText);
            return;
        }

        this.renderEventList(events, modalX, scrollAreaTop, scrollAreaHeight, scrollMask);
    }

    /**
     * Render event list with scroll support
     */
    private renderEventList(
        events: GameEvent[], 
        modalX: number, 
        scrollAreaTop: number, 
        scrollAreaHeight: number,
        scrollMask: Phaser.Display.Masks.GeometryMask
    ): void {
        const contentElements: Phaser.GameObjects.GameObject[] = [];
        const cardHeight = 60;
        const cardSpacing = 68;
        const totalContentHeight = events.length * cardSpacing;
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

        events.forEach((event, index) => {
            const baseY = scrollAreaTop + 35 + index * cardSpacing;
            const cardWidth = 250;
            const cardX = modalX + 10;

            // Card border
            const cardBorder = this.scene.add.rectangle(cardX, baseY, cardWidth + 3, cardHeight + 3, 0x166534);
            cardBorder.setDepth(5302);
            cardBorder.setMask(scrollMask);
            this.scene.cameras.main.ignore(cardBorder);
            this.modalElements.push(cardBorder);
            contentElements.push(cardBorder);
            (cardBorder as any).originalY = baseY;

            // Card background
            const cardBg = this.scene.add.rectangle(cardX, baseY, cardWidth, cardHeight, 0xD4F4DD);
            cardBg.setDepth(5303);
            cardBg.setInteractive({ useHandCursor: true });
            cardBg.setMask(scrollMask);
            this.scene.cameras.main.ignore(cardBg);
            this.modalElements.push(cardBg);
            contentElements.push(cardBg);
            (cardBg as any).originalY = baseY;

            // Event icon
            const iconX = cardX - cardWidth / 2 + 20;
            const iconBg = this.scene.add.circle(iconX, baseY, 12, 0x22c55e);
            iconBg.setDepth(5304);
            iconBg.setMask(scrollMask);
            this.scene.cameras.main.ignore(iconBg);
            this.modalElements.push(iconBg);
            contentElements.push(iconBg);
            (iconBg as any).originalY = baseY;

            const eventIcon = this.scene.add.text(iconX, baseY, '🎁', {
                fontSize: '12px',
                resolution: 2
            });
            eventIcon.setOrigin(0.5);
            eventIcon.setDepth(5305);
            eventIcon.setMask(scrollMask);
            this.scene.cameras.main.ignore(eventIcon);
            this.modalElements.push(eventIcon);
            contentElements.push(eventIcon);
            (eventIcon as any).originalY = baseY;

            // Event name
            const nameX = cardX - cardWidth / 2 + 40;
            const nameY = baseY - 15;
            const eventName = this.scene.add.text(nameX, nameY, event.name, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#166534',
                resolution: 2
            });
            eventName.setOrigin(0, 0.5);
            eventName.setDepth(5304);
            eventName.setMask(scrollMask);
            this.scene.cameras.main.ignore(eventName);
            this.modalElements.push(eventName);
            contentElements.push(eventName);
            (eventName as any).originalY = nameY;

            // Event location
            const locationY = baseY;
            const locationText = this.scene.add.text(nameX, locationY, `📍 ${event.location}`, {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#5D4037',
                resolution: 2
            });
            locationText.setOrigin(0, 0.5);
            locationText.setDepth(5304);
            locationText.setMask(scrollMask);
            this.scene.cameras.main.ignore(locationText);
            this.modalElements.push(locationText);
            contentElements.push(locationText);
            (locationText as any).originalY = locationY;

            // Event time
            const timeY = baseY + 15;
            const endDate = new Date(event.endTime);
            const timeStr = `⏰ Ends: ${endDate.toLocaleDateString()}`;
            const timeText = this.scene.add.text(nameX, timeY, timeStr, {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#8B7355',
                resolution: 2
            });
            timeText.setOrigin(0, 0.5);
            timeText.setDepth(5304);
            timeText.setMask(scrollMask);
            this.scene.cameras.main.ignore(timeText);
            this.modalElements.push(timeText);
            contentElements.push(timeText);
            (timeText as any).originalY = timeY;

            // Check-in button
            const checkInBtnX = cardX + cardWidth / 2 - 40;
            const checkInBtn = this.scene.add.rectangle(checkInBtnX, baseY, 55, 24, 0x22c55e);
            checkInBtn.setDepth(5304);
            checkInBtn.setStrokeStyle(1, 0x166534);
            checkInBtn.setInteractive({ useHandCursor: true });
            checkInBtn.setMask(scrollMask);
            this.scene.cameras.main.ignore(checkInBtn);
            this.modalElements.push(checkInBtn);
            contentElements.push(checkInBtn);
            (checkInBtn as any).originalY = baseY;

            const checkInText = this.scene.add.text(checkInBtnX, baseY, 'Check-in', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            checkInText.setOrigin(0.5);
            checkInText.setDepth(5305);
            checkInText.setStroke('#166534', 1);
            checkInText.setMask(scrollMask);
            this.scene.cameras.main.ignore(checkInText);
            this.modalElements.push(checkInText);
            contentElements.push(checkInText);
            (checkInText as any).originalY = baseY;

            // Hover effects
            cardBg.on('pointerover', () => {
                cardBg.setFillStyle(0xBBF7D0);
                eventName.setColor('#15803d');
            });
            cardBg.on('pointerout', () => {
                cardBg.setFillStyle(0xD4F4DD);
                eventName.setColor('#166534');
            });

            checkInBtn.on('pointerover', () => checkInBtn.setFillStyle(0x4ade80));
            checkInBtn.on('pointerout', () => checkInBtn.setFillStyle(0x22c55e));
            checkInBtn.on('pointerdown', () => {
                this.showEventCheckInModal(event);
            });

            // Click card to show details
            let clickStartY = 0;
            cardBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                clickStartY = pointer.y;
            });
            cardBg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
                if (Math.abs(pointer.y - clickStartY) < 10) {
                    this.showEventDetails(event);
                }
            });
        });

        // Scroll handling - use named function for proper cleanup
        const wheelHandler = (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, _dy: number, dz: number) => {
            if (this.eventModalOpen && !this.missionModalOpen) {
                scrollOffset = Phaser.Math.Clamp(scrollOffset + dz * 0.5, 0, maxScrollOffset);
                updateScrollPositions();
            }
        };
        this.scene.input.on('wheel', wheelHandler);
        
        // Also support drag scrolling
        let isDragging = false;
        let lastPointerY = 0;
        
        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (isDragging && this.eventModalOpen && !this.missionModalOpen) {
                const deltaY = lastPointerY - pointer.y;
                scrollOffset = Phaser.Math.Clamp(scrollOffset + deltaY, 0, maxScrollOffset);
                lastPointerY = pointer.y;
                updateScrollPositions();
            }
        });
        
        this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.eventModalOpen && !this.missionModalOpen) {
                isDragging = true;
                lastPointerY = pointer.y;
            }
        });
        
        this.scene.input.on('pointerup', () => {
            isDragging = false;
        });
    }

    /**
     * Show event details modal
     */
    private showEventDetails(event: GameEvent): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 300;
        const modalHeight = 280;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.7);
        overlay.setDepth(5400);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.eventDetailElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5401);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.eventDetailElements.push(modalBg);

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
            this.eventDetailElements.push(closeBtnBg);

            const closeText = this.scene.add.text(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'X', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            closeText.setOrigin(0.5);
            closeText.setDepth(5403);
            closeText.setStroke('#5D4037', 1);
            this.scene.cameras.main.ignore(closeText);
            this.eventDetailElements.push(closeText);

            closeBtnBg.on('pointerdown', () => this.closeEventDetails());
            closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
            closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

            // Event name
            const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 50, `🎉 ${event.name}`, {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2,
                wordWrap: { width: modalWidth - 60 }
            });
            title.setOrigin(0.5);
            title.setDepth(5402);
            title.setStroke('#166534', 2);
            this.scene.cameras.main.ignore(title);
            this.eventDetailElements.push(title);

            // Description
            const desc = this.scene.add.text(modalX, modalY - 40, event.description, {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#5D4037',
                resolution: 2,
                wordWrap: { width: modalWidth - 40 },
                align: 'center'
            });
            desc.setOrigin(0.5);
            desc.setDepth(5402);
            this.scene.cameras.main.ignore(desc);
            this.eventDetailElements.push(desc);

            // Location
            const location = this.scene.add.text(modalX, modalY + 10, `📍 ${event.location}`, {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#166534',
                resolution: 2
            });
            location.setOrigin(0.5);
            location.setDepth(5402);
            location.setStroke('#FFFFFF', 1);
            this.scene.cameras.main.ignore(location);
            this.eventDetailElements.push(location);

            // Time
            const startDate = new Date(event.startTime);
            const endDate = new Date(event.endTime);
            const timeStr = `⏰ ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
            const time = this.scene.add.text(modalX, modalY + 35, timeStr, {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#8B7355',
                resolution: 2
            });
            time.setOrigin(0.5);
            time.setDepth(5402);
            this.scene.cameras.main.ignore(time);
            this.eventDetailElements.push(time);

            // Check-in button
            const checkInBtn = this.scene.add.sprite(modalX, modalY + modalHeight / 2 - 40, 'square-buttons', 6);
            checkInBtn.setDisplaySize(120, 30);
            checkInBtn.setTint(0x22c55e);
            checkInBtn.setDepth(5402);
            checkInBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(checkInBtn);
            this.eventDetailElements.push(checkInBtn);

            const checkInBtnText = this.scene.add.text(modalX, modalY + modalHeight / 2 - 40, '🎁 Check-in', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            checkInBtnText.setOrigin(0.5);
            checkInBtnText.setDepth(5403);
            checkInBtnText.setStroke('#166534', 2);
            this.scene.cameras.main.ignore(checkInBtnText);
            this.eventDetailElements.push(checkInBtnText);

            checkInBtn.on('pointerdown', () => {
                this.closeEventDetails();
                this.showEventCheckInModal(event);
            });
            checkInBtn.on('pointerover', () => checkInBtn.setTint(0x4ade80));
            checkInBtn.on('pointerout', () => checkInBtn.setTint(0x22c55e));
        });

        overlay.on('pointerdown', () => this.closeEventDetails());
    }

    /**
     * Close event details modal
     */
    private closeEventDetails(): void {
        // Cleanup HTML input
        if (this.eventCheckInInput && this.eventCheckInInput.parentNode) {
            this.eventCheckInInput.parentNode.removeChild(this.eventCheckInInput);
        }
        this.eventCheckInInput = null;
        
        this.eventDetailElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.eventDetailElements = [];
    }

    /**
     * Show check-in modal for event
     */
    private showEventCheckInModal(event: GameEvent): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 280;
        const modalHeight = 200;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.7);
        overlay.setDepth(5500);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.eventDetailElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5501);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.eventDetailElements.push(modalBg);

        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.scene.time.delayedCall(100, () => {
            // Title
            const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 35, 'Enter Check-in Code', {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            title.setOrigin(0.5);
            title.setDepth(5502);
            title.setStroke('#5D4037', 2);
            this.scene.cameras.main.ignore(title);
            this.eventDetailElements.push(title);

            // Close button
            const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 20, modalY - modalHeight / 2 + 30, 'square-buttons', 7);
            closeBtnBg.setDisplaySize(20, 20);
            closeBtnBg.setDepth(5502);
            closeBtnBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(closeBtnBg);
            this.eventDetailElements.push(closeBtnBg);

            const closeText = this.scene.add.text(modalX + modalWidth / 2 - 20, modalY - modalHeight / 2 + 30, 'X', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            closeText.setOrigin(0.5);
            closeText.setDepth(5503);
            this.scene.cameras.main.ignore(closeText);
            this.eventDetailElements.push(closeText);

            closeBtnBg.on('pointerdown', () => this.closeEventDetails());

            // Input background - shifted left to make room for QR button
            const inputBg = this.scene.add.rectangle(modalX, modalY - 10, 180, 30, 0xFFF8E1);
            inputBg.setStrokeStyle(2, 0x5D4037);
            inputBg.setDepth(5502);
            this.scene.cameras.main.ignore(inputBg);
            this.eventDetailElements.push(inputBg);

            // QR Scanner button - next to input with gap
            const qrBtn = this.scene.add.sprite(modalX + 105, modalY - 10, 'square-buttons', 6);
            qrBtn.setDisplaySize(32, 28);
            qrBtn.setDepth(5502);
            qrBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(qrBtn);
            this.eventDetailElements.push(qrBtn);

            const qrText = this.scene.add.text(modalX + 105, modalY - 10, '📷', {
                fontSize: '12px',
                fontFamily: 'Arial',
                resolution: 2
            });
            qrText.setOrigin(0.5);
            qrText.setDepth(5503);
            this.scene.cameras.main.ignore(qrText);
            this.eventDetailElements.push(qrText);

            qrBtn.on('pointerdown', () => this.openEventQRScanner(event));
            qrBtn.on('pointerover', () => qrBtn.setTint(0xcccccc));
            qrBtn.on('pointerout', () => qrBtn.clearTint());

            // Create HTML input and store reference for cleanup
            this.eventCheckInInput = document.createElement('input');
            this.eventCheckInInput.type = 'text';
            this.eventCheckInInput.placeholder = 'Enter code...';
            this.eventCheckInInput.maxLength = 50;

            const canvas = this.scene.game.canvas;
            const canvasRect = canvas.getBoundingClientRect();
            const scaleX = canvasRect.width / this.scene.scale.width;
            const scaleY = canvasRect.height / this.scene.scale.height;
            
            const inputWidth = 156 * scaleX;
            const inputLeft = canvasRect.left + (modalX) * scaleX;
            const inputTop = canvasRect.top + (modalY - 10) * scaleY;

            this.eventCheckInInput.style.cssText = `
                position: fixed;
                left: ${inputLeft}px;
                top: ${inputTop}px;
                transform: translate(-50%, -50%);
                width: ${inputWidth}px;
                padding: 6px 10px;
                font-size: 12px;
                font-family: 'PixelFont', monospace;
                border: none;
                background-color: transparent;
                color: #5D4037;
                outline: none;
                text-align: center;
                z-index: 10001;
                box-sizing: border-box;
            `;
            document.body.appendChild(this.eventCheckInInput);
            this.eventCheckInInput.focus();

            // Store reference for use in submit handler
            const checkInInput = this.eventCheckInInput;

            // Submit button - centered
            const submitBtn = this.scene.add.sprite(modalX, modalY + 45, 'square-buttons', 6);
            submitBtn.setDisplaySize(100, 28);
            submitBtn.setDepth(5502);
            submitBtn.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(submitBtn);
            this.eventDetailElements.push(submitBtn);

            const submitText = this.scene.add.text(modalX + 10, modalY + 45, 'Submit', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            submitText.setOrigin(0.5);
            submitText.setDepth(5503);
            submitText.setStroke('#5D4037', 1);
            this.scene.cameras.main.ignore(submitText);
            this.eventDetailElements.push(submitText);

            submitBtn.on('pointerdown', async () => {
                const code = checkInInput.value.trim();
                if (!code) {
                    this.callbacks.showToastMessage?.('Please enter a code', 0xef4444);
                    return;
                }

                submitText.setText('...');
                submitBtn.disableInteractive();

                try {
                    const result = await RedeemService.redeemCode(code, event.id);
                    
                    if (result.success) {
                        // Build success message with reward info
                        let successMsg = '🎉 Check-in successful!';
                        if (result.reward) {
                            const itemName = result.reward.itemName || result.reward.itemType?.replace(/_/g, ' ') || 'item';
                            successMsg = `🎉 +${result.reward.amount} ${itemName}`;
                        }
                        
                        this.callbacks.showToastMessage?.(successMsg, 0x22c55e);
                        this.callbacks.playSuccessSound?.();
                        
                        this.closeEventDetails();
                        GameDataService.refreshAndUpdateUI();
                    } else {
                        this.callbacks.showToastMessage?.(result.message || 'Invalid code', 0xef4444);
                        submitText.setText('Submit');
                        submitBtn.setInteractive({ useHandCursor: true });
                    }
                } catch {
                    this.callbacks.showToastMessage?.('Error checking in', 0xef4444);
                    submitText.setText('Submit');
                    submitBtn.setInteractive({ useHandCursor: true });
                }
            });

            submitBtn.on('pointerover', () => submitBtn.setTint(0xcccccc));
            submitBtn.on('pointerout', () => submitBtn.clearTint());

            // Cleanup when overlay clicked
            overlay.on('pointerdown', () => {
                this.closeEventDetails();
            });
        });
    }

    /**
     * Open QR scanner for event check-in
     */
    private async openEventQRScanner(event: GameEvent): Promise<void> {
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
        scannerElement.id = 'qr-reader-event';
        scannerElement.style.cssText = `
            width: 300px;
            height: 300px;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
        `;

        const styleTag = document.createElement('style');
        styleTag.setAttribute('data-qr-scanner-event', 'true');
        styleTag.textContent = `
            #qr-reader-event video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
            #qr-reader-event__dashboard_section { display: none !important; }
        `;
        document.head.appendChild(styleTag);

        const title = document.createElement('div');
        title.textContent = 'Scan Event QR Code';
        title.style.cssText = `color: white; font-family: 'PixelFont', monospace; font-size: 18px; margin-bottom: 20px;`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `margin-top: 20px; padding: 12px 30px; font-family: 'PixelFont', monospace; font-size: 14px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer;`;

        this.qrScannerContainer.appendChild(title);
        this.qrScannerContainer.appendChild(scannerElement);
        this.qrScannerContainer.appendChild(closeBtn);
        document.body.appendChild(this.qrScannerContainer);

        const html5QrCode = new Html5Qrcode('qr-reader-event');

        const qrCodeSuccessCallback = async (decodedText: string) => {
            html5QrCode.stop().then(async () => {
                this.closeEventQRScanner();
                
                this.callbacks.showToastMessage?.('QR Code scanned! Checking in...', 0x4ade80);
                
                try {
                    // Try to parse as JSON first (for structured QR codes)
                    let verificationCode = decodedText;
                    try {
                        const qrData = JSON.parse(decodedText);
                        if (qrData.verificationCode) {
                            verificationCode = qrData.verificationCode;
                        }
                    } catch {
                        // Not JSON, use raw text as code
                    }
                    
                    const result = await RedeemService.redeemCode(verificationCode, event.id);
                    
                    if (result.success) {
                        let successMsg = '🎉 Check-in successful!';
                        if (result.reward) {
                            const itemName = result.reward.itemName || result.reward.itemType?.replace(/_/g, ' ') || 'item';
                            successMsg = `🎉 +${result.reward.amount} ${itemName}`;
                        }
                        
                        this.callbacks.showToastMessage?.(successMsg, 0x22c55e);
                        this.callbacks.playSuccessSound?.();
                        
                        this.closeEventDetails();
                        GameDataService.refreshAndUpdateUI();
                    } else {
                        this.callbacks.showToastMessage?.(result.message || 'Invalid QR code', 0xef4444);
                    }
                } catch {
                    this.callbacks.showToastMessage?.('Error checking in', 0xef4444);
                }
            }).catch(() => {});
        };

        html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            qrCodeSuccessCallback,
            () => {}
        ).catch(() => {
            this.callbacks.showToastMessage?.('Camera access denied', 0xef4444);
            this.closeEventQRScanner();
        });

        closeBtn.addEventListener('click', () => {
            html5QrCode.stop().then(() => this.closeEventQRScanner()).catch(() => this.closeEventQRScanner());
        });
    }

    /**
     * Close QR scanner
     */
    private closeEventQRScanner(): void {
        if (this.qrScannerContainer && this.qrScannerContainer.parentNode) {
            this.qrScannerContainer.parentNode.removeChild(this.qrScannerContainer);
        }
        this.qrScannerContainer = null;

        const styleTag = document.querySelector('style[data-qr-scanner-event]');
        if (styleTag) styleTag.remove();
    }

    /**
     * Destroy manager and cleanup
     */
    public destroy(): void {
        this.closeMissionDetails();
        this.closeMissionModal();
        this.closeEventDetails();
        this.closeEventModal();
        this.closeEventQRScanner();
        this.destroyButtonElements();
        super.destroy();
    }
}
