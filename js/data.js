// ============================================================
// data.js  (was mock-data.js — now the real data layer)
// Fetches people, posts, and notifications from Supabase, and caches
// them in the same `posts` / `notifications` / people-cache shape the
// rest of the app already expects, so feed.js, notifications.js, and
// profile.js barely had to change.
// ============================================================

let currentUser = null; // set at signup-finish, login, or session-restore on boot

// Uploads a File to Supabase Storage, inside a folder named after the
// user's own id (matches the "upload into your own folder only" Storage
// policies in supabase-schema.sql), and returns its public URL.
async function uploadToStorage(bucket, file, userId) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabaseClient.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// Cache of { username: personObject } — avoids refetching the same
// person's profile every time their name/avatar needs showing (e.g. next
// to every one of their posts).
const peopleCache = {};

function personFromProfileRow(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    faculty: row.faculty || "",
    department: row.department || "",
    level: row.level || "",
    avatarDataUrl: row.avatar_url || "",
    tone: (row.username || "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 4,
  };
}

// Synchronous lookup used everywhere posts/comments/notifications render —
// returns cached info immediately, and kicks off a background fetch to
// warm the cache if this person hasn't been seen yet (the UI just shows
// "Loading…" briefly the first time, then fills in on the next render).
function getPerson(username) {
  if (currentUser && username === currentUser.username) return currentUser;
  if (peopleCache[username]) return peopleCache[username];
  fetchPersonByUsername(username); // fire-and-forget; caches for next render
  return { username, name: "Loading…", faculty: "", department: "", level: "", avatarDataUrl: "", tone: 0 };
}
async function fetchPersonByUsername(username) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .ilike("username", username)
    .maybeSingle();
  if (error || !data) return;
  peopleCache[username] = personFromProfileRow(data);
}
// Called after a batch fetch (feed load, profile view) so we don't fire
// one request per post — fetch every author we don't already have, once.
async function warmPeopleCache(usernames) {
  const missing = [...new Set(usernames)].filter((u) => !peopleCache[u] && !(currentUser && u === currentUser.username));
  if (missing.length === 0) return;
  const { data, error } = await supabaseClient.from("profiles").select("*").in("username", missing);
  if (error || !data) return;
  data.forEach((row) => { peopleCache[row.username] = personFromProfileRow(row); });
}

function initials(name) {
  return (name || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}
function defaultAvatarMarkup() {
  return `<img class="default-avatar-logo" src="campus-connect-logo.png" alt="Campus Connect">`;
}
function avatarHTML(person, sizeClass = "avatar-circle-sm") {
  if (person.avatarDataUrl) return `<div class="avatar-circle ${sizeClass}"><img src="${person.avatarDataUrl}" alt=""></div>`;
  return `<div class="avatar-circle ${sizeClass} avatar-default">${defaultAvatarMarkup()}</div>`;
}
function setAvatarInto(containerEl, person) {
  containerEl.className = "avatar-circle avatar-circle-lg" + (person.avatarDataUrl ? "" : " avatar-default");
  containerEl.innerHTML = person.avatarDataUrl ? `<img src="${person.avatarDataUrl}" alt="">` : defaultAvatarMarkup();
}
function setSmallAvatarInto(containerEl, person) {
  containerEl.className = "avatar-circle avatar-circle-sm" + (person.avatarDataUrl ? "" : " avatar-default");
  containerEl.innerHTML = person.avatarDataUrl ? `<img src="${person.avatarDataUrl}" alt="">` : defaultAvatarMarkup();
}
function setMediumAvatarInto(containerEl, person) {
  containerEl.className = "avatar-circle avatar-circle-md" + (person.avatarDataUrl ? "" : " avatar-default");
  containerEl.innerHTML = person.avatarDataUrl ? `<img src="${person.avatarDataUrl}" alt="">` : defaultAvatarMarkup();
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Live data, fetched from Supabase ----------
// Kept as plain arrays (not re-fetched on every render) so feed.js /
// profile.js can keep doing simple posts.filter(...) / posts.find(...)
// exactly like before — fetchPosts()/fetchNotifications() are what
// refill them.
let posts = [];
let notifications = [];

function postRowToPost(row) {
  return {
    id: row.id,
    authorUsername: row.author_username,
    text: row.text,
    media: !row.media_type ? null : {
      type: row.media_type,
      images: row.media_type === "image" ? (row.media_urls || []) : [],
      count: row.media_type === "image" ? (row.media_urls || []).length : 1,
      dataUrl: row.media_type === "video" ? (row.media_urls || [])[0] : undefined,
    },
    createdAt: new Date(row.created_at).getTime(),
    likes: row.like_count || 0,
    liked: !!row.liked_by_me,
    comments: [], // filled in on demand when the comments modal opens (see feed.js)
  };
}

// Posts joined with their author's username, a like count, and whether
// *I* liked it — done with two lightweight follow-up queries rather than
// one giant SQL view, so the query stays readable if you ever want to
// tweak it.
async function fetchPosts() {
  const { data: postRows, error } = await supabaseClient
    .from("posts")
    .select("id, author_id, text, media_type, media_urls, created_at, profiles!posts_author_id_fkey(username)")
    .order("created_at", { ascending: false });
  if (error || !postRows) { console.warn("fetchPosts failed:", error); return; }

  const postIds = postRows.map((r) => r.id);
  let likeCounts = {};
  let myLikes = new Set();
  if (postIds.length > 0) {
    const { data: likeRows } = await supabaseClient.from("likes").select("post_id, user_id").in("post_id", postIds);
    (likeRows || []).forEach((l) => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (currentUser && l.user_id === currentUser.id) myLikes.add(l.post_id);
    });
  }

  posts = postRows.map((row) => postRowToPost({
    ...row,
    author_username: row.profiles ? row.profiles.username : "unknown",
    like_count: likeCounts[row.id] || 0,
    liked_by_me: myLikes.has(row.id),
  }));

  await warmPeopleCache(posts.map((p) => p.authorUsername));
}

async function fetchCommentsFor(postId) {
  const { data, error } = await supabaseClient
    .from("comments")
    .select("id, text, created_at, profiles!comments_author_id_fkey(username)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const comments = data.map((row) => ({
    authorUsername: row.profiles ? row.profiles.username : "unknown",
    text: row.text,
    createdAt: new Date(row.created_at).getTime(),
  }));
  await warmPeopleCache(comments.map((c) => c.authorUsername));
  return comments;
}

async function fetchNotifications() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from("notifications")
    .select("id, type, post_id, read, created_at, profiles!notifications_actor_id_fkey(username)")
    .eq("recipient_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error || !data) { console.warn("fetchNotifications failed:", error); return; }
  notifications = data.map((row) => ({
    id: row.id,
    type: row.type,
    actorUsername: row.profiles ? row.profiles.username : "unknown",
    postId: row.post_id,
    read: row.read,
    createdAt: new Date(row.created_at).getTime(),
  }));
  await warmPeopleCache(notifications.map((n) => n.actorUsername));
}
