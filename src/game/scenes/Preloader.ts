import { Scene } from 'phaser';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        //  We loaded this image in our Boot Scene, so we can display it here
        this.add.image(512, 384, 'background');

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(512-230, 384, 4, 28, 0xffffff);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload ()
    {
        //  Load the assets for the game
        this.load.setPath('assets');

        // Legacy assets
        this.load.image('logo', 'logo.png');
        this.load.image('star', 'star.png');

        // Farming game assets
        // Character spritesheet (48x64 sprite, 16 frames in 4x4 grid)
        this.load.spritesheet('player', 'characters/player.png', {
            frameWidth: 48,
            frameHeight: 48
        });

        // Tilesets
        this.load.image('grass-tileset', 'tilesets/grass.png');

        // Water tileset as spritesheet for animation (4 frames)
        this.load.spritesheet('water-tileset', 'tilesets/water.png', {
            frameWidth: 16,
            frameHeight: 16
        });

        this.load.image('tilled-dirt-tileset', 'tilesets/tilled-dirt.png');
        this.load.image('hills-tileset', 'tilesets/hills.png');

        // Objects
        this.load.spritesheet('plants-sheet', 'objects/plants.png', {
            frameWidth: 16,
            frameHeight: 16
        });
        this.load.spritesheet('basic-plants', 'objects/Basic-plan.png', {
            frameWidth: 16,
            frameHeight: 16
        });
        this.load.image('tools', 'characters/tools.png');

        // OverGuild assets
        this.load.spritesheet('ui-spritesheet', 'ui/ui-spritesheet.png', {
            frameWidth: 16,
            frameHeight: 16
        });
        // Crops spritesheet (2 rows x 6 cols = 12 frames)
        // Row 1: wheat seed bag, growth stages 1-4, wheat harvest
        // Row 2: tomato seed bag, growth stages 1-4, tomato harvest
        this.load.spritesheet('crops', 'sprites/plants.png', {
            frameWidth: 16,
            frameHeight: 16
        });
        this.load.image('grass', 'sprites/grass.png');
        this.load.image('tilled-dirt', 'sprites/tilled-dirt.png');
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Start with FarmingGame scene
        this.scene.start('FarmingGame');
    }
}
