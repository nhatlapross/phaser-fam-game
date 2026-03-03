import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { usePassport } from './components/PassportProvider';
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
            setError('Network error during registration.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            position: 'absolute',
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

    // Use Passport hooks instead of wagmi
    const { isLoggedIn, isLoading, walletAddress, login, logout, getEthereumProvider } = usePassport();

    const logoutRef = useRef(logout);
    useEffect(() => {
        logoutRef.current = logout;
    }, [logout]);

    useEffect(() => {
        const handleCheckConnection = () => {
            if (isLoggedIn && walletAddress) {
                EventBus.emit('wallet-connected', walletAddress);
            }
        };

        const handleDisconnectWallet = async () => {
            await logoutRef.current();
        };

        const handleSceneReady = (scene: { scene: { key: string } }) => {
            setCurrentScene(scene.scene.key);
        };

        const handleShowRegistrationForm = (address: string) => {
            setShowRegistrationForm(true);
            setRegistrationAddress(address);
        };

        const handleHideRegistrationForm = () => {
            setShowRegistrationForm(false);
            setRegistrationAddress('');
        };

        // Handle login request from Phaser
        const handleRequestLogin = async () => {
            try {
                await login();
            } catch (error) {
            }
        };

        // Bridge wallet provider to Phaser (for contract calls)
        const handleRequestEthProvider = async () => {
            try {
                const provider = await getEthereumProvider();
                EventBus.emit('eth-provider-response', provider);
            } catch {
                EventBus.emit('eth-provider-response', null);
            }
        };

        EventBus.on('check-wallet-connection', handleCheckConnection);
        EventBus.on('disconnect-wallet', handleDisconnectWallet);
        EventBus.on('current-scene-ready', handleSceneReady);
        EventBus.on('show-registration-form', handleShowRegistrationForm);
        EventBus.on('hide-registration-form', handleHideRegistrationForm);
        EventBus.on('request-login', handleRequestLogin);
        EventBus.on('request-eth-provider', handleRequestEthProvider);

        return () => {
            EventBus.off('check-wallet-connection', handleCheckConnection);
            EventBus.off('disconnect-wallet', handleDisconnectWallet);
            EventBus.off('current-scene-ready', handleSceneReady);
            EventBus.off('show-registration-form', handleShowRegistrationForm);
            EventBus.off('hide-registration-form', handleHideRegistrationForm);
            EventBus.off('request-login', handleRequestLogin);
            EventBus.off('request-eth-provider', handleRequestEthProvider);
        };
    }, [isLoggedIn, walletAddress, login, getEthereumProvider]);

    useEffect(() => {
        if (isLoggedIn && walletAddress) {
            EventBus.emit('wallet-connected', walletAddress);
        } else if (!isLoggedIn && !isLoading) {
            EventBus.emit('wallet-disconnected');
            // If disconnected, hide registration form if it was showing
            setShowRegistrationForm(false);
            setRegistrationAddress('');
        }
    }, [isLoggedIn, walletAddress, isLoading]);

    const handleRegistrationSuccess = (username: string) => {
        EventBus.emit('registration-complete', { address: registrationAddress, username });
        setShowRegistrationForm(false);
        setRegistrationAddress('');
    };

    const handleRegistrationCancel = async () => {
        await logoutRef.current(); // Disconnect wallet if registration is cancelled
        setShowRegistrationForm(false);
        setRegistrationAddress('');
    };

    return (
        <>
        <div id="app">
            <PhaserGame ref={phaserRef} />
        </div>
        {showRegistrationForm && registrationAddress && (
            <RegistrationForm
                address={registrationAddress}
                onRegisterSuccess={handleRegistrationSuccess}
                onCancel={handleRegistrationCancel}
            />
        )}
        </>
    );
}

export default App;
