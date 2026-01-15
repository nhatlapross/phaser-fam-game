import { useEffect, useState } from 'react';

/**
 * Overlay component that shows when device is in portrait mode
 * Prompts user to rotate their device to landscape for optimal gameplay
 * Styled to match the game's pixel art aesthetic
 */
export const RotateDeviceOverlay = () => {
    const [isPortrait, setIsPortrait] = useState(false);

    useEffect(() => {
        const checkOrientation = () => {
            setIsPortrait(window.innerHeight > window.innerWidth);
        };

        // Check initial orientation
        checkOrientation();

        // Listen for orientation/resize changes
        window.addEventListener('resize', checkOrientation);
        window.addEventListener('orientationchange', checkOrientation);

        return () => {
            window.removeEventListener('resize', checkOrientation);
            window.removeEventListener('orientationchange', checkOrientation);
        };
    }, []);

    if (!isPortrait) return null;

    return (
        <div className="rotate-device-overlay">
            {/* Decorative grass/ground at bottom */}
            <div className="rotate-device-ground" />

            {/* Main content panel */}
            <div className="rotate-device-panel">
                {/* Character avatar */}
                <div className="rotate-device-character">
                    <img
                        src="/assets/characters/Alice/avatar.png"
                        alt="Character"
                        className="character-avatar"
                    />
                </div>

                {/* Message */}
                <div className="rotate-device-message-box">
                    <h2 className="rotate-device-title">Rotate Your Device!</h2>
                    <p className="rotate-device-message">
                        Please rotate to landscape mode for the best farming experience
                    </p>

                    {/* Phone rotation indicator */}
                    <div className="phone-indicator">
                        <div className="phone-icon">
                            <div className="phone-screen" />
                        </div>
                        <span className="arrow-icon">→</span>
                        <div className="phone-icon rotated">
                            <div className="phone-screen" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RotateDeviceOverlay;
