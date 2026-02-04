import Phaser from 'phaser';
import { GAME_CONSTANTS } from '../types/GameTypes';
import { DynamicShadow } from '../objects/DynamicShadow';

interface PetCallbacks {
    getPlayer: () => Phaser.Physics.Arcade.Sprite | null;
    getUICamera?: () => Phaser.Cameras.Scene2D.Camera | null;
}

interface PetConfig {
    key: string;
    name: string;
    spriteKey: string;
    frameWidth: number;
    frameHeight: number;
    scale: number;
    followDistance: number;
    followSpeed: number;
}

interface PositionRecord {
    x: number;
    y: number;
    time: number;
}

const PET_CONFIGS: Record<string, PetConfig> = {
    cat: {
        key: 'cat',
        name: 'Cat',
        spriteKey: 'pet-cat',
        frameWidth: 75,
        frameHeight: 75,
        scale: 0.25,
        followDistance: 8,    // Closer to player before stopping
        followSpeed: 0.15,    // Faster follow for closer tracking
    },
    dino: {
        key: 'dino',
        name: 'Dino',
        spriteKey: 'pet-dino',
        frameWidth: 75,
        frameHeight: 75,
        scale: 0.25,
        followDistance: 8,
        followSpeed: 0.15,
    },
    dragon: {
        key: 'dragon',
        name: 'Dragon',
        spriteKey: 'pet-dragon',
        frameWidth: 75,
        frameHeight: 75,
        scale: 0.25,
        followDistance: 8,
        followSpeed: 0.15,
    },
    lion: {
        key: 'lion',
        name: 'Lion',
        spriteKey: 'pet-lion',
        frameWidth: 75,
        frameHeight: 75,
        scale: 0.25,
        followDistance: 8,
        followSpeed: 0.15,
    },
};

// List of pet keys for cycling
const PET_KEYS = Object.keys(PET_CONFIGS);

// Global state to persist pet across scenes
let globalPetActive = false;
let globalPetKey = 'cat';

export class PetManager {
    private scene: Phaser.Scene;
    private callbacks: PetCallbacks;
    private pet: Phaser.Physics.Arcade.Sprite | null = null;
    private shadow: DynamicShadow | null = null;
    private isActive: boolean = false;
    private currentPetKey: string = 'cat';
    private lastDirection: string = 'down';
    private isMoving: boolean = false;
    private animationsCreated: boolean = false;

    // Position history for delayed following
    private positionHistory: PositionRecord[] = [];
    private readonly DELAY_MS = 200; // 0.2 second delay (closer follow)
    private readonly MAX_HISTORY_SIZE = 30; // Store up to 0.5 second of positions

    // Pet offset from player (use centralized config)
    private readonly OFFSET_X = GAME_CONSTANTS.PET_OFFSET_X;
    private readonly OFFSET_Y = GAME_CONSTANTS.PET_OFFSET_Y;

    constructor(scene: Phaser.Scene, callbacks: PetCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;

        // Restore global state
        this.currentPetKey = globalPetKey;

        // Auto-show pet if it was active in previous scene
        if (globalPetActive) {
            this.scene.time.delayedCall(100, () => {
                this.show(this.currentPetKey);
            });
        }
    }

    /**
     * Create pet animations for all directions
     */
    private createPetAnimations(petKey: string): void {
        if (this.animationsCreated) return;

        const config = PET_CONFIGS[petKey];
        if (!config) return;

        const spriteKey = config.spriteKey;

        // Animation layout for 4x4 spritesheet:
        // Row 0 (frames 0-3): Walk Down
        // Row 1 (frames 4-7): Walk Up
        // Row 2 (frames 8-11): Walk Left
        // Row 3 (frames 12-15): Walk Right

        // Idle animations (first frame of each row)
        if (!this.scene.anims.exists(`pet-${petKey}-idle-down`)) {
            this.scene.anims.create({
                key: `pet-${petKey}-idle-down`,
                frames: [{ key: spriteKey, frame: 0 }],
                frameRate: 1,
                repeat: -1
            });
        }

        if (!this.scene.anims.exists(`pet-${petKey}-idle-up`)) {
            this.scene.anims.create({
                key: `pet-${petKey}-idle-up`,
                frames: [{ key: spriteKey, frame: 4 }],
                frameRate: 1,
                repeat: -1
            });
        }

        if (!this.scene.anims.exists(`pet-${petKey}-idle-left`)) {
            this.scene.anims.create({
                key: `pet-${petKey}-idle-left`,
                frames: [{ key: spriteKey, frame: 8 }],
                frameRate: 1,
                repeat: -1
            });
        }

        if (!this.scene.anims.exists(`pet-${petKey}-idle-right`)) {
            this.scene.anims.create({
                key: `pet-${petKey}-idle-right`,
                frames: [{ key: spriteKey, frame: 12 }],
                frameRate: 1,
                repeat: -1
            });
        }

        // Walk animations
        if (!this.scene.anims.exists(`pet-${petKey}-walk-down`)) {
            this.scene.anims.create({
                key: `pet-${petKey}-walk-down`,
                frames: this.scene.anims.generateFrameNumbers(spriteKey, { start: 0, end: 3 }),
                frameRate: 8,
                repeat: -1
            });
        }

        if (!this.scene.anims.exists(`pet-${petKey}-walk-up`)) {
            this.scene.anims.create({
                key: `pet-${petKey}-walk-up`,
                frames: this.scene.anims.generateFrameNumbers(spriteKey, { start: 4, end: 7 }),
                frameRate: 8,
                repeat: -1
            });
        }

        if (!this.scene.anims.exists(`pet-${petKey}-walk-left`)) {
            this.scene.anims.create({
                key: `pet-${petKey}-walk-left`,
                frames: this.scene.anims.generateFrameNumbers(spriteKey, { start: 8, end: 11 }),
                frameRate: 8,
                repeat: -1
            });
        }

        if (!this.scene.anims.exists(`pet-${petKey}-walk-right`)) {
            this.scene.anims.create({
                key: `pet-${petKey}-walk-right`,
                frames: this.scene.anims.generateFrameNumbers(spriteKey, { start: 12, end: 15 }),
                frameRate: 8,
                repeat: -1
            });
        }

        this.animationsCreated = true;
    }

    /**
     * Toggle pet visibility
     */
    public toggle(): void {
        if (this.isActive) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Show pet and start following player
     */
    public show(petKey: string = this.currentPetKey): void {
        const player = this.callbacks.getPlayer();
        if (!player) return;

        this.currentPetKey = petKey;
        const config = PET_CONFIGS[petKey];
        if (!config) return;

        // Create animations if not yet created
        this.createPetAnimations(petKey);

        // Clear position history
        this.positionHistory = [];

        // Create pet sprite if not exists
        if (!this.pet) {
            this.pet = this.scene.physics.add.sprite(
                player.x + this.OFFSET_X,
                player.y + this.OFFSET_Y,
                config.spriteKey
            );

            this.pet.setScale(config.scale);
            this.pet.setDepth(player.y - 1);
            this.pet.play(`pet-${petKey}-idle-down`);

            // Create shadow
            this.shadow = new DynamicShadow(this.scene, this.pet, 0, 2);

            // Ignore pet by UI camera to prevent duplicate rendering
            const uiCamera = this.callbacks.getUICamera?.();
            if (uiCamera) {
                uiCamera.ignore(this.pet);
                uiCamera.ignore(this.shadow);
            }
        } else {
            this.pet.setVisible(true);
            this.pet.setActive(true);
            
            // Re-create shadow if missing (e.g. if destroyed separately)
            if (!this.shadow || !this.shadow.active) {
                this.shadow = new DynamicShadow(this.scene, this.pet, 0, 2);
                
                const uiCamera = this.callbacks.getUICamera?.();
                if (uiCamera) {
                    uiCamera.ignore(this.shadow);
                }
            } else {
                this.shadow.setVisible(true);
                this.shadow.setActive(true);
            }
        }

        // Initialize position history with current player position
        const now = Date.now();
        for (let i = 0; i < 15; i++) {
            this.positionHistory.push({
                x: player.x + this.OFFSET_X,
                y: player.y + this.OFFSET_Y,
                time: now - (this.DELAY_MS - i * 16)
            });
        }

        this.isActive = true;
        globalPetActive = true;
        globalPetKey = petKey;
    }

    /**
     * Hide pet
     */
    public hide(): void {
        if (this.pet) {
            this.pet.setVisible(false);
            this.pet.setActive(false);
        }
        if (this.shadow) {
            this.shadow.setVisible(false);
            this.shadow.setActive(false);
        }
        this.isActive = false;
        globalPetActive = false;
    }

    /**
     * Update pet position - call this in scene's update method
     */
    public update(): void {
        if (!this.isActive || !this.pet) return;

        const player = this.callbacks.getPlayer();
        if (!player) return;

        const config = PET_CONFIGS[this.currentPetKey];
        if (!config) return;

        const now = Date.now();

        // Record current player position with offset (pet follows behind player)
        const targetX = player.x + this.OFFSET_X;
        const targetY = player.y + this.OFFSET_Y;

        this.positionHistory.push({
            x: targetX,
            y: targetY,
            time: now
        });

        // Remove old positions
        while (this.positionHistory.length > this.MAX_HISTORY_SIZE) {
            this.positionHistory.shift();
        }

        // Find position from DELAY_MS ago
        const targetTime = now - this.DELAY_MS;
        let delayedPos = this.positionHistory[0];

        for (let i = this.positionHistory.length - 1; i >= 0; i--) {
            if (this.positionHistory[i].time <= targetTime) {
                delayedPos = this.positionHistory[i];
                break;
            }
        }

        // Calculate distance to delayed target
        const dx = delayedPos.x - this.pet.x;
        const dy = delayedPos.y - this.pet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Smooth follow using lerp
        const followSpeed = config.followSpeed;
        const minMoveDistance = 2; // Smaller threshold for closer pet

        if (distance > minMoveDistance) {
            // Move towards delayed target
            this.pet.x += dx * followSpeed;
            this.pet.y += dy * followSpeed;
            this.isMoving = true;

            // Determine direction based on movement
            if (Math.abs(dx) > Math.abs(dy)) {
                // Horizontal movement dominant
                this.lastDirection = dx > 0 ? 'right' : 'left';
            } else {
                // Vertical movement dominant
                this.lastDirection = dy > 0 ? 'down' : 'up';
            }

            // Play walk animation
            const walkAnim = `pet-${this.currentPetKey}-walk-${this.lastDirection}`;
            if (this.pet.anims.currentAnim?.key !== walkAnim) {
                this.pet.play(walkAnim, true);
            }
        } else {
            // Stop and play idle
            if (this.isMoving) {
                this.isMoving = false;
                const idleAnim = `pet-${this.currentPetKey}-idle-${this.lastDirection}`;
                this.pet.play(idleAnim, true);
            }
        }

        // Update depth: pet always behind player (lower depth)
        this.pet.setDepth(player.depth - 1);
    }

    /**
     * Get whether pet is currently active
     */
    public getIsActive(): boolean {
        return this.isActive;
    }

    /**
     * Get current pet sprite
     */
    public getPet(): Phaser.Physics.Arcade.Sprite | null {
        return this.pet;
    }

    /**
     * Change pet type
     */
    public changePet(petKey: string): void {
        if (!PET_CONFIGS[petKey]) return;

        const wasActive = this.isActive;

        // Destroy current pet
        if (this.pet) {
            this.pet.destroy();
            this.pet = null;
        }
        if (this.shadow) {
            this.shadow.destroy();
            this.shadow = null;
        }

        this.animationsCreated = false;
        this.currentPetKey = petKey;
        globalPetKey = petKey;

        // Show new pet if was active
        if (wasActive) {
            this.show(petKey);
        }
    }

    /**
     * Cycle to next pet (show if not active, change if active)
     * Returns the new pet's display name
     */
    public cyclePet(): string {
        const currentIndex = PET_KEYS.indexOf(this.currentPetKey);
        const nextIndex = (currentIndex + 1) % PET_KEYS.length;
        const nextPetKey = PET_KEYS[nextIndex];
        const nextConfig = PET_CONFIGS[nextPetKey];

        if (!this.isActive) {
            // If pet is not active, show the next pet
            this.show(nextPetKey);
        } else {
            // If pet is active, change to next pet
            this.changePet(nextPetKey);
        }

        return nextConfig.name;
    }

    /**
     * Get current pet's display name
     */
    public getCurrentPetName(): string {
        return PET_CONFIGS[this.currentPetKey]?.name ?? 'Pet';
    }

    /**
     * Get list of all available pet keys
     */
    public static getAvailablePets(): string[] {
        return [...PET_KEYS];
    }

    /**
     * Static method to check if pet is globally active
     */
    public static isGloballyActive(): boolean {
        return globalPetActive;
    }

    /**
     * Cleanup - don't reset global state so pet persists
     */
    public destroy(): void {
        if (this.pet) {
            this.pet.destroy();
            this.pet = null;
        }
        // Don't reset isActive or globalPetActive here
        // so pet state persists across scene transitions
    }
}
