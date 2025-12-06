# Game Managers Architecture

## Overview

Các manager đã được tạo để tách riêng logic từ file `FarmingGame.ts` (6700+ dòng) thành các module nhỏ hơn, dễ bảo trì hơn.

## Managers đã tạo

### 1. BaseManager (`BaseManager.ts`)
Abstract base class cho tất cả managers, cung cấp:
- Quản lý UI elements
- Helpers cho modal, button, text
- Lifecycle management (destroy)

### 2. CheckinManager (`CheckinManager.ts`) ~350 lines
Quản lý hệ thống check-in hàng ngày:
- Check-in sign trên map
- Modal check-in 7 ngày
- Streak tracking
- Rewards (water, mushroom seed)

### 3. ShopManager (`ShopManager.ts`) ~550 lines
Quản lý cửa hàng:
- Shop sprite trên map
- Modal với 3 tabs (Gold, Gem, Cash)
- Purchase logic và limits
- Currency management

### 4. FactoryManager (`FactoryManager.ts`) ~350 lines
Quản lý nhà máy chế biến:
- Factory sprite và animation
- Modal chọn loại trái cây
- Conversion logic (3 fruits = 1 fertilizer)
- Fertilizer bag spawning và pickup

## Cách sử dụng trong FarmingGame.ts

### Step 1: Import managers

```typescript
import { CheckinManager, ShopManager, FactoryManager } from '../managers';
import { PlantType, FertilizerType, ChestSlot, GAME_CONSTANTS } from '../types/GameTypes';
```

### Step 2: Khai báo properties

```typescript
export class FarmingGame extends Scene {
    // Managers
    private checkinManager!: CheckinManager;
    private shopManager!: ShopManager;
    private factoryManager!: FactoryManager;

    // ... existing properties
}
```

### Step 3: Khởi tạo managers trong create()

```typescript
create() {
    // ... existing code ...

    // Initialize Checkin Manager
    this.checkinManager = new CheckinManager(this, {
        onRewardWater: () => {
            const wateringCan = this.toolbarItems.find(item => item.name === 'wateringCan');
            if (wateringCan) wateringCan.count = (wateringCan.count || 0) + 1;
        },
        onRewardMushroomSeed: () => {
            this.seedCounts.mushroom++;
        },
        updateToolbar: () => this.updateToolbar()
    });
    this.checkinManager.createCheckinSign(this.TILE_SIZE);

    // Initialize Shop Manager
    this.shopManager = new ShopManager(this, {
        getPlayerGold: () => this.playerGold,
        setPlayerGold: (value) => { this.playerGold = value; },
        getPlayerGems: () => this.playerGems,
        setPlayerGems: (value) => { this.playerGems = value; },
        getSeedCounts: () => this.seedCounts,
        getChestInventory: () => this.chestInventory,
        setChestInventory: (inv) => { this.chestInventory = inv; },
        getToolbarItems: () => this.toolbarItems,
        updateToolbar: () => this.updateToolbar(),
        refreshProfileUI: () => this.createUserProfileUI()
    });
    this.shopManager.createShop(this.TILE_SIZE);

    // Initialize Factory Manager
    this.factoryManager = new FactoryManager(this, {
        getChestInventory: () => this.chestInventory,
        getFertilizerCounts: () => this.fertilizerCounts,
        getPlayer: () => this.player,
        updateToolbar: () => this.updateToolbar(),
        closeSeedSelector: () => this.closeSeedSelector(),
        closeChestPanel: () => this.closeChestPanel()
    }, this.TILE_SIZE);
    this.factoryManager.createFactory();

    // ... rest of create() ...
}
```

### Step 4: Cập nhật setupCameraIgnore()

```typescript
private setupCameraIgnore() {
    // ... existing code ...

    // Ignore manager sprites
    if (this.checkinManager) {
        this.uiCamera.ignore(this.checkinManager.getCheckinSign());
    }
    if (this.shopManager) {
        this.uiCamera.ignore(this.shopManager.getShopSprite());
    }
    if (this.factoryManager) {
        this.uiCamera.ignore(this.factoryManager.getFactorySprite());
        this.factoryManager.getDroppedFertilizers().forEach(f => {
            this.uiCamera.ignore(f);
        });
    }
}
```

### Step 5: Xóa các methods cũ

Sau khi integrate managers, có thể xóa các methods sau từ FarmingGame.ts:

**Từ CheckinManager:**
- createCheckinSign()
- getCheckinData()
- saveCheckinData()
- getTodayString()
- getDayOfWeek()
- canCheckinToday()
- openCheckinModal()
- performCheckin()
- showCheckinReward()
- closeCheckinModal()

**Từ ShopManager:**
- createShop()
- openShopModal()
- createShopItem()
- handleShopPurchase()
- showShopMessage()
- closeShopModal()

**Từ FactoryManager:**
- createFactory()
- toggleFactoryModal()
- openFactoryModal()
- closeFactoryModal()
- getFruitCountInChest()
- removeFruitsFromChest()
- convertFruitToFertilizer()
- playFactoryWorkingAnimation()
- spawnFertilizerBag()
- pickupFertilizer()

### Step 6: Cleanup trong shutdown()

```typescript
shutdown() {
    // ... existing cleanup ...

    // Destroy managers
    if (this.checkinManager) this.checkinManager.destroy();
    if (this.shopManager) this.shopManager.destroy();
    if (this.factoryManager) this.factoryManager.destroy();
}
```

## Managers cần tạo thêm (phức tạp hơn)

### MailboxManager (~800 lines)
- Mission system
- Redeem code system
- QR scanner integration
- Scroll handling

### ProfileManager (~700 lines)
- User profile display
- Edit fields
- Avatar upload (IPFS)
- Wallet connection

### ToolbarManager (~400 lines)
- Toolbar UI
- Seed selector
- Fertilizer selector
- Chest panel

### MapManager (~500 lines)
- Island map generation
- Water animation
- Decorative elements
- Farm plots

### FarmingManager (~500 lines)
- Plant/Water/Harvest logic
- Health bar management
- Plant sprites
- API integration

## File Structure

```
src/game/
├── scenes/
│   └── FarmingGame.ts      (main scene - reduced from 6700 to ~4000 lines)
├── managers/
│   ├── index.ts            (exports all managers)
│   ├── BaseManager.ts      (abstract base)
│   ├── CheckinManager.ts   (check-in system)
│   ├── ShopManager.ts      (shop system)
│   ├── FactoryManager.ts   (factory system)
│   ├── MailboxManager.ts   (TODO)
│   ├── ProfileManager.ts   (TODO)
│   └── README.md           (this file)
├── types/
│   └── GameTypes.ts        (shared types and constants)
└── ui/
    └── (future UI components)
```

## Benefits

1. **Maintainability**: Mỗi hệ thống trong file riêng, dễ debug
2. **Reusability**: Managers có thể reuse across scenes
3. **Testing**: Dễ unit test từng manager
4. **Collaboration**: Nhiều dev có thể làm việc song song
5. **Code Organization**: Clear separation of concerns
