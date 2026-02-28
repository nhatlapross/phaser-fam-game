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
import { TownSquare } from './scenes/TownSquare';
import { ClassRoom } from './scenes/ClassRoom';
import { TilesetDebug } from './scenes/TilesetDebug';
import { Login } from './scenes/Login';
import { GameLoader } from './scenes/GameLoader';
import { SetupProfile } from './scenes/SetupProfile';
import { Transformation } from './scenes/Transformation';
import { ProfileScene } from './scenes/ProfileScene';
import InputTextPlugin from 'phaser3-rex-plugins/plugins/inputtext-plugin.js';
import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#87CEEB',
    scale: {
        mode: Scale.FIT,
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
    dom: {
        createContainer: true
    },
    plugins: {
        global: [{
            key: 'rexInputTextPlugin',
            plugin: InputTextPlugin,
            start: true
        }],
        scene: [{
            key: 'rexUI',
            plugin: UIPlugin,
            mapping: 'rexUI'
        }]
    },
    scene: [
        Boot,
        Preloader,
        Login,
        SetupProfile,
        Transformation,
        ProfileScene,
        GameLoader,
        TilesetDebug,
        FarmingGame,
        TownSquare,
        ClassRoom,
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
