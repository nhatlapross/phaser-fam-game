import Phaser from 'phaser';
import { BaseManager } from './BaseManager';
import { PlantType, ChestSlot, ShopPurchaseLimits } from '../types/GameTypes';

interface ShopItem {
    name: string;
    price: number;
    desc: string;
    limit: string;
    key: string;
}

interface ShopCallbacks {
    getPlayerGold: () => number;
    setPlayerGold: (value: number) => void;
    getPlayerGems: () => number;
    setPlayerGems: (value: number) => void;
    getSeedCounts: () => Record<PlantType, number>;
    getChestInventory: () => ChestSlot[];
    setChestInventory: (inventory: ChestSlot[]) => void;
    getToolbarItems: () => { name: string; count?: number }[];
    updateToolbar: () => void;
    refreshProfileUI: () => void;
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

    constructor(scene: Phaser.Scene, callbacks: ShopCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Create the shop sprite on the map
     */
    public createShop(tileSize: number): void {
        const centerX = 25;
        const centerY = 25;
        const factoryX = centerX * tileSize + tileSize / 2;
        const factoryY = (centerY - 5) * tileSize;
        const shopX = factoryX - 80;
        const shopY = factoryY + 24;

        // Create shop animation
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

        this.shopSprite.on('pointerover', () => {
            this.shopSprite.setTint(0xffff88);
        });

        this.shopSprite.on('pointerout', () => {
            this.shopSprite.clearTint();
        });
    }

    /**
     * Get the shop sprite for camera ignore setup
     */
    public getShopSprite(): Phaser.GameObjects.Sprite {
        return this.shopSprite;
    }

    /**
     * Open the shop modal
     */
    public open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.activeTab = 'gold';

        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const modalWidth = 340;
        const modalHeight = 360;
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

        // Animate modal
        modalBg.setScale(0);
        this.scene.tweens.add({
            targets: modalBg,
            scaleX: modalWidth / 125,
            scaleY: modalHeight / 140,
            duration: 200,
            ease: 'Back.easeOut'
        });

        this.scene.time.delayedCall(100, () => {
            this.createModalContent(modalX, modalY, modalWidth, modalHeight);
        });
    }

    /**
     * Close the shop modal
     */
    public close(): void {
        this.isOpen = false;
        this.destroyElements();
    }

    private createModalContent(modalX: number, modalY: number, modalWidth: number, modalHeight: number): void {
        // Title
        const title = this.scene.add.text(modalX, modalY - modalHeight / 2 + 65, 'SHOP', {
            fontSize: '16px',
            fontFamily: 'PixelFont',
            color: '#ffffffff',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setDepth(5302);
        title.setStroke('#5D4037', 3);
        title.setAlpha(0);
        this.scene.cameras.main.ignore(title);
        this.addElement(title);
        this.scene.tweens.add({ targets: title, alpha: 1, duration: 150 });

        // Tab buttons
        const tabY = modalY - modalHeight / 2 + 90;
        const tabWidth = 80;
        const tabHeight = 24;

        // Gold tab
        const goldTabBg = this.scene.add.sprite(modalX - 95, tabY, 'square-buttons', 6);
        goldTabBg.setDisplaySize(tabWidth, tabHeight);
        goldTabBg.setDepth(5302);
        goldTabBg.setAlpha(0);
        goldTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(goldTabBg);
        this.addElement(goldTabBg);

        const goldTabText = this.scene.add.text(modalX - 95, tabY, '💰 Gold', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        goldTabText.setOrigin(0.5);
        goldTabText.setDepth(5303);
        goldTabText.setStroke('#5D4037', 1);
        goldTabText.setAlpha(0);
        this.scene.cameras.main.ignore(goldTabText);
        this.addElement(goldTabText);

        // Gem tab
        const gemTabBg = this.scene.add.sprite(modalX, tabY, 'square-buttons', 7);
        gemTabBg.setDisplaySize(tabWidth, tabHeight);
        gemTabBg.setDepth(5302);
        gemTabBg.setAlpha(0);
        gemTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(gemTabBg);
        this.addElement(gemTabBg);

        const gemTabText = this.scene.add.text(modalX, tabY, '💎 Gem', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        gemTabText.setOrigin(0.5);
        gemTabText.setDepth(5303);
        gemTabText.setStroke('#5D4037', 1);
        gemTabText.setAlpha(0);
        this.scene.cameras.main.ignore(gemTabText);
        this.addElement(gemTabText);

        // Cash tab
        const cashTabBg = this.scene.add.sprite(modalX + 95, tabY, 'square-buttons', 7);
        cashTabBg.setDisplaySize(tabWidth, tabHeight);
        cashTabBg.setDepth(5302);
        cashTabBg.setAlpha(0);
        cashTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cashTabBg);
        this.addElement(cashTabBg);

        const cashTabText = this.scene.add.text(modalX + 95, tabY, '💵 Cash', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        cashTabText.setOrigin(0.5);
        cashTabText.setDepth(5303);
        cashTabText.setStroke('#5D4037', 1);
        cashTabText.setAlpha(0);
        this.scene.cameras.main.ignore(cashTabText);
        this.addElement(cashTabText);

        this.scene.tweens.add({
            targets: [goldTabBg, goldTabText, gemTabBg, gemTabText, cashTabBg, cashTabText],
            alpha: 1,
            duration: 150
        });

        // Close button
        const closeBtn = this.scene.add.text(modalX + modalWidth / 2 - 20, modalY - modalHeight / 2 + 20, '✕', {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            resolution: 2
        });
        closeBtn.setOrigin(0.5);
        closeBtn.setDepth(5302);
        closeBtn.setAlpha(0);
        closeBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtn);
        this.addElement(closeBtn);

        closeBtn.on('pointerover', () => closeBtn.setColor('#ff6666'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#FFFFFF'));
        closeBtn.on('pointerdown', () => this.close());

        this.scene.tweens.add({ targets: closeBtn, alpha: 1, duration: 150 });

        // Content area
        const contentY = modalY + 40;
        const contentElements: Phaser.GameObjects.GameObject[] = [];

        const showGoldContent = () => {
            contentElements.forEach(el => el.destroy());
            contentElements.length = 0;

            goldTabBg.setTexture('square-buttons', 6);
            gemTabBg.setTexture('square-buttons', 7);
            cashTabBg.setTexture('square-buttons', 7);

            const items: ShopItem[] = [
                { name: '🔧 Shovel', price: 500, desc: 'Remove dead plants', limit: '1/wk', key: 'shovel' },
                { name: '🧤 Gloves', price: 30, desc: 'Catch bugs', limit: '', key: 'gloves' },
                { name: '💧 Growth Water', price: 100, desc: '-1h grow time', limit: '1/day', key: 'growthWater' },
                { name: '🐟 Fish Food', price: 20, desc: 'Feed fish', limit: '', key: 'fishFood' },
                { name: '🍄 Mushroom Trade', price: 0, desc: '5 Algae = 1 Spore', limit: '2/wk', key: 'mushroomExchange' }
            ];

            items.forEach((item, index) => {
                const itemY = contentY - 80 + index * 36;
                this.createShopItem(modalX, itemY, item, 'gold', contentElements);
            });
        };

        const showGemContent = () => {
            contentElements.forEach(el => el.destroy());
            contentElements.length = 0;

            goldTabBg.setTexture('square-buttons', 7);
            gemTabBg.setTexture('square-buttons', 6);
            cashTabBg.setTexture('square-buttons', 7);

            const items: ShopItem[] = [
                { name: '🌱 Algae Seed', price: 10, desc: '+1 Algae seed', limit: '', key: 'algaeSeed' },
                { name: '🍄 Mushroom Spore', price: 50, desc: '+1 Mushroom seed', limit: '', key: 'mushroomSeed' },
                { name: '⚡ Mid Booster', price: 500, desc: '-12h grow time', limit: '', key: 'mediumGrowth' },
                { name: '🚀 High Booster', price: 1000, desc: '-24h grow time', limit: '', key: 'highGrowth' },
                { name: '💰 Gold Exchange', price: 100, desc: '+1000 Gold', limit: '', key: 'goldExchange' }
            ];

            items.forEach((item, index) => {
                const itemY = contentY - 80 + index * 36;
                this.createShopItem(modalX, itemY, item, 'gem', contentElements);
            });
        };

        const showCashContent = () => {
            contentElements.forEach(el => el.destroy());
            contentElements.length = 0;

            goldTabBg.setTexture('square-buttons', 7);
            gemTabBg.setTexture('square-buttons', 7);
            cashTabBg.setTexture('square-buttons', 6);

            const items: ShopItem[] = [
                { name: '💎 100 Gems', price: 5, desc: '$5 USD', limit: '', key: 'gems100' },
                { name: '💎 500 Gems', price: 20, desc: '$20 USD', limit: '', key: 'gems500' },
                { name: '💎 1200 Gems', price: 50, desc: '$50 USD', limit: '', key: 'gems1200' },
                { name: '💎 2400 Gems', price: 100, desc: '$100 USD', limit: '', key: 'gems2400' },
                { name: '🏝️ Land Slot 2', price: 15, desc: '$15 USD', limit: '', key: 'land2' },
                { name: '🏝️ Land Slot 3', price: 50, desc: '$50 USD', limit: '', key: 'land3' }
            ];

            items.forEach((item, index) => {
                const itemY = contentY - 90 + index * 32;
                this.createShopItem(modalX, itemY, item, 'cash', contentElements);
            });
        };

        // Tab click handlers
        goldTabBg.on('pointerdown', () => {
            this.activeTab = 'gold';
            showGoldContent();
        });

        gemTabBg.on('pointerdown', () => {
            this.activeTab = 'gem';
            showGemContent();
        });

        cashTabBg.on('pointerdown', () => {
            this.activeTab = 'cash';
            showCashContent();
        });

        // Show initial content
        showGoldContent();
    }

    private createShopItem(
        modalX: number,
        itemY: number,
        item: ShopItem,
        currency: 'gold' | 'gem' | 'cash',
        contentElements: Phaser.GameObjects.GameObject[]
    ): void {
        const cardWidth = 260;
        const cardHeight = 30;
        const cardX = modalX + 10;

        // Card border
        const cardBorder = this.scene.add.rectangle(cardX, itemY, cardWidth + 2, cardHeight + 2, 0x8B7355);
        cardBorder.setDepth(5302);
        this.scene.cameras.main.ignore(cardBorder);
        this.addElement(cardBorder);
        contentElements.push(cardBorder);

        // Card background
        const cardBg = this.scene.add.rectangle(cardX, itemY, cardWidth, cardHeight, 0xD4C4A8);
        cardBg.setDepth(5303);
        cardBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(cardBg);
        this.addElement(cardBg);
        contentElements.push(cardBg);

        const leftEdge = cardX - cardWidth / 2 + 10;

        // Item name
        const nameText = this.scene.add.text(leftEdge, itemY - 5, item.name, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#5D4037',
            resolution: 2
        });
        nameText.setOrigin(0, 0.5);
        nameText.setDepth(5304);
        this.scene.cameras.main.ignore(nameText);
        this.addElement(nameText);
        contentElements.push(nameText);

        // Description
        const descText = this.scene.add.text(leftEdge, itemY + 7, item.desc, {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: '#8B7355',
            resolution: 2
        });
        descText.setOrigin(0, 0.5);
        descText.setDepth(5304);
        this.scene.cameras.main.ignore(descText);
        this.addElement(descText);
        contentElements.push(descText);

        // Limit text
        if (item.limit) {
            const limitText = this.scene.add.text(cardX + 25, itemY, item.limit, {
                fontSize: '7px',
                fontFamily: 'PixelFont',
                color: '#e74c3c',
                resolution: 2
            });
            limitText.setOrigin(0.5);
            limitText.setDepth(5304);
            this.scene.cameras.main.ignore(limitText);
            this.addElement(limitText);
            contentElements.push(limitText);
        }

        // Price/Buy button
        const priceIcon = currency === 'gold' ? '💰' : currency === 'gem' ? '💎' : '💵';
        const priceText = currency === 'cash' ? `$${item.price}` : `${priceIcon}${item.price}`;
        const btnX = cardX + cardWidth / 2 - 35;

        const buyBtn = this.scene.add.sprite(btnX, itemY, 'square-buttons', 6);
        buyBtn.setDisplaySize(55, 22);
        buyBtn.setDepth(5304);
        buyBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(buyBtn);
        this.addElement(buyBtn);
        contentElements.push(buyBtn);

        const buyText = this.scene.add.text(btnX, itemY, priceText, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        buyText.setOrigin(0.5);
        buyText.setDepth(5305);
        buyText.setStroke('#5D4037', 1);
        this.scene.cameras.main.ignore(buyText);
        this.addElement(buyText);
        contentElements.push(buyText);

        // Hover effects
        cardBg.on('pointerover', () => {
            cardBg.setFillStyle(0xE8D9C0);
            nameText.setColor('#f59e0b');
        });
        cardBg.on('pointerout', () => {
            cardBg.setFillStyle(0xD4C4A8);
            nameText.setColor('#5D4037');
        });

        // Buy button click
        buyBtn.on('pointerover', () => buyBtn.setTint(0xffff88));
        buyBtn.on('pointerout', () => buyBtn.clearTint());
        buyBtn.on('pointerdown', () => {
            this.handlePurchase(item, currency);
        });
    }

    private handlePurchase(item: ShopItem, currency: 'gold' | 'gem' | 'cash'): void {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const oneWeek = 7 * oneDay;

        // Check purchase limits
        if (item.key === 'shovel') {
            if (now - this.purchaseLimits.shovel.lastReset > oneWeek) {
                this.purchaseLimits.shovel = { count: 0, lastReset: now };
            }
            if (this.purchaseLimits.shovel.count >= 1) {
                this.showMessage('Weekly limit reached!', '#e74c3c');
                return;
            }
        }

        if (item.key === 'growthWater') {
            if (now - this.purchaseLimits.growthWater.lastReset > oneDay) {
                this.purchaseLimits.growthWater = { count: 0, lastReset: now };
            }
            if (this.purchaseLimits.growthWater.count >= 1) {
                this.showMessage('Daily limit reached!', '#e74c3c');
                return;
            }
        }

        if (item.key === 'mushroomExchange') {
            if (now - this.purchaseLimits.mushroomExchange.lastReset > oneWeek) {
                this.purchaseLimits.mushroomExchange = { count: 0, lastReset: now };
            }
            if (this.purchaseLimits.mushroomExchange.count >= 2) {
                this.showMessage('Weekly limit reached!', '#e74c3c');
                return;
            }
            const chestInventory = this.callbacks.getChestInventory();
            const algaeCount = chestInventory.reduce((total, slot) =>
                slot.type === 'social' ? total + slot.count : total, 0);
            if (algaeCount < 5) {
                this.showMessage('Need 5 mature Algae!', '#e74c3c');
                return;
            }
        }

        // Check currency
        if (currency === 'gold' && item.price > 0) {
            if (this.callbacks.getPlayerGold() < item.price) {
                this.showMessage('Not enough Gold!', '#e74c3c');
                return;
            }
            this.callbacks.setPlayerGold(this.callbacks.getPlayerGold() - item.price);
        } else if (currency === 'gem') {
            if (this.callbacks.getPlayerGems() < item.price) {
                this.showMessage('Not enough Gems!', '#e74c3c');
                return;
            }
            this.callbacks.setPlayerGems(this.callbacks.getPlayerGems() - item.price);
        } else if (currency === 'cash') {
            this.showMessage('IAP not available yet', '#f59e0b');
            return;
        }

        // Apply purchase effect
        const seedCounts = this.callbacks.getSeedCounts();
        const toolbarItems = this.callbacks.getToolbarItems();

        switch (item.key) {
            case 'shovel':
                this.purchaseLimits.shovel.count++;
                this.showMessage('Purchased Shovel!', '#4ade80');
                break;
            case 'gloves':
                this.showMessage('Purchased Gloves!', '#4ade80');
                break;
            case 'growthWater':
                this.purchaseLimits.growthWater.count++;
                const waterItem = toolbarItems.find(t => t.name === 'wateringCan');
                if (waterItem) waterItem.count = (waterItem.count || 0) + 10;
                this.showMessage('Purchased Growth Water!', '#4ade80');
                break;
            case 'fishFood':
                this.showMessage('Purchased Fish Food!', '#4ade80');
                break;
            case 'mushroomExchange':
                this.purchaseLimits.mushroomExchange.count++;
                let chestInventory = this.callbacks.getChestInventory();
                let toRemove = 5;
                for (let i = 0; i < chestInventory.length && toRemove > 0; i++) {
                    if (chestInventory[i].type === 'social') {
                        const remove = Math.min(chestInventory[i].count, toRemove);
                        chestInventory[i].count -= remove;
                        toRemove -= remove;
                    }
                }
                chestInventory = chestInventory.filter(slot => slot.count > 0);
                this.callbacks.setChestInventory(chestInventory);
                seedCounts.mushroom++;
                this.showMessage('Trade success! +1 Spore', '#4ade80');
                break;
            case 'algaeSeed':
                seedCounts.social++;
                this.showMessage('Purchased Algae Seed!', '#4ade80');
                break;
            case 'mushroomSeed':
                seedCounts.mushroom++;
                this.showMessage('Purchased Mushroom Spore!', '#4ade80');
                break;
            case 'mediumGrowth':
                const fertItem = toolbarItems.find(t => t.name === 'fertilizer');
                if (fertItem) fertItem.count = (fertItem.count || 0) + 3;
                this.showMessage('Purchased Mid Booster!', '#4ade80');
                break;
            case 'highGrowth':
                const fertItem2 = toolbarItems.find(t => t.name === 'fertilizer');
                if (fertItem2) fertItem2.count = (fertItem2.count || 0) + 5;
                this.showMessage('Purchased High Booster!', '#4ade80');
                break;
            case 'goldExchange':
                this.callbacks.setPlayerGold(this.callbacks.getPlayerGold() + 1000);
                this.showMessage('Trade success! +1000 Gold', '#4ade80');
                break;
        }

        this.callbacks.updateToolbar();
        this.callbacks.refreshProfileUI();
    }

    private showMessage(message: string, color: string): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;

        const msgText = this.scene.add.text(screenWidth / 2, screenHeight / 2 + 120, message, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: color,
            resolution: 2
        });
        msgText.setOrigin(0.5);
        msgText.setDepth(5400);
        msgText.setStroke('#000000', 2);
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
