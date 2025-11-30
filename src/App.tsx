import { useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [currentSceneName, setCurrentSceneName] = useState('');

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        setCurrentSceneName(scene.scene.key);
    }

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#2C3E50',
                fontFamily: 'Arial, sans-serif'
            }}>
                <h1 style={{
                    fontSize: '32px',
                    color: '#2ECC71',
                    margin: '20px 0'
                }}>
                    🌳 OverGuild: The Valley
                </h1>
                <p style={{ fontSize: '16px', color: '#7F8C8D' }}>
                    {currentSceneName ? `Current Scene: ${currentSceneName}` : 'Loading...'}
                </p>
                <p style={{ fontSize: '14px', color: '#95A5A6', marginTop: '10px' }}>
                    Don't just handshake, grow your network 🤝
                </p>
            </div>
        </div>
    )
}

export default App
