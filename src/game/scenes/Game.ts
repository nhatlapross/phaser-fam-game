import { EventBus } from '../EventBus';
import { Scene } from 'phaser';

export class Game extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameText: Phaser.GameObjects.Text;
    player: Phaser.GameObjects.Sprite;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd: any;
    playerSpeed: number = 300;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);

        this.background = this.add.image(512, 384, 'background');
        this.background.setAlpha(0.5);

        // Create player character in the center of the screen
        this.player = this.add.sprite(512, 384, 'player');
        this.player.setScale(0.5); // Make the player smaller

        // Add keyboard controls
        this.cursors = this.input.keyboard!.createCursorKeys();

        // Add WASD keys as alternative controls
        this.wasd = {
            up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)
        };

        this.gameText = this.add.text(512, 50, 'Use Arrow Keys or WASD to move!', {
            fontFamily: 'Arial Black', fontSize: 24, color: '#ffffff',
            stroke: '#000000', strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);

        EventBus.emit('current-scene-ready', this);
    }

    update(_time: number, delta: number)
    {
        // Handle player movement
        let velocityX = 0;
        let velocityY = 0;

        // Check arrow keys
        if (this.cursors.left.isDown || this.wasd.left.isDown)
        {
            velocityX = -this.playerSpeed;
        }
        else if (this.cursors.right.isDown || this.wasd.right.isDown)
        {
            velocityX = this.playerSpeed;
        }

        if (this.cursors.up.isDown || this.wasd.up.isDown)
        {
            velocityY = -this.playerSpeed;
        }
        else if (this.cursors.down.isDown || this.wasd.down.isDown)
        {
            velocityY = this.playerSpeed;
        }

        // Normalize diagonal movement
        if (velocityX !== 0 && velocityY !== 0)
        {
            velocityX *= 0.707; // approximately 1/sqrt(2)
            velocityY *= 0.707;
        }

        // Update player position
        this.player.x += velocityX * (delta / 1000);
        this.player.y += velocityY * (delta / 1000);

        // Keep player within screen bounds
        this.player.x = Phaser.Math.Clamp(this.player.x, 0, 1024);
        this.player.y = Phaser.Math.Clamp(this.player.y, 0, 768);
    }

    changeScene ()
    {
        this.scene.start('GameOver');
    }
}
