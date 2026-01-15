import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { QuizService, Quiz, QuizQuestion, QuizAnswer } from '../QuizService';
import { GameDataService } from '../GameDataService';
import { EventBus } from '../EventBus';
import { QuizStartedPayload, QuizResultPayload } from '../types/SocketTypes';

interface QuizManagerCallbacks {
    showToastMessage?: (text: string, color: number) => void;
    playSuccessSound?: () => void;
}

/**
 * Manages quiz modal, list, gameplay, and WebSocket interactions
 */
export class QuizManager extends BaseManager {
    private callbacks: QuizManagerCallbacks;
    private quizModalElements: Phaser.GameObjects.GameObject[] = [];
    private quizGameElements: Phaser.GameObjects.GameObject[] = [];
    
    private quizModalOpen: boolean = false;
    private cachedQuizzes: Quiz[] | null = null;
    
    // Quiz gameplay state
    private currentQuizId: string | null = null;
    private currentQuestions: QuizQuestion[] = [];
    private currentQuestionIndex: number = 0;
    private userAnswers: QuizAnswer[] = [];
    private quizTimer: Phaser.Time.TimerEvent | null = null;
    private timeRemaining: number = 0;
    private timerText: Phaser.GameObjects.Text | null = null;
    private questionStartTime: number = 0;
    private questionTimeLimit: number = 0;
    
    // Tracking
    private submittedQuizIds: Set<string> = new Set();
    private quizAttemptedCache: Map<string, boolean> = new Map();
    private isPreloadingQuizStatus: boolean = false;
    private pendingQuizId: string | null = null;

    constructor(scene: Phaser.Scene, callbacks: QuizManagerCallbacks = {}) {
        super(scene);
        this.callbacks = callbacks;
        
        this.setupQuizSocketListeners();
        this.connectQuizSocket();
    }

    /**
     * Connect to QuizSocket service
     */
    private connectQuizSocket(): void {
        const { getQuizSocketService } = require('../QuizSocketService');
        const quizSocketService = getQuizSocketService();
        
        if (!quizSocketService.isConnected()) {
            quizSocketService.connect();
        }
    }

    /**
     * Setup listeners for quiz socket events
     */
    private setupQuizSocketListeners(): void {
        EventBus.on('quiz_socket:started', this.onQuizStarted, this);
        EventBus.on('quiz_socket:result', this.onQuizResult, this);
    }

    /**
     * Handle quiz started event from WebSocket
     */
    private onQuizStarted(payload: QuizStartedPayload): void {
        
        if (payload.success && payload.quiz) {
            this.callbacks.showToastMessage?.(`🎯 Quiz "${payload.quiz.title}" started!`, 0xa855f7);
        } else {
            this.callbacks.showToastMessage?.('❌ Failed to start quiz', 0xef4444);
        }
    }

    /**
     * Handle quiz result event from WebSocket
     */
    private async onQuizResult(payload: QuizResultPayload): Promise<void> {
        
        if (payload.success && payload.result) {
            if (this.pendingQuizId) {
                this.submittedQuizIds.add(this.pendingQuizId);
                this.pendingQuizId = null;
            }
            
            this.showQuizResult({
                result: payload.result,
                message: payload.message
            });
            
            await GameDataService.refreshAndUpdateUI();
        } else {
            this.callbacks.showToastMessage?.('❌ Failed to submit quiz', 0xef4444);
        }
    }

    /**
     * Open quiz modal
     */
    public async open(): Promise<void> {
        if (this.quizModalOpen) return;
        this.quizModalOpen = true;

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
        this.quizModalElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5301);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.quizModalElements.push(modalBg);

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
            this.createQuizModalContent(modalX, modalY, modalWidth, modalHeight);
        });

        overlay.on('pointerdown', () => this.close());
    }

    /**
     * Close quiz modal
     */
    public close(): void {
        this.quizModalOpen = false;
        this.quizModalElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.quizModalElements = [];
    }

    /**
     * Check if modal is open
     */
    public getIsOpen(): boolean {
        return this.quizModalOpen;
    }

    /**
     * Get cached quizzes
     */
    public getCachedQuizzes(): Quiz[] | null {
        return this.cachedQuizzes;
    }

    /**
     * Get submitted quiz IDs
     */
    public getSubmittedQuizIds(): Set<string> {
        return this.submittedQuizIds;
    }

    /**
     * Get quiz attempted cache
     */
    public getQuizAttemptedCache(): Map<string, boolean> {
        return this.quizAttemptedCache;
    }

    /**
     * Check if preloading quiz status
     */
    public getIsPreloadingQuizStatus(): boolean {
        return this.isPreloadingQuizStatus;
    }

    /**
     * Set preloading status
     */
    public setIsPreloadingQuizStatus(value: boolean): void {
        this.isPreloadingQuizStatus = value;
    }


    /**
     * Create quiz modal content
     */
    private async createQuizModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): Promise<void> {
        // Title
        const title = this.scene.add.text(modalX + 15, modalY - modalHeight / 2 + 40, '❓ Quizzes', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5302);
        title.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(title);
        this.quizModalElements.push(title);

        // Close button
        const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.quizModalElements.push(closeBtnBg);

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
        this.quizModalElements.push(closeText);

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
        this.quizModalElements.push(maskGraphics);

        // Try to use cached data first for instant display
        const cachedData = GameDataService.getCachedData();
        let quizzes: Quiz[] | null = cachedData?.quizzes || this.cachedQuizzes;
        
        if (!quizzes) {
            quizzes = await QuizService.getActiveQuizzes();
            if (quizzes) {
                this.cachedQuizzes = quizzes;
            }
        }

        if (!quizzes || quizzes.length === 0) {
            const noQuizzesText = this.scene.add.text(modalX, modalY, 'No quizzes available', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#999999',
                resolution: 2
            });
            noQuizzesText.setOrigin(0.5);
            noQuizzesText.setDepth(5302);
            this.scene.cameras.main.ignore(noQuizzesText);
            this.quizModalElements.push(noQuizzesText);
            return;
        }

        this.renderQuizList(quizzes, modalX, scrollAreaTop, scrollAreaHeight, scrollMask);
    }

    /**
     * Render quiz list
     */
    private renderQuizList(
        quizzes: Quiz[], 
        modalX: number, 
        scrollAreaTop: number, 
        scrollAreaHeight: number,
        scrollMask: Phaser.Display.Masks.GeometryMask
    ): void {
        const contentElements: Phaser.GameObjects.GameObject[] = [];
        const cardHeight = 55;
        const cardSpacing = 62;
        const totalContentHeight = quizzes.length * cardSpacing;
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

        quizzes.forEach((quiz, index) => {
            const baseY = scrollAreaTop + 30 + index * cardSpacing;
            const cardWidth = 230;
            const cardX = modalX + 10;
            const isSubmitted = this.submittedQuizIds.has(quiz.id);

            // Card border
            const cardBorder = this.scene.add.rectangle(cardX, baseY, cardWidth + 3, cardHeight + 3, isSubmitted ? 0x666666 : 0x7c3aed);
            cardBorder.setDepth(5302);
            cardBorder.setMask(scrollMask);
            this.scene.cameras.main.ignore(cardBorder);
            this.quizModalElements.push(cardBorder);
            contentElements.push(cardBorder);
            (cardBorder as any).originalY = baseY;

            // Card background
            const cardBg = this.scene.add.rectangle(cardX, baseY, cardWidth, cardHeight, isSubmitted ? 0xA0A0A0 : 0xD4C4A8);
            cardBg.setDepth(5303);
            if (!isSubmitted) {
                cardBg.setInteractive({ useHandCursor: true });
            }
            cardBg.setMask(scrollMask);
            this.scene.cameras.main.ignore(cardBg);
            this.quizModalElements.push(cardBg);
            contentElements.push(cardBg);
            (cardBg as any).originalY = baseY;

            // Quiz icon
            const iconX = cardX - cardWidth / 2 + 15;
            const iconBg = this.scene.add.circle(iconX, baseY - 8, 8, 0xa855f7);
            iconBg.setDepth(5304);
            iconBg.setMask(scrollMask);
            this.scene.cameras.main.ignore(iconBg);
            this.quizModalElements.push(iconBg);
            contentElements.push(iconBg);
            (iconBg as any).originalY = baseY - 8;

            const quizIcon = this.scene.add.text(iconX, baseY - 8, '❓', {
                fontSize: '8px',
                fontFamily: 'Arial',
                resolution: 2
            });
            quizIcon.setOrigin(0.5);
            quizIcon.setDepth(5305);
            quizIcon.setMask(scrollMask);
            this.scene.cameras.main.ignore(quizIcon);
            this.quizModalElements.push(quizIcon);
            contentElements.push(quizIcon);
            (quizIcon as any).originalY = baseY - 8;

            // Quiz title
            const nameX = cardX - cardWidth / 2 + 30;
            const nameY = baseY - 12;
            const quizName = this.scene.add.text(nameX, nameY, quiz.title, {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#5D4037',
                resolution: 2
            });
            quizName.setOrigin(0, 0.5);
            quizName.setDepth(5304);
            quizName.setMask(scrollMask);
            this.scene.cameras.main.ignore(quizName);
            this.quizModalElements.push(quizName);
            contentElements.push(quizName);
            (quizName as any).originalY = nameY;

            // Event name
            const eventNameY = baseY + 2;
            const eventName = this.scene.add.text(nameX, eventNameY, `📍 ${quiz.event.name}`, {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#8B7355',
                resolution: 2
            });
            eventName.setOrigin(0, 0.5);
            eventName.setDepth(5304);
            eventName.setMask(scrollMask);
            this.scene.cameras.main.ignore(eventName);
            this.quizModalElements.push(eventName);
            contentElements.push(eventName);
            (eventName as any).originalY = eventNameY;

            // Rewards info
            const rewardY = baseY + 16;
            const rewardText = this.scene.add.text(nameX, rewardY, `🏆 ${quiz.rewardXp} XP  💰 ${quiz.rewardGold} Gold`, {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#166534',
                resolution: 2
            });
            rewardText.setOrigin(0, 0.5);
            rewardText.setDepth(5304);
            rewardText.setMask(scrollMask);
            this.scene.cameras.main.ignore(rewardText);
            this.quizModalElements.push(rewardText);
            contentElements.push(rewardText);
            (rewardText as any).originalY = rewardY;

            // Questions count
            const questionsX = cardX + cardWidth / 2 - 25;
            const questionsText = this.scene.add.text(questionsX, baseY - 5, `${quiz.questionCount}`, {
                fontSize: '14px',
                fontFamily: 'PixelFont',
                color: '#7c3aed',
                resolution: 2
            });
            questionsText.setOrigin(0.5);
            questionsText.setDepth(5304);
            questionsText.setMask(scrollMask);
            this.scene.cameras.main.ignore(questionsText);
            this.quizModalElements.push(questionsText);
            contentElements.push(questionsText);
            (questionsText as any).originalY = baseY - 5;

            const questionsLabel = this.scene.add.text(questionsX, baseY + 10, 'Qs', {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#8B7355',
                resolution: 2
            });
            questionsLabel.setOrigin(0.5);
            questionsLabel.setDepth(5304);
            questionsLabel.setMask(scrollMask);
            this.scene.cameras.main.ignore(questionsLabel);
            this.quizModalElements.push(questionsLabel);
            contentElements.push(questionsLabel);
            (questionsLabel as any).originalY = baseY + 10;

            // Completed badge if submitted
            if (isSubmitted) {
                const completedBadge = this.scene.add.text(cardX + cardWidth / 2 - 50, baseY - 18, '✓ Done', {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    backgroundColor: '#22c55e',
                    padding: { x: 4, y: 2 },
                    resolution: 2
                });
                completedBadge.setOrigin(0.5);
                completedBadge.setDepth(5306);
                completedBadge.setMask(scrollMask);
                this.scene.cameras.main.ignore(completedBadge);
                this.quizModalElements.push(completedBadge);
                contentElements.push(completedBadge);
                (completedBadge as any).originalY = baseY - 18;
            }

            // Hover effects
            if (!isSubmitted) {
                cardBg.on('pointerover', () => {
                    cardBg.setFillStyle(0xE8D9C0);
                    quizName.setColor('#a855f7');
                });
                cardBg.on('pointerout', () => {
                    cardBg.setFillStyle(0xD4C4A8);
                    quizName.setColor('#5D4037');
                });

                let clickStartY = 0;
                cardBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                    clickStartY = pointer.y;
                });
                cardBg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
                    if (Math.abs(pointer.y - clickStartY) < 10) {
                        this.showQuizDetails(quiz);
                    }
                });
            }
        });

        // Scroll handling
        const wheelHandler = (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, _dy: number, dz: number) => {
            if (this.quizModalOpen) {
                scrollOffset = Phaser.Math.Clamp(scrollOffset + dz * 0.5, 0, maxScrollOffset);
                updateScrollPositions();
            }
        };
        this.scene.input.on('wheel', wheelHandler);
    }


    /**
     * Show quiz details modal
     */
    private async showQuizDetails(quiz: Quiz): Promise<void> {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 280;
        const modalHeight = 220;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.7);
        overlay.setDepth(5400);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.quizModalElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5401);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, e: Phaser.Types.Input.EventData) => {
            e.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.quizModalElements.push(modalBg);

        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.scene.time.delayedCall(100, async () => {
            this.createQuizDetailContent(quiz, modalX, modalY, modalWidth, modalHeight);
        });

        overlay.on('pointerdown', () => this.closeQuizDetails());
    }

    /**
     * Create quiz detail content
     */
    private async createQuizDetailContent(quiz: Quiz, modalX: number, modalY: number, modalWidth: number, modalHeight: number): Promise<void> {
        // Close button
        const closeBtnBg = this.scene.add.sprite(modalX + modalWidth / 2 - 25, modalY - modalHeight / 2 + 35, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5402);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.quizModalElements.push(closeBtnBg);

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
        this.quizModalElements.push(closeText);

        closeBtnBg.on('pointerdown', () => this.closeQuizDetails());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Quiz title
        const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 50, `❓ ${quiz.title}`, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2,
            wordWrap: { width: modalWidth - 60 }
        });
        title.setOrigin(0.5);
        title.setDepth(5402);
        title.setStroke('#7c3aed', 2);
        this.scene.cameras.main.ignore(title);
        this.quizModalElements.push(title);

        // Description
        const desc = this.scene.add.text(modalX + 10, modalY - 30, quiz.description, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2,
            wordWrap: { width: modalWidth - 50 },
            align: 'center',
            lineSpacing: 6
        });
        desc.setOrigin(0.5);
        desc.setDepth(5402);
        this.scene.cameras.main.ignore(desc);
        this.quizModalElements.push(desc);

        // Quiz info
        const infoY = modalY + 10;
        const info = this.scene.add.text(modalX, infoY, `📝 ${quiz.questionCount} Questions  ⏱️ ${quiz.timePerQuestion}s each`, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#8B7355',
            resolution: 2
        });
        info.setOrigin(0.5);
        info.setDepth(5402);
        this.scene.cameras.main.ignore(info);
        this.quizModalElements.push(info);

        // Rewards
        const rewardsY = modalY + 30;
        const rewards = this.scene.add.text(modalX, rewardsY, `🏆 ${quiz.rewardXp} XP  💰 ${quiz.rewardGold} Gold`, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#166534',
            resolution: 2
        });
        rewards.setOrigin(0.5);
        rewards.setDepth(5402);
        this.scene.cameras.main.ignore(rewards);
        this.quizModalElements.push(rewards);

        // Check if already attempted
        const isLocallySubmitted = this.submittedQuizIds.has(quiz.id);
        const isCachedAsAttempted = this.quizAttemptedCache.get(quiz.id) === true;
        const isAttempted = isLocallySubmitted || isCachedAsAttempted;

        // Start Quiz button
        const startBtn = this.scene.add.sprite(modalX + 10, modalY + modalHeight / 2 - 40, 'square-buttons', 6);
        startBtn.setDisplaySize(140, 30);
        startBtn.setTint(isAttempted ? 0x666666 : 0xa855f7);
        startBtn.setDepth(5402);
        if (!isAttempted) {
            startBtn.setInteractive({ useHandCursor: true });
        }
        this.scene.cameras.main.ignore(startBtn);
        this.quizModalElements.push(startBtn);

        const startBtnText = this.scene.add.text(modalX + 10, modalY + modalHeight / 2 - 40,
            isAttempted ? '✓ Completed' : '🎮 Start Quiz', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        startBtnText.setOrigin(0.5);
        startBtnText.setDepth(5403);
        startBtnText.setStroke(isAttempted ? '#444444' : '#7c3aed', 2);
        this.scene.cameras.main.ignore(startBtnText);
        this.quizModalElements.push(startBtnText);

        if (!isAttempted) {
            startBtn.on('pointerdown', async () => {
                startBtnText.setText('🎮 Starting...');
                startBtn.disableInteractive();

                const quizDetail = await QuizService.getQuizByEvent(quiz.event.id);

                if (!quizDetail || !quizDetail.quiz) {
                    this.callbacks.showToastMessage?.('Failed to load quiz', 0xef4444);
                    startBtnText.setText('🎮 Start Quiz');
                    startBtn.setInteractive({ useHandCursor: true });
                    return;
                }

                if (quizDetail.hasAttempted) {
                    this.submittedQuizIds.add(quiz.id);
                    startBtn.setTint(0x666666);
                    startBtnText.setText('✓ Completed');
                    startBtnText.setStroke('#444444', 2);
                    this.callbacks.showToastMessage?.('Quiz already completed!', 0xfbbf24);
                    return;
                }

                // Try WebSocket first
                const { getQuizSocketService } = require('../QuizSocketService');
                const quizSocketService = getQuizSocketService();
                
                let startSuccess = false;
                
                if (quizSocketService.isConnected()) {
                    this.pendingQuizId = quiz.id;
                    const emitted = quizSocketService.startQuiz(quiz.id);
                    if (emitted) {
                        startSuccess = true;
                    }
                }
                
                if (!startSuccess) {
                    const startResult = await QuizService.startQuiz(quiz.id);
                    
                    if (!startResult.success) {
                        this.callbacks.showToastMessage?.(startResult.error || 'Failed to start quiz', 0xef4444);
                        startBtnText.setText('🎮 Start Quiz');
                        startBtn.setInteractive({ useHandCursor: true });
                        return;
                    }
                }

                this.closeQuizDetails();
                this.close();
                this.startQuizGameplay(quizDetail.quiz);
            });
            startBtn.on('pointerover', () => startBtn.setTint(0xc084fc));
            startBtn.on('pointerout', () => startBtn.setTint(0xa855f7));
        }
    }

    /**
     * Close quiz details
     */
    private closeQuizDetails(): void {
        const detailDepths = [5400, 5401, 5402, 5403];
        this.quizModalElements = this.quizModalElements.filter(el => {
            const depth = (el as any).depth;
            if (detailDepths.includes(depth)) {
                if (el && el.destroy) el.destroy();
                return false;
            }
            return true;
        });
    }

    /**
     * Start quiz gameplay
     */
    private startQuizGameplay(quiz: { id: string; title: string; timePerQuestion: number; questions: QuizQuestion[] }): void {
        this.currentQuizId = quiz.id;
        this.currentQuestions = quiz.questions.sort((a, b) => a.orderIndex - b.orderIndex);
        this.currentQuestionIndex = 0;
        this.userAnswers = [];
        this.timeRemaining = quiz.timePerQuestion;
        
        this.showQuestion();
    }

    /**
     * Show current question
     */
    private showQuestion(): void {
        this.quizGameElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.quizGameElements = [];
        
        if (this.quizTimer) {
            this.quizTimer.destroy();
            this.quizTimer = null;
        }

        const question = this.currentQuestions[this.currentQuestionIndex];
        if (!question) {
            this.submitQuizAnswers();
            return;
        }

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 320;
        const modalHeight = 380;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.8);
        overlay.setDepth(5600);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.quizGameElements.push(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5601);
        modalBg.setInteractive();
        this.scene.cameras.main.ignore(modalBg);
        this.quizGameElements.push(modalBg);

        // Progress text
        const progressText = this.scene.add.text(modalX + 10, modalY - modalHeight / 2 + 50, 
            `Question ${this.currentQuestionIndex + 1}/${this.currentQuestions.length}`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#8B7355',
            resolution: 2
        });
        progressText.setOrigin(0.5);
        progressText.setDepth(5602);
        this.scene.cameras.main.ignore(progressText);
        this.quizGameElements.push(progressText);

        // Timer
        const currentQuiz = this.cachedQuizzes?.find(q => q.id === this.currentQuizId);
        this.questionTimeLimit = currentQuiz?.timePerQuestion || 30;
        this.questionStartTime = Date.now();
        this.timeRemaining = this.questionTimeLimit;
        
        this.timerText = this.scene.add.text(modalX + modalWidth / 2 - 30, modalY - modalHeight / 2 + 25, 
            `⏱️ ${this.timeRemaining}s`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#22c55e',
            resolution: 2
        });
        this.timerText.setOrigin(0.5);
        this.timerText.setDepth(5602);
        this.scene.cameras.main.ignore(this.timerText);
        this.quizGameElements.push(this.timerText);

        // Start timer
        this.quizTimer = this.scene.time.addEvent({
            delay: 100,
            callback: () => {
                const elapsed = Math.floor((Date.now() - this.questionStartTime) / 1000);
                this.timeRemaining = Math.max(0, this.questionTimeLimit - elapsed);
                
                if (this.timerText) {
                    this.timerText.setText(`⏱️ ${this.timeRemaining}s`);
                    if (this.timeRemaining <= 10) {
                        this.timerText.setColor('#ef4444');
                    } else if (this.timeRemaining <= 20) {
                        this.timerText.setColor('#fbbf24');
                    } else {
                        this.timerText.setColor('#22c55e');
                    }
                }
                
                if (this.timeRemaining <= 0) {
                    this.selectAnswer(-1);
                }
            },
            loop: true
        });

        // Question text
        const questionText = this.scene.add.text(modalX + 10, modalY - 90, question.question, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2,
            wordWrap: { width: modalWidth - 80 },
            align: 'center',
            lineSpacing: 6
        });
        questionText.setOrigin(0.5);
        questionText.setDepth(5602);
        this.scene.cameras.main.ignore(questionText);
        this.quizGameElements.push(questionText);

        // Answer options
        const options = [
            { label: 'A', text: question.optionA, index: 0 },
            { label: 'B', text: question.optionB, index: 1 },
            { label: 'C', text: question.optionC, index: 2 },
            { label: 'D', text: question.optionD, index: 3 }
        ];

        const optionStartY = modalY - 30;
        const optionWidth = modalWidth - 90;
        const optionCenterX = modalX + 10;
        const optionLeftX = optionCenterX - optionWidth / 2;
        const baseOptionHeight = 38;
        const optionGap = 7;

        let currentY = optionStartY;

        options.forEach((option) => {
            const tempText = this.scene.add.text(0, 0, option.text, {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                resolution: 2,
                wordWrap: { width: optionWidth - 50 }
            });
            const textHeight = tempText.height;
            tempText.destroy();
            
            const optionHeight = Math.max(baseOptionHeight, textHeight + 16);
            const optionY = currentY;
            
            const optionBg = this.scene.add.rectangle(optionCenterX, optionY, optionWidth, optionHeight, 0xFFF8E1);
            optionBg.setStrokeStyle(2, 0x8B7355);
            optionBg.setDepth(5602);
            optionBg.setInteractive({ useHandCursor: true });
            this.scene.cameras.main.ignore(optionBg);
            this.quizGameElements.push(optionBg);

            const labelX = optionLeftX + 18;
            const labelBg = this.scene.add.circle(labelX, optionY, 12, 0xa855f7);
            labelBg.setDepth(5603);
            this.scene.cameras.main.ignore(labelBg);
            this.quizGameElements.push(labelBg);

            const labelText = this.scene.add.text(labelX, optionY, option.label, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            labelText.setOrigin(0.5);
            labelText.setDepth(5604);
            this.scene.cameras.main.ignore(labelText);
            this.quizGameElements.push(labelText);

            const textX = optionLeftX + 38;
            const optionText = this.scene.add.text(textX, optionY, option.text, {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#5D4037',
                resolution: 2,
                wordWrap: { width: optionWidth - 50 },
                lineSpacing: 6
            });
            optionText.setOrigin(0, 0.5);
            optionText.setDepth(5603);
            this.scene.cameras.main.ignore(optionText);
            this.quizGameElements.push(optionText);

            optionBg.on('pointerover', () => {
                optionBg.setFillStyle(0xE8D9C0);
                labelBg.setFillStyle(0xc084fc);
            });
            optionBg.on('pointerout', () => {
                optionBg.setFillStyle(0xFFF8E1);
                labelBg.setFillStyle(0xa855f7);
            });
            optionBg.on('pointerdown', () => {
                this.selectAnswer(option.index);
            });

            currentY += optionHeight + optionGap;
        });
    }

    /**
     * Select an answer
     */
    private selectAnswer(selectedIndex: number): void {
        if (this.quizTimer) {
            this.quizTimer.destroy();
            this.quizTimer = null;
        }

        const question = this.currentQuestions[this.currentQuestionIndex];
        if (question && selectedIndex >= 0) {
            const answerLetter = ['A', 'B', 'C', 'D'][selectedIndex] || '';
            this.userAnswers.push({
                questionId: question.id,
                answer: answerLetter
            });
        }

        this.currentQuestionIndex++;
        
        if (this.currentQuestionIndex >= this.currentQuestions.length) {
            this.submitQuizAnswers();
        } else {
            this.showQuestion();
        }
    }

    /**
     * Submit quiz answers
     */
    private async submitQuizAnswers(): Promise<void> {
        this.quizGameElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.quizGameElements = [];

        if (!this.currentQuizId) return;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        
        const loadingOverlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.8);
        loadingOverlay.setDepth(5600);
        this.scene.cameras.main.ignore(loadingOverlay);
        this.quizGameElements.push(loadingOverlay);

        const loadingText = this.scene.add.text(screenWidth / 2, screenHeight / 2, 'Submitting...', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        loadingText.setOrigin(0.5);
        loadingText.setDepth(5601);
        this.scene.cameras.main.ignore(loadingText);
        this.quizGameElements.push(loadingText);

        const submittedQuizId = this.currentQuizId;
        
        const { getQuizSocketService } = require('../QuizSocketService');
        const quizSocketService = getQuizSocketService();
        
        let useWebSocket = false;
        
        if (quizSocketService.isConnected()) {
            this.pendingQuizId = submittedQuizId;
            
            const wsAnswers = this.userAnswers.map(a => ({
                questionId: a.questionId,
                answer: a.answer
            }));
            
            const emitted = quizSocketService.submitQuiz(submittedQuizId, wsAnswers);
            if (emitted) {
                useWebSocket = true;
                this.scene.time.delayedCall(500, () => {
                    this.quizGameElements.forEach(el => {
                        if (el && el.destroy) el.destroy();
                    });
                    this.quizGameElements = [];
                });
            }
        }
        
        if (!useWebSocket) {
            const result = await QuizService.submitQuiz(this.currentQuizId, this.userAnswers);

            this.quizGameElements.forEach(el => {
                if (el && el.destroy) el.destroy();
            });
            this.quizGameElements = [];

            if (result && result.success) {
                if (submittedQuizId) {
                    this.submittedQuizIds.add(submittedQuizId);
                }
                GameDataService.refreshAndUpdateUI();
                this.showQuizResult(result);
            } else {
                this.callbacks.showToastMessage?.('Failed to submit quiz', 0xef4444);
            }
        }

        this.currentQuizId = null;
        this.currentQuestions = [];
        this.currentQuestionIndex = 0;
        this.userAnswers = [];
    }

    /**
     * Show quiz result
     */
    private showQuizResult(result: { result: { score: number; correctAnswers: number; totalQuestions: number; xpEarned: number; goldEarned: number; isPerfect: boolean }; message: string }): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 280;
        const modalHeight = 280;

        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.8);
        overlay.setDepth(5600);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);
        this.quizGameElements.push(overlay);

        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5601);
        modalBg.setInteractive();
        this.scene.cameras.main.ignore(modalBg);
        this.quizGameElements.push(modalBg);

        const isPerfect = result.result.isPerfect;
        const titleEmoji = isPerfect ? '🏆' : (result.result.correctAnswers > 0 ? '✨' : '😢');
        const title = this.scene.add.text(modalX + 10, modalY - modalHeight / 2 + 40, `${titleEmoji} Quiz Complete!`, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5602);
        title.setStroke(isPerfect ? '#166534' : '#5D4037', 2);
        this.scene.cameras.main.ignore(title);
        this.quizGameElements.push(title);

        const scoreText = this.scene.add.text(modalX + 10, modalY - 50, 
            `${result.result.correctAnswers}/${result.result.totalQuestions}`, {
            fontSize: '32px',
            fontFamily: 'PixelFont',
            color: isPerfect ? '#22c55e' : '#a855f7',
            resolution: 2
        });
        scoreText.setOrigin(0.5);
        scoreText.setDepth(5602);
        this.scene.cameras.main.ignore(scoreText);
        this.quizGameElements.push(scoreText);

        const correctLabel = this.scene.add.text(modalX + 10, modalY - 20, 'Correct Answers', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#8B7355',
            resolution: 2
        });
        correctLabel.setOrigin(0.5);
        correctLabel.setDepth(5602);
        this.scene.cameras.main.ignore(correctLabel);
        this.quizGameElements.push(correctLabel);

        const rewardsY = modalY + 20;
        const rewards = this.scene.add.text(modalX + 10, rewardsY, 
            `🏆 +${result.result.xpEarned} XP   💰 +${result.result.goldEarned} Gold`, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#166534',
            resolution: 2
        });
        rewards.setOrigin(0.5);
        rewards.setDepth(5602);
        this.scene.cameras.main.ignore(rewards);
        this.quizGameElements.push(rewards);

        const message = this.scene.add.text(modalX + 10, modalY + 55, result.message, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#8B7355',
            resolution: 2,
            wordWrap: { width: modalWidth - 40 },
            align: 'center'
        });
        message.setOrigin(0.5);
        message.setDepth(5602);
        this.scene.cameras.main.ignore(message);
        this.quizGameElements.push(message);

        const closeBtn = this.scene.add.sprite(modalX + 10, modalY + modalHeight / 2 - 40, 'square-buttons', 6);
        closeBtn.setDisplaySize(100, 30);
        closeBtn.setDepth(5602);
        closeBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtn);
        this.quizGameElements.push(closeBtn);

        const closeBtnText = this.scene.add.text(modalX + 10, modalY + modalHeight / 2 - 40, 'Close', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeBtnText.setOrigin(0.5);
        closeBtnText.setDepth(5603);
        closeBtnText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(closeBtnText);
        this.quizGameElements.push(closeBtnText);

        closeBtn.on('pointerdown', () => {
            this.closeQuizGame();
            GameDataService.refreshAndUpdateUI();
            if (result.result.xpEarned > 0 || result.result.goldEarned > 0) {
                this.callbacks.playSuccessSound?.();
            }
        });
        closeBtn.on('pointerover', () => closeBtn.setTint(0xcccccc));
        closeBtn.on('pointerout', () => closeBtn.clearTint());

        overlay.on('pointerdown', () => {
            this.closeQuizGame();
            GameDataService.refreshAndUpdateUI();
        });
    }

    /**
     * Close quiz game
     */
    private closeQuizGame(): void {
        if (this.quizTimer) {
            this.quizTimer.destroy();
            this.quizTimer = null;
        }
        this.quizGameElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.quizGameElements = [];
        this.timerText = null;
    }

    /**
     * Cleanup
     */
    public destroy(): void {
        EventBus.off('quiz_socket:started', this.onQuizStarted, this);
        EventBus.off('quiz_socket:result', this.onQuizResult, this);
        
        this.closeQuizGame();
        this.close();
        super.destroy();
    }
}
