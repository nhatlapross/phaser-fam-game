import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { useAccount, useDisconnect } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { EventBus } from './game/EventBus';
import { UserService } from './game/UserService';

// RegistrationForm Component
const RegistrationForm = ({ address, onRegisterSuccess, onCancel }: { address: string; onRegisterSuccess: (username: string) => void; onCancel: () => void }) => {
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        if (!username.trim()) {
            setError('Username cannot be empty.');
            setIsLoading(false);
            return;
        }

        try {
            const user = await UserService.registerUser(address, username);
            if (user) {
                onRegisterSuccess(user.username || username);
            } else {
                setError('Registration failed. Please try again.');
            }
        } catch (err) {
            console.error('Registration API error:', err);
            setError('Network error during registration.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10000,
            backgroundColor: '#282c34',
            padding: '40px',
            borderRadius: '10px',
            boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
            color: 'white',
            textAlign: 'center',
            maxWidth: '400px',
            width: '90%'
        }}>
            <h2>Register New User</h2>
            <p>Wallet Address: {address.slice(0, 6)}...{address.slice(-4)}</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter desired username"
                    disabled={isLoading}
                    style={{
                        padding: '12px',
                        borderRadius: '5px',
                        border: '1px solid #4ade80',
                        backgroundColor: '#3a3f47',
                        color: 'white',
                        fontSize: '16px'
                    }}
                />
                {error && <p style={{ color: '#ef4444', fontSize: '14px', margin: '0' }}>{error}</p>}
                <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                        padding: '12px 20px',
                        borderRadius: '5px',
                        border: 'none',
                        backgroundColor: isLoading ? '#6b7280' : '#4ade80',
                        color: '#1a1a2e',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s ease-in-out'
                    }}
                >
                    {isLoading ? 'Registering...' : 'Register and Play'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isLoading}
                    style={{
                        padding: '10px 15px',
                        borderRadius: '5px',
                        border: '1px solid #ef4444',
                        backgroundColor: 'transparent',
                        color: '#ef4444',
                        fontSize: '16px',
                        cursor: isLoading ? 'not-allowed' : 'pointer'
                    }}
                >
                    Cancel
                </button>
            </form>
        </div>
    );
};

function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [currentScene, setCurrentScene] = useState<string>('');
    const [showRegistrationForm, setShowRegistrationForm] = useState(false);
    const [registrationAddress, setRegistrationAddress] = useState('');

    const { address, isConnected, status } = useAccount();
    const { disconnect } = useDisconnect();
    const { open } = useAppKit();

    const disconnectRef = useRef(disconnect);
    useEffect(() => {
        disconnectRef.current = disconnect;
    }, [disconnect]);

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

        const handleSceneReady = (scene: { scene: { key: string } }) => {
            console.log('Scene ready:', scene.scene.key);
            setCurrentScene(scene.scene.key);
        };

        const handleShowRegistrationForm = (walletAddress: string) => {
            setShowRegistrationForm(true);
            setRegistrationAddress(walletAddress);
        };

        const handleHideRegistrationForm = () => {
            setShowRegistrationForm(false);
            setRegistrationAddress('');
        };

        EventBus.on('check-wallet-connection', handleCheckConnection);
        EventBus.on('disconnect-wallet', handleDisconnectWallet);
        EventBus.on('current-scene-ready', handleSceneReady);
        EventBus.on('show-registration-form', handleShowRegistrationForm);
        EventBus.on('hide-registration-form', handleHideRegistrationForm);

        return () => {
            EventBus.off('check-wallet-connection', handleCheckConnection);
            EventBus.off('disconnect-wallet', handleDisconnectWallet);
            EventBus.off('current-scene-ready', handleSceneReady);
            EventBus.off('show-registration-form', handleShowRegistrationForm);
            EventBus.off('hide-registration-form', handleHideRegistrationForm);
        };
    }, [isConnected, address]);

    useEffect(() => {
        if (isConnected && address) {
            console.log('Wallet connected:', address);
            EventBus.emit('wallet-connected', address);
        } else if (status === 'disconnected') {
            console.log('Wallet disconnected');
            EventBus.emit('wallet-disconnected');
            // If disconnected, hide registration form if it was showing
            setShowRegistrationForm(false);
            setRegistrationAddress('');
        }
    }, [isConnected, address, status]);

    const handleRegistrationSuccess = (username: string) => {
        console.log('React: Registration successful, emitting event to Phaser.');
        EventBus.emit('registration-complete', { address: registrationAddress, username });
        setShowRegistrationForm(false);
        setRegistrationAddress('');
    };

    const handleRegistrationCancel = () => {
        console.log('React: Registration cancelled. Disconnecting wallet.');
        disconnectRef.current(); // Disconnect wallet if registration is cancelled
        setShowRegistrationForm(false);
        setRegistrationAddress('');
    };

    const shouldShowConnectButton = currentScene === 'Login' && !isConnected && status !== 'connecting' && !showRegistrationForm;

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            {shouldShowConnectButton && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 9999,
                    marginTop: '100px'
                }}>
                    <button
                        onClick={() => open()}
                        style={{
                            padding: '12px 40px',
                            borderRadius: '4px',
                            border: '3px solid #3E2723',
                            backgroundColor: '#6D4C41',
                            color: '#FFFFFF',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 4px 0 #3E2723, 0 6px 10px rgba(0,0,0,0.3)',
                            transition: 'all 0.1s ease-in-out',
                            textShadow: '1px 1px 2px #3E2723',
                            fontFamily: 'Arial, sans-serif',
                            letterSpacing: '1px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#8D6E63';
                            e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#6D4C41';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                        onMouseDown={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 0 #3E2723, 0 3px 5px rgba(0,0,0,0.3)';
                            e.currentTarget.style.transform = 'translateY(2px)';
                        }}
                        onMouseUp={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 0 #3E2723, 0 6px 10px rgba(0,0,0,0.3)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                    >
                        Connect Wallet
                    </button>
                </div>
            )}
            {showRegistrationForm && registrationAddress && (
                <RegistrationForm
                    address={registrationAddress}
                    onRegisterSuccess={handleRegistrationSuccess}
                    onCancel={handleRegistrationCancel}
                />
            )}
        </div>
    );
}

export default App;
