import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { UserService } from '../UserService';
import { PhaserButton } from '../ui/PhaserButton';

export class Login extends Scene {
    private gameName!: Phaser.GameObjects.Image;
    private subtitleText!: Phaser.GameObjects.Text;
    private loginButton!: PhaserButton;
    private fromLogout: boolean = false;
    private ignoreWalletEvents: boolean = false;
    private connectedAddress: string | null = null;

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

        // "Power By OverGuild" text at center bottom
        const powerByText = this.add.text(centerX, this.scale.height - 20, 'Power By OverGuild', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#FFFFFF',
            fontStyle: 'bold',
            resolution: 2
        });
        powerByText.setOrigin(0.5, 1);
        powerByText.setStroke('#5D4037', 4);
        powerByText.setDepth(10);

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
                EventBus.emit('check-wallet-connection');
            });
        }

        // Reset the flag after use
        this.fromLogout = false;

        EventBus.emit('current-scene-ready', this);
    }

    private createConnectButton(x: number, y: number) {
        // Create login button using PhaserButton
        this.loginButton = new PhaserButton({
            scene: this,
            x: x,
            y: y,
            text: 'Sign in with Google',
            style: {
                width: 220,
                height: 50,
                backgroundColor: 0x6D4C41,
                backgroundColorHover: 0x8D6E63,
                backgroundColorPressed: 0x5D4037,
                borderColor: 0x3E2723,
                borderWidth: 3,
                borderRadius: 6,
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                textColor: '#FFFFFF',
                textStroke: '#3E2723',
                textStrokeThickness: 2,
                shadowColor: 0x3E2723,
                shadowOffsetY: 4,
            },
            onClick: () => {
                // Emit event to React to trigger Passport login
                EventBus.emit('request-login');
            },
            depth: 100,
        });
    }

    private hideLoginButton() {
        if (this.loginButton) {
            this.loginButton.setVisible(false);
        }
    }

    private showLoginButton() {
        if (this.loginButton) {
            this.loginButton.setVisible(true);
        }
    }

    private async onWalletConnected(address: string) {

        // Ignore wallet events if coming from logout (to allow disconnect to complete)
        if (this.ignoreWalletEvents) {
            return;
        }

        // Safety check - make sure scene exists and is active
        if (!this.scene || !this.scene.isActive('Login') || !this.add) {
            return;
        }

        this.connectedAddress = address; // Store the connected address

        // Check if user exists in DB
        const user = await UserService.checkUser(address);

        if (user) {
            // Existing user - clear any new user flags and go to ProfileScene
            localStorage.removeItem('fam_game_is_new_user');
            localStorage.removeItem('fam_game_show_transformation');
            EventBus.emit('hide-registration-form');
            this.transitionToProfile(address, false);
        }
        else {
            // New user - go to SetupProfile scene
            this.transitionToSetupProfile(address);
        }
    }

    private _showRegistrationForm(address: string) {
        // No longer used - keeping for compatibility
        // New flow uses SetupProfile scene instead
        this.transitionToSetupProfile(address);
    }

    private transitionToSetupProfile(address: string) {
        // Hide Phaser UI elements
        this.gameName.setVisible(false);
        this.subtitleText.setVisible(false);
        this.hideLoginButton();

        // Show connected message briefly
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

        // Transition to SetupProfile scene
        this.time.delayedCall(800, () => {
            if (!this.cameras || !this.cameras.main || !this.scene.isActive('Login')) {
                if (this.scene) {
                    this.scene.start('SetupProfile', { address });
                }
                return;
            }
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('SetupProfile', { address });
            });
        });
    }

    private onRegistrationComplete(data: { address: string, username: string }) {
        // Legacy handler - new flow uses SetupProfile scene
        this.gameName.setVisible(true);
        this.subtitleText.setVisible(true);
        this.hideLoginButton(); // Keep button hidden during transition
        
        // Set flag for transformation effect
        localStorage.setItem('fam_game_is_new_user', 'true');
        localStorage.setItem('fam_game_show_transformation', 'true');
        
        this.transitionToProfile(data.address, true);
    }

    private transitionToProfile(address: string, _isNewUser: boolean) {
        // Hide login button during transition
        this.hideLoginButton();

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

        // Transition to GameLoader first to load data, then to ProfileScene
        this.time.delayedCall(1000, () => {
            if (!this.cameras || !this.cameras.main || !this.scene.isActive('Login')) {
                if (this.scene) {
                    this.scene.start('GameLoader');
                }
                return;
            }
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                // GameLoader will redirect to ProfileScene
                this.scene.start('GameLoader');
            });
        });
    }

    // Legacy method - kept for compatibility
    private transitionToGame(address: string) {
        this.transitionToProfile(address, false);
    }

    shutdown() {
        EventBus.off('wallet-connected', this.onWalletConnected, this);
        EventBus.off('registration-complete', this.onRegistrationComplete, this);
    }
}
