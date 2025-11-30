import { Scene } from 'phaser';

export class TilesetDebug extends Scene {
    constructor() {
        super('TilesetDebug');
    }

    create() {
        this.cameras.main.setBackgroundColor('#333333');

        this.add.text(10, 10, 'Tileset Debug - Press ESC to return, 1/2 to switch', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 8, y: 4 }
        }).setScrollFactor(0).setDepth(1000);

        // Section 1: Square Buttons (48x48 each, 2 cols x 4 rows = 8 frames)
        this.add.text(20, 50, 'Square Buttons (48x48):', {
            fontSize: '12px',
            color: '#ffff00'
        });

        for (let i = 0; i < 8; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = 40 + col * 60;
            const y = 80 + row * 60;

            const sprite = this.add.sprite(x, y, 'square-buttons', i);
            sprite.setOrigin(0);

            this.add.text(x, y - 12, `#${i}`, {
                fontSize: '10px',
                color: '#00ff00'
            });
        }

        // Section 2: UI Big Play Button (96x32 each, 2 cols x 2 rows = 4 frames)
        this.add.text(200, 50, 'UI Big Play Button (96x32):', {
            fontSize: '12px',
            color: '#ffff00'
        });

        for (let i = 0; i < 4; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = 200 + col * 110;
            const y = 80 + row * 50;

            const sprite = this.add.sprite(x, y, 'ui-big-play-button', i);
            sprite.setOrigin(0);

            this.add.text(x, y - 12, `#${i}`, {
                fontSize: '10px',
                color: '#00ff00'
            });
        }

        // Info text
        this.add.text(20, 320, 'Frame layout:\n#0: Empty normal  #1: Play normal\n#2: Empty pressed #3: Play pressed', {
            fontSize: '11px',
            color: '#aaaaaa'
        });

        // ESC to return to game
        this.input.keyboard!.on('keydown-ESC', () => {
            this.scene.start('FarmingGame');
        });
    }
}
