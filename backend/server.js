/**
 * server.js — Express application entry point
 *
 * Registers all middleware, routes, and starts the HTTP server.
 * The frontend is served as static files from ../frontend so a single
 * `node server.js` starts everything.
 */

require("dotenv").config(); // load .env before anything else

const express = require("express");
const cors = require("cors");
const path = require("path");

const walletRoutes = require("./routes/wallet");
const authRoutes   = require("./routes/auth");
const userRoutes   = require("./routes/user");
const adminRoutes  = require("./routes/admin");
const { errorHandler } = require("./middleware");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Global Middleware ────────────────────────────────────────────────────────

// Allow the frontend (same-origin if served from here, or a dev server)
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());          // parse JSON bodies
app.use(express.urlencoded({ extended: true }));

// ── Request Logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Serve Frontend Static Files ──────────────────────────────────────────────
// The frontend folder lives one level up from /backend
app.use(express.static(path.join(__dirname, "../frontend")));

// ── API Routes ───────────────────────────────────────────────────────────────

// WCO Wallet Callbacks  → /api/wallet/balance  /api/wallet/debit  /api/wallet/credit
app.use("/api/wallet", walletRoutes);

// Frontend Launch Route → /api/auth/launch
app.use("/api/auth", authRoutes);

// User wallet requests  → /api/user/deposit  /api/user/withdraw
app.use("/api/user", userRoutes);

// Admin panel           → /api/admin/requests  /api/admin/approve  /api/admin/reject
app.use("/api/admin", adminRoutes);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Catch-all: serve frontend for any unknown GET (SPA support) ──────────────
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ── Central Error Handler (must be LAST) ─────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎰  WCO Casino Backend running on http://localhost:${PORT}`);
  console.log(`    Wallet API : http://localhost:${PORT}/api/wallet/balance`);
  console.log(`    Auth API   : http://localhost:${PORT}/api/auth/launch`);
  console.log(`    Frontend   : http://localhost:${PORT}/\n`);
});
