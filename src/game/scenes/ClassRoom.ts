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
import { ClassroomChatService, LessonResponse, LessonSummary } from '../ClassroomChatService';
import { marked } from 'marked';

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

    // Teacher Chat Dialog
    private chatDialogOpen: boolean = false;
    private chatDialogContainer: Phaser.GameObjects.Container | null = null;
    private chatDialogOverlay: Phaser.GameObjects.Rectangle | null = null;
    private chatInputElement: HTMLInputElement | null = null;
    private chatHistoryElement: HTMLDivElement | null = null;
    private chatHistory: { role: 'user' | 'assistant'; content: string }[] = [];
    private chatScrollY: number = 0;
    private chatIsLoading: boolean = false;
    private chatService: ClassroomChatService = ClassroomChatService.getInstance();
    private activeNpcKey: string = '';
    private readonly NPC_INTERACTION_DISTANCE = 40;
    private lessonContentElement: HTMLDivElement | null = null;
    private lessonListElement: HTMLDivElement | null = null;

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

    /** Shows a large CRT-style 2-screen lesson viewer in screen space. */
    private showStudyingOverlay() {
            const W = this.scale.width;
            const H = this.scale.height;
            let currentScreen = 1;
            const TOTAL_SCREENS = 2;

            const container = this.add.container(0, 0);
            container.setDepth(5300);
            this.cameras.main.ignore(container);

            // Dark backdrop
            const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88);
            backdrop.setInteractive();
            container.add(backdrop);

            // Monitor dimensions
            const monW = 560, monH = 380;
            const listPanelW = 200;
            const totalW = monW + listPanelW + 10; // 10px gap
            const startX = (W - totalW) / 2;
            const monX = startX + listPanelW + 10 + monW / 2;
            const monY = H / 2 - 15;

            // Bezel
            const bezel = this.add.graphics();
            bezel.fillStyle(0x1a1a1a, 1);
            bezel.fillRoundedRect(monX - monW / 2, monY - monH / 2, monW, monH, 10);
            bezel.lineStyle(2, 0x3c3c3c, 1);
            bezel.strokeRoundedRect(monX - monW / 2, monY - monH / 2, monW, monH, 10);
            container.add(bezel);

            const bezelInner = this.add.graphics();
            bezelInner.lineStyle(1, 0x2a2a2a, 1);
            bezelInner.strokeRoundedRect(monX - monW / 2 + 3, monY - monH / 2 + 3, monW - 6, monH - 6, 8);
            container.add(bezelInner);

            // Screen glass area
            const pad = 18;
            const sX = monX - monW / 2 + pad;
            const sY = monY - monH / 2 + pad + 4;
            const sW = monW - pad * 2;
            const sH = monH - pad * 2 - 50;

            const screenBg = this.add.graphics();
            screenBg.fillStyle(0x000000, 1);
            screenBg.fillRect(sX, sY, sW, sH);
            screenBg.lineStyle(1, 0x002211, 1);
            screenBg.strokeRect(sX, sY, sW, sH);
            container.add(screenBg);

            // Screen 1: TOC with typewriter effect (Phaser text)
            const screen1 = this.add.container(0, 0);
            const prompt1 = this.add.text(sX + 10, sY + 8, '> loading...', {
                fontSize: '9px', fontFamily: 'monospace', color: '#006622', resolution: 2,
            });
            screen1.add(prompt1);

            const sep1 = this.add.graphics();
            sep1.lineStyle(1, 0x003311, 1);
            sep1.lineBetween(sX + 8, sY + 22, sX + sW - 8, sY + 22);
            screen1.add(sep1);

            // Scrollable content sub-container for title + TOC + cursor
            const scrollContent = this.add.container(0, 0);
            let tocScrollY = 0;
            const contentTopY = sY + 26; // below prompt+separator
            const scrollableH = sH - 26; // visible scroll area height

            // Title text (centered, bold) — populated after API call
            const titleText = this.add.text(sX + sW / 2, sY + 38, '', {
                fontSize: '15px', fontFamily: 'monospace', color: '#66ff66',
                resolution: 2, fontStyle: 'bold', wordWrap: { width: sW - 30 },
                align: 'center',
            }).setOrigin(0.5, 0);
            scrollContent.add(titleText);

            // TOC items — starts below title, populated after API call
            const tocText = this.add.text(sX + 10, sY + 68, '', {
                fontSize: '13px', fontFamily: 'monospace', color: '#33ff33',
                resolution: 2, wordWrap: { width: sW - 20 }, lineSpacing: 7,
            });
            scrollContent.add(tocText);

            // Blinking cursor
            const cursor = this.add.text(sX + 10, sY + 68, '█', {
                fontSize: '13px', fontFamily: 'monospace', color: '#33ff33', resolution: 2,
            });
            scrollContent.add(cursor);
            this.tweens.add({ targets: cursor, alpha: 0, duration: 500, yoyo: true, repeat: -1 });

            screen1.add(scrollContent);

            // Geometry mask for scrollable content (clips to area below prompt+separator)
            const scrollMask = this.add.graphics();
            scrollMask.fillStyle(0xffffff);
            scrollMask.fillRect(sX, contentTopY, sW, scrollableH);
            scrollMask.setVisible(false);
            this.cameras.main.ignore(scrollMask);
            scrollContent.setMask(new Phaser.Display.Masks.GeometryMask(this, scrollMask));
            container.setData('scrollMask', scrollMask);

            // Black header cover + re-add prompt/separator on top so scroll content can't bleed up
            const headerCover = this.add.graphics();
            headerCover.fillStyle(0x000000, 1);
            headerCover.fillRect(sX, sY, sW, 26);
            screen1.add(headerCover);
            screen1.add(prompt1);
            screen1.add(sep1);

            // Mouse wheel scroll for screen1
            const scrollScreen1 = (dy: number) => {
                if (!screen1.visible) return;
                // Total content height = bottom of tocText + cursor relative to contentTopY
                const contentBottom = (tocText.y + tocText.height + 20) - contentTopY;
                const maxScroll = Math.max(0, contentBottom - scrollableH);
                tocScrollY = Phaser.Math.Clamp(tocScrollY + dy * 20, 0, maxScroll);
                scrollContent.setY(-tocScrollY);
            };
            this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: any[], _dx: number, dy: number) => {
                if (this.isSitting && screen1.visible) scrollScreen1(dy > 0 ? 1 : -1);
            });

            // Scanlines (not scrollable — stays fixed over screen)
            const scanlines1 = this.add.graphics();
            scanlines1.fillStyle(0x000000, 0.08);
            for (let ly = sY; ly < sY + sH; ly += 4) {
                scanlines1.fillRect(sX, ly, sW, 2);
            }
            screen1.add(scanlines1);

            container.add(screen1);

            // Screen 2: Markdown content (HTML overlay) — hidden initially
            const screen2 = this.add.container(0, 0);
            screen2.setVisible(false);

            const prompt2 = this.add.text(sX + 10, sY + 8, '> content.md', {
                fontSize: '9px', fontFamily: 'monospace', color: '#006622', resolution: 2,
            });
            screen2.add(prompt2);

            const sep2 = this.add.graphics();
            sep2.lineStyle(1, 0x003311, 1);
            sep2.lineBetween(sX + 8, sY + 22, sX + sW - 8, sY + 22);
            screen2.add(sep2);

            // Scanlines for screen 2
            const scanlines2 = this.add.graphics();
            scanlines2.fillStyle(0x000000, 0.06);
            for (let ly = sY; ly < sY + sH; ly += 4) {
                scanlines2.fillRect(sX, ly, sW, 2);
            }
            screen2.add(scanlines2);
            container.add(screen2);

            // Navigation bar
            const navCY = (sY + sH + (monY + monH / 2)) / 2;

            const prevBg = this.add.rectangle(monX - 130, navCY, 100, 24, 0x252525)
                .setStrokeStyle(1, 0x3a3a3a).setInteractive({ useHandCursor: true });
            container.add(prevBg);
            const prevTxt = this.add.text(monX - 130, navCY, '◀  PREV', {
                fontSize: '9px', fontFamily: 'monospace', color: '#888888', resolution: 2,
            }).setOrigin(0.5);
            container.add(prevTxt);

            const pageTxt = this.add.text(monX, navCY, `1 / ${TOTAL_SCREENS}`, {
                fontSize: '10px', fontFamily: 'monospace', color: '#444444', resolution: 2,
            }).setOrigin(0.5);
            container.add(pageTxt);

            const nextBg = this.add.rectangle(monX + 130, navCY, 100, 24, 0x252525)
                .setStrokeStyle(1, 0x3a3a3a).setInteractive({ useHandCursor: true });
            container.add(nextBg);
            const nextTxt = this.add.text(monX + 130, navCY, 'NEXT  ▶', {
                fontSize: '9px', fontFamily: 'monospace', color: '#888888', resolution: 2,
            }).setOrigin(0.5);
            container.add(nextTxt);

            // Create HTML div for screen 2 content (positioned over the screen area)
            const canvas = this.game.canvas;
            const canvasRect = canvas.getBoundingClientRect();
            const scaleXR = canvasRect.width / W;
            const scaleYR = canvasRect.height / H;
            const contentTop = sY + 26;
            const contentH = sH - 28;

            this.lessonContentElement = document.createElement('div');
            this.lessonContentElement.style.cssText = `
                position: fixed;
                left: ${canvasRect.left + sX * scaleXR}px;
                top: ${canvasRect.top + contentTop * scaleYR}px;
                width: ${sW * scaleXR}px;
                height: ${contentH * scaleYR}px;
                overflow-y: auto;
                padding: 8px 12px;
                box-sizing: border-box;
                z-index: 10000;
                font-family: monospace;
                font-size: ${Math.max(11, 13 * scaleYR)}px;
                line-height: 1.55;
                color: #33ff33;
                background: transparent;
                display: none;
                scrollbar-width: thin;
                scrollbar-color: #006622 transparent;
            `;

            // Inject markdown styles for lesson content
            const lessonStyle = document.createElement('style');
            lessonStyle.textContent = `
                .lesson-md h1, .lesson-md h2, .lesson-md h3 {
                    color: #66ff66; margin: 8px 0 4px; font-weight: 600;
                }
                .lesson-md h1 { font-size: 1.2em; }
                .lesson-md h2 { font-size: 1.08em; color: #44dd44; }
                .lesson-md h3 { font-size: 1em; color: #33cc33; }
                .lesson-md p { margin: 3px 0; }
                .lesson-md strong { color: #88ff88; }
                .lesson-md em { color: #55dd55; font-style: italic; }
                .lesson-md code {
                    background: #0a1a0a; color: #66ff66; padding: 1px 4px;
                    border-radius: 3px; font-family: monospace; font-size: 0.92em;
                }
                .lesson-md pre {
                    background: #050f05; border: 1px solid #003311; border-radius: 4px;
                    padding: 6px 8px; overflow-x: auto; margin: 4px 0;
                }
                .lesson-md pre code { background: none; padding: 0; }
                .lesson-md ul, .lesson-md ol { padding-left: 18px; margin: 3px 0; }
                .lesson-md li { margin: 2px 0; }
                .lesson-md hr { border: none; border-top: 1px solid #003311; margin: 6px 0; }
                .lesson-md a { color: #44cc44; text-decoration: underline; }
                .lesson-md blockquote {
                    border-left: 3px solid #006622; padding-left: 8px; margin: 4px 0;
                    color: #44aa44;
                }
                .lesson-md table { border-collapse: collapse; margin: 4px 0; width: 100%; }
                .lesson-md th, .lesson-md td {
                    border: 1px solid #003311; padding: 3px 6px; font-size: 0.9em;
                }
                .lesson-md th { background: #0a1a0a; color: #66ff66; }
            `;
            this.lessonContentElement.appendChild(lessonStyle);
            document.body.appendChild(this.lessonContentElement);

            const showScreen = (num: number) => {
                screen1.setVisible(num === 1);
                screen2.setVisible(num === 2);
                if (this.lessonContentElement) {
                    this.lessonContentElement.style.display = num === 2 ? 'block' : 'none';
                }
            };

            const updateNav = () => {
                pageTxt.setText(`${currentScreen} / ${TOTAL_SCREENS}`);
                prevBg.setFillStyle(currentScreen > 1 ? 0x252525 : 0x111111);
                prevTxt.setColor(currentScreen > 1 ? '#888888' : '#333333');
                nextBg.setFillStyle(currentScreen < TOTAL_SCREENS ? 0x252525 : 0x111111);
                nextTxt.setColor(currentScreen < TOTAL_SCREENS ? '#888888' : '#333333');
            };

            prevBg.on('pointerover', () => { if (currentScreen > 1) prevBg.setFillStyle(0x333333); });
            prevBg.on('pointerout', () => updateNav());
            prevBg.on('pointerdown', () => {
                if (currentScreen > 1) { currentScreen--; showScreen(currentScreen); updateNav(); }
            });

            nextBg.on('pointerover', () => { if (currentScreen < TOTAL_SCREENS) nextBg.setFillStyle(0x333333); });
            nextBg.on('pointerout', () => updateNav());
            nextBg.on('pointerdown', () => {
                if (currentScreen < TOTAL_SCREENS) { currentScreen++; showScreen(currentScreen); updateNav(); }
            });
            updateNav();

            // Brand text
            const brandTxt = this.add.text(monX, monY + monH / 2 - 5, 'OVERGUILD PC  ◉', {
                fontSize: '7px', fontFamily: 'monospace', color: '#2e2e2e', resolution: 2,
            }).setOrigin(0.5, 1);
            container.add(brandTxt);

            // Monitor stand
            const standTopY = monY + monH / 2;
            const standG = this.add.graphics();
            standG.fillStyle(0x1a1a1a, 1);
            standG.fillRect(monX - 8, standTopY, 16, 20);
            standG.fillRect(monX - 36, standTopY + 20, 72, 7);
            standG.lineStyle(1, 0x3c3c3c, 1);
            standG.strokeRect(monX - 36, standTopY + 20, 72, 7);
            container.add(standG);

            // Stand Up button
            const btnCY = standTopY + 42;
            const btnBg = this.add.rectangle(monX, btnCY, 140, 30, 0x5D4037)
                .setStrokeStyle(2, 0x3E2723).setInteractive({ useHandCursor: true });
            container.add(btnBg);
            const btnTxt = this.add.text(monX, btnCY, '🚶 Stand Up', {
                fontSize: '11px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2,
            }).setOrigin(0.5);
            container.add(btnTxt);

            btnBg.on('pointerover', () => btnBg.setFillStyle(0x795548));
            btnBg.on('pointerout', () => btnBg.setFillStyle(0x5D4037));
            btnBg.on('pointerdown', () => this.stopStudying());

            // ─── Lesson List Sidebar (left of monitor) ───────────────────────────
            const lpX = startX;
            const lpY = monY - monH / 2;
            const lpW = listPanelW;
            const lpH = monH;

            // Panel background
            const listBg = this.add.graphics();
            listBg.fillStyle(0x111111, 0.95);
            listBg.fillRoundedRect(lpX, lpY, lpW, lpH, 8);
            listBg.lineStyle(1, 0x333333, 1);
            listBg.strokeRoundedRect(lpX, lpY, lpW, lpH, 8);
            container.add(listBg);

            // Panel header
            const listHeader = this.add.text(lpX + lpW / 2, lpY + 16, '📚 Lessons', {
                fontSize: '11px', fontFamily: 'monospace', color: '#66ff66', resolution: 2,
                fontStyle: 'bold',
            }).setOrigin(0.5);
            container.add(listHeader);

            const listSep = this.add.graphics();
            listSep.lineStyle(1, 0x003311, 1);
            listSep.lineBetween(lpX + 8, lpY + 30, lpX + lpW - 8, lpY + 30);
            container.add(listSep);

            // Create HTML lesson list element
            const canvasEl = this.game.canvas;
            const canvasRect2 = canvasEl.getBoundingClientRect();
            const scaleXR2 = canvasRect2.width / W;
            const scaleYR2 = canvasRect2.height / H;

            this.lessonListElement = document.createElement('div');
            this.lessonListElement.style.cssText = `
                position: fixed;
                left: ${canvasRect2.left + (lpX + 6) * scaleXR2}px;
                top: ${canvasRect2.top + (lpY + 34) * scaleYR2}px;
                width: ${(lpW - 12) * scaleXR2}px;
                height: ${(lpH - 42) * scaleYR2}px;
                overflow-y: auto;
                padding: 4px;
                box-sizing: border-box;
                z-index: 10000;
                font-family: monospace;
                font-size: ${Math.max(10, 11 * scaleYR2)}px;
                color: #33ff33;
                background: transparent;
                scrollbar-width: thin;
                scrollbar-color: #006622 transparent;
            `;

            const listStyle = document.createElement('style');
            listStyle.textContent = `
                .lesson-list-item {
                    padding: 6px 8px;
                    margin: 2px 0;
                    border: 1px solid #002211;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background 0.15s, border-color 0.15s;
                    background: #0a0a0a;
                }
                .lesson-list-item:hover {
                    background: #0a1a0a;
                    border-color: #006622;
                }
                .lesson-list-item.active {
                    background: #001a0a;
                    border-color: #33ff33;
                    box-shadow: 0 0 6px rgba(51, 255, 51, 0.15);
                }
                .lesson-list-item .lesson-title {
                    font-size: 0.92em;
                    color: #33ff33;
                    line-height: 1.3;
                    word-break: break-word;
                }
                .lesson-list-item .lesson-date {
                    font-size: 0.75em;
                    color: #006622;
                    margin-top: 2px;
                }
                .lesson-list-item .lesson-badge {
                    display: inline-block;
                    font-size: 0.7em;
                    color: #000;
                    background: #33ff33;
                    padding: 1px 5px;
                    border-radius: 3px;
                    margin-bottom: 3px;
                    font-weight: bold;
                }
                .lesson-list-loading {
                    text-align: center;
                    color: #006622;
                    padding: 20px 0;
                    font-size: 0.9em;
                }
            `;
            this.lessonListElement.appendChild(listStyle);

            // Loading state
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'lesson-list-loading';
            loadingDiv.textContent = '> loading...';
            this.lessonListElement.appendChild(loadingDiv);

            document.body.appendChild(this.lessonListElement);

            // Helper: load a lesson by slug and update screens
            const loadLesson = (slug: string) => {
                // Reset screens
                currentScreen = 1;
                showScreen(1);
                updateNav();
                prompt1.setText('> loading...');
                titleText.setText('');
                tocText.setText('');
                cursor.setPosition(sX + 10, sY + 68);

                // Reset scroll positions
                tocScrollY = 0;
                scrollContent.setY(0);
                if (this.lessonContentElement) {
                    this.lessonContentElement.scrollTop = 0;
                    const styleTag = this.lessonContentElement.querySelector('style');
                    const styleHTML = styleTag ? styleTag.outerHTML : '';
                    this.lessonContentElement.innerHTML = styleHTML + '<div class="lesson-md" style="text-align:center;padding:20px;color:#006622;">Loading...</div>';
                }

                this.chatService.getLessonBySlug(slug).then((lesson: LessonResponse) => {
                    if (!this.isSitting) return;
                    if (lesson.success && lesson.toc && lesson.content) {
                        const fileName = `${lesson.slug || 'lesson'}.md`;
                        prompt1.setText(`> ${fileName}`);
                        prompt2.setText(`> ${fileName}`);
                        titleText.setText(lesson.title || 'Lesson');

                        const tocLines = lesson.toc.map((item: string) => `• ${item}`);
                        const fullTocText = tocLines.join('\n');
                        tocText.setText(fullTocText);
                        cursor.setPosition(sX + 10, tocText.y + tocText.height + 6);

                        if (this.lessonContentElement) {
                            const styleTag = this.lessonContentElement.querySelector('style');
                            const styleHTML = styleTag ? styleTag.outerHTML : '';
                            const contentHTML = marked.parse(lesson.content, { async: false, breaks: true }) as string;
                            this.lessonContentElement.innerHTML = styleHTML + `<div class="lesson-md">${contentHTML}</div>`;
                        }
                    } else {
                        prompt1.setText('> error');
                        tocText.setText(lesson.error || 'Could not load lesson.');
                        cursor.setPosition(sX + 10, tocText.y + tocText.height + 6);
                    }
                });

                // Update active state in list
                if (this.lessonListElement) {
                    this.lessonListElement.querySelectorAll('.lesson-list-item').forEach((el) => {
                        el.classList.toggle('active', (el as HTMLElement).dataset.slug === slug);
                    });
                }
            };

            this.studyingOverlay = container;

            // Fetch lesson from API and populate screens
            let currentLessonSlug = '';
            this.chatService.getLatestLesson().then((lesson: LessonResponse) => {
                if (!this.isSitting) return; // user already stood up

                if (lesson.success && lesson.toc && lesson.content) {
                    currentLessonSlug = lesson.slug || '';
                    const fileName = `${lesson.slug || 'lesson'}.md`;
                    prompt1.setText(`> ${fileName}`);
                    prompt2.setText(`> ${fileName}`);

                    // Set title (centered, bold — no typewriter)
                    titleText.setText(lesson.title || 'Lesson');

                    // Build TOC text for typewriter (items only)
                    const tocLines = lesson.toc.map((item) => `• ${item}`);
                    const fullTocText = tocLines.join('\n');

                    // Typewriter effect on page 1
                    // Cursor leads text: cursor moves first, then character appears behind it
                    const measureText = this.add.text(-9999, -9999, '', {
                        fontSize: '13px', fontFamily: 'monospace', resolution: 2,
                    }).setVisible(false);
                    this.cameras.main.ignore(measureText);

                    let charIndex = 0;
                    // Two-phase per character: phase 0 = move cursor, phase 1 = reveal char
                    let phase = 0;
                    const typeTimer = this.time.addEvent({
                        delay: 15,
                        repeat: fullTocText.length * 2 - 1,
                        callback: () => {
                            if (phase === 0) {
                                // Phase 0: move cursor to where next char will appear
                                const nextText = fullTocText.substring(0, charIndex + 1);
                                const nextLines = nextText.split('\n');
                                const nextLastLine = nextLines[nextLines.length - 1];
                                measureText.setText(nextLastLine);
                                const nextLineW = measureText.width;

                                // If next char is newline, cursor goes to start of new line
                                const isNewline = fullTocText[charIndex] === '\n';
                                const currentText = fullTocText.substring(0, charIndex);
                                const currentLines = currentText.split('\n');
                                const lineCount = isNewline ? currentLines.length + 1 : nextLines.length;

                                // Calculate Y based on current tocText height per line
                                const tempLineCount = Math.max(currentLines.length, 1);
                                const lineH = charIndex > 0 ? tocText.height / tempLineCount : 20;
                                const cursorY = tocText.y + (lineCount - 1) * lineH;
                                const cursorX = isNewline ? 0 : nextLineW;
                                cursor.setPosition(sX + 10 + cursorX, cursorY);

                                phase = 1;
                            } else {
                                // Phase 1: reveal the character
                                charIndex++;
                                tocText.setText(fullTocText.substring(0, charIndex));
                                phase = 0;
                            }
                        },
                    });
                    // Clean up measure text after typewriter finishes
                    this.time.delayedCall(15 * fullTocText.length * 2 + 200, () => measureText.destroy());

                    // Populate screen 2 HTML with full markdown content
                    if (this.lessonContentElement) {
                        const styleTag = this.lessonContentElement.querySelector('style');
                        const styleHTML = styleTag ? styleTag.outerHTML : '';
                        const contentHTML = marked.parse(lesson.content, { async: false, breaks: true }) as string;
                        this.lessonContentElement.innerHTML = styleHTML + `<div class="lesson-md">${contentHTML}</div>`;
                    }
                } else {
                    prompt1.setText('> error');
                    tocText.setText(lesson.error || 'No lessons found.');
                    cursor.setPosition(sX + 10, sY + 28 + tocText.height + 6);
                }
            });

            // Fetch lesson list with pagination and populate sidebar
            let lessonPage = 1;
            let lessonTotalPages = 1;
            let isLoadingMore = false;
            const LESSONS_PER_PAGE = 10;

            const renderLessonItems = (lessons: LessonSummary[], isFirstPage: boolean) => {
                if (!this.lessonListElement) return;

                lessons.forEach((item: LessonSummary, index: number) => {
                    const div = document.createElement('div');
                    div.className = 'lesson-list-item';
                    // First item on first page = latest, mark active by default
                    if (isFirstPage && index === 0) {
                        div.classList.add('active');
                    }
                    div.dataset.slug = item.slug;

                    let html = '';
                    if (isFirstPage && index === 0) {
                        html += '<span class="lesson-badge">LATEST</span><br>';
                    }
                    html += `<span class="lesson-title">${item.title}</span>`;
                    if (item.updatedAt) {
                        const date = new Date(item.updatedAt);
                        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        html += `<div class="lesson-date">${dateStr}</div>`;
                    }
                    div.innerHTML = html;

                    div.addEventListener('click', () => {
                        loadLesson(item.slug);
                    });

                    this.lessonListElement!.appendChild(div);
                });
            };

            const loadMoreLessons = () => {
                if (isLoadingMore || lessonPage >= lessonTotalPages || !this.lessonListElement) return;
                isLoadingMore = true;

                // Show loading indicator at bottom
                const loader = document.createElement('div');
                loader.className = 'lesson-list-loading';
                loader.textContent = '> loading...';
                this.lessonListElement.appendChild(loader);

                lessonPage++;
                this.chatService.getLessons(lessonPage, LESSONS_PER_PAGE).then((result) => {
                    if (!this.isSitting || !this.lessonListElement) return;
                    loader.remove();
                    isLoadingMore = false;

                    if (result.success && result.lessons && result.lessons.length > 0) {
                        if (result.pagination) {
                            lessonTotalPages = result.pagination.totalPages;
                        }
                        renderLessonItems(result.lessons, false);
                    }
                });
            };

            // Scroll-to-bottom triggers load more
            this.lessonListElement.addEventListener('scroll', () => {
                if (!this.lessonListElement) return;
                const el = this.lessonListElement;
                const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
                if (nearBottom) loadMoreLessons();
            });

            // Initial fetch
            this.chatService.getLessons(1, LESSONS_PER_PAGE).then((result) => {
                if (!this.isSitting || !this.lessonListElement) return;

                // Remove loading indicator
                const loadingEl = this.lessonListElement.querySelector('.lesson-list-loading');
                if (loadingEl) loadingEl.remove();

                if (result.success && result.lessons && result.lessons.length > 0) {
                    if (result.pagination) {
                        lessonTotalPages = result.pagination.totalPages;
                    }
                    renderLessonItems(result.lessons, true);
                } else {
                    const emptyDiv = document.createElement('div');
                    emptyDiv.style.cssText = 'text-align:center;color:#006622;padding:20px 0;font-size:0.9em;';
                    emptyDiv.textContent = result.error || 'No lessons available.';
                    this.lessonListElement.appendChild(emptyDiv);
                }
            });
        }

    /** Removes the studying overlay and restores player movement. */
    private stopStudying() {
            if (!this.isSitting) return;
            // Clean up scroll mask
            const scrollMask = this.studyingOverlay?.getData('scrollMask') as Phaser.GameObjects.Graphics | undefined;
            if (scrollMask) scrollMask.destroy();
            this.studyingOverlay?.destroy();
            this.studyingOverlay = null;
            if (this.lessonContentElement) {
                this.lessonContentElement.remove();
                this.lessonContentElement = null;
            }
            if (this.lessonListElement) {
                this.lessonListElement.remove();
                this.lessonListElement = null;
            }
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

            // Make NPC clickable to open chat dialog
            sprite.setInteractive({ useHandCursor: true });
            sprite.on('pointerdown', () => {
                const dx = this.player.x - sprite.x;
                const dy = this.player.y - sprite.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= this.NPC_INTERACTION_DISTANCE) {
                    this.openTeacherChatDialog(cfg.key);
                } else {
                    this.showToastMessage('Move closer to talk!', 0xFF9800);
                }
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

    // ─── Teacher Chat Dialog ──────────────────────────────────────────────────

    private openTeacherChatDialog(npcKey: string) {
            if (this.chatDialogOpen || this.isSitting) return;
            this.chatDialogOpen = true;
            this.activeNpcKey = npcKey;
            this.chatHistory = [];
            this.chatScrollY = 0;

            // Disable Phaser keyboard for HTML input
            if (this.input.keyboard) {
                this.input.keyboard.enabled = false;
            }

            const W = this.scale.width;
            const H = this.scale.height;
            const modalW = 320;
            const modalH = 300;
            const modalX = W / 2;
            const modalY = H / 2;

            // Dark overlay
            this.chatDialogOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55);
            this.chatDialogOverlay.setDepth(6000);
            this.chatDialogOverlay.setInteractive();
            this.chatDialogOverlay.on('pointerdown', () => this.closeTeacherChatDialog());
            this.cameras.main?.ignore(this.chatDialogOverlay);

            this.chatDialogContainer = this.add.container(modalX, modalY);
            this.chatDialogContainer.setDepth(6100);

            // Modal background
            const bg = this.add.rectangle(0, 0, modalW, modalH, 0x1a1a2e, 0.97);
            bg.setStrokeStyle(2, 0x3949ab);
            bg.setInteractive();

            // Header bar
            const npcName = npcKey === 'teacher1' ? 'Teacher' : 'Mentor';
            const npcIcon = npcKey === 'teacher1' ? '📚' : '🧑‍🏫';
            const headerBg = this.add.rectangle(0, -modalH / 2 + 22, modalW, 44, 0x283593, 0.95);

            const statusDot = this.add.circle(-modalW / 2 + 20, -modalH / 2 + 22, 4, 0x4caf50);
            const headerText = this.add.text(-modalW / 2 + 30, -modalH / 2 + 22, `${npcIcon} ${npcName}`, {
                fontSize: '12px', fontFamily: 'PixelFont', color: '#c5cae9', resolution: 2,
            }).setOrigin(0, 0.5);

            // Close button
            const closeBtn = this.add.text(modalW / 2 - 20, -modalH / 2 + 22, '✕', {
                fontSize: '14px', color: '#ef5350', resolution: 2,
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            closeBtn.on('pointerdown', () => this.closeTeacherChatDialog());
            closeBtn.on('pointerover', () => closeBtn.setColor('#ff8a80'));
            closeBtn.on('pointerout', () => closeBtn.setColor('#ef5350'));

            // Chat history area (Phaser bg only — content rendered in HTML div)
            const historyH = 180;
            const historyY = 10;
            const historyBg = this.add.rectangle(0, historyY, modalW - 14, historyH, 0x0d0d1a, 0.85);
            historyBg.setStrokeStyle(1, 0x283593);

            // Input area
            const inputAreaY = modalH / 2 - 30;
            const sendBtnW = 36;
            const inputBg = this.add.rectangle(-sendBtnW / 2, inputAreaY, modalW - 14 - sendBtnW - 4, 30, 0x1a237e, 0.9);
            inputBg.setStrokeStyle(1, 0x3949ab);

            // Arrow send button
            const sendBtnX = modalW / 2 - 10 - sendBtnW / 2;
            const sendBtn = this.add.rectangle(sendBtnX, inputAreaY, sendBtnW, 30, 0x3949ab, 1);
            sendBtn.setStrokeStyle(1, 0x5c6bc0);
            const sendText = this.add.text(sendBtnX, inputAreaY, '➤', {
                fontSize: '13px', color: '#c5cae9', resolution: 2,
            }).setOrigin(0.5);
            sendBtn.setInteractive({ useHandCursor: true });
            sendBtn.on('pointerover', () => sendBtn.setFillStyle(0x5c6bc0));
            sendBtn.on('pointerout', () => sendBtn.setFillStyle(0x3949ab));
            sendBtn.on('pointerdown', () => this.sendTeacherChatMessage());

            // Loading indicator
            const loadingText = this.add.text(0, inputAreaY - 20, '', {
                fontSize: '8px', fontFamily: 'monospace', color: '#7986cb', resolution: 2,
            }).setOrigin(0.5);

            this.chatDialogContainer.add([
                bg, headerBg, statusDot, headerText, closeBtn,
                historyBg,
                inputBg, sendBtn, sendText, loadingText,
            ]);
            this.cameras.main?.ignore(this.chatDialogContainer);

            this.chatDialogContainer.setData('loadingText', loadingText);
            this.chatDialogContainer.setData('modalW', modalW);
            this.chatDialogContainer.setData('modalH', modalH);
            this.chatDialogContainer.setData('historyH', historyH);
            this.chatDialogContainer.setData('historyY', historyY);

            // Create HTML chat history div (rendered with marked)
            this.createChatHistoryElement(modalX, modalY, modalW, historyH, historyY);

            // Create HTML input
            this.createTeacherChatInput(modalX, modalY, modalW, modalH, inputAreaY, sendBtnW);

            // Show welcome message
            const welcomeMsg = npcKey === 'teacher1'
                ? 'Hello! I\'m your **Teacher**. Ask me anything about today\'s lesson! 📖'
                : 'Hey! I\'m the **Mentor**. Need help building something? 🛠️';
            this.chatHistory.push({ role: 'assistant', content: welcomeMsg });
            this.updateChatHistoryDisplay();
        }

    private createChatHistoryElement(modalX: number, modalY: number, modalW: number, historyH: number, historyY: number) {
        if (this.chatHistoryElement) {
            this.chatHistoryElement.remove();
            this.chatHistoryElement = null;
        }

        const canvas = this.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / this.scale.width;
        const scaleY = canvasRect.height / this.scale.height;

        const divW = (modalW - 14) * scaleX;
        const divH = historyH * scaleY;
        const divX = canvasRect.left + (modalX - (modalW - 14) / 2) * scaleX;
        const divY = canvasRect.top + (modalY + historyY - historyH / 2) * scaleY;

        this.chatHistoryElement = document.createElement('div');
        this.chatHistoryElement.style.cssText = `
            position: fixed;
            left: ${divX}px;
            top: ${divY}px;
            width: ${divW}px;
            height: ${divH}px;
            overflow-y: auto;
            padding: 8px 10px;
            box-sizing: border-box;
            z-index: 10000;
            font-family: 'Arial', sans-serif;
            font-size: ${Math.max(10, 11 * scaleY)}px;
            line-height: 1.5;
            color: #b0bec5;
            background: transparent;
            scrollbar-width: thin;
            scrollbar-color: #3949ab transparent;
        `;

        // Inject scoped styles for chat bubble + markdown rendering
        const styleTag = document.createElement('style');
        styleTag.textContent = `
            .chat-bubble-row {
                display: flex; margin: 4px 0; clear: both;
            }
            .chat-bubble-row.user { justify-content: flex-end; }
            .chat-bubble-row.assistant { justify-content: flex-start; }
            .chat-bubble {
                max-width: 82%; padding: 6px 10px; border-radius: 10px;
                font-size: 0.92em; line-height: 1.45; word-break: break-word;
            }
            .chat-bubble.user {
                background: #1a3a5c; color: #e1f5fe;
                border-bottom-right-radius: 3px;
            }
            .chat-bubble.assistant {
                background: #1e1e38; color: #cfd8dc;
                border-bottom-left-radius: 3px;
                border: 1px solid #283593;
            }
            .chat-bubble .chat-label {
                font-size: 0.8em; font-weight: 600; margin-bottom: 2px; display: block;
            }
            .chat-bubble.user .chat-label { color: #81d4fa; }
            .chat-bubble.assistant .chat-label { color: #9fa8da; }
            .chat-md h1, .chat-md h2, .chat-md h3 {
                color: #c5cae9; margin: 5px 0 2px; font-size: 1.05em; font-weight: 600;
            }
            .chat-md h1 { font-size: 1.12em; }
            .chat-md p { margin: 2px 0; }
            .chat-md strong { color: #e8eaf6; }
            .chat-md em { color: #9fa8da; font-style: italic; }
            .chat-md code {
                background: #1a237e; color: #7986cb; padding: 1px 4px;
                border-radius: 3px; font-family: monospace; font-size: 0.9em;
            }
            .chat-md pre {
                background: #0a0a1a; border: 1px solid #283593; border-radius: 4px;
                padding: 6px 8px; overflow-x: auto; margin: 4px 0;
            }
            .chat-md pre code { background: none; padding: 0; }
            .chat-md ul, .chat-md ol { padding-left: 16px; margin: 3px 0; }
            .chat-md li { margin: 1px 0; }
            .chat-md hr { border: none; border-top: 1px solid #283593; margin: 5px 0; }
            .chat-md a { color: #7986cb; text-decoration: underline; }
            .chat-md blockquote {
                border-left: 3px solid #3949ab; padding-left: 8px; margin: 4px 0;
                color: #9fa8da;
            }
        `;
        this.chatHistoryElement.appendChild(styleTag);

        document.body.appendChild(this.chatHistoryElement);
    }

    private createTeacherChatInput(modalX: number, modalY: number, modalW: number, modalH: number, inputAreaY: number, sendBtnW: number) {
            if (this.chatInputElement) {
                this.chatInputElement.remove();
                this.chatInputElement = null;
            }

            const gameW = this.scale.width;
            const canvas = this.game.canvas;
            const canvasRect = canvas.getBoundingClientRect();
            const scaleX = canvasRect.width / gameW;
            const scaleY = canvasRect.height / this.scale.height;

            const inputWidthGame = modalW - 14 - sendBtnW - 4;
            const inputHeightGame = 24;

            const inputCenterX = modalX - sendBtnW / 2;
            const inputCenterY = modalY + inputAreaY;

            const screenX = canvasRect.left + inputCenterX * scaleX;
            const screenY = canvasRect.top + inputCenterY * scaleY;
            const screenWidth = inputWidthGame * scaleX;
            const screenHeight = inputHeightGame * scaleY;

            this.chatInputElement = document.createElement('input');
            this.chatInputElement.type = 'text';
            this.chatInputElement.placeholder = 'Ask a question...';
            this.chatInputElement.maxLength = 500;

            this.chatInputElement.style.cssText = `
                position: fixed;
                left: ${screenX}px;
                top: ${screenY}px;
                width: ${screenWidth}px;
                height: ${screenHeight}px;
                padding: 4px 8px;
                font-family: 'Arial', sans-serif;
                font-size: ${Math.max(10, 12 * scaleY)}px;
                background: #0d0d1a;
                color: #e8eaf6;
                border: 1px solid #3949ab;
                border-radius: 4px;
                outline: none;
                z-index: 10000;
                box-sizing: border-box;
                transform: translate(-50%, -50%);
                transform-origin: center center;
            `;

            this.chatInputElement.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    this.sendTeacherChatMessage();
                } else if (e.key === 'Escape') {
                    this.closeTeacherChatDialog();
                }
                e.stopPropagation();
            });
            this.chatInputElement.addEventListener('keyup', (e) => e.stopPropagation());
            this.chatInputElement.addEventListener('keypress', (e) => e.stopPropagation());

            document.body.appendChild(this.chatInputElement);
            this.chatInputElement.focus();
        }

    private async sendTeacherChatMessage() {
            if (!this.chatInputElement || this.chatIsLoading) return;

            const message = this.chatInputElement.value.trim();
            if (!message) return;

            // Add user message to history
            this.chatHistory.push({ role: 'user', content: message });
            this.updateChatHistoryDisplay();

            // Clear input
            this.chatInputElement.value = '';

            // Show loading
            this.chatIsLoading = true;
            const loadingText = this.chatDialogContainer?.getData('loadingText') as Phaser.GameObjects.Text;
            if (loadingText) loadingText.setText('⏳ Thinking...');

            // Map NPC key to agentId
            const agentId: 'teacher' | 'mentor' = this.activeNpcKey === 'teacher1' ? 'teacher' : 'mentor';

            // Call API
            const response = await this.chatService.sendMessage(message, agentId);

            // Guard: dialog may have been closed while awaiting
            if (!this.chatDialogOpen) return;

            this.chatIsLoading = false;
            if (loadingText) loadingText.setText('');

            if (response.success && response.response) {
                // Store raw markdown — rendered by updateChatHistoryDisplay via marked
                this.chatHistory.push({ role: 'assistant', content: response.response });
            } else {
                this.chatHistory.push({
                    role: 'assistant',
                    content: response.error || 'Sorry, I cannot respond right now.',
                });
            }
            this.updateChatHistoryDisplay();

            this.chatInputElement?.focus();
        }

    private updateChatHistoryDisplay() {
            if (!this.chatHistoryElement) return;

            const npcName = this.activeNpcKey === 'teacher1' ? 'Teacher' : 'Mentor';
            const npcIcon = this.activeNpcKey === 'teacher1' ? '📚' : '🧑‍🏫';

            // Keep the style tag
            const styleTag = this.chatHistoryElement.querySelector('style');
            const styleHTML = styleTag ? styleTag.outerHTML : '';

            const messagesHTML = this.chatHistory.map(msg => {
                if (msg.role === 'user') {
                    return `<div class="chat-bubble-row user">
                        <div class="chat-bubble user">
                            <span class="chat-label">🧑 You</span>
                            ${this.escapeHtml(msg.content)}
                        </div>
                    </div>`;
                } else {
                    const html = marked.parse(msg.content, { async: false, breaks: true }) as string;
                    return `<div class="chat-bubble-row assistant">
                        <div class="chat-bubble assistant">
                            <span class="chat-label">${npcIcon} ${npcName}</span>
                            <div class="chat-md">${html}</div>
                        </div>
                    </div>`;
                }
            }).join('');

            this.chatHistoryElement.innerHTML = styleHTML + messagesHTML;

            // Auto-scroll to bottom
            this.chatHistoryElement.scrollTop = this.chatHistoryElement.scrollHeight;
        }

        private escapeHtml(text: string): string {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }


    private closeTeacherChatDialog() {
            if (!this.chatDialogOpen) return;
            this.chatDialogOpen = false;
            this.chatIsLoading = false;

            // Re-enable Phaser keyboard
            if (this.input.keyboard) {
                this.input.keyboard.enabled = true;
            }

            // Remove HTML input
            if (this.chatInputElement) {
                this.chatInputElement.remove();
                this.chatInputElement = null;
            }

            // Remove HTML chat history div
            if (this.chatHistoryElement) {
                this.chatHistoryElement.remove();
                this.chatHistoryElement = null;
            }

            // Destroy overlay
            this.chatDialogOverlay?.destroy();
            this.chatDialogOverlay = null;

            // Destroy dialog container (destroys all children)
            this.chatDialogContainer?.destroy();
            this.chatDialogContainer = null;

            // Clear chat state
            this.chatHistory = [];
            this.activeNpcKey = '';
        }

    shutdown() {
        this.scale.off('resize', this.onResize, this);
        EventBus.off('gamedata:updated', this.onGameDataUpdated, this);
        this.events.off('postupdate', this.updatePlayerUI, this);

        // Clean up teacher chat dialog
        this.closeTeacherChatDialog();

        this.studyingOverlay?.destroy();
        this.studyingOverlay = null;
        if (this.lessonContentElement) {
            this.lessonContentElement.remove();
            this.lessonContentElement = null;
        }
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
