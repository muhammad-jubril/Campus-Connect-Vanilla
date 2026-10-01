// ============================================================
// ui-helpers.js
// Small reusable UI pieces used all over the app: screen navigation/transitions, the bottom tab bar, toast messages, the branded loading overlay, and the 3-step signup indicator.
// ============================================================

// ---------- Navigation (with slide direction + real browser history) ----------
// This is a single-page app — every "screen" is just a div, toggled with
// CSS. On its own, the browser (and Android's back button/gesture) only
// ever sees ONE page load, so pressing back has nothing to step through and
// just closes the app entirely. Fix: every real navigation pushes a virtual
// history entry, and a popstate listener replays it when the user goes
// back — so back button and in-app back buttons both walk the same stack.
const SCREEN_STEP_MAP = { "screen-signup-1": 1, "screen-signup-2": 2, "screen-signup-3": 3 };

// Pure rendering — no history side effects. Used both by the public
// goto()/switchTab() below AND by the popstate handler, so a "back" action
// and a forward navigation to the same screen look identical.
function renderScreen(screenId, direction = "forward") {
  document.getElementById("app").classList.toggle("app-wide", screenId === "screen-feed");
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.remove("active", "slide-fwd", "slide-back");
  });
  document.getElementById(screenId).classList.add("active", direction === "back" ? "slide-back" : "slide-fwd");
  window.scrollTo(0, 0);
  if (SCREEN_STEP_MAP[screenId]) setStep(SCREEN_STEP_MAP[screenId]);
}

function renderTab(tab) {
  // Tabs live inside screen-feed — only re-reveal/animate the screen itself
  // if we're arriving from somewhere else (e.g. back from Settings); a
  // plain tap between Home/Explore/Notifications/Profile shouldn't replay
  // the screen-level slide or reset scroll.
  if (!document.getElementById("screen-feed").classList.contains("active")) {
    renderScreen("screen-feed", "back");
  }
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.querySelectorAll(".sidebar-item, .bottom-nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  if (typeof updateFabVisibility === "function") updateFabVisibility(tab);
  if (tab === "home") loadFeed();
  if (tab === "notifications") renderNotifications();
  if (tab === "profile") renderOwnProfile();
  if (tab === "marketplace") loadMarketplace();
}

let suppressHistoryPush = false;
function pushNavState(state, replace = false) {
  if (suppressHistoryPush) return;
  if (replace) history.replaceState(state, "");
  else history.pushState(state, "");
}

// The public functions everything else in the app calls — same as before,
// just now also recording where we've been.
function goto(screenId, direction = "forward", opts = {}) {
  renderScreen(screenId, direction);
  pushNavState({ screen: screenId }, !!opts.replace);
}
document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    goto(el.dataset.goto);
  });
});

// Every "back"/"cancel"/"close" control in the app goes through the real
// browser history instead of a hardcoded target screen — that keeps them
// in sync with the Android back button automatically, and as a bonus fixes
// screens reachable from more than one place (e.g. Terms of Use from both
// the welcome screen and Settings) actually returning to wherever the
// person really came from.
document.querySelectorAll("[data-back]").forEach((el) => {
  el.addEventListener("click", () => history.back());
});

function setDrawerOpen(open) {
  document.getElementById("drawer-overlay").classList.toggle("open", open);
  document.getElementById("drawer-panel").classList.toggle("open", open);
}

window.addEventListener("popstate", (event) => {
  suppressHistoryPush = true;
  const state = event.state;
  if (state) {
    renderScreen(state.screen, "back");
    if (state.tab) renderTab(state.tab);
    setDrawerOpen(!!state.drawer);
  } else {
    setDrawerOpen(false);
  }
  suppressHistoryPush = false;
});

// Baseline entry so there's always something under the very first screen —
// without this, the first goto() call would push on top of the browser's
// default null-state entry, which still tends to close the app on the
// second back-press rather than landing cleanly on the welcome screen.
history.replaceState({ screen: document.querySelector(".screen.active")?.id || "screen-welcome" }, "");

// ---------- Post-auth tab navigation (sidebar / bottom nav) ----------
function switchTab(tab, opts = {}) {
  if (tab === "create") {
    goto("screen-create-post");
    return;
  }
  renderTab(tab);
  pushNavState({ screen: "screen-feed", tab }, !!opts.replace);
}
document.querySelectorAll(".sidebar-item, .sidebar-profile-mini, .bottom-nav-item, .rail-link[data-tab]").forEach((el) => {
  el.addEventListener("click", () => switchTab(el.dataset.tab));
});
document.querySelectorAll(".desktop-sidebar-link[data-goto]").forEach((el) => {
  el.addEventListener("click", () => goto(el.dataset.goto));
});

// ---------- Toast ----------
let toastTimer;
function showToast(message, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// ---------- Branded loader (used between steps + async actions) ----------
// `task` is an async function containing the real work (a Supabase call,
// an upload, etc). The spinner shows the instant this is called and stays
// up for as long as `task` actually takes — the checkmark only plays once
// the real work has genuinely finished, not on a guessed timer. A small
// minimum spin time keeps it from flashing on near-instant operations, and
// a short hold after success gives the checkmark a moment to register.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function showLoader(text, task) {
  const overlay = document.getElementById("loader-overlay");
  document.getElementById("loader-text").textContent = text;
  overlay.classList.remove("success");
  overlay.classList.add("show");

  const MIN_SPIN_MS = 450;
  const SUCCESS_HOLD_MS = 550;
  const start = Date.now();

  let result, error;
  try {
    result = task ? await task() : undefined;
  } catch (err) {
    error = err;
  }

  const elapsed = Date.now() - start;
  if (elapsed < MIN_SPIN_MS) await sleep(MIN_SPIN_MS - elapsed);

  if (!error) {
    overlay.classList.add("success");
    await sleep(SUCCESS_HOLD_MS);
  }
  overlay.classList.remove("show", "success");

  if (error) throw error;
  return result;
}

// Shake a field to draw attention to what's missing, without silently doing nothing
function shakeField(el) {
  if (!el) return;
  el.classList.remove("shake-error");
  void el.offsetWidth; // restart animation
  el.classList.add("shake-error");
  setTimeout(() => el.classList.remove("shake-error"), 400);
}
function joinList(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// Tactile ripple on every primary button tap
document.querySelectorAll(".btn-primary").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "btn-ripple";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
    ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 550);
  });
});

// ---------- Step indicator (numbered nodes, matching the reference style) ----------
const STEP_LABELS = ["Account", "Verify email", "Profile"];
function stepIndicatorHTML(current) {
  let html = "";
  for (let i = 1; i <= 3; i++) {
    const state = i < current ? "completed" : i === current ? "current" : "upcoming";
    const inner = state === "completed"
      ? `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="m9.5 16.2-3.5-3.5L4.6 14l4.9 4.9L20 8.4l-1.4-1.4z"/></svg>`
      : state === "current"
        ? `<span class="step-dot"></span>`
        : i;
    html += `<div class="step-node ${state}"><div class="step-circle">${inner}</div><div class="step-label">${STEP_LABELS[i - 1]}</div></div>`;
    if (i < 3) html += `<div class="step-line ${i < current ? "completed" : ""}"></div>`;
  }
  return html;
}
function setStep(n) {
  document.querySelectorAll(".step-indicator").forEach((el) => { el.innerHTML = stepIndicatorHTML(n); });
}
setStep(1);

