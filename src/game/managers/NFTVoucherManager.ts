import Phaser from 'phaser';
import { BaseManager } from './BaseManager';

/**
 * NFT Voucher data structure
 */
export interface NFTVoucher {
    id: string;
    title: string;
    description: string;
    imageUrl?: string;
    icon: string;           // Emoji icon fallback
    expiryDate?: string;    // ISO date string
    location?: string;      // Redemption location
    isMintedOnChain: boolean;
    claimedAt: string;      // ISO date string
}

/**
 * Sample data for testing
 */
export const SAMPLE_VOUCHERS: NFTVoucher[] = [
    {
        id: 'voucher-001',
        title: 'Free Coffee',
        description: 'Redeem at The Coffee House',
        icon: '☕',
        location: 'The Coffee House - D1',
        expiryDate: '2025-06-30T23:59:59Z',
        isMintedOnChain: true,
        claimedAt: '2025-01-15T10:30:00Z'
    },
    {
        id: 'voucher-002',
        title: '50% Off Drinks',
        description: 'For orders over 50k',
        icon: '🥤',
        location: 'Highlands Coffee',
        expiryDate: '2025-03-31T23:59:59Z',
        isMintedOnChain: false,
        claimedAt: '2025-01-20T14:15:00Z'
    },
    {
        id: 'voucher-003',
        title: 'NFT Collectible #42',
        description: 'Limited Edition FAM NFT',
        icon: '🎨',
        isMintedOnChain: true,
        claimedAt: '2025-01-10T09:00:00Z'
    },
    {
        id: 'voucher-004',
        title: 'Free Pastry',
        description: 'With any drink purchase',
        icon: '🍰',
        location: 'Paris Baguette',
        expiryDate: '2025-02-28T23:59:59Z',
        isMintedOnChain: false,
        claimedAt: '2025-01-25T16:45:00Z'
    }
];

interface NFTVoucherCallbacks {
    showToastMessage: (text: string, color: number) => void;
}

/**
 * Manages NFT Voucher display in profile
 */
export class NFTVoucherManager extends BaseManager {
    private callbacks: NFTVoucherCallbacks;
    private voucherElements: Phaser.GameObjects.GameObject[] = [];
    private vouchers: NFTVoucher[] = [];
    private scrollY: number = 0;
    private maxScrollY: number = 0;
    private containerMask: Phaser.Display.Masks.GeometryMask | null = null;
    private scrollContainer: Phaser.GameObjects.Container | null = null;

    constructor(scene: Phaser.Scene, callbacks: NFTVoucherCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }

    /**
     * Load vouchers (from API or sample data)
     */
    public loadVouchers(vouchers?: NFTVoucher[]): void {
        this.vouchers = vouchers || SAMPLE_VOUCHERS;
    }

    /**
     * Create voucher list UI inside a container area
     */
    public createVoucherList(
        containerX: number,
        containerY: number,
        containerWidth: number,
        containerHeight: number,
        depth: number = 5300
    ): Phaser.GameObjects.GameObject[] {
        this.destroyVoucherElements();
        this.scrollY = 0;

        const cardHeight = 48;  // Smaller height
        const cardSpacing = 5;
        const padding = 5;
        const cardWidth = containerWidth - padding * 2;  // Cards narrower than container

        // Calculate total content height
        const totalHeight = this.vouchers.length * (cardHeight + cardSpacing);
        this.maxScrollY = Math.max(0, totalHeight - containerHeight + padding);

        // Background for voucher area (optional, can remove if not needed)
        const listBg = this.scene.add.rectangle(containerX, containerY, containerWidth, containerHeight, 0x2D2D2D, 0.3);
        listBg.setStrokeStyle(1, 0x5D4037);
        listBg.setDepth(depth);
        this.scene.cameras.main.ignore(listBg);
        this.voucherElements.push(listBg);

        // Create scroll container
        this.scrollContainer = this.scene.add.container(containerX, containerY);
        this.scrollContainer.setDepth(depth + 1);
        this.scene.cameras.main.ignore(this.scrollContainer);
        this.voucherElements.push(this.scrollContainer);

        // Create mask for clipping
        const maskShape = this.scene.make.graphics({});
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(
            containerX - containerWidth / 2,
            containerY - containerHeight / 2,
            containerWidth,
            containerHeight
        );
        const mask = maskShape.createGeometryMask();
        this.scrollContainer.setMask(mask);
        this.containerMask = mask;

        // Create voucher cards - centered horizontally (x = 0 relative to container)
        const startY = -containerHeight / 2 + padding + cardHeight / 2;
        
        this.vouchers.forEach((voucher, index) => {
            const cardY = startY + index * (cardHeight + cardSpacing);
            this.createVoucherCard(voucher, 0, cardY, cardWidth, cardHeight, depth);
        });

        // Empty state
        if (this.vouchers.length === 0) {
            const emptyText = this.scene.add.text(0, 0, '🎁 No vouchers yet', {
                fontSize: '11px',
                fontFamily: 'PixelFont',
                color: '#8D6E63',
                resolution: 2
            });
            emptyText.setOrigin(0.5);
            this.scrollContainer.add(emptyText);
        }

        // Setup scroll interaction
        this.setupScrolling(containerX, containerY, containerWidth, containerHeight);

        return this.voucherElements;
    }

    /**
     * Create a single voucher card (compact layout with animations)
     */
    private createVoucherCard(
        voucher: NFTVoucher,
        x: number,
        y: number,
        width: number,
        height: number,
        depth: number,
        index: number = 0
    ): void {
        if (!this.scrollContainer) return;

        // Card background
        const cardBg = this.scene.add.rectangle(x, y, width, height, 0x4E342E, 0.95);
        cardBg.setStrokeStyle(2, voucher.isMintedOnChain ? 0x4CAF50 : 0xFFA726);
        this.scrollContainer.add(cardBg);

        // Icon (left side with more padding)
        const iconSize = 32;
        const leftPadding = 12;
        const iconX = x - width / 2 + leftPadding + iconSize / 2;
        
        const iconBg = this.scene.add.rectangle(iconX, y, iconSize, iconSize, 0x3E2723, 1);
        iconBg.setStrokeStyle(1, 0x5D4037);
        this.scrollContainer.add(iconBg);

        const iconText = this.scene.add.text(iconX, y, voucher.icon, {
            fontSize: '16px',
            resolution: 2
        });
        iconText.setOrigin(0.5);
        this.scrollContainer.add(iconText);

        // Content area
        const contentX = iconX + iconSize / 2 + 10;

        // Title (top line)
        const titleText = voucher.title.length > 18 ? voucher.title.substring(0, 16) + '..' : voucher.title;
        const title = this.scene.add.text(contentX, y - 12, titleText, {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        title.setOrigin(0, 0.5);
        title.setStroke('#000000', 1);
        this.scrollContainer.add(title);

        // Status (bottom line)
        const statusText = voucher.isMintedOnChain ? '✓ On-chain' : '⏳ Pending';
        const statusColor = voucher.isMintedOnChain ? '#4CAF50' : '#FFA726';
        
        const status = this.scene.add.text(contentX, y + 10, statusText, {
            fontSize: '7px',
            fontFamily: 'PixelFont',
            color: statusColor,
            resolution: 2
        });
        status.setOrigin(0, 0.5);
        this.scrollContainer.add(status);

        // Expiry date (right side with padding)
        if (voucher.expiryDate) {
            const expiryDate = new Date(voucher.expiryDate);
            const now = new Date();
            const isExpired = expiryDate < now;
            const expiryStr = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            const expiry = this.scene.add.text(x + width / 2 - 10, y, expiryStr, {
                fontSize: '6px',
                fontFamily: 'PixelFont',
                color: isExpired ? '#EF5350' : '#8D6E63',
                resolution: 2
            });
            expiry.setOrigin(1, 0.5);
            this.scrollContainer.add(expiry);
        }

        // Shine indicator for on-chain vouchers
        if (voucher.isMintedOnChain) {
            const shine = this.scene.add.rectangle(x + width / 2 - 8, y - height / 2 + 8, 6, 6, 0x4CAF50, 1);
            this.scrollContainer.add(shine);
            
            // Pulsing glow effect
            this.scene.tweens.add({
                targets: shine,
                alpha: 0.3,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        // Entrance animation - slide in from right with fade
        const cardElements = [cardBg, iconBg, iconText, title, status];
        cardElements.forEach(el => {
            el.setAlpha(0);
            (el as any).x += 30;
        });

        this.scene.tweens.add({
            targets: cardElements,
            alpha: 1,
            x: `-=30`,
            duration: 300,
            delay: index * 50,  // Stagger effect
            ease: 'Back.easeOut'
        });

        // Make card interactive with hover effects
        cardBg.setInteractive({ useHandCursor: true });
        
        cardBg.on('pointerover', () => {
            this.scene.tweens.add({
                targets: [cardBg, iconBg],
                scaleX: 1.02,
                scaleY: 1.02,
                duration: 100,
                ease: 'Quad.easeOut'
            });
            cardBg.setFillStyle(0x5D4037, 1);
        });
        
        cardBg.on('pointerout', () => {
            this.scene.tweens.add({
                targets: [cardBg, iconBg],
                scaleX: 1,
                scaleY: 1,
                duration: 100,
                ease: 'Quad.easeOut'
            });
            cardBg.setFillStyle(0x4E342E, 0.95);
        });
        
        cardBg.on('pointerdown', () => {
            // Quick press effect
            this.scene.tweens.add({
                targets: cardBg,
                scaleX: 0.98,
                scaleY: 0.98,
                duration: 50,
                yoyo: true,
                onComplete: () => this.showVoucherDetail(voucher)
            });
        });
    }

    /**
     * Setup scroll interaction
     */
    private setupScrolling(
        containerX: number,
        containerY: number,
        containerWidth: number,
        containerHeight: number
    ): void {
        if (this.maxScrollY <= 0) return; // No need to scroll

        // Create invisible scroll area
        const scrollArea = this.scene.add.rectangle(
            containerX,
            containerY,
            containerWidth,
            containerHeight,
            0x000000,
            0
        );
        scrollArea.setDepth(5350);
        scrollArea.setInteractive();
        this.scene.cameras.main.ignore(scrollArea);
        this.voucherElements.push(scrollArea);

        // Mouse wheel scrolling
        this.scene.input.on('wheel', (
            pointer: Phaser.Input.Pointer,
            _gameObjects: Phaser.GameObjects.GameObject[],
            _deltaX: number,
            deltaY: number
        ) => {
            const bounds = scrollArea.getBounds();
            if (pointer.x >= bounds.left && pointer.x <= bounds.right &&
                pointer.y >= bounds.top && pointer.y <= bounds.bottom) {
                this.scroll(deltaY * 0.3);
            }
        });

        // Touch/drag scrolling
        let isDragging = false;
        let lastY = 0;

        scrollArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            isDragging = true;
            lastY = pointer.y;
        });

        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (isDragging && this.scrollContainer) {
                const deltaY = lastY - pointer.y;
                this.scroll(deltaY);
                lastY = pointer.y;
            }
        });

        this.scene.input.on('pointerup', () => {
            isDragging = false;
        });
    }

    /**
     * Scroll the voucher list by moving all children
     */
    private scroll(deltaY: number): void {
        if (!this.scrollContainer || this.maxScrollY <= 0) return;

        const oldScrollY = this.scrollY;
        this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY, 0, this.maxScrollY);
        
        const scrollDelta = this.scrollY - oldScrollY;
        if (scrollDelta === 0) return;

        // Move all children up/down
        this.scrollContainer.list.forEach((child: any) => {
            if (child.y !== undefined) {
                child.y -= scrollDelta;
            }
        });
    }

    /**
     * Show voucher detail popup
     */
    private showVoucherDetail(voucher: NFTVoucher): void {
        const screenWidth = this.scene.scale.width;
        const screenHeight = this.scene.scale.height;
        const popupWidth = 250;
        const popupHeight = 200;

        // Overlay
        const overlay = this.scene.add.rectangle(
            screenWidth / 2,
            screenHeight / 2,
            screenWidth,
            screenHeight,
            0x000000,
            0.7
        );
        overlay.setDepth(5400);
        overlay.setInteractive();
        this.scene.cameras.main.ignore(overlay);

        // Popup background
        const popup = this.scene.add.rectangle(
            screenWidth / 2,
            screenHeight / 2,
            popupWidth,
            popupHeight,
            0x3E2723,
            0.98
        );
        popup.setStrokeStyle(3, voucher.isMintedOnChain ? 0x4CAF50 : 0xFFA726);
        popup.setDepth(5401);
        this.scene.cameras.main.ignore(popup);

        // Icon
        const icon = this.scene.add.text(screenWidth / 2, screenHeight / 2 - 60, voucher.icon, {
            fontSize: '40px',
            resolution: 2
        });
        icon.setOrigin(0.5);
        icon.setDepth(5402);
        this.scene.cameras.main.ignore(icon);

        // Title
        const title = this.scene.add.text(screenWidth / 2, screenHeight / 2 - 20, voucher.title, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setStroke('#000000', 2);
        title.setDepth(5402);
        this.scene.cameras.main.ignore(title);

        // Description
        const desc = this.scene.add.text(screenWidth / 2, screenHeight / 2 + 5, voucher.description, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2,
            wordWrap: { width: popupWidth - 30 },
            align: 'center'
        });
        desc.setOrigin(0.5);
        desc.setDepth(5402);
        this.scene.cameras.main.ignore(desc);

        // Status
        const statusText = voucher.isMintedOnChain 
            ? '✓ In your wallet' 
            : '⏳ Claimed - Pending blockchain confirmation';
        const status = this.scene.add.text(screenWidth / 2, screenHeight / 2 + 35, statusText, {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: voucher.isMintedOnChain ? '#4CAF50' : '#FFA726',
            resolution: 2,
            wordWrap: { width: popupWidth - 20 },
            align: 'center'
        });
        status.setOrigin(0.5);
        status.setDepth(5402);
        this.scene.cameras.main.ignore(status);

        // Collect all detail elements for cleanup
        const detailElements: Phaser.GameObjects.GameObject[] = [overlay, popup, icon, title, desc, status];

        // Location if exists
        if (voucher.location) {
            const location = this.scene.add.text(screenWidth / 2, screenHeight / 2 + 55, `📍 ${voucher.location}`, {
                fontSize: '8px',
                fontFamily: 'PixelFont',
                color: '#BCAAA4',
                resolution: 2
            });
            location.setOrigin(0.5);
            location.setDepth(5402);
            this.scene.cameras.main.ignore(location);
            detailElements.push(location);
        }

        // Close button
        const closeBtn = this.scene.add.text(
            screenWidth / 2 + popupWidth / 2 - 15,
            screenHeight / 2 - popupHeight / 2 + 15,
            '✕',
            {
                fontSize: '16px',
                color: '#FF5722',
                resolution: 2
            }
        );
        closeBtn.setOrigin(0.5);
        closeBtn.setDepth(5403);
        closeBtn.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(closeBtn);
        detailElements.push(closeBtn);
        
        const closePopup = () => {
            detailElements.forEach(el => el.destroy());
        };

        overlay.on('pointerdown', closePopup);
        closeBtn.on('pointerdown', closePopup);
    }

    /**
     * Destroy all voucher elements
     */
    private destroyVoucherElements(): void {
        this.voucherElements.forEach(el => {
            if (el && (el as any).destroy) (el as any).destroy();
        });
        this.voucherElements = [];
        this.scrollContainer = null;
        this.containerMask = null;
    }

    public destroy(): void {
        this.destroyVoucherElements();
        super.destroy();
    }
}
