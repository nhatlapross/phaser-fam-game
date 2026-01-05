import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { UserService } from '../UserService';
import { PLAYABLE_CHARACTERS } from '../config/CharacterConfig';

/**
 * Transformation Scene - Digimon-style transformation effect
 * Shows after new user setup, before entering ProfileScene
 */
export class Transformation extends Scene {
    private characterSprite!: Phaser.GameObjects.Sprite;
    private glowGraphics!: Phaser.GameObjects.Graphics;
    private particles: Phaser.GameObjects.Arc[] = [];
    private lightRays: Phaser.GameObjects.Graphics[] = [];

    constructor() {
        super('Transformation');
    }

    create() {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        // Dark background
        const bg = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x0a0a0a);

        // Start transformation sequence
        this.startTransformation(centerX, centerY);

        EventBus.emit('current-scene-ready', this);
    }

    private startTransformation(centerX: number, centerY: number) {
        // Phase 1: Energy gathering (0-1500ms)
        this.phase1_EnergyGathering(centerX, centerY);

        // Phase 2: Light burst (1500-2500ms)
        this.time.delayedCall(1500, () => {
            this.phase2_LightBurst(centerX, centerY);
        });

        // Phase 3: Character reveal (2500-4000ms)
        this.time.delayedCall(2500, () => {
            this.phase3_CharacterReveal(centerX, centerY);
        });

        // Phase 4: Transition to ProfileScene (4500ms)
        this.time.delayedCall(4500, () => {
            this.transitionToProfile();
        });
    }

    private phase1_EnergyGathering(centerX: number, centerY: number) {
        // Create swirling particles coming from edges
        const colors = [0x4ade80, 0xFFD700, 0x60a5fa, 0xf472b6];
        
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 200 + Math.random() * 100;
            const startX = centerX + Math.cos(angle) * distance;
            const startY = centerY + Math.sin(angle) * distance;

            const particle = this.add.circle(startX, startY, 3 + Math.random() * 3, colors[i % colors.length], 0.8);
            particle.setDepth(10);
            this.particles.push(particle);

            // Spiral inward
            this.tweens.add({
                targets: particle,
                x: centerX,
                y: centerY,
                scale: 0.3,
                alpha: 0,
                duration: 1200 + Math.random() * 500,
                delay: i * 40,
                ease: 'Cubic.easeIn'
            });
        }

        // Growing glow at center
        this.glowGraphics = this.add.graphics();
        this.glowGraphics.setDepth(5);

        let glowSize = 0;
        const glowTimer = this.time.addEvent({
            delay: 30,
            repeat: 50,
            callback: () => {
                glowSize += 2;
                this.glowGraphics.clear();
                
                // Multiple glow layers
                for (let i = 3; i >= 0; i--) {
                    const alpha = 0.1 + (i * 0.1);
                    const size = glowSize + (i * 10);
                    this.glowGraphics.fillStyle(0xFFD700, alpha);
                    this.glowGraphics.fillCircle(centerX, centerY, size);
                }
            }
        });

        // Energy text
        const energyText = this.add.text(centerX, centerY + 100, 'Awakening...', {
            fontSize: '14px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        energyText.setOrigin(0.5);
        energyText.setAlpha(0);
        energyText.setDepth(20);

        this.tweens.add({
            targets: energyText,
            alpha: 1,
            duration: 500,
            delay: 500,
            onComplete: () => {
                this.tweens.add({
                    targets: energyText,
                    alpha: 0,
                    duration: 500,
                    delay: 500
                });
            }
        });
    }

    private phase2_LightBurst(centerX: number, centerY: number) {
        // Flash screen white
        const flash = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0xFFFFFF, 0);
        flash.setDepth(100);

        this.tweens.add({
            targets: flash,
            alpha: 1,
            duration: 200,
            yoyo: true,
            onComplete: () => flash.destroy()
        });

        // Light rays emanating from center
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const ray = this.add.graphics();
            ray.setDepth(15);
            
            ray.fillStyle(0xFFD700, 0.6);
            ray.beginPath();
            ray.moveTo(centerX, centerY);
            ray.lineTo(
                centerX + Math.cos(angle - 0.1) * 300,
                centerY + Math.sin(angle - 0.1) * 300
            );
            ray.lineTo(
                centerX + Math.cos(angle + 0.1) * 300,
                centerY + Math.sin(angle + 0.1) * 300
            );
            ray.closePath();
            ray.fill();

            ray.setAlpha(0);
            this.lightRays.push(ray);

            this.tweens.add({
                targets: ray,
                alpha: 0.8,
                duration: 300,
                delay: i * 30,
                yoyo: true,
                hold: 200
            });
        }

        // Expanding ring
        const ring = this.add.graphics();
        ring.setDepth(12);
        
        let ringSize = 0;
        const ringTimer = this.time.addEvent({
            delay: 20,
            repeat: 40,
            callback: () => {
                ringSize += 15;
                ring.clear();
                ring.lineStyle(4, 0xFFD700, Math.max(0, 1 - ringSize / 600));
                ring.strokeCircle(centerX, centerY, ringSize);
            }
        });

        // Clear previous glow
        if (this.glowGraphics) {
            this.tweens.add({
                targets: this.glowGraphics,
                alpha: 0,
                duration: 300
            });
        }
    }

    private phase3_CharacterReveal(centerX: number, centerY: number) {
        // Get user info
        const user = UserService.getStoredUser();
        const username = user?.username || 'Farmer';

        // Get character type from user data (1-5, maps to index 0-4)
        const characterType = user?.characterType || 1;
        const characterIndex = Math.max(0, Math.min(characterType - 1, PLAYABLE_CHARACTERS.length - 1));
        const characterKey = PLAYABLE_CHARACTERS[characterIndex]?.key || 'bear';

        console.log(`[Transformation] Showing character: ${characterKey} (type: ${characterType})`);

        // Character appears with scale animation
        this.characterSprite = this.add.sprite(centerX, centerY, characterKey, 0);
        this.characterSprite.setScale(0);
        this.characterSprite.setDepth(50);

        // Create idle animation for the selected character
        const animKey = `transform-${characterKey}-idle`;
        if (!this.anims.exists(animKey)) {
            this.anims.create({
                key: animKey,
                frames: this.anims.generateFrameNumbers(characterKey, { start: 0, end: 3 }),
                frameRate: 6,
                repeat: -1
            });
        }

        // Scale up with bounce
        this.tweens.add({
            targets: this.characterSprite,
            scale: 5,
            duration: 800,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.characterSprite.play(animKey);
            }
        });

        // Sparkles around character
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 30 + Math.random() * 50;
            
            const sparkle = this.add.circle(
                centerX + Math.cos(angle) * distance,
                centerY + Math.sin(angle) * distance,
                2 + Math.random() * 2,
                [0xFFD700, 0x4ade80, 0xf472b6][i % 3],
                1
            );
            sparkle.setDepth(55);
            sparkle.setAlpha(0);

            this.tweens.add({
                targets: sparkle,
                alpha: 1,
                scale: 0,
                y: sparkle.y - 30,
                duration: 800,
                delay: 300 + i * 50,
                ease: 'Quad.easeOut'
            });
        }

        // Username reveal
        const nameText = this.add.text(centerX, centerY + 80, username, {
            fontSize: '18px',
            fontFamily: 'PixelFont',
            color: '#FFD700',
            resolution: 2
        });
        nameText.setOrigin(0.5);
        nameText.setDepth(60);
        nameText.setStroke('#5D4037', 4);
        nameText.setAlpha(0);
        nameText.setScale(0.5);

        this.tweens.add({
            targets: nameText,
            alpha: 1,
            scale: 1,
            duration: 500,
            delay: 600,
            ease: 'Back.easeOut'
        });

        // "Ready!" text
        const readyText = this.add.text(centerX, centerY + 110, '✨ Ready to Farm! ✨', {
            fontSize: '12px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        readyText.setOrigin(0.5);
        readyText.setDepth(60);
        readyText.setStroke('#166534', 2);
        readyText.setAlpha(0);

        this.tweens.add({
            targets: readyText,
            alpha: 1,
            duration: 300,
            delay: 1200
        });

        // Pulsing glow behind character
        const characterGlow = this.add.graphics();
        characterGlow.setDepth(45);
        characterGlow.fillStyle(0x4ade80, 0.3);
        characterGlow.fillCircle(centerX, centerY, 60);

        this.tweens.add({
            targets: characterGlow,
            alpha: 0.5,
            duration: 500,
            yoyo: true,
            repeat: 3
        });
    }

    private transitionToProfile() {
        // Clear transformation flag
        localStorage.removeItem('fam_game_show_transformation');

        // Fade out and go to ProfileScene
        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('ProfileScene', { isNewUser: true });
        });
    }
}
