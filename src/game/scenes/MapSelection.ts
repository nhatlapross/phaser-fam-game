import { Scene } from "phaser";
import { EventBus } from "../EventBus";

/**
 * MapSelection Scene - Choose which map to enter
 * Beautiful design matching StationManager travel modal
 */
export class MapSelection extends Scene {
    constructor() {
        super("MapSelection");
    }

    create() {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        // Background
        const bg = this.add.image(centerX, centerY, "start-background");
        bg.setDisplaySize(this.scale.width, this.scale.height);

        // Semi-transparent overlay
        this.add.rectangle(
            centerX,
            centerY,
            this.scale.width,
            this.scale.height,
            0x000000,
            0.6,
        );

        // Modal panel
        const modalWidth = 280;
        const modalHeight = 340;

        const modalBg = this.add.sprite(centerX, centerY, "settings-panel", 1);
        modalBg.setDisplaySize(modalWidth, modalHeight);

        // Title
        const title = this.add.text(centerX, centerY - 140, "TRAVEL", {
            fontSize: "14px",
            fontFamily: "PixelFont",
            color: "#FFD700",
            resolution: 2,
        });
        title.setOrigin(0.5);
        title.setStroke("#5D4037", 3);

        // Subtitle
        const subtitle = this.add.text(
            centerX,
            centerY - 122,
            "Choose destination",
            {
                fontSize: "9px",
                fontFamily: "PixelFont",
                color: "#FFFFFF",
                resolution: 2,
            },
        );
        subtitle.setOrigin(0.5);
        subtitle.setStroke("#5D4037", 2);

        // Map options
        const maps = [
            {
                id: "farm",
                name: "Farm",
                icon: "🏡",
                scene: "FarmingGame",
                bgImage: "place-farm",
            },
            {
                id: "petfarm",
                name: "Pet Farm",
                icon: "🐾",
                scene: "PetFarm",
                bgImage: "place-pethome",
            },
            {
                id: "square",
                name: "Town Square",
                icon: "🏛️",
                scene: "TownSquare",
                bgImage: "place-townsquare",
            },
        ];

        // Create destination buttons
        const startY = centerY - 70;
        const buttonWidth = modalWidth - 60;
        const buttonHeight = 70;
        const buttonSpacing = 10;

        maps.forEach((map, index) => {
            const buttonY = startY + index * (buttonHeight + buttonSpacing);
            this.createDestinationButton(
                centerX,
                buttonY,
                buttonWidth,
                buttonHeight,
                map,
            );
        });

        // Fade in
        this.cameras.main.fadeIn(500);

        EventBus.emit("current-scene-ready", this);
    }

    private createDestinationButton(
        x: number,
        y: number,
        width: number,
        height: number,
        map: any,
    ): void {
        // Background image with proper aspect ratio
        const bgImage = this.add.image(x, y, map.bgImage);

        // Scale to cover while maintaining aspect ratio
        const scaleX = width / bgImage.width;
        const scaleY = height / bgImage.height;
        const scale = Math.max(scaleX, scaleY);
        bgImage.setScale(scale);

        // Mask to crop to button size
        const mask = this.add.graphics();
        mask.fillRect(x - width / 2, y - height / 2, width, height);
        bgImage.setMask(mask.createGeometryMask());

        // Border frame
        const border = this.add.rectangle(x, y, width, height);
        border.setStrokeStyle(3, 0x4a7c59);
        border.setFillStyle(0x000000, 0); // Transparent fill

        // Make interactive
        bgImage.setInteractive({ useHandCursor: true });

        bgImage.on("pointerover", () => {
            bgImage.setTint(0xffffaa);
            border.setStrokeStyle(3, 0xffd700);
        });

        bgImage.on("pointerout", () => {
            bgImage.clearTint();
            border.setStrokeStyle(3, 0x4a7c59);
        });

        bgImage.on("pointerdown", () => {
            // Flash effect
            this.tweens.add({
                targets: [bgImage, border],
                alpha: 0.5,
                duration: 100,
                yoyo: true,
                onComplete: () => {
                    this.cameras.main.fadeOut(300);
                    this.cameras.main.once("camerafadeoutcomplete", () => {
                        this.scene.start(map.scene);
                    });
                },
            });
        });

        // Semi-transparent overlay at bottom for text
        const textBg = this.add.rectangle(
            x,
            y + height / 2 - 15,
            width,
            30,
            0x000000,
            0.7,
        );

        // Icon
        const icon = this.add.text(
            x - width / 2 + 15,
            y + height / 2 - 15,
            map.icon,
            {
                fontSize: "16px",
            },
        );
        icon.setOrigin(0, 0.5);

        // Name
        const nameText = this.add.text(
            x - width / 2 + 40,
            y + height / 2 - 15,
            map.name.toUpperCase(),
            {
                fontSize: "10px",
                fontFamily: "PixelFont",
                color: "#FFFFFF",
                resolution: 2,
            },
        );
        nameText.setOrigin(0, 0.5);
        nameText.setStroke("#000000", 2);
    }
}

