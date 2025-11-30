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
        // Square buttons for UI (2 cols x 4 rows = 8 buttons, image is 96x192)
        this.load.spritesheet('square-buttons', 'ui/Square Buttons 26x26.png', {
            frameWidth: 48,
            frameHeight: 48
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

        // Tool icons
        this.load.image('icon-hand', 'icons/Hand.png');
        this.load.image('icon-watercan', 'icons/waterCan.png');
        this.load.image('icon-fertilizer', 'icons/ShitPlan.png');

        // UI Big Play Button (2 cols x 2 rows = 4 frames, 96x32 each)
        this.load.spritesheet('ui-big-play-button', 'ui/UI Big Play Button.png', {
            frameWidth: 96,
            frameHeight: 32
        });

        // ========== New Plant Assets ==========
        // Social Plant
        this.load.image('social-seed', 'objects/plant/social_plant/Social_Seed.png');
        this.load.image('social-plant-1', 'objects/plant/social_plant/Social_plant_1.png');
        this.load.image('social-plant-2', 'objects/plant/social_plant/Social_plant_2.png');
        this.load.image('social-plant-3', 'objects/plant/social_plant/Social_plant_3.png');
        this.load.image('social-plant-4', 'objects/plant/social_plant/Social_plant_4.png');
        this.load.image('social-plant-5', 'objects/plant/social_plant/Social_plant_5.png');
        this.load.image('social-plant-death', 'objects/plant/social_plant/Social_plant_death.png');
        this.load.image('social-fruit', 'objects/plant/social_plant/social-fruit.png');

        // Technical Plant
        this.load.image('technical-seed', 'objects/plant/technical_plant/Technical_Seed.png');
        this.load.image('technical-plant-1', 'objects/plant/technical_plant/Technical_plant_1.png');
        this.load.image('technical-plant-2', 'objects/plant/technical_plant/Technical_plant_2.png');
        this.load.image('technical-plant-3', 'objects/plant/technical_plant/Technical_plant_3.png');
        this.load.image('technical-plant-4', 'objects/plant/technical_plant/Technical_plant_4.png');
        this.load.image('technical-plant-5', 'objects/plant/technical_plant/Technical_plant_5.png');
        this.load.image('technical-plant-death', 'objects/plant/technical_plant/Technical_plant_death.png');
        this.load.image('technical-fruit', 'objects/plant/technical_plant/technical-fruit.png');

        // Branded Plant
        this.load.image('branded-seed', 'objects/plant/branded_plant/Branded_Seed.png');
        this.load.image('branded-plant-1', 'objects/plant/branded_plant/Branded_plant_1.png');
        this.load.image('branded-plant-2', 'objects/plant/branded_plant/Branded_plant_2.png');
        this.load.image('branded-plant-3', 'objects/plant/branded_plant/Branded_plant_3.png');
        this.load.image('branded-plant-4', 'objects/plant/branded_plant/Branded_plant_4.png');
        this.load.image('branded-plant-5', 'objects/plant/branded_plant/Branded_plant_5.png');
        this.load.image('branded-plant-death', 'objects/plant/branded_plant/Branded_plant_death.png');
        this.load.image('branded-fruit', 'objects/plant/branded_plant/branded-fruit.png');

        // Mushroom Plant
        this.load.image('mushroom-seed', 'objects/plant/mushroom/mush_seed.png');
        this.load.image('mushroom-plant-1', 'objects/plant/mushroom/mush_plant_1.png');
        this.load.image('mushroom-plant-2', 'objects/plant/mushroom/mush_plant_2.png');
        this.load.image('mushroom-plant-3', 'objects/plant/mushroom/mush_plant_3.png');
        this.load.image('mushroom-plant-4', 'objects/plant/mushroom/mush_plant_4.png');
        this.load.image('mushroom-plant-5', 'objects/plant/mushroom/mush_plant_5.png');
        this.load.image('mushroom-plant-death', 'objects/plant/mushroom/mush_plant_death.png');
        this.load.image('mushroom-fruit', 'objects/plant/mushroom/mush-fruit.png');
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Start with Login scene
        this.scene.start('Login');
    }
}
