import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { PlantType, ChestSlot, ShopPurchaseLimits } from '../types/GameTypes';
import {
    ShopService,
    GoldShopResponse,
    GemShopResponse,
    CashShopResponse,
    GoldShopItem,
    GemShopItem,
    CashShopItem
} from '../ShopService';
import { GameDataService } from '../GameDataService';
import { useGameState } from '../hooks/useGameState';
import { EventBus } from '../EventBus';
import { CurrencyUpdatePayload, ActionSuccessPayload, ActionErrorPayload } from '../types/SocketTypes';

interface ShopCallbacks {
    getPlayerGold: () => number;
    setPlayerGold: (value: number) => void;
    getPlayerGems: () => number;
    setPlayerGems: (value: number) => void;
    getSeedCounts: () => Record<PlantType, number>;
    getChestInventory: () => ChestSlot[];
    setChestInventory: (inventory: ChestSlot[]) => void;
    getToolbarItems: () => { name: string; count?: number }[];
    playSuccessSound: () => void;
    // Note: UI refresh is now handled by GameDataService.refreshAndUpdateUI()
}

/**
 * Manages the shop system
 * Handles shop modal, items, and purchases
 */
export class ShopManager extends BaseManager {
    private shopSprite!: Phaser.GameObjects.Sprite;
    private activeTab: 'gold' | 'gem' | 'cash' = 'gold';
    private callbacks: ShopCallbacks;
    private purchaseLimits: ShopPurchaseLimits = {
        shovel: { count: 0, lastReset: Date.now() },
        growthWater: { count: 0, lastReset: Date.now() },
        mushroomExchange: { count: 0, lastReset: Date.now() }
    };

    // Cached shop data
    private goldShopData: GoldShopResponse | null = null;
    private gemShopData: GemShopResponse | null = null;
    private cashShopData: CashShopResponse | null = null;

    // Content elements for tab switching
    private contentElements: Phaser.GameObjects.GameObject[] = [];
    private balanceText: Phaser.GameObjects.Text | null = null;

    // Pending purchase tracking for WebSocket
    private pendingPurchase: {
        shopType: 'GOLD' | 'GEM';
        itemKey: string;
        itemName: string;
        previousGold: number;
        previousGem: number;
    } | null = null;

    constructor(scene: Phaser.Scene, callbacks: ShopCallbacks) {
        super(scene);
        this.callbacks = callbacks;
        this.setupSocketListeners();
    }

    /**
     * Setup WebSocket event listeners for shop purchases
     */
    private setupSocketListeners(): void {
        // Listen for currency updates from WebSocket
        EventBus.on('socket:currency_update', this.handleCurrencyUpdate, this);
        
        // Listen for action success (purchase confirmation)
        EventBus.on('socket:action_success', this.handleActionSuccess, this);
        
        // Listen for action error (purchase failed)
        EventBus.on('socket:action_error', this.handleActionError, this);
    }

    /**
     * Handle currency update from WebSocket
     */
    private handleCurrencyUpdate = (payload: CurrencyUpdatePayload): void => {
        console.log('💰 [ShopManager] Currency update received:', payload);
        
        // Update global state
        const gameState = useGameState(this.scene);
        gameState.setCurrency(payload.gold, payload.gem);
        
        // Update local balance display if shop is open
        if (this.isOpen && this.balanceText) {
            this.balanceText.setText(`💰 ${payload.gold}    💎 ${payload.gem}`);
        }
        
        // Update cached shop data
        if (this.goldShopData) {
            this.goldShopData.user.balanceGold = payload.gold;
        }
        if (this.gemShopData) {
            this.gemShopData.user.balanceGem = payload.gem;
        }
    };

    /**
     * Handle action success from WebSocket
     */
    private handleActionSuccess = (payload: ActionSuccessPayload): void => {
        if (payload.action === 'buy_shop_item' && this.pendingPurchase) {
            console.log('✅ [ShopManager] Purchase confirmed:', payload);
            this.showMessage(`Purchased ${this.pendingPurchase.itemName}!`, '#4CAF50');
            this.callbacks.playSuccessSound();
            
            // Refresh shop data to update availability
            this.fetchShopData(true);
            
            // Clear pending purchase
            this.pendingPurchase = null;
        }
    };

    /**
     * Handle action error from WebSocket
     */
    private handleActionError = (payload: ActionErrorPayload): void => {
        if (payload.action === 'buy_shop_item' && this.pendingPurchase) {
            console.error('❌ [ShopManager] Purchase failed:', payload);
            
            // Rollback optimistic update
            const gameState = useGameState(this.scene);
            gameState.setCurrency(this.pendingPurchase.previousGold, this.pendingPurchase.previousGem);
            
            // Update local balance display
            if (this.balanceText) {
                this.balanceText.setText(`💰 ${this.pendingPurchase.previousGold}    💎 ${this.pendingPurchase.previousGem}`);
            }
            
            this.showMessage(payload.message || 'Purchase failed!', '#F44336');
            
            // Clear pending purchase
            this.pendingPurchase = null;
        }
    };

    public createShop(tileSize: number): void {
        const centerX = 25;
        const centerY = 25;
        const factoryX = centerX * tileSize + tileSize / 2;
        const factoryY = (centerY - 5) * tileSize;
        const shopX = factoryX - 80;
        const shopY = factoryY + 24;

        this.createShopAt(shopX, shopY);
    }

    /**
     * Create shop sprite at specific coordinates
     * Used by TownSquare to position shop near fountain
     */
    public createShopAt(shopX: number, shopY: number): void {
        if (!this.scene.anims.exists('shop-idle')) {
            this.scene.anims.create({
                key: 'shop-idle',
                frames: this.scene.anims.generateFrameNumbers('shop', { start: 0, end: 1 }),
                frameRate: 2,
                repeat: -1
            });
        }

        this.shopSprite = this.scene.add.sprite(shopX, shopY, 'shop');
        this.shopSprite.setDisplaySize(81, 60);
        this.shopSprite.setDepth(shopY + 20);
        this.shopSprite.setInteractive({ useHandCursor: true });
        this.shopSprite.play('shop-idle');

        this.shopSprite.on('pointerdown', () => {
            this.open();
        });

        this.setupHoverEffect(this.shopSprite, 10);
    }

    public getShopSprite(): Phaser.GameObjects.Sprite {
        return this.shopSprite;
    }

    public async open(): Promise<void> {
        if (this.isOpen) return;
        this.isOpen = true;
        this.activeTab = 'gold';

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 360;
        const modalHeight = 320;
        const modalX = screenWidth / 2;
        const modalY = screenHeight / 2;

        // Overlay
        const overlay = this.scene.add.rectangle(screenWidth / 2, screenHeight / 2, screenWidth, screenHeight, 0x000000, 0.6);
        overlay.setDepth(5300);
        overlay.setInteractive();
        overlay.on('pointerdown', () => this.close());
        this.scene.cameras.main.ignore(overlay);
        this.addElement(overlay);

        // Modal background
        const modalBg = this.scene.add.sprite(modalX, modalY, 'settings-panel', 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);
        modalBg.setDepth(5301);
        modalBg.setInteractive();
        modalBg.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        this.scene.cameras.main.ignore(modalBg);
        this.addElement(modalBg);

        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        await this.fetchShopData();

        this.scene.time.delayedCall(100, () => {
            this.createModalContent(modalX, modalY, modalWidth, modalHeight);
        });
    }

    private async fetchShopData(forceRefresh: boolean = false): Promise<void> {
        // Try to use cached data from GameDataService first
        const cachedData = GameDataService.getCachedData();

        if (!forceRefresh && cachedData?.shop) {
            const { goldShop, gemShop, cashShop } = cachedData.shop;

            // Use cached data if available
            if (goldShop || gemShop || cashShop) {
                this.goldShopData = goldShop;
                this.gemShopData = gemShop;
                this.cashShopData = cashShop;

                console.log('Shop data loaded from cache:', {
                    gold: goldShop?.items.length ?? 0,
                    gem: gemShop?.items.length ?? 0,
                    cash: cashShop?.items.length ?? 0
                });
                return;
            }
        }

        // Fallback: fetch from API if no cached data or force refresh
        console.log('Fetching shop data from API...');
        const [goldData, gemData, cashData] = await Promise.all([
            ShopService.getGoldShop(),
            ShopService.getGemShop(),
            ShopService.getCashShop()
        ]);

        this.goldShopData = goldData;
        this.gemShopData = gemData;
        this.cashShopData = cashData;

        console.log('Shop data loaded from API:', {
            gold: goldData?.items.length ?? 0,
            gem: gemData?.items.length ?? 0,
            cash: cashData?.items.length ?? 0
        });
    }

    public close(): void {
        this.isOpen = false;
        this.contentElements = [];
        this.balanceText = null;
        this.pendingPurchase = null;
        this.destroyElements();
    }

    /**
     * Cleanup event listeners when manager is destroyed
     */
    public destroy(): void {
        EventBus.off('socket:currency_update', this.handleCurrencyUpdate, this);
        EventBus.off('socket:action_success', this.handleActionSuccess, this);
        EventBus.off('socket:action_error', this.handleActionError, this);
    }


    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        // Balance display - READ FROM GLOBAL STATE (single source of truth)
        const gameState = useGameState(this.scene);
        const goldBalance = gameState.getGold();
        const gemBalance = gameState.getGem();

        this.balanceText = this.scene.add.text(modalX, modalY - modalHeight / 2 + 48, `💰 ${goldBalance}    💎 ${gemBalance}`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        this.balanceText.setOrigin(0.5);
        this.balanceText.setDepth(5302);
        this.balanceText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(this.balanceText);
        this.addElement(this.balanceText);

        // Title
        const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 65, 'SHOP', {
            fontSize: '16px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5302);
        title.setStroke('#5D4037', 3);
        this.scene.cameras.main.ignore(title);
        this.addElement(title);

        // Tab buttons
        const tabY = modalY - modalHeight / 2 + 90;
        const tabWidth = 80;
        const tabHeight = 24;

        const goldTabBg = this.scene.add.sprite(modalX - 95, tabY, 'square-buttons', 6);
        goldTabBg.setDisplaySize(tabWidth, tabHeight);
        goldTabBg.setDepth(5302);
        goldTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(goldTabBg);
        this.addElement(goldTabBg);

        const goldTabText = this.scene.add.text(modalX - 95, tabY, '💰 Gold', {
            fontSize: '9px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        goldTabText.setOrigin(0.5);
        goldTabText.setDepth(5303);
        goldTabText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(goldTabText);
        this.addElement(goldTabText);

        const gemTabBg = this.scene.add.sprite(modalX, tabY, 'square-buttons', 7);
        gemTabBg.setDisplaySize(tabWidth, tabHeight);
        gemTabBg.setDepth(5302);
        gemTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(gemTabBg);
        this.addElement(gemTabBg);

        const gemTabText = this.scene.add.text(modalX, tabY, '💎 Gem', {
            fontSize: '9px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        gemTabText.setOrigin(0.5);
        gemTabText.setDepth(5303);
        gemTabText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(gemTabText);
        this.addElement(gemTabText);

        const cashTabBg = this.scene.add.sprite(modalX + 95, tabY, 'square-buttons', 7);
        cashTabBg.setDisplaySize(tabWidth, tabHeight);
        cashTabBg.setDepth(5302);
        cashTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cashTabBg);
        this.addElement(cashTabBg);

        const cashTabText = this.scene.add.text(modalX + 95, tabY, '💵 Cash', {
            fontSize: '9px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        cashTabText.setOrigin(0.5);
        cashTabText.setDepth(5303);
        cashTabText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(cashTabText);
        this.addElement(cashTabText);

        // Close button
        const closeBtnX = modalX + modalWidth / 2 - 35;
        const closeBtnY = modalY - modalHeight / 2 + 48;

        const closeBtnBg = this.scene.add.sprite(closeBtnX, closeBtnY, 'square-buttons', 7);
        closeBtnBg.setDisplaySize(24, 24);
        closeBtnBg.setDepth(5302);
        closeBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtnBg);
        this.addElement(closeBtnBg);

        const closeText = this.scene.add.text(closeBtnX, closeBtnY, 'X', {
            fontSize: '10px', fontFamily: 'PixelFont', color: '#FFFFFF', resolution: 2
        });
        closeText.setOrigin(0.5);
        closeText.setDepth(5303);
        closeText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(closeText);
        this.addElement(closeText);

        closeBtnBg.on('pointerdown', () => this.close());
        closeBtnBg.on('pointerover', () => closeBtnBg.setTint(0xcccccc));
        closeBtnBg.on('pointerout', () => closeBtnBg.clearTint());

        // Content area
        const contentStartY = modalY - modalHeight / 2 + 125;
        const itemHeight = 38;

        const showGoldContent = () => {
            this.clearContentElements();
            this.activeTab = 'gold';
            goldTabBg.setTexture('square-buttons', 6);
            gemTabBg.setTexture('square-buttons', 7);
            cashTabBg.setTexture('square-buttons', 7);

            if (this.goldShopData && this.goldShopData.items.length > 0) {
                // Show max 5 items
                const items = this.goldShopData.items.slice(0, 5);
                items.forEach((item, index) => {
                    const itemY = contentStartY + index * itemHeight;
                    this.createShopItem(modalX, itemY, item.icon, item.name, item.description, 
                        `💰${item.priceGold}`, item.affordable, () => this.handleGoldPurchase(item));
                });
            } else {
                this.showLoadingOrEmpty('No items available');
            }
        };

        const showGemContent = () => {
            this.clearContentElements();
            this.activeTab = 'gem';
            goldTabBg.setTexture('square-buttons', 7);
            gemTabBg.setTexture('square-buttons', 6);
            cashTabBg.setTexture('square-buttons', 7);

            if (this.gemShopData && this.gemShopData.items.length > 0) {
                // Filter out land slots - they are purchased via PlotManager
                const items = this.gemShopData.items
                    .filter(item => !item.key.startsWith('LAND_SLOT_'))
                    .slice(0, 5);
                items.forEach((item, index) => {
                    const itemY = contentStartY + index * itemHeight;
                    // For land slots, check both affordable and available
                    const canBuy = item.affordable && (item.available !== false);
                    this.createShopItem(modalX, itemY, item.icon, item.name, item.description,
                        `💎${item.priceGem}`, canBuy, () => this.handleGemPurchase(item));
                });
                if (items.length === 0) {
                    this.showLoadingOrEmpty('No items available');
                }
            } else {
                this.showLoadingOrEmpty('No items available');
            }
        };

        const showCashContent = () => {
            this.clearContentElements();
            this.activeTab = 'cash';
            goldTabBg.setTexture('square-buttons', 7);
            gemTabBg.setTexture('square-buttons', 7);
            cashTabBg.setTexture('square-buttons', 6);

            if (this.cashShopData && this.cashShopData.items.length > 0) {
                const items = this.cashShopData.items.slice(0, 5);
                items.forEach((item, index) => {
                    const itemY = contentStartY + index * itemHeight;
                    this.createShopItem(modalX, itemY, item.icon, item.name, item.description,
                        `$${item.priceUSD}`, item.available, () => this.handleCashPurchase(item));
                });
            } else {
                this.showLoadingOrEmpty('No items available');
            }
        };

        goldTabBg.on('pointerdown', showGoldContent);
        gemTabBg.on('pointerdown', showGemContent);
        cashTabBg.on('pointerdown', showCashContent);

        showGoldContent();
    }

    private clearContentElements(): void {
        this.contentElements.forEach(el => el.destroy());
        this.contentElements = [];
    }

    private showLoadingOrEmpty(message: string): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        const text = this.scene.add.text(screenWidth / 2, screenHeight / 2, message, {
            fontSize: '12px', fontFamily: 'PixelFont', color: '#8B7355', resolution: 2
        });
        text.setOrigin(0.5);
        text.setDepth(5304);
        this.scene.cameras.main.ignore(text);
        this.addElement(text);
        this.contentElements.push(text);
    }

    private createShopItem(
        modalX: number, itemY: number, icon: string, name: string, 
        desc: string, price: string, canBuy: boolean, onBuy: () => void
    ): void {
        const cardWidth = 280;
        const cardHeight = 32;

        // Thêm offset để đẩy card sang trái/phải                                                                                                              
        const cardOffsetX = 15;  // Số dương = sang phải, số âm = sang trái   

        const cardBorder = this.scene.add.rectangle(modalX + cardOffsetX, itemY, cardWidth + 2, cardHeight + 2, 0x8B7355);
        cardBorder.setDepth(5302);
        this.scene.cameras.main.ignore(cardBorder);
        this.addElement(cardBorder);
        this.contentElements.push(cardBorder);

        const bgColor = canBuy ? 0xD4C4A8 : 0xB0B0B0;
        const cardBg = this.scene.add.rectangle(modalX + cardOffsetX, itemY, cardWidth, cardHeight, bgColor);
        cardBg.setDepth(5303);
        cardBg.setInteractive({ useHandCursor: canBuy });
        this.scene.cameras.main.ignore(cardBg);
        this.addElement(cardBg);
        this.contentElements.push(cardBg);

        const leftEdge = modalX - cardWidth / 2 + cardOffsetX + 10;

        const nameText = this.scene.add.text(leftEdge, itemY - 6, `${icon} ${name}`, {
            fontSize: '10px', fontFamily: 'PixelFont', color: canBuy ? '#5D4037' : '#666666', resolution: 2
        });
        nameText.setOrigin(0, 0.5);
        nameText.setDepth(5304);
        this.scene.cameras.main.ignore(nameText);
        this.addElement(nameText);
        this.contentElements.push(nameText);

        const descText = this.scene.add.text(leftEdge, itemY + 8, desc, {
            fontSize: '7px', fontFamily: 'PixelFont', color: '#8B7355', resolution: 2
        });
        descText.setOrigin(0, 0.5);
        descText.setDepth(5304);
        this.scene.cameras.main.ignore(descText);
        this.addElement(descText);
        this.contentElements.push(descText);

        const btnX = modalX + cardWidth / 2 - 38;
        const buyBtn = this.scene.add.sprite(btnX + cardOffsetX, itemY, 'square-buttons', canBuy ? 6 : 7);
        buyBtn.setDisplaySize(60, 24);
        buyBtn.setDepth(5304);
        if (canBuy) buyBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(buyBtn);
        this.addElement(buyBtn);
        this.contentElements.push(buyBtn);

        const buyText = this.scene.add.text(btnX + cardOffsetX, itemY, price, {
            fontSize: '9px', fontFamily: 'PixelFont', color: canBuy ? '#FFFFFF' : '#999999', resolution: 2
        });
        buyText.setOrigin(0.5);
        buyText.setDepth(5305);
        buyText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(buyText);
        this.addElement(buyText);
        this.contentElements.push(buyText);

        if (canBuy) {
            cardBg.on('pointerover', () => { cardBg.setFillStyle(0xE8D9C0); nameText.setColor('#f59e0b'); });
            cardBg.on('pointerout', () => { cardBg.setFillStyle(0xD4C4A8); nameText.setColor('#5D4037'); });
            buyBtn.on('pointerover', () => buyBtn.setTint(0xffff88));
            buyBtn.on('pointerout', () => buyBtn.clearTint());
            buyBtn.on('pointerdown', onBuy);
        }
    }

    private async handleGoldPurchase(item: GoldShopItem): Promise<void> {
        console.log('Purchasing gold item:', item.key);

        // Get global game state (single source of truth)
        const gameState = useGameState(this.scene);

        // === OPTIMISTIC UPDATE ===
        const previousGoldBalance = gameState.getGold();
        const previousGemBalance = gameState.getGem();
        const optimisticNewBalance = previousGoldBalance - item.priceGold;

        // Store pending purchase for rollback if needed
        this.pendingPurchase = {
            shopType: 'GOLD',
            itemKey: item.key,
            itemName: item.name,
            previousGold: previousGoldBalance,
            previousGem: previousGemBalance
        };

        // 1. Update GLOBAL STATE immediately (optimistic)
        gameState.setGold(optimisticNewBalance);

        // 2. Update local shop data for consistency
        if (this.goldShopData) {
            this.goldShopData.user.balanceGold = optimisticNewBalance;
        }
        if (this.balanceText) {
            this.balanceText.setText(`💰 ${optimisticNewBalance}    💎 ${previousGemBalance}`);
        }

        // 3. Try WebSocket first, fallback to REST API
        const wsUsed = ShopService.buyShopItemWS('GOLD', item.key);
        
        if (!wsUsed) {
            // Fallback to REST API if WebSocket not connected
            console.log('[ShopManager] WebSocket not available, using REST API');
            try {
                const result = await ShopService.purchaseGoldItem(item.key);

                if (result && result.success) {
                    gameState.setGold(result.balanceGold);
                    if (this.goldShopData) {
                        this.goldShopData.user.balanceGold = result.balanceGold;
                    }
                    if (this.balanceText) {
                        this.balanceText.setText(`💰 ${result.balanceGold}    💎 ${previousGemBalance}`);
                    }
                    this.showMessage(`Purchased ${item.name}!`, '#4CAF50');
                    this.callbacks.playSuccessSound();
                    this.fetchShopData(true);
                } else {
                    // Rollback
                    gameState.setGold(previousGoldBalance);
                    if (this.goldShopData) {
                        this.goldShopData.user.balanceGold = previousGoldBalance;
                    }
                    if (this.balanceText) {
                        this.balanceText.setText(`💰 ${previousGoldBalance}    💎 ${previousGemBalance}`);
                    }
                    this.showMessage('Purchase failed!', '#F44336');
                }
            } catch {
                // Rollback on error
                gameState.setGold(previousGoldBalance);
                if (this.goldShopData) {
                    this.goldShopData.user.balanceGold = previousGoldBalance;
                }
                if (this.balanceText) {
                    this.balanceText.setText(`💰 ${previousGoldBalance}    💎 ${previousGemBalance}`);
                }
                this.showMessage('Network error!', '#F44336');
            }
            this.pendingPurchase = null;
        }
        // If WebSocket was used, response will come via socket events
    }

    private async handleGemPurchase(item: GemShopItem): Promise<void> {
        console.log('Purchasing gem item:', item.key);

        // Get global game state (single source of truth)
        const gameState = useGameState(this.scene);

        // === OPTIMISTIC UPDATE ===
        const previousGemBalance = gameState.getGem();
        const previousGoldBalance = gameState.getGold();
        const optimisticGemBalance = previousGemBalance - item.priceGem;

        // Store pending purchase for rollback if needed
        this.pendingPurchase = {
            shopType: 'GEM',
            itemKey: item.key,
            itemName: item.name,
            previousGold: previousGoldBalance,
            previousGem: previousGemBalance
        };

        // 1. Update GLOBAL STATE immediately (optimistic)
        gameState.setGem(optimisticGemBalance);

        // 2. Update local shop data for consistency
        if (this.gemShopData) {
            this.gemShopData.user.balanceGem = optimisticGemBalance;
        }
        if (this.balanceText) {
            this.balanceText.setText(`💰 ${previousGoldBalance}    💎 ${optimisticGemBalance}`);
        }

        // 3. Try WebSocket first, fallback to REST API
        const wsUsed = ShopService.buyShopItemWS('GEM', item.key);
        
        if (!wsUsed) {
            // Fallback to REST API if WebSocket not connected
            console.log('[ShopManager] WebSocket not available, using REST API');
            try {
                const result = await ShopService.purchaseGemItem(item.key, 1);

                if (result && result.success) {
                    gameState.setCurrency(result.balanceGold, result.balanceGem);
                    if (this.gemShopData) {
                        this.gemShopData.user.balanceGem = result.balanceGem;
                    }
                    if (this.goldShopData) {
                        this.goldShopData.user.balanceGold = result.balanceGold;
                    }
                    if (this.balanceText) {
                        this.balanceText.setText(`💰 ${result.balanceGold}    💎 ${result.balanceGem}`);
                    }
                    this.showMessage(`Purchased ${item.name}!`, '#4CAF50');
                    this.callbacks.playSuccessSound();
                    GameDataService.refreshAndUpdateUI();
                    this.fetchShopData(true);
                } else {
                    // Rollback
                    gameState.setCurrency(previousGoldBalance, previousGemBalance);
                    if (this.gemShopData) {
                        this.gemShopData.user.balanceGem = previousGemBalance;
                    }
                    if (this.balanceText) {
                        this.balanceText.setText(`💰 ${previousGoldBalance}    💎 ${previousGemBalance}`);
                    }
                    this.showMessage(result?.message || 'Purchase failed!', '#F44336');
                }
            } catch {
                // Rollback on error
                gameState.setCurrency(previousGoldBalance, previousGemBalance);
                if (this.gemShopData) {
                    this.gemShopData.user.balanceGem = previousGemBalance;
                }
                if (this.balanceText) {
                    this.balanceText.setText(`💰 ${previousGoldBalance}    💎 ${previousGemBalance}`);
                }
                this.showMessage('Network error!', '#F44336');
            }
            this.pendingPurchase = null;
        }
        // If WebSocket was used, response will come via socket events
    }

    private async handleCashPurchase(item: CashShopItem): Promise<void> {
        console.log('Purchasing cash item:', item.key);
        
        // Cash purchases require payment integration
        // For now, show a message that payment is required
        // In production, this would integrate with Stripe or another payment provider
        this.showMessage(`Payment required: $${item.priceUSD}`, '#2196F3');
        
        // Example of how the API would be called after payment:
        // const result = await ShopService.purchaseCashItem(item.key, paymentId, 'stripe');
        // if (result && result.success) {
        //     this.showMessage(result.message, '#4CAF50');
        //     if (this.gemShopData) {
        //         this.gemShopData.user.balanceGem = result.balanceGem;
        //     }
        //     if (this.balanceText) {
        //         const goldBalance = this.goldShopData?.user.balanceGold ?? 0;
        //         this.balanceText.setText(`💰 ${goldBalance}    💎 ${result.balanceGem}`);
        //     }
        //     GameDataService.refreshAndUpdateUI();
        //     await this.fetchShopData();
        // }
    }

    private showMessage(message: string, color: string): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        const msgText = this.scene.add.text(screenWidth / 2, screenHeight / 2 + 100, message, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: color,
            resolution: 2
        });
        msgText.setOrigin(0.5);
        msgText.setDepth(5400);
        this.scene.cameras.main.ignore(msgText);

        this.scene.tweens.add({
            targets: msgText,
            alpha: 0,
            y: msgText.y - 30,
            duration: 1500,
            ease: 'Power2',
            onComplete: () => msgText.destroy()
        });
    }
}