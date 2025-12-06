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

## Testing Integration

After creating/modifying a manager:
1. Run `npm run build` to check TypeScript errors
2. Test the specific feature in browser
3. Verify no console errors
4. Check camera ignore is working (UI stays fixed)
