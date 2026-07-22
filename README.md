# Operator Backend

A real **operator** service for the slot aggregator. This is what a casino/platform
owns. It has:

- **User management** — signup / login, bcrypt password hashing, JWT sessions
- **Real wallet** in MongoDB (`slot-operator-backend`): `Wallet` + an append-only
  `WalletTransaction` ledger; deposits, bets, wins, rollbacks — real cash flow
- **Seamless wallet API** the aggregator calls (`/bet /win /balance /rollback`),
  signature-verified, **idempotent by `txnId`** (unique index → no double spend)
- **Self-registration** with the aggregator on boot (keys from `.env`)
- A small **frontend API** (JWT-protected) so the browser never holds aggregator keys

```
Browser (player, JWT) ──/api/launch──► Operator ──signed──► Aggregator launch ─► token
Browser ── socket ?token= ─► Aggregator game socket
                                  │ bet / win / rollback (signed)
                                  ▼
                        Operator wallet (MongoDB)  ← balance ↓ on bet, ↑ on win
```

## Run order

```bash
# 0. MongoDB + Redis running

# 1. Aggregator (terminal A)
cd ../slot-aggregator
cp .env.example .env
npm install && npm run seed:demo && npm run dev      # :4000 REST, :4055 socket

# 2. Operator backend (terminal B)
cd ../operator-backend
cp .env.example .env
npm install && npm run dev                            # :5000, connects Mongo + self-registers

# 3. Frontend (terminal C)
cd ../testing-frontend
nvm use 22.16.0
npm install && npm run dev
```

In the frontend: **Sign up** (or log in) → Lobby → **Deposit +1000** → pick a game →
**Play**. Bets debit the real `Wallet`; wins credit it; the History panel shows the
ledger. New accounts start at `SIGNUP_BONUS` (0 by default) — deposit before playing.

## Data model (MongoDB `slot-operator-backend`)

- `users` — `{ username, email, passwordHash }`
- `wallets` — `{ userId, balance, currency, totalDeposited, totalBet, totalWon }`
- `wallettransactions` — `{ userId, txnId (unique), type, amount, status, balanceAfter, roundId, gameCode }`

`operatorPlayerId` sent to the aggregator is the user's Mongo `_id`.

## API

**Auth (public)**
- `POST /api/auth/signup` `{ username, email, password }` → `{ token, user }`
- `POST /api/auth/login`  `{ usernameOrEmail, password }` → `{ token, user }`

**Player (JWT)**
- `GET  /api/me` → `{ id, username, balance, currency }`
- `POST /api/deposit` `{ amount }`
- `GET  /api/transactions`
- `POST /api/launch` `{ gameCode, currency }` → `{ launchUrl, token, socketUrl }`

**Aggregator wallet (signed; root path)**
- `POST /balance · /bet · /win · /rollback` — idempotent by `txnId`

## .env

| Var | Meaning |
|-----|---------|
| `MONGODB_URL` | `mongodb://localhost:27017/slot-operator-backend` |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | player session tokens |
| `SIGNUP_BONUS` | starting balance for a new account (default 0) |
| `OPERATOR_API_KEY` / `OPERATOR_INBOUND_SECRET` | sign operator → aggregator |
| `OPERATOR_OUTBOUND_SECRET` | verify aggregator → wallet |
| `OPERATOR_PUBLIC_URL` | where the aggregator reaches this wallet |
| `AGGREGATOR_REST_URL` / `AGGREGATOR_ADMIN_KEY` | aggregator base + admin key (self-register) |
| `ENABLED_GAMES` | games this operator offers |

> Demo keys are shared by both sides for local testing. In production the operator
> signs on its backend and never exposes secrets to the browser.
