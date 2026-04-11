# RecurFi — Smart DCA Agent (Onchain)

> Fully onchain dollar-cost averaging — autonomous, transparent, verifiable.
> Built on **X Layer** with **OKX Onchain OS** & **Uniswap** routing.

---

## Project Introduction

**RecurFi** is an autonomous DCA (Dollar-Cost Averaging) agent on X Layer. Users deposit tokens into an onchain vault, configure a strategy (token pair, amount, interval), and the **Agentic Wallet** automatically executes recurring swaps via OKX DEX — no manual intervention needed.

The Agentic Wallet is a dedicated EOA that serves as the project's onchain identity. It pulls tokens from the vault, swaps via OKX Onchain OS DEX Aggregator (which routes through Uniswap and other DEXes on X Layer), and deposits the output back into the vault — all autonomously.

### Why RecurFi?

- **Truly Autonomous**: A keeper process monitors all strategies and auto-executes swaps when cooldowns expire — users set it and forget it.
- **Agentic Wallet**: A dedicated EOA acts as the project's onchain identity, executing all swaps on behalf of users.
- **Best Execution**: OKX Onchain OS DEX Aggregator finds optimal routing across Uniswap pools and other DEXes on X Layer.
- **Fully Verifiable**: Every deposit, strategy change, swap execution, and withdrawal emits onchain events.
- **Swap Back**: Users can swap DCA output tokens (e.g. WOKB) back to USDC at any time through the Agentic Wallet.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (Next.js on Vercel)            │
│   Dashboard │ Strategy │ Execute │ Swap │ History        │
│   wagmi + viem + RainbowKit                              │
└────────┬───────────────────────┬────────────────────────┘
         │ Contract Reads        │ /api/execute + /api/dex
         │ (wagmi hooks)         │ (server-side OKX signing)
         ▼                       ▼
┌──────────────────┐    ┌──────────────────────────────────┐
│  DCA Agent Vault  │    │  Agentic Wallet (EOA)            │
│  (Smart Contract) │◄──►│  Executes swaps via OKX DEX      │
│                   │    │  Auto-triggered by Keeper         │
│  • deposit()      │    └──────────┬───────────────────────┘
│  • setStrategy()  │               │
│  • withdraw()     │               ▼
│  • pullTokens()   │    ┌──────────────────────────────────┐
│  • creditUser()   │    │  OKX Onchain OS                  │
│  • completeDCA()  │    │  DEX Aggregator API              │
│  • canExecute()   │    │  → Routes through Uniswap,       │
└──────────────────┘    │    and other X Layer DEXes        │
                         └──────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│  DCA Keeper (Node.js on Railway)                         │
│  Runs 24/7 — checks every 30s — auto-executes DCA       │
│  for all users when cooldown expires                     │
└──────────────────────────────────────────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **DCA Agent Vault** (Solidity) | Onchain vault that holds user deposits, stores strategies, tracks balances, and enforces DCA rules (cooldown, amounts) |
| **Agentic Wallet** (EOA) | Dedicated wallet that serves as the project's onchain identity. Pulls tokens from vault, executes swaps via OKX DEX, deposits output back to vault |
| **DCA Keeper** (Node.js) | Background process that monitors all active strategies and auto-triggers the Agentic Wallet to execute DCA when cooldowns expire |
| **Next.js Frontend** | Dashboard, strategy setup, manual execute, swap-back, transaction history |
| **API Routes** | `/api/dex` — server-side OKX API signing for quotes. `/api/execute` — triggers Agentic Wallet to execute DCA or swap-back |

### Agent Roles

| Agent | Address | Role |
|-------|---------|------|
| **Agentic Wallet** | `<AGENTIC_WALLET_ADDRESS>` | Onchain identity — executes all swaps, holds tokens transiently during swap execution |
| **DCA Keeper** | Backend process | Monitors strategies, triggers Agentic Wallet when cooldown expires |

---

## Deployment Addresses

| Contract / Agent | Address | Network |
|------------------|---------|---------|
| DCA Agent Vault | `<DEPLOYED_ADDRESS>` | X Layer (196) |
| Agentic Wallet (EOA) | `<AGENTIC_WALLET_ADDRESS>` | X Layer (196) |
| OKX DEX Approve Proxy | `0x8b773d83bc66be128c60e07e17c8901f7a64f000` | X Layer (196) |
| OKX DEX Swap Router | `0xD1b8997AaC08c619d40Be2e4284c9C72cAB33954` | X Layer (196) |

---

## Onchain OS / Uniswap Skill Usage

### OKX Onchain OS Skills Used

1. **okx-dex-swap** — Core skill. The Agentic Wallet uses the OKX DEX Aggregator API (`/api/v6/dex/aggregator/swap`) to get optimal swap calldata. The API finds the best route across all DEXes on X Layer (including Uniswap pools) and returns transaction data that the Agentic Wallet executes directly.

2. **okx-dex-market (quote)** — Used to display estimated output amounts on the Execute and Swap pages before the user confirms.

3. **Agentic Wallet** — A dedicated EOA serves as the project's Agentic Wallet / onchain identity. It:
   - Pulls user tokens from the vault contract
   - Approves the OKX DEX approve proxy to spend tokens
   - Executes swaps via the OKX DEX router
   - Transfers output tokens back to the vault
   - Credits user balances via the vault contract
   - Operates autonomously via the DCA Keeper

### Uniswap Integration

The OKX DEX Aggregator routes swaps through **Uniswap V3 pools** deployed on X Layer as part of its liquidity aggregation. The aggregator automatically finds the best route which may include single-hop or multi-hop paths through Uniswap and other DEX sources on X Layer.

---

## Working Mechanics

### DCA Execute Flow (Automated)

```
1. User deposits USDC into DCA Agent Vault (onchain)
2. User sets strategy: USDC → WOKB, 0.10 USDC per exec, every 1 hour
3. DCA Keeper (runs 24/7) detects new strategy via StrategySet event
4. Every 30 seconds, Keeper checks canExecute() for all users
5. When cooldown expires:
   a. Keeper triggers Agentic Wallet
   b. Agentic Wallet calls pullTokensForSwap() → vault sends USDC to Agentic Wallet
   c. Agentic Wallet approves OKX DEX approve proxy (if needed)
   d. Agentic Wallet fetches optimal swap route from OKX DEX API
   e. Agentic Wallet executes swap → receives WOKB
   f. Agentic Wallet transfers WOKB back to vault
   g. Agentic Wallet calls completeDCA() → vault credits user's WOKB balance
   h. DCAExecuted event emitted onchain
6. Repeat from step 5 until strategy is cancelled or balance runs out
```

### Swap-Back Flow (User-Triggered)

```
1. User goes to Swap page, selects WOKB → USDC
2. Frontend calls /api/execute with action="swap"
3. Agentic Wallet calls pullTokens() → vault sends WOKB to Agentic Wallet
4. Agentic Wallet swaps WOKB → USDC via OKX DEX
5. Agentic Wallet transfers USDC back to vault
6. Agentic Wallet calls creditUser() → vault credits user's USDC balance
7. User can withdraw USDC to their wallet anytime
```

### Vault Contract Functions

| Function | Caller | Description |
|----------|--------|-------------|
| `deposit(token, amount)` | User | Deposit ERC-20 tokens into vault |
| `depositNative()` | User | Deposit native OKB |
| `withdraw(token, amount)` | User | Withdraw tokens to user wallet |
| `setStrategy(...)` | User | Set DCA strategy (token pair, amount, interval) |
| `cancelStrategy()` | User | Cancel active strategy |
| `pullTokensForSwap(user)` | Agentic Wallet | Pull strategy tokens from vault for DCA swap |
| `pullTokens(user, token, amount)` | Agentic Wallet | Pull any token from vault (for swap-back) |
| `completeDCA(user, amountOut)` | Agentic Wallet | Credit user after DCA swap |
| `creditUser(user, token, amount)` | Agentic Wallet | Credit user after swap-back |
| `canExecute(user)` | Anyone | Check if DCA is ready to execute |

---

## Team

| Member | Role |
|--------|------|
| 0xnald | Full-stack developer |

---

## X Layer Ecosystem Positioning

RecurFi fills a gap in the X Layer DeFi ecosystem by providing **automated investment infrastructure**:

- **Passive DCA**: Users deposit once and the agent handles recurring swaps automatically
- **Swap volume**: Drives recurring swap volume through X Layer DEXes via OKX DEX aggregation
- **Agentic primitive**: Demonstrates autonomous agent architecture — vault + EOA agent + keeper
- **Composable**: Other protocols can build on the vault contract for automated trading strategies

---

## Quick Start

### Prerequisites

- Node.js 18+
- OKX Developer API keys ([developer portal](https://web3.okx.com/onchainos/dev-docs/home/developer-portal))
- OKB for gas on X Layer

### Install & Run

```bash
git clone https://github.com/0xnald/recurfi-smart-dca-agent.git
cd recurfi-smart-dca-agent
npm install

# Set up environment
cp .env.example .env
# Fill in your keys

# Compile & test contracts
npx hardhat compile
npx hardhat test

# Deploy to X Layer
npx hardhat run scripts/deploy.ts --network xlayer
# Update .env with deployed contract address

# Run frontend
npm run dev

# Run DCA Keeper (auto-executes strategies)
node scripts/keeper.js
```

### Deployment

- **Frontend**: Vercel (connect GitHub repo, set env vars)
- **DCA Keeper**: Railway (`node scripts/keeper.js`, set env vars)
- **Contracts**: X Layer mainnet (chain 196)

---

## License

MIT
