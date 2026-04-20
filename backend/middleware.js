/**
 * middleware.js — Shared Express middleware
 *
 * validatePartnerKey: Checks that every inbound WCO callback carries the
 * correct partnerKey so rogue actors can't manipulate balances.
 *
 * errorHandler: Central error handler that formats all thrown errors into a
 * consistent JSON envelope.
 */

const PARTNER_KEY = process.env.PARTNER_KEY;

/**
 * Validates the partnerKey present in the request body.
 * WCO sends this on every wallet callback (balance / debit / credit).
 */
function validatePartnerKey(req, res, next) {
  const { partnerKey } = req.body;

  if (!partnerKey) {
    return res.status(400).json({
      success: false,
      error: "Missing partnerKey in request body",
    });
  }

  if (partnerKey !== PARTNER_KEY) {
    return res.status(403).json({
      success: false,
      error: "Invalid partnerKey",
    });
  }

  next();
}

/**
 * Central error handler — must be registered LAST in the Express chain.
 */
function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Map known business-logic error codes to HTTP statuses
  const statusMap = {
    INSUFFICIENT_FUNDS: 402,
    DUPLICATE_TX: 409,
  };

  const status = statusMap[err.code] || 500;

  return res.status(status).json({
    success: false,
    error: err.message || "Internal server error",
    code: err.code || "INTERNAL_ERROR",
  });
}

module.exports = { validatePartnerKey, errorHandler };
