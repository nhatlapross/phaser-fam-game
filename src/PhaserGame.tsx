import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import StartGame from './game/main';
import { EventBus } from './game/EventBus';

export interface IRefPhaserGame
{
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
}

interface IProps
{
    currentActiveScene?: (scene_instance: Phaser.Scene) => void
}

// Helper to check if device is in portrait mode
const isPortrait = () => window.innerHeight > window.innerWidth;

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame({ currentActiveScene }, ref)
{
    const game = useRef<Phaser.Game | null>(null!);

    useLayoutEffect(() =>
    {
        if (game.current === null)
        {

            game.current = StartGame("game-container");

            if (typeof ref === 'function')
            {
                ref({ game: game.current, scene: null });
            } else if (ref)
            {
                ref.current = { game: game.current, scene: null };
            }

        }

        return () =>
        {
            if (game.current)
            {
                game.current.destroy(true);
                if (game.current !== null)
                {
                    game.current = null;
                }
            }
        }
    }, [ref]);

    // Handle input transformation for portrait mode
    useEffect(() => {
        const setupInputTransform = () => {
            if (!game.current) return;

            const canvas = game.current.canvas;
            const inputManager = game.current.input;
            if (!canvas || !inputManager) return;

            // Override transformPointer - this method receives both X and Y
            const originalTransformPointer = inputManager.transformPointer.bind(inputManager);

            inputManager.transformPointer = function(
                pointer: Phaser.Input.Pointer,
                pageX: number,
                pageY: number,
                wasMove: boolean
            ): void {
                originalTransformPointer(pointer, pageX, pageY, wasMove);

                // Transform coordinates for portrait mode (90deg clockwise CSS rotation)
                if (isPortrait() && game.current) {
                    const gameWidth = game.current.scale.width;
                    const gameHeight = game.current.scale.height;
                    const screenWidth = window.innerWidth;
                    const screenHeight = window.innerHeight;

                    // Screen Y → Game X, Screen X → Game Y (inverted)
                    pointer.x = (pageY / screenHeight) * gameWidth;
                    pointer.y = ((screenWidth - pageX) / screenWidth) * gameHeight;
                    pointer.worldX = pointer.x;
                    pointer.worldY = pointer.y;
                }
            };

            return () => {
                inputManager.transformPointer = originalTransformPointer;
            };
        };

        // Wait for game to be ready
        let cleanup: (() => void) | undefined;
        const checkGame = setInterval(() => {
            if (game.current && game.current.canvas && game.current.input) {
                cleanup = setupInputTransform();
                clearInterval(checkGame);
            }
        }, 100);

        return () => {
            clearInterval(checkGame);
            if (cleanup) cleanup();
        };
    }, []);

    useEffect(() =>
    {
        EventBus.on('current-scene-ready', (scene_instance: Phaser.Scene) =>
        {
            if (currentActiveScene && typeof currentActiveScene === 'function')
            {

                currentActiveScene(scene_instance);

            }

            if (typeof ref === 'function')
            {

                ref({ game: game.current, scene: scene_instance });
            
            } else if (ref)
            {

                ref.current = { game: game.current, scene: scene_instance };

            }
            
        });
        return () =>
        {

            EventBus.removeListener('current-scene-ready');
        
        }
    }, [currentActiveScene, ref]);

    return (
        <div id="game-container"></div>
    );

});
