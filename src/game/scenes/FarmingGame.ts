import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { ISLAND_MAP_DATA } from './IslandMapData';

// Plant types based on proposal
type PlantType = 'social' | 'technical' | 'branded' | 'mushroom';

interface TileState {
    tilled: boolean;
    planted: boolean;
    plantStage: number; // 0-6 (seed -> stage1-5 -> fruit) or -1 for death
    cropType: PlantType | null;
    plantSprite?: Phaser.GameObjects.Image;
    isDead?: boolean;
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

    // Toolbar items (4 slots: hand, watering can, seed, fertilizer)
    private toolbarItems: ToolbarItem[] = [
        { type: 'tool', name: 'hand' },
        { type: 'tool', name: 'wateringCan', count: 100 },
        { type: 'seed', name: 'seed', count: 5 },
        { type: 'tool', name: 'fertilizer', count: 5 },
    ];
    private toolbarSlots: Phaser.GameObjects.GameObject[] = [];
    private toolbarElements: Phaser.GameObjects.GameObject[] = [];

    // UI
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private timeText!: Phaser.GameObjects.Text;
    private dayCounter: number = 1;
    private timeOfDay: number = 7 * 60; // 7:00 AM in minutes

    // Wallet
    private walletAddress: string = '';
    private walletUIElements: Phaser.GameObjects.GameObject[] = [];

    // Mobile controls
    private joystickBase!: Phaser.GameObjects.Arc;
    private joystickThumb!: Phaser.GameObjects.Arc;
    private joystickActive: boolean = false;
    private joystickPointer: Phaser.Input.Pointer | null = null;
    private touchMoveTarget: { x: number, y: number } | null = null;
    private actionButton!: Phaser.GameObjects.Arc;
    private actionButtonText!: Phaser.GameObjects.Text;

    constructor() {
        super('FarmingGame');
    }

    create() {
        // Create water animation first
        this.createWaterAnimation();

        // Create the island map
        this.createIslandMap();

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

        for (let i = 0; i < plantCount; i++) {
            // Random position on the island (rows 11-39, cols 10-39)
            const x = Phaser.Math.Between(11, 38);
            const y = Phaser.Math.Between(12, 38);

            // Skip if position is in center exclusion zone
            const distFromCenter = Math.max(Math.abs(x - centerX), Math.abs(y - centerY));
            if (distFromCenter < exclusionRadius) continue;

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
        this.player.setDepth(1000);

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

                // Count display
                if (item.count !== undefined && item.count > 0) {
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
            } else {
                // Tool icons
                let iconKey = '';
                if (item.name === 'wateringCan') iconKey = 'icon-watercan';
                else if (item.name === 'hand') iconKey = 'icon-hand';
                else if (item.name === 'fertilizer') iconKey = 'icon-fertilizer';

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
                } else {
                    this.closeSeedSelector();
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
        // Safety check - ensure scene and cameras are ready
        if (!this.sys || !this.cameras || !this.cameras.main) {
            console.log('FarmingGame: scene not ready for wallet display');
            return;
        }

        // Clear previous wallet UI
        this.walletUIElements.forEach(el => el.destroy());
        this.walletUIElements = [];

        if (!this.walletAddress) return;

        // Position in top-right corner
        const screenWidth = this.scale.width;
        const buttonWidth = 96;
        const buttonHeight = 32;
        const padding = 10;
        const gap = 6;

        // Logout button position (rightmost)
        const logoutX = screenWidth - buttonWidth / 2 - padding;
        const y = buttonHeight / 2 + padding;

        // Wallet button position (left of logout)
        const walletX = logoutX - buttonWidth - gap;

        // Background button for wallet (frame #0 - empty normal state)
        const bg = this.add.sprite(walletX, y, 'ui-big-play-button', 0);
        bg.setDepth(5010);
        this.cameras.main.ignore(bg);
        this.walletUIElements.push(bg);

        // Shortened wallet address (4...4)
        const shortAddress = `${this.walletAddress.slice(0, 6)}...${this.walletAddress.slice(-4)}`;

        // Wallet address text with pixel font
        const addressText = this.add.text(walletX, y, shortAddress, {
            fontFamily: 'PixelFont',
            fontSize: '12px',
            color: '#5D4037',
            resolution: 2
        });
        addressText.setOrigin(0.5);
        addressText.setDepth(5011);
        this.cameras.main.ignore(addressText);
        this.walletUIElements.push(addressText);

        // Logout button (using ui-big-play-button frame #0, same size as wallet)
        const logoutBg = this.add.sprite(logoutX, y, 'ui-big-play-button', 0);
        logoutBg.setDepth(5010);
        logoutBg.setInteractive({ useHandCursor: true });
        this.cameras.main.ignore(logoutBg);
        this.walletUIElements.push(logoutBg);

        // Logout text
        const logoutText = this.add.text(logoutX, y, 'Log out', {
            fontFamily: 'PixelFont',
            fontSize: '12px',
            color: '#5D4037',
            resolution: 2
        });
        logoutText.setOrigin(0.5);
        logoutText.setDepth(5011);
        this.cameras.main.ignore(logoutText);
        this.walletUIElements.push(logoutText);

        // Logout button interaction (use tint instead of frame to avoid "play" text)
        logoutBg.on('pointerover', () => {
            logoutBg.setTint(0xcccccc); // darken on hover
        });
        logoutBg.on('pointerout', () => {
            logoutBg.clearTint(); // clear tint
        });
        logoutBg.on('pointerdown', () => {
            this.handleLogout();
        });
    }

    private handleLogout() {
        // Emit disconnect event to React
        EventBus.emit('disconnect-wallet');

        // Clear wallet data
        this.walletAddress = '';
        this.walletUIElements.forEach(el => el.destroy());
        this.walletUIElements = [];

        // Transition to Login scene with fromLogout flag
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('Login', { fromLogout: true });
        });
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
        }
    }

    private plantSeed(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);
        const seedItem = this.toolbarItems.find(item => item.type === 'seed');

        if (state && state.tilled && !state.planted) {
            if (seedItem && seedItem.count !== undefined && seedItem.count > 0) {
                const selectedPlantType = this.getSelectedPlantType();

                state.planted = true;
                state.cropType = selectedPlantType;
                state.plantStage = 0;
                state.isDead = false;

                seedItem.count--;
                this.updateToolbar();

                // Show plant sprite (first growth stage)
                this.showPlant(x, y, selectedPlantType, 0);

                console.log('Planted', selectedPlantType, 'at', tileKey);
            } else {
                console.log('No seeds left!');
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
            const cropDef = CROP_DEFINITIONS[state.cropType];
            const maxStage = cropDef.growthImages.length; // 5 stages + fruit = 6 total

            if (state.plantStage < maxStage) {
                state.plantStage++;
                wateringCan.count--;
                this.updateToolbar();

                // Update plant sprite
                this.updatePlantSprite(x, y, state.cropType, state.plantStage);

                console.log('Watered and grew to stage', state.plantStage, 'at', tileKey, '- Water left:', wateringCan.count);
            } else {
                console.log('Plant is already fully grown at', tileKey);
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
            const cropDef = CROP_DEFINITIONS[state.cropType];
            const maxStage = cropDef.growthImages.length;

            if (state.plantStage < maxStage) {
                // Fertilizer grows plant by 2 stages (but not beyond max)
                state.plantStage = Math.min(state.plantStage + 2, maxStage);
                fertilizer.count--;
                this.updateToolbar();

                // Update plant sprite
                this.updatePlantSprite(x, y, state.cropType, state.plantStage);

                console.log('Fertilized and grew to stage', state.plantStage, 'at', tileKey, '- Fertilizer left:', fertilizer.count);
            } else {
                console.log('Plant is already fully grown at', tileKey);
            }
        }
    }

    private harvestCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);

        if (state && state.planted && state.cropType) {
            const cropDef = CROP_DEFINITIONS[state.cropType];
            const maxStage = cropDef.growthImages.length;

            if (state.plantStage >= maxStage) {
                // Reset state
                state.planted = false;
                state.plantStage = 0;
                state.cropType = null;
                state.isDead = false;

                // Remove plant sprite
                this.removePlant(x, y);

                console.log('Harvested crop at', tileKey);
            } else {
                console.log('Plant not ready to harvest at', tileKey);
            }
        }
    }

    private showPlant(x: number, y: number, cropType: PlantType, stage: number, isDead: boolean = false) {
        const cropDef = CROP_DEFINITIONS[cropType];
        let imageKey: string;

        if (isDead) {
            imageKey = cropDef.deathImage;
        } else if (stage === 0) {
            imageKey = cropDef.growthImages[0]; // First growth stage
        } else if (stage >= 5) {
            imageKey = cropDef.fruitImage; // Ready to harvest (fruit stage)
        } else if (stage < cropDef.growthImages.length) {
            imageKey = cropDef.growthImages[stage];
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
        // Make sure UI camera ignores this game object
        this.uiCamera.ignore(plant);
    }

    private removePlant(x: number, y: number) {
        const plant = this.children.getByName(`plant-${x}-${y}`);
        if (plant) {
            plant.destroy();
        }
    }

    private updatePlantSprite(x: number, y: number, cropType: PlantType, stage: number, isDead: boolean = false) {
        this.removePlant(x, y);
        this.showPlant(x, y, cropType, stage, isDead);
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
    }

    private onNewDay() {
        console.log('New day started!', this.dayCounter);
    }

    update() {
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
