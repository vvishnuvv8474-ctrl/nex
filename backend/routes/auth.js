/**
 * routes/auth.js — WCO Authentication Route
 *
 * This is the ONLY route that the frontend should call to launch a game.
 * The partnerKey is never sent to the browser; it lives only in .env
 * and is injected server-side before forwarding to WCO.
 *
 * Flow:
 *   Browser → POST /api/auth/launch  →  WCO Auth API  →  launchURL → browser
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");

const WCO_AUTH_URL = process.env.WCO_AUTH_URL;
const PARTNER_KEY = process.env.PARTNER_KEY;
const CURRENCY = process.env.CURRENCY || "INR";
const PROVIDER_CODE = process.env.PROVIDER_CODE || "SPB";

/**
 * POST /api/auth/launch
 * Body: { userId, username? }
 *
 * Calls WCO's user-authentication endpoint, receives a launchURL,
 * and returns it to the frontend (which renders it in an iframe).
 */
router.post("/launch", async (req, res) => {
  const { userId, username, gameCode } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: "Missing userId" });
  }

  const selectedGame = gameCode || "aviator";

  if (!PARTNER_KEY || PARTNER_KEY === "YOUR_WCO_PARTNER_KEY_HERE") {
    // No real key yet → return a safe mock URL so the UI still demonstrates
    console.warn("[AUTH] PARTNER_KEY not configured — returning mock launchURL");
    return res.json({
      success: true,
      launchURL: `https://demo.spribe.io/${selectedGame}?user=${encodeURIComponent(userId)}&currency=${CURRENCY}&lang=en`,
      mock: true,
    });
  }

  // ── Build the WCO auth payload ─────────────────────────────────────────
  const payload = {
    partnerKey: PARTNER_KEY,      // secret — never exposed to browser
    providerCode: PROVIDER_CODE,
    gameCode: selectedGame,       // requested game
    currency: CURRENCY,
    user: {
      id: userId,
      username: username || userId,
      firstName: username || "Player",
      lastName: "",
    },
    // Add any extra optional WCO fields here (language, returnUrl, etc.)
    lang: "en",
    timestamp: Date.now().toString(),
  };

  try {
    console.log(`[AUTH] Launching game for userId=${userId} provider=${PROVIDER_CODE}`);

    // User requested to use this specific format for launching:
    // https://ourlocalhost/games/?providerCode=SPB&gameCode=aviator&currency=LKR
    const launchURL = `https://ourlocalhost/games/?providerCode=${PROVIDER_CODE}&gameCode=${selectedGame}&currency=${CURRENCY}&userId=${encodeURIComponent(userId)}`;

    console.log(`[AUTH] Gateway launchURL generated for userId=${userId}`);
    return res.json({ success: true, launchURL });
  } catch (err) {
    const status = err.response?.status || 500;
    const detail = err.response?.data || err.message;
    console.error(`[AUTH] WCO API error (${status}):`, detail);
    return res.status(502).json({
      success: false,
      error: "Failed to authenticate with WCO",
      detail,
    });
  }
});

module.exports = router;
