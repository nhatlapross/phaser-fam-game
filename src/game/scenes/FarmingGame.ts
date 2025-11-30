import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { ISLAND_MAP_DATA } from './IslandMapData';

interface TileState {
    tilled: boolean;
    planted: boolean;
    plantStage: number; // 0-4 (seed -> stage1 -> stage2 -> stage3 -> harvest ready)
    cropType: 'wheat' | 'tomato' | null;
    plantSprite?: Phaser.GameObjects.Sprite;
}

// Crop definitions
// Wheat: frames 0 (seed bag), 1-4 (growth stages), 5 (harvest)
// Tomato: frames 6 (seed bag), 7-10 (growth stages), 11 (harvest)
interface CropDefinition {
    seedFrame: number;
    growthFrames: number[];
    harvestFrame: number;
}

const CROP_DEFINITIONS: Record<string, CropDefinition> = {
    wheat: {
        seedFrame: 0,
        growthFrames: [1, 2, 3, 4],
        harvestFrame: 5
    },
    tomato: {
        seedFrame: 6,
        growthFrames: [7, 8, 9, 10],
        harvestFrame: 11
    }
};

interface ToolbarItem {
    type: 'tool' | 'seed';
    name: string;
    cropType?: 'wheat' | 'tomato';
    spriteFrame: number;
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

    // Toolbar items
    private toolbarItems: ToolbarItem[] = [
        { type: 'tool', name: 'wateringCan', spriteFrame: -1 }, // Will use UI spritesheet
        { type: 'tool', name: 'hand', spriteFrame: -1 },
        { type: 'seed', name: 'wheatSeed', cropType: 'wheat', spriteFrame: 0, count: 3 },
        { type: 'seed', name: 'tomatoSeed', cropType: 'tomato', spriteFrame: 6, count: 3 },
    ];
    private toolbarSlots: Phaser.GameObjects.Container[] = [];
    private toolbarContainer!: Phaser.GameObjects.Container;

    // UI
    private timeText!: Phaser.GameObjects.Text;
    private dayCounter: number = 1;
    private timeOfDay: number = 7 * 60; // 7:00 AM in minutes

    // Mobile controls
    private joystickBase!: Phaser.GameObjects.Arc;
    private joystickThumb!: Phaser.GameObjects.Arc;
    private joystickActive: boolean = false;
    private joystickPointer: Phaser.Input.Pointer | null = null;
    private touchMoveTarget: { x: number, y: number } | null = null;

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

        // Setup camera
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(2); // Zoom in for pixel art

        // Setup controls
        this.setupControls();

        // Initialize inventory
        this.initializeInventory();

        // Create UI
        this.createUI();

        // Create mobile controls
        this.createMobileControls();

        // Setup interactions
        this.setupInteractions();

        // Start game loop
        this.time.addEvent({
            delay: 100, // Update every 100ms
            callback: this.gameLoop,
            callbackScope: this,
            loop: true
        });

        EventBus.emit('current-scene-ready', this);
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
        const farmPlotPositions = [
            { x: 24, y: 24 }, { x: 25, y: 24 }, { x: 26, y: 24 },
            { x: 24, y: 25 }, { x: 25, y: 25 }, { x: 26, y: 25 }
        ];

        for (let i = 0; i < plantCount; i++) {
            // Random position on the island (rows 11-39, cols 10-39)
            const x = Phaser.Math.Between(11, 38);
            const y = Phaser.Math.Between(12, 38);

            // Skip if position is on farm plots
            const isOnFarmPlot = farmPlotPositions.some(p => p.x === x && p.y === y);
            if (isOnFarmPlot) continue;

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
        // Check if all tiles for large object are on land
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                if (!this.isLandTile(x + dx, y + dy)) {
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

        // Debug key - press D to view tileset debug
        const keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        keyD.on('down', () => {
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
        this.timeText.setScrollFactor(0);
        this.timeText.setDepth(2000);
        this.updateTimeDisplay();

        // Toolbar (bottom center)
        this.createToolbar();
    }

    private createToolbar() {
        const slotSize = 32;
        const slotSpacing = 4;
        const numSlots = this.toolbarItems.length;
        const totalWidth = (slotSize + slotSpacing) * numSlots - slotSpacing + 16; // +16 for padding
        const startX = (this.scale.width - totalWidth) / 2;
        const startY = this.scale.height - slotSize - 24;

        // Container for entire toolbar
        this.toolbarContainer = this.add.container(0, 0);
        this.toolbarContainer.setScrollFactor(0);
        this.toolbarContainer.setDepth(2000);

        // Toolbar background
        const toolbarBg = this.add.rectangle(
            this.scale.width / 2,
            startY + slotSize / 2,
            totalWidth + 8,
            slotSize + 8,
            0x8B6914,
            0.95
        );
        toolbarBg.setStrokeStyle(3, 0x5D4E37);
        this.toolbarContainer.add(toolbarBg);

        // Create slots
        this.toolbarSlots = [];
        for (let i = 0; i < numSlots; i++) {
            const x = startX + 12 + i * (slotSize + slotSpacing);
            const y = startY;

            const slot = this.add.container(x, y);

            // Slot background
            const bg = this.add.rectangle(slotSize/2, slotSize/2, slotSize, slotSize, 0xD4A574, 0.95);
            bg.setStrokeStyle(2, i === this.selectedToolIndex ? 0xFFD700 : 0x8B6914);
            slot.add(bg);

            const item = this.toolbarItems[i];

            // Add icon based on item type
            if (item.type === 'seed') {
                // Use crops spritesheet for seeds
                const icon = this.add.sprite(slotSize/2, slotSize/2, 'crops', item.spriteFrame);
                icon.setScale(1.5);
                slot.add(icon);

                // Count display
                if (item.count !== undefined && item.count > 0) {
                    const countText = this.add.text(slotSize - 4, slotSize - 4, item.count.toString(), {
                        fontSize: '10px',
                        color: '#ffffff',
                        backgroundColor: '#00000099',
                        padding: { x: 2, y: 1 }
                    });
                    countText.setOrigin(1, 1);
                    slot.add(countText);
                }
            } else {
                // Tool icons using emoji or text
                let iconText = '';
                if (item.name === 'wateringCan') iconText = '💧';
                else if (item.name === 'hand') iconText = '✋';

                const icon = this.add.text(slotSize/2, slotSize/2, iconText, {
                    fontSize: '18px'
                });
                icon.setOrigin(0.5);
                slot.add(icon);
            }

            // Make slot interactive
            bg.setInteractive();
            bg.on('pointerdown', () => {
                this.selectToolbarSlot(i);
            });

            this.toolbarContainer.add(slot);
            this.toolbarSlots.push(slot);
        }
    }

    private selectToolbarSlot(index: number) {
        if (index < 0 || index >= this.toolbarItems.length) return;

        this.selectedToolIndex = index;

        // Update slot borders
        this.toolbarSlots.forEach((slot, i) => {
            const bg = slot.getAt(0) as Phaser.GameObjects.Rectangle;
            bg.setStrokeStyle(2, i === index ? 0xFFD700 : 0x8B6914);
        });
    }

    private updateToolbar() {
        // Destroy and recreate toolbar
        this.toolbarSlots.forEach(slot => slot.destroy());
        this.toolbarSlots = [];
        if (this.toolbarContainer) {
            this.toolbarContainer.destroy();
        }
        this.createToolbar();
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
        this.joystickBase.setScrollFactor(0);
        this.joystickBase.setDepth(2000);

        // Joystick thumb
        this.joystickThumb = this.add.circle(joystickX, joystickY, thumbRadius, 0xffffff, 0.8);
        this.joystickThumb.setScrollFactor(0);
        this.joystickThumb.setDepth(2001);

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
        const actionButton = this.add.circle(
            this.scale.width - 80,
            this.scale.height - 80,
            40,
            0xff6b6b,
            0.8
        );
        actionButton.setStrokeStyle(3, 0xffffff, 0.9);
        actionButton.setScrollFactor(0);
        actionButton.setDepth(2000);
        actionButton.setInteractive();

        // Action button text
        const actionText = this.add.text(
            this.scale.width - 80,
            this.scale.height - 80,
            '⚒',
            { fontSize: '32px' }
        );
        actionText.setOrigin(0.5);
        actionText.setScrollFactor(0);
        actionText.setDepth(2001);

        actionButton.on('pointerdown', () => {
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

        if (selectedItem.type === 'seed' && selectedItem.cropType) {
            // Plant seed
            this.plantSeed(tileKey, playerTileX, playerTileY, selectedItem);
        } else if (selectedItem.name === 'wateringCan') {
            // Water plant
            this.waterCrop(tileKey, playerTileX, playerTileY);
        } else if (selectedItem.name === 'hand') {
            // Harvest crop
            this.harvestCrop(tileKey, playerTileX, playerTileY);
        }
    }

    private plantSeed(tileKey: string, x: number, y: number, seedItem: ToolbarItem) {
        const state = this.farmLandStates.get(tileKey);

        if (state && state.tilled && !state.planted) {
            if (seedItem.count !== undefined && seedItem.count > 0 && seedItem.cropType) {
                state.planted = true;
                state.cropType = seedItem.cropType;
                state.plantStage = 0;

                seedItem.count--;
                this.updateToolbar();

                // Show plant sprite (first growth stage)
                this.showPlant(x, y, state.cropType, 0);

                console.log('Planted', seedItem.cropType, 'at', tileKey);
            }
        }
    }

    private waterCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);

        if (state && state.planted && state.cropType) {
            const cropDef = CROP_DEFINITIONS[state.cropType];
            const maxStage = cropDef.growthFrames.length; // 4 stages

            if (state.plantStage < maxStage) {
                state.plantStage++;

                // Update plant sprite
                this.updatePlantSprite(x, y, state.cropType, state.plantStage);

                console.log('Watered and grew to stage', state.plantStage, 'at', tileKey);
            } else {
                console.log('Plant is already fully grown at', tileKey);
            }
        }
    }

    private harvestCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);

        if (state && state.planted && state.cropType) {
            const cropDef = CROP_DEFINITIONS[state.cropType];
            const maxStage = cropDef.growthFrames.length;

            if (state.plantStage >= maxStage) {
                // Reset state
                state.planted = false;
                state.plantStage = 0;
                state.cropType = null;

                // Remove plant sprite
                this.removePlant(x, y);

                console.log('Harvested crop at', tileKey);
            } else {
                console.log('Plant not ready to harvest at', tileKey);
            }
        }
    }

    private showPlant(x: number, y: number, cropType: 'wheat' | 'tomato', stage: number) {
        // Get frame from crop definition
        const cropDef = CROP_DEFINITIONS[cropType];
        let frame: number;

        if (stage === 0) {
            frame = cropDef.growthFrames[0]; // First growth stage
        } else if (stage >= cropDef.growthFrames.length) {
            frame = cropDef.harvestFrame; // Ready to harvest
        } else {
            frame = cropDef.growthFrames[stage];
        }

        const plant = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            y * this.TILE_SIZE + this.TILE_SIZE / 2,
            'crops',
            frame
        );
        plant.setOrigin(0.5);
        plant.setDepth(y * this.TILE_SIZE + 5);
        plant.setName(`plant-${x}-${y}`);
    }

    private removePlant(x: number, y: number) {
        const plant = this.children.getByName(`plant-${x}-${y}`);
        if (plant) {
            plant.destroy();
        }
    }

    private updatePlantSprite(x: number, y: number, cropType: 'wheat' | 'tomato', stage: number) {
        this.removePlant(x, y);
        this.showPlant(x, y, cropType, stage);
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
        const hours = Math.floor(this.timeOfDay / 60);
        const minutes = this.timeOfDay % 60;
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

        this.timeText.setText(`Day ${this.dayCounter}\n${timeStr}`);
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
}
