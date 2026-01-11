# Claude Code Rules for FAM Game Project

## Project Architecture

### Directory Structure
```
src/game/
├── scenes/
│   └── FarmingGame.ts          # Main game scene (orchestrator only)
├── managers/                    # Game system managers
│   ├── index.ts                # Export all managers
│   ├── BaseManager.ts          # Abstract base class for all managers
│   ├── CheckinManager.ts       # Daily check-in system
│   ├── ShopManager.ts          # Shop and purchase system
│   ├── FactoryManager.ts       # Fruit to fertilizer conversion
│   ├── MailboxManager.ts       # Missions and redeem codes
│   ├── ProfileManager.ts       # User profile and wallet
│   ├── ToolbarManager.ts       # Toolbar and item selectors
│   ├── MapManager.ts           # Map generation and tiles
│   ├── FarmingManager.ts       # Plant/water/harvest logic
│   └── ControlsManager.ts      # Keyboard and mobile controls
├── hooks/
│   ├── index.ts                # Export all hooks
│   └── useGameState.ts         # Global game state (phaser-hooks)
├── types/
│   └── GameTypes.ts            # Shared types, interfaces, constants
└── ui/                         # Reusable UI components (future)
```

## Coding Standards

### Manager Pattern Rules

1. **Every manager MUST extend BaseManager**
```typescript
export class XxxManager extends BaseManager {
    constructor(scene: Phaser.Scene, callbacks: XxxCallbacks) {
        super(scene);
        this.callbacks = callbacks;
    }
}
```

2. **Use callbacks interface for scene communication**
```typescript
interface XxxCallbacks {
    // Getters for reading scene state
    getPlayerGold: () => number;
    // Setters for modifying scene state
    setPlayerGold: (value: number) => void;
    // Actions to trigger
    updateToolbar: () => void;
}
```

3. **Manager lifecycle methods**
- `open()` / `close()` - For modal managers
- `create()` - For creating game objects
- `destroy()` - Cleanup (call `super.destroy()`)
- `getIsOpen()` - Check modal state

4. **UI element management**
- Always use `this.addElement(element)` to track UI elements
- Use `this.destroyElements()` in close/destroy
- Always call `this.scene.cameras.main.ignore(element)` for UI elements

### Type Definitions

1. **All shared types go in `GameTypes.ts`**
```typescript
// Types
export type PlantType = 'social' | 'technical' | 'branded' | 'mushroom';
export type FertilizerType = 'common' | 'rare' | 'epic';

// Interfaces
export interface TileState { ... }
export interface ChestSlot { ... }

// Constants
export const GAME_CONSTANTS = { ... } as const;
export const PLANT_STAGES = { ... } as const;
```

2. **Manager-specific types stay in manager file**
```typescript
// In ShopManager.ts
interface ShopItem { ... }
interface ShopCallbacks { ... }
```

### Phaser Best Practices

1. **Depth values convention**
```
0-999:     Ground/terrain
1000-4999: Game objects (player, plants, buildings)
5000-5099: UI backgrounds
5100-5199: UI elements
5200-5299: Modal backgrounds
5300-5399: Modal elements
5400+:     Overlays and popups
```

2. **Camera handling**
- Main camera follows player, zoomed 3x
- UI camera at (0,0), no zoom
- All UI elements must be ignored by main camera

3. **Text styling**
```typescript
{
    fontSize: '12px',
    fontFamily: 'PixelFont',
    color: '#FFFFFF',
    resolution: 2
}
// Always set stroke for readability
text.setStroke('#5D4037', 2);
```

4. **Interactive elements**
```typescript
element.setInteractive({ useHandCursor: true });
element.on('pointerover', () => { ... });
element.on('pointerout', () => { ... });
element.on('pointerdown', () => { ... });
```

### Import/Export Rules

1. **Manager exports in index.ts**
```typescript
export { BaseManager } from './BaseManager';
export { CheckinManager } from './CheckinManager';
// ... all managers
export * from '../types/GameTypes';
```

2. **Import in FarmingGame.ts**
```typescript
import {
    CheckinManager,
    ShopManager,
    PlantType,
    GAME_CONSTANTS
} from '../managers';
```

### File Size Guidelines

- **FarmingGame.ts**: Should be < 2000 lines (orchestrator only)
- **Individual managers**: 300-800 lines each
- **GameTypes.ts**: < 200 lines

### Naming Conventions

- **Managers**: `XxxManager` (PascalCase)
- **Callbacks interface**: `XxxCallbacks`
- **Private methods**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

## When Creating New Managers

1. Create callback interface first
2. Extend BaseManager
3. Move related properties from FarmingGame
4. Move related methods from FarmingGame
5. Use callbacks for cross-manager communication
6. Update index.ts exports
7. Update FarmingGame.ts to use new manager

## Global State Management (phaser-hooks)

The game uses `phaser-hooks` library for centralized state management. The global state is the **SINGLE SOURCE OF TRUTH** for all game data.

### Using Global Game State

```typescript
import { useGameState } from '../hooks/useGameState';

// In any manager or scene:
const gameState = useGameState(this.scene);

// Read values
const gold = gameState.getGold();
const gems = gameState.getGem();
const seeds = gameState.getSeeds();

// Update values (triggers UI refresh automatically)
gameState.setGold(100);
gameState.addGold(50);
gameState.spendGold(25); // Returns false if insufficient
gameState.setCurrency(gold, gem); // Update both at once
```

### State Structure

```typescript
interface GameState {
    currency: { gold: number; gem: number };
    seeds: { algae: number; mushroom: number; tree: number };
    fertilizers: { common: number; rare: number; epic: number; legendary: number };
    fruits: FruitSlot[];
    waterCount: number;
    user: UserProfile | null;
    isInitialized: boolean;
    lastUpdated: number;
}
```

### Key Principles

1. **ALWAYS read from gameState** - Don't use local variables or UserService for gold/gems
2. **Update gameState on actions** - When user buys, earns, or spends, update gameState immediately
3. **UI auto-updates** - FarmingGame listens to state changes and refreshes UI automatically
4. **Same key = same state** - Calling `useGameState(scene)` anywhere returns the same instance

### Example: Shop Purchase with Global State

```typescript
private async handlePurchase(item: ShopItem): Promise<void> {
    const gameState = useGameState(this.scene);
    const previousGold = gameState.getGold();

    // 1. Optimistic update - instant feedback
    gameState.setGold(previousGold - item.price);
    this.showToast('Purchased!');

    // 2. Background API call
    try {
        const result = await ShopService.buy(item);
        if (result.success) {
            // Sync with actual server value
            gameState.setGold(result.balanceGold);
        } else {
            // Rollback on failure
            gameState.setGold(previousGold);
            this.showToast('Failed!');
        }
    } catch {
        // Rollback on error
        gameState.setGold(previousGold);
        this.showToast('Network error!');
    }
}
```

### State vs GameDataService

- **useGameState** - In-memory state for instant UI updates (single source of truth)
- **GameDataService** - API cache for data fetching and persistence

After API refresh, sync the state:
```typescript
// In FarmingGame.refreshAllUI():
const cachedData = GameDataService.getCachedData();
if (cachedData) {
    gameState.setCurrency(cachedData.currencies.gold, cachedData.currencies.gem);
}
```

## API & Data Refresh Best Practices

### GameDataService Pattern

Use `GameDataService` for centralized data management:

```typescript
import { GameDataService } from '../GameDataService';

// After any action that changes data (purchase, check-in, claim reward):
GameDataService.refreshAndUpdateUI();  // Refresh data + auto update UI

// For specific refresh needs:
GameDataService.refreshProfileAndUpdateUI();   // Profile + currencies
GameDataService.refreshInventoryAndUpdateUI(); // Seeds, fertilizers, fruits
```

### Optimistic UI Updates

For responsive UX, update UI immediately before API call:

```typescript
// 1. Store previous values for rollback
const previousValue = this.getValue();

// 2. Update UI immediately (optimistic)
this.setValue(newValue);
this.playSound();
this.showToast('Success!');

// 3. Call API in background
SomeService.doAction().then(result => {
    if (!result.success) {
        // 4. Rollback on failure
        this.setValue(previousValue);
        this.showToast('Failed!');
    } else {
        // 5. Sync with actual server data
        GameDataService.refreshAndUpdateUI();
    }
}).catch(error => {
    // Rollback on network error
    this.setValue(previousValue);
    this.showToast('Network error!');
});
```

### Data Caching Strategy

**Principle: Load once, update on action**

1. **Pre-fetch ALL data during game loading** (via GameDataService.fetchAllGameData)
2. **Modals use cached data directly** - no API calls when opening
3. **Only refresh cache after user actions** (checkin, buy, claim, etc.)

```typescript
// ❌ DON'T: Fetch data when modal opens
public open() {
    await this.fetchData();  // Causes lag!
    this.showModal();
}

// ✅ DO: Use pre-loaded cache
public open() {
    const data = this.cachedData;  // Instant!
    this.showModal(data);
}

// ✅ DO: Refresh only after user action
private async onPurchase() {
    await ShopService.buy(item);
    GameDataService.refreshAndUpdateUI();  // Update cache after action
}
```

### Countdown Completion Handling

When a countdown timer reaches 0, call API to verify and refresh:

```typescript
let wasWaiting = !this.canDoAction();
let isRefreshing = false;

const updateTimerDisplay = () => {
    const canDoAction = this.canDoAction();

    // Detect countdown completion: was waiting → now ready
    if (wasWaiting && canDoAction && !isRefreshing) {
        isRefreshing = true;
        // Verify with API when countdown reaches 0
        this.fetchStatus().then(() => {
            isRefreshing = false;
            updateTimerDisplay(); // Update UI with fresh data
        });
    }
    wasWaiting = !canDoAction;

    // ... rest of UI update
};
```

Use this for:
- Water well refill (every 4 hours)
- Check-in daily reset
- Any other timed actions

### Smart Garden Refresh

For plant growth timing, use smart refresh instead of fixed polling:

```typescript
// Instead of fixed 30-second polling:
this.time.addEvent({
    delay: 60000, // Check every 60 seconds
    callback: () => this.smartGardenRefresh(),
    loop: true
});

private smartGardenRefresh(): void {
    let needsRefresh = false;

    this.farmLandStates.forEach((state) => {
        if (!state.planted || state.isDead) return;

        // Check if growth timer has completed
        if (state.growth?.hoursRemaining !== undefined) {
            const hoursElapsed = (Date.now() - state.lastRefreshTime) / (1000 * 60 * 60);
            const currentHoursRemaining = state.growth.hoursRemaining - hoursElapsed;
            if (currentHoursRemaining <= 0) needsRefresh = true;
        }

        // Also refresh if plant health is critical
        if (state.hydration?.hoursToDeath <= 1) needsRefresh = true;
    });

    if (needsRefresh) {
        this.loadGardenData();
    }
}
```

Key points:
- Store `lastRefreshTime` when data is loaded
- Calculate elapsed time to determine if stage change expected
- Only call API when actually needed

### Guard Clauses for Async UI Updates

Always check if UI elements still exist before updating:

```typescript
const updateDisplay = () => {
    // Guard: check if modal is still open and elements exist
    if (!this.isOpen || !textElement.active) {
        return;
    }
    textElement.setText('Updated!');
};
```

### Manager Callbacks - Simplified Pattern

Keep callbacks minimal, use GameDataService for data refresh:

```typescript
interface XxxCallbacks {
    playSuccessSound: () => void;
    showToastMessage: (text: string, color: number) => void;
    // Note: UI refresh is handled by GameDataService.refreshAndUpdateUI()
}
```

### Common Refresh Patterns

| Action | Refresh Method |
|--------|----------------|
| Check-in | `refreshAndUpdateUI()` |
| Shop purchase | `refreshAndUpdateUI()` |
| Factory exchange | `refreshAndUpdateUI()` |
| Claim reward | `refreshAndUpdateUI()` |
| Water plant | `refreshAfterGardenAction()` |
| Harvest | `refreshAfterGardenAction()` |

## Testing Integration

After creating/modifying a manager:
1. Run `npm run build` to check TypeScript errors
2. Test the specific feature in browser
3. Verify no console errors
4. Check camera ignore is working (UI stays fixed)
5. Test optimistic UI updates (network lag simulation)
6. Verify rollback works on API failure

---

## HTML Input trong Phaser với Scaling

### Vấn đề
- Game dùng `Scale.ENVELOP` (960x540) nhưng canvas thực tế có kích thước khác tùy màn hình
- HTML elements (input, textarea) dùng **pixel màn hình**, không theo Phaser coordinates
- rexUI InputText (DOM-based) **KHÔNG hoạt động tốt** với scaled games
- Phaser Container **KHÔNG di chuyển** DOM elements khi add vào

### Giải pháp: Tính toán Scale Factor

```typescript
private createHtmlInput(gameX: number, gameY: number, gameWidth: number, gameHeight: number) {
    // 1. Lấy canvas rect và tính scale factor
    const canvasRect = this.game.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.scale.width;   // canvas pixels / game units
    const scaleY = canvasRect.height / this.scale.height;

    // 2. Convert game coords → screen coords
    const screenX = canvasRect.left + gameX * scaleX;
    const screenY = canvasRect.top + gameY * scaleY;

    // 3. Scale width/height của element
    const screenWidth = gameWidth * scaleX;
    const screenHeight = gameHeight * scaleY;

    // 4. Tạo và position HTML input
    const input = document.createElement('input');
    input.style.cssText = `
        position: fixed;
        left: ${screenX}px;
        top: ${screenY}px;
        width: ${screenWidth}px;
        height: ${screenHeight}px;
        font-size: ${12 * scaleY}px;
        z-index: 1000;
        box-sizing: border-box;
    `;

    document.body.appendChild(input);

    // 5. Thêm resize listener
    this.scale.on('resize', this.repositionInput, this);
}

private repositionInput() {
    if (!this.inputElement) return;

    // Recalculate với scale mới
    const canvasRect = this.game.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.scale.width;
    const scaleY = canvasRect.height / this.scale.height;

    // Update position
    this.inputElement.style.left = `${canvasRect.left + gameX * scaleX}px`;
    this.inputElement.style.top = `${canvasRect.top + gameY * scaleY}px`;
    // ... update width, height, fontSize
}

private cleanup() {
    // 6. Cleanup khi đóng
    this.scale.off('resize', this.repositionInput, this);
    if (this.inputElement) {
        this.inputElement.remove();
        this.inputElement = null;
    }
}
```

### Checklist cho HTML Input mới

| Step | Action |
|------|--------|
| 1 | Tính scale factor từ `canvas.getBoundingClientRect()` |
| 2 | Convert tọa độ game → screen: `canvasRect.left + gameX * scaleX` |
| 3 | Scale kích thước element: `gameWidth * scaleX` |
| 4 | Scale font-size: `fontSize * scaleY` |
| 5 | Dùng `position: fixed` và `box-sizing: border-box` |
| 6 | Thêm `this.scale.on('resize', ...)` listener |
| 7 | Cleanup: `this.scale.off('resize', ...)` + `element.remove()` |

### ❌ KHÔNG nên dùng

```typescript
// ❌ rexUI InputText - không hoạt động tốt với scaling
import InputText from 'phaser3-rex-plugins/plugins/inputtext';
this.chatInput = new InputText(this, x, y, width, height, config);

// ❌ Phaser DOM element trong Container - không di chuyển theo container
this.chatModal.add(this.add.dom(x, y, htmlElement));

// ❌ Position cố định không tính scale
input.style.left = `${gameX}px`; // SAI - cần nhân với scaleX
```

### ✅ NÊN dùng

```typescript
// ✅ HTML input thuần với scale calculation
const input = document.createElement('input');
const screenX = canvasRect.left + gameX * scaleX;
input.style.left = `${screenX}px`;
```

---

## Phaser UI Components (PhaserButton, PhaserTextInput)

### Vấn đề với React/HTML UI trong Phaser

Khi game cần hỗ trợ **portrait mode** với CSS rotation (xoay 90°):
- React/HTML buttons **KHÔNG** tự động follow CSS transform của game container
- HTML input positioning bị sai vì coordinate system khác nhau
- Touch/pointer events bị lệch do CSS rotation không transform input

**Giải pháp:** Vẽ UI components bằng Phaser Graphics để chúng nằm trong game coordinate system.

### PhaserButton Component

**File:** `src/game/ui/PhaserButton.ts`

```typescript
import { PhaserButton, ButtonPresets } from '../ui/PhaserButton';

// Basic usage
const button = new PhaserButton({
    scene: this,
    x: centerX,
    y: centerY,
    text: 'Click Me',
    onClick: () => {
        console.log('Button clicked!');
    },
});

// With custom style
const styledButton = new PhaserButton({
    scene: this,
    x: 100,
    y: 200,
    text: 'Buy Now',
    style: {
        width: 200,
        height: 50,
        backgroundColor: 0x6D4C41,
        backgroundColorHover: 0x8D6E63,
        backgroundColorPressed: 0x5D4037,
        borderColor: 0x3E2723,
        borderWidth: 3,
        borderRadius: 8,
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif',
        textColor: '#FFFFFF',
        textStroke: '#3E2723',
        textStrokeThickness: 2,
        shadowColor: 0x3E2723,
        shadowOffsetY: 4,
    },
    onClick: () => handlePurchase(),
    depth: 100,
});

// Using presets
const goldButton = new PhaserButton({
    scene: this,
    x: 100,
    y: 300,
    text: 'Gold Action',
    style: ButtonPresets.gold,
    onClick: () => {},
});

// Available presets: primary, secondary, danger, gold
```

### PhaserButton API

```typescript
// Methods
button.setText('New Text');           // Change button text
button.setDisabled(true);             // Disable button
button.setDisabled(false);            // Enable button
button.setCallback(() => {});         // Change click handler
button.setButtonStyle({ ... });       // Update style
button.setVisible(false);             // Hide button
button.getIsDisabled();               // Check if disabled

// Style options
interface PhaserButtonStyle {
    width?: number;
    height?: number;
    padding?: { x: number; y: number };

    backgroundColor?: number;         // Normal state
    backgroundColorHover?: number;    // Hover state
    backgroundColorPressed?: number;  // Pressed state
    backgroundColorDisabled?: number; // Disabled state

    borderColor?: number;
    borderColorHover?: number;
    borderWidth?: number;
    borderRadius?: number;

    fontSize?: string;
    fontFamily?: string;
    textColor?: string;
    textColorHover?: string;
    textColorDisabled?: string;
    textStroke?: string;
    textStrokeThickness?: number;

    shadowColor?: number;
    shadowOffsetY?: number;
}
```

### Khi nào dùng PhaserButton thay vì HTML/React Button

| Trường hợp | Dùng PhaserButton | Dùng HTML Button |
|------------|-------------------|------------------|
| Game cần portrait mode | ✅ Yes | ❌ No |
| Button trong game scene | ✅ Yes | ⚠️ Có thể |
| Button trong React overlay | ❌ No | ✅ Yes |
| Cần keyboard navigation | ⚠️ Hạn chế | ✅ Yes |
| Cần form submission | ❌ No | ✅ Yes |

---

## Portrait Mode Support (CSS Rotation)

### Cách CSS Rotation hoạt động

Khi device ở portrait mode, game container (#app) được rotate 90° clockwise:

```css
@media screen and (orientation: portrait) {
    #app {
        position: fixed;
        width: 100vh;
        height: 100vw;
        top: 0;
        left: 100vw;
        transform-origin: top left;
        transform: rotate(90deg);
    }
}
```

### Coordinate Transformation

Sau khi rotate 90° clockwise:
- **Game X axis** → **Screen Y axis**
- **Game Y axis** → **Screen X axis** (inverted)

```typescript
// Helper function
private isPortraitMode(): boolean {
    return window.innerHeight > window.innerWidth;
}

// Transform game coords to screen coords for HTML elements
if (isPortraitMode) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Game X → Screen Y, Game Y → Screen X (inverted)
    const screenX = viewportWidth - (gameY / gameHeight) * viewportWidth;
    const screenY = (gameX / gameWidth) * viewportHeight;
}
```

### HTML Input trong Portrait Mode

```typescript
private applyChatInputStyles(
    gameCenterX: number,
    gameCenterY: number,
    inputWidth: number,
    inputHeight: number,
    totalGameWidth: number,
    totalGameHeight: number
) {
    if (!this.inputElement) return;

    const isPortrait = this.isPortraitMode();

    if (isPortrait) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Scale factors for portrait
        const scaleX = viewportHeight / totalGameWidth;
        const scaleY = viewportWidth / totalGameHeight;

        // Transform coordinates
        const screenX = viewportWidth - (gameCenterY / totalGameHeight) * viewportWidth;
        const screenY = (gameCenterX / totalGameWidth) * viewportHeight;

        // Dimensions are swapped due to rotation
        const screenWidth = inputWidth * scaleX;
        const screenHeight = inputHeight * scaleY;

        this.inputElement.style.cssText = `
            position: fixed;
            left: ${screenX}px;
            top: ${screenY}px;
            width: ${screenWidth}px;
            height: ${screenHeight}px;
            transform: translate(-50%, -50%) rotate(90deg);
            transform-origin: center center;
            z-index: 10000;
        `;
    } else {
        // Landscape - normal positioning
        const canvas = this.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / totalGameWidth;
        const scaleY = canvasRect.height / totalGameHeight;

        const screenX = canvasRect.left + gameCenterX * scaleX;
        const screenY = canvasRect.top + gameCenterY * scaleY;

        this.inputElement.style.cssText = `
            position: fixed;
            left: ${screenX}px;
            top: ${screenY}px;
            width: ${inputWidth * scaleX}px;
            height: ${inputHeight * scaleY}px;
            transform: translate(-50%, -50%);
            z-index: 10000;
        `;
    }
}
```

### Pointer Input Transformation (PhaserGame.tsx)

Phaser's input system cũng cần transform coordinates cho portrait mode:

```typescript
// In PhaserGame.tsx
useEffect(() => {
    const setupInputTransform = () => {
        if (!game.current) return;

        const inputManager = game.current.input;
        const originalTransformPointer = inputManager.transformPointer.bind(inputManager);

        inputManager.transformPointer = function(
            pointer: Phaser.Input.Pointer,
            pageX: number,
            pageY: number,
            wasMove: boolean
        ): void {
            originalTransformPointer(pointer, pageX, pageY, wasMove);

            // Transform for portrait mode (90deg clockwise CSS rotation)
            if (isPortrait() && game.current) {
                const gameWidth = game.current.scale.width;
                const gameHeight = game.current.scale.height;
                const screenWidth = window.innerWidth;
                const screenHeight = window.innerHeight;

                // Screen Y → Game X, Screen X → Game Y (inverted)
                pointer.x = (pageY / screenHeight) * gameWidth;
                pointer.y = ((screenWidth - pageX) / screenWidth) * gameHeight;
                pointer.worldX = pointer.x;
                pointer.worldY = pointer.y;
            }
        };
    };
    // ... setup and cleanup
}, []);
```

### Checklist cho Portrait Mode Support

| Step | Action |
|------|--------|
| 1 | Thêm CSS media query cho portrait orientation |
| 2 | Override `transformPointer` trong PhaserGame.tsx |
| 3 | Sử dụng PhaserButton thay vì HTML buttons |
| 4 | HTML inputs cần `applyChatInputStyles()` pattern |
| 5 | Test cả landscape và portrait modes |

### ❌ KHÔNG hoạt động trong Portrait Mode

```typescript
// ❌ React buttons ngoài #app - không follow rotation
<div style={{ position: 'fixed', top: '50%', left: '50%' }}>
    <button>Click me</button>
</div>

// ❌ HTML input với fixed positioning - sai vị trí
input.style.left = `${canvasRect.left + gameX * scaleX}px`;
// Cần transform cho portrait mode!
```

### ✅ Hoạt động trong Portrait Mode

```typescript
// ✅ PhaserButton - tự động trong game coordinate system
new PhaserButton({
    scene: this,
    x: centerX,
    y: centerY,
    text: 'Click Me',
    onClick: () => {},
});

// ✅ HTML input với portrait transformation
if (isPortraitMode()) {
    const screenX = viewportWidth - (gameY / gameHeight) * viewportWidth;
    const screenY = (gameX / gameWidth) * viewportHeight;
    input.style.transform = 'translate(-50%, -50%) rotate(90deg)';
}
```

---

## UI Component Files

```
src/game/ui/
├── index.ts              # Export all UI components
├── PhaserButton.ts       # Reusable button component
└── (future components)
```

### Adding New UI Components

1. Tạo file mới trong `src/game/ui/`
2. Extend `Phaser.GameObjects.Container`
3. Implement hover/pressed/disabled states
4. Export từ `index.ts`
5. Document usage trong CLAUDE.md
