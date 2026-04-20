/**
 * routes/user.js — User-initiated wallet request routes
 *
 * POST /api/user/balance   → get current balance (no partnerKey needed)
 * POST /api/user/deposit   → submit deposit request (amount + 12-digit UTR)
 * POST /api/user/withdraw  → submit withdrawal request (amount + UPI ID)
 */

const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── POST /api/user/balance ──────────────────────────────────────────────────
// Dedicated frontend-facing balance endpoint — no partnerKey required.
router.post("/balance", (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }
    const balancePaise = db.getBalance(userId);
    return res.json({
      success:  true,
      userId,
      balance:  balancePaise / 100,
      currency: process.env.CURRENCY || "INR",
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/user/deposit ──────────────────────────────────────────────────
router.post("/deposit", (req, res, next) => {
  try {
    const { userId, amount, utr } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    if (!utr || String(utr).replace(/\D/g, "").length !== 12) {
      return res.status(400).json({ success: false, error: "UTR must be exactly 12 digits" });
    }

    const request = db.createDepositRequest({
      userId,
      amount: Math.round(parseFloat(amount) * 100),
      utr:    String(utr).trim(),
    });

    console.log(`[DEPOSIT REQUEST] user=${userId} amount=₹${amount} utr=${utr} id=${request.id}`);
    return res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/user/withdraw ─────────────────────────────────────────────────
router.post("/withdraw", (req, res, next) => {
  try {
    const { userId, amount, upiId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    if (!upiId || !String(upiId).trim()) {
      return res.status(400).json({ success: false, error: "UPI ID is required" });
    }

    const amountPaise = Math.round(parseFloat(amount) * 100);
    const balance     = db.getBalance(userId);
    if (balance < amountPaise) {
      return res.status(402).json({ success: false, error: "Insufficient balance" });
    }

    const request = db.createWithdrawRequest({
      userId,
      amount: amountPaise,
      upiId:  String(upiId).trim(),
    });

    console.log(`[WITHDRAW REQUEST] user=${userId} amount=₹${amount} upi=${upiId} id=${request.id}`);
    return res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
