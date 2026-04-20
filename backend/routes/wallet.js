/**
 * routes/wallet.js — WCO Wallet Callback Endpoints
 *
 * WCO's game servers will POST to these routes whenever the player
 * places a bet (debit) or wins (credit). They also poll /balance
 * before launching a session.
 *
 * All three routes share the validatePartnerKey middleware so only
 * authenticated WCO servers can mutate balances.
 *
 * NOTE: Amounts from WCO arrive in the main currency unit (e.g. ₹12.50).
 *       We convert to paise (×100) before storing and back for the response.
 */

const express = require("express");
const router = express.Router();
const db = require("../db");
const { validatePartnerKey } = require("../middleware");

// ── /balance ────────────────────────────────────────────────────────────────
/**
 * POST /api/wallet/balance
 * Body: { partnerKey, userId }
 * Response: { userId, balance }   ← balance in INR (main unit)
 */
router.post("/balance", validatePartnerKey, (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }

    const balancePaise = db.getBalance(userId);

    return res.json({
      success: true,
      userId,
      balance: balancePaise / 100, // convert paise → INR
      currency: process.env.CURRENCY || "INR",
    });
  } catch (err) {
    next(err);
  }
});

// ── /debit ──────────────────────────────────────────────────────────────────
/**
 * POST /api/wallet/debit
 * Body: { partnerKey, userId, amount, transactionData: { id, providerRoundId } }
 * Response: { userId, balance }
 */
router.post("/debit", validatePartnerKey, (req, res, next) => {
  try {
    const { userId, amount, transactionData } = req.body;

    // ── Input validation ───────────────────────────────────────────────────
    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }
    if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    if (!transactionData || !transactionData.id) {
      return res
        .status(400)
        .json({ success: false, error: "Missing transactionData.id" });
    }

    const amountPaise = Math.round(parseFloat(amount) * 100);

    const user = db.debit({
      userId,
      amount: amountPaise,
      transactionId: transactionData.id,
      providerRoundId: transactionData.providerRoundId || null,
    });

    console.log(
      `[DEBIT]  user=${userId} amount=₹${amount} txId=${transactionData.id} newBalance=₹${user.balance / 100}`
    );

    return res.json({
      success: true,
      userId,
      balance: user.balance / 100,
      currency: process.env.CURRENCY || "INR",
    });
  } catch (err) {
    next(err);
  }
});

// ── /credit ─────────────────────────────────────────────────────────────────
/**
 * POST /api/wallet/credit
 * Body: { partnerKey, userId, amount, transactionData: { id, providerRoundId } }
 * Response: { userId, balance }
 */
router.post("/credit", validatePartnerKey, (req, res, next) => {
  try {
    const { userId, amount, transactionData } = req.body;

    // ── Input validation ───────────────────────────────────────────────────
    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }
    if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    if (!transactionData || !transactionData.id) {
      return res
        .status(400)
        .json({ success: false, error: "Missing transactionData.id" });
    }

    const amountPaise = Math.round(parseFloat(amount) * 100);

    const user = db.credit({
      userId,
      amount: amountPaise,
      transactionId: transactionData.id,
      providerRoundId: transactionData.providerRoundId || null,
    });

    console.log(
      `[CREDIT] user=${userId} amount=₹${amount} txId=${transactionData.id} newBalance=₹${user.balance / 100}`
    );

    return res.json({
      success: true,
      userId,
      balance: user.balance / 100,
      currency: process.env.CURRENCY || "INR",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
