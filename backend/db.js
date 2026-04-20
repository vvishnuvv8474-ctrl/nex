/**
 * db.js — SQLite persistent database layer (better-sqlite3)
 *
 * Replaces the previous in-memory store. Data is written to
 * casino.db in the backend directory and survives server restarts.
 *
 * Public API is identical to the old in-memory version so no
 * route files need to change.
 *
 * Tables
 * ──────
 *  users        (userId TEXT PK, balance INTEGER)          ← paise
 *  transactions (id TEXT PK, userId, amount, type,
 *                providerRoundId, note, createdAt)
 *  requests     (id TEXT PK, type, userId, amount,
 *                utr, upiId, status, createdAt, updatedAt)
 */

const path    = require("path");
const Database = require("better-sqlite3");

// ── Open / create the database file ────────────────────────────────────────
const DB_PATH = path.join(__dirname, "casino.db");
const sql = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sql.pragma("journal_mode = WAL");
sql.pragma("foreign_keys = ON");

// ── Schema bootstrap ────────────────────────────────────────────────────────
sql.exec(`
  CREATE TABLE IF NOT EXISTS users (
    userId  TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL,
    amount          INTEGER NOT NULL,
    type            TEXT NOT NULL,       -- 'credit' | 'debit'
    providerRoundId TEXT,
    note            TEXT,
    createdAt       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id        TEXT PRIMARY KEY,
    type      TEXT NOT NULL,             -- 'deposit' | 'withdraw'
    userId    TEXT NOT NULL,
    amount    INTEGER NOT NULL,          -- paise
    utr       TEXT,                      -- deposit only
    upiId     TEXT,                      -- withdraw only
    status    TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

// ── Seed demo user if not already present ──────────────────────────────────
const seedUser = sql.prepare(
  "INSERT OR IGNORE INTO users (userId, balance) VALUES (?, ?)"
);
seedUser.run("demo_user", 100000); // ₹1,000.00 in paise

// ── Prepared statements ────────────────────────────────────────────────────
const stmts = {
  getUser:    sql.prepare("SELECT * FROM users WHERE userId = ?"),
  upsertUser: sql.prepare(
    "INSERT INTO users (userId, balance) VALUES (?, 0) ON CONFLICT(userId) DO NOTHING"
  ),
  getBalance: sql.prepare("SELECT balance FROM users WHERE userId = ?"),
  setBalance: sql.prepare("UPDATE users SET balance = ? WHERE userId = ?"),

  insertTx: sql.prepare(`
    INSERT INTO transactions (id, userId, amount, type, providerRoundId, note, createdAt)
    VALUES (@id, @userId, @amount, @type, @providerRoundId, @note, @createdAt)
  `),
  getTx:     sql.prepare("SELECT * FROM transactions WHERE id = ?"),
  getTxList: sql.prepare(
    "SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC"
  ),

  insertReq: sql.prepare(`
    INSERT INTO requests (id, type, userId, amount, utr, upiId, status, createdAt, updatedAt)
    VALUES (@id, @type, @userId, @amount, @utr, @upiId, @status, @createdAt, @updatedAt)
  `),
  getReq:    sql.prepare("SELECT * FROM requests WHERE id = ?"),
  allReqs:   sql.prepare("SELECT * FROM requests ORDER BY createdAt DESC"),
  setReqStatus: sql.prepare(
    "UPDATE requests SET status = ?, updatedAt = ? WHERE id = ?"
  ),
};

// ── ID generator ────────────────────────────────────────────────────────────
let _counter = Date.now(); // monotonically increasing suffix
function makeId(prefix) {
  return `${prefix}-${Date.now()}-${++_counter}`;
}

// ── ensureUser ───────────────────────────────────────────────────────────────
function ensureUser(userId) {
  stmts.upsertUser.run(userId);
  return stmts.getUser.get(userId);
}

// ════════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

/** Return user row or null. */
function getUser(userId) {
  return stmts.getUser.get(userId) || null;
}

/** Return balance in paise; creates user with 0 if not found. */
function getBalance(userId) {
  ensureUser(userId);
  return stmts.getBalance.get(userId).balance;
}

/**
 * Deduct `amount` paise.
 * Throws DUPLICATE_TX or INSUFFICIENT_FUNDS on violation.
 * Returns the updated user row.
 */
function debit({ userId, amount, transactionId, providerRoundId }) {
  // Idempotency check
  if (stmts.getTx.get(transactionId)) {
    const err = new Error("Transaction already processed");
    err.code = "DUPLICATE_TX";
    throw err;
  }

  const doDebit = sql.transaction(() => {
    ensureUser(userId);
    const { balance } = stmts.getBalance.get(userId);

    if (balance < amount) {
      const err = new Error("Insufficient funds");
      err.code = "INSUFFICIENT_FUNDS";
      throw err;
    }

    stmts.setBalance.run(balance - amount, userId);
    stmts.insertTx.run({
      id:              transactionId,
      userId,
      amount,
      type:            "debit",
      providerRoundId: providerRoundId || null,
      note:            null,
      createdAt:       new Date().toISOString(),
    });

    return stmts.getUser.get(userId);
  });

  return doDebit();
}

/**
 * Add `amount` paise.
 * Throws DUPLICATE_TX on duplicate.
 * Returns the updated user row.
 */
function credit({ userId, amount, transactionId, providerRoundId }) {
  if (stmts.getTx.get(transactionId)) {
    const err = new Error("Transaction already processed");
    err.code = "DUPLICATE_TX";
    throw err;
  }

  const doCredit = sql.transaction(() => {
    ensureUser(userId);
    const { balance } = stmts.getBalance.get(userId);

    stmts.setBalance.run(balance + amount, userId);
    stmts.insertTx.run({
      id:              transactionId,
      userId,
      amount,
      type:            "credit",
      providerRoundId: providerRoundId || null,
      note:            null,
      createdAt:       new Date().toISOString(),
    });

    return stmts.getUser.get(userId);
  });

  return doCredit();
}

/** Full transaction history for a user (newest first). */
function getTransactions(userId) {
  return stmts.getTxList.all(userId);
}

// ── Deposit / Withdrawal Requests ──────────────────────────────────────────

/** Create a pending deposit request. amount in paise. */
function createDepositRequest({ userId, amount, utr }) {
  ensureUser(userId);
  const now = new Date().toISOString();
  const id  = makeId("dep");

  stmts.insertReq.run({
    id,
    type:      "deposit",
    userId,
    amount,
    utr,
    upiId:     null,
    status:    "pending",
    createdAt: now,
    updatedAt: now,
  });

  return stmts.getReq.get(id);
}

/** Create a pending withdrawal request. amount in paise. */
function createWithdrawRequest({ userId, amount, upiId }) {
  ensureUser(userId);
  const now = new Date().toISOString();
  const id  = makeId("wdw");

  stmts.insertReq.run({
    id,
    type:      "withdraw",
    userId,
    amount,
    utr:       null,
    upiId,
    status:    "pending",
    createdAt: now,
    updatedAt: now,
  });

  return stmts.getReq.get(id);
}

/** Return all requests, newest first. */
function getAllRequests() {
  return stmts.allReqs.all();
}

/**
 * Approve a request:
 *   deposit  → credit user balance
 *   withdraw → debit user balance
 * Throws NOT_FOUND, INVALID_STATE, or INSUFFICIENT_FUNDS.
 */
function approveRequest(requestId) {
  const req = stmts.getReq.get(requestId);
  if (!req) {
    const err = new Error("Request not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (req.status !== "pending") {
    const err = new Error(`Request is already ${req.status}`);
    err.code = "INVALID_STATE";
    throw err;
  }

  const doApprove = sql.transaction(() => {
    const now = new Date().toISOString();
    ensureUser(req.userId);
    const { balance } = stmts.getBalance.get(req.userId);

    if (req.type === "deposit") {
      stmts.setBalance.run(balance + req.amount, req.userId);
      stmts.insertTx.run({
        id:              `admin-dep-${requestId}`,
        userId:          req.userId,
        amount:          req.amount,
        type:            "credit",
        providerRoundId: null,
        note:            `Deposit approved — UTR ${req.utr}`,
        createdAt:       now,
      });
    } else {
      // withdraw
      if (balance < req.amount) {
        const err = new Error("Insufficient funds for withdrawal");
        err.code = "INSUFFICIENT_FUNDS";
        throw err;
      }
      stmts.setBalance.run(balance - req.amount, req.userId);
      stmts.insertTx.run({
        id:              `admin-wdw-${requestId}`,
        userId:          req.userId,
        amount:          req.amount,
        type:            "debit",
        providerRoundId: null,
        note:            `Withdrawal approved — UPI ${req.upiId}`,
        createdAt:       now,
      });
    }

    stmts.setReqStatus.run("approved", now, requestId);
    return stmts.getReq.get(requestId);
  });

  return doApprove();
}

/** Reject a request — no balance change. */
function rejectRequest(requestId) {
  const req = stmts.getReq.get(requestId);
  if (!req) {
    const err = new Error("Request not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (req.status !== "pending") {
    const err = new Error(`Request is already ${req.status}`);
    err.code = "INVALID_STATE";
    throw err;
  }

  const now = new Date().toISOString();
  stmts.setReqStatus.run("rejected", now, requestId);
  return stmts.getReq.get(requestId);
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
process.on("exit", () => sql.close());
process.on("SIGINT",  () => { sql.close(); process.exit(0); });
process.on("SIGTERM", () => { sql.close(); process.exit(0); });

module.exports = {
  getUser,
  getBalance,
  debit,
  credit,
  getTransactions,
  createDepositRequest,
  createWithdrawRequest,
  getAllRequests,
  approveRequest,
  rejectRequest,
};
