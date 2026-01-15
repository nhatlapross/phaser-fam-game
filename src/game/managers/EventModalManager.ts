import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { EventService, GameEvent } from '../EventService';
import { RedeemService } from '../RedeemService';
import { GameDataService } from '../GameDataService';

interface EventModalCallbacks {
    showToastMessage?: (text: string, color: number) => void;
    playSuccessSound?: () => void;
}

/**
 * Manages event modal, list, detail, and check-in functionality
 */
export class EventModalManager extends BaseManager {
    private callbacks: EventModalCallbacks;
    private modalElements: Phaser.GameObjects.GameObject[] = [];
    private eventDetailElements: Phaser.GameObjects.GameObject[] = [];
    
    private eventModalOpen: boolean = false;
    private cachedEvents: GameEvent[] | null = null;
    
    // HTML elements
    private eventCheckInInput: HTMLInputElement | null = null;
    private qrScannerContainer: HTMLDivElement | null = null;

    constructor(scene: Phaser.Scene, callbacks: EventModalCallbacks = {}) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Open event modal
     */
    public async open(): Promise<void> {
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
            this.createModalContent(modalX, modalY, modalWidth, modalHeight);
        });

        overlay.on('pointerdown', () => this.close());
    }

    /**
     * Close event modal
     */
    public close(): void {
        this.eventModalOpen = false;
        this.modalElements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.modalElements = [];
    }

    /**
     * Check if modal is open
     */
    public getIsOpen(): boolean {
        return this.eventModalOpen;
    }

    /**
     * Get cached events
     */
    public getCachedEvents(): GameEvent[] | null {
        return this.cachedEvents;
    }

    /**
     * Set cached events
     */
    public setCachedEvents(events: GameEvent[]): void {
        this.cachedEvents = events;
    }

    /**
     * Create event modal content
     */
    private async createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): Promise<void> {
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

        closeBtnBg.on('pointerdown', () => this.close());
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

        // Try to use cached data first for instant display
        const cachedData = GameDataService.getCachedData();
        let events: GameEvent[] | null = cachedData?.events || this.cachedEvents;
        
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
                this.showCheckInModal(event);
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

        // Scroll handling
        const wheelHandler = (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, _dy: number, dz: number) => {
            if (this.eventModalOpen) {
                scrollOffset = Phaser.Math.Clamp(scrollOffset + dz * 0.5, 0, maxScrollOffset);
                updateScrollPositions();
            }
        };
        this.scene.input.on('wheel', wheelHandler);
        
        // Drag scrolling
        let isDragging = false;
        let lastPointerY = 0;
        
        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (isDragging && this.eventModalOpen) {
                const deltaY = lastPointerY - pointer.y;
                scrollOffset = Phaser.Math.Clamp(scrollOffset + deltaY, 0, maxScrollOffset);
                lastPointerY = pointer.y;
                updateScrollPositions();
            }
        });
        
        this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.eventModalOpen) {
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
            this.createEventDetailContent(event, modalX, modalY, modalWidth, modalHeight);
        });

        overlay.on('pointerdown', () => this.closeEventDetails());
    }


    /**
     * Create event detail content
     */
    private createEventDetailContent(event: GameEvent, modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
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
            this.showCheckInModal(event);
        });
        checkInBtn.on('pointerover', () => checkInBtn.setTint(0x4ade80));
        checkInBtn.on('pointerout', () => checkInBtn.setTint(0x22c55e));
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
    private showCheckInModal(event: GameEvent): void {
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
            this.createCheckInContent(event, modalX, modalY, modalWidth, modalHeight);
        });
    }

    /**
     * Create check-in modal content
     */
    private createCheckInContent(event: GameEvent, modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
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

        // Input background
        const inputBg = this.scene.add.rectangle(modalX, modalY - 10, 180, 30, 0xFFF8E1);
        inputBg.setStrokeStyle(2, 0x5D4037);
        inputBg.setDepth(5502);
        this.scene.cameras.main.ignore(inputBg);
        this.eventDetailElements.push(inputBg);

        // QR Scanner button
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

        qrBtn.on('pointerdown', () => this.openQRScanner(event));
        qrBtn.on('pointerover', () => qrBtn.setTint(0xcccccc));
        qrBtn.on('pointerout', () => qrBtn.clearTint());

        // Create HTML input
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

        const checkInInput = this.eventCheckInInput;

        // Submit button
        const submitBtn = this.scene.add.sprite(modalX + 10, modalY + 45, 'square-buttons', 6);
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
    }

    /**
     * Open QR scanner for event check-in
     */
    private async openQRScanner(event: GameEvent): Promise<void> {
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
                this.closeQRScanner();
                
                this.callbacks.showToastMessage?.('QR Code scanned! Checking in...', 0x4ade80);
                
                try {
                    let verificationCode = decodedText;
                    try {
                        const qrData = JSON.parse(decodedText);
                        if (qrData.verificationCode) {
                            verificationCode = qrData.verificationCode;
                        }
                    } catch {
                        // Not JSON, use raw text
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
            this.closeQRScanner();
        });

        closeBtn.addEventListener('click', () => {
            html5QrCode.stop().then(() => this.closeQRScanner()).catch(() => this.closeQRScanner());
        });
    }

    /**
     * Close QR scanner
     */
    private closeQRScanner(): void {
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
        this.closeEventDetails();
        this.close();
        this.closeQRScanner();
        super.destroy();
    }
}
