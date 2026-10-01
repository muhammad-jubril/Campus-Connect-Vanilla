// ============================================================
// onboarding.js
// The post-signup dashboard shell: the mobile drawer (Groups, Communities,
// Lost & Found, Help & Support, App Settings), the floating create button's
// scroll-fade behavior, the Chats entry point, and the first-time coach-mark
// tour pointing at the main features.
// ============================================================

// ---------- Mobile drawer ----------
function openDrawer() {
  setDrawerOpen(true);
  pushNavState(Object.assign({}, history.state, { drawer: true }));
}
function closeDrawer() {
  if (history.state && history.state.drawer) history.back();
  else setDrawerOpen(false);
}
document.querySelectorAll(".mobile-menu-toggle").forEach((button) => button.addEventListener("click", openDrawer));
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
document.getElementById("drawer-overlay").addEventListener("click", closeDrawer);
document.querySelectorAll(".drawer-link[data-goto]").forEach((el) => {
  el.addEventListener("click", () => setDrawerOpen(false));
});
document.getElementById("drawer-profile-link").addEventListener("click", () => {
  setDrawerOpen(false);
  switchTab("profile");
});
document.getElementById("drawer-logout").addEventListener("click", () => {
  setDrawerOpen(false);
  document.getElementById("settings-logout").click();
});

// ---------- Floating create button — fades while scrolling ----------
const fabCreate = document.getElementById("fab-create");

// The floating create action belongs to the two places where creating a post
// makes sense in the main shell: Home and your own Profile.
function updateFabVisibility(tab) {
  const show = tab === "home" || tab === "profile";
  fabCreate.classList.toggle("fab-tab-hidden", !show);
  fabCreate.setAttribute("aria-hidden", String(!show));
  fabCreate.tabIndex = show ? 0 : -1;
}

fabCreate.addEventListener("click", () => goto("screen-create-post"));

let fabLastScrollTop = 0;
let fabTicking = false;
document.querySelector(".app-content-main").addEventListener("scroll", (e) => {
  if (fabTicking) return;
  fabTicking = true;
  requestAnimationFrame(() => {
    const top = e.target.scrollTop;
    if (top > fabLastScrollTop && top > 40) fabCreate.classList.add("fab-hidden");
    else fabCreate.classList.remove("fab-hidden");
    fabLastScrollTop = top;
    fabTicking = false;
  });
});

// ---------- Chats entry point ----------
document.getElementById("btn-open-chats").addEventListener("click", () => goto("screen-chats"));

// ============================================================
// First-time coach-mark tour
// ============================================================
const TOUR_SEEN_KEY = "cc_tour_seen";
const TOUR_STEPS = [
  {
    selectors: ["#fab-create", '.sidebar-item[data-tab="create"]'],
    text: "Tap here to create a post — text, photos, or a short video.",
  },
  {
    selectors: ["#btn-open-chats"],
    text: "Chats are coming soon — this is where you'll message other students.",
  },
  {
    selectors: ["#home-search-trigger", "#desktop-search-trigger"],
    text: "Search for other students by name or username.",
  },
  {
    selectors: [".mobile-menu-toggle", "#rail-quicklinks-card"],
    text: "Groups, Communities, Lost & Found, and more live here.",
  },
  {
    selectors: ['.bottom-nav-item[data-tab="marketplace"]', '.sidebar-item[data-tab="marketplace"]'],
    text: "Buy, sell, and swap with other NWU students — coming soon.",
  },
  {
    selectors: ['.bottom-nav-item[data-tab="notifications"]', '.sidebar-item[data-tab="notifications"]'],
    text: "Likes, comments, and updates show up here.",
  },
  {
    selectors: ['.bottom-nav-item[data-tab="profile"]', '.sidebar-item[data-tab="profile"]'],
    text: "Your profile, your posts, and your settings.",
  },
];

function pickVisible(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

function startTour() {
  let stepIndex = 0;
  let shownAtLeastOnce = false;
  const overlay = document.createElement("div");
  overlay.className = "tour-overlay";
  const tooltip = document.createElement("div");
  tooltip.className = "tour-tooltip";
  document.body.append(overlay, tooltip);

  function clearHighlight() {
    document.querySelectorAll(".tour-highlight").forEach((el) => el.classList.remove("tour-highlight"));
  }

  function endTour() {
    clearHighlight();
    overlay.remove();
    tooltip.remove();
    // Only remember "seen" if a step actually rendered — a run that found
    // nothing visible (e.g. triggered from the wrong screen) shouldn't
    // silently poison every future signup/login into never showing it.
    if (shownAtLeastOnce) localStorage.setItem(TOUR_SEEN_KEY, "1");
  }

  function showStep() {
    clearHighlight();
    const step = TOUR_STEPS[stepIndex];
    const target = pickVisible(step.selectors);
    if (!target) {
      // Don't cascade through every remaining step in the same tick — that
      // can flash-and-vanish before the browser ever paints a frame. Give
      // it a beat, in case something (like a screen transition) just needs
      // a moment to finish rendering.
      requestAnimationFrame(advance);
      return;
    }
    shownAtLeastOnce = true;

    target.classList.add("tour-highlight");
    const rect = target.getBoundingClientRect();
    const isLast = stepIndex === TOUR_STEPS.length - 1;
    tooltip.innerHTML =
      '<p class="tour-tooltip-text"></p>' +
      '<div class="tour-tooltip-footer">' +
        '<span class="tour-progress">' + (stepIndex + 1) + " / " + TOUR_STEPS.length + "</span>" +
        '<div class="tour-tooltip-actions">' +
          '<button type="button" class="tour-btn tour-skip">Skip</button>' +
          '<button type="button" class="tour-btn tour-btn-primary tour-next">' + (isLast ? "Done" : "Next") + "</button>" +
        "</div>" +
      "</div>";
    tooltip.querySelector(".tour-tooltip-text").textContent = step.text;
    tooltip.querySelector(".tour-skip").addEventListener("click", endTour);
    tooltip.querySelector(".tour-next").addEventListener("click", advance);

    // Position below the target if there's room, otherwise above it.
    const spaceBelow = window.innerHeight - rect.bottom;
    const tooltipWidth = Math.min(280, window.innerWidth - 32);
    tooltip.style.width = tooltipWidth + "px";
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    tooltip.style.left = left + "px";
    if (spaceBelow > 140) {
      tooltip.style.top = (rect.bottom + 14) + "px";
      tooltip.classList.remove("tour-tooltip-above");
    } else {
      tooltip.style.top = (rect.top - 14) + "px";
      tooltip.classList.add("tour-tooltip-above");
    }
  }

  function advance() {
    stepIndex++;
    if (stepIndex >= TOUR_STEPS.length) { endTour(); return; }
    showStep();
  }

  overlay.addEventListener("click", endTour);
  showStep();
}

function maybeStartTour() {
  if (localStorage.getItem(TOUR_SEEN_KEY)) return;
  setTimeout(() => {
    document.querySelector(".app-content-main").scrollTop = 0;
    fabCreate.classList.remove("fab-hidden");
    startTour();
  }, 500);
}

function replayTour() {
  localStorage.removeItem(TOUR_SEEN_KEY);
  // Whatever screen/tab this was tapped from (Settings, Help & Support —
  // anywhere), the tour's targets only exist on the Home tab of the feed.
  // Land there first, or every step fails to find anything visible.
  switchTab("home", { replace: true });
  document.querySelector(".app-content-main").scrollTop = 0;
  fabCreate.classList.remove("fab-hidden");
  setTimeout(startTour, 350);
}
document.getElementById("settings-replay-tour").addEventListener("click", replayTour);
document.getElementById("help-replay-tour").addEventListener("click", replayTour);

