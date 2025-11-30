import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

export class Login extends Scene {
    private titleText!: Phaser.GameObjects.Text;
    private subtitleText!: Phaser.GameObjects.Text;
    private fromLogout: boolean = false;
    private ignoreWalletEvents: boolean = false;

    constructor() {
        super('Login');
    }

    init(data: { fromLogout?: boolean }) {
        this.fromLogout = data?.fromLogout || false;
    }

    create() {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        // Background gradient effect
        this.cameras.main.setBackgroundColor('#1a1a2e');

        // Add decorative elements
        this.createBackground();

        // Title
        this.titleText = this.add.text(centerX, centerY - 150, 'FARMING GAME', {
            fontSize: '48px',
            fontFamily: 'Arial Black',
            color: '#4ade80',
            stroke: '#166534',
            strokeThickness: 6,
        });
        this.titleText.setOrigin(0.5);

        // Subtitle
        this.subtitleText = this.add.text(centerX, centerY - 90, 'Grow, Harvest, Prosper', {
            fontSize: '20px',
            fontFamily: 'Arial',
            color: '#86efac',
        });
        this.subtitleText.setOrigin(0.5);

        // Connect Wallet Button
        this.createConnectButton(centerX, centerY + 50);

        // Listen for wallet connection
        EventBus.on('wallet-connected', this.onWalletConnected, this);

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
        // Add some floating particles/decorations
        for (let i = 0; i < 20; i++) {
            const x = Phaser.Math.Between(50, this.scale.width - 50);
            const y = Phaser.Math.Between(50, this.scale.height - 50);
            const size = Phaser.Math.Between(2, 6);
            const alpha = Phaser.Math.FloatBetween(0.1, 0.4);

            const particle = this.add.circle(x, y, size, 0x4ade80, alpha);

            // Animate particles
            this.tweens.add({
                targets: particle,
                y: y - 20,
                alpha: alpha * 0.5,
                duration: Phaser.Math.Between(2000, 4000),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }
    }

    private createConnectButton(_x: number, _y: number) {
        // ConnectButton is rendered by React in App.tsx
        // This method is kept for compatibility but does nothing
    }

    private onWalletConnected(address: string) {
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

        console.log('Login: transitioning to FarmingGame...');

        // Show connected message briefly then transition
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        const connectedText = this.add.text(centerX, centerY + 130, `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`, {
            fontSize: '16px',
            fontFamily: 'Arial',
            color: '#4ade80',
        });
        connectedText.setOrigin(0.5);

        // Transition to game after short delay
        this.time.delayedCall(1000, () => {
            // Safety check - scene might have been destroyed
            if (!this.cameras || !this.cameras.main || !this.scene.isActive('Login')) {
                // Just start the scene directly if we can't fade
                if (this.scene) {
                    this.scene.start('FarmingGame');
                }
                return;
            }
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('FarmingGame');
            });
        });
    }

    shutdown() {
        EventBus.off('wallet-connected', this.onWalletConnected, this);
    }
}
