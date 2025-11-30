# 🎮 OverGuild Game - Phaser Implementation

## 📋 Tổng Quan

Đã implement 3 màn hình chính của game OverGuild sử dụng **Phaser 3.90.0** và **Next.js 15**:

### 1. 🏡 Home Garden Scene
- **Grid Layout**: 4x3 plots (12 ô đất trồng)
- **Plant Stages**: Empty → Seed → Sprout → Growing → Mature → Fruiting → Dead
- **Health System**: Health bars với màu thay đổi (green → yellow → red)
- **Timer System**: Countdown cho mỗi cây (72h AFK penalty)
- **Resource Management**: Water và Fertilizer counters
- **Weather System**: Dynamic weather với growth bonuses
- **Interactive Actions**:
  - Plant Seeds (chọn ô trống)
  - Water (tưới nước cây)
  - Fertilize (bón phân)
  - Harvest (thu hoạch trái)

**Key Features**:
- Real-time plant health decay (mỗi giây)
- Automatic stage progression khi đủ thời gian
- Warning indicators cho cây sắp chết (⚠️)
- Plant sway animations
- Graveyard cho cây đã chết

### 2. 🎪 Event Check-In Scene
- **Dual View Modes**:
  - Map View: Interactive map với event markers
  - List View: Scrollable event cards
- **Event Categories**:
  - 🔴 Live Events (đang diễn ra)
  - 📅 Upcoming Events (sắp tới)
- **Event Cards** hiển thị:
  - Event name, location, distance
  - Attendee count (live events)
  - Seed rewards
  - Time remaining / Start date
- **Check-In Flow**:
  - QR Code scanner (simulated)
  - Photo verification option
  - Seed gacha animation
  - Reward distribution

**Key Features**:
- Live event markers với pulsing animation
- Distance calculation from user
- Check-in modal với QR scanner interface
- Gacha animation với card flip effects
- Confetti celebration cho rare drops

### 3. 💧 Networking Scene
- **QR Scanner Interface**:
  - AR-style scanner overlay
  - Corner brackets cho QR detection
  - Animated scan line
- **Connection Tracking**:
  - Water remaining counter (15/20)
  - Today's connections counter
  - Connection history log
- **My QR Code**:
  - Personal QR code display
  - User profile info
  - Share và Save options
- **Connection Success Modal**:
  - Profile preview của người được scan
  - Handshake animation
  - Double Handshake bonus detection
  - Add Friend và Water Another actions

**Key Features**:
- Simulate scan button (để demo)
- Double handshake bonus với confetti
- Connection history với timestamp
- Daily goal tracking (10 connections/day)
- Water droplet animations

## 🎨 UI/UX Implementation

### Color Scheme (Solarpunk Theme)
```typescript
Background: #E8F5E9 (Light Green)
Primary: #2ECC71 (Nature Green)
Secondary: #2196F3 (Sky Blue)
Accent: #F39C12 (Gold)
Warning: #E74C3C (Red)
```

### Typography
- Headers: Bold, 24-32px
- Body: Regular, 14-18px
- Icons: Emoji-based (64px for large)

### Animations
- Plant sway: 2s Sine.easeInOut
- Button hover: Scale 1.05
- Water droplets: Falling with fade
- Scan line: Linear vertical movement
- Confetti: Random trajectories

## 📁 Project Structure

```
/home/alvin/fam-game/
├── src/game/
│   ├── scenes/
│   │   ├── Boot.ts              # Boot scene
│   │   ├── Preloader.ts         # Asset loading
│   │   ├── HomeGarden.ts        # 🏡 Main garden screen
│   │   ├── EventCheckIn.ts      # 🎪 Event check-in
│   │   ├── Networking.ts        # 💧 QR scanner
│   │   ├── MainMenu.ts          # Legacy menu
│   │   ├── Game.ts              # Legacy game
│   │   └── GameOver.ts          # Legacy game over
│   ├── main.ts                  # Phaser config
│   └── EventBus.ts              # React-Phaser communication
├── public/assets/
│   ├── sprites/
│   │   ├── plants.png           # Plant sprites
│   │   ├── grass.png            # Grass tileset
│   │   └── tilled-dirt.png      # Dirt tiles
│   └── ui/
│       └── ui-spritesheet.png   # UI elements
└── design/
    ├── proposal.md              # Game proposal
    ├── design_sence.md          # Scene designs
    └── screen_designs.md        # Detailed UI specs
```

## 🚀 Running the Game

### Development Server
```bash
npm run dev
# Server runs on http://localhost:8080
```

### Build for Production
```bash
npm run build
```

## 🎯 Navigation Flow

```
Boot → Preloader → HomeGarden (Entry Point)
                       ↓
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
  EventCheckIn   Networking     [Future Scenes]
        ↓              ↓              ↓
        └──────────────┼──────────────┘
                       ↓
                  HomeGarden (Back)
```

### Bottom Navigation Bar
- 🏡 **Home**: HomeGarden scene (active)
- 🎪 **Events**: EventCheckIn scene
- 💧 **Network**: Networking scene

## 🔧 Key Technical Details

### Scene Management
```typescript
// Navigate to another scene
this.scene.start('EventCheckIn');

// Emit events to React
EventBus.emit('current-scene-ready', this);
EventBus.emit('fruit-harvested', { plotIndex: 0, fruitType: 'social' });
```

### Game Loop Updates
```typescript
// HomeGarden.ts - Plant health decay
this.time.addEvent({
    delay: 1000,  // Every second
    callback: this.updatePlants,
    loop: true
});
```

### Interactive Elements
```typescript
// Click handlers
element.setInteractive({ useHandCursor: true });
element.on('pointerdown', () => {
    // Handle click
});

// Hover effects
element.on('pointerover', () => {
    this.tweens.add({
        targets: element,
        scaleX: 1.05,
        duration: 100
    });
});
```

## 📊 Data Structures

### PlantData Interface
```typescript
interface PlantData {
    stage: 'empty' | 'seed' | 'sprout' | 'growing' | 'mature' | 'fruiting' | 'dead';
    health: number;           // 0-100
    timeRemaining: number;    // seconds
    type: 'social' | 'tech' | 'mushroom' | 'branded';
    waterCount: number;
    fertilizerCount: number;
}
```

### EventData Interface
```typescript
interface EventData {
    id: string;
    name: string;
    location: string;
    distance: number;         // km
    status: 'live' | 'upcoming' | 'ended';
    attendees: number;
    seedReward: number;
    endsIn?: number;          // hours
    startsOn?: string;        // date
}
```

### ConnectionData Interface
```typescript
interface ConnectionData {
    username: string;
    address: string;          // wallet address
    guild: string;
    treeCount: number;
    timestamp: number;
    doubleHandshake: boolean;
}
```

## 🎮 Game Mechanics Implementation

### 1. Plant Growth System
- **Seed → Sprout**: 24 hours
- **Sprout → Growing**: 24 hours
- **Growing → Mature**: 24 hours
- **Mature → Fruiting**: Instant
- **Health Decay**: -1 per hour without care
- **Death**: Health reaches 0 or 72h no activity

### 2. Watering Mechanic
- Costs 1 water per action
- Restores +20 health
- Requires QR scan of another player
- Double handshake: Both players scan each other → Bonus XP

### 3. Fertilizer System
- Reduces growth time:
  - Common: -5% (3.6h)
  - Uncommon: -10% (7.2h)
  - Rare: -20% (14.4h)
  - Epic: -30% (21.6h)
  - Legendary: -40% (28.8h)
  - Mythic: -50% (36h)

### 4. Event Check-In Rewards
- 3 seeds per event (average)
- Bonus seeds for early bird (<10 AM)
- Rare seeds from special events
- Seed types: Social, Tech, Mushroom, Branded

## 🔮 Future Enhancements

### Phase 2 Features (Not Yet Implemented)
- [ ] Mission Board scene
- [ ] Profile & Achievements scene
- [ ] Marketplace scene
- [ ] Builder's Lab (GitHub + Quiz)
- [ ] Inventory management
- [ ] Real sprite assets (replace emojis)
- [ ] Sound effects and music
- [ ] Particle effects
- [ ] Blockchain integration (wallet connect)
- [ ] Real GPS/QR functionality
- [ ] AI photo verification

### Phase 3 Features
- [ ] Guild Dashboard
- [ ] Guild Wars
- [ ] Pet System
- [ ] Leaderboards
- [ ] Social feed
- [ ] Mobile app (React Native)

## 🐛 Known Issues / Limitations

1. **Emoji Sprites**: Currently using emojis instead of actual sprite sheets
2. **Simulated Scanner**: QR scanner is simulated with a button
3. **No Persistence**: Game state resets on reload (need localStorage/backend)
4. **No Blockchain**: Wallet integration not implemented
5. **Fixed Data**: Events and connections use hardcoded sample data
6. **No Real Map**: Map view is simplified grid, not actual GPS map
7. **TypeScript Warnings**: Some unused variables (cosmetic issues)

## 📝 Code Quality Notes

### Strengths
✅ Clean scene separation
✅ Consistent naming conventions
✅ Typed interfaces for data structures
✅ Modular helper methods
✅ Good use of Phaser animations
✅ Responsive button interactions

### Areas for Improvement
⚠️ Some code duplication in button creation
⚠️ Magic numbers should be constants
⚠️ Need more comprehensive error handling
⚠️ Should extract common UI components
⚠️ Need unit tests

## 🎓 Learning Resources

### Phaser Documentation
- [Phaser 3 API](https://newdocs.phaser.io/)
- [Phaser Examples](https://phaser.io/examples)
- [Scene Management](https://newdocs.phaser.io/docs/3.90.0/Phaser.Scenes.SceneManager)

### Next.js + Phaser
- [Phaser Next.js Template](https://github.com/phaserjs/template-nextjs)
- Current project is based on this template

## 🤝 Contributing

### Adding New Scenes
1. Create scene file in `src/game/scenes/`
2. Import in `src/game/main.ts`
3. Add to scene array in config
4. Update navigation in existing scenes

### Adding Assets
1. Place files in `public/assets/`
2. Load in `Preloader.ts` using `this.load.*`
3. Reference in scenes using asset key

### Best Practices
- Use TypeScript interfaces for data
- Keep scene logic modular
- Use EventBus for React communication
- Follow Solarpunk color scheme
- Add animations for polish

## 📞 Support

For issues or questions about the game implementation:
1. Check `design/` folder for specifications
2. Review Phaser documentation
3. Test in dev server (http://localhost:8080)

---

**Game Version**: 1.0.0-alpha
**Phaser Version**: 3.90.0
**Next.js Version**: 15.3.1
**Implementation Date**: November 2025

🌳 Built with ❤️ for the OverGuild community
