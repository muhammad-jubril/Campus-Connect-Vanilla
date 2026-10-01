// ============================================================
// notifications.js
// The notifications tab — likes and comments on your posts.
// ============================================================

// ---------- Notifications ----------
function notifIconHTML(type) {
  if (type === "like") {
    return `<div class="notif-icon like"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6C3.2 5.9 5.4 4 7.9 4c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2 2.5 0 4.5 1.9 4.5 4.6z"/></svg></div>`;
  }
  return `<div class="notif-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>`;
}
function notifTextHTML(n) {
  const actor = getPerson(n.actorUsername);
  return n.type === "like"
    ? `<b>${escapeHTML(actor.name)}</b> liked your post`
    : `<b>${escapeHTML(actor.name)}</b> commented on your post`;
}
function renderNotifications() {
  const listEl = document.getElementById("notif-list");
  const emptyEl = document.getElementById("notif-empty");
  const sorted = notifications.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (sorted.length === 0) {
    listEl.style.display = "none";
    emptyEl.style.display = "flex";
  } else {
    listEl.style.display = "block";
    emptyEl.style.display = "none";
    listEl.innerHTML = sorted.map((n) => `
      <div class="notif-item ${n.read ? "" : "unread"}" data-notif-id="${n.id}">
        ${notifIconHTML(n.type)}
        <div style="flex:1">
          <div class="notif-text">${notifTextHTML(n)}</div>
          <div class="notif-time">${timeAgo(n.createdAt)}</div>
        </div>
        ${n.read ? "" : `<div class="notif-dot"></div>`}
      </div>`).join("");
  }
  updateNotifBadge();
}
function updateNotifBadge() {
  const unread = notifications.filter((n) => !n.read).length;
  document.querySelectorAll(".nav-badge").forEach((el) => el.classList.toggle("show", unread > 0));
}
document.getElementById("notif-list").addEventListener("click", async (e) => {
  const item = e.target.closest(".notif-item");
  if (!item) return;
  const n = notifications.find((x) => x.id === item.dataset.notifId);
  if (!n) return;

  if (!n.read) {
    n.read = true;
    renderNotifications();
    const { error } = await supabaseClient.from("notifications").update({ read: true }).eq("id", n.id);
    if (error) console.warn("Marking notification read failed:", error); // non-critical — UI already reflects it
  }

  switchTab("home");
  setTimeout(() => {
    const postEl = document.getElementById(`post-${n.postId}`);
    if (postEl) {
      postEl.scrollIntoView({ behavior: "smooth", block: "center" });
      postEl.classList.add("highlight");
      setTimeout(() => postEl.classList.remove("highlight"), 1700);
    }
    if (n.type === "comment") openComments(n.postId);
  }, 150);
});
