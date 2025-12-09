import Phaser from 'phaser';
import { BaseManager } from './BaseManager';

// Sound effect keys
export type SoundEffectKey = 'walk' | 'plant' | 'water' | 'success';

// Theme song keys
export type ThemeSongKey = 'theme1' | 'theme2' | 'theme3' | 'theme4';

const THEME_SONGS: ThemeSongKey[] = ['theme1', 'theme2', 'theme3', 'theme4'];

/**
 * Manages all game audio including theme music and sound effects
 */
export class SoundManager extends BaseManager {
    private currentTheme: Phaser.Sound.BaseSound | null = null;
    private currentThemeKey: ThemeSongKey | null = null;
    private isMusicEnabled: boolean = true;
    private isSfxEnabled: boolean = true;
    private musicVolume: number = 0.3;
    private sfxVolume: number = 0.5;
    private isWalking: boolean = false;
    private walkSound: Phaser.Sound.BaseSound | null = null;

    constructor(scene: Phaser.Scene) {
        super(scene);
        this.loadSettings();
    }

    /**
     * Load audio settings from localStorage
     */
    private loadSettings(): void {
        if (typeof window === 'undefined') return;

        const musicEnabled = localStorage.getItem('fam_game_music_enabled');
        const sfxEnabled = localStorage.getItem('fam_game_sfx_enabled');
        const musicVol = localStorage.getItem('fam_game_music_volume');
        const sfxVol = localStorage.getItem('fam_game_sfx_volume');

        if (musicEnabled !== null) this.isMusicEnabled = musicEnabled === 'true';
        if (sfxEnabled !== null) this.isSfxEnabled = sfxEnabled === 'true';
        if (musicVol !== null) this.musicVolume = parseFloat(musicVol);
        if (sfxVol !== null) this.sfxVolume = parseFloat(sfxVol);
    }

    /**
     * Save audio settings to localStorage
     */
    private saveSettings(): void {
        if (typeof window === 'undefined') return;

        localStorage.setItem('fam_game_music_enabled', String(this.isMusicEnabled));
        localStorage.setItem('fam_game_sfx_enabled', String(this.isSfxEnabled));
        localStorage.setItem('fam_game_music_volume', String(this.musicVolume));
        localStorage.setItem('fam_game_sfx_volume', String(this.sfxVolume));
    }

    /**
     * Play a random theme song
     */
    public playRandomTheme(): void {
        if (!this.isMusicEnabled) return;

        // Pick a random theme different from current
        let availableThemes = THEME_SONGS.filter(t => t !== this.currentThemeKey);
        if (availableThemes.length === 0) availableThemes = THEME_SONGS;

        const randomIndex = Math.floor(Math.random() * availableThemes.length);
        const themeKey = availableThemes[randomIndex];

        this.playTheme(themeKey);
    }

    /**
     * Play a specific theme song
     */
    public playTheme(key: ThemeSongKey): void {
        if (!this.isMusicEnabled) return;

        // Stop current theme if playing
        this.stopTheme();

        // Check if sound exists
        if (!this.scene.cache.audio.exists(key)) {
            console.warn(`Theme song '${key}' not found in cache`);
            return;
        }

        try {
            this.currentTheme = this.scene.sound.add(key, {
                volume: this.musicVolume,
                loop: false
            });

            this.currentThemeKey = key;

            // When theme ends, play another random theme
            this.currentTheme.once('complete', () => {
                this.playRandomTheme();
            });

            this.currentTheme.play();
            console.log(`Playing theme: ${key}`);
        } catch (error) {
            console.error('Error playing theme:', error);
        }
    }

    /**
     * Stop current theme music
     */
    public stopTheme(): void {
        if (this.currentTheme) {
            this.currentTheme.stop();
            this.currentTheme.destroy();
            this.currentTheme = null;
        }
    }

    /**
     * Play a sound effect
     */
    public playSfx(key: SoundEffectKey): void {
        if (!this.isSfxEnabled) return;

        const soundKey = this.getSoundKey(key);

        if (!this.scene.cache.audio.exists(soundKey)) {
            console.warn(`Sound effect '${soundKey}' not found in cache`);
            return;
        }

        try {
            this.scene.sound.play(soundKey, { volume: this.sfxVolume });
        } catch (error) {
            console.error('Error playing sound effect:', error);
        }
    }

    /**
     * Map effect key to actual sound key
     */
    private getSoundKey(key: SoundEffectKey): string {
        switch (key) {
            case 'walk': return 'sfx-walk';
            case 'plant': return 'sfx-hit';
            case 'water': return 'sfx-water';
            case 'success': return 'sfx-success';
            default: return key;
        }
    }

    /**
     * Start walking sound (looped while moving)
     */
    public startWalkSound(): void {
        if (!this.isSfxEnabled || this.isWalking) return;

        const soundKey = 'sfx-walk';
        if (!this.scene.cache.audio.exists(soundKey)) return;

        try {
            this.walkSound = this.scene.sound.add(soundKey, {
                volume: this.sfxVolume * 0.7,
                loop: true
            });
            this.walkSound.play();
            this.isWalking = true;
        } catch (error) {
            console.error('Error starting walk sound:', error);
        }
    }

    /**
     * Stop walking sound
     */
    public stopWalkSound(): void {
        if (this.walkSound && this.isWalking) {
            this.walkSound.stop();
            this.walkSound.destroy();
            this.walkSound = null;
            this.isWalking = false;
        }
    }

    /**
     * Play plant/hit sound effect
     */
    public playPlantSound(): void {
        this.playSfx('plant');
    }

    /**
     * Play water sound effect (limited to 5 seconds)
     */
    public playWaterSound(): void {
        if (!this.isSfxEnabled) return;

        const soundKey = 'sfx-water';
        if (!this.scene.cache.audio.exists(soundKey)) {
            console.warn(`Sound effect '${soundKey}' not found in cache`);
            return;
        }

        try {
            const waterSound = this.scene.sound.add(soundKey, { volume: this.sfxVolume });
            waterSound.play();

            // Stop after 2 seconds
            this.scene.time.delayedCall(2000, () => {
                if (waterSound && waterSound.isPlaying) {
                    waterSound.stop();
                    waterSound.destroy();
                }
            });
        } catch (error) {
            console.error('Error playing water sound:', error);
        }
    }

    /**
     * Play success sound effect (for exchanges, check-in, shop, redeem)
     */
    public playSuccessSound(): void {
        this.playSfx('success');
    }

    /**
     * Toggle music on/off
     */
    public toggleMusic(): boolean {
        this.isMusicEnabled = !this.isMusicEnabled;
        this.saveSettings();

        if (this.isMusicEnabled) {
            this.playRandomTheme();
        } else {
            this.stopTheme();
        }

        return this.isMusicEnabled;
    }

    /**
     * Toggle sound effects on/off
     */
    public toggleSfx(): boolean {
        this.isSfxEnabled = !this.isSfxEnabled;
        this.saveSettings();

        if (!this.isSfxEnabled) {
            this.stopWalkSound();
        }

        return this.isSfxEnabled;
    }

    /**
     * Set music volume (0-1)
     */
    public setMusicVolume(volume: number): void {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        this.saveSettings();

        if (this.currentTheme && 'setVolume' in this.currentTheme) {
            (this.currentTheme as Phaser.Sound.WebAudioSound).setVolume(this.musicVolume);
        }
    }

    /**
     * Set sound effects volume (0-1)
     */
    public setSfxVolume(volume: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.saveSettings();
    }

    /**
     * Get current settings
     */
    public getSettings(): { musicEnabled: boolean; sfxEnabled: boolean; musicVolume: number; sfxVolume: number } {
        return {
            musicEnabled: this.isMusicEnabled,
            sfxEnabled: this.isSfxEnabled,
            musicVolume: this.musicVolume,
            sfxVolume: this.sfxVolume
        };
    }

    /**
     * Cleanup when scene is destroyed
     */
    public destroy(): void {
        this.stopTheme();
        this.stopWalkSound();
        super.destroy();
    }
}
