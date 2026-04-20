/**
 * app.js — WCO Casino Frontend Logic
 *
 * Key behaviours
 * ──────────────
 *  • NO sessionStorage / localStorage — login required fresh each visit.
 *  • Balance fetched via /api/user/balance (no partnerKey needed).
 *  • Admin panel visible ONLY when userId === "PIDIYAN".
 *  • All admin API calls include { adminUser: state.userId } for server auth.
 *  • Deposit form  : amount + 12-digit UTR → pending request.
 *  • Withdrawal form: amount + UPI ID      → pending request.
 *  • Admin can Accept (credits/debits balance) or Reject.
 */

// ── Config ─────────────────────────────────────────────────────────────────
const API_BASE   = "";
const ADMIN_ID   = "PIDIYAN"; // must match ADMIN_USER in backend .env

// ── State ───────────────────────────────────────────────────────────────────
const state = {
  userId:       null,
  username:     null,
  balance:      0,
  transactions: [],
  txCounter:    0,
  adminFilter:  "all",
  adminRequests: [],
};

// ── DOM helper ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Init ────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Hide loading screen
  setTimeout(() => {
    const ls = $("loading-screen");
    ls.classList.add("fade-out");
    setTimeout(() => ls.classList.add("hidden"), 400);

    // No auto-restore — always show login fresh
    $("login-modal").classList.remove("hidden");
  }, 1500);

  // Enter key on login
  $("user-id-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  // Enter key on deposit / withdraw inputs
  ["deposit-amount", "deposit-utr"].forEach((id) => {
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") submitDeposit(); });
  });
  ["withdraw-amount", "withdraw-upi"].forEach((id) => {
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") submitWithdraw(); });
  });
});

// ── Login / Logout ───────────────────────────────────────────────────────────
function handleLogin() {
  const input  = $("user-id-input");
  const userId = input.value.trim();

  if (!userId) {
    shakEl(input);
    showToast("Please enter a User ID", "warning");
    return;
  }

  state.userId   = userId;
  state.username = userId;

  $("login-modal").classList.add("hidden");
  showApp();
}

function handleLogout() {
  state.userId       = null;
  state.username     = null;
  state.balance      = 0;
  state.transactions = [];

  closeGame();

  $("main-app").classList.add("hidden");
  $("user-id-input").value = "";
  $("login-modal").classList.remove("hidden");

  showToast("Logged out", "info");
}

// ── Show App ─────────────────────────────────────────────────────────────────
function showApp() {
  const isAdmin = state.userId.toUpperCase() === ADMIN_ID.toUpperCase();

  $("main-app").classList.remove("hidden");
  $("header-username").textContent = state.username;
  $("user-avatar").textContent     = state.username.charAt(0).toUpperCase();

  // Show Admin nav only for PIDIYAN
  const adminNav = $("nav-admin");
  if (isAdmin) {
    adminNav.style.display = "";
  } else {
    adminNav.style.display = "none";
  }

  // Start on lobby tab
  switchTab("lobby");
  refreshBalance();
  showToast(`Welcome, ${state.username}!`, "success");
}

// ── Tab Navigation ────────────────────────────────────────────────────────────
function switchTab(name) {
  ["lobby", "history", "admin"].forEach((t) => {
    const tab = $(`tab-${t}`);
    const nav = $(`nav-${t}`);
    if (tab) tab.classList.add("hidden");
    if (nav) nav.classList.remove("active");
  });
  const activeTab = $(`tab-${name}`);
  const activeNav = $(`nav-${name}`);
  if (activeTab) activeTab.classList.remove("hidden");
  if (activeNav) activeNav.classList.add("active");

  if (name === "admin")   loadAdminRequests();
  if (name === "history") renderTransactions();
}

// ── Balance ──────────────────────────────────────────────────────────────────
// Uses /api/user/balance — no partnerKey required.
async function refreshBalance() {
  if (!state.userId) return;

  const btn = $("refresh-balance-btn");
  if (btn) btn.classList.add("spinning");

  try {
    const res = await apiFetch("/api/user/balance", { userId: state.userId });

    if (res.success) {
      updateBalanceUI(res.balance);
    } else {
      showToast(res.error || "Failed to fetch balance", "error");
    }
  } catch (err) {
    showToast("Network error: " + err.message, "error");
  } finally {
    if (btn) btn.classList.remove("spinning");
  }
}

function updateBalanceUI(newBalance) {
  state.balance = newBalance;
  const formatted = formatLKR(newBalance);

  const el = $("balance-display");
  if (el) {
    el.textContent = formatted;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  const tb = $("topbar-balance-val");
  if (tb) tb.textContent = formatted;
}

// ── Modals ────────────────────────────────────────────────────────────────────
function openModal(id)  { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }

document.addEventListener("click", (e) => {
  ["deposit-modal", "withdraw-modal"].forEach((id) => {
    const overlay = $(id);
    if (overlay && e.target === overlay) closeModal(id);
  });
});

// ── Deposit ───────────────────────────────────────────────────────────────────
async function submitDeposit() {
  const amountInput = $("deposit-amount");
  const utrInput    = $("deposit-utr");

  const amount = parseFloat(amountInput.value);
  const utr    = utrInput.value.trim().replace(/\D/g, "");

  if (!amount || amount <= 0) { shakEl(amountInput); showToast("Enter a valid amount", "warning"); return; }
  if (utr.length !== 12)      { shakEl(utrInput);    showToast("UTR must be exactly 12 digits", "warning"); return; }

  const btn = $("deposit-submit-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-inline"></span> Submitting…`;

  try {
    const res = await apiFetch("/api/user/deposit", {
      userId: state.userId,
      amount,
      utr,
    });

    if (res.success) {
      showToast("Deposit request submitted! Awaiting admin approval.", "success");
      amountInput.value = "";
      utrInput.value    = "";
      closeModal("deposit-modal");
    } else {
      showToast(res.error || "Deposit failed", "error");
    }
  } catch (err) {
    showToast("Network error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>💰</span> Submit Deposit Request`;
  }
}

// ── Withdraw ──────────────────────────────────────────────────────────────────
async function submitWithdraw() {
  const amountInput = $("withdraw-amount");
  const upiInput    = $("withdraw-upi");

  const amount = parseFloat(amountInput.value);
  const upiId  = upiInput.value.trim();

  if (!amount || amount <= 0) { shakEl(amountInput); showToast("Enter a valid amount", "warning"); return; }
  if (!upiId)                 { shakEl(upiInput);    showToast("Enter your UPI ID", "warning");    return; }

  const btn = $("withdraw-submit-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-inline"></span> Submitting…`;

  try {
    const res = await apiFetch("/api/user/withdraw", {
      userId: state.userId,
      amount,
      upiId,
    });

    if (res.success) {
      showToast("Withdrawal request submitted! Awaiting admin approval.", "success");
      amountInput.value = "";
      upiInput.value    = "";
      closeModal("withdraw-modal");
    } else {
      showToast(res.error || "Withdrawal failed", "error");
    }
  } catch (err) {
    showToast("Network error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>🏧</span> Submit Withdrawal Request`;
  }
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
// Only reachable when userId === PIDIYAN (enforced server-side too).

async function loadAdminRequests() {
  // Guard: only PIDIYAN can see admin
  if (state.userId.toUpperCase() !== ADMIN_ID.toUpperCase()) {
    showToast("Admin access denied", "error");
    switchTab("lobby");
    return;
  }

  const list = $("admin-req-list");
  list.innerHTML = `<div class="tx-empty"><div class="spinner" style="margin:0 auto 12px;"></div>Loading…</div>`;

  try {
    // GET with adminUser as query param
    const res = await fetch(
      `${API_BASE}/api/admin/requests?adminUser=${encodeURIComponent(state.userId)}`
    );
    const data = await res.json();

    if (data.success) {
      state.adminRequests = data.requests;
      renderAdminRequests();
    } else {
      list.innerHTML = `<div class="tx-empty">Error: ${data.error}</div>`;
    }
  } catch (err) {
    list.innerHTML = `<div class="tx-empty">Network error: ${err.message}</div>`;
  }
}

function filterAdmin(filter) {
  state.adminFilter = filter;
  ["all", "pending", "deposit", "withdraw"].forEach((f) => {
    $(`atab-${f}`).classList.toggle("active", f === filter);
  });
  renderAdminRequests();
}

function renderAdminRequests() {
  const list  = $("admin-req-list");
  const badge = $("admin-pending-badge");
  let   reqs  = state.adminRequests;

  const pendingCount = reqs.filter((r) => r.status === "pending").length;
  badge.textContent  = `${pendingCount} pending`;

  if (state.adminFilter === "pending")  reqs = reqs.filter((r) => r.status === "pending");
  if (state.adminFilter === "deposit")  reqs = reqs.filter((r) => r.type === "deposit");
  if (state.adminFilter === "withdraw") reqs = reqs.filter((r) => r.type === "withdraw");

  if (reqs.length === 0) {
    list.innerHTML = `<div class="tx-empty">No requests found.</div>`;
    return;
  }

  list.innerHTML = reqs.map((r) => {
    const isDeposit  = r.type === "deposit";
    const typeIcon   = isDeposit ? "💳" : "🏦";
    const typeLabel  = isDeposit ? "Deposit" : "Withdrawal";
    const statusCls  = r.status === "approved" ? "status-ok" : r.status === "rejected" ? "status-err" : "status-pend";
    const statusIcon = r.status === "approved" ? "✅" : r.status === "rejected" ? "❌" : "🕐";
    const detail     = isDeposit
      ? `UTR: <strong>${r.utr}</strong>`
      : `UPI: <strong>${r.upiId}</strong>`;
    const date = new Date(r.createdAt).toLocaleString("en-IN", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const actionBtns = r.status === "pending"
      ? `<div class="admin-actions">
           <button class="btn btn-approve btn-sm" onclick="adminApprove('${r.id}')">✓ Accept</button>
           <button class="btn btn-reject btn-sm"  onclick="adminReject('${r.id}')">✗ Reject</button>
         </div>`
      : `<span class="admin-done-label ${statusCls}">${statusIcon} ${r.status}</span>`;

    return `
      <div class="admin-req-item" id="req-${r.id}">
        <div class="admin-req-icon ${isDeposit ? "deposit" : "withdraw"}">${typeIcon}</div>
        <div class="admin-req-info">
          <div class="admin-req-title">
            <span class="admin-type-label">${typeLabel}</span>
            <span class="admin-req-user">@${r.userId}</span>
          </div>
          <div class="admin-req-meta">${detail} · ${date}</div>
        </div>
        <div class="admin-req-amount">${formatINR(r.amount / 100)}</div>
        <div class="admin-req-ctrl">${actionBtns}</div>
      </div>
    `;
  }).join("");
}

async function adminApprove(requestId) {
  _disableReqButtons(requestId);

  try {
    const res = await apiFetch("/api/admin/approve", {
      requestId,
      adminUser: state.userId,
    });

    if (res.success) {
      showToast("Request approved! Balance updated.", "success");
      // Patch in-memory state and redraw
      const idx = state.adminRequests.findIndex((r) => r.id === requestId);
      if (idx !== -1) state.adminRequests[idx] = res.request;
      renderAdminRequests();
    } else {
      showToast(res.error || "Approval failed", "error");
      _enableReqButtons(requestId);
    }
  } catch (err) {
    showToast("Network error: " + err.message, "error");
    _enableReqButtons(requestId);
  }
}

async function adminReject(requestId) {
  _disableReqButtons(requestId);

  try {
    const res = await apiFetch("/api/admin/reject", {
      requestId,
      adminUser: state.userId,
    });

    if (res.success) {
      showToast("Request rejected.", "info");
      const idx = state.adminRequests.findIndex((r) => r.id === requestId);
      if (idx !== -1) state.adminRequests[idx] = res.request;
      renderAdminRequests();
    } else {
      showToast(res.error || "Rejection failed", "error");
      _enableReqButtons(requestId);
    }
  } catch (err) {
    showToast("Network error: " + err.message, "error");
    _enableReqButtons(requestId);
  }
}

function _disableReqButtons(requestId) {
  const row = $(`req-${requestId}`);
  if (row) row.querySelectorAll("button").forEach((b) => { b.disabled = true; });
}
function _enableReqButtons(requestId) {
  const row = $(`req-${requestId}`);
  if (row) row.querySelectorAll("button").forEach((b) => { b.disabled = false; });
}

// ── Aviator Game Launch ──────────────────────────────────────────────────────
async function launchAviator() {
  if (!state.userId) { showToast("Please log in first", "warning"); return; }

  const btn = $("open-lobby-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-inline"></span> Authenticating…`;

  try {
    const res = await apiFetch("/api/auth/launch", {
      userId:   state.userId,
      username: state.username,
      gameCode: "aviator"
    });

    if (res.success && res.launchURL) {
      if (res.mock) showToast("Using demo URL (no partnerKey configured)", "warning");
      openGameIframe(res.launchURL);
    } else {
      showToast(res.error || "Could not get launch URL", "error");
    }
  } catch (err) {
    showToast("Launch failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-icon">▶</span> Launch Aviator`;
  }
}

// ── Game Iframe ───────────────────────────────────────────────────────────────
function openGameIframe(url) {
  const overlay = $("game-overlay");
  const iframe  = $("game-iframe");
  const loader  = $("iframe-loader");

  loader.style.display = "flex";
  iframe.src = "";
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  $("topbar-balance-val").textContent = formatLKR(state.balance);

  setTimeout(() => {
    iframe.src = url;
    iframe.onload = () => { loader.style.display = "none"; };
    setTimeout(() => { loader.style.display = "none"; }, 8000);
  }, 350);

  state._balancePollInterval = setInterval(refreshBalance, 5000);
}

function closeGame() {
  const overlay = $("game-overlay");
  const iframe  = $("game-iframe");

  if (!overlay) return;
  overlay.classList.add("hidden");
  if (iframe) iframe.src = "";
  document.body.style.overflow = "";

  if (state._balancePollInterval) {
    clearInterval(state._balancePollInterval);
    state._balancePollInterval = null;
  }
  refreshBalance();
}

// ── Test Wallet (dev sandbox) ─────────────────────────────────────────────────
async function testDebit() {
  if (!state.userId) { showToast("Login first", "warning"); return; }
  const txId = `frontend-debit-${state.userId}-${++state.txCounter}-${Date.now()}`;
  try {
    const res = await apiFetch("/api/wallet/debit", {
      userId: state.userId,
      amount: 10,
      transactionData: { id: txId, providerRoundId: "test-round-001" },
    });
    if (res.success) {
      updateBalanceUI(res.balance);
      addLocalTransaction({ type: "debit", amount: 10, id: txId });
      showToast("LKR 10.00 deducted (test bet)", "info");
    } else {
      showToast(res.error || "Debit failed", "error");
    }
  } catch (err) { showToast(err.message, "error"); }
}

async function testCredit() {
  if (!state.userId) { showToast("Login first", "warning"); return; }
  const txId = `frontend-credit-${state.userId}-${++state.txCounter}-${Date.now()}`;
  try {
    const res = await apiFetch("/api/wallet/credit", {
      userId: state.userId,
      amount: 25,
      transactionData: { id: txId, providerRoundId: "test-round-001" },
    });
    if (res.success) {
      updateBalanceUI(res.balance);
      addLocalTransaction({ type: "credit", amount: 25, id: txId });
      showToast("LKR 25.00 credited (test win)", "success");
    } else {
      showToast(res.error || "Credit failed", "error");
    }
  } catch (err) { showToast(err.message, "error"); }
}

// ── Transaction History ───────────────────────────────────────────────────────
function addLocalTransaction({ type, amount, id }) {
  state.transactions.unshift({ id, type, amount, createdAt: new Date().toISOString() });
  renderTransactions();
}

function renderTransactions() {
  const list  = $("tx-list");
  const badge = $("tx-count-badge");
  const txs   = state.transactions;

  badge.textContent = `${txs.length} record${txs.length !== 1 ? "s" : ""}`;

  if (txs.length === 0) {
    list.innerHTML = `<div class="tx-empty">No transactions yet. Play a game to get started!</div>`;
    return;
  }

  list.innerHTML = txs.map((tx) => {
    const isCredit = tx.type === "credit";
    const icon     = isCredit ? "💰" : "🎲";
    const sign     = isCredit ? "+" : "−";
    const date     = new Date(tx.createdAt).toLocaleString("en-IN", {
      dateStyle: "short", timeStyle: "short",
    });
    return `
      <div class="tx-item">
        <div class="tx-icon ${tx.type}">${icon}</div>
        <div class="tx-info">
          <div class="tx-type">${tx.type}</div>
          <div class="tx-meta">ID: ${tx.id.substring(0, 36)} · ${date}</div>
        </div>
        <div class="tx-amount ${tx.type}">${sign}${formatLKR(tx.amount)}</div>
      </div>
    `;
  }).join("");
}

// ── API Fetch ─────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, body = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({
    success: false,
    error:   `HTTP ${response.status}`,
  }));
  return data;
}

// ── Format Currency ───────────────────────────────────────────────────────────
function formatLKR(amount) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency", currency: "LKR", minimumFractionDigits: 2,
  }).format(amount);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
const TOAST_ICONS = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };

function showToast(message, type = "info", duration = 3500) {
  const container = $("toast-container");
  const toast     = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || "💬"}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}

// ── Shake ─────────────────────────────────────────────────────────────────────
function shakEl(el) {
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "shake 0.4s ease";
  el.addEventListener("animationend", () => { el.style.animation = ""; }, { once: true });
}

const shakeStyle = document.createElement("style");
shakeStyle.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%     {transform:translateX(-8px)}
    40%     {transform:translateX(8px)}
    60%     {transform:translateX(-5px)}
    80%     {transform:translateX(5px)}
  }
  .spinning { animation: spin 0.6s linear infinite !important; }
  .spinner-inline {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 9999px;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
  }
`;
document.head.appendChild(shakeStyle);
