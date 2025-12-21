import { Scene } from 'phaser';

export class Boot extends Scene
{
    constructor ()
    {
        super('Boot');
    }

    preload ()
    {
        //  Load assets for the loading/start screen
        this.load.image('start-background', 'assets/ui/startScreenBackground.png');
        this.load.image('game-name', 'assets/ui/GameName.png');
        this.load.image('wood-button', 'assets/ui/woodButton.png');
    }

    create ()
    {
        this.scene.start('Preloader');
    }
}
