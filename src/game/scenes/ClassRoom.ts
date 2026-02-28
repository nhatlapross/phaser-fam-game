import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import {
    CLASS_ROOM_MAP_DATA,
    CLASS_ROOM_MAP_WIDTH,
    CLASS_ROOM_MAP_HEIGHT,
    CLASS_ROOM_FLOOR_BORDER,
    CLASS_ROOM_FIRST_FLOOR_ROW,
    CLASS_ROOM_WALL_TOP_ROW,
    CLASS_ROOM_WALL_LEFT,
    CLASS_ROOM_WALL_RIGHT,
} from './ClassRoomMapData';
import { SoundManager, NavigationData, ProfileManager, ToolbarManager, ToolbarItem, PlantType, GAME_CONSTANTS } from '../managers';
import { GameDataService } from '../GameDataService';
import { UserService } from '../UserService';
import { useGameState } from '../hooks/useGameState';
import { CHARACTER_KEYS, PLAYABLE_CHARACTERS, DEFAULT_CHARACTER, getNextCharacterKey } from '../config/CharacterConfig';
import { DynamicShadow } from '../objects/DynamicShadow';

/**
 * ClassRoom Scene - An indoor classroom space
 * Uses classroom tileset for floor, black background instead of water
 */
export class ClassRoom extends Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private playerShadow!: DynamicShadow;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

    // World configuration
    private readonly TILE_SIZE = 16;
    private readonly MAP_WIDTH = CLASS_ROOM_MAP_WIDTH;
    private readonly MAP_HEIGHT = CLASS_ROOM_MAP_HEIGHT;

    // Door position — middle of the bottom border
    private readonly DOOR_TILE_X = CLASS_ROOM_MAP_WIDTH / 2;
    private readonly DOOR_TILE_Y = CLASS_ROOM_MAP_HEIGHT - CLASS_ROOM_FLOOR_BORDER;

    // Tilemap
    private map!: Phaser.Tilemaps.Tilemap;
    private groundLayer!: Phaser.Tilemaps.TilemapLayer;

    // UI
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;

    // Mobile joystick
    private joystickBase!: Phaser.GameObjects.Arc;
    private joystickThumb!: Phaser.GameObjects.Arc;
    private joystickActive: boolean = false;
    private joystickPointer: Phaser.Input.Pointer | null = null;

    // Player speed
    private playerSpeed: number = 64;

    // Studying state
    private isSitting: boolean = false;
    private studyingOverlay: Phaser.GameObjects.Container | null = null;

    // NPC teachers
    private npcs: Array<{
        sprite:       Phaser.Physics.Arcade.Sprite;
        key:          string;
        targetX:      number;
        targetY:      number;
        isIdle:       boolean;
        idleTimeLeft: number;
        chatBubble:   Phaser.GameObjects.Container | null;
        chatTimeLeft: number;
        nextChatIn:   number;
    }> = [];
    private readonly NPC_SPEED = 28;
    private readonly NPC_CHAT_MESSAGES = [
        'Let\'s learn! 📚', 'Any questions?', 'Very good! ✨',
        'Study hard!', 'Excellent! 🎓', 'Pay attention!',
        'Read more books', 'Interesting!', 'Think deeper!',
        'Well done! 👏', 'Focus please!', 'Great work!',
        'Keep it up! 💪', 'Raise your hand!', 'Listen up!',
    ];

    // Managers
    private soundManager!: SoundManager;
    private profileManager!: ProfileManager;
    private toolbarManager!: ToolbarManager;

    // Navigation data (from station travel)
    private navigationData: NavigationData | null = null;

    // Character
    private currentCharacterKey: string = DEFAULT_CHARACTER;
    private pKey!: Phaser.Input.Keyboard.Key;

    // Player name text
    private playerNameText!: Phaser.GameObjects.Text;

    // Clock UI
    private timeText!: Phaser.GameObjects.Text;

    // Toolbar state
    private toolbarItems: ToolbarItem[] = [
        { type: 'tool', name: 'hand' },
        { type: 'tool', name: 'wateringCan', count: 0 },
        { type: 'seed', name: 'seed' },
        { type: 'tool', name: 'fertilizer' },
        { type: 'tool', name: 'digest' },
        { type: 'tool', name: 'chest' },
    ];
    private seedCounts: Record<PlantType, number> = { algae: 0, mushroom: 0, tree: 0 };
    private fertilizerCounts: Record<'common' | 'rare' | 'epic' | 'legendary', number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    private chestInventory: { type: PlantType; count: number }[] = [];
    private chestOpen: boolean = false;
    private selectedToolIndex: number = 0;
    private selectedSeedIndex: number = 0;
    private selectedFertilizerIndex: number = 0;

    constructor() {
        super('ClassRoom');
    }

    init(data?: NavigationData) {
        this.navigationData = data?.spawnAt ? data : null;
    }

    create() {
        // Set black background for main camera
        this.cameras.main.setBackgroundColor('#000000');

        // Initialize sound manager
        this.soundManager = new SoundManager(this);

        // Create the classroom map
        this.createClassRoomMap();

        // Place the board on the wall
        this.createBoard();

        // Create door at the bottom center
        this.createDoor();

        // Lay out desk+chair sets
        this.createFurniture();

        // Spawn NPC teachers
        this.createNPCs();

        // Create player
        this.createPlayer();

        // Setup main camera
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(3);
        this.cameras.main.setRoundPixels(true);

        // Set camera world bounds to map size
        this.cameras.main.setBounds(
            0, 0,
            this.MAP_WIDTH * this.TILE_SIZE,
            this.MAP_HEIGHT * this.TILE_SIZE
        );

        // Create UI camera
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera.setScroll(0, 0);
        this.uiCamera.name = 'uiCamera';

        // Create clock UI
        this.createClockUI();

        // Initialize game state from cache
        this.initializeGameState();

        // Create profile manager
        this.profileManager = new ProfileManager(this, {
            onLogout: () => {
                this.scene.start('Login', { fromLogout: true });
            },
            onWalletConnected: (_address) => { }
        });
        this.profileManager.createProfileUI();

        // Create toolbar manager
        this.toolbarManager = new ToolbarManager(this, {
            getToolbarItems: () => this.toolbarItems,
            getSeedCounts: () => this.seedCounts,
            getFertilizerCounts: () => this.fertilizerCounts,
            getChestInventory: () => this.chestInventory,
            getSelectedToolIndex: () => this.selectedToolIndex,
            getSelectedSeedIndex: () => this.selectedSeedIndex,
            getSelectedFertilizerIndex: () => this.selectedFertilizerIndex,
            getChestOpen: () => this.chestOpen,
            setSelectedToolIndex: (index) => { this.selectedToolIndex = index; },
            setSelectedSeedIndex: (index) => { this.selectedSeedIndex = index; },
            setSelectedFertilizerIndex: (index) => { this.selectedFertilizerIndex = index; },
            setChestOpen: (open) => { this.chestOpen = open; },
            onSeedOptionClicked: () => { },
            showToastMessage: (text, color) => this.showToastMessage(text, color),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        });

        // Setup controls
        this.setupControls();

        // Create mobile joystick
        this.createMobileControls();

        // Setup camera ignore for UI elements
        this.setupCameraIgnore();

        // Listen for game data updates
        EventBus.on('gamedata:updated', this.onGameDataUpdated, this);

        // Handle resize
        this.scale.on('resize', this.onResize, this);

        // Play theme music
        this.soundManager.playRandomTheme();

        this.events.on('postupdate', this.updatePlayerUI, this);

        EventBus.emit('current-scene-ready', this);
    }

    private createClassRoomMap() {
        // Create tilemap
        this.map = this.make.tilemap({
            tileWidth: this.TILE_SIZE,
            tileHeight: this.TILE_SIZE,
            width: this.MAP_WIDTH,
            height: this.MAP_HEIGHT
        });

        // Add classroom tileset
        const classroomTiles = this.map.addTilesetImage('classroom', 'classroom-tileset');

        if (!classroomTiles) {
            console.warn('ClassRoom: could not load classroom-tileset');
            return;
        }

        // Create ground layer
        this.groundLayer = this.map.createBlankLayer('Ground', classroomTiles) as Phaser.Tilemaps.TilemapLayer;

        if (!this.groundLayer) {
            return;
        }

        this.groundLayer.setDepth(1);

        // Place tiles using autotiling
        for (let y = 0; y < this.MAP_HEIGHT; y++) {
            for (let x = 0; x < this.MAP_WIDTH; x++) {
                const tileValue = CLASS_ROOM_MAP_DATA[y][x];

                if (tileValue === 3) {
                    // Wall TOP — cream cap with brown border (tiles 55-59)
                    this.groundLayer.putTileAt(this.getWallTopTileIndex(x), x, y);
                } else if (tileValue === 4) {
                    // Wall BODY — plain cream fill (tiles 61-62)
                    this.groundLayer.putTileAt(this.getWallBodyTileIndex(x), x, y);
                } else if (tileValue > 0) {
                    // Floor tile — autotile based on neighbors
                    this.groundLayer.putTileAt(this.getAutoTileIndex(x, y), x, y);
                }
                // tileValue === 0 → black background (camera background color)
            }
        }

        // Draw thin black overlay strips for visual padding
        this.createWallPaddingOverlays();
    }

    /**
     * Draws sub-tile (~0.2 tile = ~3px) black Rectangle strips along the
     * left edge, right edge, and bottom edge of the wall area.
     * This gives a clean visual separation without modifying the tile grid.
     */
    private createWallPaddingOverlays() {
        const PADDING_PX = Math.round(0.2 * this.TILE_SIZE); // ~3 px

        const wallLeft   = CLASS_ROOM_WALL_LEFT  * this.TILE_SIZE;
        const wallRight  = CLASS_ROOM_WALL_RIGHT * this.TILE_SIZE;
        const wallTop    = CLASS_ROOM_WALL_TOP_ROW    * this.TILE_SIZE;
        const wallBottom = CLASS_ROOM_FIRST_FLOOR_ROW * this.TILE_SIZE;

        const wallH = wallBottom - wallTop;
        const wallW = wallRight  - wallLeft;

        // Left strip — covers inner-left edge of the wall
        this.add.rectangle(
            wallLeft + PADDING_PX / 2,
            wallTop  + wallH / 2,
            PADDING_PX, wallH,
            0x000000
        ).setDepth(2);

        // Right strip — covers inner-right edge of the wall
        this.add.rectangle(
            wallRight - PADDING_PX / 2,
            wallTop   + wallH / 2,
            PADDING_PX, wallH,
            0x000000
        ).setDepth(2);
    }

    /**
     * Returns true for any non-black tile (floor or wall).
     * Treating wall tiles as "solid" prevents the autotile from placing a
     * dark top-edge tile on the first floor row below the wall, which would
     * otherwise create a visible black band at the wall-floor junction.
     */
    private isFloorTile(x: number, y: number): boolean {
        if (x < 0 || x >= this.MAP_WIDTH || y < 0 || y >= this.MAP_HEIGHT) {
            return false;
        }
        return CLASS_ROOM_MAP_DATA[y][x] > 0;
    }

    /**
     * Autotile index based on neighbors - same layout as square tileset (11 cols × 7 rows)
     * Tile index convention (row × 11 + col):
     *   Row 0: top edge tiles  (corners: 0,2 | edge: 1)
     *   Row 1: middle tiles   (edges: 11,13 | center: 12)
     *   Row 2: bottom edge   (corners: 22,24 | edge: 23)
     */
    private getAutoTileIndex(x: number, y: number): number {
        const top    = this.isFloorTile(x, y - 1);
        const bottom = this.isFloorTile(x, y + 1);
        const left   = this.isFloorTile(x - 1, y);
        const right  = this.isFloorTile(x + 1, y);

        // Full center
        if (top && bottom && left && right) return 12;

        // Outer corners
        if (!top && !left && bottom && right) return 0;   // Top-left corner
        if (!top && !right && bottom && left) return 2;   // Top-right corner
        if (!bottom && !left && top && right) return 22;  // Bottom-left corner
        if (!bottom && !right && top && left) return 24;  // Bottom-right corner

        // Edges
        if (!top && bottom && left && right) return 1;    // Top edge
        if (top && !bottom && left && right) return 23;   // Bottom edge
        if (top && bottom && !left && right) return 11;   // Left edge
        if (top && bottom && left && !right) return 13;   // Right edge

        // Default: center floor
        return 12;
    }

    /**
     * Places the blackboard centred on the cream wall at the top of the room.
     * Board is sized to fill most of the wall height (≈ 4 of 5 wall rows).
     */
    private createBoard() {
        const wallTop    = CLASS_ROOM_WALL_TOP_ROW    * this.TILE_SIZE; // y = 48
        const wallBottom = CLASS_ROOM_FIRST_FLOOR_ROW * this.TILE_SIZE; // y = 128
        const wallCenterY = (wallTop + wallBottom) / 2;                 // y = 88
        const wallCenterX = (CLASS_ROOM_MAP_WIDTH / 2) * this.TILE_SIZE; // x = 320

        // Target height: 4 wall-rows (leave half-tile margin top & bottom)
        const boardH = (wallBottom - wallTop) * 0.80; // ~64 px
        const boardW = boardH * (1280 / 917);          // preserve aspect ratio ≈ 89 px

        const board = this.add.image(wallCenterX, wallCenterY, 'classroom-board');
        board.setOrigin(0.5, 0.5);
        board.setDisplaySize(boardW, boardH);
        board.setDepth(wallCenterY); // sits in wall space, always behind floor objects
    }

    /**
     * Places 3 groups of desk+chair sets across the classroom floor.
     * Each group: 4 columns × 5 rows. Groups are separated by walking aisles.
     *
     * Layout (game pixels, floor: x 48–592, y 128–432):
     *   Group 1 cols: x = 80, 120, 160, 200
     *   Group 2 cols: x = 264, 304, 344, 384    (center aisle ~64px either side)
     *   Group 3 cols: x = 448, 488, 528, 568
     *   Rows y: 152, 200, 248, 296, 344 (48px / 3-tile spacing)
     */
    private createFurniture() {
        const TABLE_SCALE  = 0.05;
        const CHAIR_SCALE  = 0.018;  // smaller chair
        const TABLE_H      = Math.round(578  * TABLE_SCALE);  // ~29 px
        const CHAIR_H      = Math.round(1200 * CHAIR_SCALE);  // ~22 px
        const CHAIR_OFFSET = 16; // px — moved up, closer to table

        // X columns shifted 16px (1 tile) to the left
        const groups: number[][] = [
            [80,  120, 160, 200],   // Group 1 – left
            [264, 304, 344, 384],   // Group 2 – centre
            [448, 488, 528, 568],   // Group 3 – right
        ];

        // 5 Y rows, first row 1 tile below the floor start
        const FIRST_Y    = (CLASS_ROOM_FIRST_FLOOR_ROW + 1) * this.TILE_SIZE; // ~144 px
        const ROW_SPACING = this.TILE_SIZE * 3; // 48 px

        for (const colGroup of groups) {
            for (const deskX of colGroup) {
                for (let r = 0; r < 5; r++) {
                    const deskY = FIRST_Y + r * ROW_SPACING;

                    // Table
                    const table = this.add.image(deskX, deskY, 'classroom-table');
                    table.setOrigin(0.5, 0);
                    table.setScale(TABLE_SCALE);
                    table.setDepth(deskY + TABLE_H);

                    // Chair – partially tucked under the bottom of the table
                    const chair = this.add.image(deskX, deskY + CHAIR_OFFSET, 'classroom-chair');
                    chair.setOrigin(0.5, 0);
                    chair.setScale(CHAIR_SCALE);
                    chair.setDepth(deskY + CHAIR_OFFSET + CHAIR_H);

                    // Seat position: center of the chair
                    const seatX = deskX;
                    const seatY = deskY + CHAIR_OFFSET + CHAIR_H / 2 + 6;

                    // Both table and chair are clickable
                    table.setInteractive({ useHandCursor: true });
                    chair.setInteractive({ useHandCursor: true });
                    table.on('pointerdown', () => this.sitAtDesk(seatX, seatY));
                    chair.on('pointerdown', () => this.sitAtDesk(seatX, seatY));
                }
            }
        }
    }

    /** Teleports the player to the seat and shows the studying overlay. */
    private sitAtDesk(seatX: number, seatY: number) {
        if (this.isSitting) return;

        this.isSitting = true;

        // Move player to seat
        this.player.setPosition(seatX, seatY);
        this.player.setVelocity(0, 0);
        this.player.play(`${this.currentCharacterKey}-idle-up`, true);

        this.showStudyingOverlay();
    }

    /** Shows a computer-screen style "Studying" overlay in screen space. */
    private showStudyingOverlay() {
        const W = this.scale.width;
        const H = this.scale.height;

        const container = this.add.container(0, 0);
        container.setDepth(5300);
        this.cameras.main.ignore(container);

        // Dim backdrop
        const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55);
        backdrop.setInteractive(); // block clicks behind
        container.add(backdrop);

        // Monitor frame
        const monW = 320, monH = 220;
        const monX = W / 2, monY = H / 2 - 10;
        const frame = this.add.rectangle(monX, monY, monW, monH, 0x2c2c2c);
        frame.setStrokeStyle(3, 0x555555);
        container.add(frame);

        // Screen area (inner)
        const screen = this.add.rectangle(monX, monY - 12, monW - 20, monH - 50, 0x0a1628);
        screen.setStrokeStyle(2, 0x1a3a6a);
        container.add(screen);

        // Blinking cursor line at top of screen
        const cursor = this.add.text(monX - (monW - 20) / 2 + 10, monY - 12 - (monH - 50) / 2 + 8, '>', {
            fontSize: '10px', fontFamily: 'monospace', color: '#00ff88', resolution: 2
        });
        container.add(cursor);
        this.tweens.add({ targets: cursor, alpha: 0, duration: 600, yoyo: true, repeat: -1 });

        // Main studying text
        const studyText = this.add.text(monX, monY - 18, '📚 Studying...', {
            fontSize: '18px', fontFamily: 'PixelFont', color: '#00ff88',
            resolution: 2, align: 'center'
        }).setOrigin(0.5);
        container.add(studyText);

        // Sub-text
        const subText = this.add.text(monX, monY + 14, 'Keep learning & growing!', {
            fontSize: '10px', fontFamily: 'PixelFont', color: '#4fc3f7',
            resolution: 2, align: 'center'
        }).setOrigin(0.5);
        container.add(subText);

        // Monitor stand
        const stand = this.add.rectangle(monX, monY + monH / 2 + 8, 14, 16, 0x3a3a3a);
        container.add(stand);
        const base = this.add.rectangle(monX, monY + monH / 2 + 18, 50, 6, 0x3a3a3a);
        container.add(base);

        // Stand up button
        const btnY = monY + monH / 2 + 36;
        const btnBg = this.add.rectangle(monX, btnY, 130, 28, 0x5D4037);
        btnBg.setStrokeStyle(2, 0x3E2723);
        btnBg.setInteractive({ useHandCursor: true });
        container.add(btnBg);

        const btnText = this.add.text(monX, btnY, '🚶 Stand Up', {
            fontSize: '11px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        }).setOrigin(0.5);
        container.add(btnText);

        btnBg.on('pointerover',  () => btnBg.setFillStyle(0x795548));
        btnBg.on('pointerout',   () => btnBg.setFillStyle(0x5D4037));
        btnBg.on('pointerdown',  () => this.stopStudying());

        this.studyingOverlay = container;
    }

    /** Removes the studying overlay and restores player movement. */
    private stopStudying() {
        if (!this.isSitting) return;
        this.studyingOverlay?.destroy();
        this.studyingOverlay = null;
        this.isSitting = false;
    }

    /**
     * Creates the exit door at the bottom-center of the classroom.
     * Clicking it returns the player to TownSquare at the classroom location.
     */
    private createDoor() {
        const doorX = this.DOOR_TILE_X * this.TILE_SIZE;
        // Move 1 tile up from the bottom border so the door sits fully in the floor area
        const doorY = (this.DOOR_TILE_Y - 0.2) * this.TILE_SIZE;

        const door = this.add.image(doorX, doorY, 'door');
        door.setOrigin(0.5, 1); // anchor at bottom-center
        // Scale to preserve natural aspect ratio (full image 632×395, content 219×395)
        // At scale 0.12: content appears ~26px wide × 47px tall (proportional portrait door)
        door.setScale(0.13);
        door.setDepth(doorY);

        door.setInteractive({ useHandCursor: true });
        door.on('pointerdown', () => {
            this.soundManager?.playSuccessSound();
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.time.delayedCall(500, () => {
                this.scene.start('TownSquare', { spawnAt: 'classroom' });
            });
        });
    }

    /**
     * Wall TOP tile indices — row 5 of tileset, brown border on top:
     *   55 = left corner  │ 56-58 = body (3 variants) │ 59 = right corner
     *
     * Wall starts at CLASS_ROOM_WALL_LEFT (inset 1 from floor edge = padding).
     */
    private getWallTopTileIndex(x: number): number {
        const leftEdge  = CLASS_ROOM_WALL_LEFT;
        const rightEdge = CLASS_ROOM_WALL_RIGHT - 1; // last column (inclusive)

        if (x === leftEdge)  return 55; // left corner  (brown top + left border)
        if (x === rightEdge) return 59; // right corner (brown top + right border)

        const bodyVariant = (x - leftEdge - 1) % 3;
        return 56 + bodyVariant; // 56, 57, or 58
    }

    /**
     * Wall BODY tile indices — plain cream fill below the cap.
     * Edge columns reuse corner tiles (55 / 59) so the left and right brown
     * border lines continue down through all body rows, giving the wall a
     * framed appearance.
     *   55 = left edge  │  61/62 alternating = middle  │  59 = right edge
     */
    private getWallBodyTileIndex(x: number): number {
        const leftEdge  = CLASS_ROOM_WALL_LEFT;
        const rightEdge = CLASS_ROOM_WALL_RIGHT - 1;

        if (x === leftEdge)  return 55; // keep left border line
        if (x === rightEdge) return 59; // keep right border line

        return (x % 2 === 0) ? 61 : 62; // alternating cream fill
    }

    private createPlayer() {
        let startX: number;
        let startY: number;

        // Always spawn at the door (bottom center), 2 tiles above it
        startX = this.DOOR_TILE_X * this.TILE_SIZE;
        startY = (this.DOOR_TILE_Y - 2) * this.TILE_SIZE;

        // Determine character from user data
        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();
        const characterType = user?.characterType || 1;
        const characterIndex = Math.max(0, Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1));
        this.currentCharacterKey = PLAYABLE_CHARACTERS[characterIndex]?.key || DEFAULT_CHARACTER;

        this.player = this.physics.add.sprite(startX, startY, this.currentCharacterKey, 0);
        this.player.setOrigin(GAME_CONSTANTS.CHARACTER_ORIGIN_X, GAME_CONSTANTS.CHARACTER_ORIGIN_Y);
        this.player.setScale(GAME_CONSTANTS.CHARACTER_SCALE);
        this.player.setCollideWorldBounds(false);
        this.player.setDepth(startY);

        this.playerShadow = new DynamicShadow(this, this.player, 0, 2);

        this.createPlayerAnimations();
        this.player.play(`${this.currentCharacterKey}-idle-down`);

        // Player name above character
        const fullName = user?.username || 'Player';
        const playerName = fullName.length > 9 ? fullName.substring(0, 9) + '...' : fullName;
        this.playerNameText = this.add.text(startX, startY - 18, playerName, {
            fontSize: '6px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        this.playerNameText.setOrigin(0.5, 1);
        this.playerNameText.setDepth(startY + 1);
        this.playerNameText.setStroke('#000000', 1);
    }

    private createPlayerAnimations() {
        const frameRate = 6;

        PLAYABLE_CHARACTERS.forEach(char => {
            const charKey = char.key;
            if (this.anims.exists(`${charKey}-idle-down`)) return;

            this.anims.create({ key: `${charKey}-idle-down`,  frames: this.anims.generateFrameNumbers(charKey, { start: 0, end: 1 }),   frameRate: 2, repeat: -1 });
            this.anims.create({ key: `${charKey}-walk-down`,  frames: this.anims.generateFrameNumbers(charKey, { start: 0, end: 3 }),   frameRate,   repeat: -1 });
            this.anims.create({ key: `${charKey}-idle-up`,    frames: this.anims.generateFrameNumbers(charKey, { start: 4, end: 5 }),   frameRate: 2, repeat: -1 });
            this.anims.create({ key: `${charKey}-walk-up`,    frames: this.anims.generateFrameNumbers(charKey, { start: 4, end: 7 }),   frameRate,   repeat: -1 });
            this.anims.create({ key: `${charKey}-idle-left`,  frames: this.anims.generateFrameNumbers(charKey, { start: 8, end: 9 }),   frameRate: 2, repeat: -1 });
            this.anims.create({ key: `${charKey}-walk-left`,  frames: this.anims.generateFrameNumbers(charKey, { start: 8, end: 11 }),  frameRate,   repeat: -1 });
            this.anims.create({ key: `${charKey}-idle-right`, frames: this.anims.generateFrameNumbers(charKey, { start: 12, end: 13 }), frameRate: 2, repeat: -1 });
            this.anims.create({ key: `${charKey}-walk-right`, frames: this.anims.generateFrameNumbers(charKey, { start: 12, end: 15 }), frameRate,   repeat: -1 });
        });
    }

    private setupControls() {
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();

            // P key to switch character
            this.pKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
            this.pKey.on('down', () => this.switchCharacter());
        }
    }

    private switchCharacter() {
        this.currentCharacterKey = getNextCharacterKey(this.currentCharacterKey);

        const currentAnim = this.player.anims.currentAnim?.key || '';
        let direction = 'down';
        if (currentAnim.includes('up')) direction = 'up';
        else if (currentAnim.includes('left')) direction = 'left';
        else if (currentAnim.includes('right')) direction = 'right';
        const isWalking = currentAnim.includes('walk');

        this.player.setTexture(this.currentCharacterKey, 0);
        this.player.play(`${this.currentCharacterKey}-${isWalking ? 'walk' : 'idle'}-${direction}`, true);
    }

    private createMobileControls() {
        const screenHeight = this.scale.height;
        const joystickX = 80;
        const joystickY = screenHeight - 80;

        this.joystickBase = this.add.circle(joystickX, joystickY, 40, 0x333333, 0.5);
        this.joystickBase.setDepth(5100);
        this.joystickBase.setScrollFactor(0);
        this.cameras.main.ignore(this.joystickBase);

        this.joystickThumb = this.add.circle(joystickX, joystickY, 20, 0x666666, 0.8);
        this.joystickThumb.setDepth(5101);
        this.joystickThumb.setScrollFactor(0);
        this.cameras.main.ignore(this.joystickThumb);

        this.joystickBase.setInteractive();
        this.joystickBase.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.joystickActive = true;
            this.joystickPointer = pointer;
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (this.joystickActive && this.joystickPointer === pointer) {
                const dx = pointer.x - this.joystickBase.x;
                const dy = pointer.y - this.joystickBase.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const maxDistance = 30;

                if (distance < maxDistance) {
                    this.joystickThumb.setPosition(pointer.x, pointer.y);
                } else {
                    const angle = Math.atan2(dy, dx);
                    this.joystickThumb.setPosition(
                        this.joystickBase.x + Math.cos(angle) * maxDistance,
                        this.joystickBase.y + Math.sin(angle) * maxDistance
                    );
                }
            }
        });

        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (this.joystickPointer === pointer) {
                this.joystickActive = false;
                this.joystickPointer = null;
                this.joystickThumb.setPosition(this.joystickBase.x, this.joystickBase.y);
            }
        });
    }

    private setupCameraIgnore() {
        this.children.each((child) => {
            if (child instanceof Phaser.GameObjects.GameObject) {
                const depth = (child as any).depth || 0;
                if (depth < 5000) {
                    this.uiCamera.ignore(child);
                }
            }
        });
    }

    private createClockUI() {
        const uiX = 20;
        const uiY = 25;

        const clockBg = this.add.rectangle(uiX + 55, uiY, 130, 30, 0x3E2723, 0.8);
        clockBg.setOrigin(0.5, 0.5);
        clockBg.setDepth(5000);
        clockBg.setStrokeStyle(2, 0x5D4037);
        this.cameras.main?.ignore(clockBg);

        const clockIcon = this.add.text(uiX, uiY, '🕐', {
            fontSize: '14px',
            resolution: 2
        }).setOrigin(0, 0.5);
        clockIcon.setDepth(5005);
        this.cameras.main?.ignore(clockIcon);

        this.timeText = this.add.text(uiX + 22, uiY, '', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        }).setOrigin(0, 0.5);
        this.timeText.setDepth(5005);
        this.cameras.main?.ignore(this.timeText);
    }

    private updateClock() {
        if (!this.timeText) return;
        const now = new Date();
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        const s = now.getSeconds().toString().padStart(2, '0');
        this.timeText.setText(`${h}:${m}:${s}`);
    }

    private initializeGameState() {
        const cachedData = GameDataService.getCachedData();
        if (!cachedData) return;

        // Load fruits into chestInventory
        if (cachedData.fruits?.length) {
            this.chestInventory = cachedData.fruits
                .filter(f => f.count > 0)
                .map(f => ({ type: f.type, count: f.count }));
        }

        // Load seeds (SeedInventoryItem has type: 'ALGAE'|'MUSHROOM'|'TREE' and quantity: number)
        if (Array.isArray(cachedData.seeds)) {
            this.seedCounts = { algae: 0, mushroom: 0, tree: 0 };
            for (const seed of cachedData.seeds) {
                const type = seed.type?.toLowerCase() as 'algae' | 'mushroom' | 'tree';
                if (type && this.seedCounts[type] !== undefined) {
                    this.seedCounts[type] += seed.quantity || 0;
                }
            }
        }

        // Load fertilizers (FertilizerInventoryResponse has fertilizers: FertilizerItem[])
        if (cachedData.fertilizers?.fertilizers) {
            this.fertilizerCounts = { common: 0, rare: 0, epic: 0, legendary: 0 };
            const rarityMap: Record<string, 'common' | 'rare' | 'epic' | 'legendary'> = {
                'FERTILIZER_COMMON':    'common',
                'FERTILIZER_RARE':      'rare',
                'FERTILIZER_EPIC':      'epic',
                'FERTILIZER_LEGENDARY': 'legendary'
            };
            for (const fert of cachedData.fertilizers.fertilizers) {
                const type = rarityMap[fert.type];
                if (type) {
                    this.fertilizerCounts[type] += fert.amount || 0;
                }
            }
        }

        const gameState = useGameState(this);
        gameState.initialize({
            currency: {
                gold: cachedData.user?.balanceGold ?? cachedData.currencies?.gold ?? 0,
                gem:  cachedData.user?.balanceGem  ?? cachedData.currencies?.gem  ?? 0,
            },
            seeds:       this.seedCounts,
            fertilizers: this.fertilizerCounts,
            fruits:      cachedData.fruits || [],
            waterCount:  0,
            user: cachedData.user ? {
                id:              cachedData.user.id,
                username:        cachedData.user.username || 'Player',
                avatar:          cachedData.user.avatar || null,
                xp:              cachedData.user.xp,
                reputationScore: cachedData.user.reputationScore,
                address:         cachedData.user.address,
                landsCount:      cachedData.user.landsCount || 0,
                plantsCount:     cachedData.user.plantsCount || 0,
            } : null,
        });
    }

    private showToastMessage(text: string, color: number) {
        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;

        const toast = this.add.text(screenWidth / 2, screenHeight - 100, text, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2,
            backgroundColor: `#${color.toString(16).padStart(6, '0')}`,
            padding: { x: 12, y: 6 }
        });
        toast.setOrigin(0.5);
        toast.setDepth(5400);
        toast.setScrollFactor(0);
        this.cameras.main.ignore(toast);

        this.tweens.add({
            targets: toast,
            alpha: 0,
            y: screenHeight - 130,
            duration: 2000,
            ease: 'Quad.easeOut',
            onComplete: () => toast.destroy()
        });
    }

    private onResize(gameSize: Phaser.Structs.Size) {
        if (this.uiCamera) {
            this.uiCamera.setSize(gameSize.width, gameSize.height);
        }
    }

    private onGameDataUpdated(): void {
        this.profileManager?.createProfileUI();
        this.toolbarManager?.updateToolbar();
    }

    update(_time: number, delta: number) {
        this.handlePlayerMovement();
        this.updateNPCs(delta);
        this.updateClock();
    }

    private handlePlayerMovement() {
        const isAnyModalOpen =
            this.profileManager?.getIsOpen() ||
            this.isSitting;

        if (isAnyModalOpen) {
            this.player.setVelocity(0, 0);
            return;
        }

        const speed = this.playerSpeed;
        let velocityX = 0;
        let velocityY = 0;
        let direction = '';

        if (this.cursors) {
            if (this.cursors.left.isDown)       { velocityX = -speed; direction = 'left'; }
            else if (this.cursors.right.isDown) { velocityX =  speed; direction = 'right'; }

            if (this.cursors.up.isDown)         { velocityY = -speed; direction = 'up'; }
            else if (this.cursors.down.isDown)  { velocityY =  speed; direction = 'down'; }
        }

        // Joystick input
        if (this.joystickActive) {
            const dx = this.joystickThumb.x - this.joystickBase.x;
            const dy = this.joystickThumb.y - this.joystickBase.y;
            const threshold = 5;

            if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
                const angle = Math.atan2(dy, dx);
                velocityX = Math.cos(angle) * speed;
                velocityY = Math.sin(angle) * speed;
                direction = Math.abs(dx) > Math.abs(dy)
                    ? (dx > 0 ? 'right' : 'left')
                    : (dy > 0 ? 'down' : 'up');
            }
        }

        this.player.setVelocity(velocityX, velocityY);

        if (velocityX !== 0 || velocityY !== 0) {
            this.player.play(`${this.currentCharacterKey}-walk-${direction || 'down'}`, true);
        } else {
            const currentAnim = this.player.anims.currentAnim?.key || '';
            if (currentAnim.includes('walk')) {
                const dir = currentAnim.split('-').pop() || 'down';
                this.player.play(`${this.currentCharacterKey}-idle-${dir}`, true);
            }
        }

        this.player.setDepth(this.player.y);
        this.constrainPlayerToFloor();
    }

    private constrainPlayerToFloor() {
        const border = CLASS_ROOM_FLOOR_BORDER;
        const minX = border * this.TILE_SIZE + this.TILE_SIZE / 2;
        const maxX = (this.MAP_WIDTH  - border) * this.TILE_SIZE - this.TILE_SIZE / 2;
        // Keep player below the wall (cap + body rows)
        const minY = CLASS_ROOM_FIRST_FLOOR_ROW * this.TILE_SIZE + this.TILE_SIZE / 2;
        const maxY = (this.MAP_HEIGHT - border) * this.TILE_SIZE - this.TILE_SIZE / 2;

        this.player.x = Phaser.Math.Clamp(this.player.x, minX, maxX);
        this.player.y = Phaser.Math.Clamp(this.player.y, minY, maxY);
    }

    private updatePlayerUI() {
        if (!this.player) return;

        if (this.playerNameText) {
            this.playerNameText.setPosition(this.player.x, this.player.y - 18);
            this.playerNameText.setDepth(this.player.y + 1);
        }
    }

    // ─── NPC Teachers ────────────────────────────────────────────────────────────

    private createNPCs() {
        const floorL = CLASS_ROOM_FLOOR_BORDER * this.TILE_SIZE + this.TILE_SIZE;
        const floorR = (this.MAP_WIDTH  - CLASS_ROOM_FLOOR_BORDER) * this.TILE_SIZE - this.TILE_SIZE;
        const floorT = CLASS_ROOM_FIRST_FLOOR_ROW * this.TILE_SIZE + this.TILE_SIZE;
        const floorB = (this.MAP_HEIGHT - CLASS_ROOM_FLOOR_BORDER) * this.TILE_SIZE - this.TILE_SIZE * 2;

        const midY = Math.round((floorT + floorB) / 2);
        const configs = [
            { key: 'teacher1', x: floorL + 32, y: midY - 20 },
            { key: 'teacher2', x: floorR - 32, y: midY + 20 },
        ];

        for (const cfg of configs) {
            this.createNPCAnimations(cfg.key);

            const sprite = this.physics.add.sprite(cfg.x, cfg.y, cfg.key, 0);
            sprite.setOrigin(GAME_CONSTANTS.CHARACTER_ORIGIN_X, GAME_CONSTANTS.CHARACTER_ORIGIN_Y);
            sprite.setScale(GAME_CONSTANTS.CHARACTER_SCALE);
            sprite.setCollideWorldBounds(false);
            sprite.setDepth(cfg.y);
            sprite.play(`${cfg.key}-idle-down`);

            this.npcs.push({
                sprite,
                key:          cfg.key,
                targetX:      cfg.x,
                targetY:      cfg.y,
                isIdle:       true,
                idleTimeLeft: Phaser.Math.Between(1000, 3000),
                chatBubble:   null,
                chatTimeLeft: 0,
                nextChatIn:   Phaser.Math.Between(2000, 5000),
            });
        }
    }

    private createNPCAnimations(key: string) {
        if (this.anims.exists(`${key}-idle-down`)) return;
        const fr = 6;
        this.anims.create({ key: `${key}-idle-down`,  frames: this.anims.generateFrameNumbers(key, { start: 0, end: 1 }),  frameRate: 2, repeat: -1 });
        this.anims.create({ key: `${key}-walk-down`,  frames: this.anims.generateFrameNumbers(key, { start: 0, end: 3 }),  frameRate: fr, repeat: -1 });
        this.anims.create({ key: `${key}-idle-up`,    frames: this.anims.generateFrameNumbers(key, { start: 4, end: 5 }),  frameRate: 2, repeat: -1 });
        this.anims.create({ key: `${key}-walk-up`,    frames: this.anims.generateFrameNumbers(key, { start: 4, end: 7 }),  frameRate: fr, repeat: -1 });
        this.anims.create({ key: `${key}-idle-left`,  frames: this.anims.generateFrameNumbers(key, { start: 8, end: 9 }),  frameRate: 2, repeat: -1 });
        this.anims.create({ key: `${key}-walk-left`,  frames: this.anims.generateFrameNumbers(key, { start: 8, end: 11 }), frameRate: fr, repeat: -1 });
        this.anims.create({ key: `${key}-idle-right`, frames: this.anims.generateFrameNumbers(key, { start: 12, end: 13 }),frameRate: 2, repeat: -1 });
        this.anims.create({ key: `${key}-walk-right`, frames: this.anims.generateFrameNumbers(key, { start: 12, end: 15 }),frameRate: fr, repeat: -1 });
    }

    private updateNPCs(delta: number) {
        const floorL = CLASS_ROOM_FLOOR_BORDER * this.TILE_SIZE + this.TILE_SIZE;
        const floorR = (this.MAP_WIDTH  - CLASS_ROOM_FLOOR_BORDER) * this.TILE_SIZE - this.TILE_SIZE;
        const floorT = CLASS_ROOM_FIRST_FLOOR_ROW * this.TILE_SIZE + this.TILE_SIZE;
        const floorB = (this.MAP_HEIGHT - CLASS_ROOM_FLOOR_BORDER) * this.TILE_SIZE - this.TILE_SIZE * 2;

        for (const npc of this.npcs) {
            const { sprite, key } = npc;

            // ── Chat bubble lifetime ──
            if (npc.chatTimeLeft > 0) {
                npc.chatTimeLeft -= delta;
                if (npc.chatTimeLeft <= 0 && npc.chatBubble) {
                    npc.chatBubble.destroy();
                    npc.chatBubble = null;
                }
            }

            // ── Countdown to next chat ──
            if (!npc.chatBubble) {
                npc.nextChatIn -= delta;
                if (npc.nextChatIn <= 0) {
                    this.showNPCChat(npc);
                    npc.nextChatIn = Phaser.Math.Between(5000, 12000);
                }
            }

            // ── Wander ──
            if (npc.isIdle) {
                npc.idleTimeLeft -= delta;
                sprite.setVelocity(0, 0);

                if (npc.idleTimeLeft <= 0) {
                    npc.targetX = Phaser.Math.Between(floorL, floorR);
                    npc.targetY = Phaser.Math.Between(floorT, floorB);
                    npc.isIdle  = false;
                }
            } else {
                const dx   = npc.targetX - sprite.x;
                const dy   = npc.targetY - sprite.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 5) {
                    // Arrived — go idle
                    sprite.setVelocity(0, 0);
                    npc.isIdle       = true;
                    npc.idleTimeLeft = Phaser.Math.Between(1500, 4500);

                    const cur = sprite.anims.currentAnim?.key || '';
                    const lastDir = cur.includes('up') ? 'up' : cur.includes('left') ? 'left'
                        : cur.includes('right') ? 'right' : 'down';
                    sprite.play(`${key}-idle-${lastDir}`, true);
                } else {
                    const angle = Math.atan2(dy, dx);
                    sprite.setVelocity(Math.cos(angle) * this.NPC_SPEED, Math.sin(angle) * this.NPC_SPEED);

                    const dir = Math.abs(dx) > Math.abs(dy)
                        ? (dx > 0 ? 'right' : 'left')
                        : (dy > 0 ? 'down'  : 'up');
                    sprite.play(`${key}-walk-${dir}`, true);
                }
            }

            // ── Depth + follow chat bubble ──
            sprite.setDepth(sprite.y);
            if (npc.chatBubble) {
                npc.chatBubble.setPosition(sprite.x, sprite.y - 22);
                npc.chatBubble.setDepth(sprite.depth + 10);
            }
        }
    }

    /** Creates a world-space speech bubble above the NPC (same style as TownSquare). */
    private showNPCChat(npc: typeof this.npcs[0]) {
        npc.chatBubble?.destroy();
        npc.chatBubble = null;

        const msg = this.NPC_CHAT_MESSAGES[Phaser.Math.Between(0, this.NPC_CHAT_MESSAGES.length - 1)];

        // Measure text
        const tempText = this.add.text(0, 0, msg, {
            fontSize: '6px', fontFamily: 'PixelFont',
            color: '#000000', resolution: 2, align: 'center'
        });
        const textWidth  = tempText.width;
        const textHeight = tempText.height;
        tempText.destroy();

        const bubbleWidth  = textWidth  + 10;
        const bubbleHeight = textHeight + 8;

        // Rounded rect + tail via Graphics (matches TownSquare style)
        const g = new Phaser.GameObjects.Graphics(this);
        g.fillStyle(0xFFFFFF, 1);
        g.lineStyle(1, 0x555555, 1);
        g.fillRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);
        g.strokeRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);

        // Tail pointing down
        g.fillStyle(0xFFFFFF, 1);
        g.fillTriangle(-3, bubbleHeight / 2 - 1, 3, bubbleHeight / 2 - 1, 0, bubbleHeight / 2 + 4);
        g.lineStyle(1, 0x555555, 1);
        g.lineBetween(-3, bubbleHeight / 2, 0, bubbleHeight / 2 + 4);
        g.lineBetween( 3, bubbleHeight / 2, 0, bubbleHeight / 2 + 4);

        const textObj = new Phaser.GameObjects.Text(this, 0, 0, msg, {
            fontSize: '6px', fontFamily: 'PixelFont',
            color: '#000000', resolution: 2, align: 'center'
        });
        textObj.setOrigin(0.5);

        const bubbleOffsetY = -(bubbleHeight / 2 + bubbleHeight / 2 + 6); // above sprite head
        const bubble = this.add.container(npc.sprite.x, npc.sprite.y + bubbleOffsetY, [g, textObj]);
        bubble.setDepth(npc.sprite.depth + 10);
        this.uiCamera.ignore(bubble);

        npc.chatBubble   = bubble;
        npc.chatTimeLeft = 3500;

        // Fade out
        this.tweens.add({
            targets: bubble, alpha: 0,
            delay: 3000, duration: 500,
            onComplete: () => {
                bubble.destroy();
                if (npc.chatBubble === bubble) npc.chatBubble = null;
            }
        });
    }

    shutdown() {
        this.scale.off('resize', this.onResize, this);
        EventBus.off('gamedata:updated', this.onGameDataUpdated, this);
        this.events.off('postupdate', this.updatePlayerUI, this);

        this.studyingOverlay?.destroy();
        this.studyingOverlay = null;
        for (const npc of this.npcs) { npc.chatBubble?.destroy(); }
        this.npcs = [];
        this.soundManager?.destroy();
        this.profileManager?.destroy();
        this.toolbarManager?.destroy();

        this.tweens.killAll();
        this.time.removeAllEvents();
    }

    destroy() {
        this.shutdown();
    }
}
