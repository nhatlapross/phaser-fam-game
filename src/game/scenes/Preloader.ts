import { Scene } from 'phaser';
import { PLAYABLE_CHARACTERS } from '../config/CharacterConfig';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        const centerX = this.cameras.main.width / 2;
        const centerY = this.cameras.main.height / 2;

        //  Beautiful background from Boot scene
        const bg = this.add.image(centerX, centerY, 'start-background');
        bg.setDisplaySize(this.cameras.main.width, this.cameras.main.height);

        //  Game name logo at top
        const gameName = this.add.image(centerX, centerY - 80, 'game-name');
        gameName.setScale(0.8);

        //  Loading text
        const loadingText = this.add.text(centerX, centerY + 60, 'Loading...', {
            fontSize: '16px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            resolution: 2
        }).setOrigin(0.5);
        loadingText.setStroke('#5D4037', 3);

        //  Progress bar background (wood style)
        const barWidth = 200;
        const barBg = this.add.rectangle(centerX, centerY + 90, barWidth, 16, 0x5D4037);
        barBg.setStrokeStyle(2, 0x3E2723);

        //  Progress bar fill - origin left center
        const barFill = this.add.rectangle(centerX - barWidth / 2 + 3, centerY + 90, 4, 10, 0x8BC34A);
        barFill.setOrigin(0, 0.5);

        //  Progress percentage text
        const percentText = this.add.text(centerX, centerY + 90, '0%', {
            fontSize: '9px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            resolution: 2
        }).setOrigin(0.5);
        percentText.setStroke('#3E2723', 2);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {
            //  Update the progress bar (barWidth - 6 padding)
            barFill.width = Math.max(4, (barWidth - 6) * progress);
            percentText.setText(`${Math.floor(progress * 100)}%`);
        });

        this.load.on('complete', () => {
            loadingText.setText('Ready!');
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

        // Load all playable character spritesheets from config
        // Each character: 4x4 grid (16 frames), path: characters/{key}/{key}.png
        PLAYABLE_CHARACTERS.forEach(char => {
            this.load.spritesheet(char.key, `characters/${char.key}/${char.key}.png`, {
                frameWidth: char.frameWidth,
                frameHeight: char.frameHeight
            });
            // Load character avatar image
            this.load.image(`${char.key}-avatar`, `characters/${char.key}/avatar.png`);
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
        // Square tileset (176x112, 11 cols x 7 rows of 16x16 tiles)
        this.load.spritesheet('square-tileset', 'tilesets/square.png', {
            frameWidth: 16,
            frameHeight: 16
        });

        // Fountain spritesheet (5 frames animation, 334x118 total, each frame 67x118)
        this.load.spritesheet('fountain', 'objects/square/fountain.png', {
            frameWidth: 67,
            frameHeight: 118
        });

        // Town Square decorations (76x94 each)
        this.load.image('square-chair', 'objects/square/chair.png');
        this.load.image('square-lamp', 'objects/square/lamp.png');
        this.load.image('square-tree', 'objects/square/tree.png');

        // Town Square houses (1-12)
        for (let i = 1; i <= 12; i++) {
            this.load.image(`house-${i}`, `objects/house/house-${i}.png`);
        }

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
        this.load.image('icon-digest', 'icons/digest.png');
        this.load.image('icon-bug-glove', 'icons/bug-glove.png');

        // UI Big Play Button (2 cols x 2 rows = 4 frames, 96x32 each)
        this.load.spritesheet('ui-big-play-button', 'ui/UI Big Play Button.png', {
            frameWidth: 96,
            frameHeight: 32
        });

        // Chest spritesheet (5 cols x 2 rows = 10 frames, 48x48 each)
        // Frame 0: closed chest, Frame 4: open chest
        this.load.spritesheet('chest', 'objects/Chest.png', {
            frameWidth: 48,
            frameHeight: 48
        });

        // Settings menu panel (2 panels side by side)
        this.load.spritesheet('settings-panel', 'ui/Setting menu.png', {
            frameWidth: 125,
            frameHeight: 140
        });

        // ========== New Plant Assets ==========
        // Tree Plant
        this.load.image('tree-seed', 'objects/plant/social_plant/Social_Seed.png');
        this.load.image('tree-plant-1', 'objects/plant/social_plant/Social_plant_1.png');
        this.load.image('tree-plant-2', 'objects/plant/social_plant/Social_plant_2.png');
        this.load.image('tree-plant-3', 'objects/plant/social_plant/Social_plant_3.png');
        this.load.image('tree-plant-4', 'objects/plant/social_plant/Social_plant_4.png');
        this.load.image('tree-plant-5', 'objects/plant/social_plant/Social_plant_5.png');
        this.load.image('tree-plant-death', 'objects/plant/social_plant/Social_plant_death.png');
        this.load.image('tree-fruit', 'objects/plant/social_plant/social-fruit.png');

        // Algae Plant (3 stages spritesheet: 144x54, 3 frames of 48x54)
        this.load.image('algae-seed', 'objects/plant/technical_plant/Technical_Seed.png');
        this.load.spritesheet('algae-spritesheet', 'objects/plant/aligant/Algae.png', {
            frameWidth: 48,
            frameHeight: 54
        });
        this.load.image('algae-plant-death', 'objects/plant/technical_plant/Technical_plant_death.png');
        this.load.image('algae-fruit', 'objects/plant/technical_plant/technical-fruit.png');

        // Branded Plant
        this.load.image('branded-seed', 'objects/plant/branded_plant/Branded_Seed.png');
        this.load.image('branded-plant-1', 'objects/plant/branded_plant/Branded_plant_1.png');
        this.load.image('branded-plant-2', 'objects/plant/branded_plant/Branded_plant_2.png');
        this.load.image('branded-plant-3', 'objects/plant/branded_plant/Branded_plant_3.png');
        this.load.image('branded-plant-4', 'objects/plant/branded_plant/Branded_plant_4.png');
        this.load.image('branded-plant-5', 'objects/plant/branded_plant/Branded_plant_5.png');
        this.load.image('branded-plant-death', 'objects/plant/branded_plant/Branded_plant_death.png');
        this.load.image('branded-fruit', 'objects/plant/branded_plant/branded-fruit.png');

        // Mushroom Plant (3 stages spritesheet: 144x48, 3 frames of 48x48)
        this.load.image('mushroom-seed', 'objects/plant/mushroom/mush_seed.png');
        this.load.spritesheet('mushroom-spritesheet', 'objects/plant/mush-room/mush-room.png', {
            frameWidth: 48,
            frameHeight: 48
        });
        this.load.image('mushroom-plant-death', 'objects/plant/mushroom/mush_plant_death.png');
        this.load.image('mushroom-fruit', 'objects/plant/mushroom/mush-fruit.png');

        // Factory (4 frames: 1-2 idle, 3-4 working)
        this.load.image('factory-1', 'objects/factory/factory_1.png');
        this.load.image('factory-2', 'objects/factory/factory_2.png');
        this.load.image('factory-3', 'objects/factory/factory_3.png');
        this.load.image('factory-4', 'objects/factory/factory_4.png');

        // Warehouse spritesheet (2 frames: 0=closed, 1=open)
        this.load.spritesheet('warehouse', 'objects/ware-house/ware-house.png', {
            frameWidth: 120,
            frameHeight: 135
        });

        // Default avatar for user profile
        this.load.image('default-avatar', 'characters/avatar.png');

        // Check-in icon
        this.load.image('icon-checkin', 'icons/checkin.png');
        this.load.image('icon-problem', 'icons/problem.png');

        // Badge images
        this.load.image('og-badge', 'badge/OG-badge.png');
        this.load.image('ada-badge', 'badge/ADA-badge.png');

        // Lock land overlay for locked farm plots
        this.load.image('lock-land', 'objects/lock-land/lock-land.png');

        // Mission mailbox spritesheet (5 frames, 109x109 each)
        this.load.spritesheet('mailbox', 'objects/missionBox/MissionBox.png', {
            frameWidth: 109,
            frameHeight: 109
        });

        // Shop spritesheet (2 frames for animation)
        this.load.spritesheet('shop', 'objects/shop/shop.png', {
            frameWidth: 159,
            frameHeight: 119
        });

        // Well spritesheet (2 frames for animation)
        this.load.spritesheet('well', 'objects/well/well.png', {
            frameWidth: 177,
            frameHeight: 177
        });

        // Turtle tutor spritesheet (2 frames for idle animation)
        this.load.spritesheet('tutor', 'objects/well/tutor.png', {
            frameWidth: 45,
            frameHeight: 55
        });

        // Station/Dock spritesheet (4 frames for animation)
        this.load.spritesheet('station', 'objects/station/station.png', {
            frameWidth: 121,
            frameHeight: 92
        });

        // Pet spritesheets (4x4 grid = 16 frames, 300x300 total, 75x75 each)
        this.load.spritesheet('pet-cat', 'pet/cat/cat.png', {
            frameWidth: 75,
            frameHeight: 75
        });

        // Place backgrounds for station travel modal
        this.load.image('place-farm', 'places/farm.png');
        this.load.image('place-townsquare', 'places/townSquare.png');
        this.load.image('place-forest', 'places/forest.png');

        // ========== Audio Assets ==========
        // Reset path for audio files (they are in public/sound, not assets/sound)
        this.load.setPath('');

        // Theme songs (random playback)
        this.load.audio('theme1', 'sound/theme/theme1.mp3');
        this.load.audio('theme2', 'sound/theme/theme2.mp3');
        this.load.audio('theme3', 'sound/theme/theme3.mp3');
        this.load.audio('theme4', 'sound/theme/theme4.mp3');

        // Sound effects
        this.load.audio('sfx-walk', 'sound/effect/walk.mp3');
        this.load.audio('sfx-hit', 'sound/effect/hit.mp3');
        this.load.audio('sfx-water', 'sound/effect/water.mp3');
        this.load.audio('sfx-success', 'sound/effect/confirm.mp3');
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Start with Login scene
        this.scene.start('Login');
    }
}
