import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { useAccount, useDisconnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { EventBus } from './game/EventBus';

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [showConnectButton, setShowConnectButton] = useState(true);

    // Wallet connection hooks
    const { address, isConnected } = useAccount();
    const { disconnect } = useDisconnect();

    // Use ref for disconnect to avoid stale closure
    const disconnectRef = useRef(disconnect);
    useEffect(() => {
        disconnectRef.current = disconnect;
    }, [disconnect]);

    // Listen for events from Phaser
    useEffect(() => {
        const handleCheckConnection = () => {
            if (isConnected && address) {
                EventBus.emit('wallet-connected', address);
            }
        };

        const handleDisconnectWallet = () => {
            console.log('Disconnecting wallet...');
            disconnectRef.current();
        };

        // Listen for scene changes to show/hide connect button
        const handleSceneReady = (scene: { scene: { key: string } }) => {
            // Show connect button only on Login scene
            setShowConnectButton(scene.scene.key === 'Login');
        };

        EventBus.on('check-wallet-connection', handleCheckConnection);
        EventBus.on('disconnect-wallet', handleDisconnectWallet);
        EventBus.on('current-scene-ready', handleSceneReady);

        return () => {
            EventBus.off('check-wallet-connection', handleCheckConnection);
            EventBus.off('disconnect-wallet', handleDisconnectWallet);
            EventBus.off('current-scene-ready', handleSceneReady);
        };
    }, [isConnected, address]);

    // Notify Phaser when wallet connects or disconnects
    useEffect(() => {
        if (isConnected && address) {
            EventBus.emit('wallet-connected', address);
        } else if (!isConnected) {
            console.log('Wallet disconnected');
            EventBus.emit('wallet-disconnected');
        }
    }, [isConnected, address]);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            {/* RainbowKit ConnectButton - shown in center on Login scene */}
            {showConnectButton && !isConnected && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 9999,
                    marginTop: '50px'
                }}>
                    <ConnectButton />
                </div>
            )}
        </div>
    )
}

export default App
