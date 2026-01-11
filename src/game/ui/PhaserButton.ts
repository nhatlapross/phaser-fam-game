import Phaser from 'phaser';

export interface PhaserButtonStyle {
    // Size
    width?: number;
    height?: number;
    padding?: { x: number; y: number };

    // Colors
    backgroundColor?: number;
    backgroundColorHover?: number;
    backgroundColorPressed?: number;
    backgroundColorDisabled?: number;

    // Border
    borderColor?: number;
    borderColorHover?: number;
    borderWidth?: number;
    borderRadius?: number;

    // Text
    fontSize?: string;
    fontFamily?: string;
    textColor?: string;
    textColorHover?: string;
    textColorDisabled?: string;
    textStroke?: string;
    textStrokeThickness?: number;

    // Shadow
    shadowColor?: number;
    shadowOffsetY?: number;
}

export interface PhaserButtonConfig {
    scene: Phaser.Scene;
    x: number;
    y: number;
    text: string;
    style?: PhaserButtonStyle;
    icon?: {
        key: string;
        frame?: string | number;
        scale?: number;
        spacing?: number;
    };
    onClick?: () => void;
    depth?: number;
}

const DEFAULT_STYLE: Required<PhaserButtonStyle> = {
    width: 200,
    height: 50,
    padding: { x: 20, y: 12 },

    backgroundColor: 0x6D4C41,
    backgroundColorHover: 0x8D6E63,
    backgroundColorPressed: 0x5D4037,
    backgroundColorDisabled: 0x9E9E9E,

    borderColor: 0x3E2723,
    borderColorHover: 0x3E2723,
    borderWidth: 3,
    borderRadius: 8,

    fontSize: '16px',
    fontFamily: 'Arial, sans-serif',
    textColor: '#FFFFFF',
    textColorHover: '#FFFFFF',
    textColorDisabled: '#CCCCCC',
    textStroke: '#3E2723',
    textStrokeThickness: 2,

    shadowColor: 0x3E2723,
    shadowOffsetY: 4,
};

export class PhaserButton extends Phaser.GameObjects.Container {
    private background: Phaser.GameObjects.Graphics;
    private shadow: Phaser.GameObjects.Graphics;
    private label: Phaser.GameObjects.Text;
    private iconSprite?: Phaser.GameObjects.Image;

    private style: Required<PhaserButtonStyle>;
    private buttonWidth: number;
    private buttonHeight: number;

    private isHovered: boolean = false;
    private isPressed: boolean = false;
    private isDisabled: boolean = false;

    private onClick?: () => void;

    constructor(config: PhaserButtonConfig) {
        super(config.scene, config.x, config.y);

        this.style = { ...DEFAULT_STYLE, ...config.style };
        this.onClick = config.onClick;

        // Calculate button size based on text or fixed width
        this.buttonWidth = this.style.width;
        this.buttonHeight = this.style.height;

        // Create shadow
        this.shadow = this.scene.add.graphics();
        this.add(this.shadow);

        // Create background
        this.background = this.scene.add.graphics();
        this.add(this.background);

        // Create icon if provided
        if (config.icon) {
            this.iconSprite = this.scene.add.image(0, 0, config.icon.key, config.icon.frame);
            if (config.icon.scale) {
                this.iconSprite.setScale(config.icon.scale);
            }
            this.add(this.iconSprite);
        }

        // Create text label
        this.label = this.scene.add.text(0, 0, config.text, {
            fontSize: this.style.fontSize,
            fontFamily: this.style.fontFamily,
            color: this.style.textColor,
            resolution: 2,
        });
        this.label.setOrigin(0.5);
        if (this.style.textStroke) {
            this.label.setStroke(this.style.textStroke, this.style.textStrokeThickness);
        }
        this.add(this.label);

        // Position icon and text
        this.layoutContent(config.icon?.spacing ?? 10);

        // Draw initial state
        this.drawButton();

        // Set up interactivity
        this.setSize(this.buttonWidth, this.buttonHeight);
        this.setInteractive({ useHandCursor: true })
            .on('pointerover', this.onPointerOver, this)
            .on('pointerout', this.onPointerOut, this)
            .on('pointerdown', this.onPointerDown, this)
            .on('pointerup', this.onPointerUp, this);

        // Set depth
        if (config.depth !== undefined) {
            this.setDepth(config.depth);
        }

        // Add to scene
        this.scene.add.existing(this);
    }

    private layoutContent(iconSpacing: number): void {
        if (this.iconSprite) {
            const totalWidth = this.iconSprite.displayWidth + iconSpacing + this.label.width;
            const startX = -totalWidth / 2;

            this.iconSprite.setPosition(
                startX + this.iconSprite.displayWidth / 2,
                0
            );
            this.label.setPosition(
                startX + this.iconSprite.displayWidth + iconSpacing + this.label.width / 2,
                0
            );
        } else {
            this.label.setPosition(0, 0);
        }
    }

    private drawButton(): void {
        const { borderRadius, borderWidth, shadowOffsetY } = this.style;
        const halfWidth = this.buttonWidth / 2;
        const halfHeight = this.buttonHeight / 2;

        // Clear previous drawings
        this.shadow.clear();
        this.background.clear();

        // Determine colors based on state
        let bgColor = this.style.backgroundColor;
        let borderColor = this.style.borderColor;
        let textColor = this.style.textColor;
        let yOffset = 0;
        let shadowVisible = true;

        if (this.isDisabled) {
            bgColor = this.style.backgroundColorDisabled;
            textColor = this.style.textColorDisabled;
        } else if (this.isPressed) {
            bgColor = this.style.backgroundColorPressed;
            yOffset = shadowOffsetY - 1;
            shadowVisible = false;
        } else if (this.isHovered) {
            bgColor = this.style.backgroundColorHover;
            borderColor = this.style.borderColorHover;
            textColor = this.style.textColorHover;
        }

        // Draw shadow
        if (shadowVisible && shadowOffsetY > 0) {
            this.shadow.fillStyle(this.style.shadowColor, 1);
            this.shadow.fillRoundedRect(
                -halfWidth,
                -halfHeight + shadowOffsetY,
                this.buttonWidth,
                this.buttonHeight,
                borderRadius
            );
        }

        // Draw border
        this.background.fillStyle(borderColor, 1);
        this.background.fillRoundedRect(
            -halfWidth,
            -halfHeight + yOffset,
            this.buttonWidth,
            this.buttonHeight,
            borderRadius
        );

        // Draw background (slightly smaller for border effect)
        this.background.fillStyle(bgColor, 1);
        this.background.fillRoundedRect(
            -halfWidth + borderWidth,
            -halfHeight + borderWidth + yOffset,
            this.buttonWidth - borderWidth * 2,
            this.buttonHeight - borderWidth * 2,
            Math.max(0, borderRadius - borderWidth)
        );

        // Update label color and position
        this.label.setColor(textColor);
        this.label.setY(yOffset);
        if (this.iconSprite) {
            this.iconSprite.setY(yOffset);
        }
    }

    private onPointerOver(): void {
        if (this.isDisabled) return;
        this.isHovered = true;
        this.drawButton();
    }

    private onPointerOut(): void {
        if (this.isDisabled) return;
        this.isHovered = false;
        this.isPressed = false;
        this.drawButton();
    }

    private onPointerDown(): void {
        if (this.isDisabled) return;
        this.isPressed = true;
        this.drawButton();
    }

    private onPointerUp(): void {
        if (this.isDisabled) return;

        if (this.isPressed && this.onClick) {
            this.onClick();
        }

        this.isPressed = false;
        this.drawButton();
    }

    // Public methods

    public setText(text: string): this {
        this.label.setText(text);
        this.layoutContent(10);
        return this;
    }

    public setDisabled(disabled: boolean): this {
        this.isDisabled = disabled;
        this.drawButton();

        if (disabled) {
            this.disableInteractive();
        } else {
            this.setInteractive({ useHandCursor: true });
        }

        return this;
    }

    public setCallback(callback: () => void): this {
        this.onClick = callback;
        return this;
    }

    public setButtonStyle(style: Partial<PhaserButtonStyle>): this {
        this.style = { ...this.style, ...style };
        this.drawButton();
        return this;
    }

    public getIsDisabled(): boolean {
        return this.isDisabled;
    }
}

// Preset button styles
export const ButtonPresets = {
    primary: {
        backgroundColor: 0x6D4C41,
        backgroundColorHover: 0x8D6E63,
        backgroundColorPressed: 0x5D4037,
        borderColor: 0x3E2723,
        shadowColor: 0x3E2723,
    } as PhaserButtonStyle,

    secondary: {
        backgroundColor: 0x4CAF50,
        backgroundColorHover: 0x66BB6A,
        backgroundColorPressed: 0x388E3C,
        borderColor: 0x2E7D32,
        shadowColor: 0x2E7D32,
    } as PhaserButtonStyle,

    danger: {
        backgroundColor: 0xE53935,
        backgroundColorHover: 0xEF5350,
        backgroundColorPressed: 0xC62828,
        borderColor: 0xB71C1C,
        shadowColor: 0xB71C1C,
    } as PhaserButtonStyle,

    gold: {
        backgroundColor: 0xFFA000,
        backgroundColorHover: 0xFFB300,
        backgroundColorPressed: 0xFF8F00,
        borderColor: 0xE65100,
        shadowColor: 0xE65100,
    } as PhaserButtonStyle,
};
