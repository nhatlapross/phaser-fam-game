/**
 * Utility functions for handling screen orientation and coordinate transformations
 */

/**
 * Check if device is in portrait mode
 */
export function isPortraitMode(): boolean {
    return typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
}

/**
 * Get viewport dimensions
 */
export function getViewportDimensions(): { width: number; height: number } {
    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

/**
 * Transform game coordinates to screen coordinates for HTML elements
 * Accounts for CSS rotation in portrait mode
 *
 * @param gameX - X coordinate in game space
 * @param gameY - Y coordinate in game space
 * @param canvas - The Phaser canvas element
 * @param gameWidth - Game width (e.g., 960)
 * @param gameHeight - Game height (e.g., 540)
 * @returns Screen coordinates { x, y } for positioning HTML elements
 */
export function gameToScreenCoords(
    gameX: number,
    gameY: number,
    canvas: HTMLCanvasElement,
    gameWidth: number,
    gameHeight: number
): { x: number; y: number } {
    const canvasRect = canvas.getBoundingClientRect();

    if (isPortraitMode()) {
        // In portrait mode, the game is rotated 90deg clockwise via CSS
        // The #app container is at left: 100vw, rotated with transform-origin: top left
        // So we need to transform coordinates accordingly

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // After CSS rotation:
        // - Game X axis points DOWN on screen
        // - Game Y axis points LEFT on screen (inverted)

        // Calculate scale factors
        // In portrait, the game's width (960) is displayed along viewport height
        // and game's height (540) is displayed along viewport width
        const scaleX = viewportHeight / gameWidth;  // game width -> viewport height
        const scaleY = viewportWidth / gameHeight;  // game height -> viewport width

        // Transform coordinates
        // Screen X = viewportWidth - (gameY * scaleY)  (inverted because of rotation direction)
        // Screen Y = gameX * scaleX
        const screenX = viewportWidth - (gameY / gameHeight) * viewportWidth;
        const screenY = (gameX / gameWidth) * viewportHeight;

        return { x: screenX, y: screenY };
    } else {
        // Landscape mode - normal coordinate transformation
        const scaleX = canvasRect.width / gameWidth;
        const scaleY = canvasRect.height / gameHeight;

        const screenX = canvasRect.left + gameX * scaleX;
        const screenY = canvasRect.top + gameY * scaleY;

        return { x: screenX, y: screenY };
    }
}

/**
 * Transform game dimensions to screen dimensions for HTML elements
 * Accounts for CSS rotation in portrait mode
 *
 * @param gameWidth - Width in game units
 * @param gameHeight - Height in game units
 * @param canvas - The Phaser canvas element
 * @param totalGameWidth - Total game width (e.g., 960)
 * @param totalGameHeight - Total game height (e.g., 540)
 * @returns Screen dimensions { width, height } and rotation for HTML elements
 */
export function gameToScreenDimensions(
    gameWidth: number,
    gameHeight: number,
    canvas: HTMLCanvasElement,
    totalGameWidth: number,
    totalGameHeight: number
): { width: number; height: number; rotation: number } {
    const canvasRect = canvas.getBoundingClientRect();

    if (isPortraitMode()) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // In portrait, dimensions are swapped due to rotation
        const scaleX = viewportHeight / totalGameWidth;
        const scaleY = viewportWidth / totalGameHeight;

        // When rotated 90deg, width becomes height and vice versa
        return {
            width: gameWidth * scaleX,
            height: gameHeight * scaleY,
            rotation: 90
        };
    } else {
        const scaleX = canvasRect.width / totalGameWidth;
        const scaleY = canvasRect.height / totalGameHeight;

        return {
            width: gameWidth * scaleX,
            height: gameHeight * scaleY,
            rotation: 0
        };
    }
}

/**
 * Get CSS styles for an HTML element positioned in game coordinates
 * Handles portrait mode rotation automatically
 *
 * @param gameX - Center X coordinate in game space
 * @param gameY - Center Y coordinate in game space
 * @param gameWidth - Element width in game units
 * @param gameHeight - Element height in game units
 * @param canvas - The Phaser canvas element
 * @param totalGameWidth - Total game width (e.g., 960)
 * @param totalGameHeight - Total game height (e.g., 540)
 * @returns CSS styles object
 */
export function getGameElementStyles(
    gameX: number,
    gameY: number,
    gameWidth: number,
    gameHeight: number,
    canvas: HTMLCanvasElement,
    totalGameWidth: number,
    totalGameHeight: number
): {
    left: string;
    top: string;
    width: string;
    height: string;
    transform: string;
    transformOrigin: string;
} {
    const pos = gameToScreenCoords(gameX, gameY, canvas, totalGameWidth, totalGameHeight);
    const dims = gameToScreenDimensions(gameWidth, gameHeight, canvas, totalGameWidth, totalGameHeight);

    if (isPortraitMode()) {
        // In portrait mode, rotate the element 90deg to match game rotation
        return {
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${dims.width}px`,
            height: `${dims.height}px`,
            transform: 'translate(-50%, -50%) rotate(90deg)',
            transformOrigin: 'center center'
        };
    } else {
        return {
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${dims.width}px`,
            height: `${dims.height}px`,
            transform: 'translate(-50%, -50%)',
            transformOrigin: 'center center'
        };
    }
}
