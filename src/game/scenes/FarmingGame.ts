import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { ISLAND_MAP_DATA } from './IslandMapData';
import { UserService } from '../UserService';
import { SeedService } from '../SeedService';
import { FertilizerService } from '../FertilizerService';
import { GardenService } from '../GardenService';
import { FruitService } from '../FruitService';
import { GameDataService } from '../GameDataService';
import { ShopService } from '../ShopService';
import { getSocketService, SocketService } from '../SocketService';
import { getMissionSocketService, MissionSocketService } from '../MissionSocketService';

// Import game state hook
import { useGameState, GameStateHook, PlantUpdateHandler } from '../hooks';

// Import managers
import {
    CheckinManager,
    FactoryManager,
    WarehouseManager,
    MailboxManager,
    ProfileManager,
    ToolbarManager,
    PlotManager,
    SoundManager,
    WellManager,
    PlantDetailManager,
    StationManager,
    NavigationData,
    PetManager,
    // Import types from GameTypes
    PlantType,
    TileState,
    ToolbarItem,
    PLANT_STAGES,
    PLANT_TYPES,
    CROP_DEFINITIONS,
    DEATH_TIMER_MS,
    GAME_CONSTANTS,
    getMaxWaterHours
} from '../managers';
import { InventoryService, InventoryItem } from '../InventoryService';
import { PLAYABLE_CHARACTERS } from '../config/CharacterConfig';

export class FarmingGame extends Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private currentCharacterKey: string = 'bear'; // Default character, will be set from user data
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

    // World
    private readonly TILE_SIZE = 16;
    private readonly MAP_WIDTH = 50;
    private readonly MAP_HEIGHT = 50;

    // Station position (for spawn point when traveling)
    private readonly STATION_X = 41.5;
    private readonly STATION_Y = 24;

    // Navigation data (from station travel)
    private navigationData: NavigationData | null = null;
    private map!: Phaser.Tilemaps.Tilemap;
    private groundLayer!: Phaser.Tilemaps.TilemapLayer;
    private tilledDirtLayer!: Phaser.Tilemaps.TilemapLayer;

    // Farming
    private farmLandStates: Map<string, TileState> = new Map();
    private selectedToolIndex: number = 0;

    // Seed selection
    private selectedSeedIndex: number = 0; // Index in PLANT_TYPES
    private seedSelectorOpen: boolean = false;
    private seedOptionJustClicked: boolean = false; // Prevent movement when clicking seed options

    // Seed counts per type (loaded from API, defaults to 0)
    private seedCounts: Record<PlantType, number> = {
        algae: 0,
        mushroom: 0,
        tree: 0
    };

    // Fertilizer counts per type (loaded from API, defaults to 0)
    private fertilizerCounts: Record<'common' | 'rare' | 'epic' | 'legendary', number> = {
        common: 0,
        rare: 0,
        epic: 0,
        legendary: 0
    };
    private selectedFertilizerIndex: number = 0; // Index in fertilizer types (0=common, 1=rare, 2=epic, 3=legendary)

    // Toolbar items (6 slots: hand, watering can, seed, fertilizer, digest, chest)
    private toolbarItems: ToolbarItem[] = [
        { type: 'tool', name: 'hand' },
        { type: 'tool', name: 'wateringCan', count: 0 }, // count is fetched from API
        { type: 'seed', name: 'seed' }, // count is managed by seedCounts
        { type: 'tool', name: 'fertilizer' }, // count is managed by fertilizerCounts
        { type: 'tool', name: 'digest' },
        { type: 'tool', name: 'chest' },
    ];

    // Chest inventory system (Backpack - items carried)
    private readonly CHEST_SLOTS = 6; // 2 columns x 3 rows (reduced from 12)
    private readonly MAX_PER_SLOT = 50; // Max 50 fruits per slot
    private chestInventory: { type: PlantType; count: number }[] = []; // Each slot: {type, count}
    private chestOpen: boolean = false;

    // Backpack items from API (used by warehouse)
    private backpackItems: InventoryItem[] = [];

    // Pending water action for revert on error
    private pendingWaterAction: {
        tileKey: string;
        previousWaterBalance: number;
        previousWaterCount: number;
    } | null = null;

    // Pending plant action for handling WebSocket response
    private pendingPlantAction: {
        tileKey: string;
        landId: string;
        seedType: 'algae' | 'mushroom' | 'tree';
    } | null = null;

    // Selected item for transfer between chest and warehouse
    private selectedItem: { itemType: string; amount: number; source: 'backpack' | 'storage' } | null = null;

    // Factory system (managed by FactoryManager) - temporarily disabled
    private factoryModalOpen: boolean = false;

    // Warehouse system (managed by WarehouseManager)
    private warehouseModalOpen: boolean = false;

    // UI
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private timeText!: Phaser.GameObjects.Text;
    private dayCounter: number = 1;
    private timeOfDay: number = 7 * 60; // 7:00 AM in minutes

    // Mini map
    private readonly MINIMAP_SIZE = 80;
    private miniMapContainer!: Phaser.GameObjects.Container;
    private miniMapPlayerAvatar!: Phaser.GameObjects.Image;

    // Wallet
    private walletUIElements: Phaser.GameObjects.GameObject[] = [];

    // User Profile UI (managed by ProfileManager)
    private userProfileModalOpen: boolean = false;

    // Mobile controls
    private joystickBase!: Phaser.GameObjects.Arc;
    private joystickThumb!: Phaser.GameObjects.Arc;
    private joystickActive: boolean = false;
    private joystickPointer: Phaser.Input.Pointer | null = null;
    private actionButton!: Phaser.GameObjects.Arc;
    private actionButtonText!: Phaser.GameObjects.Text;

    // Player movement speed (can be adjusted via buffs/items)
    private playerSpeed: number = 64; // Base speed (reduced 20% from 80)

    // Check-in system
    private checkinModalOpen: boolean = false;

    // Mailbox/Mission system
    private mailboxModalOpen: boolean = false;

    // Marquee announcement
    private marqueeText!: Phaser.GameObjects.Text;

    // Shop system
    private shopModalOpen: boolean = false;

    // Currency system
    private playerGold: number = 1000; // Starting gold
    private playerGems: number = 50; // Starting gems

    // Farm plot ownership system
    // All plots start locked - garden API determines which are unlocked
    private readonly INITIAL_OWNED_PLOTS = 0; // Start with 0, API will unlock
    private ownedPlotsCount: number = this.INITIAL_OWNED_PLOTS;
    private lockedPlotOverlays: Map<string, Phaser.GameObjects.Container> = new Map();
    private buyPlotModalOpen: boolean = false;

    // ========== MANAGERS ==========
    private checkinManager!: CheckinManager;
    private factoryManager!: FactoryManager;
    private warehouseManager!: WarehouseManager;
    private mailboxManager!: MailboxManager;
    private profileManager!: ProfileManager;
    private toolbarManager!: ToolbarManager;
    private plotManager!: PlotManager;
    private soundManager!: SoundManager;
    private wellManager!: WellManager;
    private plantDetailManager!: PlantDetailManager;
    private stationManager!: StationManager;
    private petManager!: PetManager;

    // ========== SOCKET & REAL-TIME ==========
    private socketService!: SocketService;
    private missionSocketService!: MissionSocketService;
    private plantUpdateHandler!: PlantUpdateHandler;

    // Global game state (single source of truth)
    private gameState!: GameStateHook;

    constructor() {
        super('FarmingGame');
    }

    init(data?: NavigationData) {
        // Store navigation data if coming from station travel
        this.navigationData = data?.spawnAt ? data : null;
    }

    create() {
        // Initialize global game state FIRST (before anything else)
        this.gameState = useGameState(this);

        // IMPORTANT: Reset state to initial values to clear any stale data from registry
        // This ensures fresh state on game start (phaser-hooks persists in Phaser registry)
        this.gameState.set({
            currency: { gold: 0, gem: 0 },
            seeds: { algae: 0, mushroom: 0, tree: 0 },
            fertilizers: { common: 0, rare: 0, epic: 0, legendary: 0 },
            fruits: [],
            waterCount: 0,
            user: null,
            isInitialized: false,
            lastUpdated: Date.now(),
        });

        // Create water animation first
        this.createWaterAnimation();

        // Create the island map
        this.createIslandMap();

        // Initialize all managers
        this.initializeManagers();

        // Create warehouse using manager (replaces factory temporarily)
        this.warehouseManager.createWarehouse();
        // Factory temporarily disabled - uncomment to re-enable
        // this.factoryManager.createFactory();

        // Create check-in sign using manager
        this.checkinManager.createCheckinSign(this.TILE_SIZE);

        // Create mailbox using manager
        this.mailboxManager.createMailbox();
        // Note: Missions are loaded from cache or API in loadGameDataFromCache()

        // Create well using manager
        this.wellManager.createWell();

        // Create station/dock using manager
        this.stationManager.create();

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

        // Smart garden refresh: check if any plant is about to change stage
        // Refresh every 60 seconds, but also refresh immediately when a plant timer completes
        this.time.addEvent({
            delay: 60000, // Check every 60 seconds
            callback: () => {
                this.smartGardenRefresh();
            },
            callbackScope: this,
            loop: true
        });

        // Listen for wallet connection
        EventBus.on('wallet-connected', this.onWalletConnected, this);
        // Check if already connected
        EventBus.emit('check-wallet-connection');

        // Load data from cache (pre-loaded by GameLoader) or fetch if not available
        this.loadGameDataFromCache();

        // Register UI update callback with GameDataService
        // This will be called automatically when any refresh method completes
        GameDataService.setUIUpdateCallback(() => this.refreshAllUI());

        // Also listen for EventBus event as backup (in case callback is not registered)
        EventBus.on('gamedata:updated', this.onGameDataUpdated, this);

        // Listen for game state changes to auto-update UI
        // Use a flag to prevent infinite loops when refreshAllUI syncs state
        let isRefreshingUI = false;
        this.gameState.on('change', () => {
            if (isRefreshingUI) return; // Prevent recursive calls
            isRefreshingUI = true;
            // Only update UI displays, don't sync state again
            this.createUserProfileUI();
            this.updateToolbar();
            isRefreshingUI = false;
        });

        // Handle screen resize
        this.scale.on('resize', this.onResize, this);

        // Start playing theme music
        this.soundManager.playRandomTheme();

        // Initialize WebSocket connection for real-time updates
        this.initializeSocketConnection();

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

    /**
     * Initialize all managers with their callbacks
     */
    private initializeManagers(): void {
        // CheckinManager
        // Data refresh is handled by GameDataService.refreshAndUpdateUI()
        this.checkinManager = new CheckinManager(this, {
            playSuccessSound: () => this.soundManager.playSuccessSound()
        });

        // FactoryManager (Phygital Exchange) - temporarily disabled
        // UI refresh is handled by GameDataService.refreshAndUpdateUI()
        this.factoryManager = new FactoryManager(this, {
            getChestInventory: () => this.chestInventory,
            getPlayer: () => this.player,
            closeSeedSelector: () => this.closeSeedSelector(),
            closeChestPanel: () => this.closeChestPanel(),
            showToastMessage: (text, color) => this.showToastMessage(text, color),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        }, this.TILE_SIZE);

        // WarehouseManager (Storage system - replaces factory temporarily)
        this.warehouseManager = new WarehouseManager(this, {
            getBackpackItems: () => this.backpackItems,
            showToastMessage: (text, color) => this.showToastMessage(text, color),
            playSuccessSound: () => this.soundManager.playSuccessSound(),
            refreshInventory: async () => {
                await this.loadBackpackData();
                this.toolbarManager.updateToolbar();
            },
            updateToolbar: () => this.toolbarManager.updateToolbar(),
            getSelectedItem: () => this.selectedItem,
            setSelectedItem: (item) => { this.selectedItem = item; }
        }, this.TILE_SIZE);

        // MailboxManager
        // UI refresh is handled by GameDataService.refreshAndUpdateUI()
        this.mailboxManager = new MailboxManager(this, {
            getSeedCounts: () => this.seedCounts,
            getFertilizerCounts: () => this.fertilizerCounts,
            showToastMessage: (text, color) => this.showToastMessage(text, color),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        }, this.TILE_SIZE);

        // ProfileManager
        this.profileManager = new ProfileManager(this, {
            onLogout: () => {
                // Navigate back to Login screen with fromLogout flag
                this.scene.start('Login', { fromLogout: true });
            },
            onWalletConnected: (_address) => {
                // Wallet address handled by ProfileManager
            }
        });

        // ToolbarManager
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
            onSeedOptionClicked: () => { this.seedOptionJustClicked = true; },
            showToastMessage: (text, color) => this.showToastMessage(text, color),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        });

        // PlotManager
        this.plotManager = new PlotManager(this, {
            getPlayerGems: () => this.playerGems,
            getOwnedPlotsCount: () => this.ownedPlotsCount,
            getLockedPlotOverlays: () => this.lockedPlotOverlays,
            getFarmLandStates: () => this.farmLandStates,
            setPlayerGems: (gems) => { this.playerGems = gems; },
            setOwnedPlotsCount: (count) => { this.ownedPlotsCount = count; },
            refreshProfileUI: () => this.createUserProfileUI(),
            showFloatingMessage: (msg, x, y) => this.showFloatingMessage(msg, x, y)
        });

        // SoundManager
        this.soundManager = new SoundManager(this);

        // WellManager
        // UI refresh is handled by GameDataService.refreshAndUpdateUI()
        this.wellManager = new WellManager(this, {
            getWaterCount: () => {
                const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');
                return wateringCan?.count || 0;
            },
            addWater: (amount) => {
                const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');
                if (wateringCan) wateringCan.count = (wateringCan.count || 0) + amount;
            },
            playSuccessSound: () => this.soundManager.playSuccessSound()
        }, this.TILE_SIZE);

        // PlantDetailManager
        this.plantDetailManager = new PlantDetailManager(this, {
            onWater: (plantId) => {
                // Find tile by plantId and water it
                this.waterPlantById(plantId);
            },
            onHarvest: (plantId) => {
                // Find tile by plantId and harvest it
                this.harvestPlantById(plantId);
            },
            onRemove: (landId) => {
                // Find tile by landId and remove plant
                this.removePlantByLandId(landId);
            }
        });

        // StationManager - Travel/Navigation
        this.stationManager = new StationManager(this, {
            onNavigate: (sceneKey, navData) => {
                // Stop all sounds before scene transition
                this.soundManager?.destroy();
                // Navigate to the selected scene after a short delay, passing navigation data
                this.time.delayedCall(500, () => {
                    this.scene.start(sceneKey, navData);
                });
            },
            showToastMessage: (text, color) => this.showToastMessage(text, color)
        });

        // PetManager - Pet following system
        this.petManager = new PetManager(this, {
            getPlayer: () => this.player,
            getUICamera: () => this.uiCamera
        });
    }

    /**
     * Initialize WebSocket connection and plant update handler
     */
    private initializeSocketConnection(): void {
        // Get socket service singleton
        this.socketService = getSocketService();
        this.missionSocketService = getMissionSocketService();

        // Initialize plant update handler with callbacks
        this.plantUpdateHandler = new PlantUpdateHandler(this, {
            getFarmLandStates: () => this.farmLandStates,
            showPlant: (x: number, y: number, plantType: PlantType, stage: number, isDead: boolean, isWilted: boolean) => {
                this.showPlant(x, y, plantType, stage, isDead, isWilted);
            },
            updateHealthBar: (tileKey: string, hoursToDeath: number, maxHours: number = 72) => {
                this.updateHealthBarFromSocket(tileKey, hoursToDeath, maxHours);
            },
            showWaterSplashEffect: (x: number, y: number) => {
                this.showWaterSplashEffect(x, y);
            },
            showGrowthEffect: (x: number, y: number) => {
                this.showGrowthEffect(x, y);
            },
            showWitherEffect: (x: number, y: number) => {
                this.showWitherEffect(x, y);
            },
            showToastMessage: (text: string, color: number) => {
                this.showToastMessage(text, color);
            },
        });

        // Start listening for plant updates
        this.plantUpdateHandler.startListening();

        // Connect to socket server
        this.socketService.connect();
        
        // Connect to mission socket server
        this.missionSocketService.connect();

        // Listen for socket connection events
        EventBus.on('socket:connected', this.onSocketConnected, this);
        EventBus.on('socket:disconnected', this.onSocketDisconnected, this);
        EventBus.on('socket:inventory_update', this.onInventoryUpdate, this);
        EventBus.on('socket:land_update', this.onLandUpdate, this);
        EventBus.on('socket:currency_update', this.onCurrencyUpdate, this);
        EventBus.on('socket:action_success', this.onActionSuccess, this);
        EventBus.on('socket:action_error', this.onActionError, this);

    }

    /**
     * Handle socket connected event
     */
    private onSocketConnected(): void {
        // Debug: Log connection state
        //this.socketService.debugConnectionState();
    }

    /**
     * Handle socket disconnected event
     */
    private onSocketDisconnected(reason: string): void {
    }

    /**
     * Handle inventory_update event from socket
     * Updates water count, seeds, and other inventory items in real-time
     */
    private onInventoryUpdate(items: Array<{ itemType: string; amount: number; location?: string }>): void {
        let needsToolbarUpdate = false;
        
        // Update GameDataService cache for warehouse/backpack
        GameDataService.updateStorageCacheFromSocket(items);
        GameDataService.updateBackpackCacheFromSocket(items);
        
        // Process each inventory item for toolbar
        items.forEach(item => {
            const itemType = item.itemType.toUpperCase();
            
            // Update water count - only for TOOLS location
            if (itemType === 'WATER' && item.location === 'TOOLS') {
                const wateringCan = this.toolbarItems.find(i => i.name === 'wateringCan');
                if (wateringCan) {
                    wateringCan.count = item.amount;
                    needsToolbarUpdate = true;
                }
            }
            
            // Update seed counts (SEED_ALGAE, SEED_MUSHROOM, SEED_TREE)
            if (itemType.startsWith('SEED_')) {
                const seedType = itemType.replace('SEED_', '');
                const plantType = SeedService.mapSeedTypeToPlantType(seedType);
                this.seedCounts[plantType] = item.amount;
                needsToolbarUpdate = true;
            }
            
            // Update fertilizer counts (FERTILIZER_COMMON, FERTILIZER_RARE, etc.)
            if (itemType.startsWith('FERTILIZER_')) {
                const fertilizerType = itemType.replace('FERTILIZER_', '').toLowerCase() as 'common' | 'rare' | 'epic' | 'legendary';
                if (this.fertilizerCounts[fertilizerType] !== undefined) {
                    this.fertilizerCounts[fertilizerType] = item.amount;
                    needsToolbarUpdate = true;
                }
            }
        });
        
        // Update toolbar UI if any counts changed
        if (needsToolbarUpdate) {
            this.updateToolbar();
        }
    }

    /**
     * Handle land_update event from socket
     * Updates land plots when buying land, planting, or harvesting
     */
    private onLandUpdate(lands: Array<{ id: string; plotIndex: number; plant?: unknown; soilQuality: { fertility: number; hydration: number } }>): void {
        // Update owned plots count based on received lands
        const newOwnedPlotsCount = lands.length;
        if (newOwnedPlotsCount > this.ownedPlotsCount) {
            this.ownedPlotsCount = newOwnedPlotsCount;
            
            // Refresh garden data to update the UI with new plots
            this.loadGardenData();
            
            // Refresh profile UI to update gem count
            this.createUserProfileUI();
        }
        
        // Process each land update
        lands.forEach(land => {
            // Convert plotIndex to tile coordinates
            const tileKey = GardenService.plotIndexToTileKey(land.plotIndex);
            const state = this.farmLandStates.get(tileKey);
            
            if (state) {
                // Update landId if not set
                if (!state.landId) {
                    state.landId = land.id;
                }
                
                // Unlock the plot if it was locked
                if (state.locked) {
                    state.locked = false;
                    
                    // Remove lock overlay
                    const lockOverlay = this.lockedPlotOverlays.get(tileKey);
                    if (lockOverlay) {
                        lockOverlay.destroy();
                        this.lockedPlotOverlays.delete(tileKey);
                    }
                }
            }
        });
    }

    /**
     * Handle currency_update event from socket
     * Updates gold and gem counts in real-time
     */
    private onCurrencyUpdate(payload: { gold: number; gem: number }): void {
        // Update local state
        this.playerGold = payload.gold;
        this.playerGems = payload.gem;
        
        // Update global game state (single source of truth)
        const gameState = useGameState(this);
        gameState.setCurrency(payload.gold, payload.gem);
        
        // Refresh profile UI to show updated balances
        this.createUserProfileUI();
    }

    /**
     * Handle action_success event from socket
     * Processes successful game actions
     */
    private onActionSuccess(payload: { action: string; data: unknown }): void {
        console.log('[FarmingGame] Action success:', payload.action, payload.data);

        if (payload.action === 'plant_seed' && this.pendingPlantAction) {
            const data = payload.data as {
                plant?: { id: string; type: string; stage: string; plantedAt: string };
                message?: string;
                canWaterNow?: boolean;
            };

            if (data.plant?.id) {
                const { tileKey } = this.pendingPlantAction;
                const state = this.farmLandStates.get(tileKey);
                
                if (state) {
                    state.plantId = data.plant.id;
                    console.log('[FarmingGame] Plant ID set:', data.plant.id, 'for tile:', tileKey);
                }
            }

            // Show success message
            if (data.message) {
                this.showToastMessage(data.message, 0x22c55e);
            }

            // Clear pending action
            this.pendingPlantAction = null;
        }

        if (payload.action === 'event_checkin') {
            const data = payload.data as {
                success: true;
                event: {
                    id: string;
                    name: string;
                    location: string;
                    startTime: string;
                    endTime: string;
                };
                reward: {
                    itemType: string;
                    amount: number;
                    totalAmount: number;
                };
            };

            // Show success message with event name and reward
            const eventName = data.event.name;
            const rewardText = `+${data.reward.amount} ${this.getItemDisplayName(data.reward.itemType)}`;
            this.showToastMessage(`Checked in to "${eventName}"! Received ${rewardText}`, 0x22c55e);

            // Play success sound
            this.soundManager.playSuccessSound();

            // Emit event for EventModalManager to handle
            EventBus.emit('event:checkin_websocket_success', {
                eventName,
                rewardText
            });

            // Refresh inventory to update item counts
            GameDataService.refreshInventoryAndUpdateUI();
        }

        if (payload.action === 'claim_gift') {
            const data = payload.data as {
                success: true;
                event: {
                    name: string;
                    code: string;
                };
                reward: {
                    itemType: string;
                    itemName: string;
                    amount: number;
                    icon: string;
                    probability: number;
                };
                message: string;
            };

            // Show success message
            this.showToastMessage(data.message, 0x22c55e);

            // Play success sound
            this.soundManager.playSuccessSound();

            // Emit event for EventModalManager to handle
            EventBus.emit('event:claim_gift_websocket_success', {
                eventName: data.event.name,
                code: data.event.code,
                reward: data.reward,
                message: data.message
            });

            // Refresh inventory to update item counts
            GameDataService.refreshInventoryAndUpdateUI();
        }
    }

    /**
     * Handle action_error event from socket
     * Shows error message to user when a game action fails
     * Reverts optimistic UI updates
     */
    private onActionError(payload: { action: string; message: string }): void {

        // Show error toast to user
        this.showToastMessage(payload.message || 'Action failed!', 0xef4444);

        // Handle specific action errors
        if (payload.action === 'event_checkin') {
            // Event checkin failed - emit event for EventModalManager
            EventBus.emit('event:checkin_websocket_error', {
                message: payload.message
            });
            console.log('[FarmingGame] Event checkin failed:', payload.message);
            return;
        }

        if (payload.action === 'claim_gift') {
            // Claim gift failed - emit event for EventModalManager
            EventBus.emit('event:claim_gift_websocket_error', {
                message: payload.message
            });
            console.log('[FarmingGame] Claim gift failed:', payload.message);
            return;
        }

        // Revert optimistic updates based on action type
        if (payload.action === 'water_plant' && this.pendingWaterAction) {
            const { tileKey, previousWaterBalance, previousWaterCount } = this.pendingWaterAction;
            const state = this.farmLandStates.get(tileKey);

            if (state) {
                // Revert hydration state
                if (state.hydration) {
                    state.hydration.waterBalance = previousWaterBalance;
                    state.hydration.hoursToDeath = previousWaterBalance;
                }

                // Revert health bar visual
                const maxHours = getMaxWaterHours(state.cropType || 'algae');
                const healthPercent = Math.min(previousWaterBalance / maxHours, 1);
                const maxWidth = 11;

                if (state.healthBarFill) {
                    state.healthBarFill.width = Math.max(maxWidth * healthPercent, 1);
                    if (healthPercent > 0.6) {
                        state.healthBarFill.setFillStyle(0x4ade80); // Green
                    } else if (healthPercent > 0.3) {
                        state.healthBarFill.setFillStyle(0xfbbf24); // Yellow
                    } else {
                        state.healthBarFill.setFillStyle(0xef4444); // Red
                    }
                }
            }

            // Revert water count in toolbar
            const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');
            if (wateringCan) {
                wateringCan.count = previousWaterCount;
                this.updateToolbar();
            }

            // Clear pending action
            this.pendingWaterAction = null;
        }

        // Handle plant_seed error
        if (payload.action === 'plant_seed' && this.pendingPlantAction) {
            const { tileKey, seedType } = this.pendingPlantAction;
            const state = this.farmLandStates.get(tileKey);

            if (state) {
                // Revert plant state
                state.planted = false;
                state.cropType = null;
                state.plantStage = 0;
                state.plantId = undefined;

                // Remove plant sprite
                if (state.plantSprite) {
                    state.plantSprite.destroy();
                    state.plantSprite = undefined;
                }

                // Remove health bar
                if (state.healthBarBg) {
                    state.healthBarBg.destroy();
                    state.healthBarBg = undefined;
                }
                if (state.healthBarFill) {
                    state.healthBarFill.destroy();
                    state.healthBarFill = undefined;
                }

                // Restore seed count
                this.seedCounts[seedType]++;
                this.updateToolbar();
            }

            this.pendingPlantAction = null;
        }
    }

    /**
     * Update health bar from socket data
     */
    private updateHealthBarFromSocket(tileKey: string, hoursToDeath: number, maxHours: number = 72): void {
        const state = this.farmLandStates.get(tileKey);
        if (!state?.healthBarFill) return;

        const healthPercent = Math.min(hoursToDeath / maxHours, 1);
        const maxWidth = 11; // barWidth(12) - 1
        state.healthBarFill.width = Math.max(maxWidth * healthPercent, 1);

        // Color gradient: green -> yellow -> red
        if (healthPercent > 0.6) {
            state.healthBarFill.setFillStyle(0x4ade80); // Green
        } else if (healthPercent > 0.3) {
            state.healthBarFill.setFillStyle(0xfbbf24); // Yellow/Orange
        } else {
            state.healthBarFill.setFillStyle(0xef4444); // Red
        }
    }

    /**
     * Show water splash effect on a tile
     */
    private showWaterSplashEffect(tileX: number, tileY: number): void {
        const worldX = tileX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const worldY = tileY * this.TILE_SIZE + this.TILE_SIZE / 2;

        // Create water droplets
        for (let i = 0; i < 5; i++) {
            const droplet = this.add.circle(
                worldX + Phaser.Math.Between(-6, 6),
                worldY - 8,
                2,
                0x2196F3,
                0.8
            );
            droplet.setDepth(5000);
            this.uiCamera.ignore(droplet);

            this.tweens.add({
                targets: droplet,
                y: worldY + 4,
                alpha: 0,
                scale: 0.5,
                duration: 400,
                delay: i * 50,
                ease: 'Quad.easeOut',
                onComplete: () => droplet.destroy()
            });
        }

        // Play water sound
        this.soundManager.playWaterSound?.();
    }

    /**
     * Show growth/level up effect on a tile
     */
    private showGrowthEffect(tileX: number, tileY: number): void {
        const worldX = tileX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const worldY = tileY * this.TILE_SIZE + this.TILE_SIZE / 2;

        // Create sparkle particles
        const colors = [0x4ade80, 0xfbbf24, 0x60a5fa];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const sparkle = this.add.circle(
                worldX,
                worldY,
                2,
                colors[i % colors.length],
                1
            );
            sparkle.setDepth(5000);
            this.uiCamera.ignore(sparkle);

            this.tweens.add({
                targets: sparkle,
                x: worldX + Math.cos(angle) * 12,
                y: worldY + Math.sin(angle) * 12,
                alpha: 0,
                scale: 0,
                duration: 500,
                ease: 'Quad.easeOut',
                onComplete: () => sparkle.destroy()
            });
        }

        // Play success sound
        this.soundManager.playSuccessSound();
    }

    /**
     * Show wither warning effect on a tile
     */
    private showWitherEffect(tileX: number, tileY: number): void {
        const worldX = tileX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const worldY = tileY * this.TILE_SIZE - 4;

        // Create warning icon
        const warning = this.add.text(worldX, worldY, '⚠️', {
            fontSize: '12px',
        });
        warning.setOrigin(0.5);
        warning.setDepth(5000);
        this.uiCamera.ignore(warning);

        // Pulse and fade animation
        this.tweens.add({
            targets: warning,
            y: worldY - 8,
            alpha: 0,
            scale: 1.5,
            duration: 1000,
            ease: 'Quad.easeOut',
            onComplete: () => warning.destroy()
        });
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

    /**
     * Loads all game data from cache (pre-loaded by GameLoader)
     * Falls back to fetching from API if cache is not available
     */
    private async loadGameDataFromCache() {
        const cachedData = GameDataService.getCachedData();

        if (cachedData && GameDataService.isCacheValid()) {
            // Load seeds from cache
            this.seedCounts = { algae: 0, mushroom: 0, tree: 0 };
            if (Array.isArray(cachedData.seeds)) {
                cachedData.seeds.forEach(item => {
                    if (item && item.type) {
                        const plantType = SeedService.mapSeedTypeToPlantType(item.type);
                        this.seedCounts[plantType] = item.quantity;
                    }
                });
            }

            // Load fertilizers from cache (new API format: { fertilizers: [], total: number })
            this.fertilizerCounts = { common: 0, rare: 0, epic: 0, legendary: 0 };
            if (cachedData.fertilizers && Array.isArray(cachedData.fertilizers.fertilizers)) {
                cachedData.fertilizers.fertilizers.forEach(item => {
                    if (item && item.type) {
                        const fertilizerType = FertilizerService.mapFertilizerType(item.type);
                        this.fertilizerCounts[fertilizerType] = item.amount;
                    }
                });
            }

            // Load water count from API (no cache for tools)
            this.fetchWaterInventory();

            // Load fruits (chest inventory) from cache
            this.chestInventory = [];
            for (const item of cachedData.fruits) {
                if (item.count > 0) {
                    let remaining = item.count;
                    while (remaining > 0 && this.chestInventory.length < this.CHEST_SLOTS) {
                        const slotCount = Math.min(remaining, this.MAX_PER_SLOT);
                        this.chestInventory.push({ type: item.type, count: slotCount });
                        remaining -= slotCount;
                    }
                }
            }
            // Load garden data from cache
            this.loadGardenDataFromCache(cachedData.garden);

            // Set missions to MailboxManager from cache
            if (cachedData.missions) {
                this.mailboxManager.setMissionsFromCache(cachedData.missions);
            }

            // Set streak data to CheckinManager from cache
            if (cachedData.streak) {
                this.checkinManager.setStreakFromCache(cachedData.streak.status, cachedData.streak.history);
            }

            // Initialize global game state with cached data (SINGLE SOURCE OF TRUTH)
            // NOTE: Use user.balanceGold/Gem as primary source (more accurate than inventory API)
            this.gameState.initialize({
                currency: {
                    gold: cachedData.user?.balanceGold ?? cachedData.currencies?.gold ?? 0,
                    gem: cachedData.user?.balanceGem ?? cachedData.currencies?.gem ?? 0,
                },
                seeds: this.seedCounts,
                fertilizers: this.fertilizerCounts,
                fruits: cachedData.fruits || [],
                waterCount: this.toolbarItems[1]?.count ?? 0,
                user: cachedData.user ? {
                    id: cachedData.user.id,
                    address: cachedData.user.address,
                    username: cachedData.user.username,
                    avatar: cachedData.user.avatar,
                    xp: cachedData.user.xp,
                    reputationScore: cachedData.user.reputationScore,
                    landsCount: cachedData.user.landsCount,
                    plantsCount: cachedData.user.plantsCount,
                } : null,
            });
            // Update UI
            this.updateToolbar();
            this.createUserProfileUI();
            // Also load backpack data for warehouse
            this.loadBackpackData();
        } else {
            // Fallback to fetching from API
            this.fetchSeedInventory();
            this.fetchFertilizerInventory();
            this.fetchFruitInventory();
            this.fetchWaterInventory();
            this.loadGardenData();
            this.fetchUserProfile();
            this.loadBackpackData();
            // Preload missions (will be cached by MailboxManager)
            this.mailboxManager.preloadMissions();
        }
    }

    /**
     * Loads garden data from cached response
     */
    private loadGardenDataFromCache(gardenData: import('../GardenService').GardenResponse) {
        if (!gardenData || gardenData.length === 0) {
            return;
        }

        // Update owned plots count
        const unlockedPlotCount = gardenData.length;
        if (unlockedPlotCount > this.ownedPlotsCount) {
            this.ownedPlotsCount = unlockedPlotCount;
        }

        // Process each plot
        gardenData.forEach(plot => {
            const tileKey = GardenService.plotIndexToTileKey(plot.plotIndex);
            const [x, y] = tileKey.split(',').map(Number);

            // Remove lock overlay
            this.unlockPlot(tileKey);

            // Get or create tile state
            let state = this.farmLandStates.get(tileKey);
            if (!state) {
                state = {
                    tilled: true,
                    planted: false,
                    plantStage: 0,
                    cropType: null
                };
                this.farmLandStates.set(tileKey, state);
            }

            state.locked = false;
            state.plotIndex = plot.plotIndex;
            state.landId = plot.landId;

            if (plot.plant) {
                const plantType = GardenService.mapPlantTypeToGameType(plot.plant.type);
                const plantStage = GardenService.mapStageToGameStage(plot.plant.stage);

                state.planted = true;
                state.cropType = plantType;
                state.plantStage = plantStage;
                state.isDead = false;
                state.isWilted = false;
                state.lastCareTime = new Date(plot.plant.plantedAt).getTime();
                state.plantId = plot.plant.id;

                // Store full API data for PlantDetailManager
                state.plantInfo = {
                    id: plot.plant.id,
                    type: plot.plant.type,
                    typeName: (plot.plant as any).typeName,
                    name: plot.plant.name,
                    stage: plot.plant.stage,
                    stageName: (plot.plant as any).stageName,
                    plantedAt: plot.plant.plantedAt,
                    lastWateredAt: (plot.plant as any).lastWateredAt,
                    waterBalance: (plot.plant as any).waterBalance,
                    waterCount: plot.plant.waterCount
                };

                // Store hydration data (health/water status)
                const apiHydration = (plot as any).hydration;
                state.hydration = apiHydration ? {
                    hoursToDeath: apiHydration.hoursToDeath,
                    isDead: apiHydration.isDead,
                    isWithering: apiHydration.isWithering,
                    status: apiHydration.status,
                    message: apiHydration.message,
                    waterBalance: apiHydration.waterBalance
                } : undefined;

                // Store growth data
                const apiGrowth = (plot as any).growth;
                state.growth = apiGrowth ? {
                    activeGrowthHours: apiGrowth.activeGrowthHours,
                    currentStage: apiGrowth.currentStage,
                    hoursRemaining: apiGrowth.hoursRemaining,
                    progress: apiGrowth.progress,
                    totalHoursNeeded: apiGrowth.totalHoursNeeded
                } : undefined;

                // Store refresh timestamp for smart refresh calculation
                state.lastRefreshTime = Date.now();

                // Store soil quality data
                const apiSoilQuality = (plot as any).soilQuality;
                state.soilQuality = apiSoilQuality ? {
                    fertility: apiSoilQuality.fertility,
                    hydration: apiSoilQuality.hydration,
                    status: apiSoilQuality.status
                } : undefined;

                state.progress = plot.progress ? {
                    percentage: plot.progress.percentage,
                    timeRemaining: plot.progress.timeRemaining,
                    stage: plot.progress.stage,
                    canWater: plot.progress.canWater
                } : undefined;
                state.config = plot.config ? {
                    diggingTime: plot.config.diggingTime,
                    growingTime: plot.config.growingTime,
                    totalTime: plot.config.totalTime,
                    baseYield: plot.config.baseYield
                } : undefined;

                // Update plant status from hydration
                if (state.hydration) {
                    state.isDead = state.hydration.isDead;
                    state.isWilted = state.hydration.isWithering;
                }

                // Remove existing health bar
                if (state.healthBarBg) {
                    state.healthBarBg.destroy();
                    state.healthBarBg = undefined;
                }
                if (state.healthBarFill) {
                    state.healthBarFill.destroy();
                    state.healthBarFill = undefined;
                }

                // Show plant sprite
                this.showPlant(x, y, plantType, plantStage, state.isDead, state.isWilted);

                // Create health bar (only if not dead)
                if (!state.isDead) {
                    this.createHealthBar(x, y, tileKey);
                }

                // Update health bar based on waterBalance / maxWaterHours for plant type
                const updatedState = this.farmLandStates.get(tileKey);
                if (updatedState?.healthBarFill && state.hydration) {
                    const waterBalance = state.hydration.waterBalance ?? 0;
                    const maxHours = getMaxWaterHours(state.cropType || 'algae');
                    const healthPercent = Math.min(waterBalance / maxHours, 1);
                    const maxWidth = 11; // barWidth(12) - 1
                    updatedState.healthBarFill.width = Math.max(maxWidth * healthPercent, 1);

                    // Color gradient: green -> yellow -> red
                    if (healthPercent > 0.6) {
                        updatedState.healthBarFill.setFillStyle(0x4ade80); // Green
                    } else if (healthPercent > 0.3) {
                        updatedState.healthBarFill.setFillStyle(0xfbbf24); // Yellow/Orange
                    } else {
                        updatedState.healthBarFill.setFillStyle(0xef4444); // Red
                    }
                }

            } else {
                this.removePlant(x, y);
                state.planted = false;
                state.cropType = null;
                state.plantStage = 0;
                state.plantId = undefined;
            }
        });

    }

    /**
     * Fetches seed inventory from API and updates local seed counts
     */
    private async fetchSeedInventory() {
        try {
            const inventory = await SeedService.getSeedInventory();

            // Reset all seed counts to 0 first
            this.seedCounts = {
                algae: 0,
                mushroom: 0,
                tree: 0
            };

            // Validate that inventory is an array
            if (!Array.isArray(inventory)) {
                this.updateToolbar();
                return;
            }

            // Update seed counts from API response
            inventory.forEach(item => {
                if (item && item.type) {
                    const plantType = SeedService.mapSeedTypeToPlantType(item.type);
                    this.seedCounts[plantType] = item.quantity;
                }
            });


            // Update toolbar to reflect new counts
            this.updateToolbar();
        } catch (error) {
            // Update toolbar anyway to show 0 counts
            this.updateToolbar();
        }
    }

    /**
     * Fetches fertilizer inventory from API and updates local fertilizer counts
     */
    private async fetchFertilizerInventory() {
        try {
            const response = await FertilizerService.getFertilizerInventory();

            // Reset all fertilizer counts to 0 first
            this.fertilizerCounts = {
                common: 0,
                rare: 0,
                epic: 0,
                legendary: 0
            };

            // Validate response
            if (!response || !Array.isArray(response.fertilizers)) {
                this.updateToolbar();
                return;
            }

            // Update fertilizer counts from API response
            response.fertilizers.forEach(item => {
                if (item && item.type) {
                    const fertilizerType = FertilizerService.mapFertilizerType(item.type);
                    this.fertilizerCounts[fertilizerType] = item.amount;
                }
            });


            // Update toolbar to reflect new counts
            this.updateToolbar();
        } catch (error) {
            // Update toolbar anyway to show 0 counts
            this.updateToolbar();
        }
    }

    /**
     * Fetches fruit inventory from API and updates chest inventory
     */
    private async fetchFruitInventory() {
        try {
            const fruitInventory = await FruitService.getFruitInventory();

            // Reset chest inventory
            this.chestInventory = [];

            // Populate chest inventory from API response
            for (const item of fruitInventory) {
                if (item.count > 0) {
                    // Split into slots of MAX_PER_SLOT each
                    let remaining = item.count;
                    while (remaining > 0 && this.chestInventory.length < this.CHEST_SLOTS) {
                        const slotCount = Math.min(remaining, this.MAX_PER_SLOT);
                        this.chestInventory.push({
                            type: item.type,
                            count: slotCount
                        });
                        remaining -= slotCount;
                    }
                }
            }


            // Update toolbar to reflect new counts
            this.updateToolbar();
        } catch (error) {
            this.updateToolbar();
        }
    }

    /**
     * Fetches water count from inventory API (filter location = 'TOOLS') and updates watering can
     */
    private async fetchWaterInventory() {
        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'}/inventory`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem('fam_game_access_token')}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                const allItems = data.inventory || [];
                const waterItem = allItems.find((item: { itemType: string; location: string; amount: number }) => 
                    item.itemType === 'WATER' && item.location === 'TOOLS'
                );
                
                const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');
                if (wateringCan) {
                    wateringCan.count = waterItem?.amount || 0;
                }
            }

            // Update toolbar to reflect new count
            this.updateToolbar();
        } catch (error) {
            this.updateToolbar();
        }
    }

    /**
     * Smart garden refresh - only refresh if plants need updating
     * Checks if any plant's growth timer has completed (stage change expected)
     */
    private smartGardenRefresh(): void {
        let needsRefresh = false;
        const now = Date.now();

        this.farmLandStates.forEach((state) => {
            if (!state.planted || !state.cropType) return;
            if (state.isDead) return;

            // Check if plant growth timer has completed
            if (state.growth && state.growth.hoursRemaining !== undefined) {
                // Calculate when this plant's stage change was expected
                // If hoursRemaining was stored with the last refresh time, check if it's now <= 0
                const lastRefreshTime = state.lastRefreshTime || now;
                const hoursElapsed = (now - lastRefreshTime) / (1000 * 60 * 60);
                const currentHoursRemaining = state.growth.hoursRemaining - hoursElapsed;

                if (currentHoursRemaining <= 0) {
                    needsRefresh = true;
                }
            }

            // Also refresh if plant is withering (health critical)
            if (state.hydration && state.hydration.hoursToDeath <= 1) {
                needsRefresh = true;
            }
        });

        if (needsRefresh) {
            this.loadGardenData();
        } else {
        }
    }

    /**
     * Loads garden data from API and restores planted crops + unlocked plots
     */
    private async loadGardenData() {
        try {
            const gardenData = await GardenService.getGarden();
            

            // Log first plant details to see all available fields
            if (gardenData && gardenData.length > 0) {
                const firstPlot = gardenData.find(p => p.plant !== null);
                if (firstPlot?.plant) {
                }
            }
            
            if (!gardenData || gardenData.length === 0) {
                return;
            }


            // Update owned plots count based on API response
            // Each plot in the response is an unlocked plot
            const unlockedPlotCount = gardenData.length;
            if (unlockedPlotCount > this.ownedPlotsCount) {
                this.ownedPlotsCount = unlockedPlotCount;
            }

            // Process each plot from API
            gardenData.forEach(plot => {
                // Convert plot index to tile key
                const tileKey = GardenService.plotIndexToTileKey(plot.plotIndex);
                const [x, y] = tileKey.split(',').map(Number);

                // Remove lock overlay if exists (plot is unlocked)
                this.unlockPlot(tileKey);

                // Get or create tile state
                let state = this.farmLandStates.get(tileKey);
                if (!state) {
                    state = {
                        tilled: true,
                        planted: false,
                        plantStage: 0,
                        cropType: null
                    };
                    this.farmLandStates.set(tileKey, state);
                }

                // Mark plot as unlocked and store landId
                state.locked = false;
                state.plotIndex = plot.plotIndex;
                state.landId = plot.landId; // Store landId for planting API

                // If plot has a plant, restore it
                if (plot.plant) {
                    const plantType = GardenService.mapPlantTypeToGameType(plot.plant.type);
                    const plantStage = GardenService.mapStageToGameStage(plot.plant.stage);

                    state.planted = true;
                    state.cropType = plantType;
                    state.plantStage = plantStage;
                    state.isDead = false;
                    state.isWilted = false;
                    state.lastCareTime = new Date(plot.plant.plantedAt).getTime();
                    state.plantId = plot.plant.id;

                    // Store full API data for PlantDetailManager
                    state.plantInfo = {
                        id: plot.plant.id,
                        type: plot.plant.type,
                        typeName: (plot.plant as any).typeName,
                        name: plot.plant.name,
                        stage: plot.plant.stage,
                        stageName: (plot.plant as any).stageName,
                        plantedAt: plot.plant.plantedAt,
                        lastWateredAt: (plot.plant as any).lastWateredAt,
                        waterBalance: (plot.plant as any).waterBalance,
                        waterCount: plot.plant.waterCount
                    };

                    // Store hydration data (health/water status)
                    const apiHydration = (plot as any).hydration;
                    state.hydration = apiHydration ? {
                        hoursToDeath: apiHydration.hoursToDeath,
                        isDead: apiHydration.isDead,
                        isWithering: apiHydration.isWithering,
                        status: apiHydration.status,
                        message: apiHydration.message,
                        waterBalance: apiHydration.waterBalance
                    } : undefined;

                    // Store growth data
                    const apiGrowth = (plot as any).growth;
                    state.growth = apiGrowth ? {
                        activeGrowthHours: apiGrowth.activeGrowthHours,
                        currentStage: apiGrowth.currentStage,
                        hoursRemaining: apiGrowth.hoursRemaining,
                        progress: apiGrowth.progress,
                        totalHoursNeeded: apiGrowth.totalHoursNeeded
                    } : undefined;

                    // Store refresh timestamp for smart refresh calculation
                    state.lastRefreshTime = Date.now();

                    // Store soil quality data
                    const apiSoilQuality = (plot as any).soilQuality;
                    state.soilQuality = apiSoilQuality ? {
                        fertility: apiSoilQuality.fertility,
                        hydration: apiSoilQuality.hydration,
                        status: apiSoilQuality.status
                    } : undefined;

                    state.progress = plot.progress ? {
                        percentage: plot.progress.percentage,
                        timeRemaining: plot.progress.timeRemaining,
                        stage: plot.progress.stage,
                        canWater: plot.progress.canWater
                    } : undefined;
                    state.config = plot.config ? {
                        diggingTime: plot.config.diggingTime,
                        growingTime: plot.config.growingTime,
                        totalTime: plot.config.totalTime,
                        baseYield: plot.config.baseYield
                    } : undefined;

                    // Update plant status from hydration
                    if (state.hydration) {
                        state.isDead = state.hydration.isDead;
                        state.isWilted = state.hydration.isWithering;
                    }

                    // Remove existing health bar before creating new one
                    if (state.healthBarBg) {
                        state.healthBarBg.destroy();
                        state.healthBarBg = undefined;
                    }
                    if (state.healthBarFill) {
                        state.healthBarFill.destroy();
                        state.healthBarFill = undefined;
                    }

                    // Show plant sprite (will remove existing sprite if any)
                    this.showPlant(x, y, plantType, plantStage, state.isDead, state.isWilted);

                    // Create health bar (only if not dead)
                    if (!state.isDead) {
                        this.createHealthBar(x, y, tileKey);
                    }

                    // Update health bar based on waterBalance / maxWaterHours for plant type
                    const updatedState = this.farmLandStates.get(tileKey);
                    if (updatedState?.healthBarFill && state.hydration) {
                        const waterBalance = state.hydration.waterBalance ?? 0;
                        const maxHours = getMaxWaterHours(state.cropType || 'algae');
                        const healthPercent = Math.min(waterBalance / maxHours, 1);
                        const maxWidth = 11; // barWidth(12) - 1
                        updatedState.healthBarFill.width = Math.max(maxWidth * healthPercent, 1);

                        // Color gradient: green -> yellow -> red
                        if (healthPercent > 0.6) {
                            updatedState.healthBarFill.setFillStyle(0x4ade80); // Green
                        } else if (healthPercent > 0.3) {
                            updatedState.healthBarFill.setFillStyle(0xfbbf24); // Yellow/Orange
                        } else {
                            updatedState.healthBarFill.setFillStyle(0xef4444); // Red
                        }
                    }

                } else {
                    // Empty plot - remove any existing plant sprite and reset state
                    this.removePlant(x, y);
                    state.planted = false;
                    state.cropType = null;
                    state.plantStage = 0;
                    state.plantId = undefined;
                }
            });

        } catch (error) {
        }
    }

    /**
     * Removes lock overlay from a plot
     */
    private unlockPlot(tileKey: string) {
        const overlay = this.lockedPlotOverlays.get(tileKey);
        if (overlay) {
            overlay.destroy();
            this.lockedPlotOverlays.delete(tileKey);
        }
    }

    /**
     * Load backpack items from API for warehouse system
     */
    private async loadBackpackData(): Promise<void> {
        try {
            const backpackResponse = await InventoryService.getBackpack();
            if (backpackResponse) {
                this.backpackItems = backpackResponse.backpack;
            }
        } catch (error) {
        }
    }

    /**
     * Fetches user profile from API and updates UI
     */
    private async fetchUserProfile() {
        try {
            const userData = await UserService.getUserProfile();

            // Safety check - ensure scene is still active after async call
            if (!this.scene || !this.cameras || !this.cameras.main) {
                return;
            }

            if (userData) {

                // Refresh UI to show updated balances
                this.createUserProfileUI();
            } else {
            }
        } catch (error) {
        }
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
            return;
        }

        // Create ground layer (only for land tiles)
        this.groundLayer = this.map.createBlankLayer('Ground', grassTiles) as Phaser.Tilemaps.TilemapLayer;

        if (!this.groundLayer) {
            return;
        }

        // Set depth for ground layer
        this.groundLayer.setDepth(1);

        // Create tilled dirt layer (for farm plots)
        this.tilledDirtLayer = this.map.createBlankLayer('TilledDirt', tilledDirtTiles) as Phaser.Tilemaps.TilemapLayer;

        if (!this.tilledDirtLayer) {
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

        // Shop exclusion zone (shop is at centerX - 5, centerY - 5)
        const shopX = centerX - 5;
        const shopY = centerY - 5;
        const shopExclusionRadius = 3; // Tiles to exclude around shop

        // Well exclusion zone (well is at centerX + 5, centerY)
        const wellX = centerX + 5;
        const wellY = centerY;
        const wellExclusionRadius = 4; // Tiles to exclude around well

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

            // Skip if position is in shop exclusion zone
            const distFromShop = Math.max(Math.abs(x - shopX), Math.abs(y - shopY));
            if (distFromShop < shopExclusionRadius) continue;

            // Skip if position is in well exclusion zone
            const distFromWell = Math.max(Math.abs(x - wellX), Math.abs(y - wellY));
            if (distFromWell < wellExclusionRadius) continue;

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

        // Well exclusion zone
        const wellX = centerX + 5;
        const wellY = centerY;
        const wellExclusionRadius = 4;

        // Check if all tiles for large object are on land and not in exclusion zone
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                const checkX = x + dx;
                const checkY = y + dy;

                if (!this.isLandTile(checkX, checkY)) {
                    return false;
                }

                // Check center exclusion zone
                const distFromCenter = Math.max(Math.abs(checkX - centerX), Math.abs(checkY - centerY));
                if (distFromCenter < exclusionRadius) {
                    return false;
                }

                // Check well exclusion zone
                const distFromWell = Math.max(Math.abs(checkX - wellX), Math.abs(checkY - wellY));
                if (distFromWell < wellExclusionRadius) {
                    return false;
                }
            }
        }
        return true;
    }

    private addSmallTree(x: number, y: number) {
        // Small tree: sprite 0 (top), sprite 9 (bottom)
        // Use bottom row Y for depth, slight offset so player can cover tree base
        const baseDepth = (y + 1) * this.TILE_SIZE - 4;

        const topSprite = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            y * this.TILE_SIZE + this.TILE_SIZE / 2,
            'basic-plants',
            0
        );
        topSprite.setOrigin(0.5);
        topSprite.setDepth(baseDepth);

        const bottomSprite = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            (y + 1) * this.TILE_SIZE + this.TILE_SIZE / 2,
            'basic-plants',
            9
        );
        bottomSprite.setOrigin(0.5);
        bottomSprite.setDepth(baseDepth);
    }

    private addMediumTree(x: number, y: number) {
        // Medium tree: 2x2 grid (1, 2, 10, 11)
        // Use bottom row Y for depth, slight offset so player can cover tree base
        const baseDepth = (y + 1) * this.TILE_SIZE - 4;

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
            sprite.setDepth(baseDepth);
        });
    }

    private addLargeTree(x: number, y: number) {
        // Large tree: 2x2 grid (3, 4, 12, 13)
        // Use bottom row Y for depth, slight offset so player can cover tree base
        const baseDepth = (y + 1) * this.TILE_SIZE - 4;

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
            sprite.setDepth(baseDepth);
        });
    }

    private addMushroom(x: number, y: number) {
        // Random mushroom: sprites 5, 6, 7, 8
        // Use bottom of sprite for depth, slight offset so player can cover base
        const baseDepth = y * this.TILE_SIZE + this.TILE_SIZE - 4;

        const mushroomFrame = Phaser.Math.Between(5, 8);
        const sprite = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            y * this.TILE_SIZE + this.TILE_SIZE / 2,
            'basic-plants',
            mushroomFrame
        );
        sprite.setOrigin(0.5);
        sprite.setDepth(baseDepth);
    }

    private addBush(x: number, y: number) {
        // Random bush: sprites 27, 28
        // Use bottom of sprite for depth, slight offset so player can cover base
        const baseDepth = y * this.TILE_SIZE + this.TILE_SIZE - 4;

        const bushFrame = Phaser.Math.Between(27, 28);
        const sprite = this.add.sprite(
            x * this.TILE_SIZE + this.TILE_SIZE / 2,
            y * this.TILE_SIZE + this.TILE_SIZE / 2,
            'basic-plants',
            bushFrame
        );
        sprite.setOrigin(0.5);
        sprite.setDepth(baseDepth);
    }

    private createFarmPlots() {
        // Create 16 farm plots at the center of the island in a 4x4 grid
        // Tilled dirt tile variations: 0, 1, 2, 8, 9, 10
        const tilledDirtTiles = [0, 1, 2, 8, 9, 10];

        // Create 4x4 grid of farm plots (16 total)
        // Plots are numbered 0-15, left to right, top to bottom
        const plotPositions = this.getPlotPositions();


        // Place tilled-dirt tiles for each plot
        plotPositions.forEach((pos, index) => {
            const randomTileIndex = Phaser.Math.RND.pick(tilledDirtTiles);
            this.tilledDirtLayer.putTileAt(randomTileIndex, pos.x, pos.y);

            // Create lock overlay for locked plots (index >= ownedPlotsCount)
            if (index >= this.ownedPlotsCount) {
                this.createLockedPlotOverlay(pos.x, pos.y, index);
            } else {
            }
        });
    }

    private getPlotPositions(): { x: number; y: number }[] {
        const centerX = 25;
        const centerY = 25;
        // 4x4 grid centered around (centerX, centerY)
        // Starting from top-left: (centerX-1, centerY-1) to (centerX+2, centerY+2)
        const positions: { x: number; y: number }[] = [];
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                positions.push({
                    x: centerX - 1 + col,
                    y: centerY - 1 + row
                });
            }
        }
        return positions;
    }

    private createLockedPlotOverlay(tileX: number, tileY: number, plotIndex: number) {
        const worldX = tileX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const worldY = tileY * this.TILE_SIZE + this.TILE_SIZE / 2;
        const key = `${tileX},${tileY}`;

        // Create container for lock overlay
        const container = this.add.container(worldX, worldY);
        container.setDepth(100);

        // Lock land image overlay
        const lockImage = this.add.image(0, 0, 'lock-land');
        lockImage.setDisplaySize(this.TILE_SIZE, this.TILE_SIZE);
        container.add(lockImage);

        // Make interactive
        lockImage.setInteractive({ useHandCursor: true });
        lockImage.on('pointerdown', () => {
            this.showBuyPlotModal(tileX, tileY, plotIndex);
        });

        // Store reference
        this.lockedPlotOverlays.set(key, container);

        // Make UI camera ignore this
        this.uiCamera?.ignore(container);
    }

    // Factory, Checkin, Mailbox, Shop, Buy Plot methods moved to respective Managers

    private showFloatingMessage(message: string, tileX: number, tileY: number) {
        const worldX = tileX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const worldY = tileY * this.TILE_SIZE;

        const text = this.add.text(worldX, worldY, message, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        text.setOrigin(0.5);
        text.setDepth(1000);
        text.setStroke('#000000', 2);

        // Make UI camera ignore this (prevent double rendering)
        this.uiCamera?.ignore(text);

        // Animate floating up and fade out
        this.tweens.add({
            targets: text,
            y: worldY - 30,
            alpha: 0,
            duration: 1500,
            ease: 'Power2',
            onComplete: () => {
                text.destroy();
            }
        });
    }

    // showMissionDetails moved to MailboxManager

    // Factory methods moved to FactoryManager

    private createPlayer() {
        let spawnX: number;
        let spawnY: number;

        // Spawn at station if coming from travel, otherwise spawn at center
        if (this.navigationData?.spawnAt === 'station') {
            // Spawn near station (offset to the left so player doesn't overlap station)
            spawnX = this.STATION_X - 5;
            spawnY = this.STATION_Y;
        } else {
            // Default spawn at center of the rectangle (around row 25, col 25)
            spawnX = 25;
            spawnY = 25;
        }

        // Get character type from user data (1-5, maps to index 0-4)
        const cachedData = GameDataService.getCachedData();
        const user = cachedData?.user || UserService.getStoredUser();
        const characterType = user?.characterType || 1;

        // Map characterType (1-5) to character index (0-4) and get character key
        const characterIndex = Math.max(0, Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1));
        this.currentCharacterKey = PLAYABLE_CHARACTERS[characterIndex]?.key || 'bear';


        // Create player sprite with the selected character
        this.player = this.physics.add.sprite(
            spawnX * this.TILE_SIZE,
            spawnY * this.TILE_SIZE,
            this.currentCharacterKey
        );

        this.player.setCollideWorldBounds(true);
        this.player.setScale(GAME_CONSTANTS.CHARACTER_SCALE); // Use shared character scale
        this.player.setDepth(this.player.y); // Dynamic depth based on Y position

        // Create animations for the selected character
        this.createPlayerAnimations();

        // Play idle animation
        this.player.play('idle-down');
    }

    private createPlayerAnimations() {
        const frameRate = 6;
        const charKey = this.currentCharacterKey;

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
        if (!this.anims.exists('idle-down')) {
            this.anims.create({
                key: 'idle-down',
                frames: this.anims.generateFrameNumbers(charKey, { start: 0, end: 1 }),
                frameRate: 2,
                repeat: -1
            });
        }

        // Walk front (down)
        if (!this.anims.exists('walk-down')) {
            this.anims.create({
                key: 'walk-down',
                frames: this.anims.generateFrameNumbers(charKey, { start: 2, end: 3 }),
                frameRate: frameRate,
                repeat: -1
            });
        }

        // Idle back (up)
        if (!this.anims.exists('idle-up')) {
            this.anims.create({
                key: 'idle-up',
                frames: this.anims.generateFrameNumbers(charKey, { start: 4, end: 5 }),
                frameRate: 2,
                repeat: -1
            });
        }

        // Walk back (up)
        if (!this.anims.exists('walk-up')) {
            this.anims.create({
                key: 'walk-up',
                frames: this.anims.generateFrameNumbers(charKey, { start: 6, end: 7 }),
                frameRate: frameRate,
                repeat: -1
            });
        }

        // Idle left
        if (!this.anims.exists('idle-left')) {
            this.anims.create({
                key: 'idle-left',
                frames: this.anims.generateFrameNumbers(charKey, { start: 8, end: 9 }),
                frameRate: 2,
                repeat: -1
            });
        }

        // Walk left
        if (!this.anims.exists('walk-left')) {
            this.anims.create({
                key: 'walk-left',
                frames: this.anims.generateFrameNumbers(charKey, { start: 10, end: 11 }),
                frameRate: frameRate,
                repeat: -1
            });
        }

        // Idle right
        if (!this.anims.exists('idle-right')) {
            this.anims.create({
                key: 'idle-right',
                frames: this.anims.generateFrameNumbers(charKey, { start: 12, end: 13 }),
                frameRate: 2,
                repeat: -1
            });
        }

        // Walk right
        if (!this.anims.exists('walk-right')) {
            this.anims.create({
                key: 'walk-right',
                frames: this.anims.generateFrameNumbers(charKey, { start: 14, end: 15 }),
                frameRate: frameRate,
                repeat: -1
            });
        }
    }

    private setupControls() {
        // Arrow keys
        this.cursors = this.input.keyboard!.createCursorKeys();

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

        // Pet toggle - press O to show/hide pet
        const keyO = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.O);
        keyO.on('down', () => {
            this.petManager.toggle();
            const isActive = this.petManager.getIsActive();
            this.showToastMessage(isActive ? 'Pet summoned!' : 'Pet dismissed', isActive ? 0x8BC34A : 0x9E9E9E);
        });
    }

    private initializeInventory() {
        // Seeds are already initialized in toolbarItems with count: 3
        // Initialize farm plot states for all 16 plots (4x4 grid)
        const plotPositions = this.getPlotPositions();

        plotPositions.forEach((pos, index) => {
            const key = `${pos.x},${pos.y}`;
            const isOwned = index < this.ownedPlotsCount;
            this.farmLandStates.set(key, {
                tilled: true,
                planted: false,
                plantStage: 0,
                cropType: null,
                locked: !isOwned,
                plotIndex: index
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
        this.cameras.main?.ignore(this.timeText);
        this.updateTimeDisplay();

        // User Profile (top right)
        this.createUserProfileUI();

        // Mini map (below time display)
        this.createMiniMap();

        // Toolbar (bottom center)
        this.toolbarManager.createToolbar();
    }

    /**
     * Create mini map below the time display - shows farm layout
     */
    private createMiniMap() {
        const mapX = 20; // Align with time display
        const mapY = 50; // Below time display
        const mapSize = this.MINIMAP_SIZE;

        // Container for all mini map elements
        this.miniMapContainer = this.add.container(mapX, mapY);
        this.miniMapContainer.setDepth(5000);

        // Create RenderTexture for mini map background
        const rt = this.add.renderTexture(mapSize / 2, mapSize / 2, mapSize, mapSize);
        rt.setOrigin(0.5);

        // Draw water tile as background (tiled)
        const waterTileSize = mapSize / 6;
        for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 6; x++) {
                const waterTile = this.add.image(0, 0, 'water-tileset', 0);
                waterTile.setDisplaySize(waterTileSize + 1, waterTileSize + 1);
                rt.draw(waterTile, x * waterTileSize + waterTileSize / 2, y * waterTileSize + waterTileSize / 2);
                waterTile.destroy();
            }
        }

        // Draw grass (center island area - matching island proportions)
        // Island is roughly from tile 10-40 (30 tiles out of 50)
        const islandRatio = 30 / 50;
        const islandSize = mapSize * islandRatio;
        const islandOffset = (mapSize - islandSize) / 2;
        const grassTileSize = islandSize / 5;
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                // Use frame 12 (center tile) for seamless grass
                const grassTile = this.add.image(0, 0, 'grass-tileset', 12);
                grassTile.setDisplaySize(grassTileSize + 1, grassTileSize + 1);
                rt.draw(grassTile, islandOffset + x * grassTileSize + grassTileSize / 2, islandOffset + y * grassTileSize + grassTileSize / 2);
                grassTile.destroy();
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
        const smallEmojiStyle = { fontSize: '8px', resolution: 2 };

        // Farm area (4x4 grid center at 25.5, 25.5) - single icon
        const farmPos = tileToMiniMap(25.5, 25.5);
        const farm = this.add.text(farmPos.x, farmPos.y, '🌿', smallEmojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(farm);

        // Warehouse (at 25, 18) - warehouse emoji
        const warehousePos = tileToMiniMap(25, 18);
        const warehouse = this.add.text(warehousePos.x, warehousePos.y, '🏠', smallEmojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(warehouse);

        // Shop (at 20, 21) - cart emoji
        const shopPos = tileToMiniMap(20, 21);
        const shop = this.add.text(shopPos.x, shopPos.y, '🛒', smallEmojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(shop);

        // Mailbox (at 29, 21) - mailbox emoji
        const mailboxPos = tileToMiniMap(29, 21);
        const mailbox = this.add.text(mailboxPos.x, mailboxPos.y, '📬', smallEmojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(mailbox);

        // Well (at 30, 25) - water drop emoji
        const wellPos = tileToMiniMap(30, 25);
        const well = this.add.text(wellPos.x, wellPos.y, '💧', smallEmojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(well);

        // Station (at 41.5, 24) - ship emoji
        const stationPos = tileToMiniMap(41.5, 24);
        const station = this.add.text(stationPos.x, stationPos.y, '🚢', smallEmojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(station);

        // Checkin sign (at 23, 21) - calendar emoji
        const checkinPos = tileToMiniMap(23, 21);
        const checkin = this.add.text(checkinPos.x, checkinPos.y, '📅', smallEmojiStyle).setOrigin(0.5);
        this.miniMapContainer.add(checkin);

        // Player avatar (use character avatar image)
        const avatarKey = `${this.currentCharacterKey}-avatar`;
        this.miniMapPlayerAvatar = this.add.image(mapSize / 2, mapSize / 2, avatarKey);
        this.miniMapPlayerAvatar.setDisplaySize(12, 12);
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

    // Toolbar methods moved to ToolbarManager
    // Helper methods still needed by game logic:

    private getTotalChestItems(): number {
        return this.chestInventory.reduce((total, slot) => total + (slot?.count || 0), 0);
    }

    private isChestFull(): boolean {
        const totalItems = this.getTotalChestItems();
        return totalItems >= this.CHEST_SLOTS * this.MAX_PER_SLOT;
    }

    /**
     * Get display name for item type (for event checkin rewards)
     */
    private getItemDisplayName(itemType: string): string {
        const nameMap: Record<string, string> = {
            // Seeds
            'SEED_ALGAE': 'Algae Seed',
            'SEED_MUSHROOM': 'Mushroom Spore',
            'SEED_TREE': 'Tree Seed',
            'SEED_SOCIAL': 'Social Seed',
            'SEED_TECHNICAL': 'Technical Seed',
            'SEED_BRANDED': 'Branded Seed',
            // Fruits
            'FRUIT_ALGAE': 'Algae',
            'FRUIT_MUSHROOM': 'Mushroom',
            'FRUIT_TREE': 'Tree Fruit',
            'FRUIT_SOCIAL': 'Social Fruit',
            'FRUIT_TECHNICAL': 'Technical Fruit',
            'FRUIT_BRANDED': 'Branded Fruit',
            // Tools and items
            'WATER': 'Water',
            'BUG_GLOVE': 'Bug Glove',
            'PESTICIDE': 'Pesticide',
            'FERTILIZER_COMMON': 'Common Fertilizer',
            'FERTILIZER_RARE': 'Rare Fertilizer',
            'FERTILIZER_EPIC': 'Epic Fertilizer',
            'FERTILIZER_LEGENDARY': 'Legend Fertilizer',
        };
        return nameMap[itemType] || itemType;
    }

    private addToChest(fruitType: PlantType): boolean {
        // Check if chest is full
        if (this.isChestFull()) {
            return false;
        }

        // Find existing slot with same type and space available
        for (let i = 0; i < this.chestInventory.length; i++) {
            const slot = this.chestInventory[i];
            if (slot && slot.type === fruitType && slot.count < this.MAX_PER_SLOT) {
                slot.count++;
                return true;
            }
        }

        // Find empty slot
        for (let i = 0; i < this.CHEST_SLOTS; i++) {
            if (!this.chestInventory[i] || this.chestInventory[i].count === 0) {
                this.chestInventory[i] = { type: fruitType, count: 1 };
                return true;
            }
        }

        // No space available
        return false;
    }

    private selectToolbarSlot(index: number) {
        if (index < 0 || index >= this.toolbarItems.length) return;
        this.selectedToolIndex = index;
        this.toolbarManager.createToolbar();
    }

    private updateToolbar() {
        // Safety check - ensure scene is still active
        if (!this.scene || !this.cameras || !this.cameras.main) {
            return;
        }
        this.toolbarManager.createToolbar();
    }

    private closeSeedSelector() {
        this.toolbarManager.closeSeedSelector();
    }

    private closeChestPanel() {
        this.toolbarManager.closeChestPanel();
    }

    private getSelectedPlantType(): PlantType {
        return PLANT_TYPES[this.selectedSeedIndex];
    }

    private onWalletConnected(address: string) {
        this.createWalletDisplay();

        // Fetch seed, fertilizer, fruit, and water inventory from API
        this.fetchSeedInventory();
        this.fetchFertilizerInventory();
        this.fetchFruitInventory();
        this.fetchWaterInventory();

        // Pre-fetch water well status so modal opens instantly
        this.wellManager?.prefetchWaterStatus();

        // Load garden data (planted crops)
        this.loadGardenData();

        // Fetch user profile (balances, etc.)
        this.fetchUserProfile();
    }

    private createWalletDisplay() {
        // Wallet display is now integrated into user profile UI
        // Clear any previous wallet UI elements
        this.walletUIElements.forEach(el => el.destroy());
        this.walletUIElements = [];
    }

    // Profile methods moved to ProfileManager

    private createUserProfileUI() {
        this.profileManager.createProfileUI();
    }

    /**
     * Refresh all UI elements after data changes
     * Called by GameDataService when data is refreshed
     */
    private refreshAllUI(): void {
        
        // Sync global state with latest API data (if available)
        const cachedData = GameDataService.getCachedData();
        
        if (cachedData && this.gameState.isReady()) {
            // Update currency from API cache - use user.balanceGold as primary source
            const apiGold = cachedData.user?.balanceGold ?? cachedData.currencies?.gold ?? 0;
            const apiGem = cachedData.user?.balanceGem ?? cachedData.currencies?.gem ?? 0;

            // Only update if different to avoid triggering unnecessary state changes
            const currentState = this.gameState.get();
            if (currentState.currency.gold !== apiGold || currentState.currency.gem !== apiGem) {
                this.gameState.setCurrency(apiGold, apiGem);
                // Don't return early - still need to update UI
            }

            // Sync chest inventory (fruits) from cached data
            if (cachedData.fruits) {
                this.chestInventory = [];
                for (const item of cachedData.fruits) {
                    if (item.count > 0) {
                        let remaining = item.count;
                        while (remaining > 0 && this.chestInventory.length < this.CHEST_SLOTS) {
                            const slotCount = Math.min(remaining, this.MAX_PER_SLOT);
                            this.chestInventory.push({ type: item.type, count: slotCount });
                            remaining -= slotCount;
                        }
                    }
                }
            }

            // Sync water count from API (no cache for tools)
            this.fetchWaterInventory();

            // Sync streak data to CheckinManager (fixes notification icon after background refresh)
            if (cachedData.streak) {
                this.checkinManager.setStreakFromCache(cachedData.streak.status, cachedData.streak.history);
            }

            // Sync missions to MailboxManager
            if (cachedData.missions) {
                this.mailboxManager.setMissionsFromCache(cachedData.missions);
            }
        }

        // Update profile display (gold, gems, XP, etc.)
        this.createUserProfileUI();

        // Update toolbar (seeds, water, fertilizers, etc.)
        this.updateToolbar();

    }

    /**
     * Handle gamedata:updated event from EventBus
     * This is a backup mechanism when callback is not registered
     */
    private onGameDataUpdated(): void {
        this.refreshAllUI();
    }

    // Delegate methods for other managers:

    private showBuyPlotModal(tileX: number, tileY: number, plotIndex: number) {
        this.plotManager.showBuyPlotModal(tileX, tileY, plotIndex);
    }

    private showToastMessage(text: string, color: number = 0xFFFFFF) {
        // Guard: scene may be destroyed during navigation
        if (!this.cameras || !this.cameras.main) {
            return;
        }

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
        this.cameras.main?.ignore(msgText);

        this.tweens.add({
            targets: msgText,
            y: screenHeight / 2 + 60,
            alpha: 0,
            duration: 5000, // 5 seconds for readability
            ease: 'Cubic.easeOut',
            onComplete: () => {
                msgText.destroy();
            }
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
        this.cameras.main?.ignore(this.joystickBase);

        // Joystick thumb
        this.joystickThumb = this.add.circle(joystickX, joystickY, thumbRadius, 0xffffff, 0.8);
        this.joystickThumb.setDepth(5011);
        this.cameras.main?.ignore(this.joystickThumb);

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
        this.cameras.main?.ignore(this.actionButton);

        // Action button text
        this.actionButtonText = this.add.text(
            this.scale.width - 80,
            this.scale.height - 80,
            '⚒',
            { fontSize: '32px' }
        );
        this.actionButtonText.setOrigin(0.5);
        this.actionButtonText.setDepth(5011);
        this.cameras.main?.ignore(this.actionButtonText);

        this.actionButton.on('pointerdown', () => {
            this.performAction();
        });
    }

    private setupInteractions() {
        // Handle clicks for UI interactions (close selectors, etc.)
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

            // Check if seed option was just clicked
            if (this.seedOptionJustClicked) {
                this.seedOptionJustClicked = false;
                return;
            }

            // Check if seed selector is open - close it when clicking outside
            if (this.seedSelectorOpen) {
                this.closeSeedSelector();
                return;
            }

            // Movement by click is disabled - use joystick or keyboard only
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
            return;
        }

        // Check if plot is locked
        if (state.locked) {
            if (state.plotIndex !== undefined) {
                this.showBuyPlotModal(playerTileX, playerTileY, state.plotIndex);
            }
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

    private async plantSeed(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);
        const selectedPlantType = this.getSelectedPlantType();

        if (state && state.tilled && !state.planted) {
            // Check if plot is locked
            if (state.locked) {
                return;
            }

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

                // Play plant sound effect
                this.soundManager.playPlantSound();

                // Show plant sprite (sprout stage - when planted, seed becomes sprout)
                this.showPlant(x, y, selectedPlantType, PLANT_STAGES.SPROUT);

                // Create health bar
                this.createHealthBar(x, y, tileKey);

                // Use landId from state if available, otherwise use tileKey
                const landId = state.landId || tileKey;
                const seedType = SeedService.mapPlantTypeToApiSeedType(selectedPlantType);

                // Try WebSocket first, fallback to REST API
                const socketService = getSocketService();
                if (socketService.isConnected()) {
                    // Store pending plant action for handling response
                    this.pendingPlantAction = {
                        tileKey,
                        landId,
                        seedType: selectedPlantType
                    };
                    
                    const emitted = socketService.plantSeed(landId, seedType);
                    if (!emitted) {
                        // WebSocket failed, fallback to REST
                        this.plantSeedViaRest(tileKey, landId, selectedPlantType);
                    }
                    // Response will come via action_success or action_error events
                } else {
                    // No WebSocket, use REST API
                    this.plantSeedViaRest(tileKey, landId, selectedPlantType);
                }
            } else {
            }
        }
    }

    /**
     * Plant seed via REST API (fallback when WebSocket not available)
     */
    private async plantSeedViaRest(tileKey: string, landId: string, plantType: 'algae' | 'mushroom' | 'tree'): Promise<void> {
        try {
            const plantId = await SeedService.plantSeed(landId, plantType);
            if (plantId) {
                const currentState = this.farmLandStates.get(tileKey);
                if (currentState) {
                    currentState.plantId = plantId;
                }
            }
        } catch (error) {
            console.error('[FarmingGame] Error planting seed via REST:', error);
        }
    }

    private async waterCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);
        const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');

        // Check if we have water
        if (!wateringCan || wateringCan.count === undefined || wateringCan.count <= 0) {
            this.showToastMessage('No water left!', 0xef4444);
            return;
        }

        if (state && state.planted && state.cropType) {
            // Cannot water dead plants
            if (state.isDead) {
                this.showToastMessage('This plant is dead!', 0xef4444);
                return;
            }

            // If no plantId, plant is not synced with backend
            if (!state.plantId) {
                this.showToastMessage('Plant not synced yet', 0xfbbf24);
                return;
            }

            // === OPTIMISTIC UI UPDATE ===
            // Update UI immediately for responsive feel
            // Server will send plant_update and inventory_update events

            // Save state for potential revert on error
            this.pendingWaterAction = {
                tileKey,
                previousWaterBalance: state.hydration?.waterBalance ?? 0,
                previousWaterCount: wateringCan.count
            };

            // Immediately update local state
            state.lastCareTime = Date.now();
            this.updateHealthBarAfterWater(tileKey);
            wateringCan.count--;

            // If plant was wilted, restore it optimistically
            if (state.isWilted) {
                state.isWilted = false;
            }

            // Play water sound effect immediately
            this.soundManager.playWaterSound();

            // Update toolbar immediately
            this.updateToolbar();
            this.showToastMessage('Watered!', 0x4ade80);

            // Send WebSocket event (fire-and-forget)
            // UI updates will come via plant_update and inventory_update events
            const plantId = state.plantId;
            const usedWebSocket = GardenService.waterPlantWS(plantId);
            
            // If WebSocket not available, fall back to REST API
            if (!usedWebSocket) {
                GardenService.waterPlant(plantId).then(result => {
                    if (result.success) {
                        this.loadGardenData();
                    } else {
                        this.showToastMessage(result.message || 'Water failed!', 0xef4444);
                    }
                }).catch(error => {
                    this.showToastMessage('Network error!', 0xef4444);
                });
            }
        }
    }

    private fertilizeCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);
        
        // Get selected fertilizer type
        const fertilizerTypes: ('common' | 'rare' | 'epic' | 'legendary')[] = ['common', 'rare', 'epic', 'legendary'];
        const selectedFertilizerType = fertilizerTypes[this.selectedFertilizerIndex];
        const currentFertilizerCount = this.fertilizerCounts[selectedFertilizerType];

        // Check if we have fertilizer of the selected type
        if (currentFertilizerCount <= 0) {
            this.showToastMessage('No fertilizer!', 0xfbbf24);
            return;
        }

        if (state && state.planted && state.cropType) {
            // Cannot fertilize dead plants
            if (state.isDead) {
                this.showToastMessage('Plant is dead!', 0xef4444);
                return;
            }

            // Check if landId is available for API call
            if (!state.landId) {
                this.showToastMessage('Plant not synced yet', 0xfbbf24);
                return;
            }

            // === OPTIMISTIC UI UPDATE ===
            // Store previous values for potential rollback
            const previousFertilizerCount = this.fertilizerCounts[selectedFertilizerType];
            const previousLastCareTime = state.lastCareTime;
            const previousPlantStage = state.plantStage;
            const wasWilted = state.isWilted;

            // Immediately update local state
            state.lastCareTime = Date.now();
            this.updateHealthBarAfterWater(tileKey);

            // If plant was wilted, restore it optimistically
            if (state.isWilted) {
                state.isWilted = false;
            }

            // Decrease fertilizer count optimistically
            this.fertilizerCounts[selectedFertilizerType]--;
            this.updateToolbar();

            // Play success sound immediately
            this.soundManager.playSuccessSound();
            this.showToastMessage('Fertilized!', 0x4ade80);


            // Call API in background
            const landId = state.landId;
            const apiFertilizerType = FertilizerService.mapToApiFertilizerType(selectedFertilizerType);
            
            FertilizerService.applyFertilizer(landId, apiFertilizerType).then(result => {
                if (!result || !result.success) {
                    // API failed - rollback optimistic update
                    this.fertilizerCounts[selectedFertilizerType] = previousFertilizerCount;
                    state.lastCareTime = previousLastCareTime;
                    state.plantStage = previousPlantStage;
                    state.isWilted = wasWilted;
                    this.updateToolbar();
                    this.showToastMessage('Fertilize failed!', 0xef4444);
                } else {
                    // API succeeded - update with actual data from server
                    
                    // Update plant stage if changed
                    if (result.stageChanged) {
                        const newStage = GardenService.mapStageToGameStage(result.newStage);
                        state.plantStage = newStage;
                        this.updatePlantSprite(x, y, state.cropType!, newStage, false, false);
                    }

                    // Refresh garden data to get updated state
                    this.loadGardenData();
                }
            }).catch(error => {
                // Network error - rollback
                this.fertilizerCounts[selectedFertilizerType] = previousFertilizerCount;
                state.lastCareTime = previousLastCareTime;
                state.plantStage = previousPlantStage;
                state.isWilted = wasWilted;
                this.updateToolbar();
                this.showToastMessage('Network error!', 0xef4444);
            });
        }
    }

    private async harvestCrop(tileKey: string, x: number, y: number) {
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
                state.plantId = undefined;

                // Remove plant sprite
                this.removePlant(x, y);

                return;
            }

            if (state.plantStage >= PLANT_STAGES.MATURE) {
                // Check if chest has space
                if (this.isChestFull()) {
                    return;
                }

                // Harvest successful!
                const wasWilted = state.isWilted;
                const harvestedType = state.cropType;
                const plantId = state.plantId;

                // Add fruit to chest
                this.addToChest(harvestedType);

                // Reset state
                state.planted = false;
                state.plantStage = 0;
                state.cropType = null;
                state.isDead = false;
                state.isWilted = false;
                state.lastCareTime = undefined;
                state.plantId = undefined;

                // Remove plant sprite
                this.removePlant(x, y);

                // Update toolbar to show new chest count
                this.updateToolbar();

                if (wasWilted) {
                } else {
                }

                // Send WebSocket event to harvest plant on backend (fire-and-forget)
                // UI updates will come via land_update and inventory_update events
                if (plantId) {
                    const usedWebSocket = GardenService.harvestPlantWS(plantId);
                    
                    // If WebSocket not available, fall back to REST API
                    if (!usedWebSocket) {
                        GardenService.harvestPlant(plantId).then(success => {
                            if (success) {
                                GameDataService.refreshAfterGardenAction();
                            }
                        }).catch(error => {
                        });
                    }
                } else {
                }
            } else {
            }
        }
    }

    private digestCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);

        if (state && state.planted && state.cropType) {
            const landId = state.landId;

            // Remove plant regardless of stage or state
            state.planted = false;
            state.plantStage = 0;
            state.cropType = null;
            state.isDead = false;
            state.isWilted = false;
            state.lastCareTime = undefined;
            state.plantId = undefined;

            // Remove plant sprite and health bar
            this.removePlant(x, y);


            // Call API to clear land on backend
            if (landId) {
                GardenService.clearLand(landId).then(result => {
                    if (result?.success) {
                    } else {
                    }
                }).catch(error => {
                });
            } else {
            }
        } else {
        }
    }

    /**
     * Find tile by plantId and water it (called from PlantDetailManager)
     */
    private waterPlantById(plantId: string): void {
        // Find tile with this plantId
        for (const [tileKey, state] of this.farmLandStates.entries()) {
            if (state.plantId === plantId) {
                const [xStr, yStr] = tileKey.split(',');
                const x = parseInt(xStr, 10);
                const y = parseInt(yStr, 10);
                this.waterCrop(tileKey, x, y);
                return;
            }
        }
    }

    /**
     * Find tile by plantId and harvest it (called from PlantDetailManager)
     */
    private harvestPlantById(plantId: string): void {
        // Find tile with this plantId
        for (const [tileKey, state] of this.farmLandStates.entries()) {
            if (state.plantId === plantId) {
                const [xStr, yStr] = tileKey.split(',');
                const x = parseInt(xStr, 10);
                const y = parseInt(yStr, 10);
                this.harvestCrop(tileKey, x, y);
                return;
            }
        }
    }

    /**
     * Find tile by landId and remove plant (called from PlantDetailManager)
     */
    private removePlantByLandId(landId: string): void {
        // Find tile with this landId
        for (const [tileKey, state] of this.farmLandStates.entries()) {
            if (state.landId === landId) {
                const [xStr, yStr] = tileKey.split(',');
                const x = parseInt(xStr, 10);
                const y = parseInt(yStr, 10);
                this.digestCrop(tileKey, x, y);
                return;
            }
        }
    }

    private showPlant(x: number, y: number, cropType: PlantType, stage: number, isDead: boolean = false, isWilted: boolean = false) {
        // IMPORTANT: Remove existing plant sprite first to prevent duplicates
        const existingPlant = this.children.getByName(`plant-${x}-${y}`);
        if (existingPlant) {
            existingPlant.destroy();
        }

        const cropDef = CROP_DEFINITIONS[cropType];
        let imageKey: string;
        let frameIndex: number | undefined; // For spritesheet-based plants
        let stageDescription: string;

        if (isDead) {
            imageKey = cropDef.deathImage;
            stageDescription = 'DEAD';
        } else if (stage === PLANT_STAGES.MATURE) {
            imageKey = cropDef.fruitImage; // Ready to harvest (mature stage)
            stageDescription = 'MATURE (5)';
        } else if (stage >= PLANT_STAGES.DIGGING && stage <= PLANT_STAGES.BLOOM) {
            // Check if plant uses spritesheet or individual images
            if (cropDef.spritesheet) {
                imageKey = cropDef.spritesheet;
                
                if (cropDef.stageCount === 2) {
                    // 2-stage plants (algae, mushroom): map 6 API stages to 2 visual frames
                    // DIGGING(0), SEED(1), SPROUT(2) -> frame 0 (seedling)
                    // GROWING(3), BLOOM(4) -> frame 2 (mature) - skip frame 1
                    frameIndex = stage <= PLANT_STAGES.SPROUT ? 0 : 2;
                } else if (cropDef.stageCount === 3) {
                    // 3-stage plants with spritesheet: map 6 API stages to 3 frames
                    // DIGGING(0), SEED(1) -> frame 0
                    // SPROUT(2), GROWING(3) -> frame 1
                    // BLOOM(4) -> frame 2
                    if (stage <= PLANT_STAGES.SEED) {
                        frameIndex = 0;
                    } else if (stage <= PLANT_STAGES.GROWING) {
                        frameIndex = 1;
                    } else {
                        frameIndex = 2;
                    }
                }
            } else {
                // Plants using individual images (tree): 3 visual stages
                // DIGGING(0), SEED(1) -> image 0 (tree-plant-1)
                // SPROUT(2), GROWING(3) -> image 1 (tree-plant-2)
                // BLOOM(4) -> image 2 (tree-plant-3)
                let imageIndex: number;
                if (stage <= PLANT_STAGES.SEED) {
                    imageIndex = 0;
                } else if (stage <= PLANT_STAGES.GROWING) {
                    imageIndex = 1;
                } else {
                    imageIndex = 2;
                }
                imageIndex = Math.min(imageIndex, cropDef.growthImages.length - 1);
                imageKey = cropDef.growthImages[imageIndex];
            }

            const stageNames: Record<number, string> = {
                [PLANT_STAGES.DIGGING]: 'DIGGING (0)',
                [PLANT_STAGES.SEED]: 'SEED (1)',
                [PLANT_STAGES.SPROUT]: 'SPROUT (2)',
                [PLANT_STAGES.GROWING]: 'GROWING (3)',
                [PLANT_STAGES.BLOOM]: 'BLOOM (4)',
            };
            stageDescription = stageNames[stage] || `STAGE ${stage}`;
        } else {
            // Fallback for unknown stages
            if (cropDef.spritesheet) {
                imageKey = cropDef.spritesheet;
                // Use last visual frame: frame 2 for both 2-stage and 3-stage spritesheets
                frameIndex = 2;
            } else {
                imageKey = cropDef.growthImages[cropDef.growthImages.length - 1];
            }
            stageDescription = `UNKNOWN (${stage})`;
        }

        // DEBUG: Log stage to image mapping

        // Plant size (scale down from 157x153 to fit tile)
        const plantSize = 16;

        // Create plant image - use frame index for spritesheets
        const plant = frameIndex !== undefined
            ? this.add.image(
                x * this.TILE_SIZE + this.TILE_SIZE / 2,
                y * this.TILE_SIZE + this.TILE_SIZE / 2,
                imageKey,
                frameIndex
            )
            : this.add.image(
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

        // Make plant clickable to show details
        plant.setInteractive({ useHandCursor: true });
        plant.on('pointerdown', () => {
            const tileKey = `${x},${y}`;
            const state = this.farmLandStates.get(tileKey);
            if (state && state.planted) {
                // Get health percentage from health bar if available
                let healthPercentage: number | undefined;
                if (state.healthBarFill && state.healthBarBg) {
                    const bgWidth = state.healthBarBg.width;
                    const fillWidth = state.healthBarFill.width;
                    healthPercentage = bgWidth > 0 ? (fillWidth / (bgWidth - 2)) * 100 : 100;
                }

                this.plantDetailManager.open({
                    tileState: state,
                    tileX: x,
                    tileY: y,
                    healthPercentage
                });
            }
        });

        // Make sure UI camera ignores this game object
        this.uiCamera.ignore(plant);
    }

    private removePlant(x: number, y: number) {
        const plant = this.children.getByName(`plant-${x}-${y}`);
        if (plant) {
            plant.destroy();
        }

        // Also remove health bar (border, bg, fill)
        const border = this.children.getByName(`healthbar-border-${x}-${y}`);
        if (border) {
            border.destroy();
        }

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

        // Health bar dimensions - with thin border and rounded corners
        const barWidth = 12;
        const barHeight = 3;
        const barY = y * this.TILE_SIZE - 2; // Above the plant
        const barX = x * this.TILE_SIZE + this.TILE_SIZE / 2 - barWidth / 2;
        const depth = y * this.TILE_SIZE + 100;
        const cornerRadius = 1;

        // Create graphics for background with border
        const bgGraphics = this.add.graphics();
        bgGraphics.setDepth(depth);
        bgGraphics.setName(`healthbar-bg-${x}-${y}`);

        // Draw black border (thin stroke)
        bgGraphics.lineStyle(0.5, 0x000000, 1);
        bgGraphics.fillStyle(0x333333, 1);
        bgGraphics.fillRoundedRect(barX, barY - barHeight / 2, barWidth, barHeight, cornerRadius);
        bgGraphics.strokeRoundedRect(barX, barY - barHeight / 2, barWidth, barHeight, cornerRadius);

        this.uiCamera.ignore(bgGraphics);

        // Store as any since healthBarBg expects Rectangle but we use Graphics
        state.healthBarBg = bgGraphics as unknown as Phaser.GameObjects.Rectangle;

        // Fill bar (green, will be resized based on health)
        state.healthBarFill = this.add.rectangle(
            barX + barWidth / 2,
            barY,
            barWidth - 1,
            barHeight - 1,
            0x4ade80,
            1
        );
        state.healthBarFill.setDepth(depth + 1);
        state.healthBarFill.setName(`healthbar-fill-${x}-${y}`);
        this.uiCamera.ignore(state.healthBarFill);
    }

    private updateHealthBar(tileKey: string) {
        // NOTE: Health bar is now managed by backend API data
        // The health bar is set when loading garden data from the backend
        // We don't recalculate it based on local time anymore
        // The backend provides progress.percentage which is the source of truth
        
        // This method is kept for compatibility but does nothing
        // Health bar updates happen in loadGardenData() when fresh data is fetched
    }

    /**
     * Update health bar optimistically after watering
     * Adds 3 hours (1 water drop) to current waterBalance
     */
    private updateHealthBarAfterWater(tileKey: string) {
        const state = this.farmLandStates.get(tileKey);
        if (!state || !state.healthBarFill) return;

        const WATER_DROP_HOURS = 3;
        const plantType = state.cropType || 'algae';
        const maxWaterHours = getMaxWaterHours(plantType);

        // Calculate new waterBalance (current + 3, capped at max)
        const currentWaterBalance = state.hydration?.waterBalance ?? 0;
        const newWaterBalance = Math.min(currentWaterBalance + WATER_DROP_HOURS, maxWaterHours);

        // Update local state so WebSocket update doesn't flash
        if (state.hydration) {
            state.hydration.waterBalance = newWaterBalance;
            state.hydration.hoursToDeath = newWaterBalance;
        }

        // Calculate health percentage
        const healthPercent = Math.min(newWaterBalance / maxWaterHours, 1);
        const maxWidth = 11; // barWidth(12) - 1

        // Update health bar size
        state.healthBarFill.width = Math.max(maxWidth * healthPercent, 1);

        // Color gradient: green -> yellow -> red
        if (healthPercent > 0.6) {
            state.healthBarFill.setFillStyle(0x4ade80, 1); // Green
        } else if (healthPercent > 0.3) {
            state.healthBarFill.setFillStyle(0xfbbf24, 1); // Yellow/Orange
        } else {
            state.healthBarFill.setFillStyle(0xef4444, 1); // Red
        }

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
        // NOTE: Plant health and lifecycle is now managed by the backend API
        // The backend tracks plant stages, watering, and death through the /garden endpoint
        // We only update the health bar display here based on local state
        // The actual plant state (stage, isDead, etc.) is synced from the backend
        
        this.farmLandStates.forEach((state, tileKey) => {
            if (!state.planted || !state.cropType) return;

            // Skip dead plants (but keep their health bar hidden)
            if (state.isDead) return;

            // Update health bar display
            this.updateHealthBar(tileKey);
        });
    }

    private onNewDay() {
    }

    update() {
        // Don't allow movement when any modal is open
        if (this.factoryModalOpen || this.chestOpen || this.seedSelectorOpen ||
            this.mailboxModalOpen || this.shopModalOpen || this.checkinModalOpen ||
            this.userProfileModalOpen || this.buyPlotModalOpen) {
            this.player.setVelocity(0, 0);
            return;
        }

        // Handle movement with collision check
        const speed = this.playerSpeed;
        let velocityX = 0;
        let velocityY = 0;

        // Keyboard controls (arrow keys only)
        if (this.cursors.left.isDown) {
            velocityX = -speed;
        } else if (this.cursors.right.isDown) {
            velocityX = speed;
        }

        if (this.cursors.up.isDown) {
            velocityY = -speed;
        } else if (this.cursors.down.isDown) {
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

        // Update animations and walk sound
        if (velocityX !== 0 || velocityY !== 0) {
            // Start walk sound if not already playing
            this.soundManager.startWalkSound();

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
            // Stop walk sound when idle
            this.soundManager.stopWalkSound();

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

        // Update mini map
        this.updateMiniMap();

        // Update pet position
        this.petManager?.update();
    }

    shutdown() {

        // Cleanup socket connection and event listeners
        if (this.plantUpdateHandler) {
            this.plantUpdateHandler.destroy();
        }
        if (this.socketService) {
            this.socketService.disconnect();
        }
        if (this.missionSocketService) {
            this.missionSocketService.disconnect();
        }
        EventBus.off('socket:connected', this.onSocketConnected, this);
        EventBus.off('socket:disconnected', this.onSocketDisconnected, this);
        EventBus.off('socket:inventory_update', this.onInventoryUpdate, this);
        EventBus.off('socket:land_update', this.onLandUpdate, this);
        EventBus.off('socket:currency_update', this.onCurrencyUpdate, this);
        EventBus.off('socket:action_success', this.onActionSuccess, this);
        EventBus.off('socket:action_error', this.onActionError, this);

        EventBus.off('wallet-connected', this.onWalletConnected, this);
        this.scale.off('resize', this.onResize, this);

        // Cleanup managers
        this.soundManager?.destroy();
        this.stationManager?.destroy();
        this.petManager?.destroy();
        this.profileManager?.destroy();
        this.toolbarManager?.destroy();
        this.checkinManager?.destroy();
        this.factoryManager?.destroy();
        this.mailboxManager?.destroy();
        this.wellManager?.destroy();
        this.warehouseManager?.destroy();
        this.plotManager?.destroy();
        this.plantDetailManager?.destroy();

        // Stop all tweens to prevent memory leaks
        this.tweens.killAll();

        // Stop all time events (game loop, refresh timers, etc.)
        this.time.removeAllEvents();
    }
}
