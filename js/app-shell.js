// ============================================================
// app-shell.js
// Boots up the main app after signup/login, the Settings screen, the service worker (offline support), and the "install this app" prompt.
// ============================================================

// ---------- Bring the app shell to life after signup / login ----------
async function initAppShell() {
  loadFeed(); // fires its own fetch — doesn't need to be awaited before showing the rest
  await fetchNotifications();
  renderNotifications();
  renderOwnProfile();
}

// ---------- Settings ----------
document.getElementById("rail-settings-link").addEventListener("click", () => goto("screen-settings"));
const desktopSidebarLogout = document.getElementById("desktop-sidebar-logout");
if (desktopSidebarLogout) desktopSidebarLogout.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  currentUser = null;
  feedLoaded = false;
  posts = [];
  notifications = [];
  resetAuthForms();
  goto("screen-welcome");
  showToast("Logged out");
});
document.getElementById("settings-edit-profile").addEventListener("click", () => openEditProfile());
document.getElementById("settings-change-password").addEventListener("click", () => showToast("Password change is coming in phase 05"));
document.querySelectorAll(".toggle-switch").forEach((btn) => {
  btn.addEventListener("click", () => {
    const isOn = btn.classList.toggle("on");
    btn.setAttribute("aria-checked", String(isOn));
  });
});
document.getElementById("settings-logout").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  currentUser = null;
  feedLoaded = false;
  posts = [];
  notifications = [];
  resetAuthForms();
  goto("screen-welcome");
  showToast("Logged out");
});
document.getElementById("settings-delete").addEventListener("click", () => {
  showToast("Account deletion isn't wired up yet — coming soon", "error");
});

// ---------- Resume an existing login on page load ----------
// Without this, refreshing the page (or reopening the installed app) would
// always dump someone back at the welcome screen, even though Supabase
// still has a valid session for them.
(async function restoreSession() {
  const { data } = await supabaseClient.auth.getSession();
  const session = data && data.session;
  if (!session || handlingPasswordRecovery) return;

  const { data: profile, error } = await supabaseClient
    .from("profiles").select("*").eq("id", session.user.id).single();
  if (error || !profile) {
    // Signed in but no profile row yet (e.g. they verified their email
    // and closed the app before finishing signup Step 3) — resume them
    // there directly rather than leaving them stranded on the welcome
    // screen with a working account and no way back in.
    await resumeProfileSetup();
    return;
  }

  currentUser = personFromProfileRow(profile);
  initAppShell();
  goto("screen-feed", "forward", { replace: true });
  maybeStartTour();
})();

// ---------- Service worker ----------
// Picks up updates without the person having to know what a service worker
// is: once a newly-installed worker takes control, the old one's cached
// files are gone from under the current tab, so it reloads once
// automatically to pull in the fresh version instead of leaving someone on
// a half-old, half-new page.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker registration failed:", err));
  });

  let refreshedAlready = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshedAlready) return;
    refreshedAlready = true;
    window.location.reload();
  });
}

// ---------- PWA install prompt ----------
const installBanner = document.getElementById("install-banner");
const installBannerIOS = document.getElementById("install-banner-ios");
let deferredInstallPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

if (!isStandalone()) {
  // Chromium browsers (Android/desktop Chrome/Edge): the browser tells us
  // when the app is actually installable — capture that moment instead of
  // guessing, and show our own banner instead of the default mini-infobar.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBanner.classList.add("show");
  });
  window.addEventListener("appinstalled", () => {
    installBanner.classList.remove("show");
    deferredInstallPrompt = null;
  });

  // iOS Safari never fires beforeinstallprompt — there's no programmatic
  // install, only manual "Share -> Add to Home Screen", so just point
  // people at it after they've had a moment to look around.
  if (isIOS()) {
    setTimeout(() => installBannerIOS.classList.add("show"), 2500);
  }
}

document.getElementById("install-banner-install").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBanner.classList.remove("show");
});
document.getElementById("install-banner-close").addEventListener("click", () => {
  installBanner.classList.remove("show");
});
document.getElementById("install-banner-ios-close").addEventListener("click", () => {
  installBannerIOS.classList.remove("show");
});
