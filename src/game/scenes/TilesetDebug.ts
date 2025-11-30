import { Scene } from 'phaser';

export class TilesetDebug extends Scene {
    constructor() {
        super('TilesetDebug');
    }

    create() {
        this.add.text(10, 10, 'UI Spritesheet Debug - Press ESC to return', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 10, y: 5 }
        }).setScrollFactor(0).setDepth(1000);

        // Display all UI sprites in a grid
        // ui-spritesheet is larger, so we need more cols/rows
        let spriteIndex = 0;
        const cols = 20;
        const rows = 12;
        const maxSprites = cols * rows;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (spriteIndex >= maxSprites) break;

                // Try to display sprite
                try {
                    const sprite = this.add.sprite(
                        x * 18 + 10,
                        y * 18 + 35,
                        'ui-spritesheet',
                        spriteIndex
                    );
                    sprite.setOrigin(0.5);

                    // Add sprite index text
                    this.add.text(
                        x * 18 + 2,
                        y * 18 + 27,
                        spriteIndex.toString(),
                        {
                            fontSize: '6px',
                            color: '#ff0000',
                            backgroundColor: '#ffffff99'
                        }
                    );
                } catch (e) {
                    // Sprite doesn't exist, skip
                }

                spriteIndex++;
            }
            if (spriteIndex >= maxSprites) break;
        }

        // Scale up for better visibility
        this.cameras.main.setZoom(3);
        this.cameras.main.centerOn(cols * 18 / 2, rows * 18 / 2 + 20);

        // ESC to return to game
        this.input.keyboard!.on('keydown-ESC', () => {
            this.scene.start('FarmingGame');
        });
    }
}
