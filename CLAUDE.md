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
