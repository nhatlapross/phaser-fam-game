/**
 * Access Key Utilities
 * Handles password protection for restricted features
 */

const ACCESS_KEY = process.env.NEXT_PUBLIC_ACCESS_KEY || '';
const STORAGE_KEY = 'fam_game_access_verified';

/**
 * Check if user has already verified access
 */
export function isAccessVerified(): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(STORAGE_KEY) === 'true';
}

/**
 * Mark access as verified for this session
 */
export function setAccessVerified(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(STORAGE_KEY, 'true');
}

/**
 * Verify access key
 */
export function verifyAccessKey(key: string): boolean {
    return key === ACCESS_KEY;
}

/**
 * Show access key prompt modal
 * Returns a promise that resolves to true if verified, false if cancelled
 */
export function showAccessKeyPrompt(): Promise<boolean> {
    return new Promise((resolve) => {
        // If already verified this session, skip
        if (isAccessVerified()) {
            resolve(true);
            return;
        }

        // If no access key configured, allow access
        if (!ACCESS_KEY) {
            resolve(true);
            return;
        }

        const isMobile = window.innerWidth < 500;

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20000;
            font-family: 'PixelFont', Arial, sans-serif;
        `;

        // Create modal content
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(135deg, #3E2723 0%, #5D4037 100%);
            border: 4px solid #8B4513;
            border-radius: 16px;
            padding: ${isMobile ? '20px' : '24px'};
            max-width: ${isMobile ? '90%' : '320px'};
            width: 90%;
            text-align: center;
        `;

        // Lock icon
        const icon = document.createElement('div');
        icon.textContent = '🔐';
        icon.style.cssText = `font-size: 48px; margin-bottom: 16px;`;
        modal.appendChild(icon);

        // Title
        const title = document.createElement('h3');
        title.textContent = 'Access Required';
        title.style.cssText = `
            color: #FFD700;
            font-size: ${isMobile ? '16px' : '18px'};
            margin: 0 0 8px 0;
            text-shadow: 2px 2px 0 #000;
        `;
        modal.appendChild(title);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.textContent = 'Enter access key to continue';
        subtitle.style.cssText = `
            color: #AAAAAA;
            font-size: ${isMobile ? '11px' : '12px'};
            margin: 0 0 16px 0;
        `;
        modal.appendChild(subtitle);

        // Input
        const input = document.createElement('input');
        input.type = 'password';
        input.placeholder = 'Enter key...';
        input.style.cssText = `
            width: 100%;
            padding: 12px;
            border: 2px solid #5D4037;
            border-radius: 8px;
            background: #2D2D2D;
            color: white;
            font-family: 'PixelFont', Arial, sans-serif;
            font-size: 14px;
            text-align: center;
            box-sizing: border-box;
            margin-bottom: 16px;
        `;
        modal.appendChild(input);

        // Error message (hidden initially)
        const errorMsg = document.createElement('p');
        errorMsg.textContent = 'Invalid key. Try again.';
        errorMsg.style.cssText = `
            color: #FF5252;
            font-size: 11px;
            margin: -12px 0 12px 0;
            display: none;
        `;
        modal.appendChild(errorMsg);

        // Buttons container
        const buttons = document.createElement('div');
        buttons.style.cssText = `display: flex; gap: 12px; justify-content: center;`;

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 10px 20px;
            background: #5D4037;
            color: white;
            border: 2px solid #3E2723;
            border-radius: 8px;
            cursor: pointer;
            font-family: 'PixelFont', Arial, sans-serif;
            font-size: 12px;
        `;
        cancelBtn.onclick = () => {
            overlay.remove();
            resolve(false);
        };
        buttons.appendChild(cancelBtn);

        // Submit button
        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Enter';
        submitBtn.style.cssText = `
            padding: 10px 20px;
            background: #7BC043;
            color: white;
            border: 2px solid #5D9B3A;
            border-radius: 8px;
            cursor: pointer;
            font-family: 'PixelFont', Arial, sans-serif;
            font-size: 12px;
        `;
        
        const handleSubmit = () => {
            if (verifyAccessKey(input.value)) {
                setAccessVerified();
                overlay.remove();
                resolve(true);
            } else {
                errorMsg.style.display = 'block';
                input.value = '';
                input.focus();
            }
        };
        
        submitBtn.onclick = (e) => {
            e.stopPropagation();
            handleSubmit();
        };
        input.onkeydown = (e) => {
            e.stopPropagation(); // Prevent event from bubbling to game
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
            }
            if (e.key === 'Escape') {
                overlay.remove();
                resolve(false);
            }
        };
        
        buttons.appendChild(submitBtn);
        modal.appendChild(buttons);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Focus input
        setTimeout(() => input.focus(), 100);
    });
}
