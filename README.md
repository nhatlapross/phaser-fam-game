# FAM Game

A blockchain-integrated farming and social game built with Phaser 3, Next.js, and Web3 technologies. Players manage virtual farms, interact in shared social spaces, raise pets, collect NFTs, and earn real rewards.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Game Scenes](#game-scenes)
- [Architecture](#architecture)
- [Web3 Integration](#web3-integration)
- [Mini-Games](#mini-games)

---

## Features

### Farming System
- Plant, water, and harvest 3 crop types: **Algae**, **Mushroom**, **Tree**
- 6-stage growth lifecycle: Digging → Seed → Sprout → Growing → Bloom → Mature
- Plant health/hydration system with configurable death timer
- Fertilizer types: Common, Rare, Epic, Legendary
- Expandable farm plots (2 initial, up to 16)
- Smart garden refresh — API only called when growth changes are expected

### Social & Multiplayer
- **Town Square** — shared public space with real-time multiplayer via WebSocket
- Live chat with speech bubbles above player characters
- See other players moving around the map in real time
- Multiple playable characters with customizable appearance

### Economy & Rewards
- In-game currencies: **Gold** and **Gems**
- Daily check-in streaks with escalating rewards
- Mission system with objectives and redemption codes
- **Phygital Exchange** — trade harvested fruits for real-world prizes:
  - Tote bags, lottery tickets, Razer headsets, $300 vouchers, gold bars, iPhones, Seed NFTs
- Shop with seeds, tools, and items (Gold / Gem / Cash pricing)
- Factory system — convert fruits into fertilizers

### Web3 & NFT
- Multi-chain wallet support (EVM + ImmutableX)
- NFT voucher system
- NFT minting integration (CyberCat Lucky Box, FriendCards)
- In-game chain switcher for multi-network support
- Privy authentication (social login + embedded wallets)

### Pets & Companions
- Pet adoption and management system
- Pet farm with dedicated manager
- AI-powered pet chat (Google Gemini)

### Content Features
- **Manga Studio** — create and view manga panels
- **Quiz System** — in-game knowledge quizzes with rewards
- **Horoscope Modal** — daily horoscope readings
- **Tarot Modal** — AI-powered tarot card readings
- **DeFi Master Modal** — DeFi education content
- **Event System** — time-limited events with special rewards

### Game World
- Tile-based maps (50x50 tiles, 16px each)
- Anywhere Door — NFT-gated fast travel between locations
- Station system for navigating between scenes
- Portrait and landscape mode support with CSS rotation

---

## Tech Stack

| Category | Technology |
|---|---|
| Game Engine | Phaser 3.90 |
| Framework | Next.js 15 + React 19 |
| Language | TypeScript 5 |
| State Management | phaser-hooks 0.7 |
| Wallet / Auth | Privy, wagmi 2, viem 2 |
| Multi-chain UI | ReOwn AppKit |
| NFT (ImmutableX) | @imtbl/sdk |
| Real-time | socket.io-client 4 |
| AI | Google Gemini (@google/genai) |
| UI Plugins | phaser3-rex-plugins |
| Bundler | Vite (via Next.js) |

---

## Project Structure

```
src/
├── game/
│   ├── scenes/                    # Phaser scenes
│   │   ├── FarmingGame.ts         # Main farming scene (orchestrator)
│   │   ├── TownSquare.ts          # Multiplayer social scene
│   │   ├── HomeGarden.ts          # Personal garden scene
│   │   ├── ClassRoom.ts           # Classroom / education scene
│   │   ├── Networking.ts          # Networking map scene
│   │   ├── MapSelection.ts        # World map selection
│   │   ├── GameLoader.ts          # Scene loader / transition
│   │   ├── Preloader.ts           # Asset preloading with progress bar
│   │   ├── Login.ts               # Login scene
│   │   ├── SetupProfile.ts        # Profile setup scene
│   │   └── MainMenu.ts            # Main menu
│   ├── managers/                  # Game system managers (all extend BaseManager)
│   │   ├── BaseManager.ts         # Abstract base class
│   │   ├── CheckinManager.ts      # Daily check-in system
│   │   ├── ShopManager.ts         # Shop and purchases
│   │   ├── FactoryManager.ts      # Fruit-to-fertilizer conversion
│   │   ├── WarehouseManager.ts    # Inventory storage
│   │   ├── MailboxManager.ts      # Missions and redeem codes
│   │   ├── ProfileManager.ts      # User profile and wallet display
│   │   ├── ToolbarManager.ts      # Toolbar and item selection
│   │   ├── PlotManager.ts         # Farm plot management
│   │   ├── WellManager.ts         # Water well system
│   │   ├── PlantDetailManager.ts  # Plant info popup
│   │   ├── StationManager.ts      # Scene navigation / travel
│   │   ├── PetManager.ts          # Pet companion system
│   │   ├── PetFarmManager.ts      # Pet farm management
│   │   ├── MissionManager.ts      # Mission objectives
│   │   ├── QuizManager.ts         # Quiz minigame
│   │   ├── EventModalManager.ts   # Time-limited events
│   │   ├── GameHouseManager.ts    # Game house interactions
│   │   ├── MangaStudioManager.ts  # Manga creation system
│   │   ├── AnywhereDoorManager.ts # Fast travel system
│   │   ├── ChainSwitcherManager.ts# Blockchain network switcher
│   │   ├── NFTVoucherManager.ts   # NFT voucher handling
│   │   ├── SoundManager.ts        # Audio management
│   │   ├── FloatingButtonsManager.ts # Floating UI buttons
│   │   ├── QuickActionsManager.ts # Quick action shortcuts
│   │   ├── WelcomeManager.ts      # New user onboarding
│   │   └── index.ts               # Barrel exports
│   ├── hooks/
│   │   ├── useGameState.ts        # Global game state (single source of truth)
│   │   └── usePlantUpdates.ts     # Real-time plant update hook
│   ├── types/
│   │   ├── GameTypes.ts           # Shared types, interfaces, constants
│   │   ├── ChatTypes.ts           # Chat / socket message types
│   │   └── LobbyTypes.ts          # Multiplayer lobby types
│   ├── ui/                        # Reusable Phaser UI components
│   │   ├── PhaserButton.ts        # Phaser-native button component
│   │   ├── HoroscopeModal.ts      # Horoscope reading UI
│   │   ├── TarotModal.ts          # Tarot card reading UI
│   │   ├── DefiMasterModal.ts     # DeFi education UI
│   │   └── PetChatModal.ts        # AI pet chat UI
│   ├── utils/
│   │   ├── ScreenUtils.ts         # Screen / scaling utilities
│   │   ├── GameCache.ts           # In-memory cache helpers
│   │   └── AccessKeyUtils.ts      # Access key validation
│   ├── objects/
│   │   └── DynamicShadow.ts       # Player shadow game object
│   ├── *Service.ts                # API service layer
│   ├── *SocketService.ts          # WebSocket services
│   ├── GameDataService.ts         # Centralized data fetching and caching
│   └── main.ts                    # Phaser game config entry point
├── components/
│   ├── Web3Provider.tsx           # wagmi / viem provider
│   ├── PassportProvider.tsx       # Privy auth provider
│   ├── MangaStudioOverlay.tsx     # Manga studio React overlay
│   ├── MiniGameOverlay.tsx        # Mini-game React overlay
│   ├── RotateDeviceOverlay.tsx    # Portrait mode prompt
│   └── Games/                    # Mini-games (Snake, Tetris, Minesweeper, BrickBreaker)
├── pages/
│   ├── index.tsx                  # Main entry page
│   ├── _app.tsx                   # App wrapper with providers
│   └── redirect.tsx               # Auth redirect handler
├── config/
│   ├── wagmi.ts                   # Wagmi chain configuration
│   ├── privy.ts                   # Privy configuration
│   └── passport.ts                # Immutable Passport configuration
└── services/
    ├── geminiService.ts           # Google Gemini AI service
    ├── ipfsService.ts             # IPFS upload service
    └── shelbyService.ts           # Shelby Protocol service
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
git clone <repo-url>
cd phaser-fam-game
npm install
```

### Development

```bash
npm run dev
```

Opens at [http://localhost:8080](http://localhost:8080). Next.js hot-reloads on file changes.

### Production Build

```bash
npm run build
```

### Without Phaser telemetry

```bash
npm run dev-nolog     # development
npm run build-nolog   # production
```

---

## Environment Variables

Create a `.env.local` file in the root:

```env
# Game
NEXT_PUBLIC_DEATH_TIMER_MS=300000         # Plant death timer in ms
                                          # Default: 300000 (5 min, demo)
                                          # Production: 259200000 (72 hours)

# API
NEXT_PUBLIC_API_URL=                      # Backend API base URL

# Auth
NEXT_PUBLIC_PRIVY_APP_ID=                # Privy app ID

# Web3
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=    # ReOwn / WalletConnect project ID

# AI
GOOGLE_GENAI_API_KEY=                    # Google Gemini API key

# NFT / Blockchain
NEXT_PUBLIC_CONTRACT_ADDRESS=            # Main smart contract address
NEXT_PUBLIC_IMMUTABLE_ENV=               # Immutable environment: sandbox | production
```

---

## Game Scenes

| Scene | Description |
|---|---|
| `Boot` | Initial boot, loads minimal assets |
| `Preloader` | Asset loading with progress bar |
| `Login` | Authentication screen |
| `SetupProfile` | New user profile creation |
| `MainMenu` | Main menu hub |
| `MapSelection` | World map for choosing destination |
| `FarmingGame` | Personal farming island — main gameplay |
| `TownSquare` | Multiplayer social hub |
| `HomeGarden` | Personal garden space |
| `ClassRoom` | Education / classroom environment |
| `Networking` | Networking event map |
| `ProfileScene` | User profile view |
| `GameLoader` | Scene transition handler |

---

## Architecture

### Manager Pattern

All game systems are encapsulated in **Managers** that extend `BaseManager`. Managers communicate with the scene through typed **callback interfaces**, keeping `FarmingGame.ts` as a thin orchestrator.

```typescript
export class MyManager extends BaseManager {
    constructor(scene: Phaser.Scene, callbacks: MyCallbacks) {
        super(scene);
    }
}

interface MyCallbacks {
    getPlayerGold: () => number;
    setPlayerGold: (value: number) => void;
    showToastMessage: (text: string, color: number) => void;
}
```

### Global State

`useGameState(scene)` provides a singleton state store (via phaser-hooks) that is the **single source of truth** for currencies, seeds, fertilizers, and inventory. All UI auto-updates when state changes.

```typescript
const gameState = useGameState(this.scene);
gameState.setGold(100);     // UI updates automatically
gameState.addGold(50);
gameState.spendGold(25);    // Returns false if insufficient
```

### Data Flow

1. **Game start** — `GameDataService.fetchAllGameData()` pre-fetches all data
2. **Modals open** — read from cache instantly (no API lag)
3. **User actions** — optimistic UI update → API call → sync or rollback on failure
4. **After actions** — `GameDataService.refreshAndUpdateUI()` syncs cache

### Optimistic Updates

```typescript
const prev = gameState.getGold();
gameState.setGold(prev - item.price);  // instant feedback

ShopService.buy(item).then(result => {
    if (result.success) {
        gameState.setGold(result.balanceGold);  // sync with server
    } else {
        gameState.setGold(prev);  // rollback
    }
});
```

### Depth Layers (Phaser)

| Range | Usage |
|---|---|
| 0–999 | Ground / terrain |
| 1000–4999 | Game objects (player, plants) |
| 5000–5099 | UI backgrounds |
| 5100–5199 | UI elements |
| 5200–5299 | Modal backgrounds |
| 5300–5399 | Modal elements |
| 5400+ | Overlays and popups |

### Camera System

- **Main camera** — follows player, 3x zoom
- **UI camera** — fixed at (0,0), no zoom, renders all HUD elements
- All UI elements must call `this.scene.cameras.main.ignore(element)`

---

## Web3 Integration

### Authentication
- **Privy** — social login (Google, Twitter, email) + embedded EVM wallets
- **Immutable Passport** — Web3 gaming identity for ImmutableX

### Wallets
- **wagmi + viem** — EVM wallet connection and transactions
- **ReOwn AppKit** — multi-chain wallet connect UI
- **ChainSwitcherManager** — in-game network switching between supported chains

### NFTs
- **NFTVoucherManager** — display and manage NFT vouchers in-game
- **AnywhereDoorManager** — NFT-gated fast travel between maps
- ImmutableX (zkEVM) support for gas-free NFT minting

---

## Mini-Games

Accessible from the Game House in Town Square, rendered as React overlays on top of the Phaser canvas:

| Game | Description |
|---|---|
| Snake | Classic snake |
| Tetris | Classic block stacking |
| Minesweeper | Classic mine avoidance |
| Brick Breaker | Classic brick breaking |

---

## Portrait Mode Support

The game supports mobile portrait mode via CSS rotation of the game container (`#app`) by 90 degrees clockwise. Key implementation points:

- `transformPointer` in `PhaserGame.tsx` remaps touch/mouse coordinates after rotation
- Use `PhaserButton` (Phaser-native) instead of HTML/React buttons inside the game scene
- HTML inputs require coordinate transformation using canvas `getBoundingClientRect()` and scale factors
- All pointer event coordinates are remapped: screen Y → game X, screen X (inverted) → game Y
