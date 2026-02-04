import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { showAccessKeyPrompt, isAccessVerified } from '../utils/AccessKeyUtils';

// Location destination data
interface LocationDestination {
    id: string;
    name: string;
    nameVi: string;
    description: string;
    icon: string;
    bgImage: string; // Background image key
    enabled: boolean;
    isCurrent?: boolean; // Is this the current location?
    sceneKey?: string; // Scene to navigate to
}

// Station locations (base data without isCurrent - will be set dynamically)
const DESTINATIONS_DATA: Omit<LocationDestination, 'isCurrent'>[] = [
    {
        id: 'farm',
        name: 'Farm',
        nameVi: 'Nong Trai',
        description: 'Your cozy home farm',
        icon: '🏡',
        bgImage: 'place-farm',
        enabled: true,
        sceneKey: 'FarmingGame'
    },
    {
        id: 'square',
        name: 'Town Square',
        nameVi: 'Quang Truong',
        description: 'The bustling center of town',
        icon: '🏛️',
        bgImage: 'place-townsquare',
        enabled: true,
        sceneKey: 'TownSquare'
    },
    {
        id: 'forest',
        name: 'Forest',
        nameVi: 'Khu Rung',
        description: 'A mysterious forest awaits...',
        icon: '🌲',
        bgImage: 'place-forest',
        enabled: false,
        sceneKey: 'Forest'
    }
];

// Station configuration options
interface StationConfig {
    x: number;          // Tile X position
    y: number;          // Tile Y position
    flipX?: boolean;    // Flip sprite horizontally
    currentLocationId: string;  // ID of current location (farm, square, forest)
}

// Data passed when navigating to a new scene
export interface NavigationData {
    fromLocation: string;  // ID of origin location
    spawnAt: 'station';    // Where to spawn in destination
}

interface StationCallbacks {
    onNavigate?: (sceneKey: string, data?: NavigationData) => void;
    showToastMessage?: (text: string, color: number) => void;
}

/**
 * Manages the Station/Dock object and travel modal
 * Allows players to travel to different locations
 */
export class StationManager extends BaseManager {
    private callbacks: StationCallbacks;
    private config: StationConfig;
    private stationSprite: Phaser.GameObjects.Sprite | null = null;
    private destinations: LocationDestination[] = [];

    private readonly TILE_SIZE = 16;

    // Default config for FarmingGame (backward compatible)
    private static readonly DEFAULT_CONFIG: StationConfig = {
        x: 41.5,
        y: 24,
        flipX: false,
        currentLocationId: 'farm'
    };

    constructor(scene: Phaser.Scene, callbacks: StationCallbacks = {}, config?: Partial<StationConfig>) {
        super(scene);
        this.callbacks = callbacks;
        this.config = { ...StationManager.DEFAULT_CONFIG, ...config };

        // Generate destinations with correct isCurrent based on config
        this.destinations = DESTINATIONS_DATA.map(dest => ({
            ...dest,
            isCurrent: dest.id === this.config.currentLocationId
        }));
    }

    /**
     * Create the station sprite with animation
     */
    public create(): void {
        const pixelX = this.config.x * this.TILE_SIZE;
        const pixelY = this.config.y * this.TILE_SIZE;

        // Create station animation if not exists
        if (!this.scene.anims.exists('station-idle')) {
            this.scene.anims.create({
                key: 'station-idle',
                frames: this.scene.anims.generateFrameNumbers('station', { start: 0, end: 3 }),
                frameRate: 4,
                repeat: -1
            });
        }

        // Create station sprite
        this.stationSprite = this.scene.add.sprite(pixelX, pixelY, 'station', 0);
        this.stationSprite.setOrigin(0.5, 0.5);
        this.stationSprite.setDisplaySize(60, 46); // Adjusted size
        if (this.config.flipX) {
            this.stationSprite.setFlipX(true);
        }
        this.stationSprite.setDepth(pixelY + 10);
        this.stationSprite.setName('station');

        // Play idle animation
        this.stationSprite.play('station-idle');

        // Make interactive
        this.stationSprite.setInteractive({ useHandCursor: true });

        // Hover effects
        this.stationSprite.on('pointerover', () => {
            this.stationSprite?.setTint(0xffff88);
        });

        this.stationSprite.on('pointerout', () => {
            this.stationSprite?.clearTint();
        });

        // Click to open travel modal
        this.stationSprite.on('pointerdown', () => {
            this.open();
        });

        // Ignore by UI camera (game object, not UI)
        const uiCamera = this.scene.cameras.cameras.find(cam => cam.name === 'uiCamera');
        if (uiCamera) {
            uiCamera.ignore(this.stationSprite);
        }
    }

    /**
     * Open travel destinations modal
     */
    public open(): void {
        if (this.isOpen) return;
        this.isOpen = true;

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 280;
        const modalHeight = 280; // Increased for 3 destinations
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Dark overlay
        const overlay = this.scene.add.rectangle(
            screenWidth / 2, screenHeight / 2,
            screenWidth, screenHeight,
            0x000000, 0.6
        );
        overlay.setDepth(5300);
        overlay.setInteractive();
        overlay.on('pointerdown', () => this.close());
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

        // Animation
        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Create content after animation
        this.scene.time.delayedCall(100, () => {
            this.createModalContent(modalX, modalY, modalWidth, modalHeight);
        });
    }

    /**
     * Close modal
     */
    public close(): void {
        this.isOpen = false;
        this.destroyElements();
    }

    /**
     * Create modal content with destinations
     */
    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        const modalTop = modalY - modalHeight / 2;

        // Close button
        const closeBtnX = modalX + modalWidth / 2 - 30;
        const closeBtnY = modalTop + 35;

        const closeBtnBg = this.scene.add.sprite(closeBtnX, closeBtnY, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(closeBtnX, closeBtnY, 'X', {
            fontSize: '10px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5303);
        closeText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(closeText);
        this.addElement(closeText);

        closeBtnBg.on('pointerdown', () => this.close());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Title
        const title = this.scene.add.text(modalX, modalTop + 40, 'TRAVEL', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5302);
        title.setStroke('#5D4037', 3);
        this.scene.cameras.main.ignore(title);
        this.addElement(title);

        // Subtitle
        const subtitle = this.scene.add.text(modalX, modalTop + 58, 'Choose destination', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        subtitle.setOrigin(0.5);
        subtitle.setDepth(5302);
        subtitle.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(subtitle);
        this.addElement(subtitle);

        // Create destination buttons
        const startY = modalTop + 100;
        const buttonHeight = 50;
        const buttonSpacing = 10;

        this.destinations.forEach((dest, index) => {
            const buttonY = startY + index * (buttonHeight + buttonSpacing);
            this.createDestinationButton(modalX + 10, buttonY, modalWidth - 60, buttonHeight, dest);
        });
    }

    /**
     * Create a destination button with image background
     */
    private createDestinationButton(
        x: number,
        y: number,
        width: number,
        height: number,
        destination: LocationDestination
    ): void {
        // Background image
        const bgImage = this.scene.add.image(x, y, destination.bgImage);
        bgImage.setDisplaySize(width, height);
        bgImage.setDepth(5302);
        this.scene.cameras.main.ignore(bgImage);
        this.addElement(bgImage);

        // Darken overlay for disabled or apply tint
        if (!destination.enabled) {
            bgImage.setTint(0x555555);
        } else if (destination.isCurrent) {
            // Slight blue tint for current
            bgImage.setTint(0xaaddff);
        }

        // Border frame
        const borderColor = destination.isCurrent ? 0x2196F3 : (destination.enabled ? 0x4a7c59 : 0x333333);
        const border = this.scene.add.rectangle(x, y, width, height);
        border.setStrokeStyle(3, borderColor);
        border.setFillStyle(0x000000, 0); // Transparent fill
        border.setDepth(5303);
        this.scene.cameras.main.ignore(border);
        this.addElement(border);

        // Make interactive if enabled and not current
        if (destination.enabled && !destination.isCurrent) {
            bgImage.setInteractive({ useHandCursor: true });

            bgImage.on('pointerover', () => {
                bgImage.setTint(0xffffaa);
                border.setStrokeStyle(3, 0xFFD700);
            });

            bgImage.on('pointerout', () => {
                bgImage.clearTint();
                border.setStrokeStyle(3, borderColor);
            });

            bgImage.on('pointerdown', () => {
                this.onDestinationSelect(destination);
            });
        }

        // Semi-transparent overlay at bottom for text
        const textBg = this.scene.add.rectangle(x, y + height / 2 - 15, width, 30, 0x000000, 0.6);
        textBg.setDepth(5304);
        this.scene.cameras.main.ignore(textBg);
        this.addElement(textBg);

        // Name
        const nameText = this.scene.add.text(x - width / 2 + 10, y + height / 2 - 20, destination.name.toUpperCase(), {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        nameText.setOrigin(0, 0.5);
        nameText.setDepth(5305);
        nameText.setStroke('#000000', 2);
        this.scene.cameras.main.ignore(nameText);
        this.addElement(nameText);

        // Description
        const descText = this.scene.add.text(x - width / 2 + 10, y + height / 2 - 6, destination.description, {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: '#CCCCCC',
            resolution: 2
        });
        descText.setOrigin(0, 0.5);
        descText.setDepth(5305);
        this.scene.cameras.main.ignore(descText);
        this.addElement(descText);

        // Current place badge
        if (destination.isCurrent) {
            const currentBadge = this.scene.add.rectangle(x + width / 2 - 35, y - height / 2 + 12, 60, 16, 0x2196F3);
            currentBadge.setDepth(5305);
            currentBadge.setStrokeStyle(1, 0x1976D2);
            this.scene.cameras.main.ignore(currentBadge);
            this.addElement(currentBadge);

            const currentText = this.scene.add.text(x + width / 2 - 35, y - height / 2 + 12, 'CURRENT', {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            currentText.setOrigin(0.5);
            currentText.setDepth(5306);
            this.scene.cameras.main.ignore(currentText);
            this.addElement(currentText);
        }

        // Lock icon for disabled destinations
        if (!destination.enabled) {
            const lockBg = this.scene.add.circle(x, y, 20, 0x000000, 0.7);
            lockBg.setDepth(5305);
            this.scene.cameras.main.ignore(lockBg);
            this.addElement(lockBg);

            const lockIcon = this.scene.add.text(x, y - 5, '🔒', {
                fontSize: '18px',
                resolution: 2
            });
            lockIcon.setOrigin(0.5);
            lockIcon.setDepth(5306);
            this.scene.cameras.main.ignore(lockIcon);
            this.addElement(lockIcon);

            const comingSoon = this.scene.add.text(x, y + 12, 'SOON', {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            comingSoon.setOrigin(0.5);
            comingSoon.setDepth(5306);
            this.scene.cameras.main.ignore(comingSoon);
            this.addElement(comingSoon);
        }
    }

    /**
     * Handle destination selection
     */
    private async onDestinationSelect(destination: LocationDestination): Promise<void> {
        // Check access key for Farm
        if (destination.id === 'farm') {
            if (!isAccessVerified()) {
                const verified = await showAccessKeyPrompt();
                if (!verified) return;
            }
        }

        if (this.callbacks.showToastMessage) {
            this.callbacks.showToastMessage(`Traveling to ${destination.nameVi}...`, 0x4CAF50);
        }

        this.close();

        // Navigate to scene if callback provided, passing spawn location data
        if (destination.sceneKey && this.callbacks.onNavigate) {
            const navData: NavigationData = {
                fromLocation: this.config.currentLocationId,
                spawnAt: 'station'
            };
            this.callbacks.onNavigate(destination.sceneKey, navData);
        }
    }

    /**
     * Get station sprite for camera ignore
     */
    public getStationSprite(): Phaser.GameObjects.Sprite | null {
        return this.stationSprite;
    }

    /**
     * Cleanup
     */
    public destroy(): void {
        if (this.stationSprite) {
            this.stationSprite.destroy();
            this.stationSprite = null;
        }
        super.destroy();
    }
}
