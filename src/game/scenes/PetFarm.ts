import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { DynamicShadow } from "../objects/DynamicShadow";
import { PetFarmManager, PetStats } from "../managers/PetFarmManager";
import { GameDataService } from "../GameDataService";
import { UserService } from "../UserService";
import { PLAYABLE_CHARACTERS } from "../config/CharacterConfig";
import { GAME_CONSTANTS, StationManager } from "../managers";
import { useGameState } from "../hooks/useGameState";

/**
 * PetFarm Scene - Pet Farm Map
 * Khu vực riêng để nuôi và chăm sóc thú cưng
 */
export class PetFarm extends Scene {
    private static instance: PetFarm | null = null;

    private player!: Phaser.Physics.Arcade.Sprite;
    private playerShadow!: DynamicShadow;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private currentCharacterKey: string = "bear"; // Default character

    private readonly TILE_SIZE = 16;
    private readonly MAP_WIDTH = 50; // Increased from 40 to better fit background (800px)
    private readonly MAP_HEIGHT = 35; // Increased from 30 to better fit background (560px)

    private petFarmManager!: PetFarmManager;
    private petSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
    private petShadows: Map<number, DynamicShadow> = new Map();

    // Pet zones positioned for interior home layout
    // Based on 640x480 world (40x30 tiles at 16px each)
    // Living room center area (around the circular rug)
    private readonly PET_ZONES = [
        { x: 240, y: 200, slotIndex: 0 }, // Top left
        { x: 400, y: 200, slotIndex: 1 }, // Top right
        { x: 240, y: 280, slotIndex: 2 }, // Bottom left
        { x: 400, y: 280, slotIndex: 3 }, // Bottom right
    ];

    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private petDetailModal: Phaser.GameObjects.Container | null = null;
    private mushroomCount: number = 5; // Demo data
    private fruitCount: number = 3; // Demo data

    // NPC references for cleanup
    private nobitaSprite: Phaser.GameObjects.Sprite | null = null;
    private nobitaShadow: DynamicShadow | null = null;
    private nobitaLabel: Phaser.GameObjects.Text | null = null;
    private nobitaHitArea: Phaser.GameObjects.Arc | null = null;

    private maidCatSprite: Phaser.GameObjects.Sprite | null = null;
    private maidCatShadow: DynamicShadow | null = null;
    private maidCatLabel: Phaser.GameObjects.Text | null = null;
    private maidCatHitArea: Phaser.GameObjects.Arc | null = null;

    // Lucky box state
    private luckyBoxOpenCount: number = 0; // Track how many times opened
    private readonly LUCKY_BOX_COST = 100; // Gold cost after first free open
    private maidCatSpawned: boolean = false; // Flag to prevent duplicate spawns

    // Station manager for travel
    private stationManager!: StationManager;

    constructor() {
        super("PetFarm");
    }

    create() {
        // Singleton check - prevent multiple instances
        if (PetFarm.instance && PetFarm.instance !== this) {
            console.warn(
                "⚠️ PetFarm instance already exists! Destroying duplicate.",
            );
            this.scene.stop();
            return;
        }
        PetFarm.instance = this;

        // Clean up any existing NPCs from previous session
        this.cleanupAllNPCs();

        this.petFarmManager = new PetFarmManager(this, {
            showToastMessage: (text, color) => this.showToast(text, color),
            playSuccessSound: () => {},
            refreshUI: () => this.refreshUI(),
        });

        this.createMap();
        this.createPlayer();
        this.setupCamera();
        this.setupControls();
        this.createPetShopNPC(); // Add Nobita NPC
        // Don't spawn pets automatically - wait for Lucky Box
        this.createUI();
        this.setupCameraIgnore();
        this.setupDebugHelpers();

        EventBus.emit("current-scene-ready", this);
    }

    /**
     * Clean up all NPC sprites and related objects
     */
    private cleanupAllNPCs() {
        this.cleanupNobita();
        this.cleanupMaidCat();
    }

    /**
     * Clean up Nobita NPC
     */
    private cleanupNobita() {
        if (this.nobitaSprite) {
            this.nobitaSprite.destroy();
            this.nobitaSprite = null;
        }
        if (this.nobitaShadow) {
            this.nobitaShadow.destroy();
            this.nobitaShadow = null;
        }
        if (this.nobitaLabel) {
            this.nobitaLabel.destroy();
            this.nobitaLabel = null;
        }
        if (this.nobitaHitArea) {
            this.nobitaHitArea.destroy();
            this.nobitaHitArea = null;
        }
    }

    /**
     * Clean up maid cat sprite and related objects
     */
    private cleanupMaidCat() {
        if (this.maidCatSprite) {
            this.maidCatSprite.destroy();
            this.maidCatSprite = null;
        }
        if (this.maidCatShadow) {
            this.maidCatShadow.destroy();
            this.maidCatShadow = null;
        }
        if (this.maidCatLabel) {
            this.maidCatLabel.destroy();
            this.maidCatLabel = null;
        }
        if (this.maidCatHitArea) {
            this.maidCatHitArea.destroy();
            this.maidCatHitArea = null;
        }
        this.maidCatSpawned = false;
    }

    /**
     * Called when scene is shut down
     */
    shutdown() {
        this.cleanupAllNPCs();

        // Clear singleton instance
        if (PetFarm.instance === this) {
            PetFarm.instance = null;
        }
    }

    private createMap() {
        const w = this.MAP_WIDTH * this.TILE_SIZE;
        const h = this.MAP_HEIGHT * this.TILE_SIZE;

        // Set world bounds for physics
        this.physics.world.setBounds(0, 0, w, h);

        // Add interior home background image
        const bg = this.add.image(w / 2, h / 2, "place-pethome");

        // Scale image to cover the world (maintain aspect ratio)
        const scaleX = w / bg.width;
        const scaleY = h / bg.height;
        const scale = Math.max(scaleX, scaleY);
        bg.setScale(scale);
        bg.setDepth(-1); // Behind everything

        // Set texture to use nearest neighbor filtering for sharp pixels
        bg.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    private createPlayer() {
        const startX = (this.MAP_WIDTH * this.TILE_SIZE) / 2; // Center X (400)
        const startY = this.MAP_HEIGHT * this.TILE_SIZE - 80; // Near bottom with more space

        // Get character type from user data (1-5, maps to index 0-4)
        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();
        const characterType = user?.characterType || 1;

        // Map characterType (1-5) to character index (0-4) and get character key
        const characterIndex = Math.max(
            0,
            Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1),
        );
        this.currentCharacterKey =
            PLAYABLE_CHARACTERS[characterIndex]?.key || "bear";

        // Create player sprite with the selected character
        this.player = this.physics.add.sprite(
            startX,
            startY,
            this.currentCharacterKey,
        );

        this.player.setCollideWorldBounds(true);
        this.player.setOrigin(
            GAME_CONSTANTS.CHARACTER_ORIGIN_X,
            GAME_CONSTANTS.CHARACTER_ORIGIN_Y,
        );
        this.player.setScale(0.6); // Increased from default for better visibility
        this.player.setDepth(this.player.y);

        this.playerShadow = new DynamicShadow(this, this.player, 0, 2);

        // Create animations for the selected character
        this.createPlayerAnimations();

        // Play idle animation
        this.player.play("idle-down");
    }

    private createPlayerAnimations() {
        const frameRate = 6;
        const charKey = this.currentCharacterKey;

        // Idle animations (first frame of each direction)
        if (!this.anims.exists("idle-down")) {
            this.anims.create({
                key: "idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("idle-up")) {
            this.anims.create({
                key: "idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("idle-left")) {
            this.anims.create({
                key: "idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("idle-right")) {
            this.anims.create({
                key: "idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("walk-down")) {
            this.anims.create({
                key: "walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("walk-up")) {
            this.anims.create({
                key: "walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("walk-left")) {
            this.anims.create({
                key: "walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("walk-right")) {
            this.anims.create({
                key: "walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private setupCamera() {
        const w = this.MAP_WIDTH * this.TILE_SIZE;
        const h = this.MAP_HEIGHT * this.TILE_SIZE;

        this.cameras.main.setBounds(0, 0, w, h);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1.5); // Keep original zoom to not affect other maps

        this.uiCamera = this.cameras.add(
            0,
            0,
            this.scale.width,
            this.scale.height,
        );
        this.uiCamera.setScroll(0, 0);
    }

    private setupControls() {
        this.cursors = this.input.keyboard!.createCursorKeys();
    }

    private createPetZones() {
        this.PET_ZONES.forEach((zone) => {
            // Simple invisible interactive zone for clicking
            const hitArea = this.add
                .rectangle(zone.x, zone.y, 100, 100, 0xffffff, 0.2) // Semi-transparent for debugging
                .setStrokeStyle(2, 0xffd700, 0.5) // Gold border to see zones
                .setInteractive();
            hitArea.on("pointerdown", () => this.onZoneClick(zone.slotIndex));

            // Empty slot text (will be hidden when pet is adopted)
            const emptyText = this.add
                .text(zone.x, zone.y, "Empty\nSlot", {
                    fontSize: "14px",
                    color: "#95A5A6",
                    align: "center",
                    backgroundColor: "#00000044",
                    padding: { x: 8, y: 4 },
                })
                .setOrigin(0.5);
            emptyText.setName(`empty_${zone.slotIndex}`);
        });
    }

    private createUI() {
        // Initialize StationManager (but don't create the station sprite)
        // We'll use it only for the travel modal
        this.stationManager = new StationManager(
            this,
            {
                onNavigate: (sceneKey, navData) => {
                    this.cameras.main.fadeOut(300);
                    this.cameras.main.once("camerafadeoutcomplete", () => {
                        this.scene.start(sceneKey, navData);
                    });
                },
                showToastMessage: (text, color) => this.showToast(text, color),
            },
            {
                x: 0, // Not used since we won't create the station sprite
                y: 0,
                flipX: false,
                currentLocationId: "petfarm",
            },
        );
        // Don't call stationManager.create() - we only want the modal functionality

        // Create exit door instead
        this.createExitDoor();
    }

    private createExitDoor() {
        // Position at bottom center (below the wardrobe/furniture)
        const centerX = (this.MAP_WIDTH * this.TILE_SIZE) / 2; // 400
        const exitX = centerX - 250; // Left side
        const exitY = this.MAP_HEIGHT * this.TILE_SIZE - 20; // Near bottom

        // Create door image (vertical orientation)
        const doorImage = this.add.image(exitX, exitY, "exit-door");
        doorImage.setScale(0.5); // Smaller scale for better fit
        doorImage.setDepth(exitY);
        doorImage.setOrigin(0.5, 0.8); // Same origin as characters
        doorImage.setAngle(-55); // Rotate to make it vertical

        // Add pulsing glow effect
        const glow = this.add.circle(exitX, exitY, 20, 0xffd700, 0.3);
        glow.setDepth(exitY - 1);

        this.tweens.add({
            targets: glow,
            alpha: 0.1,
            scale: 1.3,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });

        // Make interactive
        const hitArea = this.add.circle(exitX, exitY, 30, 0x000000, 0);
        hitArea.setInteractive({ useHandCursor: true });
        hitArea.setDepth(exitY - 1);

        // Hover effect
        hitArea.on("pointerover", () => {
            doorImage.setTint(0xffff99);
            glow.setFillStyle(0xffd700, 0.6);
            doorImage.setScale(0.55);
        });

        hitArea.on("pointerout", () => {
            doorImage.clearTint();
            glow.setFillStyle(0xffd700, 0.3);
            doorImage.setScale(0.5);
        });

        // Click to open StationManager travel modal
        hitArea.on("pointerdown", () => {
            this.stationManager.open();
        });
    }

    private createPetShopNPC() {
        // Position NPC at center of map
        const centerX = (this.MAP_WIDTH * this.TILE_SIZE) / 2; // 400
        const centerY = (this.MAP_HEIGHT * this.TILE_SIZE) / 2; // 280

        // Create NPC sprite (Nobita - pet shop keeper)
        const npc = this.add.sprite(centerX, centerY, "nobita", 0);
        npc.setScale(0.35); // Similar size to player
        npc.setDepth(centerY);
        npc.setOrigin(0.5, 0.8); // Bottom-center origin for proper depth sorting

        // Create animations for Nobita if not exists
        this.createNobitaAnimations();

        // Play idle animation
        npc.play("nobita-idle-down");

        // Add shadow
        const npcShadow = new DynamicShadow(this, npc, 0, 2);

        // Add name label above NPC (no background, no icon)
        const nameLabel = this.add
            .text(centerX, centerY - 50, "Nobita", {
                fontSize: "14px",
                color: "#fff",
                stroke: "#000",
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(10000);

        // Make NPC interactive
        const hitArea = this.add
            .circle(centerX, centerY, 30, 0x000000, 0)
            .setInteractive({ useHandCursor: true })
            .setDepth(centerY - 1);

        // Hover effect
        hitArea.on("pointerover", () => {
            npc.setTint(0xccccff);
        });

        hitArea.on("pointerout", () => {
            npc.clearTint();
        });

        // Click to open pet selection modal
        hitArea.on("pointerdown", () => {
            this.showPetSelectionModal();
        });

        // Start random movement AI around center area
        this.startNPCRandomMovement(
            npc,
            npcShadow,
            nameLabel,
            hitArea,
            "center",
        );
    }

    private createMaidCatNPC() {
        // Check if already spawned
        if (this.maidCatSprite && this.maidCatSprite.scene) {
            return;
        }

        // Position Maid Cat at a different location (offset from Nobita)
        const centerX = (this.MAP_WIDTH * this.TILE_SIZE) / 2; // 400
        const centerY = (this.MAP_HEIGHT * this.TILE_SIZE) / 2; // 280
        const maidCatX = centerX + 80; // Right side of Nobita
        const maidCatY = centerY + 40; // Slightly below

        // Create Maid Cat sprite
        this.maidCatSprite = this.add.sprite(
            maidCatX,
            maidCatY,
            "npc-maidcat",
            0,
        );
        this.maidCatSprite.setScale(0.35); // Same size as Nobita
        this.maidCatSprite.setDepth(maidCatY);
        this.maidCatSprite.setOrigin(0.5, 0.8);

        // Create animations for Maid Cat if not exists
        this.createMaidCatAnimations();

        // Play idle animation
        this.maidCatSprite.play("npc-maidcat-idle-down");

        // Add shadow
        this.maidCatShadow = new DynamicShadow(this, this.maidCatSprite, 0, 2);

        // Add name label above NPC
        this.maidCatLabel = this.add
            .text(maidCatX, maidCatY - 50, "Maid Cat", {
                fontSize: "14px",
                color: "#fff",
                stroke: "#000",
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(10000);

        // Make NPC interactive
        this.maidCatHitArea = this.add
            .circle(maidCatX, maidCatY, 30, 0x000000, 0)
            .setInteractive({ useHandCursor: true })
            .setDepth(maidCatY - 1);

        // Hover effect
        this.maidCatHitArea.on("pointerover", () => {
            if (this.maidCatSprite) {
                this.maidCatSprite.setTint(0xffcccc);
            }
        });

        this.maidCatHitArea.on("pointerout", () => {
            if (this.maidCatSprite) {
                this.maidCatSprite.clearTint();
            }
        });

        // Click to interact
        this.maidCatHitArea.on("pointerdown", () => {
            this.showToast("Maid Cat is cleaning! 🧹✨", 0xff69b4);
        });

        // Start random movement AI around center area
        this.startNPCRandomMovement(
            this.maidCatSprite,
            this.maidCatShadow,
            this.maidCatLabel,
            this.maidCatHitArea,
            "center",
        );
    }

    private createPetCatNPC() {
        // Check if already spawned
        if (this.maidCatSprite && this.maidCatSprite.scene) {
            return;
        }

        // Position Pet Cat at a different location (left side of Nobita)
        const centerX = (this.MAP_WIDTH * this.TILE_SIZE) / 2; // 400
        const centerY = (this.MAP_HEIGHT * this.TILE_SIZE) / 2; // 280
        const petCatX = centerX - 80; // Left side of Nobita
        const petCatY = centerY + 40; // Slightly below

        // Create Pet Cat sprite (using pet-cat spritesheet)
        this.maidCatSprite = this.add.sprite(petCatX, petCatY, "pet-cat", 0);
        this.maidCatSprite.setScale(0.5); // Appropriate scale for 75x75 frames
        this.maidCatSprite.setDepth(petCatY);
        this.maidCatSprite.setOrigin(0.5, 0.8);

        // Create animations for Pet Cat if not exists
        this.createPetCatAnimations();

        // Play idle animation
        this.maidCatSprite.play("pet-cat-idle-down");

        // Add shadow
        this.maidCatShadow = new DynamicShadow(this, this.maidCatSprite, 0, 2);

        // Add name label above NPC
        this.maidCatLabel = this.add
            .text(petCatX, petCatY - 50, "Pet Cat", {
                fontSize: "14px",
                color: "#fff",
                stroke: "#000",
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(10000);

        // Make NPC interactive
        this.maidCatHitArea = this.add
            .circle(petCatX, petCatY, 30, 0x000000, 0)
            .setInteractive({ useHandCursor: true })
            .setDepth(petCatY - 1);

        // Hover effect
        this.maidCatHitArea.on("pointerover", () => {
            if (this.maidCatSprite) {
                this.maidCatSprite.setTint(0xffcccc);
            }
        });

        this.maidCatHitArea.on("pointerout", () => {
            if (this.maidCatSprite) {
                this.maidCatSprite.clearTint();
            }
        });

        // Click to interact
        this.maidCatHitArea.on("pointerdown", () => {
            this.showToast("Pet Cat is playing! 🐱✨", 0x3498db);
        });

        // Start random movement AI around center area
        this.startNPCRandomMovement(
            this.maidCatSprite,
            this.maidCatShadow,
            this.maidCatLabel,
            this.maidCatHitArea,
            "center",
        );
    }

    private createPetCatAnimations() {
        const charKey = "pet-cat";
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("pet-cat-idle-down")) {
            this.anims.create({
                key: "pet-cat-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("pet-cat-idle-up")) {
            this.anims.create({
                key: "pet-cat-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("pet-cat-idle-left")) {
            this.anims.create({
                key: "pet-cat-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("pet-cat-idle-right")) {
            this.anims.create({
                key: "pet-cat-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("pet-cat-walk-down")) {
            this.anims.create({
                key: "pet-cat-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("pet-cat-walk-up")) {
            this.anims.create({
                key: "pet-cat-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("pet-cat-walk-left")) {
            this.anims.create({
                key: "pet-cat-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("pet-cat-walk-right")) {
            this.anims.create({
                key: "pet-cat-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private createNobitaAnimations() {
        const charKey = "nobita";
        const frameRate = 6;

        // Idle animations (first frame of each row)
        if (!this.anims.exists("nobita-idle-down")) {
            this.anims.create({
                key: "nobita-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("nobita-idle-up")) {
            this.anims.create({
                key: "nobita-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("nobita-idle-left")) {
            this.anims.create({
                key: "nobita-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("nobita-idle-right")) {
            this.anims.create({
                key: "nobita-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("nobita-walk-down")) {
            this.anims.create({
                key: "nobita-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("nobita-walk-up")) {
            this.anims.create({
                key: "nobita-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("nobita-walk-left")) {
            this.anims.create({
                key: "nobita-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("nobita-walk-right")) {
            this.anims.create({
                key: "nobita-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private startNPCRandomMovement(
        npc: Phaser.GameObjects.Sprite,
        shadow: DynamicShadow,
        label: Phaser.GameObjects.Text,
        hitArea: Phaser.GameObjects.Arc,
        movementArea: "center" | "window" = "center",
    ) {
        const speed = 30; // Slower than player
        const moveInterval = 2000; // Change direction every 2 seconds
        const pauseChance = 0.3; // 30% chance to pause

        const directions = ["up", "down", "left", "right", "idle"];
        let currentDirection = "idle";

        // Define movement area bounds
        const centerX = (this.MAP_WIDTH * this.TILE_SIZE) / 2; // 400
        const centerY = (this.MAP_HEIGHT * this.TILE_SIZE) / 2; // 280

        const movementBounds =
            movementArea === "center"
                ? {
                      // Center area (around middle of map with 150px radius)
                      minX: centerX - 150,
                      maxX: centerX + 150,
                      minY: centerY - 100,
                      maxY: centerY + 100,
                  }
                : {
                      // Window area (top-left, kept for compatibility)
                      minX: 80,
                      maxX: 250,
                      minY: 80,
                      maxY: 200,
                  };

        // Get animation prefix based on NPC type
        const animPrefix = npc.texture.key; // "nobita" or "maid-cat"

        // Random movement timer
        this.time.addEvent({
            delay: moveInterval,
            callback: () => {
                // Random chance to pause
                if (Math.random() < pauseChance) {
                    currentDirection = "idle";
                } else {
                    // Pick random direction
                    currentDirection = Phaser.Utils.Array.GetRandom(directions);
                }
            },
            loop: true,
        });

        // Movement update
        this.time.addEvent({
            delay: 16, // ~60fps
            callback: () => {
                // Move based on current direction
                switch (currentDirection) {
                    case "up":
                        npc.y -= speed * 0.016;
                        npc.play(`${animPrefix}-walk-up`, true);
                        break;
                    case "down":
                        npc.y += speed * 0.016;
                        npc.play(`${animPrefix}-walk-down`, true);
                        break;
                    case "left":
                        npc.x -= speed * 0.016;
                        npc.play(`${animPrefix}-walk-left`, true);
                        break;
                    case "right":
                        npc.x += speed * 0.016;
                        npc.play(`${animPrefix}-walk-right`, true);
                        break;
                    case "idle":
                        const lastAnim = npc.anims.currentAnim?.key || "";
                        if (lastAnim.includes("walk")) {
                            // Get direction from animation key
                            // e.g. "maid-cat-walk-down" -> ["maid", "cat", "walk", "down"] -> "down"
                            const parts = lastAnim.split("-");
                            const dir = parts[parts.length - 1]; // Get last part (direction)
                            npc.play(`${animPrefix}-idle-${dir}`, true);
                        }
                        break;
                }

                // Keep NPC within movement bounds
                npc.x = Phaser.Math.Clamp(
                    npc.x,
                    movementBounds.minX,
                    movementBounds.maxX,
                );
                npc.y = Phaser.Math.Clamp(
                    npc.y,
                    movementBounds.minY,
                    movementBounds.maxY,
                );

                // Update label and hitArea position
                label.setPosition(npc.x, npc.y - 50);
                hitArea.setPosition(npc.x, npc.y);

                // Update depth based on Y position
                npc.setDepth(npc.y);
                hitArea.setDepth(npc.y - 1);
            },
            loop: true,
        });
    }

    private showPetSelectionModal() {
        const modalWidth = 450;
        const modalHeight = 500;
        const modalX = this.scale.width / 2;
        const modalY = this.scale.height / 2;

        const isFree = this.luckyBoxOpenCount === 0;
        const cost = isFree ? 0 : this.LUCKY_BOX_COST;

        // Dark overlay
        const overlay = this.add
            .rectangle(
                modalX,
                modalY,
                this.scale.width,
                this.scale.height,
                0x000000,
                0.8,
            )
            .setScrollFactor(0)
            .setDepth(2000)
            .setInteractive();

        // Modal background with gradient
        const modalBg = this.add.rectangle(
            modalX,
            modalY,
            modalWidth,
            modalHeight,
            0x2c1810,
        );
        modalBg.setStrokeStyle(4, 0xffd700);
        modalBg.setScrollFactor(0).setDepth(2001);

        // Inner border
        const innerBorder = this.add.rectangle(
            modalX,
            modalY,
            modalWidth - 20,
            modalHeight - 20,
            0x000000,
            0,
        );
        innerBorder.setStrokeStyle(2, 0xff9800);
        innerBorder.setScrollFactor(0).setDepth(2001);

        // Close button
        const closeBtnX = modalX + modalWidth / 2 - 30;
        const closeBtnY = modalY - modalHeight / 2 + 30;
        const closeBtn = this.add.circle(closeBtnX, closeBtnY, 15, 0xff4444);
        closeBtn.setStrokeStyle(2, 0xffffff);
        closeBtn
            .setScrollFactor(0)
            .setDepth(2002)
            .setInteractive({ useHandCursor: true });

        const closeText = this.add.text(closeBtnX, closeBtnY, "X", {
            fontSize: "16px",
            fontFamily: "PixelFont",
            color: "#FFFFFF",
            resolution: 2,
        });
        closeText
            .setOrigin(0.5)
            .setDepth(2003)
            .setScrollFactor(0)
            .setStroke("#000000", 3);

        // Title
        const title = this.add.text(
            modalX,
            modalY - modalHeight / 2 + 50,
            "✨ LUCKY BOX ✨",
            {
                fontSize: "28px",
                fontFamily: "PixelFont",
                color: "#FFD700",
                resolution: 2,
            },
        );
        title
            .setOrigin(0.5)
            .setDepth(2002)
            .setScrollFactor(0)
            .setStroke("#8B4513", 5);

        // Subtitle
        const subtitle = this.add.text(
            modalX,
            modalY - modalHeight / 2 + 85,
            "Get a Random Pet!",
            {
                fontSize: "14px",
                fontFamily: "PixelFont",
                color: "#FFA500",
                resolution: 2,
            },
        );
        subtitle.setOrigin(0.5).setDepth(2002).setScrollFactor(0);

        // Mystery box
        const boxY = modalY - 30;
        const boxShadow = this.add.rectangle(
            modalX + 5,
            boxY + 5,
            180,
            180,
            0x000000,
            0.3,
        );
        boxShadow.setScrollFactor(0).setDepth(2002);

        const boxBg = this.add.rectangle(modalX, boxY, 180, 180, 0x8b4513);
        boxBg.setStrokeStyle(4, 0x654321);
        boxBg.setScrollFactor(0).setDepth(2002);

        // Decorative corners
        const corners = [
            { x: modalX - 90, y: boxY - 90 },
            { x: modalX + 90, y: boxY - 90 },
            { x: modalX - 90, y: boxY + 90 },
            { x: modalX + 90, y: boxY + 90 },
        ];
        const cornerGraphics: Phaser.GameObjects.Graphics[] = [];
        corners.forEach((corner) => {
            const g = this.add.graphics();
            g.fillStyle(0xffd700, 1);
            g.fillCircle(corner.x, corner.y, 5);
            g.setScrollFactor(0).setDepth(2003);
            cornerGraphics.push(g);
        });

        // Question mark with glow
        const questionGlow = this.add.circle(modalX, boxY, 50, 0xffd700, 0.2);
        questionGlow.setScrollFactor(0).setDepth(2002);

        const questionMark = this.add.text(modalX, boxY, "?", {
            fontSize: "80px",
            fontFamily: "PixelFont",
            color: "#FFFFFF",
            resolution: 2,
        });
        questionMark
            .setOrigin(0.5)
            .setDepth(2003)
            .setScrollFactor(0)
            .setStroke("#FFD700", 6);

        // Pulsing animations
        this.tweens.add({
            targets: [questionMark, questionGlow],
            scale: 1.15,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });

        this.tweens.add({
            targets: questionGlow,
            alpha: 0.4,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });

        // Pet icons preview
        const previewY = modalY + 100;
        const petIcons = ["🐱", "🦖", "🐉", "🦁", "✨"];
        const iconSpacing = 60;
        const startX = modalX - ((petIcons.length - 1) * iconSpacing) / 2;
        const iconTexts: Phaser.GameObjects.Text[] = [];
        petIcons.forEach((icon, i) => {
            const iconText = this.add.text(
                startX + i * iconSpacing,
                previewY,
                icon,
                {
                    fontSize: "24px",
                    resolution: 2,
                },
            );
            iconText
                .setOrigin(0.5)
                .setDepth(2002)
                .setScrollFactor(0)
                .setAlpha(0.6);
            iconTexts.push(iconText);

            this.tweens.add({
                targets: iconText,
                y: previewY - 5,
                duration: 1000 + i * 200,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
            });
        });

        // OPEN button
        const btnY = modalY + modalHeight / 2 - 80;
        const btnWidth = 250;
        const btnHeight = 60;

        const btnShadow = this.add.rectangle(
            modalX + 3,
            btnY + 3,
            btnWidth,
            btnHeight,
            0x000000,
            0.4,
        );
        btnShadow.setScrollFactor(0).setDepth(2002);

        const openBtn = this.add.rectangle(
            modalX,
            btnY,
            btnWidth,
            btnHeight,
            isFree ? 0x4caf50 : 0xff9800,
        );
        openBtn.setStrokeStyle(4, isFree ? 0x66bb6a : 0xffb74d);
        openBtn
            .setScrollFactor(0)
            .setDepth(2002)
            .setInteractive({ useHandCursor: true });

        const openBtnText = this.add.text(modalX, btnY - 8, "OPEN NOW!", {
            fontSize: "20px",
            fontFamily: "PixelFont",
            color: "#FFFFFF",
            resolution: 2,
        });
        openBtnText
            .setOrigin(0.5)
            .setDepth(2003)
            .setScrollFactor(0)
            .setStroke("#000000", 4);

        const costText = isFree ? "✨ FREE ✨" : `💰 ${cost} Gold`;
        const costColor = isFree ? "#FFD700" : "#FFFFFF";
        const openBtnCost = this.add.text(modalX, btnY + 15, costText, {
            fontSize: "16px",
            fontFamily: "PixelFont",
            color: costColor,
            resolution: 2,
        });
        openBtnCost
            .setOrigin(0.5)
            .setDepth(2003)
            .setScrollFactor(0)
            .setStroke("#000000", 3);

        // Info text
        const infoText = this.add.text(
            modalX,
            modalY + modalHeight / 2 - 30,
            isFree ? "🎁 First open is FREE!" : "Each open costs 100 Gold",
            {
                fontSize: "12px",
                fontFamily: "PixelFont",
                color: "#CCCCCC",
                align: "center",
                resolution: 2,
            },
        );
        infoText.setOrigin(0.5).setDepth(2002).setScrollFactor(0);

        const modalElements: Phaser.GameObjects.GameObject[] = [
            overlay,
            modalBg,
            innerBorder,
            closeBtn,
            closeText,
            title,
            subtitle,
            boxShadow,
            boxBg,
            ...cornerGraphics,
            questionGlow,
            questionMark,
            ...iconTexts,
            btnShadow,
            openBtn,
            openBtnText,
            openBtnCost,
            infoText,
        ];

        const closeModal = () => {
            modalElements.forEach((el) => el.destroy());
        };

        closeBtn.on("pointerdown", closeModal);
        overlay.on("pointerdown", closeModal);
        closeBtn.on("pointerover", () => {
            closeBtn.setFillStyle(0xff6666);
            closeBtn.setScale(1.1);
        });
        closeBtn.on("pointerout", () => {
            closeBtn.setFillStyle(0xff4444);
            closeBtn.setScale(1.0);
        });

        openBtn.on("pointerover", () => {
            openBtn.setScale(1.05);
            openBtnText.setScale(1.05);
            openBtnCost.setScale(1.05);
            btnShadow.setScale(1.05);
        });
        openBtn.on("pointerout", () => {
            openBtn.setScale(1.0);
            openBtnText.setScale(1.0);
            openBtnCost.setScale(1.0);
            btnShadow.setScale(1.0);
        });
        openBtn.on("pointerdown", () => {
            this.openLuckyBox();
            closeModal();
        });

        this.cameras.main.ignore(modalElements);
    }

    /**
     * Open lucky box and spawn random pet
     */
    private openLuckyBox() {
        // Check if pet already spawned
        if (this.maidCatSpawned) {
            this.showToast("Pet already adopted! 🐱", 0xe74c3c);
            return;
        }

        // Check cost
        const isFree = this.luckyBoxOpenCount === 0;
        const cost = isFree ? 0 : this.LUCKY_BOX_COST;

        // Check if player has enough gold (if not free)
        if (!isFree) {
            const gameState = useGameState(this);
            const currentGold = gameState.getGold();

            if (currentGold < cost) {
                this.showToast(`Not enough gold! Need ${cost} 💰`, 0xe74c3c);
                return;
            }

            // Deduct gold from game state
            const newGold = currentGold - cost;
            gameState.setGold(newGold);

            // Emit event to update UI
            EventBus.emit("currency-updated", { gold: newGold });

            this.showToast(`-${cost} Gold`, 0xff9800);
        }

        // Increment open count
        this.luckyBoxOpenCount++;

        // Random pet selection
        const pets = ["npc-maidcat", "pet-cat"];
        const randomIndex = Math.floor(Math.random() * pets.length);
        const randomPet = pets[randomIndex];

        // Spawn pet based on selection
        if (randomPet === "npc-maidcat") {
            this.createMaidCatNPC();
            this.maidCatSpawned = true;
            this.showToast(`🎉 You got Maid Cat!`, 0x9b59b6);
        } else if (randomPet === "pet-cat") {
            this.createPetCatNPC();
            this.maidCatSpawned = true;
            this.showToast(`🎉 You got Pet Cat!`, 0x3498db);
        }
    }

    private createMaidCatAnimations() {
        const charKey = "npc-maidcat"; // Changed from "maid-cat"
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("npc-maidcat-idle-down")) {
            this.anims.create({
                key: "npc-maidcat-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("npc-maidcat-idle-up")) {
            this.anims.create({
                key: "npc-maidcat-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("npc-maidcat-idle-left")) {
            this.anims.create({
                key: "npc-maidcat-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("npc-maidcat-idle-right")) {
            this.anims.create({
                key: "npc-maidcat-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("npc-maidcat-walk-down")) {
            this.anims.create({
                key: "npc-maidcat-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("npc-maidcat-walk-up")) {
            this.anims.create({
                key: "npc-maidcat-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("npc-maidcat-walk-left")) {
            this.anims.create({
                key: "npc-maidcat-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("npc-maidcat-walk-right")) {
            this.anims.create({
                key: "npc-maidcat-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private loadPets() {
        const pets = this.petFarmManager.loadPets();
        pets.forEach((pet) => {
            this.createPetSprite(pet);
            const emptyText = this.children.getByName(
                `empty_${pet.slotIndex}`,
            ) as Phaser.GameObjects.Text;
            if (emptyText) emptyText.setVisible(false);
        });
    }

    private createPetSprite(pet: PetStats) {
        const zone = this.PET_ZONES[pet.slotIndex];
        if (!zone) return;

        const spriteKey = this.petFarmManager.getPetSpriteKey(pet);
        const scale = this.petFarmManager.getPetScale(pet);

        const sprite = this.add.sprite(zone.x, zone.y, spriteKey);
        sprite.setScale(scale);
        sprite.setInteractive();

        const shadow = new DynamicShadow(this, sprite, 0, 2);

        this.petSprites.set(pet.slotIndex, sprite);
        this.petShadows.set(pet.slotIndex, shadow);

        this.uiCamera.ignore([sprite, shadow]);

        // Bounce animation
        this.tweens.add({
            targets: sprite,
            y: zone.y - 5,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });
    }

    private onZoneClick(slotIndex: number) {
        const pet = this.petFarmManager.getPet(slotIndex);
        if (!pet) {
            this.showAdoptMenu(slotIndex);
        } else {
            this.showPetDetails(slotIndex);
        }
    }

    private showAdoptMenu(slotIndex: number) {
        const modal = this.createModal("Adopt a Pet", 400, 300);

        const petTypes = [
            { type: "cat" as const, emoji: "🐱", name: "Cat" },
            { type: "dino" as const, emoji: "🦕", name: "Dino" },
            { type: "dragon" as const, emoji: "🐉", name: "Dragon" },
            { type: "lion" as const, emoji: "🦁", name: "Lion" },
        ];

        petTypes.forEach((petType, index) => {
            const btn = this.add
                .text(
                    this.scale.width / 2 - 80 + (index % 2) * 160,
                    this.scale.height / 2 - 50 + Math.floor(index / 2) * 60,
                    `${petType.emoji}\n${petType.name}`,
                    {
                        fontSize: "16px",
                        color: "#fff",
                        backgroundColor: "#3498DB",
                        padding: { x: 20, y: 10 },
                        align: "center",
                    },
                )
                .setOrigin(0.5)
                .setInteractive()
                .setScrollFactor(0);

            btn.on("pointerdown", () => {
                const name = `My ${petType.name}`;
                this.petFarmManager.adoptPet(slotIndex, petType.type, name);

                const pet = this.petFarmManager.getPet(slotIndex)!;
                this.createPetSprite(pet);

                const emptyText = this.children.getByName(
                    `empty_${slotIndex}`,
                ) as Phaser.GameObjects.Text;
                if (emptyText) emptyText.setVisible(false);

                this.closeModal(modal);
            });

            modal.add(btn);
        });

        this.petDetailModal = modal;
    }

    private showPetDetails(slotIndex: number) {
        const pet = this.petFarmManager.getPet(slotIndex);
        if (!pet) return;

        const modal = this.createModal(`${pet.name} (${pet.stage})`, 400, 350);

        const statsText = this.add
            .text(
                this.scale.width / 2,
                this.scale.height / 2 - 80,
                `Level: ${pet.level} | XP: ${pet.xp}/100\n\n` +
                    `🍖 Hunger: ${Math.round(pet.hunger)}/100\n` +
                    `😊 Happiness: ${Math.round(pet.happiness)}/100\n` +
                    `⚡ Energy: ${Math.round(pet.energy)}/100`,
                {
                    fontSize: "14px",
                    color: "#fff",
                    align: "center",
                },
            )
            .setOrigin(0.5)
            .setScrollFactor(0);

        const feedBtn = this.add
            .text(
                this.scale.width / 2 - 80,
                this.scale.height / 2 + 40,
                "🍄 Feed\nMushroom",
                {
                    fontSize: "14px",
                    color: "#fff",
                    backgroundColor: "#27AE60",
                    padding: { x: 15, y: 10 },
                    align: "center",
                },
            )
            .setOrigin(0.5)
            .setInteractive()
            .setScrollFactor(0);

        feedBtn.on("pointerdown", () => {
            if (this.mushroomCount > 0) {
                this.petFarmManager.feedPet(slotIndex, "mushroom");
                this.mushroomCount--;
                this.updateInventory();
                this.closeModal(modal);
            } else {
                this.showToast("No mushrooms!", 0xe74c3c);
            }
        });

        const playBtn = this.add
            .text(
                this.scale.width / 2 + 80,
                this.scale.height / 2 + 40,
                "🎮 Play\nGame",
                {
                    fontSize: "14px",
                    color: "#fff",
                    backgroundColor: "#3498DB",
                    padding: { x: 15, y: 10 },
                    align: "center",
                },
            )
            .setOrigin(0.5)
            .setInteractive()
            .setScrollFactor(0);

        playBtn.on("pointerdown", () => {
            this.playWithPet(slotIndex);
            this.closeModal(modal);
        });

        modal.add([statsText, feedBtn, playBtn]);
        this.petDetailModal = modal;
    }

    private playWithPet(slotIndex: number) {
        this.petFarmManager.playWithPet(slotIndex);
    }

    private createModal(
        title: string,
        width: number,
        height: number,
    ): Phaser.GameObjects.Container {
        const modal = this.add.container(0, 0);

        const overlay = this.add
            .rectangle(
                this.scale.width / 2,
                this.scale.height / 2,
                this.scale.width,
                this.scale.height,
                0x000000,
                0.7,
            )
            .setInteractive()
            .setScrollFactor(0);

        const bg = this.add
            .rectangle(
                this.scale.width / 2,
                this.scale.height / 2,
                width,
                height,
                0x2c3e50,
            )
            .setScrollFactor(0);

        const titleText = this.add
            .text(
                this.scale.width / 2,
                this.scale.height / 2 - height / 2 + 30,
                title,
                {
                    fontSize: "20px",
                    color: "#ECF0F1",
                    fontStyle: "bold",
                },
            )
            .setOrigin(0.5)
            .setScrollFactor(0);

        const closeBtn = this.add
            .text(
                this.scale.width / 2,
                this.scale.height / 2 + height / 2 - 30,
                "Close",
                {
                    fontSize: "14px",
                    color: "#fff",
                    backgroundColor: "#E74C3C",
                    padding: { x: 20, y: 8 },
                },
            )
            .setOrigin(0.5)
            .setInteractive()
            .setScrollFactor(0);

        closeBtn.on("pointerdown", () => this.closeModal(modal));

        modal.add([overlay, bg, titleText, closeBtn]);
        return modal;
    }

    private closeModal(modal: Phaser.GameObjects.Container) {
        modal.destroy();
        this.petDetailModal = null;
    }

    private refreshUI() {
        // Refresh pet stats if needed
    }

    private updateInventory() {
        const mushroomText = this.children.getByName(
            "mushroomText",
        ) as Phaser.GameObjects.Text;
        const fruitText = this.children.getByName(
            "fruitText",
        ) as Phaser.GameObjects.Text;

        if (mushroomText) mushroomText.setText(`🍄 ${this.mushroomCount}`);
        if (fruitText) fruitText.setText(`🍎 ${this.fruitCount}`);
    }

    private showToast(text: string, color: number) {
        const toast = this.add
            .text(this.scale.width / 2, this.scale.height - 50, text, {
                fontSize: "16px",
                color: "#fff",
                backgroundColor: `#${color.toString(16)}`,
                padding: { x: 15, y: 8 },
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(1000);

        this.tweens.add({
            targets: toast,
            alpha: 0,
            y: this.scale.height - 100,
            duration: 2000,
            onComplete: () => toast.destroy(),
        });
    }

    private setupCameraIgnore() {
        // Get all game objects (non-UI)
        const gameObjects: Phaser.GameObjects.GameObject[] = [];

        // Collect all children that should be ignored by UI camera
        this.children.each((child) => {
            // Only ignore objects with scrollFactor !== 0 (game world objects)
            if (child instanceof Phaser.GameObjects.GameObject) {
                const scrollFactorX = (child as any).scrollFactorX;
                if (scrollFactorX === undefined || scrollFactorX !== 0) {
                    gameObjects.push(child);
                }
            }
        });

        // Make UI camera ignore all game world objects
        if (gameObjects.length > 0) {
            this.uiCamera.ignore(gameObjects);
        }
    }

    private setupDebugHelpers() {
        // Debug helpers removed - coordinate display disabled
        // Can be re-enabled for debugging by uncommenting below:
        /*
        // Click anywhere to see world coordinates in console
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            const worldX = Math.round(pointer.worldX);
            const worldY = Math.round(pointer.worldY);
            console.log(`🎯 Clicked at: x=${worldX}, y=${worldY}`);
        });
        */
    }

    update() {
        const speed = 100;
        let isMoving = false;

        // Horizontal movement
        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-speed);
            this.player.play("walk-left", true);
            isMoving = true;
        } else if (this.cursors.right.isDown) {
            this.player.setVelocityX(speed);
            this.player.play("walk-right", true);
            isMoving = true;
        } else {
            this.player.setVelocityX(0);
        }

        // Vertical movement
        if (this.cursors.up.isDown) {
            this.player.setVelocityY(-speed);
            if (!isMoving) {
                this.player.play("walk-up", true);
            }
            isMoving = true;
        } else if (this.cursors.down.isDown) {
            this.player.setVelocityY(speed);
            if (!isMoving) {
                this.player.play("walk-down", true);
            }
            isMoving = true;
        } else {
            this.player.setVelocityY(0);
        }

        // Play idle animation when not moving
        if (!isMoving) {
            const currentAnim = this.player.anims.currentAnim?.key || "";
            if (currentAnim.includes("walk")) {
                const direction = currentAnim.split("-")[1];
                this.player.play(`idle-${direction}`, true);
            }
        }

        // Update depth based on Y position
        this.player.setDepth(this.player.y);
    }
}

