import Phaser from 'phaser';

/**
 * A dynamic shadow that follows a target sprite/image and mimics its animation frame.
 * It applies skew and scale transformations to create a "cast shadow" effect.
 */
export class DynamicShadow extends Phaser.GameObjects.Sprite {
    private target: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
    private offsetX: number;
    private offsetY: number;

    /**
     * @param scene The scene this shadow belongs to
     * @param target The sprite or image to cast a shadow for
     * @param xOffset Horizontal offset from target position
     * @param yOffset Vertical offset from target position
     */
    constructor(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, xOffset: number = 0, yOffset: number = 0) {
        super(scene, target.x, target.y, target.texture.key);
        
        this.target = target;
        this.offsetX = xOffset;
        this.offsetY = yOffset;

        // Visual setup
        this.setOrigin(0.5, 1); // Anchor at feet to match most character sprites
        this.setTint(0x000000); // Solid black
        this.setAlpha(0.5);     // Semi-transparent
        
        // Transform for top-down perspective shadow
        // Flatten on Y-axis (scaleY < 1)
        this.setScale(1, 0.5);  
        
        // Skew on X-axis to simulate diagonal light source
        // Positive value leans right, negative leans left
        // Phaser 3 uses skewX/skewY properties, not setSkew method
        this.setSkew(0.5, 0);

        // Add to scene and update list
        scene.add.existing(this);
        // Ensure preUpdate is called even without active animation
        if (scene.sys.updateList) {
            scene.sys.updateList.add(this);
        }
    }

    /**
     * Helper to set skew properties safely
     */
    setSkew(x: number, y: number = 0) {
        // Use type assertion if properties are missing from definition, 
        // but they are standard Phaser transform properties
        if ('skewX' in this) {
            (this as any).skewX = x;
        }
        if ('skewY' in this) {
            (this as any).skewY = y;
        }
        return this;
    }

    /**
     * Automatically called by Phaser's update loop.
     * Syncs shadow properties with the target sprite.
     */
    preUpdate(time: number, delta: number) {
        super.preUpdate(time, delta);
        
        // If target is destroyed, destroy shadow
        if (!this.target || !this.target.active) {
            this.destroy();
            return;
        }

        // Sync position with offset
        this.setPosition(this.target.x + this.offsetX, this.target.y + this.offsetY);
        
        // Sync animation frame if target has animations
        // Check safely for anims and currentFrame to avoid null errors
        const targetAsSprite = this.target as Phaser.GameObjects.Sprite;
        if ('anims' in targetAsSprite && targetAsSprite.anims && targetAsSprite.anims.currentFrame) {
            this.setFrame(targetAsSprite.anims.currentFrame.textureFrame);
        } else if (this.target.frame) {
            this.setFrame(this.target.frame.name);
        }
        
        // Sync flip state (important for direction changes)
        this.setFlipX(this.target.flipX);
        
        // Sync scale (preserving our Y-flattening)
        // We multiply target's scaleX by our base scaleX (1) and target's scaleY by our base scaleY (0.5)
        // Actually, simple inheritance of scale might be tricky if target scales.
        // Let's assume target scale is roughly 1, or just respect sign.
        // Better: Apply our transform relative to target's scale?
        // For now, hardcoded scale Y=0.5 is consistent with requirements.
        // But if target is big (like Merlin), we need to match that.
        this.setScale(this.target.scaleX, Math.abs(this.target.scaleY) * 0.5);
        
        // Sync depth (always on ground layer, above ground tiles but below objects)
        // Ground layer is usually depth 1, so we use depth 2 to ensure it's visible but covered by everything else
        this.setDepth(2);
        
        // Sync visibility
        this.setVisible(this.target.visible);
    }
}
