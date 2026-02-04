import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { TOWN_SQUARE_MAP_DATA, TOWN_SQUARE_MAP_WIDTH, TOWN_SQUARE_MAP_HEIGHT } from './TownSquareMapData';
import { SoundManager, StationManager, NavigationData, ProfileManager, ToolbarManager, ToolbarItem, PlantType, ShopManager, FactoryManager, GAME_CONSTANTS, PetManager, GameHouseManager, MangaStudioManager } from '../managers';
import { GameDataService } from '../GameDataService';
import { UserService } from '../UserService';
import { LobbySocketService } from '../LobbySocketService';
import { LobbyChatPayload, UserLobbyState, LobbyStatePayload, UserJoinedPayload, UserLeftPayload, UserMovedPayload } from '../types/LobbyTypes';
import { useGameState } from '../hooks/useGameState';
import { CHARACTER_KEYS, PLAYABLE_CHARACTERS, DEFAULT_CHARACTER, getNextCharacterKey, getCharacterByKey } from '../config/CharacterConfig';
import { DynamicShadow } from '../objects/DynamicShadow';

/**
 * Town Square Scene - A larger public space for social interactions
 * Uses water tileset for borders and square tileset for stone floor
 */
export class TownSquare extends Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private playerShadow!: DynamicShadow;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

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

    // Player movement speed (can be adjusted via buffs/items)
    private playerSpeed: number = 64; // Base speed (reduced 20% from 80)

    // Speech bubble text scroll speed (ms per pixel width)
    // Higher = slower scroll. Original: 100, Current: 140 (30% slower)
    private readonly BUBBLE_SCROLL_SPEED = 140;
    private readonly BUBBLE_MIN_DURATION = 2800;  // Minimum display time (ms)
    private readonly BUBBLE_MAX_DURATION = 11200; // Maximum display time (ms)

    // Station for travel (using StationManager)
    private stationManager!: StationManager;

    // Sound manager
    private soundManager!: SoundManager;

    // Profile manager
    private profileManager!: ProfileManager;

    // Toolbar manager
    private toolbarManager!: ToolbarManager;
    private selectedToolIndex: number = 0;

    // Shop manager
    private shopManager!: ShopManager;
    private shopModalOpen: boolean = false;

    // Factory manager
    private factoryManager!: FactoryManager;

    // Pet manager
    private petManager!: PetManager;

    // Merlin NPCs
    private merlins: Array<{
        sprite: Phaser.GameObjects.Sprite;
        shadow: DynamicShadow;
        name: string;
        label: Phaser.GameObjects.Container | null;
        id: string;
    }> = [];
    private readonly MERLIN_LABEL_DISTANCE = 80;

    // Game house manager
    private gameHouseManager!: GameHouseManager;

    // Manga studio manager
    private mangaStudioManager!: MangaStudioManager;
    private fountainSprite!: Phaser.GameObjects.Sprite;

    // Toolbar items (same as FarmingGame)
    private toolbarItems: ToolbarItem[] = [
        { type: 'tool', name: 'hand' },
        { type: 'tool', name: 'wateringCan', count: 0 },
        { type: 'seed', name: 'seed' },
        { type: 'tool', name: 'fertilizer' },
        { type: 'tool', name: 'digest' },
        { type: 'tool', name: 'chest' },
    ];

    // Inventory states (loaded from cache in initializeGameState)
    private seedCounts: Record<PlantType, number> = { algae: 0, mushroom: 0, tree: 0 };
    private fertilizerCounts: Record<'common' | 'rare' | 'epic' | 'legendary', number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    private chestInventory: { type: PlantType; count: number }[] = [];
    private chestOpen: boolean = false;
    private selectedSeedIndex: number = 0;
    private selectedFertilizerIndex: number = 0;

    // Clock UI
    private timeText!: Phaser.GameObjects.Text;

    // Marquee UI
    private marqueeText!: Phaser.GameObjects.Text;

    // Mini Map UI
    private miniMapContainer!: Phaser.GameObjects.Container;
    private miniMapPlayerAvatar!: Phaser.GameObjects.Image;
    private readonly MINIMAP_SIZE = 80; // Size of mini map in pixels
    private readonly MINIMAP_SCALE: number = 80 / (60 * 16); // minimap size / map world size

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

    // Chat cooldown (prevent spam)
    private readonly CHAT_COOLDOWN_MS = 10000; // 10 seconds cooldown
    private lastChatTime: number = 0;

    // Lobby WebSocket service
    private lobbySocketService!: LobbySocketService;


    // Multiplayer - other players
    private otherPlayers: Map<string, {
        sprite: Phaser.GameObjects.Sprite;
        shadow: DynamicShadow;
        nameText: Phaser.GameObjects.Text;
        speechBubble: Phaser.GameObjects.Container | null;
        targetX: number;
        targetY: number;
        lastX: number;
        lastY: number;
        isMoving: boolean;
        characterKey: string;
    }> = new Map();
    private lastPositionSent: { x: number; y: number; time: number } = { x: 0, y: 0, time: 0 };
    private readonly POSITION_SEND_THROTTLE = 100; // ms between position updates
    private readonly POSITION_CHANGE_THRESHOLD = 2; // minimum distance to trigger update

    // Navigation data (from station travel)
    private navigationData: NavigationData | null = null;

    // Character switching (uses CharacterConfig)
    private currentCharacterKey: string = DEFAULT_CHARACTER;
    private pKey!: Phaser.Input.Keyboard.Key;

    // House colliders for collision with player
    private houseColliders: Phaser.GameObjects.Rectangle[] = [];

    // House info for proximity labels
    private houses: Array<{
        id: number;
        x: number;
        y: number;
        name: string;
        label: Phaser.GameObjects.Text | null;
    }> = [];
    private readonly HOUSE_LABEL_DISTANCE = 70; // pixels

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

        // Setup house collisions (must be after player is created)
        this.setupHouseCollisions();

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

        // Create mini map below clock
        this.createMiniMap();

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

        // Create shop manager (near fountain, right side)
        const gameState = useGameState(this);
        this.shopManager = new ShopManager(this, {
            getPlayerGold: () => gameState.getGold(),
            setPlayerGold: (value) => { gameState.setGold(value); },
            getPlayerGems: () => gameState.getGem(),
            setPlayerGems: (value) => { gameState.setGem(value); },
            getSeedCounts: () => this.seedCounts,
            getChestInventory: () => this.chestInventory,
            setChestInventory: (inv) => { this.chestInventory = inv; },
            getToolbarItems: () => this.toolbarItems,
            playSuccessSound: () => this.soundManager.playSuccessSound()
        });
        // Position shop at right side of fountain (tile 42, 32)
        this.shopManager.createShopAt(42 * this.TILE_SIZE, 32 * this.TILE_SIZE);

        // Create factory manager (above the shop)
        this.factoryManager = new FactoryManager(this, {
            getChestInventory: () => this.chestInventory,
            getPlayer: () => this.player,
            closeSeedSelector: () => { }, // Not used in TownSquare
            closeChestPanel: () => { }, // Not used in TownSquare
            showToastMessage: (text, color) => this.showToastMessage(text, color),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        }, this.TILE_SIZE);
        // Position factory above shop (tile 42, 28)
        this.factoryManager.createFactory(42 * this.TILE_SIZE, 28 * this.TILE_SIZE);

        // Create pet manager
        this.petManager = new PetManager(this, {
            getPlayer: () => this.player,
            getUICamera: () => this.uiCamera
        });

        // Create game house manager
        this.gameHouseManager = new GameHouseManager(this, {
            showToastMessage: (text, color) => this.showToastMessage(text, color)
        });

        // Create manga studio manager
        this.mangaStudioManager = new MangaStudioManager(this, {
            showToastMessage: (text, color) => this.showToastMessage(text, color)
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

        // Listen for game data updates (from mission claims, etc.)
        EventBus.on('gamedata:updated', this.onGameDataUpdated, this);

        // Handle resize
        this.scale.on('resize', this.onResize, this);

        // Play theme music
        this.soundManager.playRandomTheme();

        this.events.on('postupdate', this.updatePlayerUI, this);

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
            return;
        }

        // Create ground layer
        this.groundLayer = this.map.createBlankLayer('Ground', squareTiles) as Phaser.Tilemaps.TilemapLayer;

        if (!this.groundLayer) {
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

        // Create Merlin NPCs in front of fountain
        this.createMerlinNPCs();

        // Add trees, lamps, and chairs based on reference layout
        this.createTrees();
        this.createLamps();
        this.createChairs();

        // Add interactive houses around the square
        this.createHouses();
    }

    private createDecoration(key: string, tileX: number, tileY: number, scale: number = 0.5): Phaser.GameObjects.Image {
        const x = tileX * this.TILE_SIZE;
        const y = tileY * this.TILE_SIZE;
        const decoration = this.add.image(x, y, key);
        decoration.setOrigin(0.5, 0.85);  // Bottom-center origin for depth sorting
        decoration.setScale(scale);
        decoration.setDepth(y);

        // Add shadow for decoration
        new DynamicShadow(this, decoration, 0, 0);

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

    /**
     * Create interactive houses around the town square
     * Layout based on reference image:
     * Top row: 6, 7, 8, 9
     * Left side: 5, 4
     * Right side: 10, 11
     * Bottom row: 3, 2, 1, 12
     */
    private createHouses() {
        // House positions based on the layout diagram
        // Map is 60x60 tiles, stone area from tile 8-52
        const housePositions: { id: number; x: number; y: number }[] = [
            // Top row (y around 10-11)
            { id: 6, x: 14, y: 10 },
            { id: 7, x: 24, y: 10 },
            { id: 8, x: 36, y: 10 },
            { id: 9, x: 46, y: 10 },

            // Left side (x moved right to stay inside map)
            { id: 5, x: 12, y: 24 },
            { id: 4, x: 12, y: 40 },

            // Right side (x moved left to stay inside map)
            { id: 10, x: 48, y: 24 },
            { id: 11, x: 48, y: 40 },

            // Bottom row (y around 50)
            { id: 3, x: 14, y: 50 },
            { id: 2, x: 26, y: 50 },
            { id: 1, x: 38, y: 50 },
            { id: 12, x: 48, y: 50 },
        ];

        housePositions.forEach(({ id, x, y }) => {
            this.createInteractiveHouse(id, x, y);
        });
    }

    /**
     * Create a single interactive house with collision
     */
    private createInteractiveHouse(houseId: number, tileX: number, tileY: number) {
        const x = tileX * this.TILE_SIZE;
        const y = tileY * this.TILE_SIZE;
        const scale = 0.3; // x2 size (was 0.15)

        // House names
        const houseNames: Record<number, string> = {
            1: '🎮 Arcade',
            2: '🎨 Manga Studio',
            3: 'Dog House',
            4: 'Bird House',
            5: 'Fish House',
            6: 'Rabbit House',
            7: 'Hamster House',
            8: 'Turtle House',
            9: 'Snake House',
            10: 'Frog House',
            11: 'Lizard House',
            12: 'Spider House'
        };

        const house = this.add.image(x, y, `house-${houseId}`);
        house.setOrigin(0.5, 0.85); // Bottom-center origin for depth sorting
        house.setScale(scale);
        house.setDepth(y);

        // Add shadow for house
        new DynamicShadow(this, house, 0, 0);

        // Store house info for proximity labels
        this.houses.push({
            id: houseId,
            x: x,
            y: y - house.displayHeight / 2, // Center of house
            name: houseNames[houseId] || `House ${houseId}`,
            label: null
        });

        // Create collision body for the base of the house (invisible)
        const collisionWidth = house.displayWidth * 0.6;
        const collisionHeight = house.displayHeight * 0.25;
        const collisionY = y - collisionHeight / 2 - 20;

        const collider = this.add.rectangle(x, collisionY, collisionWidth, collisionHeight);
        collider.setVisible(false); // Hide the collision rectangle
        this.physics.add.existing(collider, true); // true = static body
        this.houseColliders.push(collider);

        // Make interactive
        house.setInteractive({ useHandCursor: true });

        // Hover effects
        house.on('pointerover', () => {
            house.setTint(0xffffaa);
            this.tweens.add({
                targets: house,
                scaleX: scale * 1.05,
                scaleY: scale * 1.05,
                duration: 100,
                ease: 'Quad.easeOut'
            });
        });

        house.on('pointerout', () => {
            house.clearTint();
            this.tweens.add({
                targets: house,
                scaleX: scale,
                scaleY: scale,
                duration: 100,
                ease: 'Quad.easeIn'
            });
        });

        // Click handler - house #1 (Mouse House) opens game modal, house #2 (Cat House) opens manga studio
        house.on('pointerdown', () => {
            if (houseId === 1) {
                // House #1 - Arcade: Mini Games
                this.gameHouseManager.openGameModal(houseId);
            } else if (houseId === 2) {
                // House #2 - Manga Studio
                this.mangaStudioManager.openModal();
            } else {
                // Other houses: Coming soon
                this.showToastMessage(`Coming soon...`, 0xf59e0b);
            }
        });
    }

    /**
     * Setup collision between player and house colliders
     * Must be called after player is created
     */
    private setupHouseCollisions() {
        this.houseColliders.forEach(collider => {
            this.physics.add.collider(this.player, collider);
        });
    }

    /**
     * Update house labels based on player proximity
     */
    private updateHouseLabels() {
        if (!this.player) return;

        const playerX = this.player.x;
        const playerY = this.player.y;

        this.houses.forEach(house => {
            const distance = Phaser.Math.Distance.Between(playerX, playerY, house.x, house.y);
            
            if (distance < this.HOUSE_LABEL_DISTANCE) {
                // Player is near - show label
                if (!house.label) {
                    // Create bubble style label (similar to chat speech bubble)
                    const container = this.add.container(house.x, house.y - 30);
                    
                    // Measure text first
                    const tempText = this.add.text(0, 0, house.name, {
                        fontSize: '6px',
                        fontFamily: 'PixelFont',
                        color: '#000000',
                        resolution: 2
                    });
                    const textWidth = tempText.width;
                    const textHeight = tempText.height;
                    tempText.destroy();
                    
                    const bubbleWidth = textWidth + 8;
                    const bubbleHeight = textHeight + 6;
                    
                    // Draw bubble background
                    const bubbleGraphics = new Phaser.GameObjects.Graphics(this);
                    bubbleGraphics.fillStyle(0xFFFFFF, 1);
                    bubbleGraphics.lineStyle(1, 0x555555, 1);
                    bubbleGraphics.fillRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);
                    bubbleGraphics.strokeRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);
                    
                    // Speech bubble tail
                    bubbleGraphics.fillStyle(0xFFFFFF, 1);
                    bubbleGraphics.fillTriangle(-3, bubbleHeight / 2 - 1, 3, bubbleHeight / 2 - 1, 0, bubbleHeight / 2 + 4);
                    bubbleGraphics.lineStyle(1, 0x555555, 1);
                    bubbleGraphics.lineBetween(-3, bubbleHeight / 2, 0, bubbleHeight / 2 + 4);
                    bubbleGraphics.lineBetween(3, bubbleHeight / 2, 0, bubbleHeight / 2 + 4);
                    
                    // Text
                    const textObj = new Phaser.GameObjects.Text(this, 0, 0, house.name, {
                        fontSize: '6px',
                        fontFamily: 'PixelFont',
                        color: '#000000',
                        resolution: 2
                    });
                    textObj.setOrigin(0.5);
                    
                    container.add([bubbleGraphics, textObj]);
                    container.setDepth(house.y + 100);
                    
                    // Ignore by UI camera
                    if (this.uiCamera) {
                        this.uiCamera.ignore(container);
                    }
                    
                    // Store as any since we're using container
                    house.label = container as unknown as Phaser.GameObjects.Text;
                    
                    // Fade in
                    container.setAlpha(0);
                    this.tweens.add({
                        targets: container,
                        alpha: 1,
                        duration: 150,
                        ease: 'Quad.easeOut'
                    });
                }
            } else {
                // Player is far - hide label
                if (house.label) {
                    const labelToRemove = house.label;
                    house.label = null;
                    
                    // Fade out and destroy
                    this.tweens.add({
                        targets: labelToRemove,
                        alpha: 0,
                        duration: 150,
                        ease: 'Quad.easeIn',
                        onComplete: () => labelToRemove.destroy()
                    });
                }
            }
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
        this.fountainSprite = this.add.sprite(centerX, centerY, 'fountain', 0);
        this.fountainSprite.setOrigin(0.5, 0.7);
        const frameW = 136;
        const frameH = 236;
        const desiredTilesWide = 4;
        const scaleMultiplier = 1.4;
        const displayW = Math.round(desiredTilesWide * this.TILE_SIZE * scaleMultiplier);
        const displayH = Math.round(displayW * frameH / frameW);
        this.fountainSprite.setDisplaySize(displayW, displayH);
        this.fountainSprite.setDepth(centerY);
        this.fountainSprite.play('fountain-anim');
    }

    private createMerlinNPCs() {
        const centerX = this.MAP_WIDTH / 2 * this.TILE_SIZE;
        const centerY = this.MAP_HEIGHT / 2 * this.TILE_SIZE;
        
        // Position in front of fountain (higher Y)
        // Fountain center is centerY. Fountain height is ~155px. Origin 0.7.
        // So bottom is roughly centerY + (1-0.7)*155 = centerY + 46.
        // We want NPCs in front of that.
        const npcY = centerY + 120; // Increased distance from fountain
        const spacing = 100; // Increased spacing

        // Create animations
        ['merlin1', 'merlin2'].forEach(key => {
            if (!this.anims.exists(`${key}-idle`)) {
                this.anims.create({
                    key: `${key}-idle`,
                    frames: this.anims.generateFrameNumbers(key, { start: 0, end: 1 }),
                    frameRate: 2,
                    repeat: -1
                });
            }
            if (!this.anims.exists(`${key}-active`)) {
                this.anims.create({
                    key: `${key}-active`,
                    frames: this.anims.generateFrameNumbers(key, { start: 2, end: 3 }),
                    frameRate: 4,
                    repeat: -1
                });
            }
        });

        // Clear existing merlins list
        this.merlins = [];

        // Merlin 1 (Astrology) - Left
        const merlin1 = this.add.sprite(centerX - spacing, npcY, 'merlin1');
        merlin1.setOrigin(0.5, 0.9); // Anchor at feet
        // Increase scale slightly (player is around 1.0 but small spritesheet, merlin is large spritesheet)
        // Player height on screen is ~40-50px. Merlin at 0.085 was ~40px. 
        // User wants "larger than player a bit".
        // Let's try 0.11 (approx 30% larger than 0.085)
        merlin1.setScale(0.11); 
        merlin1.setDepth(npcY);
        merlin1.play('merlin1-idle');
        merlin1.setInteractive({ useHandCursor: true });
        
        // Add DynamicShadow for Merlin 1
        const shadow1 = new DynamicShadow(this, merlin1, 0, 2);
        
        merlin1.on('pointerdown', () => {
            merlin1.play('merlin1-active');
            this.showToastMessage('Consulting the stars...', 0x9C27B0);
            this.time.delayedCall(3000, () => {
                merlin1.play('merlin1-idle');
            });
        });

        this.merlins.push({
            sprite: merlin1,
            shadow: shadow1,
            name: "I can see your future in the stars!\nClick to consult.",
            label: null,
            id: 'merlin1'
        });

        // Merlin 2 (Tarot) - Right
        const merlin2 = this.add.sprite(centerX + spacing, npcY, 'merlin2');
        merlin2.setOrigin(0.5, 0.9);
        merlin2.setScale(0.11); 
        merlin2.setDepth(npcY);
        merlin2.play('merlin2-idle');
        merlin2.setInteractive({ useHandCursor: true });

        // Add DynamicShadow for Merlin 2
        const shadow2 = new DynamicShadow(this, merlin2, 0, 2);

        merlin2.on('pointerdown', () => {
            merlin2.play('merlin2-active');
            this.showToastMessage('Reading the cards...', 0xE91E63);
            this.time.delayedCall(3000, () => {
                merlin2.play('merlin2-idle');
            });
        });

        this.merlins.push({
            sprite: merlin2,
            shadow: shadow2,
            name: "The cards reveal all truths.\nClick for a reading.",
            label: null,
            id: 'merlin2'
        });
    }

    private updateMerlinLabels() {
        if (!this.player) return;

        const playerX = this.player.x;
        const playerY = this.player.y;

        this.merlins.forEach(merlin => {
            const distance = Phaser.Math.Distance.Between(playerX, playerY, merlin.sprite.x, merlin.sprite.y);
            
            if (distance < this.MERLIN_LABEL_DISTANCE) {
                // Player is near - show label
                if (!merlin.label) {
                    // Create bubble style label (similar to chat speech bubble)
                    const container = this.add.container(merlin.sprite.x, merlin.sprite.y - 70); // Higher offset for larger sprite
                    
                    // Measure text first
                    const tempText = this.add.text(0, 0, merlin.name, {
                        fontSize: '6px',
                        fontFamily: 'PixelFont',
                        color: '#000000',
                        resolution: 2,
                        align: 'center'
                    });
                    const textWidth = tempText.width;
                    const textHeight = tempText.height;
                    tempText.destroy();
                    
                    const bubbleWidth = textWidth + 10;
                    const bubbleHeight = textHeight + 8;
                    
                    // Draw bubble background
                    const bubbleGraphics = new Phaser.GameObjects.Graphics(this);
                    bubbleGraphics.fillStyle(0xFFFFFF, 1);
                    bubbleGraphics.lineStyle(1, 0x555555, 1);
                    bubbleGraphics.fillRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);
                    bubbleGraphics.strokeRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 3);
                    
                    // Speech bubble tail
                    bubbleGraphics.fillStyle(0xFFFFFF, 1);
                    bubbleGraphics.fillTriangle(-3, bubbleHeight / 2 - 1, 3, bubbleHeight / 2 - 1, 0, bubbleHeight / 2 + 4);
                    bubbleGraphics.lineStyle(1, 0x555555, 1);
                    bubbleGraphics.lineBetween(-3, bubbleHeight / 2, 0, bubbleHeight / 2 + 4);
                    bubbleGraphics.lineBetween(3, bubbleHeight / 2, 0, bubbleHeight / 2 + 4);
                    
                    // Text
                    const textObj = new Phaser.GameObjects.Text(this, 0, 0, merlin.name, {
                        fontSize: '6px',
                        fontFamily: 'PixelFont',
                        color: '#000000',
                        resolution: 2,
                        align: 'center'
                    });
                    textObj.setOrigin(0.5);
                    
                    container.add([bubbleGraphics, textObj]);
                    container.setDepth(merlin.sprite.y + 100);
                    
                    // Ignore by UI camera
                    if (this.uiCamera) {
                        this.uiCamera.ignore(container);
                    }
                    
                    // Store as any since we're using container
                    merlin.label = container;
                    
                    // Fade in
                    container.setAlpha(0);
                    this.tweens.add({
                        targets: container,
                        alpha: 1,
                        duration: 150,
                        ease: 'Quad.easeOut'
                    });
                }
            } else {
                // Player is far - hide label
                if (merlin.label) {
                    const labelToRemove = merlin.label;
                    merlin.label = null;
                    
                    // Fade out and destroy
                    this.tweens.add({
                        targets: labelToRemove,
                        alpha: 0,
                        duration: 150,
                        ease: 'Quad.easeIn',
                        onComplete: () => labelToRemove.destroy()
                    });
                }
            }
        });
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

        // Get character type from user data (1-5, maps to index 0-4)
        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();
        const characterType = user?.characterType || 1;
        const characterIndex = Math.max(0, Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1));
        this.currentCharacterKey = PLAYABLE_CHARACTERS[characterIndex]?.key || DEFAULT_CHARACTER;


        // Create player with character from user data
        this.player = this.physics.add.sprite(startX, startY, this.currentCharacterKey, 0);
        this.player.setOrigin(GAME_CONSTANTS.CHARACTER_ORIGIN_X, GAME_CONSTANTS.CHARACTER_ORIGIN_Y);
        this.player.setScale(GAME_CONSTANTS.CHARACTER_SCALE); // Use shared character scale
        this.player.setCollideWorldBounds(false);
        this.player.setDepth(startY);

        // Create player shadow using DynamicShadow
        this.playerShadow = new DynamicShadow(this, this.player, 0, 2);

        // Create player animations for all characters
        this.createPlayerAnimations();

        this.player.play(`${this.currentCharacterKey}-idle-down`);

        // Create player name text above player (reuse cachedData from above)
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

        // Spritesheet layout for all characters (4x4 grid, 16 frames total):
        // Row 0 (frames 0-3): Down direction
        // Row 1 (frames 4-7): Up direction
        // Row 2 (frames 8-11): Left direction
        // Row 3 (frames 12-15): Right direction

        // Create animations for all characters from config
        PLAYABLE_CHARACTERS.forEach(char => {
            const charKey = char.key;
            // Skip if already created for this character
            if (this.anims.exists(`${charKey}-idle-down`)) return;

            // Idle front (down) - frames 0-1
            this.anims.create({
                key: `${charKey}-idle-down`,
                frames: this.anims.generateFrameNumbers(charKey, { start: 0, end: 1 }),
                frameRate: 2,
                repeat: -1
            });

            // Walk front (down) - frames 0-3
            this.anims.create({
                key: `${charKey}-walk-down`,
                frames: this.anims.generateFrameNumbers(charKey, { start: 0, end: 3 }),
                frameRate: frameRate,
                repeat: -1
            });

            // Idle back (up) - frames 4-5
            this.anims.create({
                key: `${charKey}-idle-up`,
                frames: this.anims.generateFrameNumbers(charKey, { start: 4, end: 5 }),
                frameRate: 2,
                repeat: -1
            });

            // Walk back (up) - frames 4-7
            this.anims.create({
                key: `${charKey}-walk-up`,
                frames: this.anims.generateFrameNumbers(charKey, { start: 4, end: 7 }),
                frameRate: frameRate,
                repeat: -1
            });

            // Idle left - frames 8-9
            this.anims.create({
                key: `${charKey}-idle-left`,
                frames: this.anims.generateFrameNumbers(charKey, { start: 8, end: 9 }),
                frameRate: 2,
                repeat: -1
            });

            // Walk left - frames 8-11
            this.anims.create({
                key: `${charKey}-walk-left`,
                frames: this.anims.generateFrameNumbers(charKey, { start: 8, end: 11 }),
                frameRate: frameRate,
                repeat: -1
            });

            // Idle right - frames 12-13
            this.anims.create({
                key: `${charKey}-idle-right`,
                frames: this.anims.generateFrameNumbers(charKey, { start: 12, end: 13 }),
                frameRate: 2,
                repeat: -1
            });

            // Walk right - frames 12-15
            this.anims.create({
                key: `${charKey}-walk-right`,
                frames: this.anims.generateFrameNumbers(charKey, { start: 12, end: 15 }),
                frameRate: frameRate,
                repeat: -1
            });
        });
    }

    /**
     * Switch to next character (P key)
     */
    private switchCharacter() {
        // Don't switch if chat modal is open (to allow typing P)
        if (this.chatModalOpen) return;

        // Cycle to next character using config helper
        this.currentCharacterKey = getNextCharacterKey(this.currentCharacterKey);
        const charDef = getCharacterByKey(this.currentCharacterKey);

        // Get current animation direction
        const currentAnim = this.player.anims.currentAnim?.key || '';
        let direction = 'down';
        if (currentAnim.includes('up')) direction = 'up';
        else if (currentAnim.includes('left')) direction = 'left';
        else if (currentAnim.includes('right')) direction = 'right';

        const isWalking = currentAnim.includes('walk');

        // Change sprite texture
        this.player.setTexture(this.currentCharacterKey, 0);

        // Play appropriate animation for new character
        const animType = isWalking ? 'walk' : 'idle';
        this.player.play(`${this.currentCharacterKey}-${animType}-${direction}`, true);

        // Show toast message with display name from config
        const displayName = charDef?.displayName || this.currentCharacterKey;
        this.showToastMessage(`Character: ${displayName}`, 0x9C27B0);
    }

    private setupControls() {
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();

            // P key to switch character
            this.pKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
            this.pKey.on('down', () => this.switchCharacter());

            // Enter key to open chat (only when chat is not already open)
            const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
            enterKey.on('down', () => {
                // Only open chat if not already open and not typing in input
                if (!this.chatModalOpen && document.activeElement?.tagName !== 'INPUT') {
                    this.openChatModal();
                }
            });

            // Escape key to close chat
            const escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
            escKey.on('down', () => {
                if (this.chatModalOpen) {
                    this.closeChatModal();
                }
            });

            // O key to cycle pet (Cat → Dino → Dragon → Lion)
            const keyO = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.O);
            keyO.on('down', () => {
                const petName = this.petManager.cyclePet();
                this.showToastMessage(`${petName} summoned!`, 0x8BC34A);
            });
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
        this.updateMiniMap();

        // Update pet position
        this.petManager?.update();

        // Multiplayer: send position and update other players
        this.sendPlayerPosition();
        this.updateOtherPlayers();

        // Update house proximity labels
        this.updateHouseLabels();
        
        // Update Merlin proximity labels
        this.updateMerlinLabels();
    }

    private handlePlayerMovement() {
        // Don't allow movement when any modal is open or input is focused
        const isAnyModalOpen = this.chatModalOpen ||
            this.profileManager?.getIsOpen() ||
            this.stationManager?.getIsOpen() ||
            this.shopManager?.getIsOpen() ||
            this.factoryManager?.getIsOpen() ||
            this.gameHouseManager?.getIsOpen() ||
            (this.chatInputElement && document.activeElement === this.chatInputElement);

        if (isAnyModalOpen) {
            this.player.setVelocity(0, 0);
            return;
        }

        const speed = this.playerSpeed;
        let velocityX = 0;
        let velocityY = 0;
        let direction = '';

        // Keyboard input (arrow keys only)
        if (this.cursors) {
            if (this.cursors.left.isDown) {
                velocityX = -speed;
                direction = 'left';
            } else if (this.cursors.right.isDown) {
                velocityX = speed;
                direction = 'right';
            }

            if (this.cursors.up.isDown) {
                velocityY = -speed;
                direction = 'up';
            } else if (this.cursors.down.isDown) {
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

        // Update animation using current character key
        if (velocityX !== 0 || velocityY !== 0) {
            this.player.play(`${this.currentCharacterKey}-walk-${direction || 'down'}`, true);
        } else {
            const currentAnim = this.player.anims.currentAnim?.key || '';
            if (currentAnim.includes('walk')) {
                // Extract direction from current animation (e.g., 'lion-walk-down' -> 'down')
                const dir = currentAnim.split('-').pop() || 'down';
                this.player.play(`${this.currentCharacterKey}-idle-${dir}`, true);
            }
        }

        // Update player depth based on Y position
        this.player.setDepth(this.player.y);

        // Constrain to land area
        this.constrainPlayerToLand();
    }

    private updatePlayerUI() {
        if (!this.player) return;

        // Shadow updates automatically via preUpdate

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
        const fountainCenterX = this.fountainSprite ? this.fountainSprite.x : this.MAP_WIDTH / 2 * this.TILE_SIZE;
        const fountainCenterY = this.fountainSprite ? this.fountainSprite.y : this.MAP_HEIGHT / 2 * this.TILE_SIZE;
        const displayW = this.fountainSprite ? this.fountainSprite.displayWidth : 67;
        const displayH = this.fountainSprite ? this.fountainSprite.displayHeight : 118;
        const fountainHalfWidth = displayW * 0.522;
        const fountainTop = fountainCenterY - displayH * 0.127;
        const fountainBottom = fountainCenterY + displayH * 0.297;

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

        // Load fruits into chestInventory from cached data
        if (cachedData.fruits && cachedData.fruits.length > 0) {
            this.chestInventory = [];
            for (const item of cachedData.fruits) {
                if (item.count > 0) {
                    this.chestInventory.push({
                        type: item.type,
                        count: item.count
                    });
                }
            }
        }

        // Load seeds from cached data (array of SeedInventoryItem)
        if (cachedData.seeds && Array.isArray(cachedData.seeds)) {
            this.seedCounts = { algae: 0, mushroom: 0, tree: 0 };
            for (const seed of cachedData.seeds) {
                const type = seed.type?.toLowerCase() as 'algae' | 'mushroom' | 'tree';
                if (type && this.seedCounts[type] !== undefined) {
                    this.seedCounts[type] += seed.quantity || 0;
                }
            }
        }

        // Load fertilizers from cached data (FertilizerInventoryResponse)
        if (cachedData.fertilizers?.fertilizers) {
            this.fertilizerCounts = { common: 0, rare: 0, epic: 0, legendary: 0 };
            for (const fert of cachedData.fertilizers.fertilizers) {
                // Map FERTILIZER_COMMON -> common, etc.
                const rarityMap: Record<string, 'common' | 'rare' | 'epic' | 'legendary'> = {
                    'FERTILIZER_COMMON': 'common',
                    'FERTILIZER_RARE': 'rare',
                    'FERTILIZER_EPIC': 'epic',
                    'FERTILIZER_LEGENDARY': 'legendary'
                };
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
                gem: cachedData.user?.balanceGem ?? cachedData.currencies?.gem ?? 0,
            },
            seeds: this.seedCounts,
            fertilizers: this.fertilizerCounts,
            fruits: cachedData.fruits || [],
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

    /**
     * Handle gamedata:updated event from EventBus
     * Refreshes UI when game data changes (e.g., after mission claim)
     */
    private onGameDataUpdated(): void {
        
        // Refresh profile UI (XP, reputation, currency)
        this.profileManager?.createProfileUI();
        
        // Refresh toolbar if needed
        this.toolbarManager?.updateToolbar();
        
    }

    /**
     * Called when scene is stopped (via scene.start or scene.stop)
     * CRITICAL: This is where cleanup must happen for scene transitions!
     */
    shutdown() {

        // Remove event listeners
        this.scale.off('resize', this.onResize, this);
        EventBus.off('gamedata:updated', this.onGameDataUpdated, this);
        this.events.off('postupdate', this.updatePlayerUI, this);

        // Cleanup managers
        this.soundManager?.destroy();
        this.stationManager?.destroy();
        this.profileManager?.destroy();
        this.toolbarManager?.destroy();
        this.shopManager?.destroy();
        this.factoryManager?.destroy();
        this.petManager?.destroy();
        this.gameHouseManager?.destroy();

        // Cleanup lobby socket - disconnect to prevent orphaned connections
        this.cleanupLobbySocketListeners();
        if (this.lobbySocketService) {
            this.lobbySocketService.disconnect();
        }

        // Stop all tweens to prevent memory leaks
        this.tweens.killAll();

        // Stop all time events
        this.time.removeAllEvents();
    }

    destroy() {
        // destroy() calls shutdown() implicitly in Phaser, but we call it explicitly for safety
        this.shutdown();
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
            player.shadow.destroy();
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

        // Send initial position immediately after connection
        // This ensures other players see us right away
        if (this.player) {
            this.time.delayedCall(100, () => {
                this.lobbySocketService?.move(this.player.x, this.player.y, 'square');
                this.lastPositionSent.x = this.player.x;
                this.lastPositionSent.y = this.player.y;
                this.lastPositionSent.time = Date.now();
            });
        }
    };

    /**
     * Handle lobby disconnected event
     */
    private handleLobbyDisconnected = (reason: string) => {
    };

    // ==========================================
    // Multiplayer Handlers
    // ==========================================

    /**
     * Handle initial lobby state - spawn all existing players
     */
    private handleLobbyState = (payload: LobbyStatePayload) => {

        const cachedData = GameDataService.getCachedData();
        const currentUserId = cachedData?.user?.id;

        // Clear existing players first (in case of reconnection)
        this.otherPlayers.forEach((player, id) => {
            player.sprite.destroy();
            player.shadow.destroy();
            player.nameText.destroy();
            this.otherPlayers.delete(id);
        });

        let createdCount = 0;
        payload.forEach((user) => {
            // Don't create sprite for self
            if (user.userId === currentUserId) {
                return;
            }

            this.createOtherPlayer(user);
            createdCount++;
        });

    };

    /**
     * Handle new user joined
     */
    private handleUserJoined = (payload: UserJoinedPayload) => {

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
            return;
        }

        // Get character key from characterType (1-5 maps to index 0-4)
        const characterType = user.characterType || 1;
        const characterIndex = Math.max(0, Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1));
        const characterKey = PLAYABLE_CHARACTERS[characterIndex]?.key || DEFAULT_CHARACTER;

        // Create sprite using character from user data
        const sprite = this.add.sprite(user.x, user.y, characterKey, 0);
        sprite.setOrigin(GAME_CONSTANTS.CHARACTER_ORIGIN_X, GAME_CONSTANTS.CHARACTER_ORIGIN_Y);
        sprite.setScale(GAME_CONSTANTS.CHARACTER_SCALE); // Use shared character scale
        sprite.setDepth(user.y); // Depth based on Y position for proper layering

        // Create shadow
        const shadow = new DynamicShadow(this, sprite, 0, 2);

        // Play idle animation with correct character
        if (this.anims.exists(`${characterKey}-idle-down`)) {
            sprite.play(`${characterKey}-idle-down`);
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
            this.uiCamera.ignore(shadow);
            this.uiCamera.ignore(nameText);
        }

        this.otherPlayers.set(user.userId, {
            sprite,
            shadow,
            nameText,
            speechBubble: null,
            targetX: user.x,
            targetY: user.y,
            lastX: user.x,
            lastY: user.y,
            isMoving: false,
            characterKey: characterKey
        });

    }

    /**
     * Remove another player's sprite
     */
    private removeOtherPlayer(userId: string) {
        const player = this.otherPlayers.get(userId);
        if (player) {
            player.sprite.destroy();
            player.shadow.destroy();
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
            const charKey = player.characterKey || DEFAULT_CHARACTER;

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

                // Play walk animation with correct character key
                const walkAnim = `${charKey}-walk-${direction}`;
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

                    const idleAnim = `${charKey}-idle-${idleDirection}`;
                    if (this.anims.exists(idleAnim)) {
                        player.sprite.play(idleAnim, true);
                    }
                }
            }

            // Update depth based on Y position for proper layering
            player.sprite.setDepth(player.sprite.y);
            player.nameText.setDepth(player.sprite.y + 1);

            // Shadow updates automatically via preUpdate

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
        // Apply same wrapping logic as initial display
        const maxMessageLength = 40; // Max chars per line before wrapping
        const displayMessages = this.chatHistory.slice(-10).map(msg => {
            const shortName = msg.username.length > 9
                ? msg.username.substring(0, 9) + '...'
                : msg.username;
            const scopeIcon = msg.scope === 'GLOBAL' ? '🌐' : '📍';
            const prefix = `${scopeIcon} ${shortName}: `;

            // Wrap long messages manually (insert newlines)
            let message = msg.message;
            if (message.length > maxMessageLength) {
                const wrappedLines: string[] = [];
                for (let i = 0; i < message.length; i += maxMessageLength) {
                    wrappedLines.push(message.substring(i, i + maxMessageLength));
                }
                // First line has prefix, subsequent lines are indented
                const indent = '     '; // Indent for continuation lines
                message = wrappedLines[0] + '\n' + wrappedLines.slice(1).map(line => indent + line).join('\n');
            }
            return `${prefix}${message}`;
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
     * Create mini map below the clock - uses actual map background
     */
    private createMiniMap() {
        const mapX = 20; // Align with clock
        const mapY = 50; // Below clock (clock is at y=25, height ~30)
        const mapSize = this.MINIMAP_SIZE;

        // Container for all mini map elements
        this.miniMapContainer = this.add.container(mapX, mapY);
        this.miniMapContainer.setDepth(5000);

        // Create RenderTexture for mini map background
        const rt = this.add.renderTexture(mapSize / 2, mapSize / 2, mapSize, mapSize);
        rt.setOrigin(0.5);

        // Draw water tile as background (tiled)
        const waterTileSize = mapSize / 6; // 6x6 grid of water tiles
        for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 6; x++) {
                const waterTile = this.add.image(0, 0, 'water-tileset', 0);
                waterTile.setDisplaySize(waterTileSize + 1, waterTileSize + 1);
                rt.draw(waterTile, x * waterTileSize + waterTileSize / 2, y * waterTileSize + waterTileSize / 2);
                waterTile.destroy();
            }
        }

        // Draw stone floor (center area - matching TOWN_SQUARE_MAP_DATA proportions)
        // Stone area is roughly from tile 8 to 52 (44 tiles out of 60)
        const stoneRatio = 44 / 60;
        const stoneSize = mapSize * stoneRatio;
        const stoneOffset = (mapSize - stoneSize) / 2;
        const stoneTileSize = stoneSize / 5; // 5x5 grid of stone tiles
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                const stoneTile = this.add.image(0, 0, 'square-tileset', 12); // Center floor tile
                stoneTile.setDisplaySize(stoneTileSize + 1, stoneTileSize + 1);
                rt.draw(stoneTile, stoneOffset + x * stoneTileSize + stoneTileSize / 2, stoneOffset + y * stoneTileSize + stoneTileSize / 2);
                stoneTile.destroy();
            }
        }

        this.miniMapContainer.add(rt);

        // Border frame around mini map
        const borderFrame = this.add.rectangle(mapSize / 2, mapSize / 2, mapSize, mapSize, 0x000000, 0);
        borderFrame.setStrokeStyle(2, 0x5D4037);
        this.miniMapContainer.add(borderFrame);

        // Key locations (convert tile coords to minimap coords)
        const tileToMiniMap = (tileX: number, tileY: number) => ({
            x: (tileX / this.MAP_WIDTH) * mapSize,
            y: (tileY / this.MAP_HEIGHT) * mapSize
        });

        // Emoji style config
        const emojiStyle = { fontSize: '10px', resolution: 2 };

        // Fountain (center) - water emoji
        const fountainPos = tileToMiniMap(30, 30);
        const fountain = this.add.text(fountainPos.x, fountainPos.y, '⛲', emojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(fountain);

        // Station (bến tàu) - ship emoji
        const stationPos = tileToMiniMap(6.5, 30);
        const station = this.add.text(stationPos.x, stationPos.y, '🚢', emojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(station);

        // Shop - cart emoji
        const shopPos = tileToMiniMap(42, 32);
        const shop = this.add.text(shopPos.x, shopPos.y, '🛒', emojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(shop);

        // Factory - factory emoji
        const factoryPos = tileToMiniMap(42, 28);
        const factory = this.add.text(factoryPos.x, factoryPos.y, '🏭', emojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(factory);

        // Houses - house emoji (smaller size for houses)
        const houseStyle = { fontSize: '6px', resolution: 2 };
        const housePositions = [
            // Top row
            { x: 16, y: 10 }, { x: 26, y: 10 }, { x: 36, y: 10 }, { x: 44, y: 10 },
            // Left side
            { x: 14, y: 24 }, { x: 14, y: 40 },
            // Right side
            { x: 46, y: 24 }, { x: 46, y: 40 },
            // Bottom row
            { x: 16, y: 50 }, { x: 26, y: 50 }, { x: 36, y: 50 }, { x: 44, y: 50 },
        ];
        housePositions.forEach(pos => {
            const housePos = tileToMiniMap(pos.x, pos.y);
            const house = this.add.text(housePos.x, housePos.y, '🏠', houseStyle).setOrigin(0.5);
            this.miniMapContainer.add(house);
        });

        // Player avatar (use character avatar image)
        const avatarKey = `${this.currentCharacterKey}-avatar`;
        this.miniMapPlayerAvatar = this.add.image(mapSize / 2, mapSize / 2, avatarKey);
        this.miniMapPlayerAvatar.setDisplaySize(12, 12); // Small circular avatar size
        this.miniMapPlayerAvatar.setOrigin(0.5);
        this.miniMapContainer.add(this.miniMapPlayerAvatar);

        // Ignore by main camera (UI element)
        this.cameras.main?.ignore(this.miniMapContainer);
    }

    /**
     * Update player position on mini map
     */
    private updateMiniMap() {
        if (!this.miniMapPlayerAvatar || !this.player) return;

        // Convert player world position to minimap position
        const mapWorldSize = this.MAP_WIDTH * this.TILE_SIZE;
        const miniMapX = (this.player.x / mapWorldSize) * this.MINIMAP_SIZE;
        const miniMapY = (this.player.y / mapWorldSize) * this.MINIMAP_SIZE;

        // Clamp to minimap bounds
        const clampedX = Phaser.Math.Clamp(miniMapX, 6, this.MINIMAP_SIZE - 6);
        const clampedY = Phaser.Math.Clamp(miniMapY, 6, this.MINIMAP_SIZE - 6);

        this.miniMapPlayerAvatar.setPosition(clampedX, clampedY);
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

        // Disable Phaser keyboard to allow Telex/IME input in HTML input
        if (this.input.keyboard) {
            this.input.keyboard.enabled = false;
        }

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
        // Limit message display to fit within chat area
        const maxMessageLength = 40; // Max chars per line before wrapping
        const displayMessages = this.chatHistory.slice(-10).map(msg => {
            const shortName = msg.username.length > 9
                ? msg.username.substring(0, 9) + '...'
                : msg.username;
            const scopeIcon = msg.scope === 'GLOBAL' ? '🌐' : '📍';
            const prefix = `${scopeIcon} ${shortName}: `;

            // Wrap long messages manually (insert newlines)
            let message = msg.message;
            if (message.length > maxMessageLength) {
                const wrappedLines: string[] = [];
                for (let i = 0; i < message.length; i += maxMessageLength) {
                    wrappedLines.push(message.substring(i, i + maxMessageLength));
                }
                // First line has prefix, subsequent lines are indented
                const indent = '     '; // Indent for continuation lines
                message = wrappedLines[0] + '\n' + wrappedLines.slice(1).map(line => indent + line).join('\n');
            }
            return `${prefix}${message}`;
        });

        // Position text inside history area
        const textX = -modalWidth / 2 + 20;
        const textY = historyBgY - historyBgHeight / 2 + 8;

        this.chatHistoryText = this.add.text(textX, textY, displayMessages.join('\n'), {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2,
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
     * Check if device is in portrait mode
     */
    private isPortraitMode(): boolean {
        return window.innerHeight > window.innerWidth;
    }

    /**
     * Create HTML input for chat (positioned using canvas scale calculations)
     * Handles portrait mode with CSS rotation
     */
    private createChatInput(modalX: number, modalY: number, modalWidth: number, modalHeight: number) {
        // Remove existing input if any
        if (this.chatInputElement) {
            this.chatInputElement.remove();
            this.chatInputElement = null;
        }

        // Game dimensions
        const gameWidth = this.scale.width;  // 960
        const gameHeight = this.scale.height; // 540

        // Send button is at x = modalWidth/2 - 40 from modal center, width 50
        // Input should be to the left of send button with 5px gap
        const sendButtonWidth = 50;
        const gap = 5;
        const inputWidthGame = modalWidth - 20 - sendButtonWidth - gap; // in game units
        const inputHeightGame = 25;

        // Calculate input center position in game coordinates
        const inputCenterX = modalX + (-modalWidth / 2 + 10) + inputWidthGame / 2;
        const inputCenterY = modalY + (modalHeight / 2 - 40);

        // Create HTML input
        this.chatInputElement = document.createElement('input');
        this.chatInputElement.type = 'text';
        this.chatInputElement.placeholder = 'Type your message...';
        this.chatInputElement.maxLength = 150;

        // Apply positioning based on orientation
        this.applyChatInputStyles(inputCenterX, inputCenterY, inputWidthGame, inputHeightGame, gameWidth, gameHeight);

        // Handle Enter key to send, Escape to close
        this.chatInputElement.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            } else if (e.key === 'Escape') {
                this.closeChatModal();
            }
        });

        // Add to DOM
        document.body.appendChild(this.chatInputElement);
        this.chatInputElement.focus();

        // Listen to resize to reposition
        this.scale.on('resize', this.repositionChatInput, this);
    }

    /**
     * Apply styles to chat input based on orientation
     */
    private applyChatInputStyles(
        gameCenterX: number,
        gameCenterY: number,
        gameWidth: number,
        gameHeight: number,
        totalGameWidth: number,
        totalGameHeight: number
    ) {
        if (!this.chatInputElement) return;

        const isPortrait = this.isPortraitMode();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (isPortrait) {
            // In portrait mode, the game is rotated 90deg clockwise via CSS
            // Game X -> Screen Y, Game Y -> Screen X (inverted)
            const scaleX = viewportHeight / totalGameWidth;
            const scaleY = viewportWidth / totalGameHeight;

            // Transform game coordinates to screen coordinates
            const screenX = viewportWidth - (gameCenterY / totalGameHeight) * viewportWidth;
            const screenY = (gameCenterX / totalGameWidth) * viewportHeight;

            // Dimensions are swapped due to 90deg rotation
            const screenWidth = gameWidth * scaleX;
            const screenHeight = gameHeight * scaleY;

            this.chatInputElement.style.cssText = `
                position: fixed;
                left: ${screenX}px;
                top: ${screenY}px;
                width: ${screenWidth}px;
                height: ${screenHeight}px;
                padding: 4px 8px;
                font-family: 'PixelFont', Arial, sans-serif;
                font-size: ${12 * scaleY}px;
                background: #1A1A1A;
                color: #FFFFFF;
                border: 1px solid #5D4037;
                border-radius: 4px;
                outline: none;
                z-index: 10000;
                box-sizing: border-box;
                transform: translate(-50%, -50%) rotate(90deg);
                transform-origin: center center;
            `;
        } else {
            // Landscape mode - normal positioning
            const canvas = this.game.canvas;
            const canvasRect = canvas.getBoundingClientRect();
            const scaleX = canvasRect.width / totalGameWidth;
            const scaleY = canvasRect.height / totalGameHeight;

            const screenX = canvasRect.left + gameCenterX * scaleX;
            const screenY = canvasRect.top + gameCenterY * scaleY;
            const screenWidth = gameWidth * scaleX;
            const screenHeight = gameHeight * scaleY;

            this.chatInputElement.style.cssText = `
                position: fixed;
                left: ${screenX}px;
                top: ${screenY}px;
                width: ${screenWidth}px;
                height: ${screenHeight}px;
                padding: 4px 8px;
                font-family: 'PixelFont', Arial, sans-serif;
                font-size: ${12 * scaleY}px;
                background: #1A1A1A;
                color: #FFFFFF;
                border: 1px solid #5D4037;
                border-radius: 4px;
                outline: none;
                z-index: 10000;
                box-sizing: border-box;
                transform: translate(-50%, -50%);
                transform-origin: center center;
            `;
        }
    }

    /**
     * Reposition chat input when screen resizes or orientation changes
     */
    private repositionChatInput() {
        if (!this.chatInputElement || !this.chatModalOpen) return;

        const gameWidth = this.scale.width;  // 960
        const gameHeight = this.scale.height; // 540

        const modalWidth = 300;
        const modalHeight = 250;
        const modalX = gameWidth / 2;
        const modalY = gameHeight / 2;

        const sendButtonWidth = 50;
        const gap = 5;
        const inputWidthGame = modalWidth - 20 - sendButtonWidth - gap;
        const inputHeightGame = 25;

        // Calculate input center position in game coordinates
        const inputCenterX = modalX + (-modalWidth / 2 + 10) + inputWidthGame / 2;
        const inputCenterY = modalY + (modalHeight / 2 - 40);

        // Apply positioning based on current orientation
        this.applyChatInputStyles(inputCenterX, inputCenterY, inputWidthGame, inputHeightGame, gameWidth, gameHeight);
    }

    /**
     * Send chat message via WebSocket (global chat)
     */
    private sendChatMessage() {
        if (!this.chatInputElement) return;

        const message = this.chatInputElement.value.trim();
        if (!message) return;

        // Check cooldown (prevent spam)
        const now = Date.now();
        const timeSinceLastChat = now - this.lastChatTime;
        if (timeSinceLastChat < this.CHAT_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((this.CHAT_COOLDOWN_MS - timeSinceLastChat) / 1000);
            this.showToastMessage(`Please wait ${remainingSeconds}s before sending another message`, 0xFF9800);
            return;
        }

        // Check if connected to lobby
        if (!this.lobbySocketService?.isConnected()) {
            this.showToastMessage('Not connected to chat server', 0xFF5722);
            return;
        }

        // Send via WebSocket (fire-and-forget)
        // Server will broadcast back via 'lobby_chat' event
        this.lobbySocketService.chatGlobal(message);

        // Update last chat time for cooldown
        this.lastChatTime = now;

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

        // Re-enable Phaser keyboard after closing chat
        if (this.input.keyboard) {
            this.input.keyboard.enabled = true;
        }
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
        const duration = Math.min(Math.max(textWidth * this.BUBBLE_SCROLL_SPEED, this.BUBBLE_MIN_DURATION), this.BUBBLE_MAX_DURATION);

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
        const duration = Math.min(Math.max(textWidth * this.BUBBLE_SCROLL_SPEED, this.BUBBLE_MIN_DURATION), this.BUBBLE_MAX_DURATION);

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
