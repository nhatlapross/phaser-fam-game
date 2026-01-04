import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { TOWN_SQUARE_MAP_DATA, TOWN_SQUARE_MAP_WIDTH, TOWN_SQUARE_MAP_HEIGHT } from './TownSquareMapData';
import { SoundManager, StationManager, NavigationData, ProfileManager, ToolbarManager, ToolbarItem, PlantType } from '../managers';
import { GameDataService } from '../GameDataService';
import { LobbySocketService } from '../LobbySocketService';
import { LobbyChatPayload, UserLobbyState, LobbyStatePayload, UserJoinedPayload, UserLeftPayload, UserMovedPayload } from '../types/LobbyTypes';
import { useGameState } from '../hooks/useGameState';

/**
 * Town Square Scene - A larger public space for social interactions
 * Uses water tileset for borders and square tileset for stone floor
 */
export class TownSquare extends Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasdKeys!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

    // World configuration
    private readonly TILE_SIZE = 16;
    private readonly MAP_WIDTH = TOWN_SQUARE_MAP_WIDTH;
    private readonly MAP_HEIGHT = TOWN_SQUARE_MAP_HEIGHT;

    // Station position (for spawn point)
    private readonly STATION_X = 6.5;
    private readonly STATION_Y = 30;

    // Tilemap
    private map!: Phaser.Tilemaps.Tilemap;
    private groundLayer!: Phaser.Tilemaps.TilemapLayer;

    // UI
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;

    // Mobile controls
    private joystickBase!: Phaser.GameObjects.Arc;
    private joystickThumb!: Phaser.GameObjects.Arc;
    private joystickActive: boolean = false;
    private joystickPointer: Phaser.Input.Pointer | null = null;

    // Station for travel (using StationManager)
    private stationManager!: StationManager;

    // Sound manager
    private soundManager!: SoundManager;

    // Profile manager
    private profileManager!: ProfileManager;

    // Toolbar manager
    private toolbarManager!: ToolbarManager;
    private selectedToolIndex: number = 0;

    // Toolbar items (same as FarmingGame)
    private toolbarItems: ToolbarItem[] = [
        { type: 'tool', name: 'hand' },
        { type: 'tool', name: 'wateringCan', count: 0 },
        { type: 'seed', name: 'seed' },
        { type: 'tool', name: 'fertilizer' },
        { type: 'tool', name: 'digest' },
        { type: 'tool', name: 'chest' },
    ];

    // Empty states for toolbar (not used in TownSquare)
    private seedCounts: Record<PlantType, number> = { algae: 0, mushroom: 0, tree: 0 };
    private fertilizerCounts: Record<'common' | 'rare' | 'epic' | 'legendary', number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    private chestInventory: any[] = [];
    private chestOpen: boolean = false;
    private selectedSeedIndex: number = 0;
    private selectedFertilizerIndex: number = 0;

    // Clock UI
    private timeText!: Phaser.GameObjects.Text;

    // Marquee UI
    private marqueeText!: Phaser.GameObjects.Text;

    // Player name text (displayed above player in TownSquare)
    private playerNameText!: Phaser.GameObjects.Text;

    // Chat system
    private chatButton!: Phaser.GameObjects.Container;
    private chatModalOpen: boolean = false;
    private chatModal!: Phaser.GameObjects.Container;
    private chatModalOverlay: Phaser.GameObjects.Rectangle | null = null;
    private chatHistory: Array<{ username: string; message: string; timestamp: Date; scope: string }> = [];
    private speechBubble: Phaser.GameObjects.Container | null = null;
    private chatInputElement: HTMLInputElement | null = null;
    private chatHistoryText: Phaser.GameObjects.Text | null = null;

    // Lobby WebSocket service
    private lobbySocketService!: LobbySocketService;

    // Multiplayer - other players
    private otherPlayers: Map<string, {
        sprite: Phaser.GameObjects.Sprite;
        nameText: Phaser.GameObjects.Text;
        speechBubble: Phaser.GameObjects.Container | null;
        targetX: number;
        targetY: number;
        lastX: number;
        lastY: number;
        isMoving: boolean;
    }> = new Map();
    private lastPositionSent: { x: number; y: number; time: number } = { x: 0, y: 0, time: 0 };
    private readonly POSITION_SEND_THROTTLE = 100; // ms between position updates
    private readonly POSITION_CHANGE_THRESHOLD = 2; // minimum distance to trigger update

    // Navigation data (from station travel)
    private navigationData: NavigationData | null = null;

    constructor() {
        super('TownSquare');
    }

    init(data?: NavigationData) {
        // Store navigation data if coming from station travel
        this.navigationData = data?.spawnAt ? data : null;
    }

    create() {
        // Initialize sound manager
        this.soundManager = new SoundManager(this);

        // Create water animation
        this.createWaterAnimation();

        // Create the map
        this.createTownSquareMap();

        // Create station using StationManager (with Square as current location)
        this.stationManager = new StationManager(this, {
            onNavigate: (sceneKey, navData) => {
                console.log(`Navigate to: ${sceneKey}`);
                // Stop all sounds before scene transition
                this.soundManager?.destroy();
                this.time.delayedCall(500, () => {
                    this.scene.start(sceneKey, navData);
                });
            },
            showToastMessage: (text, color) => this.showToastMessage(text, color)
        }, {
            x: this.STATION_X,   // Left side of square
            y: this.STATION_Y,   // Middle height
            flipX: true,         // Flip to face right
            currentLocationId: 'square'  // Square is current location
        });
        this.stationManager.create();

        // Create player
        this.createPlayer();

        // Setup main camera
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(3);
        this.cameras.main.setRoundPixels(true); // Prevent tile gaps

        // Create UI camera
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera.setScroll(0, 0);
        this.uiCamera.name = 'uiCamera';

        // Create clock UI
        this.createClockUI();

        // Initialize gameState from cached data (needed for ProfileManager currency display)
        this.initializeGameState();

        // Create profile manager
        this.profileManager = new ProfileManager(this, {
            onLogout: () => {
                this.scene.start('Login', { fromLogout: true });
            },
            onWalletConnected: (_address) => { }
        });
        this.profileManager.createProfileUI();

        // Create toolbar manager (simplified for TownSquare)
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

        // Create marquee announcement
        this.createMarquee();

        // Create chat button
        this.createChatButton();

        // Setup controls
        this.setupControls();

        // Create mobile controls
        this.createMobileControls();

        // Setup camera ignore for UI elements
        this.setupCameraIgnore();

        // Initialize lobby WebSocket and setup chat listeners
        this.initializeLobbySocket();

        // Handle resize
        this.scale.on('resize', this.onResize, this);

        // Play theme music
        this.soundManager.playRandomTheme();

        EventBus.emit('current-scene-ready', this);
    }

    private createWaterAnimation() {
        if (!this.anims.exists('water-anim')) {
            this.anims.create({
                key: 'water-anim',
                frames: this.anims.generateFrameNumbers('water-tileset', { start: 0, end: 3 }),
                frameRate: 4,
                repeat: -1
            });
        }
    }

    private createTownSquareMap() {
        // Create water background for entire map
        this.createWaterBackground();

        // Create tilemap
        this.map = this.make.tilemap({
            tileWidth: this.TILE_SIZE,
            tileHeight: this.TILE_SIZE,
            width: this.MAP_WIDTH,
            height: this.MAP_HEIGHT
        });

        // Add square tileset
        const squareTiles = this.map.addTilesetImage('square', 'square-tileset');

        if (!squareTiles) {
            console.error('Failed to load square tileset');
            return;
        }

        // Create ground layer
        this.groundLayer = this.map.createBlankLayer('Ground', squareTiles) as Phaser.Tilemaps.TilemapLayer;

        if (!this.groundLayer) {
            console.error('Failed to create ground layer');
            return;
        }

        this.groundLayer.setDepth(1);

        // Apply tiles based on map data
        for (let y = 0; y < this.MAP_HEIGHT; y++) {
            for (let x = 0; x < this.MAP_WIDTH; x++) {
                const tileValue = TOWN_SQUARE_MAP_DATA[y][x];

                if (tileValue > 0) {
                    // Use autotiling for stone floor
                    const autoTileIndex = this.getAutoTileIndex(x, y);
                    this.groundLayer.putTileAt(autoTileIndex, x, y);
                }
            }
        }

        // Add decorative elements
        this.addDecorativeElements();
    }

    private createWaterBackground() {
        for (let y = 0; y < this.MAP_HEIGHT; y++) {
            for (let x = 0; x < this.MAP_WIDTH; x++) {
                const water = this.add.sprite(
                    x * this.TILE_SIZE + this.TILE_SIZE / 2,
                    y * this.TILE_SIZE + this.TILE_SIZE / 2,
                    'water-tileset',
                    0
                );
                water.setOrigin(0.5);
                water.setDepth(0);
                water.play('water-anim');
            }
        }
    }

    private isLandTile(x: number, y: number): boolean {
        if (x < 0 || x >= this.MAP_WIDTH || y < 0 || y >= this.MAP_HEIGHT) {
            return false;
        }
        return TOWN_SQUARE_MAP_DATA[y][x] > 0;
    }

    private getAutoTileIndex(x: number, y: number): number {
        const top = this.isLandTile(x, y - 1);
        const bottom = this.isLandTile(x, y + 1);
        const left = this.isLandTile(x - 1, y);
        const right = this.isLandTile(x + 1, y);

        // Square tileset layout (11 cols x 7 rows = 77 tiles):
        // The tileset has decorative tiles, use simple center tile for floor
        // Tile 12 (col 1, row 1) is a plain stone center tile

        // Full center (all 4 cardinal directions are land)
        if (top && bottom && left && right) {
            return 12; // Center floor tile
        }

        // Outer corners
        if (!top && !left && bottom && right) {
            return 0; // Top-left corner
        }
        if (!top && !right && bottom && left) {
            return 2; // Top-right corner
        }
        if (!bottom && !left && top && right) {
            return 22; // Bottom-left corner (col 0, row 2)
        }
        if (!bottom && !right && top && left) {
            return 24; // Bottom-right corner (col 2, row 2)
        }

        // Edges
        if (!top && bottom && left && right) {
            return 1; // Top edge
        }
        if (top && !bottom && left && right) {
            return 23; // Bottom edge (col 1, row 2)
        }
        if (top && bottom && !left && right) {
            return 11; // Left edge (col 0, row 1)
        }
        if (top && bottom && left && !right) {
            return 13; // Right edge (col 2, row 1)
        }

        // Default to center floor
        return 12;
    }

    private addDecorativeElements() {
        // Create fountain at center of map
        this.createFountain();

        // Add trees, lamps, and chairs based on reference layout
        this.createTrees();
        this.createLamps();
        this.createChairs();
    }

    private createDecoration(key: string, tileX: number, tileY: number, scale: number = 0.5): Phaser.GameObjects.Image {
        const x = tileX * this.TILE_SIZE;
        const y = tileY * this.TILE_SIZE;
        const decoration = this.add.image(x, y, key);
        decoration.setOrigin(0.5, 0.85);  // Bottom-center origin for depth sorting
        decoration.setScale(scale);
        decoration.setDepth(y);
        return decoration;
    }

    private createTrees() {
        // Trees in corners of the stone area (inner corners, not at edge)
        const treePositions = [
            { x: 12, y: 12 },   // Top-left
            { x: 48, y: 12 },   // Top-right
            { x: 12, y: 48 },   // Bottom-left
            { x: 48, y: 48 },   // Bottom-right
            // Additional trees for more decoration
            { x: 20, y: 12 },   // Top row
            { x: 40, y: 12 },   // Top row
            { x: 12, y: 30 },   // Left side middle
            { x: 48, y: 30 },   // Right side middle
        ];

        treePositions.forEach(pos => {
            this.createDecoration('square-tree', pos.x, pos.y, 0.4);
        });
    }

    private createLamps() {
        // Lamps along pathways
        const lampPositions = [
            // Near corners
            { x: 15, y: 15 },
            { x: 45, y: 15 },
            { x: 15, y: 45 },
            { x: 45, y: 45 },
            // Along center paths
            { x: 22, y: 30 },   // Left of fountain
            { x: 38, y: 30 },   // Right of fountain
            { x: 30, y: 18 },   // Above fountain
            { x: 30, y: 42 },   // Below fountain
        ];

        lampPositions.forEach(pos => {
            this.createDecoration('square-lamp', pos.x, pos.y, 0.35);
        });
    }

    private createChairs() {
        // Benches/chairs around the square
        const chairPositions = [
            // Top side
            { x: 25, y: 14 },
            { x: 35, y: 14 },
            // Bottom side
            { x: 25, y: 46 },
            { x: 35, y: 46 },
            // Left side
            { x: 14, y: 25 },
            { x: 14, y: 35 },
            // Right side
            { x: 46, y: 25 },
            { x: 46, y: 35 },
        ];

        chairPositions.forEach(pos => {
            this.createDecoration('square-chair', pos.x, pos.y, 0.35);
        });
    }

    private createFountain() {
        const centerX = this.MAP_WIDTH / 2 * this.TILE_SIZE;
        const centerY = this.MAP_HEIGHT / 2 * this.TILE_SIZE;

        // Create fountain animation if not exists
        if (!this.anims.exists('fountain-anim')) {
            this.anims.create({
                key: 'fountain-anim',
                frames: this.anims.generateFrameNumbers('fountain', { start: 0, end: 4 }),
                frameRate: 3,  // Slower animation
                repeat: -1
            });
        }

        // Create fountain sprite at center (resized spritesheet 267x94, frame 53x94)
        const fountain = this.add.sprite(centerX, centerY, 'fountain', 0);
        fountain.setOrigin(0.5, 0.7);  // Adjust origin for bottom-center alignment
        fountain.setDepth(centerY);
        fountain.play('fountain-anim');
    }

    private createPlayer() {
        let startX: number;
        let startY: number;

        // Spawn at station if coming from travel, otherwise spawn at center
        if (this.navigationData?.spawnAt === 'station') {
            // Spawn near station (offset to the right so player doesn't overlap station)
            startX = (this.STATION_X + 3) * this.TILE_SIZE;
            startY = this.STATION_Y * this.TILE_SIZE;
        } else {
            // Default spawn at center
            startX = this.MAP_WIDTH / 2 * this.TILE_SIZE;
            startY = this.MAP_HEIGHT / 2 * this.TILE_SIZE + 50;
        }

        this.player = this.physics.add.sprite(startX, startY, 'player', 0);
        this.player.setOrigin(0.5, 0.75);
        this.player.setCollideWorldBounds(false);
        this.player.setDepth(startY);

        // Create player animations if not exists (same as FarmingGame)
        this.createPlayerAnimations();

        this.player.play('idle-down');

        // Create player name text above player
        const cachedData = GameDataService.getCachedData();
        const fullName = cachedData?.user?.username || 'Player';
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

        // Spritesheet layout (4x4 grid, 16 frames total):
        // Frame 0-1: idle front (down)
        // Frame 2-3: walk front (down)
        // Frame 4-5: idle back (up)
        // Frame 6-7: walk back (up)
        // Frame 8-9: idle left
        // Frame 10-11: walk left
        // Frame 12-13: idle right
        // Frame 14-15: walk right

        // Skip if already created
        if (this.anims.exists('idle-down')) return;

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
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasdKeys = {
                W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
                A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
                S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
                D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
            };
        }
    }

    private createMobileControls() {
        const screenHeight = this.scale.height;

        // Joystick
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

        // Make joystick interactive
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
        // UI camera ignores all game objects
        this.children.each((child) => {
            if (child instanceof Phaser.GameObjects.GameObject) {
                const depth = (child as any).depth || 0;
                if (depth < 5000) {
                    this.uiCamera.ignore(child);
                }
            }
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

    update() {
        this.handlePlayerMovement();
        this.updateClock();

        // Multiplayer: send position and update other players
        this.sendPlayerPosition();
        this.updateOtherPlayers();
    }

    private handlePlayerMovement() {
        const speed = 80;
        let velocityX = 0;
        let velocityY = 0;
        let direction = '';

        // Keyboard input
        if (this.cursors) {
            if (this.cursors.left.isDown || this.wasdKeys?.A.isDown) {
                velocityX = -speed;
                direction = 'left';
            } else if (this.cursors.right.isDown || this.wasdKeys?.D.isDown) {
                velocityX = speed;
                direction = 'right';
            }

            if (this.cursors.up.isDown || this.wasdKeys?.W.isDown) {
                velocityY = -speed;
                direction = 'up';
            } else if (this.cursors.down.isDown || this.wasdKeys?.S.isDown) {
                velocityY = speed;
                direction = 'down';
            }
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

                // Determine direction
                if (Math.abs(dx) > Math.abs(dy)) {
                    direction = dx > 0 ? 'right' : 'left';
                } else {
                    direction = dy > 0 ? 'down' : 'up';
                }
            }
        }

        // Apply velocity
        this.player.setVelocity(velocityX, velocityY);

        // Update animation
        if (velocityX !== 0 || velocityY !== 0) {
            this.player.play(`walk-${direction || 'down'}`, true);
        } else {
            const currentAnim = this.player.anims.currentAnim?.key || '';
            if (currentAnim.includes('walk')) {
                const dir = currentAnim.replace('walk-', '');
                this.player.play(`idle-${dir}`, true);
            }
        }

        // Update player depth based on Y position
        this.player.setDepth(this.player.y);

        // Update player name position and depth
        if (this.playerNameText) {
            this.playerNameText.setPosition(this.player.x, this.player.y - 18);
            this.playerNameText.setDepth(this.player.y + 1);
        }

        // Update speech bubble position
        if (this.speechBubble) {
            this.speechBubble.setPosition(this.player.x, this.player.y - 40);
            this.speechBubble.setDepth(this.player.y + 100);
        }

        // Constrain to land area
        this.constrainPlayerToLand();
    }

    private constrainPlayerToLand() {
        // Stone area bounds (water border is 8 tiles on each side)
        // Add small buffer (half tile) to keep player visually inside
        const minX = 8 * this.TILE_SIZE + this.TILE_SIZE / 2;
        const maxX = (this.MAP_WIDTH - 8) * this.TILE_SIZE - this.TILE_SIZE / 2;
        const minY = 8 * this.TILE_SIZE + this.TILE_SIZE / 2;
        const maxY = (this.MAP_HEIGHT - 8) * this.TILE_SIZE - this.TILE_SIZE / 2;

        // Always clamp player to stone area
        this.player.x = Phaser.Math.Clamp(this.player.x, minX, maxX);
        this.player.y = Phaser.Math.Clamp(this.player.y, minY, maxY);

        // Fountain collision zone (prevent player from walking into fountain base)
        const fountainCenterX = this.MAP_WIDTH / 2 * this.TILE_SIZE;
        const fountainCenterY = this.MAP_HEIGHT / 2 * this.TILE_SIZE;

        // Fountain frame is 67x118 with origin (0.5, 0.7)
        // Collision zone covers the base area where player shouldn't walk
        const fountainHalfWidth = 35;  // Half width of collision zone
        const fountainTop = fountainCenterY - 15;  // Top of collision (allows walking behind water spray)
        const fountainBottom = fountainCenterY + 35;  // Bottom of collision

        // Check if player is inside fountain collision zone
        if (this.player.x > fountainCenterX - fountainHalfWidth &&
            this.player.x < fountainCenterX + fountainHalfWidth &&
            this.player.y > fountainTop &&
            this.player.y < fountainBottom) {

            // Calculate which edge to push player to (shortest distance)
            const distLeft = this.player.x - (fountainCenterX - fountainHalfWidth);
            const distRight = (fountainCenterX + fountainHalfWidth) - this.player.x;
            const distTop = this.player.y - fountainTop;
            const distBottom = fountainBottom - this.player.y;

            const minDist = Math.min(distLeft, distRight, distTop, distBottom);

            if (minDist === distLeft) {
                this.player.x = fountainCenterX - fountainHalfWidth;
            } else if (minDist === distRight) {
                this.player.x = fountainCenterX + fountainHalfWidth;
            } else if (minDist === distTop) {
                this.player.y = fountainTop;
            } else {
                this.player.y = fountainBottom;
            }

            // Stop velocity when colliding
            this.player.setVelocity(0, 0);
        }
    }

    /**
     * Initialize gameState from cached data (for ProfileManager currency display)
     */
    private initializeGameState() {
        const cachedData = GameDataService.getCachedData();
        if (!cachedData) return;

        const gameState = useGameState(this);
        gameState.initialize({
            currency: {
                gold: cachedData.user?.balanceGold ?? cachedData.currencies?.gold ?? 0,
                gem: cachedData.user?.balanceGem ?? cachedData.currencies?.gem ?? 0,
            },
            seeds: this.seedCounts,
            fertilizers: this.fertilizerCounts,
            fruits: [],
            waterCount: 0,
            user: cachedData.user ? {
                id: cachedData.user.id,
                username: cachedData.user.username || 'Player',
                avatar: cachedData.user.avatar || null,
                xp: cachedData.user.xp,
                reputationScore: cachedData.user.reputationScore,
                address: cachedData.user.address,
                landsCount: cachedData.user.landsCount || 0,
                plantsCount: cachedData.user.plantsCount || 0,
            } : null,
        });
    }

    destroy() {
        this.scale.off('resize', this.onResize, this);
        this.soundManager?.destroy();
        this.stationManager?.destroy();
        this.profileManager?.destroy();
        this.toolbarManager?.destroy();

        // Cleanup lobby socket event listeners
        this.cleanupLobbySocketListeners();
    }

    /**
     * Initialize lobby WebSocket connection and setup event listeners
     */
    private initializeLobbySocket() {
        this.lobbySocketService = LobbySocketService.getInstance();

        // Setup event listeners BEFORE connecting to ensure we catch lobby_state
        this.setupLobbyChatListeners();

        // Force fresh connection when entering TownSquare to get lobby_state
        // This ensures users joining later will see all existing users
        if (this.lobbySocketService.isConnected()) {
            console.log('🔄 [TownSquare] Socket already connected, forcing reconnect for fresh lobby_state');
            this.lobbySocketService.disconnect();
        }

        // Connect (or reconnect) to get lobby_state
        this.lobbySocketService.connect();
    }

    /**
     * Setup lobby chat event listeners
     */
    private setupLobbyChatListeners() {
        // Clean up any existing listeners first (prevent duplicates on scene re-entry)
        this.cleanupLobbySocketListeners();

        // Listen for incoming chat messages
        EventBus.on('lobby:chat', this.handleLobbyChatMessage, this);

        // Listen for connection status
        EventBus.on('lobby:connected', this.handleLobbyConnected, this);
        EventBus.on('lobby:disconnected', this.handleLobbyDisconnected, this);

        // Listen for multiplayer events
        EventBus.on('lobby:state', this.handleLobbyState, this);
        EventBus.on('lobby:user_joined', this.handleUserJoined, this);
        EventBus.on('lobby:user_left', this.handleUserLeft, this);
        EventBus.on('lobby:user_moved', this.handleUserMoved, this);
    }

    /**
     * Cleanup lobby socket event listeners
     */
    private cleanupLobbySocketListeners() {
        EventBus.off('lobby:chat', this.handleLobbyChatMessage, this);
        EventBus.off('lobby:connected', this.handleLobbyConnected, this);
        EventBus.off('lobby:disconnected', this.handleLobbyDisconnected, this);

        // Cleanup multiplayer events
        EventBus.off('lobby:state', this.handleLobbyState, this);
        EventBus.off('lobby:user_joined', this.handleUserJoined, this);
        EventBus.off('lobby:user_left', this.handleUserLeft, this);
        EventBus.off('lobby:user_moved', this.handleUserMoved, this);

        // Destroy all other player sprites and speech bubbles
        this.otherPlayers.forEach((player) => {
            player.sprite.destroy();
            player.nameText.destroy();
            if (player.speechBubble) {
                player.speechBubble.destroy(true);
            }
        });
        this.otherPlayers.clear();
    }

    /**
     * Handle incoming lobby chat message from WebSocket
     */
    private handleLobbyChatMessage = (payload: LobbyChatPayload) => {
        console.log('💬 [TownSquare] Received chat message:', payload);
        
        // Add to chat history
        this.chatHistory.push({
            username: payload.username,
            message: payload.message,
            timestamp: new Date(payload.timestamp),
            scope: payload.scope
        });

        // Keep only last 50 messages
        if (this.chatHistory.length > 50) {
            this.chatHistory = this.chatHistory.slice(-50);
        }

        // Update chat modal if open
        this.updateChatHistoryDisplay();

        // Show speech bubble for the message
        const cachedData = GameDataService.getCachedData();
        const currentUserId = cachedData?.user?.id;

        if (payload.userId === currentUserId) {
            // Show speech bubble for own messages (above main player)
            this.showSpeechBubble(payload.message);
        } else {
            // Show speech bubble for other players
            this.showOtherPlayerSpeechBubble(payload.userId, payload.message);
        }
    };

    /**
     * Handle lobby connected event
     */
    private handleLobbyConnected = () => {
        console.log('✅ [TownSquare] Lobby WebSocket connected');
        this.showToastMessage('Connected to chat', 0x4CAF50);

        // Send initial position immediately after connection
        // This ensures other players see us right away
        if (this.player) {
            this.time.delayedCall(100, () => {
                this.lobbySocketService?.move(this.player.x, this.player.y, 'square');
                this.lastPositionSent.x = this.player.x;
                this.lastPositionSent.y = this.player.y;
                this.lastPositionSent.time = Date.now();
                console.log('📍 [TownSquare] Sent initial position:', this.player.x, this.player.y);
            });
        }
    };

    /**
     * Handle lobby disconnected event
     */
    private handleLobbyDisconnected = (reason: string) => {
        console.log('❌ [TownSquare] Lobby WebSocket disconnected:', reason);
        this.showToastMessage('Chat disconnected', 0xFF5722);
    };

    // ==========================================
    // Multiplayer Handlers
    // ==========================================

    /**
     * Handle initial lobby state - spawn all existing players
     */
    private handleLobbyState = (payload: LobbyStatePayload) => {
        console.log('👥 [TownSquare] Received lobby state:', payload.length, 'users');
        console.log('👥 [TownSquare] Users in lobby:', payload.map(u => u.username).join(', '));

        const cachedData = GameDataService.getCachedData();
        const currentUserId = cachedData?.user?.id;
        console.log('👤 [TownSquare] Current user ID:', currentUserId);

        // Clear existing players first (in case of reconnection)
        this.otherPlayers.forEach((player, id) => {
            player.sprite.destroy();
            player.nameText.destroy();
            this.otherPlayers.delete(id);
        });

        let createdCount = 0;
        payload.forEach((user) => {
            // Don't create sprite for self
            if (user.userId === currentUserId) {
                console.log('👤 [TownSquare] Skipping self:', user.username);
                return;
            }

            this.createOtherPlayer(user);
            createdCount++;
        });

        console.log(`✅ [TownSquare] Created ${createdCount} other player sprites`);
    };

    /**
     * Handle new user joined
     */
    private handleUserJoined = (payload: UserJoinedPayload) => {
        console.log('➕ [TownSquare] User joined:', payload.username);

        const cachedData = GameDataService.getCachedData();
        const currentUserId = cachedData?.user?.id;

        // Don't create sprite for self
        if (payload.userId === currentUserId) return;

        // Remove existing if any (shouldn't happen, but safety check)
        this.removeOtherPlayer(payload.userId);

        this.createOtherPlayer(payload);
        this.showToastMessage(`${payload.username} joined`, 0x4CAF50);
    };

    /**
     * Handle user left
     */
    private handleUserLeft = (payload: UserLeftPayload) => {
        console.log('➖ [TownSquare] User left:', payload.userId);

        const player = this.otherPlayers.get(payload.userId);
        if (player) {
            this.showToastMessage(`${player.nameText.text} left`, 0xFF9800);
            this.removeOtherPlayer(payload.userId);
        }
    };

    /**
     * Handle user moved
     */
    private handleUserMoved = (payload: UserMovedPayload) => {
        const cachedData = GameDataService.getCachedData();
        const currentUserId = cachedData?.user?.id;

        // Ignore self movement
        if (payload.userId === currentUserId) return;

        const player = this.otherPlayers.get(payload.userId);
        if (player) {
            // Update target position for smooth interpolation
            player.targetX = payload.x;
            player.targetY = payload.y;
        } else {
            // Player not found, create them
            this.createOtherPlayer(payload);
        }
    };

    /**
     * Create sprite and name text for another player
     */
    private createOtherPlayer(user: UserLobbyState) {
        // Don't create duplicate
        if (this.otherPlayers.has(user.userId)) {
            console.log(`⚠️ [TownSquare] Player ${user.username} already exists, skipping`);
            return;
        }

        // Create sprite using same atlas as main player
        const sprite = this.add.sprite(user.x, user.y, 'player', 0);
        sprite.setOrigin(0.5, 0.75); // Same origin as main player
        sprite.setDepth(user.y); // Depth based on Y position for proper layering

        // Play idle animation
        if (this.anims.exists('idle-down')) {
            sprite.play('idle-down');
        }

        // Create name text above sprite
        const displayName = (user.username || 'Player').length > 9
            ? (user.username || 'Player').substring(0, 9) + '...'
            : (user.username || 'Player');
        const nameText = this.add.text(user.x, user.y - 18, displayName, {
            fontSize: '6px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        }).setOrigin(0.5, 1);
        nameText.setDepth(user.y + 1);
        nameText.setStroke('#000000', 1);

        // UI camera should ignore game objects
        if (this.uiCamera) {
            this.uiCamera.ignore(sprite);
            this.uiCamera.ignore(nameText);
        }

        this.otherPlayers.set(user.userId, {
            sprite,
            nameText,
            speechBubble: null,
            targetX: user.x,
            targetY: user.y,
            lastX: user.x,
            lastY: user.y,
            isMoving: false
        });

        console.log(`🎮 [TownSquare] Created player: ${user.username} at (${user.x}, ${user.y})`);
    }

    /**
     * Remove another player's sprite
     */
    private removeOtherPlayer(userId: string) {
        const player = this.otherPlayers.get(userId);
        if (player) {
            player.sprite.destroy();
            player.nameText.destroy();
            if (player.speechBubble) {
                player.speechBubble.destroy(true);
            }
            this.otherPlayers.delete(userId);
        }
    }

    /**
     * Send player position to server (throttled)
     */
    private sendPlayerPosition() {
        if (!this.lobbySocketService?.isConnected()) return;

        const now = Date.now();
        const dx = Math.abs(this.player.x - this.lastPositionSent.x);
        const dy = Math.abs(this.player.y - this.lastPositionSent.y);

        // Only send if enough time has passed AND position changed significantly
        if (now - this.lastPositionSent.time >= this.POSITION_SEND_THROTTLE &&
            (dx >= this.POSITION_CHANGE_THRESHOLD || dy >= this.POSITION_CHANGE_THRESHOLD)) {

            this.lobbySocketService.move(this.player.x, this.player.y, 'square');

            this.lastPositionSent.x = this.player.x;
            this.lastPositionSent.y = this.player.y;
            this.lastPositionSent.time = now;
        }
    }

    /**
     * Update other players' positions with smooth interpolation and animations
     */
    private updateOtherPlayers() {
        const lerpFactor = 0.15; // Smoothness factor (0 = no movement, 1 = instant)
        const movementThreshold = 0.5; // Minimum movement to be considered "moving"

        this.otherPlayers.forEach((player) => {
            const currentX = player.sprite.x;
            const currentY = player.sprite.y;

            // Calculate distance to target
            const dx = player.targetX - currentX;
            const dy = player.targetY - currentY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Check if player is moving
            const wasMoving = player.isMoving;
            player.isMoving = distance > movementThreshold;

            if (player.isMoving) {
                // Lerp position
                player.sprite.x = currentX + dx * lerpFactor;
                player.sprite.y = currentY + dy * lerpFactor;

                // Determine direction and play animation
                const absX = Math.abs(dx);
                const absY = Math.abs(dy);

                let direction = 'down';
                if (absX > absY) {
                    // Horizontal movement is dominant
                    direction = dx > 0 ? 'right' : 'left';
                } else {
                    // Vertical movement is dominant
                    direction = dy > 0 ? 'down' : 'up';
                }

                // Play walk animation if not already playing
                const walkAnim = `walk-${direction}`;
                if (this.anims.exists(walkAnim)) {
                    const currentAnim = player.sprite.anims.currentAnim?.key;
                    if (currentAnim !== walkAnim) {
                        player.sprite.play(walkAnim, true);
                    }
                }
            } else {
                // Snap to target if very close
                player.sprite.x = player.targetX;
                player.sprite.y = player.targetY;

                // Play idle animation when stopped
                if (wasMoving) {
                    // Get last direction from current animation
                    const currentAnim = player.sprite.anims.currentAnim?.key || '';
                    let idleDirection = 'down';
                    if (currentAnim.includes('up')) idleDirection = 'up';
                    else if (currentAnim.includes('left')) idleDirection = 'left';
                    else if (currentAnim.includes('right')) idleDirection = 'right';

                    const idleAnim = `idle-${idleDirection}`;
                    if (this.anims.exists(idleAnim)) {
                        player.sprite.play(idleAnim, true);
                    }
                }
            }

            // Update depth based on Y position for proper layering
            player.sprite.setDepth(player.sprite.y);
            player.nameText.setDepth(player.sprite.y + 1);

            // Update name text position
            player.nameText.x = player.sprite.x;
            player.nameText.y = player.sprite.y - 18;

            // Update last position
            player.lastX = currentX;
            player.lastY = currentY;
        });
    }

    /**
     * Update chat history display in modal
     */
    private updateChatHistoryDisplay() {
        if (!this.chatHistoryText || !this.chatModalOpen) return;

        // Show last 10 messages (newest at bottom)
        const displayMessages = this.chatHistory.slice(-10).map(msg => {
            const shortName = msg.username.length > 9
                ? msg.username.substring(0, 9) + '...'
                : msg.username;
            const scopeIcon = msg.scope === 'GLOBAL' ? '🌐' : '📍';
            return `${scopeIcon} ${shortName}: ${msg.message}`;
        });

        this.chatHistoryText.setText(displayMessages.join('\n'));
    }

    /**
     * Create clock UI in top-left corner
     */
    private createClockUI() {
        const uiX = 20;
        const uiY = 25;

        // Background for clock
        const clockBg = this.add.rectangle(uiX + 55, uiY, 130, 30, 0x3E2723, 0.8);
        clockBg.setOrigin(0.5, 0.5);
        clockBg.setDepth(5000);
        clockBg.setStrokeStyle(2, 0x5D4037);
        this.cameras.main?.ignore(clockBg);

        // Clock icon
        const clockIcon = this.add.text(uiX, uiY, '🕐', {
            fontSize: '14px',
            resolution: 2
        }).setOrigin(0, 0.5);
        clockIcon.setDepth(5005);
        this.cameras.main?.ignore(clockIcon);

        // Time text (offset to the right of icon)
        this.timeText = this.add.text(uiX + 22, uiY, '', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        }).setOrigin(0, 0.5);
        this.timeText.setDepth(5005);
        this.cameras.main?.ignore(this.timeText);
    }

    /**
     * Update clock display
     */
    private updateClock() {
        if (!this.timeText) return;

        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}:${seconds}`;
        this.timeText.setText(timeStr);
    }

    /**
     * Create marquee announcement banner
     */
    private createMarquee() {
        const screenWidth = this.scale.width;
        const marqueeY = 18;
        const marqueeWidth = 400;
        const marqueeHeight = 18;
        const marqueeX = screenWidth / 2;
        const message = '🎉 Cardano Meetup in First January 2026 with many gifts waiting for you! 🎁';

        // Background bar (centered)
        const marqueeBg = this.add.rectangle(marqueeX, marqueeY, marqueeWidth, marqueeHeight, 0x000000, 0.7);
        marqueeBg.setDepth(5100);
        this.cameras.main?.ignore(marqueeBg);

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
        this.cameras.main?.ignore(this.marqueeText);

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
                duration: 12000,
                ease: 'Linear',
                onComplete: () => {
                    // Hide marquee after text finishes
                    marqueeBg.setVisible(false);
                    this.marqueeText.setVisible(false);

                    // Wait 5 minutes then show again
                    this.time.delayedCall(300000, () => {
                        animateMarquee();
                    });
                }
            });
        };
        animateMarquee();
    }

    /**
     * Create chat button in bottom right area
     */
    private createChatButton() {
        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const buttonX = screenWidth - 60;
        const buttonY = screenHeight - 140;

        // Create button container
        this.chatButton = this.add.container(buttonX, buttonY);
        this.chatButton.setDepth(5200);

        // Button background
        const bg = this.add.circle(0, 0, 25, 0x4CAF50, 0.9);
        bg.setStrokeStyle(2, 0x2E7D32);

        // Chat icon (speech bubble emoji)
        const icon = this.add.text(0, 0, '💬', {
            fontSize: '20px',
            resolution: 2
        }).setOrigin(0.5);

        this.chatButton.add([bg, icon]);

        // Make interactive
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(0x66BB6A, 1));
        bg.on('pointerout', () => bg.setFillStyle(0x4CAF50, 0.9));
        bg.on('pointerdown', () => this.openChatModal());

        this.cameras.main?.ignore(this.chatButton);
    }

    /**
     * Open chat modal
     */
    private openChatModal() {
        if (this.chatModalOpen) return;
        this.chatModalOpen = true;

        const screenWidth = this.scale.width;
        const screenHeight = this.scale.height;
        const modalWidth = 300;
        const modalHeight = 250;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Create dark overlay (click to close)
        this.chatModalOverlay = this.add.rectangle(
            screenWidth / 2,
            screenHeight / 2,
            screenWidth,
            screenHeight,
            0x000000,
            0.5
        );
        this.chatModalOverlay.setDepth(5400);
        this.chatModalOverlay.setInteractive();
        this.chatModalOverlay.on('pointerdown', () => this.closeChatModal());
        this.cameras.main?.ignore(this.chatModalOverlay);

        this.chatModal = this.add.container(modalX, modalY);
        this.chatModal.setDepth(5500);

        // Modal background (interactive to block clicks from reaching overlay)
        const bg = this.add.rectangle(0, 0, modalWidth, modalHeight, 0x3E2723, 0.95);
        bg.setStrokeStyle(3, 0x5D4037);
        bg.setInteractive(); // Block click propagation to overlay

        // Title with connection status
        const isConnected = this.lobbySocketService?.isConnected();
        const statusIcon = isConnected ? '🟢' : '🔴';
        const title = this.add.text(0, -modalHeight / 2 + 20, `💬 Global Chat ${statusIcon}`, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        }).setOrigin(0.5);

        // Close button
        const closeBtn = this.add.text(modalWidth / 2 - 15, -modalHeight / 2 + 15, '✕', {
            fontSize: '16px',
            color: '#FF5722',
            resolution: 2
        }).setOrigin(0.5);
        closeBtn.setInteractive({ useHandCursor: true });
        closeBtn.on('pointerdown', () => this.closeChatModal());

        // Chat history area background
        const historyBgHeight = 150;
        const historyBgY = -20;
        const historyBg = this.add.rectangle(0, historyBgY, modalWidth - 20, historyBgHeight, 0x2D2D2D, 0.8);
        historyBg.setStrokeStyle(1, 0x5D4037);

        // Chat history text - show last 10 messages (newest at bottom)
        const displayMessages = this.chatHistory.slice(-10).map(msg => {
            const shortName = msg.username.length > 9
                ? msg.username.substring(0, 9) + '...'
                : msg.username;
            const scopeIcon = msg.scope === 'GLOBAL' ? '🌐' : '📍';
            return `${scopeIcon} ${shortName}: ${msg.message}`;
        });

        // Position text inside history area
        const textX = -modalWidth / 2 + 20;
        const textY = historyBgY - historyBgHeight / 2 + 8;

        this.chatHistoryText = this.add.text(textX, textY, displayMessages.join('\n'), {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2,
            wordWrap: { width: modalWidth - 45 },
            lineSpacing: 4
        });

        // Send button
        const sendBtn = this.add.rectangle(modalWidth / 2 - 40, modalHeight / 2 - 40, 50, 25, 0x4CAF50, 1);
        sendBtn.setStrokeStyle(1, 0x2E7D32);
        const sendText = this.add.text(modalWidth / 2 - 40, modalHeight / 2 - 40, 'Send', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        }).setOrigin(0.5);

        sendBtn.setInteractive({ useHandCursor: true });
        sendBtn.on('pointerover', () => sendBtn.setFillStyle(0x66BB6A, 1));
        sendBtn.on('pointerout', () => sendBtn.setFillStyle(0x4CAF50, 1));
        sendBtn.on('pointerdown', () => this.sendChatMessage());

        this.chatModal.add([bg, title, closeBtn, historyBg, this.chatHistoryText, sendBtn, sendText]);
        this.cameras.main?.ignore(this.chatModal);

        // Create HTML input element
        this.createChatInput(modalX, modalY, modalWidth, modalHeight);
    }

    /**
     * Create HTML input for chat (positioned using canvas scale calculations)
     */
    private createChatInput(modalX: number, modalY: number, modalWidth: number, modalHeight: number) {
        // Remove existing input if any
        if (this.chatInputElement) {
            this.chatInputElement.remove();
            this.chatInputElement = null;
        }

        // Get canvas rect and calculate scale factor
        const canvas = this.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();

        // Game dimensions vs actual canvas dimensions
        const gameWidth = this.scale.width;  // 960
        const gameHeight = this.scale.height; // 540
        const scaleX = canvasRect.width / gameWidth;
        const scaleY = canvasRect.height / gameHeight;

        // Send button is at x = modalWidth/2 - 40 from modal center, width 50
        // Input should be to the left of send button with 5px gap
        const sendButtonWidth = 50;
        const gap = 5;
        const inputWidthGame = modalWidth - 20 - sendButtonWidth - gap; // in game units

        // Calculate input position in game coordinates (relative to modal center)
        const inputOffsetX = -modalWidth / 2 + 10; // left edge of input from modal center
        const inputOffsetY = modalHeight / 2 - 40; // same Y as send button

        // Convert to screen coordinates
        const inputX = canvasRect.left + (modalX + inputOffsetX) * scaleX;
        const inputY = canvasRect.top + (modalY + inputOffsetY) * scaleY - (25 * scaleY / 2); // center vertically
        const inputWidth = inputWidthGame * scaleX;
        const inputHeight = 25 * scaleY;

        // Create HTML input
        this.chatInputElement = document.createElement('input');
        this.chatInputElement.type = 'text';
        this.chatInputElement.placeholder = 'Text your message...';
        this.chatInputElement.maxLength = 100;
        this.chatInputElement.style.cssText = `
            position: fixed;
            left: ${inputX}px;
            top: ${inputY}px;
            width: ${inputWidth}px;
            height: ${inputHeight}px;
            padding: 4px 8px;
            font-family: 'PixelFont', Arial, sans-serif;
            font-size: ${12 * scaleY}px;
            background: #1A1A1A;
            color: #FFFFFF;
            border: 1px solid #5D4037;
            border-radius: 4px;
            outline: none;
            z-index: 1000;
            box-sizing: border-box;
        `;

        // Handle Enter key
        this.chatInputElement.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // Add to DOM
        document.body.appendChild(this.chatInputElement);
        this.chatInputElement.focus();

        // Listen to resize to reposition
        this.scale.on('resize', this.repositionChatInput, this);
    }

    /**
     * Reposition chat input when screen resizes
     */
    private repositionChatInput() {
        if (!this.chatInputElement || !this.chatModalOpen) return;

        const canvas = this.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();

        const gameWidth = this.scale.width;
        const gameHeight = this.scale.height;
        const scaleX = canvasRect.width / gameWidth;
        const scaleY = canvasRect.height / gameHeight;

        const modalWidth = 300;
        const modalHeight = 250;
        const modalX = gameWidth / 2;
        const modalY = gameHeight / 2;

        const sendButtonWidth = 50;
        const gap = 5;
        const inputWidthGame = modalWidth - 20 - sendButtonWidth - gap;

        const inputOffsetX = -modalWidth / 2 + 10;
        const inputOffsetY = modalHeight / 2 - 40;

        const inputX = canvasRect.left + (modalX + inputOffsetX) * scaleX;
        const inputY = canvasRect.top + (modalY + inputOffsetY) * scaleY - (25 * scaleY / 2);
        const inputWidth = inputWidthGame * scaleX;
        const inputHeight = 25 * scaleY;

        this.chatInputElement.style.left = `${inputX}px`;
        this.chatInputElement.style.top = `${inputY}px`;
        this.chatInputElement.style.width = `${inputWidth}px`;
        this.chatInputElement.style.height = `${inputHeight}px`;
        this.chatInputElement.style.fontSize = `${12 * scaleY}px`;
    }

    /**
     * Send chat message via WebSocket (global chat)
     */
    private sendChatMessage() {
        if (!this.chatInputElement) return;

        const message = this.chatInputElement.value.trim();
        if (!message) return;

        // Check if connected to lobby
        if (!this.lobbySocketService?.isConnected()) {
            this.showToastMessage('Not connected to chat server', 0xFF5722);
            return;
        }

        // Send via WebSocket (fire-and-forget)
        // Server will broadcast back via 'lobby_chat' event
        console.log('💬 [TownSquare] Sending global chat:', message);
        this.lobbySocketService.chatGlobal(message);

        // Clear input
        this.chatInputElement.value = '';
        this.chatInputElement.focus();

        // Note: Message will appear in chat history when server broadcasts it back
        // This ensures consistency - we only show messages confirmed by server
    }

    /**
     * Close chat modal
     */
    private closeChatModal() {
        // Remove resize listener
        this.scale.off('resize', this.repositionChatInput, this);

        // Remove HTML input
        if (this.chatInputElement) {
            this.chatInputElement.remove();
            this.chatInputElement = null;
        }

        // Destroy overlay
        if (this.chatModalOverlay) {
            this.chatModalOverlay.destroy();
            this.chatModalOverlay = null;
        }

        if (this.chatModal) {
            this.chatModal.destroy();
            this.chatModalOpen = false;
        }

        this.chatHistoryText = null;
    }

    /**
     * Show speech bubble with scrolling text above player
     */
    private showSpeechBubble(message: string) {
        // Remove existing bubble and tween
        if (this.speechBubble) {
            this.speechBubble.destroy(true);
            this.speechBubble = null;
        }

        const bubbleWidth = 50;
        const bubbleHeight = 14;
        const padding = 3;

        // Create bubble container at player position
        this.speechBubble = this.add.container(this.player.x, this.player.y - 24);
        this.speechBubble.setDepth(this.player.y + 50);

        // IMPORTANT: Ignore by UI camera to prevent duplicate rendering
        this.uiCamera.ignore(this.speechBubble);

        // Draw bubble directly with graphics (added to container, not scene)
        const bubbleGraphics = new Phaser.GameObjects.Graphics(this);
        bubbleGraphics.fillStyle(0xFFFFFF, 1);
        bubbleGraphics.lineStyle(1, 0x555555, 1);

        // Rounded rectangle centered at 0,0
        bubbleGraphics.fillRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);
        bubbleGraphics.strokeRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);

        // Speech bubble tail (small triangle pointing down)
        bubbleGraphics.fillStyle(0xFFFFFF, 1);
        bubbleGraphics.fillTriangle(-2, bubbleHeight / 2 - 1, 2, bubbleHeight / 2 - 1, 0, bubbleHeight / 2 + 3);
        bubbleGraphics.lineStyle(1, 0x555555, 1);
        bubbleGraphics.lineBetween(-2, bubbleHeight / 2, 0, bubbleHeight / 2 + 3);
        bubbleGraphics.lineBetween(2, bubbleHeight / 2, 0, bubbleHeight / 2 + 3);

        // Create scrolling text
        const textContent = new Phaser.GameObjects.Text(this, bubbleWidth / 2 - padding, -1, message, {
            fontSize: '5px',
            fontFamily: 'PixelFont',
            color: '#000000',
            resolution: 2
        });
        textContent.setOrigin(0, 0.5);

        // Add elements to container only (not to scene display list)
        this.speechBubble.add([bubbleGraphics, textContent]);

        // Create mask for text clipping (world coordinates)
        // Use make.graphics to NOT add to display list (avoids ghost at origin)
        const maskGraphics = this.make.graphics({ add: false } as Phaser.Types.GameObjects.Graphics.Options);
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(
            this.player.x - bubbleWidth / 2 + padding,
            this.player.y - 24 - bubbleHeight / 2 + 1,
            bubbleWidth - padding * 2,
            bubbleHeight - 2
        );
        const mask = maskGraphics.createGeometryMask();
        textContent.setMask(mask);

        // Update mask position when bubble moves
        const updateMaskPosition = () => {
            if (!this.speechBubble) return;
            maskGraphics.clear();
            maskGraphics.fillStyle(0xffffff);
            maskGraphics.fillRect(
                this.speechBubble.x - bubbleWidth / 2 + padding,
                this.speechBubble.y - bubbleHeight / 2 + 1,
                bubbleWidth - padding * 2,
                bubbleHeight - 2
            );
        };

        // Animate text scrolling from right to left
        const textWidth = textContent.width;
        const endX = -bubbleWidth / 2 - textWidth;
        const duration = Math.min(Math.max(textWidth * 100, 2000), 8000);

        this.tweens.add({
            targets: textContent,
            x: endX,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => updateMaskPosition(),
            onComplete: () => {
                maskGraphics.destroy();
                if (this.speechBubble) {
                    this.speechBubble.destroy(true);
                    this.speechBubble = null;
                }
            }
        });
    }

    /**
     * Show speech bubble with scrolling text above another player
     */
    private showOtherPlayerSpeechBubble(userId: string, message: string) {
        const player = this.otherPlayers.get(userId);
        if (!player) {
            console.log(`⚠️ [TownSquare] Cannot show speech bubble - player ${userId} not found`);
            return;
        }

        // Remove existing bubble for this player
        if (player.speechBubble) {
            player.speechBubble.destroy(true);
            player.speechBubble = null;
        }

        const bubbleWidth = 50;
        const bubbleHeight = 14;
        const padding = 3;

        // Create bubble container at player sprite position
        const bubble = this.add.container(player.sprite.x, player.sprite.y - 24);
        bubble.setDepth(player.sprite.y + 50);

        // IMPORTANT: Ignore by UI camera to prevent duplicate rendering
        if (this.uiCamera) {
            this.uiCamera.ignore(bubble);
        }

        // Draw bubble directly with graphics
        const bubbleGraphics = new Phaser.GameObjects.Graphics(this);
        bubbleGraphics.fillStyle(0xFFFFFF, 1);
        bubbleGraphics.lineStyle(1, 0x555555, 1);

        // Rounded rectangle centered at 0,0
        bubbleGraphics.fillRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);
        bubbleGraphics.strokeRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);

        // Speech bubble tail (small triangle pointing down)
        bubbleGraphics.fillStyle(0xFFFFFF, 1);
        bubbleGraphics.fillTriangle(-2, bubbleHeight / 2 - 1, 2, bubbleHeight / 2 - 1, 0, bubbleHeight / 2 + 3);
        bubbleGraphics.lineStyle(1, 0x555555, 1);
        bubbleGraphics.lineBetween(-2, bubbleHeight / 2, 0, bubbleHeight / 2 + 3);
        bubbleGraphics.lineBetween(2, bubbleHeight / 2, 0, bubbleHeight / 2 + 3);

        // Create scrolling text
        const textContent = new Phaser.GameObjects.Text(this, bubbleWidth / 2 - padding, -1, message, {
            fontSize: '5px',
            fontFamily: 'PixelFont',
            color: '#000000',
            resolution: 2
        });
        textContent.setOrigin(0, 0.5);

        // Add elements to container
        bubble.add([bubbleGraphics, textContent]);

        // Create mask for text clipping
        const maskGraphics = this.make.graphics({ add: false } as Phaser.Types.GameObjects.Graphics.Options);
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(
            player.sprite.x - bubbleWidth / 2 + padding,
            player.sprite.y - 24 - bubbleHeight / 2 + 1,
            bubbleWidth - padding * 2,
            bubbleHeight - 2
        );
        const mask = maskGraphics.createGeometryMask();
        textContent.setMask(mask);

        // Store reference to bubble
        player.speechBubble = bubble;

        // Update mask position when bubble moves (follows player)
        const updateMaskPosition = () => {
            const p = this.otherPlayers.get(userId);
            if (!p || !p.speechBubble) return;

            // Update bubble position to follow player
            p.speechBubble.x = p.sprite.x;
            p.speechBubble.y = p.sprite.y - 24;
            p.speechBubble.setDepth(p.sprite.y + 50);

            maskGraphics.clear();
            maskGraphics.fillStyle(0xffffff);
            maskGraphics.fillRect(
                p.speechBubble.x - bubbleWidth / 2 + padding,
                p.speechBubble.y - bubbleHeight / 2 + 1,
                bubbleWidth - padding * 2,
                bubbleHeight - 2
            );
        };

        // Animate text scrolling from right to left
        const textWidth = textContent.width;
        const endX = -bubbleWidth / 2 - textWidth;
        const duration = Math.min(Math.max(textWidth * 100, 2000), 8000);

        this.tweens.add({
            targets: textContent,
            x: endX,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => updateMaskPosition(),
            onComplete: () => {
                maskGraphics.destroy();
                const p = this.otherPlayers.get(userId);
                if (p && p.speechBubble) {
                    p.speechBubble.destroy(true);
                    p.speechBubble = null;
                }
            }
        });
    }
}
