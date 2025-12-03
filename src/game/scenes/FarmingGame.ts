import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { ISLAND_MAP_DATA } from './IslandMapData';
import { UserService } from '../UserService';

// Plant types based on proposal
type PlantType = 'social' | 'technical' | 'branded' | 'mushroom';

// Plant stages according to proposal:
// 0: Seed (Hạt)
// 1: Sprout (Mầm)
// 2: Young Plant (Cây non)
// 3: Mature (Trưởng thành)
// 4: Flower (Hoa) - After this stage, plant cannot die
// 5: Fruit (Quả) - Ready to harvest
const PLANT_STAGES = {
    SEED: 0,
    SPROUT: 1,
    YOUNG: 2,
    MATURE: 3,
    FLOWER: 4,
    FRUIT: 5
};

// Death timer: 72 hours in real time = 72 * 60 * 60 * 1000 ms
// Configurable via NEXT_PUBLIC_DEATH_TIMER_MS environment variable
// Default: 5 minutes (300000ms) for demo, Production: 72 hours (259200000ms)
const DEATH_TIMER_MS = parseInt(process.env.NEXT_PUBLIC_DEATH_TIMER_MS || '300000', 10);

interface TileState {
    tilled: boolean;
    planted: boolean;
    plantStage: number; // 0-5 based on PLANT_STAGES
    cropType: PlantType | null;
    plantSprite?: Phaser.GameObjects.Image;
    isDead?: boolean;
    isWilted?: boolean; // Plant is wilted (for stages >= FLOWER)
    lastCareTime?: number; // Timestamp of last watering/fertilizing
    healthBarBg?: Phaser.GameObjects.Rectangle; // Health bar background
    healthBarFill?: Phaser.GameObjects.Rectangle; // Health bar fill (green->red)
}

// New crop definitions using image keys instead of sprite frames
interface CropDefinition {
    name: string;
    seedImage: string;
    growthImages: string[]; // 5 stages
    fruitImage: string;
    deathImage: string;
}

const CROP_DEFINITIONS: Record<PlantType, CropDefinition> = {
    social: {
        name: 'Social Plant',
        seedImage: 'social-seed',
        growthImages: ['social-plant-1', 'social-plant-2', 'social-plant-3', 'social-plant-4', 'social-plant-5'],
        fruitImage: 'social-fruit',
        deathImage: 'social-plant-death'
    },
    technical: {
        name: 'Technical Plant',
        seedImage: 'technical-seed',
        growthImages: ['technical-plant-1', 'technical-plant-2', 'technical-plant-3', 'technical-plant-4', 'technical-plant-5'],
        fruitImage: 'technical-fruit',
        deathImage: 'technical-plant-death'
    },
    branded: {
        name: 'Branded Plant',
        seedImage: 'branded-seed',
        growthImages: ['branded-plant-1', 'branded-plant-2', 'branded-plant-3', 'branded-plant-4', 'branded-plant-5'],
        fruitImage: 'branded-fruit',
        deathImage: 'branded-plant-death'
    },
    mushroom: {
        name: 'Mushroom',
        seedImage: 'mushroom-seed',
        growthImages: ['mushroom-plant-1', 'mushroom-plant-2', 'mushroom-plant-3', 'mushroom-plant-4', 'mushroom-plant-5'],
        fruitImage: 'mushroom-fruit',
        deathImage: 'mushroom-plant-death'
    }
};

// Available plant types for seed selection
const PLANT_TYPES: PlantType[] = ['social', 'technical', 'branded', 'mushroom'];

interface ToolbarItem {
    type: 'tool' | 'seed';
    name: string;
    count?: number;
}

export class FarmingGame extends Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasdKeys!: any;

    // World
    private readonly TILE_SIZE = 16;
    private readonly MAP_WIDTH = 50;
    private readonly MAP_HEIGHT = 50;
    private map!: Phaser.Tilemaps.Tilemap;
    private groundLayer!: Phaser.Tilemaps.TilemapLayer;
    private tilledDirtLayer!: Phaser.Tilemaps.TilemapLayer;

    // Farming
    private farmLandStates: Map<string, TileState> = new Map();
    private selectedToolIndex: number = 0;

    // Seed selection
    private selectedSeedIndex: number = 0; // Index in PLANT_TYPES
    private seedSelectorOpen: boolean = false;
    private seedSelectorElements: Phaser.GameObjects.GameObject[] = [];
    private seedOptionJustClicked: boolean = false; // Prevent movement when clicking seed options

    // Seed counts per type (each type starts with 5 seeds)
    private seedCounts: Record<PlantType, number> = {
        social: 5,
        technical: 5,
        branded: 5,
        mushroom: 5
    };

    // Toolbar items (6 slots: hand, watering can, seed, fertilizer, digest, chest)
    private toolbarItems: ToolbarItem[] = [
        { type: 'tool', name: 'hand' },
        { type: 'tool', name: 'wateringCan', count: 100 },
        { type: 'seed', name: 'seed' }, // count is managed by seedCounts
        { type: 'tool', name: 'fertilizer', count: 5 },
        { type: 'tool', name: 'digest' },
        { type: 'tool', name: 'chest' },
    ];
    private toolbarSlots: Phaser.GameObjects.GameObject[] = [];
    private toolbarElements: Phaser.GameObjects.GameObject[] = [];

    // Chest inventory system
    private readonly CHEST_SLOTS = 12; // 3 columns x 4 rows
    private readonly MAX_PER_SLOT = 5; // Max 5 fruits per slot
    private chestInventory: { type: PlantType; count: number }[] = []; // Each slot: {type, count}
    private chestOpen: boolean = false;
    private chestPanelElements: Phaser.GameObjects.GameObject[] = [];

    // Factory system
    private factorySprite!: Phaser.GameObjects.Sprite;
    private factoryWorking: boolean = false;
    private factoryModalOpen: boolean = false;
    private factoryModalElements: Phaser.GameObjects.GameObject[] = [];
    private readonly FRUITS_PER_FERTILIZER = 3; // 3 fruits = 1 fertilizer
    private droppedFertilizers: Phaser.GameObjects.Sprite[] = []; // Fertilizer bags on ground

    // UI
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private timeText!: Phaser.GameObjects.Text;
    private dayCounter: number = 1;
    private timeOfDay: number = 7 * 60; // 7:00 AM in minutes

    // Wallet
    private walletAddress: string = '';
    private walletUIElements: Phaser.GameObjects.GameObject[] = [];

    // User Profile UI
    private userProfileElements: Phaser.GameObjects.GameObject[] = [];
    private userProfileModalOpen: boolean = false;
    private userProfileModalElements: Phaser.GameObjects.GameObject[] = [];
    private avatarImage: Phaser.GameObjects.Image | null = null;
    private loadedAvatarUrl: string | null = null;

    // Mobile controls
    private joystickBase!: Phaser.GameObjects.Arc;
    private joystickThumb!: Phaser.GameObjects.Arc;
    private joystickActive: boolean = false;
    private joystickPointer: Phaser.Input.Pointer | null = null;
    private touchMoveTarget: { x: number, y: number } | null = null;
    private actionButton!: Phaser.GameObjects.Arc;
    private actionButtonText!: Phaser.GameObjects.Text;

    // Check-in system
    private checkinSign!: Phaser.GameObjects.Image;
    private checkinModalOpen: boolean = false;
    private checkinModalElements: Phaser.GameObjects.GameObject[] = [];
    private readonly CHECKIN_STORAGE_KEY = 'fam_game_checkin_data';

    // Mailbox/Mission system
    private mailboxSprite!: Phaser.GameObjects.Sprite;
    private mailboxModalOpen: boolean = false;
    private mailboxModalElements: Phaser.GameObjects.GameObject[] = [];
    private mailboxActiveTab: 'missions' | 'redeem' = 'missions';

    // Marquee announcement
    private marqueeText!: Phaser.GameObjects.Text;
    private marqueeContainer!: Phaser.GameObjects.Container;

    constructor() {
        super('FarmingGame');
    }

    create() {
        // Create water animation first
        this.createWaterAnimation();

        // Create the island map
        this.createIslandMap();

        // Create factory
        this.createFactory();

        // Create check-in sign
        this.createCheckinSign();

        // Create mailbox
        this.createMailbox();

        // Create player
        this.createPlayer();

        // Setup main game camera (zoomed, follows player)
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(3); // Zoom in for pixel art

        // Create UI camera (no zoom, fixed position, for UI elements only)
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera.setScroll(0, 0);
        // UI camera ignores all game world objects - will be set up after they're created

        // Setup controls
        this.setupControls();

        // Initialize inventory
        this.initializeInventory();

        // Create UI
        this.createUI();

        // Create mobile controls
        this.createMobileControls();

        // Create marquee announcement
        this.createMarquee();

        // Make UI camera ignore all game world objects (everything except UI)
        this.setupCameraIgnore();

        // Setup interactions
        this.setupInteractions();

        // Start game loop
        this.time.addEvent({
            delay: 100, // Update every 100ms
            callback: this.gameLoop,
            callbackScope: this,
            loop: true
        });

        // Listen for wallet connection
        EventBus.on('wallet-connected', this.onWalletConnected, this);
        // Check if already connected
        EventBus.emit('check-wallet-connection');

        // Handle screen resize
        this.scale.on('resize', this.onResize, this);

        EventBus.emit('current-scene-ready', this);
    }

    private onResize(gameSize: Phaser.Structs.Size) {
        // Update UI camera size
        if (this.uiCamera) {
            this.uiCamera.setSize(gameSize.width, gameSize.height);
        }

        // Recreate UI elements for new screen size
        this.recreateUIForResize();
    }

    private recreateUIForResize() {
        // Destroy and recreate mobile controls
        if (this.joystickBase) this.joystickBase.destroy();
        if (this.joystickThumb) this.joystickThumb.destroy();
        if (this.actionButton) this.actionButton.destroy();
        if (this.actionButtonText) this.actionButtonText.destroy();

        this.createMobileControls();

        // Recreate toolbar
        this.updateToolbar();

        // Recreate wallet display
        this.createWalletDisplay();

        // Recreate user profile UI
        this.createUserProfileUI();
    }

    private createWaterAnimation() {
        // Create animated tiles for water (4 frames)
        this.anims.create({
            key: 'water-anim',
            frames: this.anims.generateFrameNumbers('water-tileset', { start: 0, end: 3 }),
            frameRate: 4,
            repeat: -1
        });
    }

    private createIslandMap() {
        // Create animated water background first
        this.createWaterBackground();

        // Create a tilemap programmatically for land
        this.map = this.make.tilemap({
            tileWidth: this.TILE_SIZE,
            tileHeight: this.TILE_SIZE,
            width: this.MAP_WIDTH,
            height: this.MAP_HEIGHT
        });

        // Add tileset images
        const grassTiles = this.map.addTilesetImage('grass', 'grass-tileset');
        const tilledDirtTiles = this.map.addTilesetImage('tilled-dirt', 'tilled-dirt-tileset');

        if (!grassTiles || !tilledDirtTiles) {
            console.error('Failed to load tilesets');
            return;
        }

        // Create ground layer (only for land tiles)
        this.groundLayer = this.map.createBlankLayer('Ground', grassTiles) as Phaser.Tilemaps.TilemapLayer;

        if (!this.groundLayer) {
            console.error('Failed to create ground layer');
            return;
        }

        // Set depth for ground layer
        this.groundLayer.setDepth(1);

        // Create tilled dirt layer (for farm plots)
        this.tilledDirtLayer = this.map.createBlankLayer('TilledDirt', tilledDirtTiles) as Phaser.Tilemaps.TilemapLayer;

        if (!this.tilledDirtLayer) {
            console.error('Failed to create tilled dirt layer');
            return;
        }

        // Set depth for tilled dirt layer (above ground)
        this.tilledDirtLayer.setDepth(2);

        // Apply autotiling based on predefined island map data
        for (let y = 0; y < this.MAP_HEIGHT; y++) {
            for (let x = 0; x < this.MAP_WIDTH; x++) {
                const tileValue = ISLAND_MAP_DATA[y][x];

                // Only place tiles where there's land (non-zero values)
                if (tileValue > 0) {
                    // Get the correct tile index based on neighbors (autotiling)
                    const autoTileIndex = this.getAutoTileIndex(x, y);
                    this.groundLayer.putTileAt(autoTileIndex, x, y);
                }
            }
        }

        // Add some decorative elements
        this.addDecorativeElements();

        // Add farm plots at center
        this.createFarmPlots();
    }

    private isLandTile(x: number, y: number): boolean {
        // Check bounds
        if (x < 0 || x >= this.MAP_WIDTH || y < 0 || y >= this.MAP_HEIGHT) {
            return false;
        }
        return ISLAND_MAP_DATA[y][x] > 0;
    }

    private getAutoTileIndex(x: number, y: number): number {
        // Check 8 neighbors
        const top = this.isLandTile(x, y - 1);
        const bottom = this.isLandTile(x, y + 1);
        const left = this.isLandTile(x - 1, y);
        const right = this.isLandTile(x + 1, y);

        // Grass tileset 3x3 autotile pattern:
        // 0  - 1  - 2     (top-left corner, top edge, top-right corner)
        // 11 - 12 - 13    (left edge, center, right edge)
        // 22 - 23 - 24    (bottom-left corner, bottom edge, bottom-right corner)

        // Full center (all 4 cardinal directions are land)
        if (top && bottom && left && right) {
            return 12; // Center tile - full grass
        }

        // Outer corners (two adjacent cardinal sides are water)
        if (!top && !left && bottom && right) {
            return 0; // Top-left outer corner
        }
        if (!top && !right && bottom && left) {
            return 2; // Top-right outer corner
        }
        if (!bottom && !left && top && right) {
            return 22; // Bottom-left outer corner
        }
        if (!bottom && !right && top && left) {
            return 24; // Bottom-right outer corner
        }

        // Edges (one cardinal side is water, three sides are land)
        if (!top && bottom && left && right) {
            return 1; // Top edge
        }
        if (top && !bottom && left && right) {
            return 23; // Bottom edge
        }
        if (top && bottom && !left && right) {
            return 11; // Left edge
        }
        if (top && bottom && left && !right) {
            return 13; // Right edge
        }

        // Narrow strips (opposite sides only)
        if (!top && !bottom && left && right) {
            return 1; // Horizontal strip - use top edge
        }
        if (top && bottom && !left && !right) {
            return 11; // Vertical strip - use left edge
        }

        // Single connections
        if (!top && !bottom && !left && right) {
            return 11; // Single right - use left edge
        }
        if (!top && !bottom && left && !right) {
            return 13; // Single left - use right edge
        }
        if (top && !bottom && !left && !right) {
            return 23; // Single top - use bottom edge
        }
        if (!top && bottom && !left && !right) {
            return 1; // Single bottom - use top edge
        }

        // Isolated tile (no neighbors)
        if (!top && !bottom && !left && !right) {
            return 12; // Isolated - use center tile
        }

        // Default to center
        return 12;
    }

    private createWaterBackground() {
        // Create animated water sprites for entire map
        for (let y = 0; y < this.MAP_HEIGHT; y++) {
            for (let x = 0; x < this.MAP_WIDTH; x++) {
                const water = this.add.sprite(
                    x * this.TILE_SIZE + this.TILE_SIZE / 2,
                    y * this.TILE_SIZE + this.TILE_SIZE / 2,
                    'water-tileset',
                    0
                );
                water.setOrigin(0.5);
                water.setDepth(0); // Behind everything
                water.play('water-anim');
            }
        }
    }

    private addDecorativeElements() {
        // Generate random plants on the island
        const plantCount = 20; // Number of decorative plants

        // Center exclusion zone (farm area + buffer)
        // Farm plots are at (24-26, 24-25), add buffer of 2 tiles around
        const centerX = 25;
        const centerY = 25;
        const exclusionRadius = 4; // Tiles to exclude from center

        // Factory exclusion zone (factory is at centerX, centerY - 5)
        const factoryX = centerX;
        const factoryY = centerY - 5;
        const factoryExclusionRadius = 3; // Tiles to exclude around factory

        for (let i = 0; i < plantCount; i++) {
            // Random position on the island (rows 11-39, cols 10-39)
            const x = Phaser.Math.Between(11, 38);
            const y = Phaser.Math.Between(12, 38);

            // Skip if position is in center exclusion zone
            const distFromCenter = Math.max(Math.abs(x - centerX), Math.abs(y - centerY));
            if (distFromCenter < exclusionRadius) continue;

            // Skip if position is in factory exclusion zone
            const distFromFactory = Math.max(Math.abs(x - factoryX), Math.abs(y - factoryY));
            if (distFromFactory < factoryExclusionRadius) continue;

            // Skip if not on land
            if (!this.isLandTile(x, y)) continue;

            // Random plant type
            const plantType = Phaser.Math.Between(0, 5);

            switch (plantType) {
                case 0: // Small tree (sprites 0, 9)
                    this.addSmallTree(x, y);
                    break;
                case 1: // Medium tree (sprites 1, 2, 10, 11)
                    if (this.canPlaceLargeObject(x, y, 2, 2)) {
                        this.addMediumTree(x, y);
                    }
                    break;
                case 2: // Large tree (sprites 3, 4, 12, 13)
                    if (this.canPlaceLargeObject(x, y, 2, 2)) {
                        this.addLargeTree(x, y);
                    }
                    break;
                case 3: // Mushroom (sprites 5, 6, 7, 8)
                    this.addMushroom(x, y);
                    break;
                case 4: // Bush (sprites 27, 28)
                    this.addBush(x, y);
                    break;
            }
        }
    }

    private canPlaceLargeObject(x: number, y: number, width: number, height: number): boolean {
        const centerX = 25;
        const centerY = 25;
        const exclusionRadius = 4;

        // Check if all tiles for large object are on land and not in exclusion zone
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                const checkX = x + dx;
                const checkY = y + dy;

                if (!this.isLandTile(checkX, checkY)) {
                    return false;
                }

                // Check exclusion zone
                const distFromCenter = Math.max(Math.abs(checkX - centerX), Math.abs(checkY - centerY));
                if (distFromCenter < exclusionRadius) {
                    return false;
                }
            }
        }
        return true;
    }

    private addSmallTree(x: number, y: number) {
        // Small tree: sprite 0 (top), sprite 9 (bottom)
        const topSprite = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            y * this.TILE_SIZE + this.TILE_SIZE / 2,
            'basic-plants',
            0
        );
        topSprite.setOrigin(0.5);
        topSprite.setDepth(y * this.TILE_SIZE);

        const bottomSprite = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            (y + 1) * this.TILE_SIZE + this.TILE_SIZE / 2,
            'basic-plants',
            9
        );
        bottomSprite.setOrigin(0.5);
        bottomSprite.setDepth((y + 1) * this.TILE_SIZE);
    }

    private addMediumTree(x: number, y: number) {
        // Medium tree: 2x2 grid (1, 2, 10, 11)
        const sprites = [
            { frame: 1, dx: 0, dy: 0 },
            { frame: 2, dx: 1, dy: 0 },
            { frame: 10, dx: 0, dy: 1 },
            { frame: 11, dx: 1, dy: 1 }
        ];

        sprites.forEach(s => {
            const sprite = this.add.sprite(
                (x + s.dx) * this.TILE_SIZE + this.TILE_SIZE / 2,
                (y + s.dy) * this.TILE_SIZE + this.TILE_SIZE / 2,
                'basic-plants',
                s.frame
            );
            sprite.setOrigin(0.5);
            sprite.setDepth((y + s.dy) * this.TILE_SIZE);
        });
    }

    private addLargeTree(x: number, y: number) {
        // Large tree: 2x2 grid (3, 4, 12, 13)
        const sprites = [
            { frame: 3, dx: 0, dy: 0 },
            { frame: 4, dx: 1, dy: 0 },
            { frame: 12, dx: 0, dy: 1 },
            { frame: 13, dx: 1, dy: 1 }
        ];

        sprites.forEach(s => {
            const sprite = this.add.sprite(
                (x + s.dx) * this.TILE_SIZE + this.TILE_SIZE / 2,
                (y + s.dy) * this.TILE_SIZE + this.TILE_SIZE / 2,
                'basic-plants',
                s.frame
            );
            sprite.setOrigin(0.5);
            sprite.setDepth((y + s.dy) * this.TILE_SIZE);
        });
    }

    private addMushroom(x: number, y: number) {
        // Random mushroom: sprites 5, 6, 7, 8
        const mushroomFrame = Phaser.Math.Between(5, 8);
        const sprite = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            y * this.TILE_SIZE + this.TILE_SIZE / 2,
            'basic-plants',
            mushroomFrame
        );
        sprite.setOrigin(0.5);
        sprite.setDepth(y * this.TILE_SIZE);
    }

    private addBush(x: number, y: number) {
        // Random bush: sprites 27, 28
        const bushFrame = Phaser.Math.Between(27, 28);
        const sprite = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            y * this.TILE_SIZE + this.TILE_SIZE / 2,
            'basic-plants',
            bushFrame
        );
        sprite.setOrigin(0.5);
        sprite.setDepth(y * this.TILE_SIZE);
    }

    private createFarmPlots() {
        // Create 6 farm plots at the center of the island in a 3x2 grid
        // Center of rectangular island is around (25, 25)
        const centerX = 25;
        const centerY = 25;

        // Tilled dirt tile variations: 0, 1, 2, 8, 9, 10
        const tilledDirtTiles = [0, 1, 2, 8, 9, 10];

        // Create 3x2 grid of farm plots using random tilled-dirt tiles
        const plotPositions = [
            { x: centerX - 1, y: centerY - 1 }, // Top left
            { x: centerX, y: centerY - 1 },     // Top center
            { x: centerX + 1, y: centerY - 1 }, // Top right
            { x: centerX - 1, y: centerY },     // Bottom left
            { x: centerX, y: centerY },         // Bottom center
            { x: centerX + 1, y: centerY },     // Bottom right
        ];

        // Place random tilled-dirt tiles for each plot
        plotPositions.forEach((pos) => {
            const randomTileIndex = Phaser.Math.RND.pick(tilledDirtTiles);
            this.tilledDirtLayer.putTileAt(randomTileIndex, pos.x, pos.y);
        });
    }

    private createFactory() {
        // Place factory above the farm plots
        const centerX = 25;
        const centerY = 25;
        const factoryX = centerX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const factoryY = (centerY - 5) * this.TILE_SIZE; // 5 tiles above center

        // Create factory sprite with idle animation
        this.factorySprite = this.add.sprite(factoryX, factoryY, 'factory-1');
        this.factorySprite.setDisplaySize(64, 64); // Scale up from 30x30
        // Set depth based on factory's Y position (bottom of sprite)
        // This allows player to appear in front when below factory, behind when above
        this.factorySprite.setDepth(factoryY + 20);
        this.factorySprite.setInteractive({ useHandCursor: true });

        // Create idle animation (frames 1-2)
        this.time.addEvent({
            delay: 500,
            callback: () => {
                if (!this.factoryWorking) {
                    const currentFrame = this.factorySprite.texture.key;
                    const nextFrame = currentFrame === 'factory-1' ? 'factory-2' : 'factory-1';
                    this.factorySprite.setTexture(nextFrame);
                }
            },
            loop: true
        });

        // Click handler to open factory modal
        this.factorySprite.on('pointerdown', () => {
            this.toggleFactoryModal();
        });

        // Make UI camera ignore factory
        this.uiCamera?.ignore(this.factorySprite);
    }

    private createCheckinSign() {
        // Place check-in sign near the farm plots (to the left of farm area)
        const centerX = 25;
        const centerY = 25;
        const signX = (centerX - 3) * this.TILE_SIZE + this.TILE_SIZE / 2; // 3 tiles left of farm
        const signY = (centerY - 1) * this.TILE_SIZE + this.TILE_SIZE / 2; // Aligned with top row

        // Create check-in sign (smaller size to fit pixel art style)
        this.checkinSign = this.add.image(signX, signY, 'icon-checkin');
        this.checkinSign.setDisplaySize(16, 16);
        // Set depth based on bottom of the sign (Y + half height) for proper sorting with player
        this.checkinSign.setDepth(signY);
        this.checkinSign.setInteractive({ useHandCursor: true });

        // Click handler
        this.checkinSign.on('pointerdown', () => {
            this.openCheckinModal();
        });

        // Hover effects - just tint, no scale change
        this.checkinSign.on('pointerover', () => {
            this.checkinSign.setTint(0xffff88);
        });

        this.checkinSign.on('pointerout', () => {
            this.checkinSign.clearTint();
        });

        // Make UI camera ignore
        this.uiCamera?.ignore(this.checkinSign);
    }

    private getCheckinData(): { checkedDays: number[]; lastCheckin: string; streak: number } {
        if (typeof window === 'undefined') {
            return { checkedDays: [], lastCheckin: '', streak: 0 };
        }
        const stored = localStorage.getItem(this.CHECKIN_STORAGE_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch {
                return { checkedDays: [], lastCheckin: '', streak: 0 };
            }
        }
        return { checkedDays: [], lastCheckin: '', streak: 0 };
    }

    private saveCheckinData(data: { checkedDays: number[]; lastCheckin: string; streak: number }) {
        if (typeof window !== 'undefined') {
            localStorage.setItem(this.CHECKIN_STORAGE_KEY, JSON.stringify(data));
        }
    }

    private getTodayString(): string {
        const today = new Date();
        return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    }

    private getDayOfWeek(): number {
        // Returns 0-6, where 0 is Sunday
        return new Date().getDay();
    }

    private canCheckinToday(): boolean {
        const data = this.getCheckinData();
        return data.lastCheckin !== this.getTodayString();
    }

    private openCheckinModal() {
        if (this.checkinModalOpen) return;
        this.checkinModalOpen = true;

        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const modalWidth = 320;
        const modalHeight = 220;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.6);
        overlay.setDepth(5300);
        overlay.setInteractive();
        this.cameras.main.ignore(overlay);
        this.checkinModalElements.push(overlay);

        // Modal background
        const modalBg = this.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5301);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.cameras.main.ignore(modalBg);
        this.checkinModalElements.push(modalBg);

        // Animate modal
        modalBg.setScale(0);
        this.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        this.time.delayedCall(100, () => {
            const title = this.add.text(modalX, modalY - modalHeight / 2 + 35, 'Daily Check-in', {
                fontSize: '14px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            title.setOrigin(0.5);
            title.setDepth(5302);
            title.setStroke('#5D4037', 2);
            title.setAlpha(0);
            this.cameras.main.ignore(title);
            this.checkinModalElements.push(title);

            this.tweens.add({ targets: title, alpha: 1, duration: 150 });

            // Get checkin data
            const checkinData = this.getCheckinData();
            const todayDayOfWeek = this.getDayOfWeek();
            const canCheckin = this.canCheckinToday();

            // Day names - Layout: 4 days on top row, 3 days on bottom row
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayBoxSize = 38;
            const daySpacing = 8;
            const rowSpacing = 45;
            const row1Y = modalY - 35; // First row Y
            const row2Y = row1Y + rowSpacing; // Second row Y

            // Create day boxes in 2 rows
            dayNames.forEach((dayName, index) => {
                let dayX: number;
                let dayY: number;

                if (index < 4) {
                    // First row: 4 days (Sun, Mon, Tue, Wed)
                    const row1StartX = modalX - (4 * (dayBoxSize + daySpacing) - daySpacing) / 2 + dayBoxSize / 2;
                    dayX = row1StartX + index * (dayBoxSize + daySpacing);
                    dayY = row1Y;
                } else {
                    // Second row: 3 days (Thu, Fri, Sat) - centered
                    const row2StartX = modalX - (3 * (dayBoxSize + daySpacing) - daySpacing) / 2 + dayBoxSize / 2;
                    dayX = row2StartX + (index - 4) * (dayBoxSize + daySpacing);
                    dayY = row2Y;
                }

                const isToday = index === todayDayOfWeek;
                const isChecked = checkinData.checkedDays.includes(index);

                // Day box background
                const boxFrame = isChecked ? 6 : (isToday ? 6 : 7);
                const dayBox = this.add.sprite(dayX, dayY, 'square-buttons', boxFrame);
                dayBox.setDisplaySize(dayBoxSize, dayBoxSize);
                dayBox.setDepth(5302);
                dayBox.setAlpha(0);
                this.cameras.main.ignore(dayBox);
                this.checkinModalElements.push(dayBox);

                if (isChecked) {
                    dayBox.setTint(0x4ade80); // Green for checked
                } else if (!isToday) {
                    dayBox.setTint(0x888888); // Gray for past/future days
                }

                // Day name text
                const dayText = this.add.text(dayX, dayY - 10, dayName, {
                    fontSize: '8px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    resolution: 2
                });
                dayText.setOrigin(0.5);
                dayText.setDepth(5303);
                dayText.setStroke('#5D4037', 1);
                dayText.setAlpha(0);
                this.cameras.main.ignore(dayText);
                this.checkinModalElements.push(dayText);

                // Checkmark or day number
                const checkSymbol = isChecked ? '✓' : (index + 1).toString();
                const checkText = this.add.text(dayX, dayY + 6, checkSymbol, {
                    fontSize: isChecked ? '12px' : '10px',
                    fontFamily: 'PixelFont',
                    color: isChecked ? '#FFFFFF' : '#FFF8E1',
                    resolution: 2
                });
                checkText.setOrigin(0.5);
                checkText.setDepth(5303);
                checkText.setStroke('#5D4037', 1);
                checkText.setAlpha(0);
                this.cameras.main.ignore(checkText);
                this.checkinModalElements.push(checkText);

                // Fade in
                this.tweens.add({
                    targets: [dayBox, dayText, checkText],
                    alpha: 1,
                    duration: 150,
                    delay: index * 30
                });

                // Make today's box clickable for check-in
                if (isToday && canCheckin && !isChecked) {
                    dayBox.setInteractive({ useHandCursor: true });
                    dayBox.on('pointerover', () => dayBox.setTint(0xffff88));
                    dayBox.on('pointerout', () => dayBox.clearTint());
                    dayBox.on('pointerdown', () => {
                        this.performCheckin(index, dayBox, checkText, checkinData);
                    });
                }
            });

            // Streak info - positioned below the 2 rows
            const infoY = row2Y + 35;
            const streakText = this.add.text(modalX, infoY, `Current Streak: ${checkinData.streak} day${checkinData.streak !== 1 ? 's' : ''}`, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFF8E1',
                resolution: 2
            });
            streakText.setOrigin(0.5);
            streakText.setDepth(5302);
            streakText.setStroke('#5D4037', 2);
            streakText.setAlpha(0);
            this.cameras.main.ignore(streakText);
            this.checkinModalElements.push(streakText);

            this.tweens.add({ targets: streakText, alpha: 1, duration: 150, delay: 200 });

            // Reward info
            const rewardInfo = this.add.text(modalX, infoY + 16, 'Check in to get 1 Water!', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#4ade80',
                resolution: 2
            });
            rewardInfo.setOrigin(0.5);
            rewardInfo.setDepth(5302);
            rewardInfo.setStroke('#2d5a2d', 1);
            rewardInfo.setAlpha(0);
            this.cameras.main.ignore(rewardInfo);
            this.checkinModalElements.push(rewardInfo);

            this.tweens.add({ targets: rewardInfo, alpha: 1, duration: 150, delay: 250 });

            // 7-day streak bonus info
            const bonusInfo = this.add.text(modalX, infoY + 30, '7-day streak = Mushroom Seed!', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#fbbf24',
                resolution: 2
            });
            bonusInfo.setOrigin(0.5);
            bonusInfo.setDepth(5302);
            bonusInfo.setStroke('#5D4037', 1);
            bonusInfo.setAlpha(0);
            this.cameras.main.ignore(bonusInfo);
            this.checkinModalElements.push(bonusInfo);

            this.tweens.add({ targets: bonusInfo, alpha: 1, duration: 150, delay: 300 });

            // Close button
            const closeBtnBg = this.add.sprite(modalX + modalWidth / 2 - 20, modalY - modalHeight / 2 + 20, 'square-buttons', 7);
            closeBtnBg.setDisplaySize(24, 24);
            closeBtnBg.setDepth(5302);
            closeBtnBg.setAlpha(0);
            closeBtnBg.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(closeBtnBg);
            this.checkinModalElements.push(closeBtnBg);

            const closeText = this.add.text(modalX + modalWidth / 2 - 20, modalY - modalHeight / 2 + 20, 'X', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            closeText.setOrigin(0.5);
            closeText.setDepth(5303);
            closeText.setStroke('#5D4037', 1);
            closeText.setAlpha(0);
            this.cameras.main.ignore(closeText);
            this.checkinModalElements.push(closeText);

            this.tweens.add({
                targets: [closeBtnBg, closeText],
                alpha: 1,
                duration: 150
            });

            closeBtnBg.on('pointerdown', () => this.closeCheckinModal());
            closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
            closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());
        });

        // Close on overlay click
        overlay.on('pointerdown', () => this.closeCheckinModal());
    }

    private performCheckin(dayIndex: number, dayBox: Phaser.GameObjects.Sprite, checkText: Phaser.GameObjects.Text, checkinData: { checkedDays: number[]; lastCheckin: string; streak: number }) {
        // Update check-in data
        const today = this.getTodayString();

        // Calculate streak
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;

        let newStreak = 1;
        if (checkinData.lastCheckin === yesterdayString) {
            newStreak = checkinData.streak + 1;
        }

        // Update checked days for this week
        if (!checkinData.checkedDays.includes(dayIndex)) {
            checkinData.checkedDays.push(dayIndex);
        }

        // Save
        this.saveCheckinData({
            checkedDays: checkinData.checkedDays,
            lastCheckin: today,
            streak: newStreak
        });

        // Update UI
        dayBox.setTint(0x4ade80);
        checkText.setText('✓');
        checkText.setFontSize(12);
        dayBox.disableInteractive();

        // Animate check
        this.tweens.add({
            targets: dayBox,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 100,
            yoyo: true
        });

        // Give reward: +1 water
        const wateringCanItem = this.toolbarItems.find(item => item.name === 'wateringCan');
        if (wateringCanItem) {
            wateringCanItem.count = (wateringCanItem.count || 0) + 1;
        }

        // Show reward notification
        this.showCheckinReward('+1 Water!', 0x4ade80);

        // Check for 7-day streak bonus
        if (newStreak >= 7 && newStreak % 7 === 0) {
            // Give mushroom seed
            this.seedCounts.mushroom += 1;

            // Show bonus notification after delay
            this.time.delayedCall(1000, () => {
                this.showCheckinReward('+1 Mushroom Seed!', 0xfbbf24);
            });
        }

        // Update toolbar display
        this.updateToolbar();
    }

    private showCheckinReward(text: string, color: number) {
        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;

        const rewardText = this.add.text(screenWidth / 2, screenHeight / 2 - 40, text, {
            fontSize: '16px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        rewardText.setOrigin(0.5);
        rewardText.setDepth(5400);
        rewardText.setStroke('#000000', 3);
        rewardText.setTint(color);
        this.cameras.main.ignore(rewardText);

        // Float up and fade out
        this.tweens.add({
            targets: rewardText,
            y: screenHeight / 2 - 80,
            alpha: 0,
            duration: 1500,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                rewardText.destroy();
            }
        });
    }

    private closeCheckinModal() {
        this.checkinModalOpen = false;
        this.checkinModalElements.forEach(el => el.destroy());
        this.checkinModalElements = [];
    }

    private createMailbox() {
        // Place mailbox to the right of factory
        const centerX = 25;
        const centerY = 25;
        const factoryY = (centerY - 5) * this.TILE_SIZE;
        const mailboxX = (centerX + 4) * this.TILE_SIZE + this.TILE_SIZE / 2; // 3 tiles right of center
        const mailboxY = factoryY + 16; // Aligned with factory, lower to cover base

        // Create mailbox animation (slower)
        this.anims.create({
            key: 'mailbox-idle',
            frames: this.anims.generateFrameNumbers('mailbox', { start: 0, end: 4 }),
            frameRate: 3,
            repeat: -1
        });

        // Create mailbox sprite (larger size)
        this.mailboxSprite = this.add.sprite(mailboxX, mailboxY, 'mailbox');
        this.mailboxSprite.setDisplaySize(32, 32);
        this.mailboxSprite.setDepth(mailboxY + 16);
        this.mailboxSprite.setInteractive({ useHandCursor: true });
        this.mailboxSprite.play('mailbox-idle');

        // Click handler
        this.mailboxSprite.on('pointerdown', () => {
            this.openMailboxModal();
        });

        // Hover effects
        this.mailboxSprite.on('pointerover', () => {
            this.mailboxSprite.setTint(0xffff88);
        });

        this.mailboxSprite.on('pointerout', () => {
            this.mailboxSprite.clearTint();
        });

        // Make UI camera ignore
        this.uiCamera?.ignore(this.mailboxSprite);

        // Add decorative bushes below mailbox
        const bushY = mailboxY + 16;
        const bushFrame1 = 27; // Bush sprite frame
        const bushFrame2 = 28; // Another bush sprite frame

        // Left bush
        const leftBush = this.add.sprite(mailboxX - 12, bushY, 'basic-plants', bushFrame1);
        leftBush.setOrigin(0.5);
        leftBush.setDepth(bushY);
        this.uiCamera?.ignore(leftBush);

        // Right bush
        const rightBush = this.add.sprite(mailboxX + 12, bushY, 'basic-plants', bushFrame2);
        rightBush.setOrigin(0.5);
        rightBush.setDepth(bushY);
        this.uiCamera?.ignore(rightBush);

        // Center bush (slightly lower)
        const centerBush = this.add.sprite(mailboxX, bushY + 6, 'basic-plants', bushFrame1);
        centerBush.setOrigin(0.5);
        centerBush.setDepth(bushY + 6);
        this.uiCamera?.ignore(centerBush);
    }

    private openMailboxModal() {
        if (this.mailboxModalOpen) return;
        this.mailboxModalOpen = true;
        this.mailboxActiveTab = 'missions';

        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const modalWidth = 300;
        const modalHeight = 280;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.6);
        overlay.setDepth(5300);
        overlay.setInteractive();
        this.cameras.main.ignore(overlay);
        this.mailboxModalElements.push(overlay);

        // Modal background
        const modalBg = this.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5301);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.cameras.main.ignore(modalBg);
        this.mailboxModalElements.push(modalBg);

        // Animate modal
        modalBg.setScale(0);
        this.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.time.delayedCall(100, () => {
            // Title
            const title = this.add.text(modalX, modalY - modalHeight / 2 + 35, 'Mailbox', {
                fontSize: '14px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            title.setOrigin(0.5);
            title.setDepth(5302);
            title.setStroke('#5D4037', 2);
            title.setAlpha(0);
            this.cameras.main.ignore(title);
            this.mailboxModalElements.push(title);
            this.tweens.add({ targets: title, alpha: 1, duration: 150 });

            // Tab buttons
            const tabY = modalY - modalHeight / 2 + 65;
            const tabWidth = 90;
            const tabHeight = 26;

            // Missions tab
            const missionsTabBg = this.add.sprite(modalX - 55, tabY, 'square-buttons', 6);
            missionsTabBg.setDisplaySize(tabWidth, tabHeight);
            missionsTabBg.setDepth(5302);
            missionsTabBg.setAlpha(0);
            missionsTabBg.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(missionsTabBg);
            this.mailboxModalElements.push(missionsTabBg);

            const missionsTabText = this.add.text(modalX - 55, tabY, 'Missions', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            missionsTabText.setOrigin(0.5);
            missionsTabText.setDepth(5303);
            missionsTabText.setStroke('#5D4037', 1);
            missionsTabText.setAlpha(0);
            this.cameras.main.ignore(missionsTabText);
            this.mailboxModalElements.push(missionsTabText);

            // Redeem tab
            const redeemTabBg = this.add.sprite(modalX + 55, tabY, 'square-buttons', 7);
            redeemTabBg.setDisplaySize(tabWidth, tabHeight);
            redeemTabBg.setDepth(5302);
            redeemTabBg.setAlpha(0);
            redeemTabBg.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(redeemTabBg);
            this.mailboxModalElements.push(redeemTabBg);

            const redeemTabText = this.add.text(modalX + 55, tabY, 'Redeem', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            redeemTabText.setOrigin(0.5);
            redeemTabText.setDepth(5303);
            redeemTabText.setStroke('#5D4037', 1);
            redeemTabText.setAlpha(0);
            this.cameras.main.ignore(redeemTabText);
            this.mailboxModalElements.push(redeemTabText);

            this.tweens.add({
                targets: [missionsTabBg, missionsTabText, redeemTabBg, redeemTabText],
                alpha: 1,
                duration: 150
            });

            // Content area
            const contentY = modalY + 20;
            const contentElements: Phaser.GameObjects.GameObject[] = [];

            // Function to show missions tab content
            const showMissionsContent = () => {
                // Clear previous content
                contentElements.forEach(el => el.destroy());
                contentElements.length = 0;

                missionsTabBg.setTexture('square-buttons', 6);
                redeemTabBg.setTexture('square-buttons', 7);

                // Sample missions list
                const missions = [
                    { name: 'Water 5 plants', progress: '3/5', done: false },
                    { name: 'Harvest 3 crops', progress: '1/3', done: false },
                    { name: 'Check in today', progress: '1/1', done: true },
                ];

                missions.forEach((mission, index) => {
                    const missionY = contentY - 40 + index * 35;

                    const missionBg = this.add.sprite(modalX, missionY, 'square-buttons', mission.done ? 6 : 7);
                    missionBg.setDisplaySize(240, 28);
                    missionBg.setDepth(5302);
                    if (mission.done) missionBg.setTint(0x4ade80);
                    this.cameras.main.ignore(missionBg);
                    this.mailboxModalElements.push(missionBg);
                    contentElements.push(missionBg);

                    const missionText = this.add.text(modalX - 50, missionY, mission.name, {
                        fontSize: '9px',
                        fontFamily: 'PixelFont',
                        color: '#FFFFFF',
                        resolution: 2
                    });
                    missionText.setOrigin(0, 0.5);
                    missionText.setDepth(5303);
                    missionText.setStroke('#5D4037', 1);
                    this.cameras.main.ignore(missionText);
                    this.mailboxModalElements.push(missionText);
                    contentElements.push(missionText);

                    const progressText = this.add.text(modalX + 90, missionY, mission.done ? '✓' : mission.progress, {
                        fontSize: '9px',
                        fontFamily: 'PixelFont',
                        color: mission.done ? '#4ade80' : '#FFF8E1',
                        resolution: 2
                    });
                    progressText.setOrigin(0.5);
                    progressText.setDepth(5303);
                    progressText.setStroke('#5D4037', 1);
                    this.cameras.main.ignore(progressText);
                    this.mailboxModalElements.push(progressText);
                    contentElements.push(progressText);
                });
            };

            // Function to show redeem tab content
            const showRedeemContent = () => {
                // Clear previous content
                contentElements.forEach(el => el.destroy());
                contentElements.length = 0;

                missionsTabBg.setTexture('square-buttons', 7);
                redeemTabBg.setTexture('square-buttons', 6);

                // Redeem code label
                const codeLabel = this.add.text(modalX, contentY - 50, 'Enter Redeem Code:', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    resolution: 2
                });
                codeLabel.setOrigin(0.5);
                codeLabel.setDepth(5302);
                codeLabel.setStroke('#5D4037', 2);
                this.cameras.main.ignore(codeLabel);
                this.mailboxModalElements.push(codeLabel);
                contentElements.push(codeLabel);

                // Create HTML input for redeem code
                const inputElement = document.createElement('input');
                inputElement.type = 'text';
                inputElement.placeholder = 'Enter code here...';
                inputElement.maxLength = 20;
                inputElement.style.cssText = `
                    position: fixed;
                    left: 50%;
                    top: 50%;
                    transform: translate(-70%, -10px);
                    width: 160px;
                    padding: 8px 12px;
                    font-size: 12px;
                    font-family: 'PixelFont', monospace;
                    border: 3px solid #5D4037;
                    border-radius: 8px;
                    background-color: #FFF8E1;
                    color: #5D4037;
                    outline: none;
                    text-align: center;
                    z-index: 10001;
                `;
                document.body.appendChild(inputElement);
                inputElement.focus();

                // Store reference for cleanup
                (this as unknown as { _redeemInput: HTMLInputElement })._redeemInput = inputElement;

                // QR Scan button
                const qrBtnBg = this.add.sprite(modalX + 95, contentY - 20, 'square-buttons', 6);
                qrBtnBg.setDisplaySize(40, 32);
                qrBtnBg.setDepth(5302);
                qrBtnBg.setInteractive({ useHandCursor: true });
                this.cameras.main.ignore(qrBtnBg);
                this.mailboxModalElements.push(qrBtnBg);
                contentElements.push(qrBtnBg);

                const qrText = this.add.text(modalX + 95, contentY - 20, 'QR', {
                    fontSize: '10px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    resolution: 2
                });
                qrText.setOrigin(0.5);
                qrText.setDepth(5303);
                qrText.setStroke('#5D4037', 1);
                this.cameras.main.ignore(qrText);
                this.mailboxModalElements.push(qrText);
                contentElements.push(qrText);

                qrBtnBg.on('pointerdown', () => {
                    this.openQRScanner(inputElement);
                });
                qrBtnBg.on('pointerover', () => qrBtnBg.setTint(0xcccccc));
                qrBtnBg.on('pointerout', () => qrBtnBg.clearTint());

                // Redeem button
                const redeemBtnBg = this.add.sprite(modalX, contentY + 40, 'square-buttons', 6);
                redeemBtnBg.setDisplaySize(120, 32);
                redeemBtnBg.setDepth(5302);
                redeemBtnBg.setInteractive({ useHandCursor: true });
                this.cameras.main.ignore(redeemBtnBg);
                this.mailboxModalElements.push(redeemBtnBg);
                contentElements.push(redeemBtnBg);

                const redeemBtnText = this.add.text(modalX, contentY + 40, 'Redeem', {
                    fontSize: '11px',
                    fontFamily: 'PixelFont',
                    color: '#FFFFFF',
                    resolution: 2
                });
                redeemBtnText.setOrigin(0.5);
                redeemBtnText.setDepth(5303);
                redeemBtnText.setStroke('#5D4037', 1);
                this.cameras.main.ignore(redeemBtnText);
                this.mailboxModalElements.push(redeemBtnText);
                contentElements.push(redeemBtnText);

                redeemBtnBg.on('pointerdown', () => {
                    const code = inputElement.value.trim();
                    if (code) {
                        this.processRedeemCode(code);
                        inputElement.value = '';
                    }
                });
                redeemBtnBg.on('pointerover', () => redeemBtnBg.setTint(0xcccccc));
                redeemBtnBg.on('pointerout', () => redeemBtnBg.clearTint());
            };

            // Tab click handlers
            missionsTabBg.on('pointerdown', () => {
                if (this.mailboxActiveTab !== 'missions') {
                    this.mailboxActiveTab = 'missions';
                    // Remove redeem input if exists
                    const redeemInput = (this as unknown as { _redeemInput?: HTMLInputElement })._redeemInput;
                    if (redeemInput && redeemInput.parentNode) {
                        redeemInput.parentNode.removeChild(redeemInput);
                    }
                    showMissionsContent();
                }
            });
            missionsTabBg.on('pointerover', () => missionsTabBg.setTint(0xcccccc));
            missionsTabBg.on('pointerout', () => missionsTabBg.clearTint());

            redeemTabBg.on('pointerdown', () => {
                if (this.mailboxActiveTab !== 'redeem') {
                    this.mailboxActiveTab = 'redeem';
                    showRedeemContent();
                }
            });
            redeemTabBg.on('pointerover', () => redeemTabBg.setTint(0xcccccc));
            redeemTabBg.on('pointerout', () => redeemTabBg.clearTint());

            // Show initial content (missions tab)
            showMissionsContent();

            // Close button
            const closeBtnBg = this.add.sprite(modalX + modalWidth / 2 - 20, modalY - modalHeight / 2 + 20, 'square-buttons', 7);
            closeBtnBg.setDisplaySize(24, 24);
            closeBtnBg.setDepth(5302);
            closeBtnBg.setAlpha(0);
            closeBtnBg.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(closeBtnBg);
            this.mailboxModalElements.push(closeBtnBg);

            const closeText = this.add.text(modalX + modalWidth / 2 - 20, modalY - modalHeight / 2 + 20, 'X', {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            closeText.setOrigin(0.5);
            closeText.setDepth(5303);
            closeText.setStroke('#5D4037', 1);
            closeText.setAlpha(0);
            this.cameras.main.ignore(closeText);
            this.mailboxModalElements.push(closeText);

            this.tweens.add({
                targets: [closeBtnBg, closeText],
                alpha: 1,
                duration: 150
            });

            closeBtnBg.on('pointerdown', () => this.closeMailboxModal());
            closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
            closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());
        });

        // Close on overlay click
        overlay.on('pointerdown', () => this.closeMailboxModal());
    }

    private qrScannerContainer: HTMLDivElement | null = null;

    private async openQRScanner(inputElement: HTMLInputElement) {
        // Dynamically import html5-qrcode
        const { Html5Qrcode } = await import('html5-qrcode');

        // Create scanner container
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

        // Scanner element
        const scannerElement = document.createElement('div');
        scannerElement.id = 'qr-reader';
        scannerElement.style.cssText = `
            width: 300px;
            height: 300px;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
        `;

        // Title
        const title = document.createElement('div');
        title.textContent = 'Scan QR Code';
        title.style.cssText = `
            color: white;
            font-family: 'PixelFont', monospace;
            font-size: 18px;
            margin-bottom: 20px;
        `;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `
            margin-top: 20px;
            padding: 12px 30px;
            font-family: 'PixelFont', monospace;
            font-size: 14px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
        `;

        this.qrScannerContainer.appendChild(title);
        this.qrScannerContainer.appendChild(scannerElement);
        this.qrScannerContainer.appendChild(closeBtn);
        document.body.appendChild(this.qrScannerContainer);

        // Initialize scanner
        const html5QrCode = new Html5Qrcode('qr-reader');

        const qrCodeSuccessCallback = (decodedText: string) => {
            // Stop scanner
            html5QrCode.stop().then(() => {
                // Set the scanned code to input
                inputElement.value = decodedText;
                this.showToastMessage('QR Code scanned!', 0x4ade80);
                this.closeQRScanner();
            }).catch((err: Error) => {
                console.error('Error stopping scanner:', err);
            });
        };

        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        // Start scanner with back camera
        html5QrCode.start(
            { facingMode: 'environment' },
            config,
            qrCodeSuccessCallback,
            () => {} // Ignore errors during scanning
        ).catch((err: Error) => {
            console.error('Error starting scanner:', err);
            this.showToastMessage('Camera access denied', 0xef4444);
            this.closeQRScanner();
        });

        // Close button handler
        closeBtn.addEventListener('click', () => {
            html5QrCode.stop().then(() => {
                this.closeQRScanner();
            }).catch(() => {
                this.closeQRScanner();
            });
        });
    }

    private closeQRScanner() {
        if (this.qrScannerContainer && this.qrScannerContainer.parentNode) {
            this.qrScannerContainer.parentNode.removeChild(this.qrScannerContainer);
        }
        this.qrScannerContainer = null;
    }

    private processRedeemCode(code: string) {
        // Sample redeem codes - in production, validate against backend
        const validCodes: Record<string, { reward: string; water?: number; seed?: PlantType; fertilizer?: number; icon?: string }> = {
            'WATER10': { reward: '+10 Water', water: 10, icon: 'icon-watercan' },
            'MUSHROOM': { reward: '+1 Mushroom Seed', seed: 'mushroom', icon: 'mushroom-seed' },
            'FERT5': { reward: '+5 Fertilizer', fertilizer: 5, icon: 'icon-fertilizer' },
            '111111': { reward: '+1 Social Seed', seed: 'social', icon: 'social-seed' },
        };

        const upperCode = code.toUpperCase();
        // Also check original code for numeric codes like '111111'
        const rewardData = validCodes[upperCode] || validCodes[code];

        if (rewardData) {
            // Apply rewards
            if (rewardData.water) {
                const wateringCanItem = this.toolbarItems.find(item => item.name === 'wateringCan');
                if (wateringCanItem) {
                    wateringCanItem.count = (wateringCanItem.count || 0) + rewardData.water;
                }
            }
            if (rewardData.seed) {
                this.seedCounts[rewardData.seed] += 1;
            }
            if (rewardData.fertilizer) {
                const fertilizerItem = this.toolbarItems.find(item => item.name === 'fertilizer');
                if (fertilizerItem) {
                    fertilizerItem.count = (fertilizerItem.count || 0) + rewardData.fertilizer;
                }
            }

            this.updateToolbar();
            this.showRedeemResultModal(true, rewardData.reward, rewardData.icon);
        } else {
            this.showRedeemResultModal(false, 'Invalid Code');
        }
    }

    private redeemResultModalElements: Phaser.GameObjects.GameObject[] = [];

    private showRedeemResultModal(success: boolean, message: string, icon?: string) {
        // Clear any existing result modal first
        this.closeRedeemResultModal();

        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;
        const modalWidth = 180;
        const modalHeight = 140;

        // Hide the redeem input while showing result modal
        const redeemInput = (this as unknown as { _redeemInput?: HTMLInputElement })._redeemInput;
        if (redeemInput) {
            redeemInput.style.display = 'none';
        }

        // Hide mailbox modal elements while showing result
        this.mailboxModalElements.forEach(el => {
            if (el && 'setVisible' in el) {
                (el as Phaser.GameObjects.Sprite).setVisible(false);
            }
        });

        // Overlay
        const overlay = this.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.5);
        overlay.setDepth(5500);
        overlay.setInteractive();
        this.cameras.main.ignore(overlay);
        this.redeemResultModalElements.push(overlay);

        // Modal background - use settings-panel frame 1 (same as mailbox)
        const modalBg = this.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5501);
        this.cameras.main.ignore(modalBg);
        this.redeemResultModalElements.push(modalBg);

        // Scale animation
        modalBg.setScale(0);
        this.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.time.delayedCall(100, () => {
            // Title
            const titleText = success ? 'Success!' : 'Failed';
            const strokeColor = success ? '#2d7a3d' : '#8b1a1a';

            const title = this.add.text(modalX, modalY - 45, titleText, {
                fontSize: '14px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            title.setOrigin(0.5);
            title.setDepth(5502);
            title.setStroke(strokeColor, 3);
            this.cameras.main.ignore(title);
            this.redeemResultModalElements.push(title);

            // Icon (if success and icon provided)
            if (success && icon) {
                const iconSprite = this.add.image(modalX, modalY - 5, icon);
                iconSprite.setDisplaySize(40, 40);
                iconSprite.setDepth(5502);
                iconSprite.setAlpha(0);
                this.cameras.main.ignore(iconSprite);
                this.redeemResultModalElements.push(iconSprite);

                this.tweens.add({
                    targets: iconSprite,
                    alpha: 1,
                    duration: 150,
                    onComplete: () => {
                        // Add bounce animation to icon
                        this.tweens.add({
                            targets: iconSprite,
                            y: modalY - 10,
                            yoyo: true,
                            repeat: 2,
                            duration: 150,
                            ease: 'Quad.easeInOut'
                        });
                    }
                });
            } else if (!success) {
                // Show X icon for failure
                const failIcon = this.add.text(modalX, modalY - 5, '✗', {
                    fontSize: '32px',
                    fontFamily: 'PixelFont',
                    color: '#ef4444',
                    resolution: 2
                });
                failIcon.setOrigin(0.5);
                failIcon.setDepth(5502);
                failIcon.setAlpha(0);
                this.cameras.main.ignore(failIcon);
                this.redeemResultModalElements.push(failIcon);
                this.tweens.add({ targets: failIcon, alpha: 1, duration: 150 });
            }

            // Message
            const msgText = this.add.text(modalX, modalY + 30, message, {
                fontSize: '10px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2,
                align: 'center'
            });
            msgText.setOrigin(0.5);
            msgText.setDepth(5502);
            msgText.setStroke('#5D4037', 2);
            msgText.setAlpha(0);
            this.cameras.main.ignore(msgText);
            this.redeemResultModalElements.push(msgText);
            this.tweens.add({ targets: msgText, alpha: 1, duration: 150 });

            // OK Button
            const okBtnBg = this.add.sprite(modalX, modalY + 55, 'square-buttons', 6);
            okBtnBg.setDisplaySize(70, 28);
            okBtnBg.setDepth(5502);
            okBtnBg.setAlpha(0);
            okBtnBg.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(okBtnBg);
            this.redeemResultModalElements.push(okBtnBg);

            const okText = this.add.text(modalX, modalY + 55, 'OK', {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            okText.setOrigin(0.5);
            okText.setDepth(5503);
            okText.setStroke('#5D4037', 2);
            okText.setAlpha(0);
            this.cameras.main.ignore(okText);
            this.redeemResultModalElements.push(okText);

            this.tweens.add({
                targets: [okBtnBg, okText],
                alpha: 1,
                duration: 150
            });

            okBtnBg.on('pointerdown', () => this.closeRedeemResultModal());
            okBtnBg.on('pointerover', () => okBtnBg.setTint(0xcccccc));
            okBtnBg.on('pointerout', () => okBtnBg.clearTint());
        });

        // Close on overlay click
        overlay.on('pointerdown', () => this.closeRedeemResultModal());
    }

    private closeRedeemResultModal() {
        this.redeemResultModalElements.forEach(el => {
            if (el && el.destroy) {
                el.destroy();
            }
        });
        this.redeemResultModalElements = [];

        // Show mailbox modal elements again
        this.mailboxModalElements.forEach(el => {
            if (el && 'setVisible' in el) {
                (el as Phaser.GameObjects.Sprite).setVisible(true);
            }
        });

        // Show the redeem input again
        const redeemInput = (this as unknown as { _redeemInput?: HTMLInputElement })._redeemInput;
        if (redeemInput) {
            redeemInput.style.display = 'block';
            redeemInput.value = ''; // Clear the input
        }
    }

    // Simple toast message for QR scanner feedback
    private showToastMessage(text: string, color: number) {
        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;

        const msgText = this.add.text(screenWidth / 2, screenHeight / 2 + 80, text, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        msgText.setOrigin(0.5);
        msgText.setDepth(5600);
        msgText.setStroke('#000000', 2);
        msgText.setTint(color);
        this.cameras.main.ignore(msgText);

        this.tweens.add({
            targets: msgText,
            y: screenHeight / 2 + 60,
            alpha: 0,
            duration: 1500,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                msgText.destroy();
            }
        });
    }

    private closeMailboxModal() {
        this.mailboxModalOpen = false;

        // Remove HTML input if exists
        const redeemInput = (this as unknown as { _redeemInput?: HTMLInputElement })._redeemInput;
        if (redeemInput && redeemInput.parentNode) {
            redeemInput.parentNode.removeChild(redeemInput);
        }
        (this as unknown as { _redeemInput?: HTMLInputElement })._redeemInput = undefined;

        // Destroy all modal elements
        this.mailboxModalElements.forEach(el => el.destroy());
        this.mailboxModalElements = [];
    }

    private toggleFactoryModal() {
        if (this.factoryModalOpen) {
            this.closeFactoryModal();
        } else {
            this.openFactoryModal();
        }
    }

    private openFactoryModal() {
        this.closeFactoryModal();
        this.factoryModalOpen = true;
        this.closeSeedSelector();
        this.closeChestPanel();

        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;

        // Panel dimensions
        const panelWidth = 220;
        const panelHeight = 200;
        const panelX = screenWidth / 2;
        const panelY = screenHeight / 2 - 30;

        // Background panel
        const panelBg = this.add.sprite(panelX, panelY, 'settings-panel', 1);
        panelBg.setDisplaySize(panelWidth, panelHeight);
        panelBg.setDepth(5300);
        panelBg.setAlpha(0);
        panelBg.setInteractive(); // Block clicks through panel
        panelBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.cameras.main.ignore(panelBg);
        this.factoryModalElements.push(panelBg);

        // Animate panel in
        this.tweens.add({
            targets: panelBg,
            alpha: 1,
            scaleX: panelWidth / 125,
            scaleY: panelHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        // const title = this.add.text(panelX, panelY - panelHeight/2 , 'FACTORY', {
        //     fontSize: '14px',
        //     color: '#5D4037',
        //     fontStyle: 'bold'
        // });
        // title.setOrigin(0.5);
        // title.setDepth(5301);
        // title.setAlpha(0);
        // this.cameras.main.ignore(title);
        // this.factoryModalElements.push(title);

        // this.tweens.add({
        //     targets: title,
        //     alpha: 1,
        //     duration: 200,
        //     delay: 100
        // });

        // Subtitle
        const subtitle = this.add.text(panelX, panelY - panelHeight/2 + 38, '3 Fruits = 1 Fertilizer', {
            fontSize: '10px',
            color: '#8D6E63'
        });
        subtitle.setOrigin(0.5);
        subtitle.setDepth(5301);
        subtitle.setAlpha(0);
        this.cameras.main.ignore(subtitle);
        this.factoryModalElements.push(subtitle);

        this.tweens.add({
            targets: subtitle,
            alpha: 1,
            duration: 200,
            delay: 100
        });

        // Create fruit selection buttons (2x2 grid)
        const buttonSize = 48;
        const buttonSpacing = 10;
        const gridWidth = 2 * buttonSize + buttonSpacing;
        const gridStartX = panelX - gridWidth / 2 + buttonSize / 2;
        const gridStartY = panelY - 30; // Move up to avoid close button

        this.time.delayedCall(150, () => {
            PLANT_TYPES.forEach((plantType, index) => {
                // 2x2 grid: row = index / 2, col = index % 2
                const row = Math.floor(index / 2);
                const col = index % 2;
                const btnX = gridStartX + col * (buttonSize + buttonSpacing);
                const btnY = gridStartY + row * (buttonSize + buttonSpacing);

                // Get fruit count from chest for this type
                const fruitCount = this.getFruitCountInChest(plantType);
                const canConvert = fruitCount >= this.FRUITS_PER_FERTILIZER;

                // Button background
                const btnBg = this.add.sprite(btnX, btnY, 'square-buttons', canConvert ? 6 : 7);
                btnBg.setDisplaySize(buttonSize, buttonSize);
                btnBg.setDepth(5302);
                btnBg.setAlpha(0);
                this.cameras.main.ignore(btnBg);
                this.factoryModalElements.push(btnBg);

                if (canConvert) {
                    btnBg.setInteractive({ useHandCursor: true });
                    btnBg.on('pointerover', () => btnBg.setFrame(4));
                    btnBg.on('pointerout', () => btnBg.setFrame(6));
                    btnBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                        event.stopPropagation();
                        this.convertFruitToFertilizer(plantType);
                    });
                }

                this.tweens.add({
                    targets: btnBg,
                    alpha: 1,
                    duration: 100,
                    delay: index * 50
                });

                // Fruit icon
                const cropDef = CROP_DEFINITIONS[plantType];
                const fruitIcon = this.add.image(btnX, btnY - 5, cropDef.fruitImage);
                fruitIcon.setDisplaySize(buttonSize - 12, buttonSize - 12);
                fruitIcon.setDepth(5303);
                fruitIcon.setAlpha(0);
                if (!canConvert) fruitIcon.setTint(0x666666);
                this.cameras.main.ignore(fruitIcon);
                this.factoryModalElements.push(fruitIcon);

                this.tweens.add({
                    targets: fruitIcon,
                    alpha: 1,
                    duration: 100,
                    delay: index * 50
                });

                // Count text
                const countText = this.add.text(btnX + buttonSize/2 - 4, btnY + buttonSize/2 - 4, fruitCount.toString(), {
                    fontSize: '12px',
                    color: canConvert ? '#ffffff' : '#ff6666',
                    backgroundColor: '#000000cc',
                    padding: { x: 3, y: 1 }
                });
                countText.setOrigin(1, 1);
                countText.setDepth(5304);
                countText.setAlpha(0);
                this.cameras.main.ignore(countText);
                this.factoryModalElements.push(countText);

                this.tweens.add({
                    targets: countText,
                    alpha: 1,
                    duration: 100,
                    delay: index * 50
                });
            });

            // Close button at bottom
            const closeBtn = this.add.text(panelX, panelY + panelHeight/2 - 25, 'Close', {
                fontSize: '12px',
                color: '#5D4037',
                backgroundColor: '#D7CCC8',
                padding: { x: 12, y: 4 }
            });
            closeBtn.setOrigin(0.5);
            closeBtn.setDepth(5305);
            closeBtn.setAlpha(0);
            closeBtn.setInteractive({ useHandCursor: true });
            closeBtn.on('pointerover', () => closeBtn.setBackgroundColor('#BCAAA4'));
            closeBtn.on('pointerout', () => closeBtn.setBackgroundColor('#D7CCC8'));
            closeBtn.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                event.stopPropagation();
                this.closeFactoryModal();
            });
            this.cameras.main.ignore(closeBtn);
            this.factoryModalElements.push(closeBtn);

            this.tweens.add({
                targets: closeBtn,
                alpha: 1,
                duration: 150
            });
        });
    }

    private closeFactoryModal() {
        this.factoryModalOpen = false;
        this.factoryModalElements.forEach(el => el.destroy());
        this.factoryModalElements = [];
    }

    private getFruitCountInChest(fruitType: PlantType): number {
        let total = 0;
        for (const slot of this.chestInventory) {
            if (slot && slot.type === fruitType) {
                total += slot.count;
            }
        }
        return total;
    }

    private removeFruitsFromChest(fruitType: PlantType, amount: number): boolean {
        let remaining = amount;
        for (let i = 0; i < this.chestInventory.length && remaining > 0; i++) {
            const slot = this.chestInventory[i];
            if (slot && slot.type === fruitType && slot.count > 0) {
                const toRemove = Math.min(slot.count, remaining);
                slot.count -= toRemove;
                remaining -= toRemove;

                // Clear empty slot
                if (slot.count <= 0) {
                    this.chestInventory[i] = { type: fruitType, count: 0 };
                }
            }
        }
        return remaining === 0;
    }

    private convertFruitToFertilizer(fruitType: PlantType) {
        const fruitCount = this.getFruitCountInChest(fruitType);
        if (fruitCount < this.FRUITS_PER_FERTILIZER) {
            console.log('Not enough', fruitType, 'fruits to convert!');
            return;
        }

        // Check if factory is already working
        if (this.factoryWorking) {
            console.log('Factory is busy!');
            return;
        }

        // Remove fruits from chest
        if (this.removeFruitsFromChest(fruitType, this.FRUITS_PER_FERTILIZER)) {
            // Close modal and start factory animation
            this.closeFactoryModal();

            // Play factory working animation (5 seconds)
            this.playFactoryWorkingAnimation();

            // Update toolbar to show reduced fruit count
            this.updateToolbar();

            console.log('Factory started! Converting 3', fruitType, 'fruits to fertilizer...');
        }
    }

    private playFactoryWorkingAnimation() {
        this.factoryWorking = true;
        let frame = 3;

        // Animate between frames 3-4 for 5 seconds
        const workingAnim = this.time.addEvent({
            delay: 150,
            callback: () => {
                frame = frame === 3 ? 4 : 3;
                this.factorySprite.setTexture(`factory-${frame}`);
            },
            loop: true
        });

        // After 5 seconds, stop animation and spawn fertilizer bag
        this.time.delayedCall(5000, () => {
            this.factoryWorking = false;
            this.factorySprite.setTexture('factory-1');
            workingAnim.destroy();

            // Spawn fertilizer bag next to factory
            this.spawnFertilizerBag();

            console.log('Factory finished! Fertilizer bag spawned.');
        });
    }

    private spawnFertilizerBag() {
        // Get factory position
        const centerX = 25;
        const centerY = 25;
        const factoryX = centerX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const factoryY = (centerY - 5) * this.TILE_SIZE;

        // Spawn bag to the right of factory
        const bagX = factoryX + 40;
        const bagY = factoryY + 20;

        const fertilizerBag = this.add.sprite(bagX, bagY, 'icon-fertilizer');
        fertilizerBag.setDepth(bagY);
        fertilizerBag.setInteractive({ useHandCursor: true });

        // Calculate scale to achieve 24x24 display size
        const targetSize = 24;
        const originalWidth = fertilizerBag.width;
        const targetScale = targetSize / originalWidth;

        // Start at scale 0 for pop-in animation
        fertilizerBag.setScale(0);

        // Add pickup interaction
        fertilizerBag.on('pointerdown', () => {
            this.pickupFertilizer(fertilizerBag);
        });

        // Pop-in animation to target scale
        this.tweens.add({
            targets: fertilizerBag,
            scaleX: targetScale,
            scaleY: targetScale,
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Add floating animation after pop-in
                this.tweens.add({
                    targets: fertilizerBag,
                    y: bagY - 5,
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        });

        this.droppedFertilizers.push(fertilizerBag);

        // Make UI camera ignore this
        this.uiCamera?.ignore(fertilizerBag);
    }

    private pickupFertilizer(bag: Phaser.GameObjects.Sprite) {
        // Check if player is close enough
        const distance = Phaser.Math.Distance.Between(
            this.player.x, this.player.y,
            bag.x, bag.y
        );

        if (distance > 50) {
            console.log('Too far to pick up!');
            return;
        }

        // Add fertilizer to inventory
        const fertilizer = this.toolbarItems.find(item => item.name === 'fertilizer');
        if (fertilizer && fertilizer.count !== undefined) {
            fertilizer.count++;
            this.updateToolbar();
        }

        // Remove bag with animation
        this.tweens.add({
            targets: bag,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            y: bag.y - 20,
            duration: 200,
            onComplete: () => {
                bag.destroy();
                const index = this.droppedFertilizers.indexOf(bag);
                if (index > -1) {
                    this.droppedFertilizers.splice(index, 1);
                }
            }
        });

        console.log('Picked up fertilizer!');
    }

    private createPlayer() {
        // Spawn player in the center of the rectangle (around row 25, col 25)
        const spawnX = 25;
        const spawnY = 25;

        // Create player sprite
        this.player = this.physics.add.sprite(
            spawnX * this.TILE_SIZE,
            spawnY * this.TILE_SIZE,
            'player'
        );

        this.player.setCollideWorldBounds(true);
        this.player.setDepth(this.player.y); // Dynamic depth based on Y position

        // Create animations
        this.createPlayerAnimations();

        // Play idle animation
        this.player.play('idle-down');
    }

    private createPlayerAnimations() {
        const frameRate = 6;

        // Spritesheet layout (4x4 grid, 16 frames total):
        // Frame 0-1: idle front (down)
        // Frame 2-3: walk front (down)
        // Frame 4-5: idle back (up)
        // Frame 6-7: walk back (up)
        // Frame 8-9: idle left
        // Frame 10-11: walk left
        // Frame 12-13: idle right
        // Frame 14-15: walk right

        // Idle front (down)
        this.anims.create({
            key: 'idle-down',
            frames: this.anims.generateFrameNumbers('player', { start: 0, end: 1 }),
            frameRate: 2,
            repeat: -1
        });

        // Walk front (down)
        this.anims.create({
            key: 'walk-down',
            frames: this.anims.generateFrameNumbers('player', { start: 2, end: 3 }),
            frameRate: frameRate,
            repeat: -1
        });

        // Idle back (up)
        this.anims.create({
            key: 'idle-up',
            frames: this.anims.generateFrameNumbers('player', { start: 4, end: 5 }),
            frameRate: 2,
            repeat: -1
        });

        // Walk back (up)
        this.anims.create({
            key: 'walk-up',
            frames: this.anims.generateFrameNumbers('player', { start: 6, end: 7 }),
            frameRate: frameRate,
            repeat: -1
        });

        // Idle left
        this.anims.create({
            key: 'idle-left',
            frames: this.anims.generateFrameNumbers('player', { start: 8, end: 9 }),
            frameRate: 2,
            repeat: -1
        });

        // Walk left
        this.anims.create({
            key: 'walk-left',
            frames: this.anims.generateFrameNumbers('player', { start: 10, end: 11 }),
            frameRate: frameRate,
            repeat: -1
        });

        // Idle right
        this.anims.create({
            key: 'idle-right',
            frames: this.anims.generateFrameNumbers('player', { start: 12, end: 13 }),
            frameRate: 2,
            repeat: -1
        });

        // Walk right
        this.anims.create({
            key: 'walk-right',
            frames: this.anims.generateFrameNumbers('player', { start: 14, end: 15 }),
            frameRate: frameRate,
            repeat: -1
        });
    }

    private setupControls() {
        // Arrow keys
        this.cursors = this.input.keyboard!.createCursorKeys();

        // WASD keys
        this.wasdKeys = {
            up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        // Number keys for toolbar slots
        const key1 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        key1.on('down', () => this.selectToolbarSlot(0));

        const key2 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        key2.on('down', () => this.selectToolbarSlot(1));

        const key3 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
        key3.on('down', () => this.selectToolbarSlot(2));

        const key4 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
        key4.on('down', () => this.selectToolbarSlot(3));

        const key5 = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
        key5.on('down', () => this.selectToolbarSlot(4));

        // Debug key - press T to view tileset debug
        const keyT = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T);
        keyT.on('down', () => {
            this.scene.start('TilesetDebug');
        });
    }

    private initializeInventory() {
        // Seeds are already initialized in toolbarItems with count: 3
        // Initialize farm plot states for the 6 hardcoded plots
        const centerX = 25;
        const centerY = 25;
        const plotPositions = [
            { x: centerX - 1, y: centerY - 1 },
            { x: centerX, y: centerY - 1 },
            { x: centerX + 1, y: centerY - 1 },
            { x: centerX - 1, y: centerY },
            { x: centerX, y: centerY },
            { x: centerX + 1, y: centerY },
        ];

        plotPositions.forEach(pos => {
            const key = `${pos.x},${pos.y}`;
            this.farmLandStates.set(key, {
                tilled: true,
                planted: false,
                plantStage: 0,
                cropType: null
            });
        });
    }

    private createUI() {
        const uiX = 10;
        const uiY = 10;

        // Day and Time display (top left)
        this.timeText = this.add.text(uiX, uiY, '', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#00000088',
            padding: { x: 10, y: 5 }
        });
        this.timeText.setDepth(5005);
        this.cameras.main.ignore(this.timeText);
        this.updateTimeDisplay();

        // User Profile (top right)
        this.createUserProfileUI();

        // Toolbar (bottom center)
        this.createToolbar();
    }

    private createToolbar() {
        const slotSize = 48;
        const slotSpacing = 8;
        const numSlots = this.toolbarItems.length;
        const totalWidth = (slotSize + slotSpacing) * numSlots - slotSpacing;

        // Use actual screen dimensions for responsive UI
        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;

        const startX = (screenWidth - totalWidth) / 2;
        const startY = screenHeight - slotSize - 20;

        // Clear previous elements
        this.toolbarElements.forEach(el => el.destroy());
        this.toolbarElements = [];
        this.toolbarSlots = [];

        // Toolbar background
        const toolbarBg = this.add.rectangle(
            screenWidth / 2,
            startY + slotSize / 2,
            totalWidth + 24,
            slotSize + 20,
            0x5D4037,
            0.95
        );
        toolbarBg.setStrokeStyle(3, 0x3E2723);
        toolbarBg.setDepth(5000);
        this.cameras.main.ignore(toolbarBg);
        this.toolbarElements.push(toolbarBg);

        // Create slots
        for (let i = 0; i < numSlots; i++) {
            const slotX = startX + i * (slotSize + slotSpacing) + slotSize / 2;
            const slotY = startY + slotSize / 2;

            // Slot background
            const bg = this.add.sprite(slotX, slotY, 'square-buttons', 6);
            bg.setDisplaySize(slotSize, slotSize);
            bg.setDepth(5001);
            this.cameras.main.ignore(bg);
            this.toolbarElements.push(bg);
            this.toolbarSlots.push(bg);

            // Selection highlight
            if (i === this.selectedToolIndex) {
                const highlight = this.add.rectangle(slotX, slotY, slotSize + 6, slotSize + 6);
                highlight.setStrokeStyle(3, 0xFFD700);
                highlight.setFillStyle(0, 0);
                highlight.setDepth(5002);
                this.cameras.main.ignore(highlight);
                this.toolbarElements.push(highlight);
            }

            const item = this.toolbarItems[i];

            // Add icon based on item type
            if (item.type === 'seed') {
                // Get current selected seed type
                const selectedSeedType = PLANT_TYPES[this.selectedSeedIndex];
                const cropDef = CROP_DEFINITIONS[selectedSeedType];

                // Seed icon using the new image assets
                const icon = this.add.image(slotX, slotY, cropDef.seedImage);
                icon.setDisplaySize(slotSize - 8, slotSize - 8);
                icon.setDepth(5003);
                this.cameras.main.ignore(icon);
                this.toolbarElements.push(icon);

                // Small indicator arrow for seed selection
                const arrow = this.add.text(slotX + slotSize/2 - 6, slotY - slotSize/2 + 4, '▼', {
                    fontSize: '10px',
                    color: '#FFD700'
                });
                arrow.setDepth(5004);
                this.cameras.main.ignore(arrow);
                this.toolbarElements.push(arrow);

                // Count display - show count for currently selected seed type
                const currentSeedCount = this.seedCounts[selectedSeedType];
                const countText = this.add.text(
                    slotX + slotSize/2 - 4,
                    slotY + slotSize/2 - 4,
                    currentSeedCount.toString(),
                    {
                        fontSize: '14px',
                        color: currentSeedCount > 0 ? '#ffffff' : '#ff6666',
                        backgroundColor: '#000000cc',
                        padding: { x: 4, y: 2 }
                    }
                );
                countText.setOrigin(1, 1);
                countText.setDepth(5004);
                this.cameras.main.ignore(countText);
                this.toolbarElements.push(countText);
            } else if (item.name === 'chest') {
                // Chest icon - use spritesheet frame 0 (closed) or 4 (open)
                const chestFrame = this.chestOpen ? 4 : 0;
                const icon = this.add.sprite(slotX, slotY, 'chest', chestFrame);
                icon.setDisplaySize(slotSize + 50, slotSize +50); // Larger chest icon
                icon.setDepth(5003);
                this.cameras.main.ignore(icon);
                this.toolbarElements.push(icon);

                // Show total items in chest
                const totalItems = this.getTotalChestItems();
                if (totalItems > 0) {
                    const countText = this.add.text(
                        slotX + slotSize/2 - 4,
                        slotY + slotSize/2 - 4,
                        totalItems.toString(),
                        {
                            fontSize: '14px',
                            color: '#ffffff',
                            backgroundColor: '#000000cc',
                            padding: { x: 4, y: 2 }
                        }
                    );
                    countText.setOrigin(1, 1);
                    countText.setDepth(5004);
                    this.cameras.main.ignore(countText);
                    this.toolbarElements.push(countText);
                }
            } else {
                // Tool icons
                let iconKey = '';
                if (item.name === 'wateringCan') iconKey = 'icon-watercan';
                else if (item.name === 'hand') iconKey = 'icon-hand';
                else if (item.name === 'fertilizer') iconKey = 'icon-fertilizer';
                else if (item.name === 'digest') iconKey = 'icon-digest';

                if (iconKey) {
                    const icon = this.add.sprite(slotX, slotY, iconKey);
                    icon.setDisplaySize(slotSize - 12, slotSize - 12);
                    icon.setDepth(5003);
                    this.cameras.main.ignore(icon);
                    this.toolbarElements.push(icon);

                    // Count display
                    if (item.count !== undefined && item.count >= 0) {
                        const countText = this.add.text(
                            slotX + slotSize/2 - 4,
                            slotY + slotSize/2 - 4,
                            item.count.toString(),
                            {
                                fontSize: '14px',
                                color: '#ffffff',
                                backgroundColor: '#000000cc',
                                padding: { x: 4, y: 2 }
                            }
                        );
                        countText.setOrigin(1, 1);
                        countText.setDepth(5004);
                        this.cameras.main.ignore(countText);
                        this.toolbarElements.push(countText);
                    }
                }
            }

            // Make slot interactive
            bg.setInteractive();
            bg.on('pointerdown', () => {
                if (item.type === 'seed') {
                    // Toggle seed selector
                    this.toggleSeedSelector();
                    this.closeChestPanel();
                } else if (item.name === 'chest') {
                    // Toggle chest panel
                    this.toggleChestPanel();
                    this.closeSeedSelector();
                } else {
                    this.closeSeedSelector();
                    this.closeChestPanel();
                }
                this.selectToolbarSlot(i);
            });
        }
    }

    private toggleSeedSelector() {
        if (this.seedSelectorOpen) {
            this.closeSeedSelector();
        } else {
            this.openSeedSelector();
        }
    }

    private openSeedSelector() {
        this.closeSeedSelector();
        this.seedSelectorOpen = true;

        const slotSize = 48;
        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const numSlots = this.toolbarItems.length;
        const slotSpacing = 8;
        const totalWidth = (slotSize + slotSpacing) * numSlots - slotSpacing;
        const startX = (screenWidth - totalWidth) / 2;
        const startY = screenHeight - slotSize - 20;

        // Find seed slot position (index 2)
        const seedSlotIndex = this.toolbarItems.findIndex(item => item.type === 'seed');
        const seedSlotX = startX + seedSlotIndex * (slotSize + slotSpacing) + slotSize / 2;
        const selectorY = startY - 10;

        // Selector background
        const selectorBg = this.add.rectangle(
            seedSlotX,
            selectorY - (PLANT_TYPES.length * (slotSize + 4)) / 2,
            slotSize + 16,
            PLANT_TYPES.length * (slotSize + 4) + 8,
            0x5D4037,
            0.95
        );
        selectorBg.setStrokeStyle(2, 0x3E2723);
        selectorBg.setDepth(5100);
        this.cameras.main.ignore(selectorBg);
        this.seedSelectorElements.push(selectorBg);

        // Create seed options
        PLANT_TYPES.forEach((plantType, index) => {
            const cropDef = CROP_DEFINITIONS[plantType];
            const optionY = selectorY - (slotSize + 4) * (index + 1);

            // Option background
            const optionBg = this.add.sprite(seedSlotX, optionY, 'square-buttons',
                index === this.selectedSeedIndex ? 4 : 6);
            optionBg.setDisplaySize(slotSize, slotSize);
            optionBg.setDepth(5101);
            optionBg.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(optionBg);
            this.seedSelectorElements.push(optionBg);

            // Seed icon
            const icon = this.add.image(seedSlotX, optionY, cropDef.seedImage);
            icon.setDisplaySize(slotSize - 8, slotSize - 8);
            icon.setDepth(5102);
            this.cameras.main.ignore(icon);
            this.seedSelectorElements.push(icon);

            // Seed count for this type
            const seedCount = this.seedCounts[plantType];
            const countText = this.add.text(
                seedSlotX + slotSize/2 - 4,
                optionY + slotSize/2 - 4,
                seedCount.toString(),
                {
                    fontSize: '12px',
                    color: seedCount > 0 ? '#ffffff' : '#ff6666',
                    backgroundColor: '#000000cc',
                    padding: { x: 3, y: 1 }
                }
            );
            countText.setOrigin(1, 1);
            countText.setDepth(5103);
            this.cameras.main.ignore(countText);
            this.seedSelectorElements.push(countText);

            // Click handler
            optionBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
                event.stopPropagation();
                this.seedOptionJustClicked = true;
                this.selectedSeedIndex = index;
                this.closeSeedSelector();
                this.updateToolbar();
            });

            optionBg.on('pointerover', () => {
                optionBg.setFrame(4);
            });
            optionBg.on('pointerout', () => {
                optionBg.setFrame(index === this.selectedSeedIndex ? 4 : 6);
            });
        });
    }

    private closeSeedSelector() {
        this.seedSelectorOpen = false;
        this.seedSelectorElements.forEach(el => el.destroy());
        this.seedSelectorElements = [];
    }

    // ========== Chest Panel Methods ==========

    private toggleChestPanel() {
        if (this.chestOpen) {
            this.closeChestPanel();
        } else {
            this.openChestPanel();
        }
    }

    private openChestPanel() {
        this.closeChestPanel();
        this.chestOpen = true;
        this.updateToolbar(); // Update chest icon to open state

        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;

        // Get chest slot position for animation origin
        const slotSize = 48;
        const slotSpacing = 8;
        const numSlots = this.toolbarItems.length;
        const totalToolbarWidth = (slotSize + slotSpacing) * numSlots - slotSpacing;
        const toolbarStartX = (screenWidth - totalToolbarWidth) / 2;
        const chestSlotIndex = this.toolbarItems.findIndex(item => item.name === 'chest');
        const chestSlotX = toolbarStartX + chestSlotIndex * (slotSize + slotSpacing) + slotSize / 2;
        const chestSlotY = screenHeight - slotSize - 20 + slotSize / 2;

        // Panel dimensions - fit 3x4 grid nicely
        const panelWidth = 190;
        const panelHeight = 250;
        const panelX = screenWidth / 2;
        const panelY = screenHeight / 2 - 30;

        // Background panel (using settings-panel frame 1 - empty panel)
        const panelBg = this.add.sprite(panelX, panelY, 'settings-panel', 1);
        panelBg.setDisplaySize(panelWidth, panelHeight);
        panelBg.setDepth(5200);
        panelBg.setInteractive(); // Block clicks through panel
        panelBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.cameras.main.ignore(panelBg);
        this.chestPanelElements.push(panelBg);

        // Animation: scale from chest position
        panelBg.setScale(0);
        panelBg.setPosition(chestSlotX, chestSlotY);
        this.tweens.add({
            targets: panelBg,
            x: panelX,
            y: panelY,
            scaleX: panelWidth / 125, // settings-panel original width
            scaleY: panelHeight / 140, // settings-panel original height
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Grid layout: 3 columns x 4 rows = 12 slots
        const gridSlotSize = 44;
        const gridSlotSpacing = 6;
        const gridWidth = 3 * gridSlotSize + 2 * gridSlotSpacing;
        const gridHeight = 4 * gridSlotSize + 3 * gridSlotSpacing;
        const gridStartX = panelX - gridWidth / 2 + gridSlotSize / 2;
        const gridStartY = panelY - gridHeight / 2 + gridSlotSize / 2;

        // Delay grid elements to appear after panel animation
        this.time.delayedCall(150, () => {
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 3; col++) {
                    const slotIndex = row * 3 + col;
                    const slotX = gridStartX + col * (gridSlotSize + gridSlotSpacing);
                    const slotY = gridStartY + row * (gridSlotSize + gridSlotSpacing);

                    // Slot background
                    const slotBg = this.add.sprite(slotX, slotY, 'square-buttons', 6);
                    slotBg.setDisplaySize(gridSlotSize, gridSlotSize);
                    slotBg.setDepth(5203);
                    slotBg.setAlpha(0);
                    this.cameras.main.ignore(slotBg);
                    this.chestPanelElements.push(slotBg);

                    // Fade in animation for each slot
                    this.tweens.add({
                        targets: slotBg,
                        alpha: 1,
                        duration: 100,
                        delay: slotIndex * 20
                    });

                    // Check if this slot has items
                    const slotData = this.chestInventory[slotIndex];
                    if (slotData && slotData.count > 0) {
                        // Show fruit icon
                        const cropDef = CROP_DEFINITIONS[slotData.type];
                        const fruitIcon = this.add.image(slotX, slotY, cropDef.fruitImage);
                        fruitIcon.setDisplaySize(gridSlotSize - 10, gridSlotSize - 10);
                        fruitIcon.setDepth(5204);
                        fruitIcon.setAlpha(0);
                        this.cameras.main.ignore(fruitIcon);
                        this.chestPanelElements.push(fruitIcon);

                        this.tweens.add({
                            targets: fruitIcon,
                            alpha: 1,
                            duration: 100,
                            delay: slotIndex * 20
                        });

                        // Show count
                        const countText = this.add.text(
                            slotX + gridSlotSize/2 - 4,
                            slotY + gridSlotSize/2 - 4,
                            slotData.count.toString(),
                            {
                                fontSize: '12px',
                                color: '#ffffff',
                                backgroundColor: '#000000cc',
                                padding: { x: 3, y: 1 }
                            }
                        );
                        countText.setOrigin(1, 1);
                        countText.setDepth(5205);
                        countText.setAlpha(0);
                        this.cameras.main.ignore(countText);
                        this.chestPanelElements.push(countText);

                        this.tweens.add({
                            targets: countText,
                            alpha: 1,
                            duration: 100,
                            delay: slotIndex * 20
                        });
                    }
                }
            }

            // Capacity indicator at bottom
            const totalItems = this.getTotalChestItems();
            const maxCapacity = this.CHEST_SLOTS * this.MAX_PER_SLOT;
            const capacityText = this.add.text(
                panelX,
                panelY + panelHeight/2 - 23,
                `${totalItems} / ${maxCapacity}`,
                {
                    fontSize: '11px',
                    color: totalItems >= maxCapacity ? '#ff0000' : '#5D4037'
                }
            );
            capacityText.setOrigin(0.5);
            capacityText.setDepth(5201);
            capacityText.setAlpha(0);
            this.cameras.main.ignore(capacityText);
            this.chestPanelElements.push(capacityText);

            this.tweens.add({
                targets: capacityText,
                alpha: 1,
                duration: 150
            });
        });
    }

    private closeChestPanel() {
        this.chestOpen = false;
        this.chestPanelElements.forEach(el => el.destroy());
        this.chestPanelElements = [];
        this.updateToolbar(); // Update chest icon to closed state
    }

    private getTotalChestItems(): number {
        return this.chestInventory.reduce((total, slot) => total + (slot?.count || 0), 0);
    }

    private isChestFull(): boolean {
        const totalItems = this.getTotalChestItems();
        return totalItems >= this.CHEST_SLOTS * this.MAX_PER_SLOT;
    }

    private addToChest(fruitType: PlantType): boolean {
        // Check if chest is full
        if (this.isChestFull()) {
            console.log('Chest is full! Cannot harvest more.');
            return false;
        }

        // Find existing slot with same type and space available
        for (let i = 0; i < this.chestInventory.length; i++) {
            const slot = this.chestInventory[i];
            if (slot && slot.type === fruitType && slot.count < this.MAX_PER_SLOT) {
                slot.count++;
                console.log(`Added ${fruitType} fruit to slot ${i}. Count: ${slot.count}`);
                return true;
            }
        }

        // Find empty slot
        for (let i = 0; i < this.CHEST_SLOTS; i++) {
            if (!this.chestInventory[i] || this.chestInventory[i].count === 0) {
                this.chestInventory[i] = { type: fruitType, count: 1 };
                console.log(`Added ${fruitType} fruit to new slot ${i}`);
                return true;
            }
        }

        // No space available
        console.log('No available slot in chest!');
        return false;
    }

    private selectToolbarSlot(index: number) {
        if (index < 0 || index >= this.toolbarItems.length) return;
        this.selectedToolIndex = index;
        this.updateToolbar();
    }

    private updateToolbar() {
        this.createToolbar();
    }

    private getSelectedPlantType(): PlantType {
        return PLANT_TYPES[this.selectedSeedIndex];
    }

    private onWalletConnected(address: string) {
        console.log('FarmingGame: wallet connected', address);
        this.walletAddress = address;
        this.createWalletDisplay();
    }

    private createWalletDisplay() {
        // Wallet display is now integrated into user profile UI
        // Clear any previous wallet UI elements
        this.walletUIElements.forEach(el => el.destroy());
        this.walletUIElements = [];
    }

    private handleLogout() {
        // Emit disconnect event to React
        EventBus.emit('disconnect-wallet');

        // Clear wallet data
        this.walletAddress = '';
        this.walletUIElements.forEach(el => el.destroy());
        this.walletUIElements = [];

        // Clear user profile UI
        this.userProfileElements.forEach(el => el.destroy());
        this.userProfileElements = [];

        // Clear user data from storage
        UserService.clearAuthData();

        // Close modal if open
        this.closeProfileModal();

        // Transition to Login scene with fromLogout flag
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('Login', { fromLogout: true });
        });
    }

    private createUserProfileUI() {
        // Clear previous elements
        this.userProfileElements.forEach(el => el.destroy());
        this.userProfileElements = [];
        
        // Reset avatar tracking since we destroyed it
        this.avatarImage = null;
        this.loadedAvatarUrl = null;

        const user = UserService.getStoredUser();
        if (!user) return;

        const screenWidth = this.scale.width;
        const padding = 10;
        const avatarSize = 50;
        const panelWidth = 140;
        const panelHeight = 85;

        // Position in top-right corner
        const panelX = screenWidth - panelWidth / 2 - padding;
        const panelY = panelHeight / 2 + padding;

        // Background panel using settings-panel sprite (pixel style)
        const bg = this.add.sprite(panelX, panelY, 'settings-panel', 1);
        bg.setDisplaySize(panelWidth, panelHeight);
        bg.setDepth(5020);
        bg.setInteractive({ useHandCursor: true });
        this.cameras.main.ignore(bg);
        this.userProfileElements.push(bg);

        // Avatar frame using square-buttons sprite (pixel style)
        const avatarBgX = panelX - panelWidth / 2 + 18 + avatarSize / 2;
        const avatarBgY = panelY - 5;

        const avatarFrame = this.add.sprite(avatarBgX, avatarBgY, 'square-buttons', 6);
        avatarFrame.setDisplaySize(avatarSize + 10, avatarSize + 10);
        avatarFrame.setDepth(5021);
        this.cameras.main.ignore(avatarFrame);
        this.userProfileElements.push(avatarFrame);

        // Avatar image - use default if no avatar URL
        if (user.avatar) {
            // Load external avatar image
            this.loadExternalAvatar(user.avatar, avatarBgX, avatarBgY, avatarSize);
        } else {
            // Use default avatar
            const avatar = this.add.image(avatarBgX, avatarBgY, 'default-avatar');
            avatar.setDisplaySize(avatarSize, avatarSize);
            avatar.setDepth(5022);
            this.cameras.main.ignore(avatar);
            this.userProfileElements.push(avatar);
            this.avatarImage = avatar;
        }

        // Info section (right of avatar)
        const infoX = avatarBgX + avatarSize / 2 + 8;
        const infoStartY = panelY - 28;

        // Username
        const username = user.username || 'Player';
        const nameText = this.add.text(infoX, infoStartY, username.length > 7 ? username.slice(0, 6) + '..' : username, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2
        });
        nameText.setDepth(5023);
        this.cameras.main.ignore(nameText);
        this.userProfileElements.push(nameText);

        // Wallet address (short) - right below username
        const shortWallet = `${user.address.slice(0, 4)}..${user.address.slice(-4)}`;
        const walletText = this.add.text(infoX, infoStartY + 14, shortWallet, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#8D6E63',
            resolution: 2
        });
        walletText.setDepth(5023);
        this.cameras.main.ignore(walletText);
        this.userProfileElements.push(walletText);

        // XP
        const xpText = this.add.text(infoX, infoStartY + 28, `XP: ${user.xp}`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2
        });
        xpText.setDepth(5023);
        this.cameras.main.ignore(xpText);
        this.userProfileElements.push(xpText);

        // Score (reputation)
        const scoreText = this.add.text(infoX, infoStartY + 42, `Sc: ${user.reputationScore}`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2
        });
        scoreText.setDepth(5023);
        this.cameras.main.ignore(scoreText);
        this.userProfileElements.push(scoreText);

        // Click handler to open profile modal
        bg.on('pointerdown', () => {
            this.openProfileModal();
        });

        // Hover effect using tint
        bg.on('pointerover', () => {
            bg.setTint(0xcccccc);
        });
        bg.on('pointerout', () => {
            bg.clearTint();
        });
    }

    private loadExternalAvatar(url: string, x: number, y: number, size: number) {
        // Avoid reloading the same avatar
        if (this.loadedAvatarUrl === url && this.avatarImage) {
            return;
        }

        const key = 'avatar-' + Date.now();
        this.load.image(key, url);
        this.load.once('complete', () => {
            if (this.textures.exists(key)) {
                const avatar = this.add.image(x, y, key);
                avatar.setDisplaySize(size, size);
                avatar.setDepth(5022);
                this.cameras.main.ignore(avatar);
                this.userProfileElements.push(avatar);
                this.avatarImage = avatar;
                this.loadedAvatarUrl = url;
            }
        });
        this.load.start();
    }

    private openProfileModal() {
        if (this.userProfileModalOpen) return;
        this.userProfileModalOpen = true;

        const user = UserService.getStoredUser();
        if (!user) return;

        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const modalWidth = 240;
        const modalHeight = 260;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay background (dimming)
        const overlay = this.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.5);
        overlay.setDepth(5100);
        overlay.setInteractive();
        this.cameras.main.ignore(overlay);
        this.userProfileModalElements.push(overlay);

        // Modal background using settings-panel sprite (pixel style)
        const modalBg = this.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5101);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.cameras.main.ignore(modalBg);
        this.userProfileModalElements.push(modalBg);

        // Animate modal in
        modalBg.setScale(0);
        this.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title (delayed to appear after panel animation)
        this.time.delayedCall(100, () => {
            // const titleText = this.add.text(modalX, modalY - modalHeight / 2 + 28, 'PROFILE', {
            //     fontSize: '16px',
            //     fontFamily: 'PixelFont',
            //     color: '#5D4037',
            //     resolution: 2
            // });
            // titleText.setOrigin(0.5);
            // titleText.setDepth(5102);
            // titleText.setAlpha(0);
            // this.cameras.main.ignore(titleText);
            // this.userProfileModalElements.push(titleText);

            // this.tweens.add({
            //     targets: titleText,
            //     alpha: 1,
            //     duration: 150
            // });

            // Avatar section (centered)
            const avatarY = modalY - 50;
            const avatarSize = 64;

            // Avatar frame using square-buttons sprite
            const avatarFrame = this.add.sprite(modalX, avatarY, 'square-buttons', 6);
            avatarFrame.setDisplaySize(avatarSize + 12, avatarSize + 12);
            avatarFrame.setDepth(5102);
            avatarFrame.setAlpha(0);
            avatarFrame.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(avatarFrame);
            this.userProfileModalElements.push(avatarFrame);

            this.tweens.add({
                targets: avatarFrame,
                alpha: 1,
                duration: 150
            });

            // Avatar image
            const modalAvatar = this.add.image(modalX, avatarY, 'default-avatar');
            modalAvatar.setDisplaySize(avatarSize, avatarSize);
            modalAvatar.setDepth(5103);
            modalAvatar.setAlpha(0);
            this.cameras.main.ignore(modalAvatar);
            this.userProfileModalElements.push(modalAvatar);

            this.tweens.add({
                targets: modalAvatar,
                alpha: 1,
                duration: 150
            });

            // Edit avatar button (small text below avatar)
            const editAvatarBtn = this.add.text(modalX, avatarY + avatarSize / 2 + 12, 'Edit Avatar', {
                fontSize: '9px',
                fontFamily: 'PixelFont',
                color: '#4ade80',
                resolution: 2
            });
            editAvatarBtn.setOrigin(0.5);
            editAvatarBtn.setDepth(5104);
            editAvatarBtn.setAlpha(0);
            editAvatarBtn.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(editAvatarBtn);
            this.userProfileModalElements.push(editAvatarBtn);

            this.tweens.add({
                targets: editAvatarBtn,
                alpha: 1,
                duration: 150
            });

            editAvatarBtn.on('pointerdown', () => {
                this.openEditField('avatar', user.avatar || '');
            });
            editAvatarBtn.on('pointerover', () => editAvatarBtn.setColor('#86efac'));
            editAvatarBtn.on('pointerout', () => editAvatarBtn.setColor('#4ade80'));

            // Also make avatar frame clickable for edit
            avatarFrame.on('pointerdown', () => {
                this.openEditField('avatar', user.avatar || '');
            });
            avatarFrame.on('pointerover', () => avatarFrame.setTint(0xcccccc));
            avatarFrame.on('pointerout', () => avatarFrame.clearTint());

            // Profile fields - positioned more inside the panel
            const fieldStartY = avatarY + avatarSize / 2 + 35;
            const fieldSpacing = 28;
            const labelX = modalX - modalWidth / 2 + 35;
            const valueX = modalX - modalWidth / 2 + 100;
            const editX = modalX + modalWidth / 2 - 45;

            // Username field with edit button
            this.createProfileField('Name', user.username || 'Not set', labelX, valueX, editX, fieldStartY, 'username');

            // XP (read-only)
            const xpLabel = this.add.text(labelX, fieldStartY + fieldSpacing, 'XP:', {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            xpLabel.setDepth(5102);
            xpLabel.setAlpha(0);
            xpLabel.setStroke('#5D4037', 2);
            this.cameras.main.ignore(xpLabel);
            this.userProfileModalElements.push(xpLabel);

            const xpValue = this.add.text(valueX, fieldStartY + fieldSpacing, user.xp.toString(), {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#FFF8E1',
                resolution: 2
            });
            xpValue.setDepth(5102);
            xpValue.setAlpha(0);
            xpValue.setStroke('#5D4037', 2);
            this.cameras.main.ignore(xpValue);
            this.userProfileModalElements.push(xpValue);

            // Score (read-only)
            const scoreLabel = this.add.text(labelX, fieldStartY + fieldSpacing * 2, 'Score:', {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            scoreLabel.setDepth(5102);
            scoreLabel.setAlpha(0);
            scoreLabel.setStroke('#5D4037', 2);
            this.cameras.main.ignore(scoreLabel);
            this.userProfileModalElements.push(scoreLabel);

            const scoreValue = this.add.text(valueX, fieldStartY + fieldSpacing * 2, user.reputationScore.toString(), {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#FFF8E1',
                resolution: 2
            });
            scoreValue.setDepth(5102);
            scoreValue.setAlpha(0);
            scoreValue.setStroke('#5D4037', 2);
            this.cameras.main.ignore(scoreValue);
            this.userProfileModalElements.push(scoreValue);

            // Fade in all field elements
            this.tweens.add({
                targets: [xpLabel, xpValue, scoreLabel, scoreValue],
                alpha: 1,
                duration: 150,
                delay: 50
            });

            // Logout button at bottom of modal
            const logoutY = modalY + modalHeight / 2 - 30;
            const logoutBg = this.add.sprite(modalX, logoutY, 'square-buttons', 7);
            logoutBg.setDisplaySize(110, 34);
            logoutBg.setDepth(5102);
            logoutBg.setAlpha(0);
            logoutBg.setInteractive({ useHandCursor: true });
            this.cameras.main.ignore(logoutBg);
            this.userProfileModalElements.push(logoutBg);

            const logoutText = this.add.text(modalX, logoutY, 'Log Out', {
                fontSize: '12px',
                fontFamily: 'PixelFont',
                color: '#FFFFFF',
                resolution: 2
            });
            logoutText.setOrigin(0.5);
            logoutText.setDepth(5103);
            logoutText.setAlpha(0);
            logoutText.setStroke('#5D4037', 2);
            this.cameras.main.ignore(logoutText);
            this.userProfileModalElements.push(logoutText);

            this.tweens.add({
                targets: [logoutBg, logoutText],
                alpha: 1,
                duration: 150,
                delay: 100
            });

            logoutBg.on('pointerdown', () => {
                this.closeProfileModal();
                this.handleLogout();
            });
            logoutBg.on('pointerover', () => logoutBg.setTint(0xcccccc));
            logoutBg.on('pointerout', () => logoutBg.clearTint());
        });

        // Click overlay to close
        overlay.on('pointerdown', () => {
            this.closeProfileModal();
        });
    }

    private createProfileField(label: string, value: string, labelX: number, valueX: number, editX: number, y: number, fieldName: string) {
        const labelText = this.add.text(labelX, y, label + ':', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        labelText.setDepth(5102);
        labelText.setAlpha(0);
        labelText.setStroke('#5D4037', 2);
        this.cameras.main.ignore(labelText);
        this.userProfileModalElements.push(labelText);

        const displayValue = value.length > 10 ? value.slice(0, 9) + '..' : value;
        const valueText = this.add.text(valueX, y, displayValue, {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFF8E1',
            resolution: 2
        });
        valueText.setDepth(5102);
        valueText.setAlpha(0);
        valueText.setStroke('#5D4037', 2);
        this.cameras.main.ignore(valueText);
        this.userProfileModalElements.push(valueText);

        // Edit button using text with pixel style
        const editBtn = this.add.text(editX, y, 'Edit', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        editBtn.setDepth(5102);
        editBtn.setAlpha(0);
        editBtn.setInteractive({ useHandCursor: true });
        this.cameras.main.ignore(editBtn);
        this.userProfileModalElements.push(editBtn);

        // Fade in
        this.tweens.add({
            targets: [labelText, valueText, editBtn],
            alpha: 1,
            duration: 150,
            delay: 50
        });

        editBtn.on('pointerdown', () => {
            this.openEditField(fieldName, value);
        });
        editBtn.on('pointerover', () => editBtn.setColor('#86efac'));
        editBtn.on('pointerout', () => editBtn.setColor('#4ade80'));
    }

    private editFormElements: Phaser.GameObjects.GameObject[] = [];
    private editFormOpen: boolean = false;

    private openEditField(fieldName: string, currentValue: string) {
        if (this.editFormOpen) return;
        this.editFormOpen = true;

        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const formWidth = 280;
        const formHeight = fieldName === 'avatar' ? 200 : 160;
        const formX = screenWidth / 2;
        const formY = screenHeight / 2;

        // Overlay
        const overlay = this.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.7);
        overlay.setDepth(5200);
        overlay.setInteractive();
        this.cameras.main.ignore(overlay);
        this.editFormElements.push(overlay);

        // Form background
        const formBg = this.add.sprite(formX, formY, 'settings-panel', 1);
        formBg.setDisplaySize(formWidth, formHeight);
        formBg.setDepth(5201);
        formBg.setInteractive();
        formBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.cameras.main.ignore(formBg);
        this.editFormElements.push(formBg);

        // Animate form
        formBg.setScale(0);
        this.tweens.add({
            targets: formBg,
            scaleX: formWidth / 125,
            scaleY: formHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Title
        const titleText = fieldName === 'avatar' ? 'Edit Avatar' : 'Edit Username';
        const title = this.add.text(formX, formY - formHeight / 2 + 25, titleText, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5202);
        title.setStroke('#5D4037', 2);
        title.setAlpha(0);
        this.cameras.main.ignore(title);
        this.editFormElements.push(title);

        this.time.delayedCall(100, () => {
            this.tweens.add({ targets: title, alpha: 1, duration: 150 });

            if (fieldName === 'avatar') {
                this.createAvatarEditForm(formX, formY, formWidth, currentValue);
            } else {
                this.createTextEditForm(formX, formY, formWidth, fieldName, currentValue);
            }
        });

        // Close on overlay click
        overlay.on('pointerdown', () => this.closeEditForm());
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private createTextEditForm(formX: number, formY: number, formWidth: number, fieldName: string, currentValue: string) {
        // Create HTML input element for text editing
        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = currentValue;
        inputElement.placeholder = `Enter ${fieldName}...`;
        inputElement.maxLength = 20;
        inputElement.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -20px);
            width: 200px;
            padding: 10px 15px;
            font-size: 14px;
            font-family: 'PixelFont', monospace;
            border: 3px solid #5D4037;
            border-radius: 8px;
            background-color: #FFF8E1;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
        `;
        document.body.appendChild(inputElement);
        
        // Prevent Phaser from capturing keyboard events while typing
        inputElement.addEventListener('keydown', (e) => {
            // Handle Enter and Escape before stopping propagation
            if (e.key === 'Enter') {
                const newValue = inputElement.value.trim();
                if (newValue && newValue !== currentValue) {
                    this.updateUserField(fieldName, newValue);
                }
                this.closeEditForm();
                e.preventDefault();
                e.stopPropagation();
                return;
            } else if (e.key === 'Escape') {
                this.closeEditForm();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            // Stop all other keys from reaching Phaser
            e.stopPropagation();
        });
        inputElement.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });
        inputElement.addEventListener('keypress', (e) => {
            e.stopPropagation();
        });
        
        inputElement.focus();

        // Store reference for cleanup
        (this as unknown as { _editInput: HTMLInputElement })._editInput = inputElement;

        // Save button
        const saveBtnBg = this.add.sprite(formX - 50, formY + 40, 'square-buttons', 6);
        saveBtnBg.setDisplaySize(80, 32);
        saveBtnBg.setDepth(5202);
        saveBtnBg.setAlpha(0);
        saveBtnBg.setInteractive({ useHandCursor: true });
        this.cameras.main.ignore(saveBtnBg);
        this.editFormElements.push(saveBtnBg);

        const saveText = this.add.text(formX - 50, formY + 40, 'Save', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        saveText.setOrigin(0.5);
        saveText.setDepth(5203);
        saveText.setStroke('#5D4037', 2);
        saveText.setAlpha(0);
        this.cameras.main.ignore(saveText);
        this.editFormElements.push(saveText);

        // Cancel button
        const cancelBtnBg = this.add.sprite(formX + 50, formY + 40, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(80, 32);
        cancelBtnBg.setDepth(5202);
        cancelBtnBg.setAlpha(0);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.cameras.main.ignore(cancelBtnBg);
        this.editFormElements.push(cancelBtnBg);

        const cancelText = this.add.text(formX + 50, formY + 40, 'Cancel', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        cancelText.setOrigin(0.5);
        cancelText.setDepth(5203);
        cancelText.setStroke('#5D4037', 2);
        cancelText.setAlpha(0);
        this.cameras.main.ignore(cancelText);
        this.editFormElements.push(cancelText);

        // Fade in buttons
        this.tweens.add({
            targets: [saveBtnBg, saveText, cancelBtnBg, cancelText],
            alpha: 1,
            duration: 150
        });

        // Button events
        saveBtnBg.on('pointerdown', () => {
            const newValue = inputElement.value.trim();
            if (newValue && newValue !== currentValue) {
                this.updateUserField(fieldName, newValue);
            }
            this.closeEditForm();
        });
        saveBtnBg.on('pointerover', () => saveBtnBg.setTint(0xcccccc));
        saveBtnBg.on('pointerout', () => saveBtnBg.clearTint());

        cancelBtnBg.on('pointerdown', () => this.closeEditForm());
        cancelBtnBg.on('pointerover', () => cancelBtnBg.setTint(0xcccccc));
        cancelBtnBg.on('pointerout', () => cancelBtnBg.clearTint());
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private createAvatarEditForm(formX: number, formY: number, formWidth: number, currentValue: string) {
        // URL input label
        const urlLabel = this.add.text(formX, formY - 35, 'Enter Image URL:', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        urlLabel.setOrigin(0.5);
        urlLabel.setDepth(5202);
        urlLabel.setStroke('#5D4037', 2);
        urlLabel.setAlpha(0);
        this.cameras.main.ignore(urlLabel);
        this.editFormElements.push(urlLabel);

        this.tweens.add({ targets: urlLabel, alpha: 1, duration: 150 });

        // Create HTML input for URL
        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = currentValue;
        inputElement.placeholder = 'https://example.com/avatar.png';
        inputElement.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -15px);
            width: 220px;
            padding: 8px 12px;
            font-size: 12px;
            font-family: 'PixelFont', monospace;
            border: 3px solid #5D4037;
            border-radius: 8px;
            background-color: #FFF8E1;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
        `;
        document.body.appendChild(inputElement);
        
        // Prevent Phaser from capturing keyboard events while typing
        inputElement.addEventListener('keydown', (e) => {
            // Handle Enter and Escape before stopping propagation
            if (e.key === 'Enter') {
                const newValue = inputElement.value.trim();
                if (newValue && newValue !== currentValue) {
                    this.updateUserField('avatar', newValue);
                }
                this.closeEditForm();
                e.preventDefault();
                e.stopPropagation();
                return;
            } else if (e.key === 'Escape') {
                this.closeEditForm();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            // Stop all other keys from reaching Phaser
            e.stopPropagation();
        });
        inputElement.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });
        inputElement.addEventListener('keypress', (e) => {
            e.stopPropagation();
        });
        
        inputElement.focus();

        (this as unknown as { _editInput: HTMLInputElement })._editInput = inputElement;

        // Or upload label
        const orLabel = this.add.text(formX, formY + 20, '- or -', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        orLabel.setOrigin(0.5);
        orLabel.setDepth(5202);
        orLabel.setStroke('#5D4037', 2);
        orLabel.setAlpha(0);
        this.cameras.main.ignore(orLabel);
        this.editFormElements.push(orLabel);

        this.tweens.add({ targets: orLabel, alpha: 1, duration: 150, delay: 50 });

        // Upload button
        const uploadBtnBg = this.add.sprite(formX, formY + 45, 'square-buttons', 6);
        uploadBtnBg.setDisplaySize(120, 28);
        uploadBtnBg.setDepth(5202);
        uploadBtnBg.setAlpha(0);
        uploadBtnBg.setInteractive({ useHandCursor: true });
        this.cameras.main.ignore(uploadBtnBg);
        this.editFormElements.push(uploadBtnBg);

        const uploadText = this.add.text(formX, formY + 45, 'Upload Image', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        uploadText.setOrigin(0.5);
        uploadText.setDepth(5203);
        uploadText.setStroke('#5D4037', 2);
        uploadText.setAlpha(0);
        this.cameras.main.ignore(uploadText);
        this.editFormElements.push(uploadText);

        this.tweens.add({
            targets: [uploadBtnBg, uploadText],
            alpha: 1,
            duration: 150,
            delay: 50
        });

        // Hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        uploadBtnBg.on('pointerdown', () => fileInput.click());
        uploadBtnBg.on('pointerover', () => uploadBtnBg.setTint(0xcccccc));
        uploadBtnBg.on('pointerout', () => uploadBtnBg.clearTint());

        fileInput.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                // Show uploading status
                uploadText.setText('Uploading...');
                uploadBtnBg.disableInteractive();
                
                try {
                    // Import IPFSService dynamically
                    const { IPFSService } = await import('../../services/ipfsService');
                    
                    // Upload to IPFS
                    const ipfsUrl = await IPFSService.uploadImage(file);
                    
                    // Set the IPFS URL in the input
                    inputElement.value = ipfsUrl;
                    
                    // Show success
                    uploadText.setText('Uploaded!');
                    uploadText.setColor('#4ade80');
                    
                    // Reset after 2 seconds
                    setTimeout(() => {
                        uploadText.setText('Upload Image');
                        uploadText.setColor('#FFFFFF');
                        uploadBtnBg.setInteractive({ useHandCursor: true });
                    }, 2000);
                } catch (error) {
                    console.error('IPFS upload failed:', error);
                    
                    // Show error
                    uploadText.setText('Upload Failed');
                    uploadText.setColor('#ff4444');
                    
                    // Reset after 2 seconds
                    setTimeout(() => {
                        uploadText.setText('Upload Image');
                        uploadText.setColor('#FFFFFF');
                        uploadBtnBg.setInteractive({ useHandCursor: true });
                    }, 2000);
                }
            }
        });

        // Store file input for cleanup
        (this as unknown as { _fileInput: HTMLInputElement })._fileInput = fileInput;

        // Save and Cancel buttons
        const saveBtnBg = this.add.sprite(formX - 50, formY + 80, 'square-buttons', 6);
        saveBtnBg.setDisplaySize(80, 32);
        saveBtnBg.setDepth(5202);
        saveBtnBg.setAlpha(0);
        saveBtnBg.setInteractive({ useHandCursor: true });
        this.cameras.main.ignore(saveBtnBg);
        this.editFormElements.push(saveBtnBg);

        const saveText = this.add.text(formX - 50, formY + 80, 'Save', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        saveText.setOrigin(0.5);
        saveText.setDepth(5203);
        saveText.setStroke('#5D4037', 2);
        saveText.setAlpha(0);
        this.cameras.main.ignore(saveText);
        this.editFormElements.push(saveText);

        const cancelBtnBg = this.add.sprite(formX + 50, formY + 80, 'square-buttons', 7);
        cancelBtnBg.setDisplaySize(80, 32);
        cancelBtnBg.setDepth(5202);
        cancelBtnBg.setAlpha(0);
        cancelBtnBg.setInteractive({ useHandCursor: true });
        this.cameras.main.ignore(cancelBtnBg);
        this.editFormElements.push(cancelBtnBg);

        const cancelText = this.add.text(formX + 50, formY + 80, 'Cancel', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        cancelText.setOrigin(0.5);
        cancelText.setDepth(5203);
        cancelText.setStroke('#5D4037', 2);
        cancelText.setAlpha(0);
        this.cameras.main.ignore(cancelText);
        this.editFormElements.push(cancelText);

        this.tweens.add({
            targets: [saveBtnBg, saveText, cancelBtnBg, cancelText],
            alpha: 1,
            duration: 150,
            delay: 100
        });

        saveBtnBg.on('pointerdown', () => {
            const newValue = inputElement.value.trim();
            if (newValue && newValue !== currentValue) {
                this.updateUserField('avatar', newValue);
            }
            this.closeEditForm();
        });
        saveBtnBg.on('pointerover', () => saveBtnBg.setTint(0xcccccc));
        saveBtnBg.on('pointerout', () => saveBtnBg.clearTint());

        cancelBtnBg.on('pointerdown', () => this.closeEditForm());
        cancelBtnBg.on('pointerover', () => cancelBtnBg.setTint(0xcccccc));
        cancelBtnBg.on('pointerout', () => cancelBtnBg.clearTint());
    }

    private closeEditForm() {
        this.editFormOpen = false;

        // Remove HTML elements
        const editInput = (this as unknown as { _editInput?: HTMLInputElement })._editInput;
        if (editInput && editInput.parentNode) {
            editInput.parentNode.removeChild(editInput);
        }
        (this as unknown as { _editInput?: HTMLInputElement })._editInput = undefined;

        const fileInput = (this as unknown as { _fileInput?: HTMLInputElement })._fileInput;
        if (fileInput && fileInput.parentNode) {
            fileInput.parentNode.removeChild(fileInput);
        }
        (this as unknown as { _fileInput?: HTMLInputElement })._fileInput = undefined;

        // Destroy Phaser elements
        this.editFormElements.forEach(el => el.destroy());
        this.editFormElements = [];
    }

    private async updateUserField(fieldName: string, value: string) {
        const updates: { username?: string; avatar?: string } = {};
        if (fieldName === 'username') {
            updates.username = value;
        } else if (fieldName === 'avatar') {
            updates.avatar = value;
        }

        const updatedUser = await UserService.updateUser(updates);
        if (updatedUser) {
            // Refresh UI
            this.closeProfileModal();
            this.createUserProfileUI();
            this.openProfileModal();
        }
    }

    private closeProfileModal() {
        this.userProfileModalOpen = false;
        this.userProfileModalElements.forEach(el => el.destroy());
        this.userProfileModalElements = [];
    }

    private setupCameraIgnore() {
        // UI camera should only render UI elements (those with depth >= 5000)
        // Make it ignore all other game objects
        this.children.list.forEach((child) => {
            const gameObj = child as Phaser.GameObjects.GameObject & { depth?: number };
            if (gameObj.depth === undefined || gameObj.depth < 5000) {
                this.uiCamera.ignore(child);
            }
        });

        // Also ignore the tilemap layers
        if (this.groundLayer) this.uiCamera.ignore(this.groundLayer);
        if (this.tilledDirtLayer) this.uiCamera.ignore(this.tilledDirtLayer);
        if (this.player) this.uiCamera.ignore(this.player);
    }

    private createMarquee() {
        const screenWidth = this.scale.width;
        const marqueeY = 18; // Same row as time clock (uiY = 10 + padding)
        const marqueeWidth = 400; // Wider marquee box
        const marqueeHeight = 18;
        const marqueeX = screenWidth / 2; // Center of screen
        const message = '🎉 Cardano Meetup in First January 2026 with many gifts waiting for you! 🎁';

        // Background bar (centered)
        const marqueeBg = this.add.rectangle(marqueeX, marqueeY, marqueeWidth, marqueeHeight, 0x000000, 0.7);
        marqueeBg.setDepth(5100);
        this.cameras.main.ignore(marqueeBg);

        // Create text (starts from right edge of the box)
        const startX = marqueeX + marqueeWidth / 2;
        this.marqueeText = this.add.text(startX, marqueeY, message, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        this.marqueeText.setOrigin(0, 0.5);
        this.marqueeText.setDepth(5101);
        this.cameras.main.ignore(this.marqueeText);

        // Create mask to hide text outside the box
        const maskShape = this.make.graphics({ x: 0, y: 0 });
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(marqueeX - marqueeWidth / 2, marqueeY - marqueeHeight / 2, marqueeWidth, marqueeHeight);
        const mask = maskShape.createGeometryMask();
        this.marqueeText.setMask(mask);

        // Animate text scrolling from right to left within the box
        const textWidth = this.marqueeText.width;
        const endX = marqueeX - marqueeWidth / 2 - textWidth;

        const animateMarquee = () => {
            // Show marquee
            marqueeBg.setVisible(true);
            this.marqueeText.setVisible(true);
            this.marqueeText.x = startX;

            this.tweens.add({
                targets: this.marqueeText,
                x: endX,
                duration: 12000, // 12 seconds to scroll across
                ease: 'Linear',
                onComplete: () => {
                    // Hide marquee after text finishes
                    marqueeBg.setVisible(false);
                    this.marqueeText.setVisible(false);

                    // Wait 5 minutes (300000ms) then show again
                    this.time.delayedCall(300000, () => {
                        animateMarquee();
                    });
                }
            });
        };
        animateMarquee();
    }

    private createMobileControls() {
        // Virtual joystick (bottom left)
        const joystickX = 80;
        const joystickY = this.scale.height - 80;
        const baseRadius = 50;
        const thumbRadius = 25;

        // Joystick base
        this.joystickBase = this.add.circle(joystickX, joystickY, baseRadius, 0x888888, 0.3);
        this.joystickBase.setStrokeStyle(2, 0xffffff, 0.5);
        this.joystickBase.setDepth(5010);
        this.cameras.main.ignore(this.joystickBase);

        // Joystick thumb
        this.joystickThumb = this.add.circle(joystickX, joystickY, thumbRadius, 0xffffff, 0.8);
        this.joystickThumb.setDepth(5011);
        this.cameras.main.ignore(this.joystickThumb);

        // Make joystick interactive
        this.joystickBase.setInteractive();

        // Joystick events
        this.joystickBase.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.joystickActive = true;
            this.joystickPointer = pointer;
        });

        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (this.joystickPointer === pointer) {
                this.joystickActive = false;
                this.joystickPointer = null;
                // Reset thumb position
                this.joystickThumb.setPosition(joystickX, joystickY);
            }
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (this.joystickActive && this.joystickPointer === pointer) {
                const dx = pointer.x - joystickX;
                const dy = pointer.y - joystickY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > baseRadius) {
                    // Constrain to base radius
                    const angle = Math.atan2(dy, dx);
                    this.joystickThumb.setPosition(
                        joystickX + Math.cos(angle) * baseRadius,
                        joystickY + Math.sin(angle) * baseRadius
                    );
                } else {
                    this.joystickThumb.setPosition(pointer.x, pointer.y);
                }
            }
        });

        // Action button (bottom right)
        this.actionButton = this.add.circle(
            this.scale.width - 80,
            this.scale.height - 80,
            40,
            0xff6b6b,
            0.8
        );
        this.actionButton.setStrokeStyle(3, 0xffffff, 0.9);
        this.actionButton.setDepth(5010);
        this.actionButton.setInteractive();
        this.cameras.main.ignore(this.actionButton);

        // Action button text
        this.actionButtonText = this.add.text(
            this.scale.width - 80,
            this.scale.height - 80,
            '⚒',
            { fontSize: '32px' }
        );
        this.actionButtonText.setOrigin(0.5);
        this.actionButtonText.setDepth(5011);
        this.cameras.main.ignore(this.actionButtonText);

        this.actionButton.on('pointerdown', () => {
            this.performAction();
        });
    }

    private setupInteractions() {
        // Click/touch on map to move (only if not on joystick or action button)
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.rightButtonDown()) {
                return;
            }

            // Check if touch is on joystick area
            const joystickX = 80;
            const joystickY = this.scale.height - 80;
            const dxJoy = pointer.x - joystickX;
            const dyJoy = pointer.y - joystickY;
            if (Math.sqrt(dxJoy * dxJoy + dyJoy * dyJoy) < 70) {
                return; // Touch is on joystick
            }

            // Check if touch is on action button
            const actionX = this.scale.width - 80;
            const actionY = this.scale.height - 80;
            const dxAction = pointer.x - actionX;
            const dyAction = pointer.y - actionY;
            if (Math.sqrt(dxAction * dxAction + dyAction * dyAction) < 50) {
                return; // Touch is on action button
            }

            // Check if touch is on UI (inventory)
            if (pointer.y > this.scale.height - 100) {
                return; // Touch is on inventory area
            }

            // Check if seed option was just clicked (prevents movement)
            if (this.seedOptionJustClicked) {
                this.seedOptionJustClicked = false;
                return;
            }

            // Check if seed selector is open - close it when clicking outside
            if (this.seedSelectorOpen) {
                this.closeSeedSelector();
                return; // Don't move when closing seed selector
            }

            // Set movement target (world coordinates)
            const worldX = pointer.worldX;
            const worldY = pointer.worldY;

            // Check if target is on land
            const targetTileX = Math.floor(worldX / this.TILE_SIZE);
            const targetTileY = Math.floor(worldY / this.TILE_SIZE);

            if (this.isLandTile(targetTileX, targetTileY)) {
                this.touchMoveTarget = { x: worldX, y: worldY };
            }
        });
    }

    private performAction() {
        // Get tile player is standing on or in front of
        const playerTileX = Math.floor(this.player.x / this.TILE_SIZE);
        const playerTileY = Math.floor(this.player.y / this.TILE_SIZE);

        const tileKey = `${playerTileX},${playerTileY}`;

        // Check if this tile is a farm plot
        const state = this.farmLandStates.get(tileKey);
        if (!state) {
            console.log('Not a farm plot');
            return;
        }

        const selectedItem = this.toolbarItems[this.selectedToolIndex];

        if (selectedItem.type === 'seed') {
            // Plant seed using selected seed type
            this.plantSeed(tileKey, playerTileX, playerTileY);
        } else if (selectedItem.name === 'wateringCan') {
            // Water plant
            this.waterCrop(tileKey, playerTileX, playerTileY);
        } else if (selectedItem.name === 'hand') {
            // Harvest crop
            this.harvestCrop(tileKey, playerTileX, playerTileY);
        } else if (selectedItem.name === 'fertilizer') {
            // Fertilize plant (grows 2 stages)
            this.fertilizeCrop(tileKey, playerTileX, playerTileY);
        } else if (selectedItem.name === 'digest') {
            // Remove/digest plant
            this.digestCrop(tileKey, playerTileX, playerTileY);
        }
    }

    private plantSeed(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);
        const selectedPlantType = this.getSelectedPlantType();

        if (state && state.tilled && !state.planted) {
            // Check if we have seeds of the selected type
            if (this.seedCounts[selectedPlantType] > 0) {
                state.planted = true;
                state.cropType = selectedPlantType;
                state.plantStage = PLANT_STAGES.SPROUT; // Start as sprout, not seed
                state.isDead = false;
                state.isWilted = false;
                state.lastCareTime = Date.now(); // Set initial care time

                // Decrease seed count for this specific type
                this.seedCounts[selectedPlantType]--;
                this.updateToolbar();

                // Show plant sprite (sprout stage - when planted, seed becomes sprout)
                this.showPlant(x, y, selectedPlantType, PLANT_STAGES.SPROUT);

                // Create health bar
                this.createHealthBar(x, y, tileKey);

                console.log('Planted', selectedPlantType, 'at', tileKey, '- Seeds left:', this.seedCounts[selectedPlantType]);
            } else {
                console.log('No', selectedPlantType, 'seeds left!');
            }
        }
    }

    private waterCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);
        const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');

        // Check if we have water
        if (!wateringCan || wateringCan.count === undefined || wateringCan.count <= 0) {
            console.log('No water left!');
            return;
        }

        if (state && state.planted && state.cropType) {
            // Cannot water dead plants
            if (state.isDead) {
                console.log('This plant is dead and cannot be watered!');
                return;
            }

            // Reset care timer (prevents death/wilt)
            state.lastCareTime = Date.now();

            // Reset health bar to full
            this.resetHealthBar(tileKey);

            // If plant was wilted, restore it
            if (state.isWilted) {
                state.isWilted = false;
                console.log('Plant at', tileKey, 'has been restored from wilted state!');
            }

            const maxStage = PLANT_STAGES.FRUIT;

            if (state.plantStage < maxStage) {
                state.plantStage++;
                wateringCan.count--;
                this.updateToolbar();

                // Update plant sprite
                this.updatePlantSprite(x, y, state.cropType, state.plantStage, false, state.isWilted);

                console.log('Watered and grew to stage', state.plantStage, 'at', tileKey, '- Water left:', wateringCan.count);
            } else {
                // Still consume water but just reset timer
                wateringCan.count--;
                this.updateToolbar();
                console.log('Plant is already fully grown at', tileKey, '- Care timer reset');
            }
        }
    }

    private fertilizeCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);
        const fertilizer = this.toolbarItems.find(item => item.name === 'fertilizer');

        // Check if we have fertilizer
        if (!fertilizer || fertilizer.count === undefined || fertilizer.count <= 0) {
            console.log('No fertilizer left!');
            return;
        }

        if (state && state.planted && state.cropType) {
            // Cannot fertilize dead plants
            if (state.isDead) {
                console.log('This plant is dead and cannot be fertilized!');
                return;
            }

            // Reset care timer (prevents death/wilt)
            state.lastCareTime = Date.now();

            // Reset health bar to full
            this.resetHealthBar(tileKey);

            // If plant was wilted, restore it
            if (state.isWilted) {
                state.isWilted = false;
                console.log('Plant at', tileKey, 'has been restored from wilted state!');
            }

            const maxStage = PLANT_STAGES.FRUIT;

            if (state.plantStage < maxStage) {
                // Fertilizer grows plant by 2 stages (but not beyond max)
                state.plantStage = Math.min(state.plantStage + 2, maxStage);
                fertilizer.count--;
                this.updateToolbar();

                // Update plant sprite
                this.updatePlantSprite(x, y, state.cropType, state.plantStage, false, state.isWilted);

                console.log('Fertilized and grew to stage', state.plantStage, 'at', tileKey, '- Fertilizer left:', fertilizer.count);
            } else {
                // Still consume fertilizer but just reset timer
                fertilizer.count--;
                this.updateToolbar();
                console.log('Plant is already fully grown at', tileKey, '- Care timer reset');
            }
        }
    }

    private harvestCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);

        if (state && state.planted && state.cropType) {
            // Allow clearing dead plants
            if (state.isDead) {
                // Reset state - clear dead plant
                state.planted = false;
                state.plantStage = 0;
                state.cropType = null;
                state.isDead = false;
                state.isWilted = false;
                state.lastCareTime = undefined;

                // Remove plant sprite
                this.removePlant(x, y);

                console.log('Cleared dead plant at', tileKey);
                return;
            }

            if (state.plantStage >= PLANT_STAGES.FRUIT) {
                // Check if chest has space
                if (this.isChestFull()) {
                    console.log('Cannot harvest! Chest is full.');
                    return;
                }

                // Harvest successful!
                const wasWilted = state.isWilted;
                const harvestedType = state.cropType;

                // Add fruit to chest
                this.addToChest(harvestedType);

                // Reset state
                state.planted = false;
                state.plantStage = 0;
                state.cropType = null;
                state.isDead = false;
                state.isWilted = false;
                state.lastCareTime = undefined;

                // Remove plant sprite
                this.removePlant(x, y);

                // Update toolbar to show new chest count
                this.updateToolbar();

                if (wasWilted) {
                    console.log('Harvested WILTED', harvestedType, 'crop at', tileKey, '(reduced yield) - Added to chest');
                } else {
                    console.log('Harvested healthy', harvestedType, 'crop at', tileKey, '- Added to chest');
                }
            } else {
                console.log('Plant not ready to harvest at', tileKey, `(Stage ${state.plantStage}/${PLANT_STAGES.FRUIT})`);
            }
        }
    }

    private digestCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);

        if (state && state.planted && state.cropType) {
            // Remove plant regardless of stage or state
            state.planted = false;
            state.plantStage = 0;
            state.cropType = null;
            state.isDead = false;
            state.isWilted = false;
            state.lastCareTime = undefined;

            // Remove plant sprite and health bar
            this.removePlant(x, y);

            console.log('Digested/removed plant at', tileKey);
        } else {
            console.log('No plant to digest at', tileKey);
        }
    }

    private showPlant(x: number, y: number, cropType: PlantType, stage: number, isDead: boolean = false, isWilted: boolean = false) {
        const cropDef = CROP_DEFINITIONS[cropType];
        let imageKey: string;

        if (isDead) {
            imageKey = cropDef.deathImage;
        } else if (stage === PLANT_STAGES.SEED) {
            imageKey = cropDef.seedImage; // Seed stage
        } else if (stage === PLANT_STAGES.FRUIT) {
            imageKey = cropDef.fruitImage; // Ready to harvest (fruit stage)
        } else if (stage > 0 && stage <= cropDef.growthImages.length) {
            // Stages 1-4: Sprout, Young, Mature, Flower
            imageKey = cropDef.growthImages[stage - 1];
        } else {
            imageKey = cropDef.growthImages[cropDef.growthImages.length - 1];
        }

        // Plant size (scale down from 157x153 to fit tile)
        const plantSize = 16;

        const plant = this.add.image(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            y * this.TILE_SIZE + this.TILE_SIZE / 2,
            imageKey
        );
        plant.setDisplaySize(plantSize, plantSize);
        plant.setOrigin(0.5, 0.5); // Center on tile
        plant.setDepth(y * this.TILE_SIZE + 5);
        plant.setName(`plant-${x}-${y}`);

        // Apply wilted tint (yellowish/brown)
        if (isWilted) {
            plant.setTint(0xccaa66);
        }

        // Make sure UI camera ignores this game object
        this.uiCamera.ignore(plant);
    }

    private removePlant(x: number, y: number) {
        const plant = this.children.getByName(`plant-${x}-${y}`);
        if (plant) {
            plant.destroy();
        }

        // Also remove health bar
        const tileKey = `${x},${y}`;
        const state = this.farmLandStates.get(tileKey);
        if (state) {
            if (state.healthBarBg) {
                state.healthBarBg.destroy();
                state.healthBarBg = undefined;
            }
            if (state.healthBarFill) {
                state.healthBarFill.destroy();
                state.healthBarFill = undefined;
            }
        }
    }

    private createHealthBar(x: number, y: number, tileKey: string) {
        const state = this.farmLandStates.get(tileKey);
        if (!state) return;

        // Health bar dimensions
        const barWidth = 14;
        const barHeight = 3;
        const barY = y * this.TILE_SIZE - 2; // Above the plant
        const barX = x * this.TILE_SIZE + this.TILE_SIZE / 2;

        // Background (dark gray)
        state.healthBarBg = this.add.rectangle(
            barX,
            barY,
            barWidth,
            barHeight,
            0x333333,
            0.8
        );
        state.healthBarBg.setDepth(y * this.TILE_SIZE + 10);
        state.healthBarBg.setName(`healthbar-bg-${x}-${y}`);
        this.uiCamera.ignore(state.healthBarBg);

        // Fill (starts green)
        state.healthBarFill = this.add.rectangle(
            barX,
            barY,
            barWidth - 2,
            barHeight - 1,
            0x00ff00,
            1
        );
        state.healthBarFill.setDepth(y * this.TILE_SIZE + 11);
        state.healthBarFill.setName(`healthbar-fill-${x}-${y}`);
        this.uiCamera.ignore(state.healthBarFill);
    }

    private updateHealthBar(tileKey: string) {
        const state = this.farmLandStates.get(tileKey);
        if (!state || !state.healthBarFill || !state.lastCareTime) return;

        // Calculate health percentage (100% at lastCareTime, 0% at DEATH_TIMER_MS)
        const currentTime = Date.now();
        const timeSinceLastCare = currentTime - state.lastCareTime;
        const healthPercent = Math.max(0, 1 - (timeSinceLastCare / DEATH_TIMER_MS));

        // Update fill width
        const maxWidth = 12;
        const newWidth = maxWidth * healthPercent;
        state.healthBarFill.setSize(newWidth, 2);

        // Update fill color based on health (green -> yellow -> red)
        let color: number;
        if (healthPercent > 0.6) {
            // Green (healthy)
            color = 0x00ff00;
        } else if (healthPercent > 0.3) {
            // Yellow (warning)
            color = 0xffff00;
        } else {
            // Red (danger)
            color = 0xff0000;
        }
        state.healthBarFill.setFillStyle(color, 1);

        // Adjust position to keep bar left-aligned
        const [x, y] = tileKey.split(',').map(Number);
        const barX = x * this.TILE_SIZE + this.TILE_SIZE / 2 - (maxWidth - newWidth) / 2;
        state.healthBarFill.setPosition(barX, y * this.TILE_SIZE - 2);
    }

    private resetHealthBar(tileKey: string) {
        const state = this.farmLandStates.get(tileKey);
        if (!state || !state.healthBarFill) return;

        // Reset to full health (green, full width)
        const maxWidth = 12;
        state.healthBarFill.setSize(maxWidth, 2);
        state.healthBarFill.setFillStyle(0x00ff00, 1);

        // Reset position
        const [x, y] = tileKey.split(',').map(Number);
        const barX = x * this.TILE_SIZE + this.TILE_SIZE / 2;
        state.healthBarFill.setPosition(barX, y * this.TILE_SIZE - 2);
    }

    private updatePlantSprite(x: number, y: number, cropType: PlantType, stage: number, isDead: boolean = false, isWilted: boolean = false) {
        this.removePlant(x, y);
        this.showPlant(x, y, cropType, stage, isDead, isWilted);

        // Recreate health bar if plant is alive
        if (!isDead) {
            const tileKey = `${x},${y}`;
            this.createHealthBar(x, y, tileKey);
        }
    }

    private getPlayerDirection(): { x: number, y: number } {
        const anim = this.player.anims.currentAnim;
        if (!anim) return { x: 0, y: 1 };

        if (anim.key.includes('down')) return { x: 0, y: 1 };
        if (anim.key.includes('up')) return { x: 0, y: -1 };
        if (anim.key.includes('left')) return { x: -1, y: 0 };
        if (anim.key.includes('right')) return { x: 1, y: 0 };

        return { x: 0, y: 1 };
    }

    private updateTimeDisplay() {
        // Show current real time
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        this.timeText.setText(timeStr);
    }

    private gameLoop() {
        // Advance time
        this.timeOfDay += 1;
        if (this.timeOfDay >= 24 * 60) {
            this.timeOfDay = 0;
            this.dayCounter++;
            this.onNewDay();
        }

        this.updateTimeDisplay();

        // Check plant death/wilt status
        this.checkPlantHealth();
    }

    private checkPlantHealth() {
        const currentTime = Date.now();

        this.farmLandStates.forEach((state, tileKey) => {
            if (!state.planted || !state.cropType) return;

            // Skip dead plants (but keep their health bar hidden)
            if (state.isDead) return;

            // Skip if no care time recorded (newly planted)
            if (!state.lastCareTime) return;

            // Update health bar display
            this.updateHealthBar(tileKey);

            const timeSinceLastCare = currentTime - state.lastCareTime;

            // Check if plant should die or wilt
            if (timeSinceLastCare >= DEATH_TIMER_MS) {
                // Plants at FLOWER stage or above don't die, they just wilt
                if (state.plantStage >= PLANT_STAGES.FLOWER) {
                    if (!state.isWilted) {
                        state.isWilted = true;
                        // Update sprite to show wilted state
                        const [x, y] = tileKey.split(',').map(Number);
                        this.updatePlantSprite(x, y, state.cropType, state.plantStage, false, true);
                        console.log(`Plant at ${tileKey} has wilted! (Stage ${state.plantStage})`);
                    }
                } else {
                    // Plant dies permanently
                    state.isDead = true;
                    const [x, y] = tileKey.split(',').map(Number);
                    this.updatePlantSprite(x, y, state.cropType, state.plantStage, true, false);
                    // Health bar is removed in removePlant (called by updatePlantSprite)
                    console.log(`Plant at ${tileKey} has DIED! No care for 72 hours.`);
                }
            }
        });
    }

    private onNewDay() {
        console.log('New day started!', this.dayCounter);
    }

    update() {
        // Don't allow movement when modals are open
        if (this.factoryModalOpen || this.chestOpen || this.seedSelectorOpen) {
            this.player.setVelocity(0, 0);
            return;
        }

        // Handle movement with collision check
        const speed = 80;
        let velocityX = 0;
        let velocityY = 0;

        // Keyboard controls
        if (this.cursors.left.isDown || this.wasdKeys.left.isDown) {
            velocityX = -speed;
        } else if (this.cursors.right.isDown || this.wasdKeys.right.isDown) {
            velocityX = speed;
        }

        if (this.cursors.up.isDown || this.wasdKeys.up.isDown) {
            velocityY = -speed;
        } else if (this.cursors.down.isDown || this.wasdKeys.down.isDown) {
            velocityY = speed;
        }

        // Virtual joystick controls (override keyboard if active)
        if (this.joystickActive && this.joystickPointer) {
            const joystickX = 80;
            const joystickY = this.scale.height - 80;
            const dx = this.joystickThumb.x - joystickX;
            const dy = this.joystickThumb.y - joystickY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) { // Deadzone
                const normalizedX = dx / distance;
                const normalizedY = dy / distance;
                velocityX = normalizedX * speed;
                velocityY = normalizedY * speed;
            }
        }

        // Touch move target (click to move)
        if (this.touchMoveTarget && !this.joystickActive) {
            const dx = this.touchMoveTarget.x - this.player.x;
            const dy = this.touchMoveTarget.y - this.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) { // Threshold to stop
                const normalizedX = dx / distance;
                const normalizedY = dy / distance;
                velocityX = normalizedX * speed;
                velocityY = normalizedY * speed;
            } else {
                // Reached target
                this.touchMoveTarget = null;
            }
        }

        // Check if the new position would be on land (not water)
        // Check multiple points of the player sprite for better collision
        if (velocityX !== 0 || velocityY !== 0) {
            const nextX = this.player.x + (velocityX * 0.02);
            const nextY = this.player.y + (velocityY * 0.02);

            // Check 5 points: center, top-left, top-right, bottom-left, bottom-right
            const halfWidth = this.player.width * 0.3; // Smaller hitbox for smoother movement
            const halfHeight = this.player.height * 0.3;

            const checkPoints = [
                { x: nextX, y: nextY }, // center
                { x: nextX - halfWidth, y: nextY - halfHeight }, // top-left
                { x: nextX + halfWidth, y: nextY - halfHeight }, // top-right
                { x: nextX - halfWidth, y: nextY + halfHeight }, // bottom-left
                { x: nextX + halfWidth, y: nextY + halfHeight }, // bottom-right
            ];

            // Check if any point would be on water
            let canMove = true;
            for (const point of checkPoints) {
                const tileX = Math.floor(point.x / this.TILE_SIZE);
                const tileY = Math.floor(point.y / this.TILE_SIZE);

                if (!this.isLandTile(tileX, tileY)) {
                    canMove = false;
                    break;
                }
            }

            if (!canMove) {
                // Don't allow movement - would go into water
                velocityX = 0;
                velocityY = 0;
            }
        }

        // Set velocity
        this.player.setVelocity(velocityX, velocityY);

        // Update animations
        if (velocityX !== 0 || velocityY !== 0) {
            if (Math.abs(velocityX) > Math.abs(velocityY)) {
                // Horizontal movement
                if (velocityX < 0) {
                    this.player.play('walk-left', true);
                } else {
                    this.player.play('walk-right', true);
                }
            } else {
                // Vertical movement
                if (velocityY < 0) {
                    this.player.play('walk-up', true);
                } else {
                    this.player.play('walk-down', true);
                }
            }
        } else {
            // Idle
            const currentAnim = this.player.anims.currentAnim;
            if (currentAnim) {
                if (currentAnim.key.includes('left')) {
                    this.player.play('idle-left', true);
                } else if (currentAnim.key.includes('right')) {
                    this.player.play('idle-right', true);
                } else if (currentAnim.key.includes('up')) {
                    this.player.play('idle-up', true);
                } else {
                    this.player.play('idle-down', true);
                }
            }
        }

        // Update player depth for proper layering
        this.player.setDepth(this.player.y);
    }

    shutdown() {
        EventBus.off('wallet-connected', this.onWalletConnected, this);
        this.scale.off('resize', this.onResize, this);
    }
}
