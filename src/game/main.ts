import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { HomeGarden } from './scenes/HomeGarden';
import { EventCheckIn } from './scenes/EventCheckIn';
import { Networking } from './scenes/Networking';
import { FarmingGame } from './scenes/FarmingGame';
import { TilesetDebug } from './scenes/TilesetDebug';
import { Login } from './scenes/Login';
import { GameLoader } from './scenes/GameLoader';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#87CEEB',
    scale: {
        mode: Scale.ENVELOP,
        width: 960,
        height: 540,
        autoCenter: Scale.CENTER_BOTH,
        fullscreenTarget: 'game-container',
        expandParent: true
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
        }
    },
    input: {
        touch: {
            capture: true
        }
    },
    scene: [
        Boot,
        Preloader,
        Login,
        GameLoader,
        TilesetDebug,
        FarmingGame,
        HomeGarden,
        EventCheckIn,
        Networking,
        MainMenu,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
