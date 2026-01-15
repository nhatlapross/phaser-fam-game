import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { MissionService, Mission } from '../MissionService';
import { GameDataService } from '../GameDataService';
import { EventService, GameEvent } from '../EventService';
import { QuizService, Quiz } from '../QuizService';
import { MissionManager } from './MissionManager';
import { QuizManager } from './QuizManager';
import { EventModalManager } from './EventModalManager';

interface QuickActionsCallbacks {
    showToastMessage?: (text: string, color: number) => void;
    playSuccessSound?: () => void;
}

/**
 * Manages quick action buttons below profile panel
 * Delegates modal handling to specialized managers:
 * - MissionManager: Mission modal, list, detail, WebSocket
 * - QuizManager: Quiz modal, list, gameplay, WebSocket
 * - EventModalManager: Event modal, list, check-in
 */
export class QuickActionsManager extends BaseManager {
    private callbacks: QuickActionsCallbacks;
    private buttonElements: Phaser.GameObjects.GameObject[] = [];
    
    // Delegated managers
    private missionManager: MissionManager;
    private quizManager: QuizManager;
    private eventModalManager: EventModalManager;
    
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
    
    // Quiz notification elements
    private quizNotificationBadge: Phaser.GameObjects.Container | null = null;
    private quizBtnBg: Phaser.GameObjects.Sprite | null = null;
    private quizPulseTween: Phaser.Tweens.Tween | null = null;
    private quizButtonGlowTween: Phaser.Tweens.Tween | null = null;
    
    // Cached data for notification badges
    private cachedMissions: Mission[] | null = null;
    private cachedEvents: GameEvent[] | null = null;
    private cachedQuizzes: Quiz[] | null = null;

    constructor(scene: Phaser.Scene, callbacks: QuickActionsCallbacks = {}) {
        super(scene);
        this.callbacks = callbacks;
        
        // Initialize delegated managers
        this.missionManager = new MissionManager(scene, callbacks);
        this.quizManager = new QuizManager(scene, callbacks);
        this.eventModalManager = new EventModalManager(scene, callbacks);
    }

    /**
     * Create quick action buttons below profile panel
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

        this.missionBtnBg.on('pointerdown', () => this.missionManager.open());
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

        // Create mission notification badge
        this.createNotificationBadge(panelX - 28, btnY);
        this.updateNotificationBadge();

        // Events button
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

        this.eventBtnBg.on('pointerdown', () => this.eventModalManager.open());
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

        // Create event notification badge
        this.createEventNotificationBadge(panelX - 28, eventBtnY);
        this.updateEventNotificationBadge();

        // Quiz button
        const quizBtnY = eventBtnY + 32;
        
        this.quizBtnBg = this.scene.add.sprite(panelX, quizBtnY, 'square-buttons', 6);
        this.quizBtnBg.setDisplaySize(panelWidth - 10, 28);
        this.quizBtnBg.setDepth(5020);
        this.quizBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(this.quizBtnBg);
        this.buttonElements.push(this.quizBtnBg);

        const quizBtnText = this.scene.add.text(panelX, quizBtnY, '❓ Quiz', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        quizBtnText.setOrigin(0.5);
        quizBtnText.setDepth(5021);
        quizBtnText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(quizBtnText);
        this.buttonElements.push(quizBtnText);

        this.quizBtnBg.on('pointerdown', () => this.quizManager.open());
        this.quizBtnBg.on('pointerover', () => {
            if (!this.quizButtonGlowTween) {
                this.quizBtnBg?.setTint(0xcccccc);
            }
        });
        this.quizBtnBg.on('pointerout', () => {
            if (!this.quizButtonGlowTween) {
                this.quizBtnBg?.clearTint();
            }
        });

        // Create quiz notification badge
        this.createQuizNotificationBadge(panelX - 28, quizBtnY);
        this.updateQuizNotificationBadge();
    }

    /**
     * Create notification badge for missions
     */
    private createNotificationBadge(x: number, y: number): void {
        this.notificationBadge = this.scene.add.container(x, y);
        this.notificationBadge.setDepth(5022);
        this.scene.cameras.main.ignore(this.notificationBadge);
        
        const badgeBg = this.scene.add.circle(0, 0, 8, 0xef4444);
        badgeBg.setStrokeStyle(1, 0xb91c1c);
        this.notificationBadge.add(badgeBg);
        
        const badgeText = this.scene.add.text(0, 0, '!', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        badgeText.setOrigin(0.5);
        badgeText.setName('badgeText');
        this.notificationBadge.add(badgeText);
        
        this.notificationBadge.setVisible(false);
        this.buttonElements.push(this.notificationBadge);
    }

    /**
     * Update mission notification badge
     */
    public async updateNotificationBadge(): Promise<void> {
        if (!this.notificationBadge) return;

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

        const incompleteMissions = missions.filter(m => 
            m.status === 'active' || m.status === 'pending' || m.status === 'completed'
        );
        
        const count = incompleteMissions.length;
        
        if (count > 0) {
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
     * Start pulse animation for mission badge
     */
    private startPulseEffect(): void {
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
        
        if (!this.buttonGlowTween && this.missionBtnBg) {
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
                        if (glowTarget.progress > 0.5) {
                            this.missionBtnBg.setTint(0xff6b35);
                        } else {
                            this.missionBtnBg.clearTint();
                        }
                    }
                }
            });
        }
    }

    /**
     * Stop pulse animation for mission badge
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
     * Create notification badge for events
     */
    private createEventNotificationBadge(x: number, y: number): void {
        this.eventNotificationBadge = this.scene.add.container(x, y);
        this.eventNotificationBadge.setDepth(5022);
        this.scene.cameras.main.ignore(this.eventNotificationBadge);
        
        const badgeBg = this.scene.add.circle(0, 0, 8, 0x22c55e);
        badgeBg.setStrokeStyle(1, 0x166534);
        this.eventNotificationBadge.add(badgeBg);
        
        const badgeText = this.scene.add.text(0, 0, '!', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        badgeText.setOrigin(0.5);
        badgeText.setName('badgeText');
        this.eventNotificationBadge.add(badgeText);
        
        this.eventNotificationBadge.setVisible(false);
        this.buttonElements.push(this.eventNotificationBadge);
    }

    /**
     * Update event notification badge
     */
    public async updateEventNotificationBadge(): Promise<void> {
        if (!this.eventNotificationBadge) return;

        // Try cached data first
        const cachedData = GameDataService.getCachedData();
        let events: GameEvent[] | null = cachedData?.events || this.cachedEvents;
        
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
     * Start pulse animation for event badge
     */
    private startEventPulseEffect(): void {
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
                            this.eventBtnBg.setTint(0x4ade80);
                        } else {
                            this.eventBtnBg.clearTint();
                        }
                    }
                }
            });
        }
    }

    /**
     * Stop pulse animation for event badge
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
     * Create notification badge for quizzes
     */
    private createQuizNotificationBadge(x: number, y: number): void {
        this.quizNotificationBadge = this.scene.add.container(x, y);
        this.quizNotificationBadge.setDepth(5022);
        this.scene.cameras.main.ignore(this.quizNotificationBadge);
        
        const badgeBg = this.scene.add.circle(0, 0, 8, 0xa855f7);
        badgeBg.setStrokeStyle(1, 0x7c3aed);
        this.quizNotificationBadge.add(badgeBg);
        
        const badgeText = this.scene.add.text(0, 0, '!', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        badgeText.setOrigin(0.5);
        badgeText.setName('badgeText');
        this.quizNotificationBadge.add(badgeText);
        
        this.quizNotificationBadge.setVisible(false);
        this.buttonElements.push(this.quizNotificationBadge);
    }

    /**
     * Update quiz notification badge
     */
    public async updateQuizNotificationBadge(): Promise<void> {
        if (!this.quizNotificationBadge) return;

        // Try cached data first
        const cachedData = GameDataService.getCachedData();
        let quizzes: Quiz[] | null = cachedData?.quizzes || this.cachedQuizzes;

        if (!quizzes) {
            quizzes = await QuizService.getActiveQuizzes();
            if (quizzes) {
                this.cachedQuizzes = quizzes;
            }
        }

        if (!quizzes || quizzes.length === 0) {
            this.quizNotificationBadge.setVisible(false);
            this.stopQuizPulseEffect();
            return;
        }

        // Filter out already submitted quizzes
        const submittedIds = this.quizManager.getSubmittedQuizIds();
        const attemptedCache = this.quizManager.getQuizAttemptedCache();
        const availableQuizzes = quizzes.filter(q =>
            !submittedIds.has(q.id) && !attemptedCache.get(q.id)
        );
        const count = availableQuizzes.length;

        if (count > 0) {
            const badgeText = this.quizNotificationBadge.getByName('badgeText') as Phaser.GameObjects.Text;
            if (badgeText) {
                badgeText.setText(count > 9 ? '9+' : count.toString());
            }

            this.quizNotificationBadge.setVisible(true);
            this.startQuizPulseEffect();
        } else {
            this.quizNotificationBadge.setVisible(false);
            this.stopQuizPulseEffect();
        }
    }

    /**
     * Start pulse animation for quiz badge
     */
    private startQuizPulseEffect(): void {
        if (!this.quizPulseTween && this.quizNotificationBadge) {
            this.quizPulseTween = this.scene.tweens.add({
                targets: this.quizNotificationBadge,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
        
        if (!this.quizButtonGlowTween && this.quizBtnBg) {
            const glowTarget = { progress: 0 };
            this.quizButtonGlowTween = this.scene.tweens.add({
                targets: glowTarget,
                progress: 1,
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
                onUpdate: () => {
                    if (this.quizBtnBg) {
                        if (glowTarget.progress > 0.5) {
                            this.quizBtnBg.setTint(0xa855f7);
                        } else {
                            this.quizBtnBg.clearTint();
                        }
                    }
                }
            });
        }
    }

    /**
     * Stop pulse animation for quiz badge
     */
    private stopQuizPulseEffect(): void {
        if (this.quizPulseTween) {
            this.quizPulseTween.stop();
            this.quizPulseTween = null;
        }
        if (this.quizButtonGlowTween) {
            this.quizButtonGlowTween.stop();
            this.quizButtonGlowTween = null;
        }
        if (this.quizNotificationBadge) {
            this.quizNotificationBadge.setScale(1);
        }
        if (this.quizBtnBg) {
            this.quizBtnBg.clearTint();
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
        this.stopQuizPulseEffect();
        this.notificationBadge = null;
        this.missionBtnBg = null;
        this.eventNotificationBadge = null;
        this.eventBtnBg = null;
        this.quizNotificationBadge = null;
        this.quizBtnBg = null;
        this.buttonElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.buttonElements = [];
    }

    /**
     * Refresh missions cache
     */
    public refreshCache(): void {
        this.cachedMissions = null;
        this.missionManager.refreshCache();
    }

    /**
     * Check if mission modal is open
     */
    public isMissionModalOpen(): boolean {
        return this.missionManager.getIsOpen();
    }

    /**
     * Open mission modal (for external calls)
     */
    public openMissionModal(): void {
        this.missionManager.open();
    }

    /**
     * Close mission modal (for external calls)
     */
    public closeMissionModal(): void {
        this.missionManager.close();
        this.updateNotificationBadge();
    }

    /**
     * Open event modal (for external calls)
     */
    public openEventModal(): void {
        this.eventModalManager.open();
    }

    /**
     * Close event modal (for external calls)
     */
    public closeEventModal(): void {
        this.eventModalManager.close();
        this.updateEventNotificationBadge();
    }

    /**
     * Open quiz modal (for external calls)
     */
    public openQuizModal(): void {
        this.quizManager.open();
    }

    /**
     * Close quiz modal (for external calls)
     */
    public closeQuizModal(): void {
        this.quizManager.close();
        this.updateQuizNotificationBadge();
    }

    /**
     * Destroy manager and cleanup
     */
    public destroy(): void {
        this.missionManager.destroy();
        this.quizManager.destroy();
        this.eventModalManager.destroy();
        this.destroyButtonElements();
        super.destroy();
    }
}
