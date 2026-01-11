import Phaser from 'phaser';
import { MissionService } from '../MissionService';
import { getMissionSocketService, MissionUpdatedPayload } from '../MissionSocketService';
import { EventBus } from '../EventBus';

type SubmissionType = 'link' | 'image';

interface SocialSubmissionCallbacks {
    showToastMessage: (text: string, color: number) => void;
    playSuccessSound?: () => void;
    onSubmitSuccess?: (missionId: string) => void;
    onClose?: () => void;
}

interface SocialSubmissionConfig {
    modalX: number;
    modalY: number;
    modalWidth: number;
    modalHeight: number;
    actionY: number;
    missionId: string;
    baseDepth?: number;
}

/**
 * Reusable social submission form component
 * Can be used by MailboxManager, QuickActionsManager, or any other manager
 */
export class SocialSubmissionManager {
    private scene: Phaser.Scene;
    private callbacks: SocialSubmissionCallbacks;
    private elements: Phaser.GameObjects.GameObject[] = [];
    
    // Form state
    private currentSubmissionType: SubmissionType = 'link';
    private uploadedImageUrl: string | null = null;
    private socialLinkInput: HTMLInputElement | null = null;
    private imageFileInput: HTMLInputElement | null = null;

    constructor(scene: Phaser.Scene, callbacks: SocialSubmissionCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;
    }

    /**
     * Create the submission form UI
     */
    public create(config: SocialSubmissionConfig): void {
        const { modalX, modalY, modalWidth, modalHeight, actionY, missionId } = config;
        const baseDepth = config.baseDepth || 5402;

        // Reset state
        this.currentSubmissionType = 'link';
        this.uploadedImageUrl = null;

        // Tab buttons for Link / Image
        const tabY = actionY;
        const tabWidth = 70;
        const tabHeight = 22;
        const tabSpacing = 10;

        // Link tab
        const linkTabBg = this.scene.add.rectangle(
            modalX - tabWidth / 2 - tabSpacing / 2,
            tabY,
            tabWidth,
            tabHeight,
            0x4ade80
        );
        linkTabBg.setDepth(baseDepth);
        linkTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(linkTabBg);
        this.elements.push(linkTabBg);

        const linkTabText = this.scene.add.text(modalX - tabWidth / 2 - tabSpacing / 2, tabY, '🔗 Link', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        linkTabText.setOrigin(0.5);
        linkTabText.setDepth(baseDepth + 1);
        this.scene.cameras.main.ignore(linkTabText);
        this.elements.push(linkTabText);

        // Image tab
        const imageTabBg = this.scene.add.rectangle(
            modalX + tabWidth / 2 + tabSpacing / 2,
            tabY,
            tabWidth,
            tabHeight,
            0x5D4037
        );
        imageTabBg.setDepth(baseDepth);
        imageTabBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(imageTabBg);
        this.elements.push(imageTabBg);

        const imageTabText = this.scene.add.text(modalX + tabWidth / 2 + tabSpacing / 2, tabY, '📷 Image', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        imageTabText.setOrigin(0.5);
        imageTabText.setDepth(baseDepth + 1);
        this.scene.cameras.main.ignore(imageTabText);
        this.elements.push(imageTabText);

        // Content area - below tabs
        const contentY = tabY + 30;

        // Create link input (default visible)
        const linkInputContainer = this.createLinkInput(modalX, contentY, baseDepth);

        // Create image upload area (hidden by default)
        const imageUploadContainer = this.createImageUploadArea(modalX, contentY, baseDepth);
        imageUploadContainer.setVisible(false);

        // Tab click handlers
        linkTabBg.on('pointerdown', () => {
            this.currentSubmissionType = 'link';
            linkTabBg.setFillStyle(0x4ade80);
            imageTabBg.setFillStyle(0x5D4037);
            linkInputContainer.setVisible(true);
            imageUploadContainer.setVisible(false);
            if (this.socialLinkInput) this.socialLinkInput.style.display = 'block';
        });

        imageTabBg.on('pointerdown', () => {
            this.currentSubmissionType = 'image';
            linkTabBg.setFillStyle(0x5D4037);
            imageTabBg.setFillStyle(0x4ade80);
            linkInputContainer.setVisible(false);
            imageUploadContainer.setVisible(true);
            if (this.socialLinkInput) this.socialLinkInput.style.display = 'none';
        });

        // Submit button
        const submitBtnBg = this.scene.add.sprite(modalX, modalY + modalHeight / 2 - 38, 'square-buttons', 6);
        submitBtnBg.setDisplaySize(100, 28);
        submitBtnBg.setDepth(baseDepth);
        submitBtnBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(submitBtnBg);
        this.elements.push(submitBtnBg);

        const submitText = this.scene.add.text(modalX, modalY + modalHeight / 2 - 38, 'Submit', {
            fontSize: '11px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        submitText.setOrigin(0.5);
        submitText.setDepth(baseDepth + 1);
        submitText.setStroke('#5D4037', 2);
        this.scene.cameras.main.ignore(submitText);
        this.elements.push(submitText);

        submitBtnBg.on('pointerdown', () => {
            if (this.currentSubmissionType === 'link') {
                const link = this.socialLinkInput?.value.trim();
                if (link) {
                    this.submitMissionProof(missionId, 'link', link);
                } else {
                    this.callbacks.showToastMessage('Please enter a valid link', 0xef4444);
                }
            } else {
                if (this.uploadedImageUrl) {
                    this.submitMissionProof(missionId, 'image', this.uploadedImageUrl);
                } else {
                    this.callbacks.showToastMessage('Please upload an image first', 0xef4444);
                }
            }
        });
        submitBtnBg.on('pointerover', () => submitBtnBg.setTint(0xcccccc));
        submitBtnBg.on('pointerout', () => submitBtnBg.clearTint());
    }

    /**
     * Create link input field
     */
    private createLinkInput(modalX: number, contentY: number, baseDepth: number): Phaser.GameObjects.Container {
        const container = this.scene.add.container(0, 0);
        container.setDepth(baseDepth);
        this.scene.cameras.main.ignore(container);
        this.elements.push(container);

        // Label
        const label = this.scene.add.text(modalX, contentY, 'Paste your link:', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#BCAAA4',
            resolution: 2
        });
        label.setOrigin(0.5);
        this.scene.cameras.main.ignore(label);
        container.add(label);

        // Input background placeholder
        const inputBg = this.scene.add.rectangle(modalX, contentY + 25, 180, 28, 0xFFF8E1);
        inputBg.setStrokeStyle(2, 0x5D4037);
        this.scene.cameras.main.ignore(inputBg);
        container.add(inputBg);

        // Create HTML input
        this.socialLinkInput = document.createElement('input');
        this.socialLinkInput.type = 'text';
        this.socialLinkInput.placeholder = 'https://...';

        const canvas = this.scene.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / this.scene.scale.width;
        const scaleY = canvasRect.height / this.scene.scale.height;
        
        const inputWidth = 176 * scaleX;
        const inputLeft = canvasRect.left + modalX * scaleX;
        const inputTop = canvasRect.top + (contentY + 25) * scaleY;

        this.socialLinkInput.style.cssText = `
            position: fixed;
            left: ${inputLeft}px;
            top: ${inputTop}px;
            transform: translate(-50%, -50%);
            width: ${inputWidth}px;
            padding: 6px 10px;
            font-size: 10px;
            font-family: 'PixelFont', monospace;
            border: none;
            background-color: transparent;
            color: #5D4037;
            outline: none;
            text-align: center;
            z-index: 10001;
            box-sizing: border-box;
        `;
        document.body.appendChild(this.socialLinkInput);
        this.socialLinkInput.focus();

        return container;
    }

    /**
     * Create image upload area
     */
    private createImageUploadArea(modalX: number, contentY: number, baseDepth: number): Phaser.GameObjects.Container {
        const container = this.scene.add.container(0, 0);
        container.setDepth(baseDepth);
        this.scene.cameras.main.ignore(container);
        this.elements.push(container);

        // Upload button/area
        const uploadBg = this.scene.add.rectangle(modalX, contentY + 5, 160, 40, 0x3E2723, 0.8);
        uploadBg.setStrokeStyle(2, 0x5D4037, 1);
        uploadBg.setInteractive({ useHandCursor: true });
        this.scene.cameras.main.ignore(uploadBg);
        container.add(uploadBg);

        const uploadText = this.scene.add.text(modalX, contentY + 5, '📤 Click to upload image', {
            fontSize: '9px',
            fontFamily: 'PixelFont',
            color: '#FFFFFF',
            resolution: 2
        });
        uploadText.setOrigin(0.5);
        this.scene.cameras.main.ignore(uploadText);
        container.add(uploadText);

        // Status text
        const statusText = this.scene.add.text(modalX, contentY + 35, '', {
            fontSize: '8px',
            fontFamily: 'PixelFont',
            color: '#4ade80',
            resolution: 2
        });
        statusText.setOrigin(0.5);
        this.scene.cameras.main.ignore(statusText);
        container.add(statusText);

        // Hidden file input
        this.imageFileInput = document.createElement('input');
        this.imageFileInput.type = 'file';
        this.imageFileInput.accept = 'image/*';
        this.imageFileInput.style.display = 'none';
        document.body.appendChild(this.imageFileInput);

        // Handle file selection
        this.imageFileInput.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;

            // Validate file
            if (!file.type.startsWith('image/')) {
                this.callbacks.showToastMessage('Please select an image file', 0xef4444);
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                this.callbacks.showToastMessage('Image must be less than 5MB', 0xef4444);
                return;
            }

            // Show uploading status
            uploadText.setText('⏳ Uploading...');
            statusText.setText('Please wait...');
            uploadBg.setFillStyle(0x5D4037, 0.5);

            try {
                const { IPFSService } = await import('../../services/ipfsService');
                const ipfsUrl = await IPFSService.uploadImage(file);
                
                this.uploadedImageUrl = ipfsUrl;
                uploadText.setText('✅ Image uploaded!');
                uploadBg.setFillStyle(0x166534, 0.8);
                statusText.setText(file.name.length > 25 ? file.name.slice(0, 22) + '...' : file.name);
                statusText.setColor('#4ade80');
                this.callbacks.showToastMessage('Image uploaded successfully!', 0x4ade80);
            } catch (error: any) {
                console.error('Upload error:', error);
                uploadText.setText('❌ Upload failed');
                uploadBg.setFillStyle(0x7f1d1d, 0.8);
                statusText.setText('Click to try again');
                statusText.setColor('#ef4444');
                
                const errorMsg = error?.message || 'Failed to upload image';
                this.callbacks.showToastMessage(errorMsg, 0xef4444);
                
                // Reset after 3 seconds
                this.scene.time.delayedCall(3000, () => {
                    uploadText.setText('📤 Click to upload image');
                    uploadBg.setFillStyle(0x3E2723, 0.8);
                    statusText.setText('');
                });
            }
        });

        // Click handler
        uploadBg.on('pointerdown', () => {
            this.imageFileInput?.click();
        });
        uploadBg.on('pointerover', () => uploadBg.setStrokeStyle(2, 0x4ade80, 1));
        uploadBg.on('pointerout', () => uploadBg.setStrokeStyle(2, 0x5D4037, 1));

        return container;
    }

    /**
     * Submit mission proof via WebSocket or REST API
     */
    private async submitMissionProof(missionId: string, type: SubmissionType, proof: string): Promise<void> {
        const isImage = type === 'image';
        this.callbacks.showToastMessage(isImage ? 'Submitting image proof...' : 'Submitting link...', 0x4a90e2);

        const missionSocketService = getMissionSocketService();

        if (missionSocketService.isConnected()) {
            console.log('[SocialSubmissionManager] Submitting proof via WebSocket');
            
            const handleMissionUpdated = (payload: MissionUpdatedPayload) => {
                if (payload.id === missionId || payload.missionId === missionId) {
                    EventBus.off('mission_socket:mission_updated', handleMissionUpdated);
                    
                    if (payload.status === 'pending') {
                        this.callbacks.showToastMessage('✅ Proof submitted! Pending review.', 0x22c55e);
                        this.callbacks.playSuccessSound?.();
                        this.callbacks.onSubmitSuccess?.(missionId);
                    } else {
                        this.callbacks.showToastMessage('❌ Failed to submit. Please try again.', 0xef4444);
                    }
                }
            };

            EventBus.on('mission_socket:mission_updated', handleMissionUpdated);
            
            this.scene.time.delayedCall(10000, () => {
                EventBus.off('mission_socket:mission_updated', handleMissionUpdated);
            });

            missionSocketService.submitProof(missionId, proof);
        } else {
            console.log('[SocialSubmissionManager] WebSocket not connected, using REST API');
            try {
                const result = await MissionService.submitProof(missionId, proof);

                if (result) {
                    this.callbacks.showToastMessage('✅ Proof submitted! Pending review.', 0x22c55e);
                    this.callbacks.playSuccessSound?.();
                    this.callbacks.onSubmitSuccess?.(missionId);
                } else {
                    this.callbacks.showToastMessage('❌ Failed to submit. Please try again.', 0xef4444);
                }
            } catch (error: any) {
                console.error('Error submitting proof:', error);
                const errorMsg = error?.message || 'Network error. Please check your connection.';
                this.callbacks.showToastMessage(`❌ ${errorMsg}`, 0xef4444);
            }
        }
    }

    /**
     * Get all created elements (for adding to parent's element list)
     */
    public getElements(): Phaser.GameObjects.GameObject[] {
        return this.elements;
    }

    /**
     * Cleanup and destroy
     */
    public destroy(): void {
        // Cleanup HTML inputs
        if (this.socialLinkInput && this.socialLinkInput.parentNode) {
            this.socialLinkInput.parentNode.removeChild(this.socialLinkInput);
        }
        this.socialLinkInput = null;

        if (this.imageFileInput && this.imageFileInput.parentNode) {
            this.imageFileInput.parentNode.removeChild(this.imageFileInput);
        }
        this.imageFileInput = null;
        this.uploadedImageUrl = null;
        this.currentSubmissionType = 'link';

        // Destroy Phaser elements
        this.elements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
        this.elements = [];
    }
}
