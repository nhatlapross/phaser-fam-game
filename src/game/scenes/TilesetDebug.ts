import { Scene } from 'phaser';

export class TilesetDebug extends Scene {
    constructor() {
        super('TilesetDebug');
    }

    create() {
        this.add.text(10, 10, 'Square Buttons 26x26 Debug - Press ESC to return', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 10, y: 5 }
        }).setScrollFactor(0).setDepth(1000);

        // Display all square buttons in a grid (2 cols x 4 rows = 8 buttons)
        let spriteIndex = 0;
        const cols = 2;
        const rows = 4;
        const maxSprites = 8;
        const spacing = 32;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (spriteIndex >= maxSprites) break;

                // Try to display sprite
                try {
                    const sprite = this.add.sprite(
                        x * spacing + 20,
                        y * spacing + 40,
                        'square-buttons',
                        spriteIndex
                    );
                    sprite.setOrigin(0.5);

                    // Add sprite index text
                    this.add.text(
                        x * spacing + 8,
                        y * spacing + 28,
                        spriteIndex.toString(),
                        {
                            fontSize: '10px',
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
        this.cameras.main.setZoom(4);
        this.cameras.main.centerOn(cols * spacing / 2 + 5, rows * spacing / 2 + 25);

        // ESC to return to game
        this.input.keyboard!.on('keydown-ESC', () => {
            this.scene.start('FarmingGame');
        });
    }
}
