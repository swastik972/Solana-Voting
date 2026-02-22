# 🗳️ Solana Voting DApp

A fully decentralized voting application built on the **Solana blockchain** using **Anchor framework** (Rust), a **Node.js/Express** backend API, and a **React** frontend.

---

## 📁 Project Structure

```
Solana Voting/
├── Anchor.toml                     # Anchor configuration
├── Cargo.toml                      # Rust workspace config
├── package.json                    # Root package (tests)
├── programs/
│   └── solana_voting/
│       ├── Cargo.toml              # Program dependencies
│       └── src/
│           └── lib.rs              # Smart contract (Rust/Anchor)
├── tests/
│   └── solana_voting.ts            # Integration tests (TypeScript)
├── app/                            # Combined Frontend + Backend
│   ├── package.json                # All dependencies (single install)
│   ├── tsconfig.json               # React/client TypeScript config
│   ├── tsconfig.server.json        # Server TypeScript config
│   ├── config-overrides.js         # Webpack polyfill config
│   ├── .env                        # Environment variables
│   ├── .env.example                # Env template
│   ├── public/
│   │   └── index.html
│   ├── src/                        # React Frontend
│   │   ├── index.tsx               # Entry point
│   │   ├── App.tsx                 # Wallet providers setup
│   │   ├── styles.css              # Full UI styling
│   │   ├── polyfills.ts            # Buffer polyfill
│   │   ├── idl/
│   │   │   └── solana_voting.json  # Program IDL
│   │   ├── utils/
│   │   │   └── anchor.ts           # Anchor helpers & PDA derivation
│   │   └── components/
│   │       └── VotingDApp.tsx       # Main voting interface
│   └── server/                     # Express Backend
│       ├── index.ts                # Server entry (serves API + React build)
│       ├── config.ts               # Environment config
│       ├── idl/
│       │   └── solana_voting.json  # Program IDL
│       ├── services/
│       │   └── solana.service.ts   # Solana blockchain service layer
│       ├── routes/
│       │   └── api.routes.ts       # REST API routes
│       └── middleware/
│           └── errorHandler.ts     # Error handling & validation
└── README.md
```

---

## ✨ Features

### Smart Contract (On-Chain)
- **Create Poll** — Admin creates a poll with a title and 2–10 candidates
- **Cast Vote** — Any connected wallet can vote once per poll
- **Double-Vote Prevention** — Uses PDA (Program Derived Address) per voter per poll
- **Close Poll** — Admin can close a poll to stop further voting
- **On-Chain Storage** — All data stored in Solana accounts via PDAs

### Frontend
- **Phantom Wallet** connection with address & SOL balance display
- **Create Poll** form with dynamic candidate management
- **Load & View** any poll by its ID
- **One-Click Voting** with real-time result updates
- **Vote Progress Bars** — Visual representation of vote distribution
- **Transaction Confirmation** — Links to Solana Explorer
- **Error Handling** — User-friendly messages for double votes, closed polls, etc.

---

## 🛠️ Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (v1.17+)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (v0.29+)
- [Node.js](https://nodejs.org/) (v18+)
- [Phantom Wallet](https://phantom.app/) browser extension

---

## 🚀 Getting Started

### 1. Configure Solana for Devnet

```bash
solana config set --url devnet
solana-keygen new          # Generate a keypair (if you don't have one)
solana airdrop 2           # Get SOL for deployment
```

### 2. Build & Deploy the Smart Contract

```bash
# From the project root
anchor build
anchor deploy
```

After deployment, update the **Program ID** in:
- `programs/solana_voting/src/lib.rs` → `declare_id!("YOUR_PROGRAM_ID")`
- `Anchor.toml` → `[programs.devnet]`
- `frontend/src/idl/solana_voting.json` → `metadata.address`
- `frontend/src/utils/anchor.ts` → `PROGRAM_ID`
- `app/server/idl/solana_voting.json` → `metadata.address`
- `app/src/idl/solana_voting.json` → `metadata.address`
- `app/src/utils/anchor.ts` → `PROGRAM_ID`
- `app/.env` → `PROGRAM_ID`

Then rebuild and redeploy:
```bash
anchor build
anchor deploy
```

### 3. Run Tests

```bash
# Install test dependencies
npm install

# Run Anchor tests
anchor test
```

### 4. Start the App (Frontend + Backend)

```bash
cd app
npm install
cp .env.example .env     # Configure environment variables (optional)
npm run dev              # Starts both servers concurrently
```

This runs:
- **React dev server** on `http://localhost:3000` (with proxy to backend)
- **Express API server** on `http://localhost:5000`

For admin operations via API (create/close polls), set `ADMIN_PRIVATE_KEY` in `.env`.

#### Production Build

```bash
cd app
npm run build            # Builds React into app/build/
npm start                # Express serves API + React build on port 5000
```

---

## 📖 How It Works

### PDA (Program Derived Address) Design

| Account     | Seeds                              | Purpose                        |
|-------------|-------------------------------------|--------------------------------|
| **Poll**    | `["poll", poll_id (u64 LE)]`       | Stores poll data & candidates  |
| **VoteRecord** | `["vote", poll_id (u64 LE), voter_pubkey]` | Ensures one vote per wallet |

The `VoteRecord` PDA is initialized on first vote. If a wallet tries to vote again, the `init` constraint fails because the account already exists — this is how **double voting is prevented** without any manual checks.

### Transaction Flow

1. **Admin** calls `create_poll` → creates a `Poll` PDA with candidates (0 votes each)
2. **Voter** connects Phantom wallet → loads a poll by ID
3. **Voter** clicks "Vote" → calls `vote` instruction → creates `VoteRecord` PDA + increments candidate votes
4. **Frontend** refetches poll data → displays updated results with progress bars

---

## 🔧 Smart Contract Instructions

| Instruction     | Signer | Description                          |
|-----------------|--------|--------------------------------------|
| `create_poll`   | Admin  | Creates poll with title & candidates |
| `vote`          | Voter  | Casts a vote (once per wallet)       |
| `close_poll`    | Admin  | Closes poll to stop voting           |

---

## ⚠️ Error Codes

| Code | Name              | Message                              |
|------|-------------------|--------------------------------------|
| 6000 | TooFewCandidates  | Poll must have at least 2 candidates |
| 6001 | TooManyCandidates | Poll cannot have more than 10 candidates |
| 6002 | TitleTooLong      | Title must be 100 characters or less |
| 6003 | PollClosed        | This poll is closed                  |
| 6004 | InvalidCandidate  | Invalid candidate index              |
| 6005 | Unauthorized      | Only the poll admin can perform this |

---

## 🔌 Backend API Reference

Base URL: `http://localhost:5000/api`

### Health & Info
| Method | Endpoint     | Description                    |
|--------|-------------|--------------------------------|
| GET    | `/health`   | Health check & connection info |
| GET    | `/info`     | Program ID & network details   |

### Polls
| Method | Endpoint                  | Description                          |
|--------|--------------------------|--------------------------------------|
| GET    | `/polls`                 | Fetch all polls from on-chain        |
| GET    | `/polls/:pollId`         | Fetch a specific poll by ID          |
| GET    | `/polls/:pollId/results` | Get ranked voting results            |
| POST   | `/polls`                 | Create a new poll (admin key needed) |
| PATCH  | `/polls/:pollId/close`   | Close a poll (admin key needed)      |

### Voting
| Method | Endpoint                               | Description                              |
|--------|-----------------------------------------|------------------------------------------|
| POST   | `/vote/build`                          | Build unsigned vote tx for wallet signing |
| POST   | `/vote/submit`                         | Submit a signed vote transaction          |
| GET    | `/vote/status/:pollId/:voterAddress`   | Check if a wallet has voted               |

### Wallet
| Method | Endpoint                    | Description               |
|--------|-----------------------------|---------------------------|
| GET    | `/wallet/:address/balance`  | Get SOL balance for wallet |

### Example: Create Poll (via API)
```bash
curl -X POST http://localhost:5000/api/polls \
  -H "Content-Type: application/json" \
  -d '{"pollId": 1, "title": "Best Blockchain", "candidates": ["Solana", "Ethereum", "Polygon"]}'
```

### Example: Check Vote Status
```bash
curl http://localhost:5000/api/vote/status/1/YOUR_WALLET_ADDRESS
```

### Example: Get Poll Results
```bash
curl http://localhost:5000/api/polls/1/results
```

### Backend Features
- **Helmet** — Security headers
- **CORS** — Configured for frontend origin
- **Rate Limiting** — 100 requests per 15 minutes (configurable)
- **Morgan** — HTTP request logging
- **Input Validation** — All endpoints validated
- **Error Parsing** — Solana/Anchor errors converted to friendly messages
- **Transaction Builder** — Build unsigned transactions for frontend wallet signing

---

## 🌐 Network

This project is configured for **Solana Devnet**. To get test SOL:

```bash
solana airdrop 2
```

Or use the [Solana Faucet](https://faucet.solana.com/).

---

## 📜 License

MIT
