import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { UserService } from '../UserService';
import { PLAYABLE_CHARACTERS } from '../config/CharacterConfig';

/**
 * Setup Profile Scene - Shown after new user registration
 * Allows user to set their name and choose character type
 */
export class SetupProfile extends Scene {
    private walletAddress: string = '';
    private selectedCharacter: number = 1; // characterType 1-5 (maps to index 0-4)
    private nameInput: HTMLInputElement | null = null;
    private continueButton!: Phaser.GameObjects.Container;
    private characterPreview!: Phaser.GameObjects.Sprite;
    private characterNameText!: Phaser.GameObjects.Text;
    private leftArrow!: Phaser.GameObjects.Container;
    private rightArrow!: Phaser.GameObjects.Container;

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
        this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.5);

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
            y: 65,
            duration: 2000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        // Character selection section (centered, with arrows)
        this.createCharacterSelection(centerX, centerY - 50);

        // Name input section (above Continue button)
        this.createNameInput(centerX, centerY + 70);

        // Continue button
        this.createContinueButton(centerX, centerY + 130);

        // Instructions
        const instructions = this.add.text(centerX, this.scale.height - 25, 'Use arrows to select character, enter name and click Continue', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        instructions.setOrigin(0.5);

        // Listen to resize for input repositioning
        this.scale.on('resize', this.repositionInput, this);

        EventBus.emit('current-scene-ready', this);
    }

    private createCharacterSelection(centerX: number, y: number) {
        // Character frame background (large)
        const frameSize = 90;
        const frameBg = this.add.sprite(centerX, y, 'square-buttons', 6);
        frameBg.setDisplaySize(frameSize + 12, frameSize + 12);
        frameBg.setTint(0x5D4037);

        // Character preview sprite (large)
        const currentChar = PLAYABLE_CHARACTERS[this.selectedCharacter - 1];
        this.characterPreview = this.add.sprite(centerX, y, currentChar.key, 0);
        this.characterPreview.setScale(2.5);

        // Create idle animation for current character
        this.playCharacterAnimation();

        // Glow effect around character
        const glow = this.add.graphics();
        glow.lineStyle(2, 0x4ade80, 0.6);
        glow.strokeCircle(centerX, y, frameSize / 2 + 10);

        // Pulse animation for glow
        this.tweens.add({
            targets: glow,
            alpha: 0.3,
            duration: 1000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        // Character name below
        this.characterNameText = this.add.text(centerX, y + frameSize / 2 + 18, currentChar.displayName, {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        this.characterNameText.setOrigin(0.5);
        this.characterNameText.setStroke('#2d5a3d', 2);

        // Left arrow
        this.leftArrow = this.createArrowButton(centerX - 80, y, '<', () => this.changeCharacter(-1));

        // Right arrow
        this.rightArrow = this.createArrowButton(centerX + 80, y, '>', () => this.changeCharacter(1));

        // Character counter (e.g. "2/5")
        const counterText = this.add.text(centerX, y + frameSize / 2 + 38, `${this.selectedCharacter}/${PLAYABLE_CHARACTERS.length}`, {
            fontSize: '10px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        counterText.setOrigin(0.5);
        counterText.setName('counterText');
    }

    private createArrowButton(x: number, y: number, text: string, onClick: () => void): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        // Arrow background
        const bg = this.add.sprite(0, 0, 'square-buttons', 6);
        bg.setDisplaySize(40, 50);
        bg.setTint(0x5D4037);
        bg.setInteractive({ useHandCursor: true });

        // Arrow text
        const arrowText = this.add.text(0, 0, text, {
            fontSize: '20px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        arrowText.setOrigin(0.5);
        arrowText.setStroke('#3E2723', 2);

        container.add([bg, arrowText]);

        // Interactions
        bg.on('pointerdown', onClick);
        bg.on('pointerover', () => {
            bg.setTint(0x8D6E63);
            this.tweens.add({
                targets: container,
                scale: 1.1,
                duration: 100
            });
        });
        bg.on('pointerout', () => {
            bg.setTint(0x5D4037);
            this.tweens.add({
                targets: container,
                scale: 1,
                duration: 100
            });
        });

        return container;
    }

    private changeCharacter(direction: number) {
        // Calculate new character index (1-based, wrapping)
        let newIndex = this.selectedCharacter + direction;
        if (newIndex < 1) newIndex = PLAYABLE_CHARACTERS.length;
        if (newIndex > PLAYABLE_CHARACTERS.length) newIndex = 1;

        this.selectedCharacter = newIndex;

        // Update character preview
        const newChar = PLAYABLE_CHARACTERS[newIndex - 1];

        // Animate out current character
        this.tweens.add({
            targets: this.characterPreview,
            scale: 0,
            alpha: 0,
            duration: 100,
            onComplete: () => {
                // Change texture and animate in
                this.characterPreview.setTexture(newChar.key, 0);
                this.playCharacterAnimation();

                this.tweens.add({
                    targets: this.characterPreview,
                    scale: 2.5,
                    alpha: 1,
                    duration: 150,
                    ease: 'Back.easeOut'
                });
            }
        });

        // Update character name
        this.characterNameText.setText(newChar.displayName);

        // Update counter
        const counterText = this.children.getByName('counterText') as Phaser.GameObjects.Text;
        if (counterText) {
            counterText.setText(`${newIndex}/${PLAYABLE_CHARACTERS.length}`);
        }

        // Play select sound (if available)
        if (this.sound.get('click')) {
            this.sound.play('click', { volume: 0.3 });
        }
    }

    private playCharacterAnimation() {
        const currentChar = PLAYABLE_CHARACTERS[this.selectedCharacter - 1];
        const animKey = `${currentChar.key}-preview-idle`;

        if (!this.anims.exists(animKey)) {
            this.anims.create({
                key: animKey,
                frames: this.anims.generateFrameNumbers(currentChar.key, { start: 0, end: 3 }),
                frameRate: 6,
                repeat: -1
            });
        }

        this.characterPreview.play(animKey);
    }

    private createNameInput(x: number, y: number) {
        // Label "Your Name"
        const label = this.add.text(x, y - 22, 'Your Name', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        label.setOrigin(0.5);
        label.setStroke('#5D4037', 2);

        // Create HTML input with proper scaling
        this.createScaledInput(x, y);
    }

    private createScaledInput(gameX: number, gameY: number) {
        // Remove existing input if any
        if (this.nameInput) {
            this.nameInput.remove();
            this.nameInput = null;
        }

        // Get canvas rect and calculate scale factor
        const canvas = this.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();

        // Game dimensions vs actual canvas dimensions
        const gameWidth = this.scale.width;  // 960
        const gameHeight = this.scale.height; // 540
        const scaleX = canvasRect.width / gameWidth;
        const scaleY = canvasRect.height / gameHeight;

        // Input dimensions in game units
        const inputWidthGame = 180;
        const inputHeightGame = 28;

        // Convert to screen coordinates (centered on gameX, gameY)
        const inputX = canvasRect.left + (gameX - inputWidthGame / 2) * scaleX;
        const inputY = canvasRect.top + (gameY - inputHeightGame / 2) * scaleY;
        const inputWidth = inputWidthGame * scaleX;
        const inputHeight = inputHeightGame * scaleY;

        // Create HTML input
        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.placeholder = 'Enter your name...';
        this.nameInput.maxLength = 20;
        this.nameInput.style.cssText = `
            position: fixed;
            left: ${inputX}px;
            top: ${inputY}px;
            width: ${inputWidth}px;
            height: ${inputHeight}px;
            padding: 4px 10px;
            font-family: 'PixelFont', Arial, sans-serif;
            font-size: ${12 * scaleY}px;
            background: #2A2A2A;
            color: #FFFFFF;
            border: 2px solid #5D4037;
            border-radius: 6px;
            outline: none;
            text-align: center;
            z-index: 1000;
            box-sizing: border-box;
        `;

        // Handle Enter key
        this.nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                this.onContinue();
                e.preventDefault();
            }
            e.stopPropagation();
        });
        this.nameInput.addEventListener('keyup', (e) => e.stopPropagation());
        this.nameInput.addEventListener('keypress', (e) => e.stopPropagation());

        // Add to DOM
        document.body.appendChild(this.nameInput);

        // Focus input after a short delay
        this.time.delayedCall(300, () => {
            this.nameInput?.focus();
        });
    }

    private repositionInput() {
        if (!this.nameInput) return;

        const canvas = this.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();

        const gameWidth = this.scale.width;
        const gameHeight = this.scale.height;
        const scaleX = canvasRect.width / gameWidth;
        const scaleY = canvasRect.height / gameHeight;

        const centerX = gameWidth / 2;
        const centerY = gameHeight / 2;
        const gameY = centerY + 70; // Same Y as in createNameInput

        const inputWidthGame = 180;
        const inputHeightGame = 28;

        const inputX = canvasRect.left + (centerX - inputWidthGame / 2) * scaleX;
        const inputY = canvasRect.top + (gameY - inputHeightGame / 2) * scaleY;
        const inputWidth = inputWidthGame * scaleX;
        const inputHeight = inputHeightGame * scaleY;

        this.nameInput.style.left = `${inputX}px`;
        this.nameInput.style.top = `${inputY}px`;
        this.nameInput.style.width = `${inputWidth}px`;
        this.nameInput.style.height = `${inputHeight}px`;
        this.nameInput.style.fontSize = `${12 * scaleY}px`;
    }

    private createContinueButton(x: number, y: number) {
        this.continueButton = this.add.container(x, y);

        // Button background
        const btnBg = this.add.sprite(0, 0, 'square-buttons', 6);
        btnBg.setDisplaySize(140, 40);
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
            // Register user with API including selected character type
            const user = await UserService.registerUser(this.walletAddress, name, this.selectedCharacter);

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
            this.showError('An error occurred. Please try again.');
            this.continueButton.setAlpha(1);
        }
    }

    private showError(message: string) {
        const centerX = this.scale.width / 2;

        const errorText = this.add.text(centerX, this.scale.height - 55, message, {
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
        // Remove resize listener
        this.scale.off('resize', this.repositionInput, this);

        if (this.nameInput && this.nameInput.parentNode) {
            this.nameInput.parentNode.removeChild(this.nameInput);
        }
        this.nameInput = null;
    }

    shutdown() {
        this.cleanupInput();
    }
}
