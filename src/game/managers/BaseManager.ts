import Phaser from 'phaser';

/**
 * Base class for all game managers
 * Provides common functionality for modal management and UI elements
 */
export abstract class BaseManager {
    protected scene: Phaser.Scene;
    protected elements: Phaser.GameObjects.GameObject[] = [];
    protected isOpen: boolean = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /**
     * Check if the manager's modal/panel is open
     */
    public getIsOpen(): boolean {
        return this.isOpen;
    }

    /**
     * Destroy all UI elements managed by this manager
     */
    protected destroyElements(): void {
        this.elements.forEach(el => {
            if (el && el.destroy) {
                el.destroy();
            }
        });
        this.elements = [];
    }

    /**
     * Add element to the managed elements list
     */
    protected addElement(element: Phaser.GameObjects.GameObject): void {
        this.elements.push(element);
    }

    /**
     * Create a modal background overlay
     */
    protected createModalBackground(
        width: number,
        height: number,
        alpha: number = 0.7,
        color: number = 0x000000
    ): Phaser.GameObjects.Rectangle {
        const bg = this.scene.add.rectangle(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            width,
            height,
            color,
            alpha
        );
        bg.setScrollFactor(0);
        bg.setDepth(5000);
        this.addElement(bg);
        return bg;
    }

    /**
     * Create standard modal panel
     */
    protected createModalPanel(
        x: number,
        y: number,
        width: number,
        height: number,
        depth: number = 5001
    ): Phaser.GameObjects.Rectangle {
        const panel = this.scene.add.rectangle(x, y, width, height, 0x8B4513);
        panel.setScrollFactor(0);
        panel.setDepth(depth);
        panel.setStrokeStyle(3, 0x5D4037);
        this.addElement(panel);
        return panel;
    }

    /**
     * Create standard text element
     */
    protected createText(
        x: number,
        y: number,
        text: string,
        style: Phaser.Types.GameObjects.Text.TextStyle,
        depth: number = 5002
    ): Phaser.GameObjects.Text {
        const textObj = this.scene.add.text(x, y, text, {
            fontFamily: 'PixelFont',
            resolution: 2,
            ...style
        });
        textObj.setScrollFactor(0);
        textObj.setDepth(depth);
        this.addElement(textObj);
        return textObj;
    }

    /**
     * Create a close button for modals
     */
    protected createCloseButton(
        x: number,
        y: number,
        onClick: () => void,
        depth: number = 5003
    ): Phaser.GameObjects.Text {
        const closeBtn = this.scene.add.text(x, y, 'X', {
            fontSize: '16px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        closeBtn.setScrollFactor(0);
        closeBtn.setDepth(depth);
        closeBtn.setOrigin(0.5);
        closeBtn.setInteractive({ useHandCursor: true });
        closeBtn.on('pointerover', () => closeBtn.setColor('#FF6B6B'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#FFFFFF'));
        closeBtn.on('pointerdown', onClick);
        this.addElement(closeBtn);
        return closeBtn;
    }

    /**
     * Create a standard button
     */
    protected createButton(
        x: number,
        y: number,
        width: number,
        height: number,
        text: string,
        onClick: () => void,
        bgColor: number = 0x4CAF50,
        depth: number = 5002
    ): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
        const btnBg = this.scene.add.rectangle(x, y, width, height, bgColor);
        btnBg.setScrollFactor(0);
        btnBg.setDepth(depth);
        btnBg.setStrokeStyle(2, 0x2E7D32);
        btnBg.setInteractive({ useHandCursor: true });

        const btnText = this.scene.add.text(x, y, text, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        btnText.setScrollFactor(0);
        btnText.setDepth(depth + 1);
        btnText.setOrigin(0.5);

        btnBg.on('pointerover', () => btnBg.setFillStyle(0x66BB6A));
        btnBg.on('pointerout', () => btnBg.setFillStyle(bgColor));
        btnBg.on('pointerdown', onClick);

        this.addElement(btnBg);
        this.addElement(btnText);

        return { bg: btnBg, text: btnText };
    }

    /**
     * Setup camera ignore for UI elements (make them fixed on screen)
     */
    protected setupCameraIgnore(mainCamera: Phaser.Cameras.Scene2D.Camera): void {
        this.elements.forEach(el => {
            mainCamera.ignore(el);
        });
    }

    /**
     * Setup interactive hover effect with Tint + Shadow outline for game objects
     * Creates a glowing outline effect around the sprite on hover
     */
    protected setupHoverEffect(
        sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
        shadowOffsetY: number = 4,
        tintColor: number = 0xffff88
    ): Phaser.GameObjects.Ellipse {
        // Create shadow ellipse under the sprite
        const shadow = this.scene.add.ellipse(
            sprite.x,
            sprite.y + sprite.displayHeight / 2 + shadowOffsetY,
            sprite.displayWidth * 0.9,
            sprite.displayHeight * 0.35,
            0x000000,
            0
        );
        shadow.setDepth(sprite.depth - 1);

        // Setup hover events
        sprite.on('pointerover', () => {
            sprite.setTint(tintColor);
            // Show shadow
            this.scene.tweens.add({
                targets: shadow,
                alpha: 0.5,
                duration: 150,
                ease: 'Quad.easeOut'
            });
        });

        sprite.on('pointerout', () => {
            sprite.clearTint();
            // Hide shadow
            this.scene.tweens.add({
                targets: shadow,
                alpha: 0,
                duration: 150,
                ease: 'Quad.easeIn'
            });
        });

        return shadow;
    }

    /**
     * Clean up when manager is destroyed
     */
    public destroy(): void {
        this.destroyElements();
    }
}
