import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { UserService } from '../UserService';

/**
 * Setup Profile Scene - Shown after new user registration
 * Allows user to set their name and choose character type
 */
export class SetupProfile extends Scene {
    private walletAddress: string = '';
    private selectedCharacter: number = 0;
    private characterSprites: Phaser.GameObjects.Sprite[] = [];
    private nameInput: HTMLInputElement | null = null;
    private continueButton!: Phaser.GameObjects.Container;
    private characterPreview!: Phaser.GameObjects.Sprite;

    // Character options (currently 1, expandable later)
    private readonly CHARACTER_TYPES = [
        { id: 'farmer', name: 'Farmer', sprite: 'player' }
    ];

    constructor() {
        super('SetupProfile');
    }

    init(data: { address: string }) {
        this.walletAddress = data.address || '';
    }

    create() {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        // Background
        const bg = this.add.image(centerX, centerY, 'start-background');
        bg.setDisplaySize(this.scale.width, this.scale.height);

        // Semi-transparent overlay
        const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.5);

        // Title
        const title = this.add.text(centerX, 60, 'Create Your Character', {
            fontSize: '20px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        title.setOrigin(0.5);
        title.setStroke('#5D4037', 4);

        // Animate title
        this.tweens.add({
            targets: title,
            y: 70,
            duration: 2000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        // Character preview section
        this.createCharacterPreview(centerX, centerY - 40);

        // Name input section
        this.createNameInput(centerX, centerY + 80);

        // Continue button
        this.createContinueButton(centerX, centerY + 150);

        // Instructions
        const instructions = this.add.text(centerX, this.scale.height - 40, 'Enter your name and click Continue', {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        instructions.setOrigin(0.5);

        EventBus.emit('current-scene-ready', this);
    }

    private createCharacterPreview(x: number, y: number) {
        // Character frame background
        const frameBg = this.add.sprite(x, y, 'square-buttons', 6);
        frameBg.setDisplaySize(100, 100);
        frameBg.setTint(0x5D4037);

        // Character preview sprite
        this.characterPreview = this.add.sprite(x, y, 'player', 0);
        this.characterPreview.setScale(4);

        // Idle animation
        if (!this.anims.exists('preview-idle')) {
            this.anims.create({
                key: 'preview-idle',
                frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
                frameRate: 6,
                repeat: -1
            });
        }
        this.characterPreview.play('preview-idle');

        // Character name label
        const charName = this.add.text(x, y + 65, this.CHARACTER_TYPES[0].name, {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        charName.setOrigin(0.5);
        charName.setStroke('#5D4037', 2);

        // Glow effect around character
        const glow = this.add.graphics();
        glow.lineStyle(2, 0xFFD700, 0.5);
        glow.strokeCircle(x, y, 55);

        // Pulse animation for glow
        this.tweens.add({
            targets: glow,
            alpha: 0.3,
            duration: 1000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        // Sparkle particles around character
        this.createSparkles(x, y);
    }

    private createSparkles(x: number, y: number) {
        const colors = [0xFFD700, 0xFFF8E1, 0x4ade80];
        
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const radius = 50;
            const sparkle = this.add.circle(
                x + Math.cos(angle) * radius,
                y + Math.sin(angle) * radius,
                2,
                colors[i % colors.length],
                0.8
            );

            this.tweens.add({
                targets: sparkle,
                alpha: 0.2,
                scale: 0.5,
                duration: 800 + i * 100,
                ease: 'Sine.easeInOut',
                yoyo: true,
                repeat: -1,
                delay: i * 100
            });
        }
    }

    private createNameInput(x: number, y: number) {
        // Label
        const label = this.add.text(x, y - 25, 'Your Name', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        label.setOrigin(0.5);
        label.setStroke('#5D4037', 2);

        // Create HTML input
        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.placeholder = 'Enter your name...';
        this.nameInput.maxLength = 20;
        this.nameInput.style.cssText = `
            position: fixed;
            left: 50%;
            top: ${y + 60}px;
            transform: translateX(-50%);
            width: 200px;
            padding: 12px 16px;
            font-size: 16px;
            font-family: 'PixelFont', monospace;
            border: 3px solid #5D4037;
            border-radius: 8px;
            background-color: #FFF8E1;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
        `;
        document.body.appendChild(this.nameInput);

        // Handle enter key
        this.nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.onContinue();
                e.preventDefault();
            }
            e.stopPropagation();
        });
        this.nameInput.addEventListener('keyup', (e) => e.stopPropagation());
        this.nameInput.addEventListener('keypress', (e) => e.stopPropagation());

        // Focus input after a short delay
        this.time.delayedCall(300, () => {
            this.nameInput?.focus();
        });
    }

    private createContinueButton(x: number, y: number) {
        this.continueButton = this.add.container(x, y);

        // Button background
        const btnBg = this.add.sprite(0, 0, 'square-buttons', 6);
        btnBg.setDisplaySize(140, 44);
        btnBg.setTint(0x4ade80);
        btnBg.setInteractive({ useHandCursor: true });

        // Button text
        const btnText = this.add.text(0, 0, 'Continue', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        btnText.setOrigin(0.5);
        btnText.setStroke('#2d6a4f', 2);

        this.continueButton.add([btnBg, btnText]);

        // Button interactions
        btnBg.on('pointerdown', () => this.onContinue());
        btnBg.on('pointerover', () => {
            btnBg.setTint(0x86efac);
            this.tweens.add({
                targets: this.continueButton,
                scale: 1.05,
                duration: 100
            });
        });
        btnBg.on('pointerout', () => {
            btnBg.setTint(0x4ade80);
            this.tweens.add({
                targets: this.continueButton,
                scale: 1,
                duration: 100
            });
        });

        // Initial animation
        this.continueButton.setScale(0);
        this.tweens.add({
            targets: this.continueButton,
            scale: 1,
            duration: 300,
            delay: 500,
            ease: 'Back.easeOut'
        });
    }

    private async onContinue() {
        const name = this.nameInput?.value.trim();

        if (!name || name.length < 2) {
            this.showError('Please enter a name (at least 2 characters)');
            return;
        }

        // Disable button
        this.continueButton.setAlpha(0.5);

        try {
            // Register user with API
            const user = await UserService.registerUser(this.walletAddress, name);

            if (user) {
                // Set new user flag for transformation effect
                localStorage.setItem('fam_game_is_new_user', 'true');
                localStorage.setItem('fam_game_show_transformation', 'true');

                // Clean up input
                this.cleanupInput();

                // Hide registration form in React
                EventBus.emit('hide-registration-form');

                // Transition to transformation scene
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.start('Transformation');
                });
            } else {
                this.showError('Registration failed. Please try again.');
                this.continueButton.setAlpha(1);
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError('An error occurred. Please try again.');
            this.continueButton.setAlpha(1);
        }
    }

    private showError(message: string) {
        const centerX = this.scale.width / 2;
        
        const errorText = this.add.text(centerX, this.scale.height - 70, message, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#ef4444',
            resolution: 2
        });
        errorText.setOrigin(0.5);
        errorText.setStroke('#7f1d1d', 2);

        // Shake animation
        this.tweens.add({
            targets: errorText,
            x: centerX - 5,
            duration: 50,
            yoyo: true,
            repeat: 5,
            onComplete: () => {
                this.tweens.add({
                    targets: errorText,
                    alpha: 0,
                    duration: 2000,
                    delay: 1000,
                    onComplete: () => errorText.destroy()
                });
            }
        });
    }

    private cleanupInput() {
        if (this.nameInput && this.nameInput.parentNode) {
            this.nameInput.parentNode.removeChild(this.nameInput);
        }
        this.nameInput = null;
    }

    shutdown() {
        this.cleanupInput();
    }
}
