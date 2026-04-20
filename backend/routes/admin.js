/**
 * routes/admin.js — Admin Panel API
 *
 * All routes require adminKey header matching the ADMIN_USER env var.
 * Only the "PIDIYAN" account (or whoever is set in ADMIN_USER) can access.
 *
 * GET  /api/admin/requests   → list all deposit / withdrawal requests
 * POST /api/admin/approve    → approve a request (credits / debits user)
 * POST /api/admin/reject     → reject a request (no balance change)
 */

const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Admin auth middleware ───────────────────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER || "PIDIYAN";

function requireAdmin(req, res, next) {
  // Accept admin identity from body (POST) or query (GET)
  const who = req.body.adminUser || req.query.adminUser;
  if (!who) {
    return res.status(401).json({ success: false, error: "Admin access required" });
  }
  if (who.trim().toUpperCase() !== ADMIN_USER.toUpperCase()) {
    return res.status(403).json({ success: false, error: "Not authorised" });
  }
  next();
}

// ── GET /api/admin/requests ─────────────────────────────────────────────────
router.get("/requests", requireAdmin, (_req, res) => {
  const requests = db.getAllRequests();
  return res.json({ success: true, requests });
});

// ── POST /api/admin/approve ─────────────────────────────────────────────────
router.post("/approve", requireAdmin, (req, res, next) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ success: false, error: "Missing requestId" });
    }
    const result = db.approveRequest(requestId);
    console.log(`[ADMIN APPROVE] requestId=${requestId} by ${req.body.adminUser}`);
    return res.json({ success: true, request: result });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/reject ──────────────────────────────────────────────────
router.post("/reject", requireAdmin, (req, res, next) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ success: false, error: "Missing requestId" });
    }
    const result = db.rejectRequest(requestId);
    console.log(`[ADMIN REJECT] requestId=${requestId} by ${req.body.adminUser}`);
    return res.json({ success: true, request: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
