# Fog of War Monopoly

A real-time multiplayer implementation of the classic property trading board game, featuring a unique "Fog of War" mechanic where property tiles remain hidden until players land on them. Built with Next.js, Supabase Realtime, and PostgreSQL.

---

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running the Application](#running-the-application)
- [How to Play](#how-to-play)
- [Game Mechanics](#game-mechanics)
- [Tech Stack](#tech-stack)
- [Performance](#performance)

---

## Features

- **Fog of War**: All properties start face-down. They are only revealed when a player lands on them, introducing strategic uncertainty.
- **Real-Time Multiplayer**: All game actions (dice rolls, purchases, trades) are synchronized instantly across all connected clients via WebSocket channels.
- **Interactive Trading**: Players can initiate direct negotiations, selecting properties and cash to exchange with atomic dual-confirmation.
- **Bank Loan System**: A two-tier lending system with Normal Loans and Bankruptcy Loans, each with distinct interest rates and repayment deadlines.
- **Auction System**: When a player passes on an unowned property, a live bidding war can begin among all remaining players.
- **3D Dice Animation**: Dice rolls are rendered with CSS 3D transforms and synchronized across all clients.
- **Optimistic UI**: All player actions produce instant visual feedback before server confirmation, masking network latency entirely.

---

## Getting Started

### Prerequisites

Ensure the following are installed on your system:

- **Node.js** v18.0 or higher
- **npm** v9.0 or higher
- **PostgreSQL** database (local instance or hosted service such as Supabase, Neon, or Railway)
- **Supabase project** (for Realtime WebSocket channels)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Pratyush017/Fog-Of-War-Monopoly.git
cd Fog-Of-War-Monopoly
npm install
```

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
```

- `DATABASE_URL`: Your PostgreSQL connection string. If using Supabase, this is found under Project Settings > Database.
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: The public anonymous key from your Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY`: The service role key for server-side Supabase operations.

### Database Setup

Generate the Prisma client and push the schema to your database:

```bash
npx prisma generate
npx prisma db push
```

To seed the database with initial data (optional):

```bash
npx prisma db seed
```

### Running the Application

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

---

## How to Play

### Creating a Game

1. Open the application in your browser.
2. Enter your display name and click **Create Game**.
3. You will be taken to a lobby screen. Share the displayed room code with other players.

### Joining a Game

1. Open the application in your browser.
2. Enter your display name and the room code provided by the host.
3. Click **Join Game** to enter the lobby.

### In the Lobby

- The host can configure game settings such as starting cash, turn timers, and pass-up rules (auction vs. keep hidden).
- Each player can select their avatar and country flag.
- Once all players are ready, the host clicks **Start Game**.

### During the Game

1. **Roll Dice**: On your turn, click the Roll Dice button. Your token will automatically move to the corresponding tile.
2. **Buy Property**: When landing on an unrevealed property, you will be prompted to purchase it. Buying reveals the property to all players.
3. **Pass or Auction**: If you choose not to buy, the property either stays hidden or goes to auction depending on the lobby settings.
4. **Pay Rent**: Landing on another player's revealed property automatically deducts rent from your balance.
5. **Build Houses and Hotels**: Open the Property Stat Window by clicking a tile you own, then use the build controls to add houses (up to a hotel at 5 buildings).
6. **Mortgage Properties**: If you need cash, mortgage your properties through the Property Stat Window to receive their mortgage value.
7. **Trade**: Click the Trade button in the sidebar to open negotiations with another player. Both sides can offer properties and cash.
8. **Bank Loans**: Click the Bank button to take out a loan. Be mindful of the repayment deadline or you will enter liquidation.
9. **Jail**: If you land on "Go To Jail" or draw a jail card, you are sent to the Jail corner. You can pay bail or attempt to roll doubles to escape.
10. **End Turn**: After completing your actions, click End Turn to pass play to the next player.
11. **Winning**: The last player remaining who has not gone bankrupt wins the game.

---

## Game Mechanics

### Fog of War

All property tiles begin face-down on the board. When a player lands on a hidden tile, only they see its details and receive the option to purchase it. If purchased, the tile is revealed to everyone. If passed, it remains hidden (or triggers an auction, depending on the game settings).

### Economy and Loans

- **Normal Loans**: Available when your net worth exceeds the loan principal. Carries standard interest and a fixed turn deadline for repayment.
- **Bankruptcy Loans**: A last-resort option for players who reach zero or negative cash. Carries significantly higher interest rates.
- **Liquidation**: Failure to repay a loan by the deadline triggers forced liquidation, where the player must mortgage properties to cover the debt or face elimination.

### Chance and Community Chest

Landing on Chance or Community Chest tiles draws a random card with effects ranging from cash gains, cash losses, movement to specific board positions, or being sent directly to Jail.

### Trading Restrictions

Players with outstanding loan obligations cannot offer properties in trades (only cash), preventing exploitation of the loan system.

---

## Tech Stack

| Layer            | Technology                          |
| ---------------- | ----------------------------------- |
| Framework        | Next.js 16 (App Router)             |
| Language         | TypeScript                          |
| State Management | Zustand                             |
| Database         | PostgreSQL with Prisma ORM          |
| Real-Time Sync   | Supabase Realtime Channels          |
| Styling          | Tailwind CSS v4                     |

---

## Performance

The application is heavily optimized for a smooth 60fps experience:

- **GPU-Accelerated Token Movement**: Player tokens are positioned with CSS `transform: translate()` and `will-change: transform`, eliminating layout thrashing from JavaScript-driven positioning.
- **Aggressive Memoization**: All 40 tile components and player tokens use `React.memo()` to prevent unnecessary re-renders.
- **Zustand State Slicing**: Components subscribe only to the exact slice of state they depend on, avoiding cascading re-renders.
- **Optimistic UI Updates**: Actions like dice rolls, property purchases, jail decisions, and Chance/Chest card reveals produce immediate visual feedback before server confirmation completes.
- **Atomic Transactions**: Sensitive operations such as trading and purchasing are wrapped in Prisma `$transaction` blocks to prevent race conditions.
