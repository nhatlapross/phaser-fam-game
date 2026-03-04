import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { DynamicShadow } from "../objects/DynamicShadow";
import { PetFarmManager, PetStats } from "../managers/PetFarmManager";
import { GameDataService } from "../GameDataService";
import { UserService } from "../UserService";
import { PLAYABLE_CHARACTERS } from "../config/CharacterConfig";
import { GAME_CONSTANTS, StationManager } from "../managers";
import { AnywhereDoorManager } from "../managers/AnywhereDoorManager";

/**
 * PetFarm Scene - Cyber-Home Map
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
    private readonly LUCKY_BOX_COST = 9999; // Gold cost for second pet (first is free)
    private spawnedPet: Phaser.GameObjects.Sprite | null = null; // Track single spawned pet
    private spawnedPetShadow: DynamicShadow | null = null; // Track pet shadow
    private spawnedPetLabel: Phaser.GameObjects.Text | null = null; // Track pet label
    private spawnedPetHitArea: Phaser.GameObjects.Arc | null = null; // Track pet hit area

    // Station manager for travel
    private stationManager!: StationManager;

    // Anywhere Door manager for cross-chain bridge
    private anywhereDoorManager!: AnywhereDoorManager;

    // Anywhere Door objects for show/hide
    private anywhereDoorImage: Phaser.GameObjects.Image | null = null;
    private anywhereDoorGlow: Phaser.GameObjects.Arc | null = null;
    private anywhereDoorParticles: Phaser.GameObjects.Particles.ParticleEmitter | null =
        null;
    private anywhereDoorLabel: Phaser.GameObjects.Text | null = null;
    private anywhereDoorHitArea: Phaser.GameObjects.Arc | null = null;

    // Collision walls group
    private walls!: Phaser.Physics.Arcade.StaticGroup;

    // Exit trigger flag
    private exitTriggered: boolean = false;

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

        // Clean up spawned pet and related objects
        if (this.spawnedPet && this.spawnedPet.scene) {
            this.spawnedPet.destroy();
            this.spawnedPet = null;
        }
        if (this.spawnedPetShadow) {
            this.spawnedPetShadow.destroy();
            this.spawnedPetShadow = null;
        }
        if (this.spawnedPetLabel) {
            this.spawnedPetLabel.destroy();
            this.spawnedPetLabel = null;
        }
        if (this.spawnedPetHitArea) {
            this.spawnedPetHitArea.destroy();
            this.spawnedPetHitArea = null;
        }
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

        // Create collision boundaries for room furniture/walls
        this.createCollisionBounds();
    }

    /**
     * Create invisible collision walls for room boundaries.
     * These prevent the player from walking over furniture and walls.
     * Coordinates are based on the 800x560 world (50x35 tiles at 16px).
     */
    private createCollisionBounds() {
        this.walls = this.physics.add.staticGroup();

        // Helper: addWall(centerX, centerY, width, height)
        const addWall = (x: number, y: number, w: number, h: number) => {
            const wall = this.add.rectangle(x, y, w, h, 0xff0000, 0);
            this.physics.add.existing(wall, true);
            this.walls.add(wall);
        };

        // Wall 1: Left bookshelf
        addWall(132, 180, 215, 360);

        // Wall 2: Left bookshelf edge
        addWall(270, 188, 60, 375);

        // Wall 3: Wardrobe diagonal edge - staircase approximation
        addWall(308, 338, 16, 18);
        addWall(319, 324, 16, 18);
        addWall(330, 310, 16, 18);
        addWall(341, 296, 16, 18);

        // Wall 4: Wardrobe top section
        addWall(407, 145, 95, 290);

        // Wall 5: Center upper furniture
        addWall(545, 175, 170, 350);

        // Wall 6: Right-center column
        addWall(660, 162, 60, 325);

        // Wall 7: Desk diagonal edge - staircase approximation
        addWall(698, 340, 16, 30);
        addWall(708, 370, 16, 30);
        addWall(718, 400, 16, 30);
        addWall(728, 430, 16, 30);

        // Wall 8: Desk lower diagonal
        addWall(733, 458, 14, 25);
        addWall(738, 483, 14, 25);

        // Wall 9: Bottom-right furniture
        addWall(747, 525, 105, 60);

        // Wall 10: Left edge boundary
        addWall(12, 280, 25, 560);
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

        // Set smaller physics body at feet for natural collision
        const bodyW = 24;
        const bodyH = 16;
        this.player.body!.setSize(bodyW, bodyH);
        this.player.body!.setOffset(
            (this.player.width - bodyW) / 2,
            this.player.height * GAME_CONSTANTS.CHARACTER_ORIGIN_Y - bodyH,
        );

        // Add collision with room walls/furniture
        this.physics.add.collider(this.player, this.walls);

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
                currentLocationId: "cyberhome",
            },
        );
        // Don't call stationManager.create() - we only want the modal functionality

        // Initialize Anywhere Door Manager
        this.anywhereDoorManager = new AnywhereDoorManager(this);

        // Create exit door (now opens Anywhere Door bridge modal)
        this.createExitDoor();
    }

    private createExitDoor() {
        // Position at bottom center (below the wardrobe/furniture)
        const centerX = (this.MAP_WIDTH * this.TILE_SIZE) / 2; // 400
        const exitX = centerX - 250; // Left side
        const exitY = this.MAP_HEIGHT * this.TILE_SIZE - 20; // Near bottom

        // Create door image (vertical orientation) - keep original pink color
        this.anywhereDoorImage = this.add.image(exitX, exitY, "exit-door");
        this.anywhereDoorImage.setScale(0.5); // Smaller scale for better fit
        this.anywhereDoorImage.setDepth(exitY);
        this.anywhereDoorImage.setOrigin(0.5, 0.8); // Same origin as characters
        this.anywhereDoorImage.setAngle(-55); // Rotate to make it vertical
        // No tint - keep original pink color

        // Add pulsing glow effect (golden/yellow)
        this.anywhereDoorGlow = this.add.circle(
            exitX,
            exitY,
            20,
            0xffd700,
            0.3,
        );
        this.anywhereDoorGlow.setDepth(exitY - 1);

        this.tweens.add({
            targets: this.anywhereDoorGlow,
            alpha: 0.1,
            scale: 1.3,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });

        // Add sparkle particles
        this.anywhereDoorParticles = this.add.particles(exitX, exitY, "star", {
            speed: { min: 10, max: 30 },
            scale: { start: 0.3, end: 0 },
            alpha: { start: 0.8, end: 0 },
            lifespan: 1000,
            frequency: 200,
            quantity: 1,
            blendMode: "ADD",
        });
        this.anywhereDoorParticles.setDepth(exitY + 1);

        // Add label
        this.anywhereDoorLabel = this.add
            .text(exitX, exitY - 60, "Anywhere Door", {
                fontSize: "14px",
                color: "#ffd700",
                stroke: "#000",
                strokeThickness: 3,
                fontFamily: "PixelFont",
            })
            .setOrigin(0.5)
            .setDepth(10000);

        // Make interactive
        this.anywhereDoorHitArea = this.add.circle(
            exitX,
            exitY,
            30,
            0x000000,
            0,
        );
        this.anywhereDoorHitArea.setInteractive({ useHandCursor: true });
        this.anywhereDoorHitArea.setDepth(exitY - 1);

        // Hover effect
        this.anywhereDoorHitArea.on("pointerover", () => {
            if (this.anywhereDoorImage) {
                this.anywhereDoorImage.setTint(0xffff99); // Light yellow tint on hover
                this.anywhereDoorImage.setScale(0.55);
            }
            if (this.anywhereDoorGlow) {
                this.anywhereDoorGlow.setFillStyle(0xffd700, 0.6);
            }
            if (this.anywhereDoorLabel) {
                this.anywhereDoorLabel.setScale(1.1);
            }
        });

        this.anywhereDoorHitArea.on("pointerout", () => {
            if (this.anywhereDoorImage) {
                this.anywhereDoorImage.clearTint(); // Remove tint to show original pink
                this.anywhereDoorImage.setScale(0.5);
            }
            if (this.anywhereDoorGlow) {
                this.anywhereDoorGlow.setFillStyle(0xffd700, 0.3);
            }
            if (this.anywhereDoorLabel) {
                this.anywhereDoorLabel.setScale(1.0);
            }
        });

        // Click to open Anywhere Door bridge modal
        this.anywhereDoorHitArea.on("pointerdown", () => {
            this.openAnywhereDoor();
        });
    }

    /**
     * Open Anywhere Door modal and hide door objects
     */
    private openAnywhereDoor() {
        // Hide door objects
        if (this.anywhereDoorImage) this.anywhereDoorImage.setVisible(false);
        if (this.anywhereDoorGlow) this.anywhereDoorGlow.setVisible(false);
        if (this.anywhereDoorParticles)
            this.anywhereDoorParticles.setVisible(false);
        if (this.anywhereDoorLabel) this.anywhereDoorLabel.setVisible(false);
        if (this.anywhereDoorHitArea)
            this.anywhereDoorHitArea.setVisible(false);

        // Open modal
        this.anywhereDoorManager.open();

        // Listen for modal close to show door again
        this.time.delayedCall(100, () => {
            this.checkAnywhereDoorModalClosed();
        });
    }

    /**
     * Check if modal is closed and show door again
     */
    private checkAnywhereDoorModalClosed() {
        // Check if modal is still open
        const modalStillOpen = (this.anywhereDoorManager as any).modal !== null;

        if (modalStillOpen) {
            // Check again after 100ms
            this.time.delayedCall(100, () => {
                this.checkAnywhereDoorModalClosed();
            });
        } else {
            // Modal closed, show door again
            if (this.anywhereDoorImage) this.anywhereDoorImage.setVisible(true);
            if (this.anywhereDoorGlow) this.anywhereDoorGlow.setVisible(true);
            if (this.anywhereDoorParticles)
                this.anywhereDoorParticles.setVisible(true);
            if (this.anywhereDoorLabel) this.anywhereDoorLabel.setVisible(true);
            if (this.anywhereDoorHitArea)
                this.anywhereDoorHitArea.setVisible(true);
        }
    }

    private createPetShopNPC() {
        // Position NPC in walkable floor area
        const npcX = 500;
        const npcY = 420;

        // Create NPC sprite (Nobita - pet shop keeper)
        const npc = this.add.sprite(npcX, npcY, "nobita", 0);
        npc.setScale(0.35); // Similar size to player
        npc.setDepth(npcY);
        npc.setOrigin(0.5, 0.8); // Bottom-center origin for proper depth sorting

        // Create animations for Nobita if not exists
        this.createNobitaAnimations();

        // Play idle animation
        npc.play("nobita-idle-down");

        // Add shadow
        const npcShadow = new DynamicShadow(this, npc, 0, 2);

        // Add name label above NPC (no background, no icon)
        const nameLabel = this.add
            .text(npcX, npcY - 50, "Nobita", {
                fontSize: "14px",
                color: "#fff",
                stroke: "#000",
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(10000);

        // Make NPC interactive
        const hitArea = this.add
            .circle(npcX, npcY, 30, 0x000000, 0)
            .setInteractive({ useHandCursor: true })
            .setDepth(npcY - 1);

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

        // Position Maid Cat in walkable floor area
        const maidCatX = 580;
        const maidCatY = 440;

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

        // Make UI camera ignore these game world objects
        this.uiCamera.ignore([
            this.maidCatSprite,
            this.maidCatShadow!,
            this.maidCatLabel,
            this.maidCatHitArea,
        ]);
    }

    // Commented out - Not used (animal character)
    // private createPetCatNPC() { ... }

    // Commented out - Animal characters (not used, only cosplay characters)
    // private createPetCatAnimations() { ... }
    // private createPetDinoAnimations() { ... }
    // private createPetDragonAnimations() { ... }
    // private createPetLionAnimations() { ... }

    // Uncomment when penguin.png is added:
    // private createPetPenguinAnimations() {
    //     const charKey = "pet-penguin";
    //     const frameRate = 6;
    //
    //     // Idle animations
    //     if (!this.anims.exists("pet-penguin-idle-down")) {
    //         this.anims.create({
    //             key: "pet-penguin-idle-down",
    //             frames: [{ key: charKey, frame: 0 }],
    //             frameRate: 1,
    //         });
    //     }
    //
    //     if (!this.anims.exists("pet-penguin-idle-up")) {
    //         this.anims.create({
    //             key: "pet-penguin-idle-up",
    //             frames: [{ key: charKey, frame: 4 }],
    //             frameRate: 1,
    //         });
    //     }
    //
    //     if (!this.anims.exists("pet-penguin-idle-left")) {
    //         this.anims.create({
    //             key: "pet-penguin-idle-left",
    //             frames: [{ key: charKey, frame: 8 }],
    //             frameRate: 1,
    //         });
    //     }
    //
    //     if (!this.anims.exists("pet-penguin-idle-right")) {
    //         this.anims.create({
    //             key: "pet-penguin-idle-right",
    //             frames: [{ key: charKey, frame: 12 }],
    //             frameRate: 1,
    //         });
    //     }
    //
    //     // Walk animations
    //     if (!this.anims.exists("pet-penguin-walk-down")) {
    //         this.anims.create({
    //             key: "pet-penguin-walk-down",
    //             frames: this.anims.generateFrameNumbers(charKey, {
    //                 start: 0,
    //                 end: 3,
    //             }),
    //             frameRate: frameRate,
    //             repeat: -1,
    //         });
    //     }
    //
    //     if (!this.anims.exists("pet-penguin-walk-up")) {
    //         this.anims.create({
    //             key: "pet-penguin-walk-up",
    //             frames: this.anims.generateFrameNumbers(charKey, {
    //                 start: 4,
    //                 end: 7,
    //             }),
    //             frameRate: frameRate,
    //             repeat: -1,
    //         });
    //     }
    //
    //     if (!this.anims.exists("pet-penguin-walk-left")) {
    //         this.anims.create({
    //             key: "pet-penguin-walk-left",
    //             frames: this.anims.generateFrameNumbers(charKey, {
    //                 start: 8,
    //                 end: 11,
    //             }),
    //             frameRate: frameRate,
    //             repeat: -1,
    //         });
    //     }
    //
    //     if (!this.anims.exists("pet-penguin-walk-right")) {
    //         this.anims.create({
    //             key: "pet-penguin-walk-right",
    //             frames: this.anims.generateFrameNumbers(charKey, {
    //                 start: 12,
    //                 end: 15,
    //             }),
    //             frameRate: frameRate,
    //             repeat: -1,
    //         });
    //     }
    // }

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
                      // Walkable floor area (between collision walls)
                      minX: 310,
                      maxX: 680,
                      minY: 360,
                      maxY: 490,
                  }
                : {
                      // Window area (top-left, kept for compatibility)
                      minX: 80,
                      maxX: 250,
                      minY: 80,
                      maxY: 200,
                  };

        // Get animation prefix based on NPC type
        const textureKey = npc.texture.key;
        let animPrefix = textureKey;

        // Map texture keys to animation prefixes
        if (textureKey === "npc-maidcat") {
            animPrefix = "npc-maidcat";
        } else if (textureKey === "kungfu-master") {
            animPrefix = "kungfu-master";
        } else if (textureKey === "cowboy") {
            animPrefix = "cowboy";
        } else if (textureKey === "explorer") {
            animPrefix = "explorer";
        } else if (textureKey === "bullfighter") {
            animPrefix = "bullfighter";
        } else if (textureKey === "soccer-player") {
            animPrefix = "soccer-player";
        } else if (textureKey === "ninja") {
            animPrefix = "ninja";
        } else if (textureKey === "nurse") {
            animPrefix = "nurse";
        } else if (textureKey === "nobita") {
            animPrefix = "nobita";
        }
        // Commented out - Animal characters
        // } else if (textureKey === "pet-cat") {
        //     animPrefix = "pet-cat";
        // } else if (textureKey === "pet-dino") {
        //     animPrefix = "pet-dino";
        // } else if (textureKey === "pet-dragon") {
        //     animPrefix = "pet-dragon";
        // } else if (textureKey === "pet-lion") {
        //     animPrefix = "pet-lion";

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
            isFree
                ? "🎁 First open is FREE!"
                : `Replace your pet for ${cost} Gold`,
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
        openBtn.on("pointerdown", async () => {
            // Gold check for second pet onwards
            if (!isFree) {
                // Get current gold from GameDataService
                const cachedData = GameDataService.getCachedData();
                const currentGold = cachedData?.user?.gold || 0;

                if (currentGold < cost) {
                    this.showToast(
                        `Not enough gold! Need ${cost} 💰`,
                        0xe74c3c,
                    );
                    return;
                }

                // Deduct gold (you'll need to implement this in your backend)
                // For now, just show a message
                console.log(`💰 Deducting ${cost} gold for new pet`);
            }

            // Clean up old pet before spawning new one
            if (this.spawnedPet) {
                this.spawnedPet.destroy();
                this.spawnedPet = null;
            }
            if (this.spawnedPetShadow) {
                this.spawnedPetShadow.destroy();
                this.spawnedPetShadow = null;
            }
            if (this.spawnedPetLabel) {
                this.spawnedPetLabel.destroy();
                this.spawnedPetLabel = null;
            }
            if (this.spawnedPetHitArea) {
                this.spawnedPetHitArea.destroy();
                this.spawnedPetHitArea = null;
            }

            closeModal();

            // Show loading toast
            this.showToast("⏳ Minting pet NFT...", 0xffa500);

            // Call smart contract to mint pet NFT
            const { CyberCatService } = await import("../CyberCatService");

            // Random pet type for Lucky Box
            const petTypes = [
                "kungfu-master",
                "cowboy",
                "explorer",
                "bullfighter",
                "soccer-player",
                "ninja",
                "nurse",
                "npc-maidcat",
            ];
            const randomPetType = Phaser.Utils.Array.GetRandom(petTypes);

            const result = await CyberCatService.mintPet(randomPetType);

            if (result.success) {
                this.showToast("✅ Pet NFT minted!", 0x4caf50);
                console.log("🎉 Pet NFT minted:", result);

                // Increment counter and spawn pet
                this.luckyBoxOpenCount++;
                this.openLuckyBox();
            } else {
                this.showToast(`❌ Mint failed: ${result.error}`, 0xe74c3c);
                console.error("❌ Mint failed:", result.error);
            }
        });

        this.cameras.main.ignore(modalElements);
    }

    /**
     * Show naming modal for new pet
     */
    private showNamingModal(petType: string) {
        const modalWidth = 400;
        const modalHeight = 300;
        const modalX = this.scale.width / 2;
        const modalY = this.scale.height / 2;

        // Get pet display name
        const petDisplayNames: { [key: string]: string } = {
            "npc-maidcat": "Maid Cat",
            "kungfu-master": "Kungfu Master",
            cowboy: "Cowboy",
            explorer: "Explorer",
            bullfighter: "Bullfighter",
            "soccer-player": "Soccer Player",
            ninja: "Ninja",
            nurse: "Nurse",
        };
        const petDisplayName = petDisplayNames[petType] || "Pet";

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
            .setDepth(3000)
            .setInteractive();

        // Modal background
        const modalBg = this.add.rectangle(
            modalX,
            modalY,
            modalWidth,
            modalHeight,
            0x2c3e50,
        );
        modalBg.setStrokeStyle(4, 0x3498db);
        modalBg.setScrollFactor(0).setDepth(3001);

        // Title
        const title = this.add.text(
            modalX,
            modalY - modalHeight / 2 + 30,
            `🎉 You got ${petDisplayName}!`,
            {
                fontSize: "24px",
                fontFamily: "PixelFont",
                color: "#FFD700",
                resolution: 2,
            },
        );
        title
            .setOrigin(0.5)
            .setDepth(3002)
            .setScrollFactor(0)
            .setStroke("#000000", 4);

        // Instruction text (moved up more)
        const instruction = this.add.text(
            modalX,
            modalY - 100,
            "Name your companion:",
            {
                fontSize: "16px",
                fontFamily: "PixelFont",
                color: "#FFFFFF",
                resolution: 2,
            },
        );
        instruction.setOrigin(0.5).setDepth(3002).setScrollFactor(0);

        // Add pet sprite preview (moved up)
        const petSprite = this.add.sprite(modalX, modalY - 40, petType, 0);
        petSprite.setScale(0.4); // Adjusted scale for cosplay characters (500x500 spritesheet)
        petSprite.setDepth(3002);
        petSprite.setScrollFactor(0);

        // Play idle animation
        const animKey = `${petType}-idle-down`;
        if (this.anims.exists(animKey)) {
            petSprite.play(animKey);
        }

        // Create HTML input element (no background needed, HTML input has its own)
        const inputElement = document.createElement("input");
        inputElement.type = "text";
        inputElement.maxLength = 20;
        inputElement.value = petDisplayName; // Pre-fill with default name
        inputElement.style.position = "fixed";

        // Calculate position - center of screen
        const canvas = this.game.canvas;
        const rect = canvas.getBoundingClientRect();

        // Center horizontally, position below pet sprite
        const inputWidth = 300;
        const inputHeight = 50;
        inputElement.style.left = `${rect.left + (rect.width - inputWidth) / 2}px`;
        inputElement.style.top = `${rect.top + rect.height / 2 + 40}px`; // Back to original
        inputElement.style.width = `${inputWidth}px`;
        inputElement.style.height = `${inputHeight}px`;
        inputElement.style.fontSize = "20px";
        inputElement.style.fontFamily = "Arial, sans-serif";
        inputElement.style.padding = "5px 10px";
        inputElement.style.border = "2px solid #3498db";
        inputElement.style.borderRadius = "5px";
        inputElement.style.backgroundColor = "#34495e";
        inputElement.style.color = "#ffffff";
        inputElement.style.outline = "none";
        inputElement.style.zIndex = "999999"; // Very high z-index
        inputElement.style.textAlign = "center";
        document.body.appendChild(inputElement);
        inputElement.focus();
        inputElement.select(); // Select all text for easy editing

        // Confirm button
        const btnY = modalY + modalHeight / 2 - 50;
        const confirmBtn = this.add.rectangle(modalX, btnY, 200, 50, 0x27ae60);
        confirmBtn.setStrokeStyle(3, 0x2ecc71);
        confirmBtn
            .setScrollFactor(0)
            .setDepth(3002)
            .setInteractive({ useHandCursor: true });

        const confirmText = this.add.text(modalX, btnY, "CONFIRM", {
            fontSize: "20px",
            fontFamily: "PixelFont",
            color: "#FFFFFF",
            resolution: 2,
        });
        confirmText
            .setOrigin(0.5)
            .setDepth(3003)
            .setScrollFactor(0)
            .setStroke("#000000", 4);

        const modalElements: (Phaser.GameObjects.GameObject | HTMLElement)[] = [
            overlay,
            modalBg,
            title,
            instruction,
            petSprite,
            confirmBtn,
            confirmText,
            inputElement,
        ];

        const closeModal = () => {
            modalElements.forEach((el) => {
                if (el instanceof HTMLElement) {
                    el.remove();
                } else {
                    el.destroy();
                }
            });
        };

        const confirmNaming = () => {
            const petName = inputElement.value.trim() || petDisplayName;
            closeModal();

            // Update the spawned pet's label with the new name
            if (this.spawnedPetLabel) {
                this.spawnedPetLabel.setText(petName);
            }

            // Show success toast with custom name
            this.showToast(`✨ Named your companion: ${petName}!`, 0x3498db);
        };

        // Button hover effects
        confirmBtn.on("pointerover", () => {
            confirmBtn.setFillStyle(0x2ecc71);
            confirmBtn.setScale(1.05);
            confirmText.setScale(1.05);
        });

        confirmBtn.on("pointerout", () => {
            confirmBtn.setFillStyle(0x27ae60);
            confirmBtn.setScale(1.0);
            confirmText.setScale(1.0);
        });

        confirmBtn.on("pointerdown", confirmNaming);

        // Enter key to confirm
        inputElement.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                confirmNaming();
            }
        });

        this.cameras.main.ignore([
            overlay,
            modalBg,
            title,
            instruction,
            petSprite,
            confirmBtn,
            confirmText,
        ]);
    }

    /**
     * Open lucky box and spawn random pet
     */
    private openLuckyBox() {
        // Check cost
        const isFree = this.luckyBoxOpenCount === 0;
        const cost = isFree ? 0 : this.LUCKY_BOX_COST;

        // TODO: Uncomment when gold system is ready
        // Check if player has enough gold (if not free)
        // if (!isFree) {
        //     // Get current gold from GameDataService
        //     const cachedData = GameDataService.getCachedData();
        //     const currentGold = cachedData?.user?.gold || 0;

        //     if (currentGold < cost) {
        //         this.showToast(`Not enough gold! Need ${cost} 💰`, 0xe74c3c);
        //         return;
        //     }

        //     // Deduct gold
        //     const newGold = currentGold - cost;

        //     // Update gold in cached data
        //     if (cachedData?.user) {
        //         cachedData.user.gold = newGold;
        //     }

        //     // Emit event to update UI
        //     EventBus.emit("currency-updated", { gold: newGold });

        //     this.showToast(`-${cost} Gold`, 0xff9800);
        // }

        // Increment open count
        this.luckyBoxOpenCount++;

        // Random pet selection - only cosplay characters (no animals)
        const pets = [
            "npc-maidcat",
            "kungfu-master",
            "cowboy",
            "explorer",
            "bullfighter",
            "soccer-player",
            "ninja",
            "nurse",
            // "magician", // Uncomment when magician.png is added
        ];
        const randomIndex = Math.floor(Math.random() * pets.length);
        const randomPet = pets[randomIndex];

        // Debug log
        console.log(`🎲 Lucky Box #${this.luckyBoxOpenCount}:`);
        console.log(`   Random index: ${randomIndex} / ${pets.length}`);
        console.log(`   Selected pet: ${randomPet}`);

        // Spawn at center of map (only one pet allowed)
        const centerX = (this.MAP_WIDTH * this.TILE_SIZE) / 2;
        const centerY = (this.MAP_HEIGHT * this.TILE_SIZE) / 2;
        const spawnX = centerX + 80; // Slightly offset from Nobita
        const spawnY = centerY + 40;

        // Spawn pet first, then show naming modal
        this.spawnPet(randomPet, spawnX, spawnY);

        // Show naming modal after a delay to let pet appear and animate
        this.time.delayedCall(1000, () => {
            this.showNamingModal(randomPet);
        });
    }

    /**
     * Spawn a pet at specified position
     */
    private spawnPet(petType: string, x: number, y: number) {
        let petSprite: Phaser.GameObjects.Sprite;
        let petName: string;
        let petScale: number;
        let petColor: number;

        // Determine pet properties based on type
        switch (petType) {
            case "npc-maidcat":
                petSprite = this.add.sprite(x, y, "npc-maidcat", 0);
                petName = "Maid Cat";
                petScale = 0.35;
                petColor = 0x9b59b6;
                this.createMaidCatAnimations();
                if (this.anims.exists("npc-maidcat-idle-down")) {
                    petSprite.play("npc-maidcat-idle-down");
                }
                break;
            case "kungfu-master":
                petSprite = this.add.sprite(x, y, "kungfu-master", 0);
                petName = "Kungfu Master";
                petScale = 0.35;
                petColor = 0xe91e63;
                this.createKungfuMasterAnimations();
                if (this.anims.exists("kungfu-master-idle-down")) {
                    petSprite.play("kungfu-master-idle-down");
                }
                break;
            case "cowboy":
                petSprite = this.add.sprite(x, y, "cowboy", 0);
                petName = "Cowboy";
                petScale = 0.35;
                petColor = 0x8b4513;
                this.createCowboyAnimations();
                if (this.anims.exists("cowboy-idle-down")) {
                    petSprite.play("cowboy-idle-down");
                }
                break;
            case "explorer":
                petSprite = this.add.sprite(x, y, "explorer", 0);
                petName = "Explorer";
                petScale = 0.35;
                petColor = 0xff5722;
                this.createExplorerAnimations();
                if (this.anims.exists("explorer-idle-down")) {
                    petSprite.play("explorer-idle-down");
                }
                break;
            case "bullfighter":
                petSprite = this.add.sprite(x, y, "bullfighter", 0);
                petName = "Bullfighter";
                petScale = 0.35;
                petColor = 0xd32f2f;
                this.createBullfighterAnimations();
                if (this.anims.exists("bullfighter-idle-down")) {
                    petSprite.play("bullfighter-idle-down");
                }
                break;
            case "soccer-player":
                petSprite = this.add.sprite(x, y, "soccer-player", 0);
                petName = "Soccer Player";
                petScale = 0.35;
                petColor = 0x4caf50;
                this.createSoccerPlayerAnimations();
                if (this.anims.exists("soccer-player-idle-down")) {
                    petSprite.play("soccer-player-idle-down");
                }
                break;
            case "ninja":
                petSprite = this.add.sprite(x, y, "ninja", 0);
                petName = "Ninja";
                petScale = 0.35;
                petColor = 0x424242;
                this.createNinjaAnimations();
                if (this.anims.exists("ninja-idle-down")) {
                    petSprite.play("ninja-idle-down");
                }
                break;
            case "nurse":
                petSprite = this.add.sprite(x, y, "nurse", 0);
                petName = "Nurse";
                petScale = 0.35;
                petColor = 0xf06292;
                this.createNurseAnimations();
                if (this.anims.exists("nurse-idle-down")) {
                    petSprite.play("nurse-idle-down");
                }
                break;
            // Commented out - Animal characters
            // case "pet-cat":
            //     petSprite = this.add.sprite(x, y, "pet-cat", 0);
            //     petName = "Pet Cat";
            //     petScale = 0.5;
            //     petColor = 0x3498db;
            //     this.createPetCatAnimations();
            //     petSprite.play("pet-cat-idle-down");
            //     break;
            // case "pet-dino":
            //     petSprite = this.add.sprite(x, y, "pet-dino", 0);
            //     petName = "Dino";
            //     petScale = 0.5;
            //     petColor = 0x2ecc71;
            //     this.createPetDinoAnimations();
            //     petSprite.play("pet-dino-idle-down");
            //     break;
            // case "pet-dragon":
            //     petSprite = this.add.sprite(x, y, "pet-dragon", 0);
            //     petName = "Dragon";
            //     petScale = 0.5;
            //     petColor = 0xe74c3c;
            //     this.createPetDragonAnimations();
            //     petSprite.play("pet-dragon-idle-down");
            //     break;
            // case "pet-lion":
            //     petSprite = this.add.sprite(x, y, "pet-lion", 0);
            //     petName = "Lion";
            //     petScale = 0.5;
            //     petColor = 0xf39c12;
            //     this.createPetLionAnimations();
            //     petSprite.play("pet-lion-idle-down");
            //     break;
            // Uncomment when magician.png is added:
            // case "magician":
            //     petSprite = this.add.sprite(x, y, "magician", 0);
            //     petName = "Magician";
            //     petScale = 0.35;
            //     petColor = 0x9c27b0;
            //     this.createMagicianAnimations();
            //     petSprite.play("magician-idle-down");
            //     break;
            default:
                return;
        }

        petSprite.setScale(petScale);
        petSprite.setDepth(y);
        petSprite.setOrigin(0.5, 0.8);

        // Add shadow
        const shadow = new DynamicShadow(this, petSprite, 0, 2);

        // Make UI camera ignore pet and shadow (prevent ghost images)
        this.uiCamera.ignore([petSprite, shadow]);

        // Add name label
        const label = this.add
            .text(x, y - 50, petName, {
                fontSize: "14px",
                color: "#fff",
                stroke: "#000",
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(10000);

        // Make interactive
        const hitArea = this.add
            .circle(x, y, 30, 0x000000, 0)
            .setInteractive({ useHandCursor: true })
            .setDepth(y - 1);

        // Make UI camera ignore label and hitArea too
        this.uiCamera.ignore([label, hitArea]);

        // Hover effect
        hitArea.on("pointerover", () => {
            petSprite.setTint(0xffcccc);
        });

        hitArea.on("pointerout", () => {
            petSprite.clearTint();
        });

        // Click to interact
        hitArea.on("pointerdown", () => {
            const currentName = label.text;
            this.showToast(`${currentName} says hello! 👋`, petColor);
        });

        // Start random movement
        this.startNPCRandomMovement(
            petSprite,
            shadow,
            label,
            hitArea,
            "center",
        );

        // Track spawned pet and related objects
        this.spawnedPet = petSprite;
        this.spawnedPetShadow = shadow;
        this.spawnedPetLabel = label;
        this.spawnedPetHitArea = hitArea;

        // Show success message
        const costMsg =
            this.luckyBoxOpenCount === 1
                ? "FREE"
                : `${this.LUCKY_BOX_COST} Gold`;
        this.showToast(`🎉 You got ${petName}! (${costMsg})`, petColor);
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

    private createKungfuMasterAnimations() {
        const charKey = "kungfu-master";
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("kungfu-master-idle-down")) {
            this.anims.create({
                key: "kungfu-master-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("kungfu-master-idle-up")) {
            this.anims.create({
                key: "kungfu-master-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("kungfu-master-idle-left")) {
            this.anims.create({
                key: "kungfu-master-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("kungfu-master-idle-right")) {
            this.anims.create({
                key: "kungfu-master-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("kungfu-master-walk-down")) {
            this.anims.create({
                key: "kungfu-master-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("kungfu-master-walk-up")) {
            this.anims.create({
                key: "kungfu-master-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("kungfu-master-walk-left")) {
            this.anims.create({
                key: "kungfu-master-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("kungfu-master-walk-right")) {
            this.anims.create({
                key: "kungfu-master-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private createCowboyAnimations() {
        const charKey = "cowboy";
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("cowboy-idle-down")) {
            this.anims.create({
                key: "cowboy-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("cowboy-idle-up")) {
            this.anims.create({
                key: "cowboy-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("cowboy-idle-left")) {
            this.anims.create({
                key: "cowboy-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("cowboy-idle-right")) {
            this.anims.create({
                key: "cowboy-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("cowboy-walk-down")) {
            this.anims.create({
                key: "cowboy-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("cowboy-walk-up")) {
            this.anims.create({
                key: "cowboy-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("cowboy-walk-left")) {
            this.anims.create({
                key: "cowboy-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("cowboy-walk-right")) {
            this.anims.create({
                key: "cowboy-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private createExplorerAnimations() {
        const charKey = "explorer";
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("explorer-idle-down")) {
            this.anims.create({
                key: "explorer-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("explorer-idle-up")) {
            this.anims.create({
                key: "explorer-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("explorer-idle-left")) {
            this.anims.create({
                key: "explorer-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("explorer-idle-right")) {
            this.anims.create({
                key: "explorer-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("explorer-walk-down")) {
            this.anims.create({
                key: "explorer-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("explorer-walk-up")) {
            this.anims.create({
                key: "explorer-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("explorer-walk-left")) {
            this.anims.create({
                key: "explorer-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("explorer-walk-right")) {
            this.anims.create({
                key: "explorer-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private createBullfighterAnimations() {
        const charKey = "bullfighter";
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("bullfighter-idle-down")) {
            this.anims.create({
                key: "bullfighter-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("bullfighter-idle-up")) {
            this.anims.create({
                key: "bullfighter-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("bullfighter-idle-left")) {
            this.anims.create({
                key: "bullfighter-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("bullfighter-idle-right")) {
            this.anims.create({
                key: "bullfighter-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("bullfighter-walk-down")) {
            this.anims.create({
                key: "bullfighter-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("bullfighter-walk-up")) {
            this.anims.create({
                key: "bullfighter-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("bullfighter-walk-left")) {
            this.anims.create({
                key: "bullfighter-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("bullfighter-walk-right")) {
            this.anims.create({
                key: "bullfighter-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private createSoccerPlayerAnimations() {
        const charKey = "soccer-player";
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("soccer-player-idle-down")) {
            this.anims.create({
                key: "soccer-player-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("soccer-player-idle-up")) {
            this.anims.create({
                key: "soccer-player-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("soccer-player-idle-left")) {
            this.anims.create({
                key: "soccer-player-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("soccer-player-idle-right")) {
            this.anims.create({
                key: "soccer-player-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("soccer-player-walk-down")) {
            this.anims.create({
                key: "soccer-player-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("soccer-player-walk-up")) {
            this.anims.create({
                key: "soccer-player-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("soccer-player-walk-left")) {
            this.anims.create({
                key: "soccer-player-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("soccer-player-walk-right")) {
            this.anims.create({
                key: "soccer-player-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private createNinjaAnimations() {
        const charKey = "ninja";
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("ninja-idle-down")) {
            this.anims.create({
                key: "ninja-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("ninja-idle-up")) {
            this.anims.create({
                key: "ninja-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("ninja-idle-left")) {
            this.anims.create({
                key: "ninja-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("ninja-idle-right")) {
            this.anims.create({
                key: "ninja-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("ninja-walk-down")) {
            this.anims.create({
                key: "ninja-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("ninja-walk-up")) {
            this.anims.create({
                key: "ninja-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("ninja-walk-left")) {
            this.anims.create({
                key: "ninja-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("ninja-walk-right")) {
            this.anims.create({
                key: "ninja-walk-right",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 12,
                    end: 15,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }
    }

    private createNurseAnimations() {
        const charKey = "nurse";
        const frameRate = 6;

        // Idle animations
        if (!this.anims.exists("nurse-idle-down")) {
            this.anims.create({
                key: "nurse-idle-down",
                frames: [{ key: charKey, frame: 0 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("nurse-idle-up")) {
            this.anims.create({
                key: "nurse-idle-up",
                frames: [{ key: charKey, frame: 4 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("nurse-idle-left")) {
            this.anims.create({
                key: "nurse-idle-left",
                frames: [{ key: charKey, frame: 8 }],
                frameRate: 1,
            });
        }

        if (!this.anims.exists("nurse-idle-right")) {
            this.anims.create({
                key: "nurse-idle-right",
                frames: [{ key: charKey, frame: 12 }],
                frameRate: 1,
            });
        }

        // Walk animations
        if (!this.anims.exists("nurse-walk-down")) {
            this.anims.create({
                key: "nurse-walk-down",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 0,
                    end: 3,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("nurse-walk-up")) {
            this.anims.create({
                key: "nurse-walk-up",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 4,
                    end: 7,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("nurse-walk-left")) {
            this.anims.create({
                key: "nurse-walk-left",
                frames: this.anims.generateFrameNumbers(charKey, {
                    start: 8,
                    end: 11,
                }),
                frameRate: frameRate,
                repeat: -1,
            });
        }

        if (!this.anims.exists("nurse-walk-right")) {
            this.anims.create({
                key: "nurse-walk-right",
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
        // Debug helpers removed for production
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

        // Exit room when player walks down through the door (x: 380-435, y >= 550)
        const inDoorX = this.player.x >= 380 && this.player.x <= 435;
        const inDoorY = this.player.y >= 550;
        const movingDown = this.player.body!.velocity.y > 0;
        if (inDoorX && inDoorY && movingDown && !this.exitTriggered) {
            this.exitTriggered = true;
            this.player.setVelocity(0, 0);
            this.stationManager.open();
        } else if (!inDoorX || !inDoorY) {
            this.exitTriggered = false;
        }
    }
}

