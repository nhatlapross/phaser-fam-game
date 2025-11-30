# 🎨 OverGuild - Thiết Kế Chi Tiết Màn Hình Game

## 📱 Navigation Flow & Architecture

```
├── Splash Screen
│   └── Onboarding (First time) / Login
│       └── Main Navigation (Bottom Tab Bar)
│           ├── Home Garden (Default)
│           ├── Events
│           ├── Missions
│           ├── Profile
│           └── Marketplace
```

---

## 🏡 1. HOME GARDEN SCREEN (Màn Hình Chính)

### Layout Structure
```
┌─────────────────────────────────────┐
│ [☰] OverGuild     [🔔] [⚙️]        │ Header
├─────────────────────────────────────┤
│ 👤 Player Name | LV 12              │
│ [███████░░] 1,234 XP                │ Stats Bar
│ 💧 Water: 15 | 🧪 Fertilizer: 3    │
├─────────────────────────────────────┤
│  🌤️ Weather: Sunny (+10% growth)   │ Weather System
├─────────────────────────────────────┤
│                                     │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐          │
│  │🌱 │ │🌿 │ │🌳 │ │ + │          │ Garden Grid
│  │72h│ │48h│ │🍎 │ │   │          │ (4x3 scrollable)
│  └───┘ └───┘ └───┘ └───┘          │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐          │
│  │💀 │ │ + │ │ + │ │ + │          │
│  │Dead│ │   │ │   │ │   │          │
│  └───┘ └───┘ └───┘ └───┘          │
│                                     │
├─────────────────────────────────────┤
│ [🌱 Plant] [💧 Water] [🧪 Fertilize]│ Quick Actions
└─────────────────────────────────────┘
```

### UI Components
- **Header**
  - Menu button (hamburger): Mở side drawer
  - Notification bell: Hiển thị alerts (cây sắp chết, nhiệm vụ mới)
  - Settings icon: Cài đặt game

- **Stats Bar**
  - Avatar + Username + Level
  - XP Progress bar với animation khi lên level
  - Resource counters (Water, Fertilizer) với icons

- **Weather System Card**
  - Dynamic weather icon (☀️🌤️🌧️⛈️)
  - Weather effects: Sunny (+10% growth), Rainy (+5% water efficiency), Storm (-20% growth)
  - Countdown timer for weather change

- **Garden Grid (3x4 plots)**
  - Each plot shows:
    - Plant sprite (changes based on growth stage)
    - Health bar (green→yellow→red)
    - Timer countdown (72h format)
    - Status icons: 💧 (needs water), 🧪 (needs fertilizer), ⚠️ (critical)
  - Empty plots: Shows "+" button to plant
  - Dead plots: Shows 💀 with "Bury" option

- **Quick Action Bar**
  - Plant Seed: Opens seed inventory
  - Water: Opens networking QR scanner
  - Fertilize: Opens Builder's Lab

### Interactions
- **Tap on plant**: Opens Tree Detail View modal
- **Long press on plot**: Quick menu (Water, Fertilize, Harvest)
- **Swipe left/right**: Navigate between multiple gardens (if unlocked)
- **Pull to refresh**: Updates garden state from blockchain

### Animations
- Plants sway gently with wind
- Water droplets when watering
- Sparkle effect when plant grows stage
- Pulsing red glow on critical plants

---

## 📍 2. EVENT CHECK-IN SCREEN

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Events Near You        [🗺️/📋] │ Header
├─────────────────────────────────────┤
│     ╔═══════════════════╗           │
│     ║   MAP VIEW        ║           │ Map View (Default)
│     ║                   ║           │
│     ║  📍 You           ║           │
│     ║     🎪 Event A    ║           │
│     ║  🎪 Event B       ║           │
│     ║                   ║           │
│     ╚═══════════════════╝           │
├─────────────────────────────────────┤
│ 🔴 LIVE NOW (2)                     │ Event Categories
│ ┌─────────────────────────────────┐│
│ │🎪 Token2049 Singapore           ││
│ │📍 Marina Bay Sands • 2.3km      ││
│ │👥 1,234 checked in              ││
│ │🌱 +3 Seeds | ⏱️ Ends in 4h      ││
│ │            [CHECK IN] ────────► ││
│ └─────────────────────────────────┘│
│                                     │
│ 📅 UPCOMING (5)                     │
│ ┌─────────────────────────────────┐│
│ │🎪 ETHDenver 2025                ││
│ │📍 Denver, CO • Starts Feb 28    ││
│ │            [REMIND ME] ────────►││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Map View Components
- **Interactive Map** (Google Maps/Mapbox)
  - User location marker (blue dot)
  - Event markers (color-coded by status):
    - 🔴 Red: Live now
    - 🟢 Green: Upcoming
    - ⚪ Gray: Ended
  - Radius circle showing check-in range (50m)
  - Zoom controls

- **Event Markers on Map**
  - Tap to see event preview card
  - Shows distance from user
  - Cluster nearby events

### List View Components
- **Event Card**
  - Event banner image (branded)
  - Event name + icon
  - Location + distance
  - Live stats: Check-in count, seeds reward
  - CTA button: "CHECK IN" (if in range) or "VIEW DETAILS"

- **Filters & Sorting**
  - Distance (nearest first)
  - Time (live now → upcoming)
  - Seed rewards (highest first)
  - Event type (Conference, Meetup, Workshop)

### Check-in Flow
```
Tap CHECK IN → Verify Location (GPS) → Scan Event QR Code
  → AI Verification (SmolVLM photo) → Animation Drop Seeds
    → Show Seed Gacha Result → Add to Inventory
```

### Check-in Modal
```
┌─────────────────────────────────────┐
│         CHECK IN TO EVENT           │
├─────────────────────────────────────┤
│                                     │
│   ┌───────────────────────────┐    │
│   │   [QR CODE SCANNER]       │    │
│   │   Scan the event QR code  │    │
│   │                           │    │
│   └───────────────────────────┘    │
│                                     │
│        - OR -                       │
│                                     │
│   [📸 TAKE EVENT PHOTO]             │
│   (AI will verify your attendance)  │
│                                     │
│   📍 Location Verified ✓            │
│   🕐 Time: 10:23 AM (Early Bird!)   │
│                                     │
│        [CONFIRM CHECK-IN]           │
└─────────────────────────────────────┘
```

### Leaderboard (Realtime)
```
┌─────────────────────────────────────┐
│ 🏆 Event Leaderboard                │
├─────────────────────────────────────┤
│ 1. 🥇 Alice.eth        45 Check-ins │
│ 2. 🥈 Bob.near         42 Check-ins │
│ 3. 🥉 Charlie.sol      38 Check-ins │
│ ...                                 │
│ 127. You              12 Check-ins  │
└─────────────────────────────────────┘
```

---

## 💧 3. NETWORKING SCENE (Social Watering)

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Social Watering     [HISTORY]   │ Header
├─────────────────────────────────────┤
│                                     │
│   ╔═══════════════════════════╗    │
│   ║    QR SCANNER WITH AR     ║    │ AR Scanner
│   ║   ┌─────────────────┐     ║    │
│   ║   │  [QR CODE]      │     ║    │
│   ║   │   DETECTED      │     ║    │
│   ║   └─────────────────┘     ║    │
│   ║   Scanning...       🔦    ║    │
│   ╚═══════════════════════════╝    │
│                                     │
│   💧 Water Remaining: 15/20         │
│   🌊 Today's Connections: 8         │
│                                     │
├─────────────────────────────────────┤
│ 👤 MY QR CODE                       │
│ ┌─────────────────────────────────┐│
│ │      [YOUR QR CODE]             ││ Your QR
│ │   username.eth                  ││
│ │   🌳 Level 12 Gardener          ││
│ └─────────────────────────────────┘│
│    [SHARE QR] [SAVE IMAGE]          │
└─────────────────────────────────────┘
```

### QR Scanner Features
- **AR Overlay**
  - Animated water droplet when QR detected
  - Green highlight box around valid QR
  - Red highlight for invalid/already scanned today
  - Distance indicator (works up to 2m)

- **Haptic Feedback**
  - Vibrate when QR detected
  - Success haptic when scan complete

### Profile Preview (After Scan)
```
┌─────────────────────────────────────┐
│         CONNECTION SUCCESS!          │
├─────────────────────────────────────┤
│       🤝 Animation (Handshake)      │
│                                     │
│   ┌─────────────────────────────┐  │
│   │  [Avatar]                   │  │
│   │  Alice Chen                 │  │
│   │  alice.eth                  │  │
│   │  🏢 Guild: Base Builders    │  │
│   │  🌳 Total Trees: 47         │  │
│   │  🔥 Streak: 12 days         │  │
│   └─────────────────────────────┘  │
│                                     │
│   💧 Watered their tree!            │
│   +1 Water used                     │
│                                     │
│   ✨ DOUBLE HANDSHAKE BONUS! ✨     │
│   They scanned you too!             │
│   +5 XP Bonus                       │
│                                     │
│   [ADD FRIEND] [VIEW PROFILE]       │
│   [WATER ANOTHER]                   │
└─────────────────────────────────────┘
```

### History Tab
```
┌─────────────────────────────────────┐
│ 💧 Today's Watering History         │
├─────────────────────────────────────┤
│ ✓ Alice.eth            10:23 AM     │
│ ✓ Bob.near (2-way!)    10:45 AM     │
│ ✓ Charlie.sol          11:02 AM     │
│ ...                                 │
│ Total: 8 connections today          │
│ 🎯 Daily Goal: 10 (80%)             │
└─────────────────────────────────────┘
```

### Double Handshake Animation
- Both users scan each other → Special animation
- Confetti + sparkle effect
- Bonus rewards (2x XP, rare water droplet)
- Achievement unlock: "Perfect Match"

---

## 🧪 4. BUILDER'S LAB (Proof of Work)

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Builder's Lab                   │
├─────────────────────────────────────┤
│ [GITHUB] [QUIZ] [CHALLENGES]        │ Tabs
├─────────────────────────────────────┤
│ 💻 GITHUB FERTILIZER                │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ ⚠️ Connect GitHub to Continue   ││
│ │                                 ││
│ │  [CONNECT GITHUB ACCOUNT]       ││
│ └─────────────────────────────────┘│
│                                     │
│ OR (if connected):                  │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ ✓ Connected: @username          ││
│ │ Last synced: 2 mins ago         ││
│ │                                 ││
│ │ 📊 This Week's Activity:        ││
│ │ • 24 Commits                    ││
│ │ • 3 Pull Requests               ││
│ │ • 150 Lines Added               ││
│ │                                 ││
│ │ 🎁 Claimable Rewards:           ││
│ │ [🧪] Common Fertilizer x3       ││
│ │ [🧪] Uncommon Fertilizer x1     ││
│ │                                 ││
│ │      [CLAIM ALL REWARDS]        ││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### GitHub Tab
- **Connection Status**
  - Not connected: CTA to connect via OAuth
  - Connected: Show username, avatar, last sync
  - Auto-sync every hour

- **Activity Tracker**
  - Commits (last 7 days)
  - Pull requests merged
  - Code additions/deletions
  - Contribution graph visualization

- **Reward Calculation**
  - 1-5 commits = Common Fertilizer
  - 6-15 commits = Uncommon Fertilizer
  - 16-30 commits = Rare Fertilizer
  - 31+ commits = Epic Fertilizer
  - Special: Merged PR to major repo = Legendary Fertilizer

- **Claim Button**
  - Shows preview of rewards
  - Animation: Fertilizer bottles filling up
  - Can claim once per day

### Quiz Tab
```
┌─────────────────────────────────────┐
│ 🎓 TECH QUIZ CHALLENGE              │
├─────────────────────────────────────┤
│ 📚 Categories:                      │
│ ┌─────────────┐ ┌─────────────┐    │
│ │ Blockchain  │ │  Backend    │    │
│ │   ⭐⭐⭐     │ │   ⭐⭐☆     │    │
│ └─────────────┘ └─────────────┘    │
│ ┌─────────────┐ ┌─────────────┐    │
│ │  Frontend   │ │   DevOps    │    │
│ │   ⭐☆☆     │ │   ⭐⭐⭐     │    │
│ └─────────────┘ └─────────────┘    │
│                                     │
│ 🏆 Today's Challenges:              │
│ ┌─────────────────────────────────┐│
│ │ Easy: Solidity Basics           ││
│ │ ⏱️ 5 mins • 5 questions          ││
│ │ 🎁 Reward: Common Fertilizer    ││
│ │          [START QUIZ] ─────────►││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Medium: Smart Contract Security ││
│ │ ⏱️ 10 mins • 10 questions        ││
│ │ 🎁 Reward: Uncommon Fertilizer  ││
│ │          [START QUIZ] ─────────►││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Quiz Flow
```
Start Quiz → Question 1/10 (Timer: 30s)
  → Select Answer → Immediate Feedback (✓/✗)
    → Next Question → ... → Results Screen
      → Show Score → Reward Claim → Back to Lab
```

### Quiz Question Screen
```
┌─────────────────────────────────────┐
│ Question 3/10          ⏱️ 00:24     │
├─────────────────────────────────────┤
│ What is the purpose of 'view'       │
│ keyword in Solidity?                │
│                                     │
│ ○ A) Allows function to modify     │
│      state variables               │
│ ○ B) Prevents function from        │
│      modifying state               │
│ ○ C) Makes function payable        │
│ ○ D) Optimizes gas usage           │
│                                     │
│            [SUBMIT ANSWER]          │
│            [SKIP (-10 pts)]         │
└─────────────────────────────────────┘
```

### Challenges Tab (Future Feature)
- Coding challenges (LeetCode-style)
- Live tournaments
- Team challenges for guilds

---

## 🍎 5. HARVEST & INVENTORY SCREEN

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Inventory         [FILTER] [🔍] │ Header
├─────────────────────────────────────┤
│ [ACTIVE] [INVENTORY] [COMPOSTING]   │ Tabs
├─────────────────────────────────────┤
│ 🌱 SEEDS (12)                       │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐          │
│ │🌰│ │🌰│ │🍄│ │🍄│ │⭐│          │
│ │x3│ │x5│ │x2│ │x1│ │x1│          │
│ └──┘ └──┘ └──┘ └──┘ └──┘          │
│ Social Tech Mush Rare Epic          │
│                                     │
│ 🍄 MUSHROOMS (Consumables) (8)      │
│ ┌──┐ ┌──┐ ┌──┐                     │
│ │🍄│ │🍄│ │🍄│                     │
│ │x5│ │x2│ │x1│                     │
│ └──┘ └──┘ └──┘                     │
│ +5  +10  +20 Energy                 │
│                                     │
│ 🍎 FRUITS (NFTs) (3)                │
│ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │ 🍎  │ │ 🍊   │ │ ⭐   │         │
│ │ #127│ │ #045 │ │ #003 │         │
│ │Rare │ │Epic  │ │Legend│         │
│ └──────┘ └──────┘ └──────┘         │
│ [VIEW] [LIST] [COMPOST]             │
│                                     │
│ 🧪 FERTILIZERS (15)                 │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐               │
│ │⚗️│ │⚗️│ │⚗️│ │⭐│               │
│ │x8│ │x4│ │x2│ │x1│               │
│ └──┘ └──┘ └──┘ └──┘               │
│ Com. Unco. Rare Epic                │
└─────────────────────────────────────┘
```

### Active Tab
- Shows currently growing plants
- Quick actions: Water, Fertilize, View Details
- Sort by: Time remaining, Health status

### Inventory Tab
- **Filters**
  - All / Seeds / Mushrooms / Fruits / Fertilizers
  - Rarity: Common → Mythic
  - Sort: Newest, Oldest, Rarity, Quantity

- **Item Cards**
  - Icon + quantity
  - Name + rarity badge
  - Long press for quick use
  - Tap for detail modal

### Item Detail Modal
```
┌─────────────────────────────────────┐
│ [×] FRUIT NFT #127                  │
├─────────────────────────────────────┤
│       ┌─────────────────┐           │
│       │   [3D MODEL]    │           │
│       │   🍎 Rotating   │           │
│       └─────────────────┘           │
│                                     │
│ Name: Golden Apple                  │
│ Rarity: ⭐⭐⭐ Rare                  │
│ Origin: Token2049 SG                │
│ Minted: Jan 15, 2025                │
│                                     │
│ Growth History:                     │
│ • Planted: Jan 1 at DevCon          │
│ • Watered by: 12 people             │
│ • Fertilized with: 5x GitHub        │
│ • Special: Gold Branch (100+ commits)│
│                                     │
│ Blockchain:                         │
│ • Chain: Arbitrum                   │
│ • Contract: 0x1234...5678           │
│ • Token ID: #127                    │
│                                     │
│ [SELL ON MARKET] [COMPOST] [SHARE]  │
└─────────────────────────────────────┘
```

### Composting Station Tab
```
┌─────────────────────────────────────┐
│ ♻️ COMPOSTING STATION               │
├─────────────────────────────────────┤
│ Burn your Fruits to create Magic   │
│ Fertilizers for faster growth!      │
│                                     │
│ 🔥 Composting Recipes:              │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 3 Common Fruits                 ││
│ │   ↓ ↓ ↓                         ││
│ │ 1 Uncommon Fertilizer (-10%)    ││
│ │        [COMPOST] ──────────────►││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 3 Rare Fruits                   ││
│ │   ↓ ↓ ↓                         ││
│ │ 1 Epic Fertilizer (-30%)        ││
│ │        [COMPOST] ──────────────►││
│ └─────────────────────────────────┘│
│                                     │
│ 🔮 Active Composting (2):           │
│ • Epic Fertilizer - Ready in 2h     │
│ • Rare Fertilizer - Ready in 5h     │
└─────────────────────────────────────┘
```

---

## 🎯 6. MISSION BOARD SCREEN

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Missions          [HISTORY]     │
├─────────────────────────────────────┤
│ [DAILY] [WEEKLY] [HIDDEN]           │ Tabs
├─────────────────────────────────────┤
│ ☀️ DAILY MISSIONS                   │
│ Resets in: 8h 23m                   │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🐦 The Early Bird               ││
│ │ Check-in before 10:00 AM        ││
│ │ [████████░░] 80% (4/5 days)     ││
│ │ 🎁 +10 Water, +50 XP            ││
│ │                         [CLAIM] ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 💧 Social Sprinkler             ││
│ │ Water 3 different people        ││
│ │ [██████░░░░] 60% (2/3)          ││
│ │ 🎁 +5 Water, +30 XP             ││
│ │                    [IN PROGRESS]││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ ✓ Garden Keeper                 ││
│ │ Fertilize 2 plants              ││
│ │ [██████████] 100% (2/2)         ││
│ │ 🎁 +2 Fertilizer, +40 XP        ││
│ │                         [CLAIM] ││
│ └─────────────────────────────────┘│
│                                     │
│ Progress: 2/3 completed today       │
│ Streak: 🔥 7 days                   │
└─────────────────────────────────────┘
```

### Daily Missions
- **Mission Card Components**
  - Icon + Title
  - Description
  - Progress bar (visual completion %)
  - Counter (X/Y format)
  - Reward preview (icons + quantities)
  - Status button: [IN PROGRESS] / [CLAIM] / [COMPLETE ✓]

- **Common Daily Missions**
  1. The Early Bird: Check-in before 10 AM
  2. Social Sprinkler: Water 3 people
  3. Garden Keeper: Fertilize 2 plants
  4. Quiz Master: Complete 1 quiz
  5. Active Farmer: Harvest 1 fruit

- **Streak System**
  - Shows current streak (days)
  - Fire icon animation
  - Bonus rewards at 7, 14, 30 days

### Weekly Missions
```
┌─────────────────────────────────────┐
│ 📅 WEEKLY MISSIONS                  │
│ Resets in: 3d 8h 23m                │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🌍 Event Explorer               ││
│ │ Check-in at 3 different events  ││
│ │ [████████░░] 67% (2/3)          ││
│ │ 🎁 +1 Rare Seed, +200 XP        ││
│ │                    [IN PROGRESS]││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 👨‍🌾 Master Gardener               ││
│ │ Harvest 5 plants without any    ││
│ │ dying (maintain 72h care)       ││
│ │ [████░░░░░░] 40% (2/5)          ││
│ │ 🎁 +1 Mushroom Rare Seed,       ││
│ │    +5 Magic Fertilizer          ││
│ │                    [IN PROGRESS]││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 💻 Code Warrior                 ││
│ │ Make 20+ GitHub commits         ││
│ │ [███████░░░] 72% (14/20)        ││
│ │ 🎁 +3 Epic Fertilizer,          ││
│ │    +500 XP, +100 Tokens         ││
│ │                    [IN PROGRESS]││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Hidden/Secret Missions Tab
```
┌─────────────────────────────────────┐
│ 🕵️ HIDDEN MISSIONS                  │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🦉 The Night Owl                ││
│ │ ???????????????????             ││
│ │ [░░░░░░░░░░] 0%                 ││
│ │ 🎁 ??? (Hint: After 2 AM)       ││
│ │                        [LOCKED] ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🌐 Network Node                 ││
│ │ Get scanned by 50 people in 1hr ││
│ │ [███░░░░░░░] 26% (13/50)        ││
│ │ 🎁 Badge NFT: "Social Butterfly"││
│ │                    [IN PROGRESS]││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ ✓ Perfect Week                  ││
│ │ Complete all dailies for 7 days ││
│ │ [██████████] 100% (7/7)         ││
│ │ 🎁 Title: "Dedicated Gardener"  ││
│ │                         [CLAIM] ││
│ └─────────────────────────────────┘│
│                                     │
│ 🔓 Unlocked: 3/12                   │
│ Keep exploring to discover more!    │
└─────────────────────────────────────┘
```

### Mission History
- List of completed missions (last 30 days)
- Total rewards claimed
- Achievement timeline

---

## 👤 7. PROFILE & ACHIEVEMENTS SCREEN

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Profile           [⚙️] [SHARE]  │
├─────────────────────────────────────┤
│     ┌───────────────────┐           │
│     │   [AVATAR 3D]     │           │
│     │   username.eth    │           │
│     └───────────────────┘           │
│         Level 12 Gardener           │
│       [███████░░░] 1,234/2,000 XP   │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 📊 STATS                        ││
│ │ 🌳 Total Trees: 47              ││
│ │ 🍎 Fruits Harvested: 23         ││
│ │ 🎪 Events Attended: 8           ││
│ │ 💧 Connections Made: 156        ││
│ │ 🔥 Current Streak: 12 days      ││
│ │ ⏱️ Playtime: 34h 12m             ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🏅 SOULBOUND BADGES             ││
│ │ ┌───┐ ┌───┐ ┌───┐ ┌───┐        ││
│ │ │🎪 │ │💻 │ │🦉 │ │⭐ │        ││
│ │ │T49│ │Sol│ │Owl│ │   │        ││
│ │ └───┘ └───┘ └───┘ └───┘        ││
│ │ Token2049 Solidity Night Early  ││
│ │ Veteran   Expert   Owl   Backer ││
│ │                                 ││
│ │         [VIEW ALL (12)] ───────►││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🌳 NFT GALLERY                  ││
│ │ [Filter: All ▼] [Sort: Rarity ▼]││
│ │ ┌────┐ ┌────┐ ┌────┐           ││
│ │ │ 🍎│ │ 🍊 │ │ ⭐ │           ││
│ │ │#127│ │#045│ │#003│           ││
│ │ └────┘ └────┘ └────┘           ││
│ │         [VIEW ALL (23)] ───────►││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🆔 W3C DID                      ││
│ │ did:web:overguild.xyz:username  ││
│ │ ✓ Verified on Arbitrum          ││
│ │         [VIEW FULL DID] ───────►││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Profile Header
- **3D Avatar**
  - Customizable (unlockable items)
  - Rotates with gyroscope
  - Background changes by level tier

- **Username + ENS**
  - Shows ENS if connected
  - Edit button (only username, not ENS)

- **Level System**
  - Level 1-100
  - Each level unlocks perks:
    - More garden plots
    - Better drop rates
    - Exclusive seeds
  - XP bar with animations

### Stats Section
- Key metrics with icons
- Hover/tap for detailed breakdown
- Comparison to friends (optional)

### Soulbound Badges Section
```
┌─────────────────────────────────────┐
│ 🏅 SOULBOUND BADGES (Non-Transferable)│
├─────────────────────────────────────┤
│ Earned Badges (12):                 │
│                                     │
│ ┌──────────┐ ┌──────────┐          │
│ │ 🎪 Token │ │ 💻 Solid │          │
│ │ 2049 SG  │ │ ity Pro  │          │
│ │ Veteran  │ │ Expert   │          │
│ │ Jan 2025 │ │ Dec 2024 │          │
│ └──────────┘ └──────────┘          │
│                                     │
│ Locked Badges (8):                  │
│ ┌──────────┐ ┌──────────┐          │
│ │ 🔒 ETH   │ │ 🔒 100x  │          │
│ │ Denver   │ │ Network  │          │
│ │ Attend   │ │ Complete │          │
│ │ Feb 2025 │ │ ??? hrs  │          │
│ └──────────┘ └──────────┘          │
│                                     │
│ 📝 Badge Quiz:                      │
│ Answer 2/5 questions correctly about│
│ Token2049 to earn the badge!        │
│         [START QUIZ] ──────────────►│
└─────────────────────────────────────┘
```

### Badge Quiz Flow
- Triggered after event check-in
- 5 questions about the event
- Need 2/5 correct to earn SBT
- Examples:
  - "What blockchain is this event focused on?"
  - "Who is the keynote speaker on Day 2?"
  - "What year was Token2049 first held?"

### NFT Gallery
- Grid view of all owned Dynamic NFTs
- Filter by: Type, Rarity, Event origin
- Sort by: Date, Rarity, Price
- Tap to open detailed view (Tree Detail modal)

### Settings (⚙️ button)
```
┌─────────────────────────────────────┐
│ [←] Settings                        │
├─────────────────────────────────────┤
│ 🔗 CONNECTIONS                      │
│ • Wallet: 0x1234...5678 [Change]    │
│ • GitHub: @username [Connected]     │
│ • Email: user@email.com [Verify]    │
│                                     │
│ 🔔 NOTIFICATIONS                    │
│ • Plant dying alerts      [ON]      │
│ • Event nearby            [ON]      │
│ • Friend activity         [OFF]     │
│ • Mission reminders       [ON]      │
│                                     │
│ 🎨 APPEARANCE                       │
│ • Theme: Dark / Light / Auto        │
│ • Language: English                 │
│                                     │
│ 🔒 PRIVACY                          │
│ • Profile visibility: Public        │
│ • Show stats to friends: Yes        │
│                                     │
│ ℹ️ ABOUT                            │
│ • Version: 1.2.0                    │
│ • Terms of Service                  │
│ • Privacy Policy                    │
│                                     │
│ [LOGOUT]                            │
└─────────────────────────────────────┘
```

---

## 🛒 8. MARKETPLACE SCREEN

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Marketplace    🔍 [Search]      │
├─────────────────────────────────────┤
│ [BUY] [SELL] [MY LISTINGS] [HISTORY]│ Tabs
├─────────────────────────────────────┤
│ 🔥 TRENDING ITEMS                   │
│ ┌─────────────────────────────────┐│
│ │ ⭐ Epic Mushroom Seed           ││
│ │ Floor: 0.05 ETH                 ││
│ │ 24h: +15% 📈                    ││
│ │ [BUY NOW] ────────────────────► ││
│ └─────────────────────────────────┘│
│                                     │
│ 🌱 SEEDS (45 listings)              │
│ [Filter: All ▼] [Sort: Price ▼]    │
│ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │ 🌰  │ │ 🍄   │ │ ⭐   │         │
│ │Social│ │Mushro│ │Rare  │         │
│ │0.01Ξ │ │0.03Ξ │ │0.1Ξ  │         │
│ │[BUY] │ │[BUY] │ │[BUY] │         │
│ └──────┘ └──────┘ └──────┘         │
│                                     │
│ 🧪 FERTILIZERS (23 listings)        │
│ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │ ⚗️  │ │ ⚗️   │ │ ⭐   │         │
│ │Common│ │Rare  │ │Epic  │         │
│ │0.005Ξ│ │0.02Ξ │ │0.08Ξ │         │
│ │[BUY] │ │[BUY] │ │[BUY] │         │
│ └──────┘ └──────┘ └──────┘         │
│                                     │
│ 🍎 FRUITS (NFTs) (67 listings)      │
│ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │ 🍎  │ │ 🍊   │ │ ⭐   │         │
│ │#1234 │ │#0056 │ │#0003 │         │
│ │0.2Ξ  │ │0.5Ξ  │ │2.5Ξ  │         │
│ │[VIEW]│ │[VIEW]│ │[VIEW]│         │
│ └──────┘ └──────┘ └──────┘         │
└─────────────────────────────────────┘
```

### Buy Tab
- **Featured Section**
  - Trending items (24h price change)
  - New listings
  - Ending soon (auction items)

- **Category Filters**
  - Seeds (by type: Social, Tech, Mushroom, Branded)
  - Fertilizers (by rarity: Common → Mythic)
  - Fruits/NFTs (by rarity, event origin)
  - Bundles (curated packs)

- **Sorting Options**
  - Price: Low to High / High to Low
  - Recently Listed
  - Rarity
  - Popularity

- **Item Cards**
  - Image/icon
  - Name + rarity badge
  - Price (in ETH + USD equivalent)
  - Seller info (username + reputation)
  - [BUY NOW] or [PLACE BID] button

### Item Detail Modal (Marketplace)
```
┌─────────────────────────────────────┐
│ [×] EPIC MUSHROOM SEED              │
├─────────────────────────────────────┤
│       ┌─────────────────┐           │
│       │   [IMAGE/3D]    │           │
│       │   🍄 Rotating   │           │
│       └─────────────────┘           │
│                                     │
│ Epic Mushroom Seed                  │
│ ⭐⭐⭐⭐ Epic                        │
│                                     │
│ Current Price: 0.05 ETH ($125)      │
│ Floor Price: 0.04 ETH               │
│ 24h Volume: 1.2 ETH                 │
│                                     │
│ Seller: alice.eth (98% rating)      │
│ Listed: 2 hours ago                 │
│                                     │
│ Description:                        │
│ Rare mushroom seed from Token2049.  │
│ Grows 20% faster than common seeds. │
│ Has 15% chance to yield Rare Mushroom│
│                                     │
│ Properties:                         │
│ • Origin: Token2049 Singapore       │
│ • Growth Time: -20%                 │
│ • Rare Drop Rate: +15%              │
│                                     │
│      [BUY NOW for 0.05 ETH]         │
│      [MAKE OFFER]                   │
└─────────────────────────────────────┘
```

### Sell Tab
```
┌─────────────────────────────────────┐
│ 📤 LIST ITEM FOR SALE               │
├─────────────────────────────────────┤
│ 1️⃣ Select Item from Inventory       │
│ ┌─────────────────────────────────┐│
│ │ [YOUR INVENTORY ITEMS]          ││
│ │ ┌──┐ ┌──┐ ┌──┐                 ││
│ │ │🍎│ │🍄│ │⚗️│  ...            ││
│ │ └──┘ └──┘ └──┘                 ││
│ └─────────────────────────────────┘│
│                                     │
│ Selected: Epic Mushroom Seed        │
│                                     │
│ 2️⃣ Set Price                        │
│ ┌─────────────────────────────────┐│
│ │ Price: [0.05] ETH               ││
│ │ ≈ $125 USD                      ││
│ │                                 ││
│ │ Suggested: 0.04-0.06 ETH        ││
│ │ (based on recent sales)         ││
│ └─────────────────────────────────┘│
│                                     │
│ 3️⃣ Listing Type                     │
│ ○ Fixed Price                       │
│ ○ Auction (7 days)                  │
│                                     │
│ 💰 Marketplace Fee: 2.5% (0.00125 ETH)│
│ You'll receive: 0.04875 ETH         │
│                                     │
│      [LIST ITEM FOR SALE]           │
└─────────────────────────────────────┘
```

### My Listings Tab
- Active listings with edit/cancel options
- Sales history
- Offers received on your items

### Transaction History
- All marketplace transactions (buy/sell)
- Filters: Date, Type, Status
- Export to CSV

---

## ⚔️ 9. GUILD DASHBOARD (Future Feature)

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Guild: Base Builders            │
├─────────────────────────────────────┤
│ [OVERVIEW] [MEMBERS] [TREASURY]     │
│ [WARS] [CHAT]                       │
├─────────────────────────────────────┤
│ 🏰 GUILD INFO                       │
│ ┌─────────────────────────────────┐│
│ │      [GUILD BANNER]             ││
│ │   Base Builders Guild           ││
│ │   "Building the future"         ││
│ │                                 ││
│ │   👥 Members: 47/50             ││
│ │   🌳 Total Trees: 1,234         ││
│ │   🏆 Rank: #12 Global           ││
│ │   💰 Treasury: 12.5 ETH         ││
│ └─────────────────────────────────┘│
│                                     │
│ ⚔️ CURRENT GUILD WAR (LIVE)         │
│ ┌─────────────────────────────────┐│
│ │ Base Builders vs. Arbitrum Army ││
│ │                                 ││
│ │ US: 234 trees 🌳 vs 🌳 198 trees││
│ │ [██████████░░░] 54%             ││
│ │                                 ││
│ │ ⏱️ Ends in: 23h 45m              ││
│ │                                 ││
│ │ Your Contribution: 8 trees      ││
│ │ Rank in Guild: #5               ││
│ │                                 ││
│ │   [PLANT MORE] [VIEW DETAILS]   ││
│ └─────────────────────────────────┘│
│                                     │
│ 📊 TOP CONTRIBUTORS (This Week)     │
│ 1. 🥇 Alice.eth     - 23 trees      │
│ 2. 🥈 Bob.near      - 19 trees      │
│ 3. 🥉 Charlie.sol   - 15 trees      │
│ ...                                 │
│ 12. You            - 8 trees        │
└─────────────────────────────────────┘
```

### Members Tab
- List of all guild members
- Sort by: Contribution, Join date
- Member profile preview
- Invite/kick options (for admins)

### Treasury Tab
- Total guild funds (earned from wars)
- DAO governance votes
- Proposal system
- Withdrawal requests

### Guild Wars Tab
```
┌─────────────────────────────────────┐
│ ⚔️ GUILD WARS                       │
├─────────────────────────────────────┤
│ 🔴 ACTIVE WARS (1)                  │
│ [See current war above]             │
│                                     │
│ 📅 UPCOMING WARS                    │
│ ┌─────────────────────────────────┐│
│ │ Token2049 Battle                ││
│ │ Feb 28 - Mar 2                  ││
│ │ Prize Pool: 50 ETH              ││
│ │                                 ││
│ │ Registered Guilds: 24           ││
│ │          [REGISTER] ───────────►││
│ └─────────────────────────────────┘│
│                                     │
│ 🏆 PAST WARS (Victory: 3, Loss: 2)  │
│ ┌─────────────────────────────────┐│
│ │ ✓ ETHDenver Clash - Won         ││
│ │ Prize: 5 ETH (0.1 ETH per member)││
│ │ Your Trees: 12                  ││
│ │          [VIEW DETAILS] ───────►││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

## 🌱 10. ONBOARDING FLOW

### Screen 1: Welcome Animation
```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│     [SOLARPUNK ANIMATION]           │
│     🌍 Valley slowly revealed       │
│     🌳 Trees growing                │
│     ✨ Sparkles                     │
│                                     │
│        Welcome to OverGuild         │
│     "Don't just handshake,          │
│     grow your network"              │
│                                     │
│                                     │
│          [GET STARTED]              │
│                                     │
└─────────────────────────────────────┘
```

### Screen 2: Concept Explanation
```
┌─────────────────────────────────────┐
│ Step 1/4                            │
├─────────────────────────────────────┤
│                                     │
│     [ILLUSTRATION: Handshake]       │
│                                     │
│   Meet people at events and turn    │
│   every connection into a growing   │
│   tree in your digital garden.      │
│                                     │
│   🎪 Check-in → Get Seeds           │
│   💧 Network → Water Trees          │
│   🧪 Code/Learn → Fertilize         │
│   🍎 Harvest → Earn NFTs            │
│                                     │
│                                     │
│        [●○○○]      [NEXT]           │
└─────────────────────────────────────┘
```

### Screen 3: Plant First Seed Tutorial
```
┌─────────────────────────────────────┐
│ Step 2/4: Plant Your First Tree     │
├─────────────────────────────────────┤
│                                     │
│     [ANIMATED TUTORIAL]             │
│     Hand dragging seed to plot      │
│     Seed planted ✓                  │
│     Tree starts growing             │
│                                     │
│   ┌─────────────────────────────┐  │
│   │  Select a seed:             │  │
│   │  ○ 🌰 Social Seed           │  │
│   │  ○ 🌰 Tech Seed             │  │
│   │  ○ 🍄 Mushroom Seed         │  │
│   └─────────────────────────────┘  │
│                                     │
│   [SELECT] → [TAP EMPTY PLOT]       │
│         → [PLANT] ✓                 │
│                                     │
│        [●●○○]      [NEXT]           │
└─────────────────────────────────────┘
```

### Screen 4: QR Scan Practice
```
┌─────────────────────────────────────┐
│ Step 3/4: Practice Networking       │
├─────────────────────────────────────┤
│                                     │
│   Now let's water your tree!        │
│   Scan this practice QR code:       │
│                                     │
│     ┌─────────────────┐             │
│     │  [PRACTICE QR]  │             │
│     │   (Tutorial)    │             │
│     └─────────────────┘             │
│                                     │
│          [SCAN NOW]                 │
│                                     │
│   (Opens QR scanner → Success       │
│    animation → "Great job!" →       │
│    Tree receives water ✓)           │
│                                     │
│        [●●●○]      [NEXT]           │
└─────────────────────────────────────┘
```

### Screen 5: Connect Wallet
```
┌─────────────────────────────────────┐
│ Step 4/4: Connect Your Wallet       │
├─────────────────────────────────────┤
│                                     │
│   Connect your wallet to save your  │
│   progress and earn NFT rewards!    │
│                                     │
│   [METAMASK]                        │
│   [WALLET CONNECT]                  │
│   [COINBASE WALLET]                 │
│                                     │
│   Or create a new wallet:           │
│   [CREATE WALLET] (Magic Link)      │
│                                     │
│                                     │
│   [SKIP FOR NOW]                    │
│   (Can connect later in settings)   │
│                                     │
│        [●●●●]      [FINISH]         │
└─────────────────────────────────────┘
```

---

## 🌳 11. TREE DETAIL VIEW (Modal)

### Layout Structure
```
┌─────────────────────────────────────┐
│ [×] Tree #127 Details               │
├─────────────────────────────────────┤
│     ┌─────────────────────┐         │
│     │   [3D TREE MODEL]   │         │
│     │   🌳 Rotating 360°  │         │
│     │   with Gold Branch  │         │
│     └─────────────────────┘         │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 🌳 Golden Apple Tree            ││
│ │ Stage: Mature (Fruiting)        ││
│ │ Health: [████████░░] 80%        ││
│ │ Age: 14 days                    ││
│ │ Next Fruit: 2h 34m              ││
│ └─────────────────────────────────┘│
│                                     │
│ 📜 GROWTH TIMELINE                  │
│ ┌─────────────────────────────────┐│
│ │ Jan 15, 10:30 AM                ││
│ │ 🌱 Planted at Token2049 SG      ││
│ │                                 ││
│ │ Jan 16, 2:45 PM                 ││
│ │ 💧 Watered by alice.eth         ││
│ │                                 ││
│ │ Jan 17, 9:00 AM                 ││
│ │ 🧪 Fertilized with 5x GitHub    ││
│ │ 🌟 Gold Branch unlocked!        ││
│ │                                 ││
│ │ Jan 20, 3:15 PM                 ││
│ │ 🌸 Flowers bloomed              ││
│ │                                 ││
│ │ Jan 23, 11:00 AM                ││
│ │ 🍎 First fruit harvested!       ││
│ │ NFT #127 minted                 ││
│ └─────────────────────────────────┘│
│                                     │
│ 💧 WATERED BY (12 people)           │
│ alice.eth, bob.near, charlie.sol... │
│              [VIEW ALL] ───────────►│
│                                     │
│ 🧪 FERTILIZER USED                  │
│ • 5x GitHub Commits (Gold Branch)   │
│ • 2x Quiz Rewards                   │
│ • 1x Magic Fertilizer               │
│                                     │
│ 🎨 SPECIAL TRAITS                   │
│ ✨ Gold Branch (100+ commits)       │
│ 🌟 KOL Blessed (10+ connections)    │
│ 🎪 Origin: Token2049 Singapore      │
│                                     │
│ ⛓️ BLOCKCHAIN INFO                  │
│ • Chain: Arbitrum                   │
│ • Contract: 0x1234...5678           │
│ • Token ID: #127                    │
│ • Metadata: ipfs://Qm...            │
│          [VIEW ON EXPLORER] ───────►│
│                                     │
│ [💧 WATER] [🧪 FERTILIZE] [🍎 HARVEST]│
│ [SHARE] [SELL ON MARKET]            │
└─────────────────────────────────────┘
```

### 3D Model Features
- **Interactive Rotation**
  - Swipe to rotate 360°
  - Pinch to zoom
  - Gyroscope support (moves with phone tilt)

- **Dynamic Visuals**
  - Branches change color based on fertilizer type
  - Glow effect for KOL connections
  - Particle effects (sparkles, fireflies)
  - Seasonal variations (weather-dependent)

---

## ☠️ 12. DEATH/REVIVAL SCENE

### Warning Screen (< 12h remaining)
```
┌─────────────────────────────────────┐
│ ⚠️ URGENT: Plant Dying!             │
├─────────────────────────────────────┤
│                                     │
│     ┌─────────────────┐             │
│     │  [WILTING TREE] │             │
│     │   🌳 → 💀        │             │
│     │   Health: 15%   │             │
│     └─────────────────┘             │
│                                     │
│   Your tree will die in 8h 23m!     │
│                                     │
│   🌳 Golden Apple Tree #127         │
│   Age: 12 days                      │
│                                     │
│   Actions needed:                   │
│   ☐ Water (needs 1 connection)      │
│   ☐ Fertilize (optional, but helps) │
│                                     │
│   [💧 WATER NOW]                    │
│   [🧪 FERTILIZE]                    │
│                                     │
│   Can't do it now?                  │
│   [📨 SEND SOS TO FRIENDS]          │
│   (They can water your tree for you)│
│                                     │
│ ⚠️ If tree dies, it's gone forever! │
│ (Unless it already produced fruit)  │
└─────────────────────────────────────┘
```

### SOS Feature
```
┌─────────────────────────────────────┐
│ 📨 Send SOS Request                 │
├─────────────────────────────────────┤
│ Select friends to ask for help:     │
│                                     │
│ ☑ Alice.eth (Last seen: 5m ago)     │
│ ☑ Bob.near (Last seen: 2h ago)      │
│ ☐ Charlie.sol (Last seen: 1d ago)   │
│ ☑ Dave.arb (Last seen: 30m ago)     │
│                                     │
│ Message:                            │
│ ┌─────────────────────────────────┐│
│ │ Help! My tree is dying in 8h!   ││
│ │ Can you water it for me?        ││
│ │ Will return the favor! 🙏       ││
│ └─────────────────────────────────┘│
│                                     │
│       [SEND SOS TO 3 FRIENDS]       │
│                                     │
│ (They'll receive notification and   │
│  can remotely water your tree)      │
└─────────────────────────────────────┘
```

### Death Screen (Tree Died)
```
┌─────────────────────────────────────┐
│ ☠️ Your Tree Has Died               │
├─────────────────────────────────────┤
│                                     │
│     ┌─────────────────┐             │
│     │  [DEAD TREE]    │             │
│     │      💀         │             │
│     │   R.I.P.        │             │
│     └─────────────────┘             │
│                                     │
│   Golden Apple Tree #127            │
│   Lived: 12 days                    │
│   Cause: Neglect (72h+ AFK)         │
│                                     │
│   This tree has been permanently    │
│   removed from your garden.         │
│                                     │
│   📊 Final Stats:                   │
│   • Watered by: 8 people            │
│   • Fertilized: 7 times             │
│   • Fruits harvested: 2             │
│                                     │
│   💀 The tree is now burnt and      │
│   removed from the blockchain.      │
│                                     │
│   [VIEW GRAVEYARD]                  │
│   [PLANT A NEW TREE]                │
│                                     │
└─────────────────────────────────────┘
```

### Graveyard View
```
┌─────────────────────────────────────┐
│ [←] Graveyard 💀                    │
├─────────────────────────────────────┤
│ Your fallen trees (5 total)         │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 💀 Golden Apple Tree #127       ││
│ │ Died: Jan 28, 2025              ││
│ │ Age: 12 days                    ││
│ │ Cause: Neglect (72h AFK)        ││
│ │          [VIEW DETAILS] ───────►││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 💀 Tech Seed Tree #089          ││
│ │ Died: Jan 10, 2025              ││
│ │ Age: 5 days                     ││
│ │ Cause: Neglect                  ││
│ │          [VIEW DETAILS] ───────►││
│ └─────────────────────────────────┘│
│                                     │
│ 💡 Lesson: Remember to water your   │
│ trees at least once every 72 hours! │
└─────────────────────────────────────┘
```

---

## 🎰 13. GACHA/DROP SCENE

### Check-in Drop Animation
```
┌─────────────────────────────────────┐
│   EVENT CHECK-IN SUCCESSFUL! ✓      │
├─────────────────────────────────────┤
│                                     │
│     [ANIMATED CHEST OPENING]        │
│           ┌───────┐                 │
│           │ 🎁    │                 │
│           │Opening│                 │
│           └───────┘                 │
│                                     │
│     Tap to reveal your seeds!       │
│                                     │
│                                     │
│     (Tap screen)                    │
│                                     │
│                                     │
│           [TAP!]                    │
│                                     │
└─────────────────────────────────────┘
```

### Reveal Animation
```
┌─────────────────────────────────────┐
│                                     │
│         ✨ SEEDS RECEIVED! ✨        │
│                                     │
│     [CARDS FLIPPING ANIMATION]      │
│                                     │
│   ┌────┐  ┌────┐  ┌────┐           │
│   │ ?  │  │ ?  │  │ ?  │           │
│   └────┘  └────┘  └────┘           │
│                                     │
│   (Each card flips to reveal seed)  │
│                                     │
│   ┌────┐  ┌────┐  ┌────┐           │
│   │🌰  │  │🌰  │  │⭐ │           │
│   │Com │  │Com │  │RARE│           │
│   └────┘  └────┘  └────┘           │
│                                     │
│   +2 Common Social Seeds            │
│   +1 ⭐ RARE Mushroom Seed!         │
│                                     │
│          [CLAIM REWARDS]            │
│                                     │
└─────────────────────────────────────┘
```

### Rare Drop Celebration
```
┌─────────────────────────────────────┐
│                                     │
│    🎆 🎇 🎆 🎇 🎆 🎇 🎆            │
│                                     │
│      ✨ LEGENDARY DROP! ✨          │
│                                     │
│         ┌─────────┐                 │
│         │    ⭐   │                 │
│         │ 🍄 EPIC │                 │
│         │ MUSHROOM│                 │
│         │  SEED   │                 │
│         └─────────┘                 │
│                                     │
│   Congratulations! You received     │
│   an EPIC Mushroom Seed!            │
│                                     │
│   This seed has:                    │
│   • -30% growth time                │
│   • +25% rare mushroom drop rate    │
│   • Special gold glow effect        │
│                                     │
│   Only 0.5% drop chance! 🎰         │
│                                     │
│   [PLANT NOW] [SAVE FOR LATER]      │
│                                     │
│    🎆 🎇 🎆 🎇 🎆 🎇 🎆            │
│                                     │
└─────────────────────────────────────┘
```

### Multi-Drop Feature
```
┌─────────────────────────────────────┐
│ 🎁 Reward Pack Opening              │
├─────────────────────────────────────┤
│ You have: 10 reward packs           │
│                                     │
│ ○ Open 1 pack                       │
│ ○ Open 5 packs (faster animation)   │
│ ● Open 10 packs (skip animation)    │
│                                     │
│       [OPEN SELECTED PACKS]         │
│                                     │
│ ───────────────────────────────────│
│                                     │
│ Results (after opening 10):         │
│                                     │
│ 🌰 Common Social Seeds: 8           │
│ 🌰 Common Tech Seeds: 6             │
│ 🍄 Uncommon Mushroom Seeds: 3       │
│ ⭐ Rare Brand Seeds: 1              │
│ 💎 EPIC Mushroom Seed: 1! 🎉        │
│                                     │
│ Total value: ~0.15 ETH              │
│                                     │
│ [ADD TO INVENTORY] [OPEN MORE]      │
│                                     │
└─────────────────────────────────────┘
```

---

## 🏆 14. LEADERBOARD & SOCIAL FEED

### Layout Structure
```
┌─────────────────────────────────────┐
│ [←] Leaderboard    [FRIENDS] [🔍]   │
├─────────────────────────────────────┤
│ [GLOBAL] [EVENT] [GUILD] [FRIENDS]  │ Tabs
├─────────────────────────────────────┤
│ 🏆 GLOBAL RANKING                   │
│ Filter: [All Time ▼] [Trees Grown ▼]│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 1. 🥇 Alice.eth                 ││
│ │    🌳 1,234 trees | LV 45       ││
│ │    🏢 Guild: Base Builders      ││
│ │    [VIEW PROFILE] ─────────────►││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 2. 🥈 Bob.near                  ││
│ │    🌳 1,187 trees | LV 43       ││
│ │    🏢 Guild: Near Natives       ││
│ │    [VIEW PROFILE] ─────────────►││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 3. 🥉 Charlie.sol               ││
│ │    🌳 1,089 trees | LV 41       ││
│ │    🏢 Guild: Solana Squad       ││
│ │    [VIEW PROFILE] ─────────────►││
│ └─────────────────────────────────┘│
│ ...                                 │
│ ┌─────────────────────────────────┐│
│ │ 127. You                        ││
│ │    🌳 47 trees | LV 12          ││
│ │    🏢 Guild: Base Builders      ││
│ │    [VIEW MY PROFILE] ──────────►││
│ └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Global Tab
- **Ranking Metrics**
  - Total Trees Grown
  - Total Fruits Harvested
  - Total Events Attended
  - Total Network Connections
  - Guild War Victories

- **Time Filters**
  - All Time
  - This Month
  - This Week
  - Today

- **User Card**
  - Rank + Medal (🥇🥈🥉)
  - Username + Avatar
  - Key stats
  - Guild affiliation
  - [VIEW PROFILE] button

### Event Tab
```
┌─────────────────────────────────────┐
│ 🎪 EVENT LEADERBOARD                │
│ Event: Token2049 Singapore          │
│ Time: Jan 15-17, 2025               │
│                                     │
│ 🏆 TOP CHECK-INS                    │
│ 1. 🥇 Alice.eth     - 45 check-ins  │
│ 2. 🥈 Bob.near      - 42 check-ins  │
│ 3. 🥉 Charlie.sol   - 38 check-ins  │
│ ...                                 │
│ 127. You           - 12 check-ins   │
│                                     │
│ 🏆 TOP NETWORKERS                   │
│ 1. 🥇 Dave.arb      - 234 scans     │
│ 2. 🥈 Eve.eth       - 198 scans     │
│ 3. 🥉 Frank.matic   - 176 scans     │
│ ...                                 │
│ 45. You            - 23 scans       │
│                                     │
│ 🏆 TOP TREES PLANTED                │
│ 1. 🥇 Alice.eth     - 18 trees      │
│ 2. 🥈 George.sol    - 15 trees      │
│ 3. 🥉 Helen.near    - 14 trees      │
│ ...                                 │
│ 89. You            - 5 trees        │
└─────────────────────────────────────┘
```

### Guild Tab
- Guild rankings (by total trees, treasury, war victories)
- See your guild's rank
- Compare with rival guilds

### Friends Tab
```
┌─────────────────────────────────────┐
│ 👥 FRIENDS ACTIVITY                 │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Alice.eth • 5 mins ago          ││
│ │ 🍎 Harvested Epic Apple #1234   ││
│ │ 💬 "My first epic!" [LIKE] [💬] ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Bob.near • 1 hour ago           ││
│ │ 🎪 Checked in at ETHDenver      ││
│ │ 💬 "Let's connect!" [LIKE] [💬] ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Charlie.sol • 3 hours ago       ││
│ │ 🏆 Reached Level 20!            ││
│ │ 💬 23 likes [LIKE] [💬]         ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Dave.arb • 1 day ago            ││
│ │ ⚔️ Guild won the Token2049 War! ││
│ │ 💬 "GG team!" [LIKE] [💬]       ││
│ └─────────────────────────────────┘│
│                                     │
│ [POST UPDATE] [ADD FRIENDS]         │
└─────────────────────────────────────┘
```

### Social Feed Features
- Post updates (text + images)
- Like and comment
- Share tree/fruit achievements
- Tag friends
- Event announcements

---

## 🎨 UI/UX DESIGN GUIDELINES

### Color Palette (Solarpunk Theme)
```
Primary Colors:
- Green: #2ECC71 (Nature, Growth)
- Gold: #F39C12 (Rewards, Premium)
- Sky Blue: #3498DB (Tech, Clarity)

Secondary Colors:
- Leaf Green: #27AE60
- Sunset Orange: #E67E22
- Earth Brown: #8B4513

Background:
- Light: #F8F9FA
- Dark: #1E1E1E

Rarity Colors:
- Common: #9E9E9E (Gray)
- Uncommon: #4CAF50 (Green)
- Rare: #2196F3 (Blue)
- Epic: #9C27B0 (Purple)
- Legendary: #FF9800 (Orange)
- Mythic: #E91E63 (Pink/Red)
```

### Typography
```
Headers: Poppins (Bold, 24-32px)
Body: Inter (Regular, 14-16px)
Monospace (for addresses): Fira Code
```

### Animation Principles
1. **Micro-interactions**
   - Button press: Scale 0.95 + haptic
   - Plant growth: Smooth 2s ease-in-out
   - Page transitions: Slide 300ms

2. **Loading States**
   - Skeleton screens (no spinners)
   - Progressive image loading
   - Shimmer effects for cards

3. **Celebratory Moments**
   - Confetti for achievements
   - Sparkles for rare drops
   - Screen shake for warnings

### Accessibility
- **Font Sizes**: Minimum 14px, scalable up to 200%
- **Contrast**: WCAG AA compliant (4.5:1 ratio)
- **Touch Targets**: Minimum 44x44px
- **Screen Readers**: Full ARIA support
- **Color Blindness**: Icons + text labels (not just color)

### Mobile-First Design
- Bottom navigation (thumb-friendly)
- Swipe gestures (back, refresh, navigate)
- Pull-to-refresh on scrollable lists
- Modal sheets instead of full-screen popups

---

## 📐 TECHNICAL SPECIFICATIONS

### Screen Sizes Support
```
Mobile:
- iPhone SE: 375x667 (minimum)
- iPhone 12/13/14: 390x844
- iPhone 14 Pro Max: 430x932
- Android: 360x640 (minimum)

Tablet (Future):
- iPad: 768x1024
- iPad Pro: 1024x1366
```

### Performance Targets
- **Initial Load**: < 2s
- **Page Transitions**: < 300ms
- **API Calls**: < 500ms
- **Blockchain Reads**: < 1s
- **Blockchain Writes**: < 5s (with loading state)

### Offline Support
- Cache last known garden state
- Queue actions when offline (sync when online)
- Show offline indicator
- Local storage for temporary data

---

## 🚀 IMPLEMENTATION PRIORITIES

### Phase 1: MVP (The Garden)
1. ✅ Home Garden Screen
2. ✅ Event Check-in Screen
3. ✅ Networking/QR Scanner
4. ✅ Inventory & Harvest
5. ✅ Profile & Stats
6. ✅ Onboarding Flow

### Phase 2: Social Features (The Village)
7. ✅ Mission Board
8. ✅ Leaderboard & Social Feed
9. ✅ Marketplace
10. ✅ Builder's Lab (GitHub + Quiz)

### Phase 3: Advanced (The Valley)
11. ⏳ Guild Dashboard & Wars
12. ⏳ Advanced Analytics
13. ⏳ Pet System (Future)
14. ⏳ Mobile App Optimization

---

## 📝 NOTES FOR DEVELOPERS

### Component Reusability
- Create shared components:
  - `Card` (for missions, events, items)
  - `ProgressBar` (for XP, health, missions)
  - `Button` (primary, secondary, disabled states)
  - `Modal` (for detail views)
  - `ItemIcon` (with rarity badges)

### State Management
- Use Redux/Zustand for global state
- React Query for API/blockchain data
- Context for theme/user preferences

### Navigation
- Bottom Tab Navigator (5 main sections)
- Stack Navigator within each tab
- Modal Stack for overlays

### Blockchain Integration
- Wagmi/Ethers.js for wallet connection
- TheGraph for data indexing
- IPFS for metadata storage

---

## ✅ DESIGN CHECKLIST

- [x] All core screens designed
- [x] Navigation flow defined
- [x] UI components specified
- [x] Animations documented
- [x] Accessibility considered
- [x] Mobile-first approach
- [x] Performance targets set
- [x] Technical specs included
- [x] Implementation phases planned

---

**This design document provides a comprehensive blueprint for implementing OverGuild's game screens. All designs follow the Solarpunk aesthetic and Meet-to-Earn mechanics outlined in the proposal.**

**Next Steps**:
1. Create high-fidelity mockups in Figma
2. Develop component library
3. Implement MVP screens (Phase 1)
4. User testing & iteration
