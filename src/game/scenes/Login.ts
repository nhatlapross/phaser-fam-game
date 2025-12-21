import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { UserService } from '../UserService'; // Import UserService

export class Login extends Scene {
    private gameName!: Phaser.GameObjects.Image;
    private subtitleText!: Phaser.GameObjects.Text;
    private fromLogout: boolean = false;
    private ignoreWalletEvents: boolean = false;
    private connectedAddress: string | null = null; // Store connected address

    constructor() {
        super('Login');
    }

    init(data: { fromLogout?: boolean }) {
        this.fromLogout = data?.fromLogout || false;
    }

    create() {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        // Beautiful farm background
        const bg = this.add.image(centerX, centerY, 'start-background');
        bg.setDisplaySize(this.scale.width, this.scale.height);

        // Game name logo
        this.gameName = this.add.image(centerX, centerY - 70, 'game-name');
        this.gameName.setScale(0.85);

        // Add floating animation to game name
        this.tweens.add({
            targets: this.gameName,
            y: centerY - 80,
            duration: 2000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        // Subtitle - positioned above where React button will appear
        this.subtitleText = this.add.text(centerX, centerY + 20, 'Grow, Harvest, Prosper', {
            fontSize: '12px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            resolution: 2
        });
        this.subtitleText.setOrigin(0.5);
        this.subtitleText.setStroke('#5D4037', 3);

        // Connect Wallet Button is rendered by React (positioned at centerY + 100)
        this.createConnectButton(centerX, centerY + 100);

        // Listen for wallet connection
        EventBus.on('wallet-connected', this.onWalletConnected, this);
        // Listen for registration complete from React
        EventBus.on('registration-complete', this.onRegistrationComplete, this);

        // If coming from logout, ignore wallet events for a short time
        // to allow disconnect to complete
        if (this.fromLogout) {
            this.ignoreWalletEvents = true;
            this.time.delayedCall(1500, () => {
                this.ignoreWalletEvents = false;
                // Check connection after ignore period ends
                EventBus.emit('check-wallet-connection');
            });
        } else {
            // Check if already connected after a small delay to ensure listener is ready
            this.time.delayedCall(100, () => {
                console.log('Login: checking wallet connection...');
                EventBus.emit('check-wallet-connection');
            });
        }

        // Reset the flag after use
        this.fromLogout = false;

        EventBus.emit('current-scene-ready', this);
    }

    private createBackground() {
        // Background is now handled by the start-background image in create()
        // This method is kept for compatibility
    }

    private createConnectButton(_x: number, _y: number) {
        // ConnectButton is rendered by React in App.tsx
        // This method is kept for compatibility but does nothing
    }

    private async onWalletConnected(address: string) {
        console.log('Login: onWalletConnected called with', address);

        // Ignore wallet events if coming from logout (to allow disconnect to complete)
        if (this.ignoreWalletEvents) {
            console.log('Login: ignoring wallet event (from logout)');
            return;
        }

        // Safety check - make sure scene is active
        if (!this.scene.isActive('Login') || !this.add) {
            console.log('Login: scene not active, skipping');
            return;
        }

        this.connectedAddress = address; // Store the connected address

        // Check if user exists in DB
        const user = await UserService.checkUser(address);

        if (user) {
            console.log('Login: User found in DB:', user.username);
            EventBus.emit('hide-registration-form');
            this.transitionToGame(address);
        }
        else {
            console.log('Login: User not found in DB. Showing registration form.');
            this._showRegistrationForm(address);
        }
    }

    private _showRegistrationForm(address: string) {
        // Hide Phaser UI elements that might conflict with the React form
        this.gameName.setVisible(false);
        this.subtitleText.setVisible(false);
        // Emitting event for React to show registration form
        EventBus.emit('show-registration-form', address);
    }

    private onRegistrationComplete(data: { address: string, username: string }) {
        console.log('Login: Registration complete for:', data.username, data.address);
        // Show Phaser UI elements again
        this.gameName.setVisible(true);
        this.subtitleText.setVisible(true);
        this.transitionToGame(data.address);
    }

    private transitionToGame(address: string) {
        // Show connected message briefly then transition
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        const connectedText = this.add.text(centerX, centerY + 130, `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`, {
            fontSize: '12px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            resolution: 2
        });
        connectedText.setOrigin(0.5);
        connectedText.setStroke('#5D4037', 2);

        // Transition to GameLoader (which will load API data before entering FarmingGame)
        this.time.delayedCall(1000, () => {
            // Safety check - scene might have been destroyed
            if (!this.cameras || !this.cameras.main || !this.scene.isActive('Login')) {
                // Just start the scene directly if we can't fade
                if (this.scene) {
                    this.scene.start('GameLoader');
                }
                return;
            }
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('GameLoader');
            });
        });
    }

    shutdown() {
        EventBus.off('wallet-connected', this.onWalletConnected, this);
        EventBus.off('registration-complete', this.onRegistrationComplete, this);
    }
}
