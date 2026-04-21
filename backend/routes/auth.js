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

  // ── Build the Nexx API payload ─────────────────────────────────────────
  const payload = {
    partnerKey: PARTNER_KEY,
    game: {
      gameCode: selectedGame,
      providerCode: PROVIDER_CODE,
      platform: "mobile",
    },
    timestamp: Math.floor(Date.now() / 1000).toString(),
    user: {
      id: userId,
      currency: CURRENCY,
      displayName: username || userId,
      backUrl: "https://google.com/",
    },
  };

  try {
    console.log(`[AUTH] Launching via Nexx API for userId=${userId}`);

    const response = await axios.post("https://apis.nexxapi.tech/api/auth.php", payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15_000,
    });

    const data = response.data;

    // The API usually returns { success: true, launchURL: "..." } or similar
    if (!data || !data.launchURL) {
      console.error("[AUTH] Nexx API error response:", data);
      return res.status(502).json({
        success: false,
        error: "Nexx API did not return a launchURL",
        apiResponse: data,
      });
    }

    console.log(`[AUTH] launchURL received for userId=${userId}`);
    return res.json({ success: true, launchURL: data.launchURL });
  } catch (err) {
    const status = err.response?.status || 500;
    const detail = err.response?.data || err.message;
    console.error(`[AUTH] Nexx API error (${status}):`, detail);
    return res.status(502).json({
      success: false,
      error: "Failed to authenticate with Nexx API",
      detail,
    });
  }
});

module.exports = router;
