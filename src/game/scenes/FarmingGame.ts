import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { ISLAND_MAP_DATA } from './IslandMapData';
import { UserService } from '../UserService';
import { SeedService } from '../SeedService';
import { FertilizerService } from '../FertilizerService';
import { GardenService } from '../GardenService';
import { FruitService } from '../FruitService';
import { GameDataService } from '../GameDataService';

// Import managers
import {
    CheckinManager,
    ShopManager,
    FactoryManager,
    MailboxManager,
    ProfileManager,
    ToolbarManager,
    PlotManager,
    SoundManager,
    // Import types from GameTypes
    PlantType,
    TileState,
    ToolbarItem,
    PLANT_STAGES,
    PLANT_TYPES,
    CROP_DEFINITIONS,
    DEATH_TIMER_MS
} from '../managers';

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
        { type: 'tool', name: 'wateringCan', count: 100 },
        { type: 'seed', name: 'seed' }, // count is managed by seedCounts
        { type: 'tool', name: 'fertilizer' }, // count is managed by fertilizerCounts
        { type: 'tool', name: 'digest' },
        { type: 'tool', name: 'chest' },
    ];

    // Chest inventory system
    private readonly CHEST_SLOTS = 12; // 3 columns x 4 rows
    private readonly MAX_PER_SLOT = 50; // Max 50 fruits per slot
    private chestInventory: { type: PlantType; count: number }[] = []; // Each slot: {type, count}
    private chestOpen: boolean = false;

    // Factory system (managed by FactoryManager)
    private factoryModalOpen: boolean = false;

    // UI
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private timeText!: Phaser.GameObjects.Text;
    private dayCounter: number = 1;
    private timeOfDay: number = 7 * 60; // 7:00 AM in minutes

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
    private shopManager!: ShopManager;
    private factoryManager!: FactoryManager;
    private mailboxManager!: MailboxManager;
    private profileManager!: ProfileManager;
    private toolbarManager!: ToolbarManager;
    private plotManager!: PlotManager;
    private soundManager!: SoundManager;

    constructor() {
        super('FarmingGame');
    }

    create() {
        // Create water animation first
        this.createWaterAnimation();

        // Create the island map
        this.createIslandMap();

        // Initialize all managers
        this.initializeManagers();

        // Create factory using manager
        this.factoryManager.createFactory();

        // Create check-in sign using manager
        this.checkinManager.createCheckinSign(this.TILE_SIZE);

        // Create mailbox using manager
        this.mailboxManager.createMailbox();
        // Note: Missions are loaded from cache or API in loadGameDataFromCache()

        // Create shop using manager
        this.shopManager.createShop(this.TILE_SIZE);

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

        // Periodic garden data refresh from backend (every 30 seconds)
        // This ensures plant stages and health are synced with the backend
        this.time.addEvent({
            delay: 30000, // Refresh every 30 seconds
            callback: () => {
                console.log('[Periodic Refresh] Syncing garden data from backend...');
                this.loadGardenData();
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

        // Handle screen resize
        this.scale.on('resize', this.onResize, this);

        // Start playing theme music
        this.soundManager.playRandomTheme();

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
        this.checkinManager = new CheckinManager(this, {
            onRewardWater: () => {
                const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');
                if (wateringCan) wateringCan.count = (wateringCan.count || 0) + 1;
            },
            onRewardMushroomSeed: () => {
                this.seedCounts.mushroom++;
            },
            updateToolbar: () => this.updateToolbar(),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        });

        // ShopManager
        this.shopManager = new ShopManager(this, {
            getPlayerGold: () => this.playerGold,
            setPlayerGold: (value) => { this.playerGold = value; },
            getPlayerGems: () => this.playerGems,
            setPlayerGems: (value) => { this.playerGems = value; },
            getSeedCounts: () => this.seedCounts,
            getChestInventory: () => this.chestInventory,
            setChestInventory: (inv) => { this.chestInventory = inv; },
            getToolbarItems: () => this.toolbarItems,
            updateToolbar: () => this.updateToolbar(),
            refreshProfileUI: () => this.createUserProfileUI(),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        });

        // FactoryManager (Phygital Exchange)
        this.factoryManager = new FactoryManager(this, {
            getChestInventory: () => this.chestInventory,
            getPlayer: () => this.player,
            updateToolbar: () => this.updateToolbar(),
            closeSeedSelector: () => this.closeSeedSelector(),
            closeChestPanel: () => this.closeChestPanel(),
            showToastMessage: (text, color) => this.showToastMessage(text, color),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        }, this.TILE_SIZE);

        // MailboxManager
        this.mailboxManager = new MailboxManager(this, {
            getSeedCounts: () => this.seedCounts,
            getFertilizerCounts: () => this.fertilizerCounts,
            updateToolbar: () => this.updateToolbar(),
            showToastMessage: (text, color) => this.showToastMessage(text, color),
            playSuccessSound: () => this.soundManager.playSuccessSound()
        }, this.TILE_SIZE);

        // ProfileManager
        this.profileManager = new ProfileManager(this, {
            onLogout: () => {
                EventBus.emit('logout');
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
            onSeedOptionClicked: () => { this.seedOptionJustClicked = true; }
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
            console.log('Loading game data from cache...');

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
            console.log('Seeds loaded from cache:', this.seedCounts);

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
            console.log('Fertilizers loaded from cache:', this.fertilizerCounts);

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
            console.log('Fruits loaded from cache:', this.chestInventory);

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

            // Update UI
            this.updateToolbar();
            this.createUserProfileUI();

            console.log('All game data loaded from cache');
        } else {
            console.log('Cache not available, fetching from API...');
            // Fallback to fetching from API
            this.fetchSeedInventory();
            this.fetchFertilizerInventory();
            this.fetchFruitInventory();
            this.loadGardenData();
            this.fetchUserProfile();
            // Preload missions (will be cached by MailboxManager)
            this.mailboxManager.preloadMissions();
        }
    }

    /**
     * Loads garden data from cached response
     */
    private loadGardenDataFromCache(gardenData: import('../GardenService').GardenResponse) {
        if (!gardenData || gardenData.length === 0) {
            console.log('No garden data in cache - all plots remain locked');
            return;
        }

        console.log('Loading garden data from cache:', gardenData.length, 'plots');

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
                this.showPlant(x, y, plantType, plantStage);

                // Create health bar
                this.createHealthBar(x, y, tileKey);

                // Update health bar progress
                const updatedState = this.farmLandStates.get(tileKey);
                if (updatedState?.healthBarFill && plot.progress) {
                    const progressPercent = plot.progress.percentage / 100;
                    const maxWidth = 14;
                    updatedState.healthBarFill.width = maxWidth * progressPercent;

                    if (progressPercent > 0.6) {
                        updatedState.healthBarFill.setFillStyle(0x4ade80);
                    } else if (progressPercent > 0.3) {
                        updatedState.healthBarFill.setFillStyle(0xfbbf24);
                    } else {
                        updatedState.healthBarFill.setFillStyle(0xef4444);
                    }
                }

                console.log(`Restored plant at ${tileKey}: ${plantType} stage ${plantStage}`);
            } else {
                this.removePlant(x, y);
                state.planted = false;
                state.cropType = null;
                state.plantStage = 0;
                state.plantId = undefined;
            }
        });

        console.log('Garden data loaded from cache successfully');
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
                console.warn('Seed inventory is not an array:', inventory);
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

            console.log('Seed inventory updated:', this.seedCounts);

            // Update toolbar to reflect new counts
            this.updateToolbar();
        } catch (error) {
            console.error('Error fetching seed inventory:', error);
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
                console.warn('Fertilizer inventory response is invalid:', response);
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

            console.log('Fertilizer inventory updated:', this.fertilizerCounts, 'Total:', response.total);

            // Update toolbar to reflect new counts
            this.updateToolbar();
        } catch (error) {
            console.error('Error fetching fertilizer inventory:', error);
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

            console.log('Fruit inventory updated:', this.chestInventory);

            // Update toolbar to reflect new counts
            this.updateToolbar();
        } catch (error) {
            console.error('Error fetching fruit inventory:', error);
            this.updateToolbar();
        }
    }

    /**
     * Loads garden data from API and restores planted crops + unlocked plots
     */
    private async loadGardenData() {
        try {
            console.log('Fetching garden data from API...');
            const gardenData = await GardenService.getGarden();
            
            console.log('Garden API response:', gardenData);
            console.log('Garden data length:', gardenData?.length || 0);
            
            if (!gardenData || gardenData.length === 0) {
                console.log('No garden data available - all plots remain locked');
                return;
            }

            console.log('Loading garden data:', gardenData);

            // Update owned plots count based on API response
            // Each plot in the response is an unlocked plot
            const unlockedPlotCount = gardenData.length;
            if (unlockedPlotCount > this.ownedPlotsCount) {
                this.ownedPlotsCount = unlockedPlotCount;
                console.log(`Updated owned plots count to ${this.ownedPlotsCount}`);
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
                    this.showPlant(x, y, plantType, plantStage);

                    // Create health bar
                    this.createHealthBar(x, y, tileKey);

                    // Update health bar based on progress percentage
                    // Re-fetch state as createHealthBar may have updated it
                    const updatedState = this.farmLandStates.get(tileKey);
                    if (updatedState?.healthBarFill && plot.progress) {
                        const progressPercent = plot.progress.percentage / 100;
                        const maxWidth = 14;
                        updatedState.healthBarFill.width = maxWidth * progressPercent;

                        if (progressPercent > 0.6) {
                            updatedState.healthBarFill.setFillStyle(0x4ade80);
                        } else if (progressPercent > 0.3) {
                            updatedState.healthBarFill.setFillStyle(0xfbbf24);
                        } else {
                            updatedState.healthBarFill.setFillStyle(0xef4444);
                        }
                    }

                    console.log(`Restored plant at ${tileKey}: ${plantType} stage ${plantStage} (${plot.progress?.percentage ?? 0}%)`);
                } else {
                    // Empty plot - remove any existing plant sprite and reset state
                    this.removePlant(x, y);
                    state.planted = false;
                    state.cropType = null;
                    state.plantStage = 0;
                    state.plantId = undefined;
                    console.log(`Unlocked empty plot at ${tileKey} (landId: ${plot.landId})`);
                }
            });

            console.log('Garden data loaded successfully');
        } catch (error) {
            console.error('Error loading garden data:', error);
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
            console.log(`Unlocked plot at ${tileKey}`);
        }
    }

    /**
     * Fetches user profile from API and updates UI
     */
    private async fetchUserProfile() {
        try {
            const userData = await UserService.getUserProfile();
            
            if (userData) {
                console.log('User profile updated:', userData);
                
                // Refresh UI to show updated balances
                this.createUserProfileUI();
            } else {
                console.log('Failed to fetch user profile');
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
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

        // Shop exclusion zone (shop is at centerX - 5, centerY - 5)
        const shopX = centerX - 5;
        const shopY = centerY - 5;
        const shopExclusionRadius = 3; // Tiles to exclude around shop

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
        // Create 16 farm plots at the center of the island in a 4x4 grid
        // Tilled dirt tile variations: 0, 1, 2, 8, 9, 10
        const tilledDirtTiles = [0, 1, 2, 8, 9, 10];

        // Create 4x4 grid of farm plots (16 total)
        // Plots are numbered 0-15, left to right, top to bottom
        const plotPositions = this.getPlotPositions();

        console.log(`Creating farm plots. Owned plots: ${this.ownedPlotsCount}`);

        // Place tilled-dirt tiles for each plot
        plotPositions.forEach((pos, index) => {
            const randomTileIndex = Phaser.Math.RND.pick(tilledDirtTiles);
            this.tilledDirtLayer.putTileAt(randomTileIndex, pos.x, pos.y);

            // Create lock overlay for locked plots (index >= ownedPlotsCount)
            if (index >= this.ownedPlotsCount) {
                this.createLockedPlotOverlay(pos.x, pos.y, index);
                console.log(`Locked plot ${index} at ${pos.x},${pos.y}`);
            } else {
                console.log(`Unlocked plot ${index} at ${pos.x},${pos.y}`);
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
        this.cameras.main.ignore(this.timeText);
        this.updateTimeDisplay();

        // User Profile (top right)
        this.createUserProfileUI();

        // Toolbar (bottom center)
        this.toolbarManager.createToolbar();
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
        this.toolbarManager.createToolbar();
    }

    private updateToolbar() {
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
        console.log('FarmingGame: wallet connected', address);
        this.createWalletDisplay();

        // Fetch seed, fertilizer, and fruit inventory from API
        this.fetchSeedInventory();
        this.fetchFertilizerInventory();
        this.fetchFruitInventory();

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

    // Delegate methods for other managers:

    private showBuyPlotModal(tileX: number, tileY: number, plotIndex: number) {
        this.plotManager.showBuyPlotModal(tileX, tileY, plotIndex);
    }

    private showToastMessage(text: string, color: number = 0xFFFFFF) {
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
            console.log('Not a farm plot');
            return;
        }

        // Check if plot is locked
        if (state.locked) {
            console.log('This plot is locked! Purchase it first.');
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
                console.log('Cannot plant on locked plot at', tileKey);
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

                console.log('Planted', selectedPlantType, 'at', tileKey, '- Seeds left:', this.seedCounts[selectedPlantType]);

                // Call API to plant seed on backend and store the plantId for future API calls
                // Use landId from state if available, otherwise use tileKey
                const landId = state.landId || tileKey;
                SeedService.plantSeed(landId, selectedPlantType)
                    .then(plantId => {
                        if (plantId) {
                            const currentState = this.farmLandStates.get(tileKey);
                            if (currentState) {
                                currentState.plantId = plantId;
                                console.log(`Plant ID ${plantId} stored for tile ${tileKey}`);
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Failed to plant seed in database:', error);
                    });
            } else {
                console.log('No', selectedPlantType, 'seeds left!');
            }
        }
    }

    private async waterCrop(tileKey: string, x: number, y: number) {
        const state = this.farmLandStates.get(tileKey);
        const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');

        // Check if we have water
        if (!wateringCan || wateringCan.count === undefined || wateringCan.count <= 0) {
            console.log('No water left!');
            this.showToastMessage('No water left!', 0xef4444);
            return;
        }

        if (state && state.planted && state.cropType) {
            // Cannot water dead plants
            if (state.isDead) {
                console.log('This plant is dead and cannot be watered!');
                this.showToastMessage('This plant is dead!', 0xef4444);
                return;
            }

            // If no plantId, plant is not synced with backend
            if (!state.plantId) {
                console.warn('No plantId available for watering - plant may not be synced with backend');
                this.showToastMessage('Plant not synced yet', 0xfbbf24);
                return;
            }

            // Call API first to check if watering is allowed
            const result = await GardenService.waterPlant(state.plantId);
            
            if (!result.success) {
                // Show error message to user
                this.showToastMessage(result.message || 'Cannot water now', 0xef4444);
                return;
            }

            // API succeeded - update local state
            state.lastCareTime = Date.now();
            this.resetHealthBar(tileKey);

            // Play water sound effect
            this.soundManager.playWaterSound();

            // Play water sound effect
            this.soundManager.playWaterSound();

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
                this.updatePlantSprite(x, y, state.cropType, state.plantStage, false, state.isWilted);
                console.log('Watered and grew to stage', state.plantStage, 'at', tileKey, '- Water left:', wateringCan.count);
                this.showToastMessage('Watered!', 0x4ade80);
            } else {
                wateringCan.count--;
                this.updateToolbar();
                console.log('Plant is already fully grown at', tileKey, '- Care timer reset');
                this.showToastMessage('Plant fully grown!', 0x4ade80);
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
            console.log('No', selectedFertilizerType, 'fertilizer left!');
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
                this.fertilizerCounts[selectedFertilizerType]--;
                this.updateToolbar();

                // Update plant sprite
                this.updatePlantSprite(x, y, state.cropType, state.plantStage, false, state.isWilted);

                console.log('Fertilized with', selectedFertilizerType, 'and grew to stage', state.plantStage, 'at', tileKey, '- Fertilizer left:', this.fertilizerCounts[selectedFertilizerType]);
            } else {
                // Still consume fertilizer but just reset timer
                this.fertilizerCounts[selectedFertilizerType]--;
                this.updateToolbar();
                console.log('Plant is already fully grown at', tileKey, '- Care timer reset');
            }
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
                    console.log('Harvested WILTED', harvestedType, 'crop at', tileKey, '(reduced yield) - Added to chest');
                } else {
                    console.log('Harvested healthy', harvestedType, 'crop at', tileKey, '- Added to chest');
                }

                // Call API to harvest plant on backend (async, don't wait for response)
                if (plantId) {
                    GardenService.harvestPlant(plantId).catch(error => {
                        console.error('Failed to harvest plant in database:', error);
                    });
                } else {
                    console.warn('No plantId available for harvesting - plant may not be synced with backend');
                }
            } else {
                console.log('Plant not ready to harvest at', tileKey, `(Stage ${state.plantStage}/${PLANT_STAGES.FRUIT})`);
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

            console.log('Digested/removed plant at', tileKey);

            // Call API to clear land on backend
            if (landId) {
                GardenService.clearLand(landId).then(result => {
                    if (result?.success) {
                        console.log(`API: Cleared land ${landId} - ${result.message}`);
                    } else {
                        console.error(`API: Failed to clear land ${landId}`);
                    }
                }).catch(error => {
                    console.error('Failed to clear land in database:', error);
                });
            } else {
                console.warn(`No landId found for tile ${tileKey}, skipping API call`);
            }
        } else {
            console.log('No plant to digest at', tileKey);
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
        // NOTE: Health bar is now managed by backend API data
        // The health bar is set when loading garden data from the backend
        // We don't recalculate it based on local time anymore
        // The backend provides progress.percentage which is the source of truth
        
        // This method is kept for compatibility but does nothing
        // Health bar updates happen in loadGardenData() when fresh data is fetched
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
        console.log('New day started!', this.dayCounter);
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
    }

    shutdown() {
        EventBus.off('wallet-connected', this.onWalletConnected, this);
        this.scale.off('resize', this.onResize, this);
    }
}
