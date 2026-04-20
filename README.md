# WCO Casino — Spribe Lobby Integration

A minimal, production-ready prototype that integrates a Node.js/Express backend with the **Worldcasinoonline (WCO)** Authentication & Wallet API and a Spribe Lobby launched inside a full-screen iframe.

```
wco-casino/
├── backend/
│   ├── server.js          ← Express entry point
│   ├── db.js              ← In-memory DB (swap-ready for MongoDB)
│   ├── middleware.js       ← partnerKey validation + error handler
│   ├── routes/
│   │   ├── auth.js        ← POST /api/auth/launch
│   │   └── wallet.js      ← POST /api/wallet/{balance,debit,credit}
│   ├── .env               ← Your real secrets (git-ignored)
│   └── .env.example       ← Template to commit
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## Quick Start

### 1. Install dependencies

```bash
cd wco-casino/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

| Variable        | Description                                      |
|-----------------|--------------------------------------------------|
| `PARTNER_KEY`   | Your WCO partner key (from the WCO dashboard)    |
| `WCO_AUTH_URL`  | WCO https://apis.nexxapi.tech/ auth endpoint (pre-filled)             |
| `PORT`          | HTTP port (default `3001`)                       |
| `CURRENCY`      | 3-letter currency code (default `INR`)           |
| `PROVIDER_CODE` | Game provider code (default `SPB` = Spribe)      |

> **Without a real `PARTNER_KEY`** the server returns a mock Spribe demo URL so the UI still works end-to-end for development.

### 3. Run the server

```bash
npm start          # production
npm run dev        # development (auto-restarts with nodemon)
```

### 4. Open the frontend

Visit → **http://localhost:3001**

The Express server serves the `/frontend` folder as static files, so no separate frontend build step is needed.

---

## API Reference

All endpoints expect `Content-Type: application/json`.

### `POST /api/auth/launch`
Called by the browser to get a game launch URL.

**Request body**
```json
{ "userId": "demo_user", "username": "Demo Player" }
```

**Response**
```json
{ "success": true, "launchURL": "https://..." }
```

---

### `POST /api/wallet/balance`
Called by WCO game servers (or the UI) to query a user's balance.

**Request body**
```json
{ "partnerKey": "...", "userId": "demo_user" }
```

**Response**
```json
{ "success": true, "userId": "demo_user", "balance": 1000.00, "currency": "INR" }
```

---

### `POST /api/wallet/debit`
Called by WCO when a player places a bet.

**Request body**
```json
{
  "partnerKey": "...",
  "userId": "demo_user",
  "amount": 10.00,
  "transactionData": { "id": "unique-tx-id", "providerRoundId": "round-123" }
}
```

**Response** — same shape as `/balance`.

**Error codes**
- `402` — Insufficient funds
- `409` — Duplicate transaction (idempotency guard)

---

### `POST /api/wallet/credit`
Called by WCO when a player wins.

Same body shape as `/debit`. Same error codes.

---

## Demo Account

The in-memory DB is seeded with:

| userId      | Balance    |
|-------------|------------|
| `demo_user` | ₹1,000.00  |

Use `demo_user` on the login screen to get started immediately.

---

## Architecture

```
Browser (frontend)
    │
    │  POST /api/auth/launch   (userId only — no partnerKey)
    ▼
Express Backend  ──────────►  WCO Auth API  (partnerKey added server-side)
    │                               │
    │◄─────────────────────────────── launchURL
    │
    └─► Returns launchURL to browser → rendered in <iframe>

WCO Game Server ────────────► Express Backend
    POST /api/wallet/debit          (validates partnerKey, checks balance)
    POST /api/wallet/credit         (validates partnerKey, idempotency check)
```

---

## Upgrading to MongoDB

Replace `db.js` with a MongoDB adapter that exports the same four functions:

```js
module.exports = { getUser, getBalance, debit, credit, getTransactions };
```

No other file needs to change.

---

## Security Notes

- `PARTNER_KEY` is **never** sent to the browser.
- All WCO callback routes validate `partnerKey` before touching balances.
- Idempotency is enforced with a `Set` of processed transaction IDs (use a DB index in production).
- Add HTTPS + helmet.js before going to production.
# nexxtest
