// ============================================================
// feed.js
// The home feed: rendering post cards (with photos/video), the like button, and the comments popup.
// ============================================================


const placeholderMediaSVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;

function mediaHTML(media) {
  if (!media) return "";
  if (media.type === "video") {
    return `<div class="post-card-media count-1"><div class="media-block is-video">${
      media.dataUrl
        ? `<video src="${media.dataUrl}" style="width:100%;height:100%;object-fit:cover;" controls muted playsinline></video>`
        : `<svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`
    }</div></div>`;
  }
  const imgs = media.images || [];
  const count = Math.min(media.count || imgs.length || 1, 3);
  const blocks = Array.from({ length: count }).map((_, i) => {
    const src = imgs[i];
    return `<div class="media-block">${src ? `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;">` : placeholderMediaSVG}</div>`;
  }).join("");
  return `<div class="post-card-media count-${count}">${blocks}</div>`;
}

function postCardHTML(post) {
  const author = getPerson(post.authorUsername);
  const isSelf = currentUser && post.authorUsername === currentUser.username;
  return `
    <div class="post-card" id="post-${post.id}" data-post-id="${post.id}">
      <div class="post-card-head" data-author="${post.authorUsername}">
        ${avatarHTML(author)}
        <div>
          <div class="post-card-author">${escapeHTML(author.name)}${isSelf ? " (You)" : ""}</div>
          <div class="post-card-sub">${escapeHTML(author.department || "")}${author.level ? " · " + author.level + " Level" : ""}</div>
        </div>
        <div class="post-card-time">${timeAgo(post.createdAt)}</div>
      </div>
      <div class="post-card-text">${escapeHTML(post.text)}</div>
      ${mediaHTML(post.media)}
      <div class="post-card-actions">
        <button type="button" class="post-action-btn like-btn ${post.liked ? "liked" : ""}" data-post-id="${post.id}">
          <svg viewBox="0 0 24 24" fill="${post.liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.6c0 4.5-8.8 10.4-8.8 10.4S3.2 13.1 3.2 8.6C3.2 5.9 5.4 4 7.9 4c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2 2.5 0 4.5 1.9 4.5 4.6z"/></svg>
          <span class="like-count">${post.likes}</span>
        </button>
        <button type="button" class="post-action-btn comment-btn" data-post-id="${post.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="comment-count">${post.comments.length}</span>
        </button>
      </div>
    </div>`;
}

// ---------- Home feed ----------
const feedPostsEl = document.getElementById("feed-posts");
const feedSkeletonEl = document.getElementById("feed-skeleton");
const feedNewPill = document.getElementById("feed-new-pill");

function renderFeed() {
  feedPostsEl.innerHTML = posts.slice().sort((a, b) => b.createdAt - a.createdAt).map(postCardHTML).join("");
}

let feedLoaded = false;
async function loadFeed() {
  if (feedLoaded) { renderFeed(); return; }
  feedLoaded = true;
  await fetchPosts();
  renderFeed();
  feedSkeletonEl.style.display = "none";
  feedPostsEl.style.display = "block";
}
feedNewPill.addEventListener("click", () => {
  feedNewPill.classList.remove("show");
  document.getElementById("tab-home").scrollTo({ top: 0, behavior: "smooth" });
});

// Delegated post-card interactions — post cards render in the feed, own
// profile, and other-student profile, so this listens at the document level.
document.addEventListener("click", (e) => {
  const likeBtn = e.target.closest(".like-btn");
  if (likeBtn) { toggleLike(likeBtn.dataset.postId); return; }
  const commentBtn = e.target.closest(".comment-btn");
  if (commentBtn) { openComments(commentBtn.dataset.postId); return; }
  const head = e.target.closest(".post-card-head");
  if (head) { openProfile(head.dataset.author); return; }
});

// Creates a notification for the post's author — but never for yourself
// liking/commenting on your own post, and RLS only lets you insert a
// notification where you're the actor, matching who's actually logged in.
async function notifyPostAuthor(post, type) {
  if (!currentUser || post.authorUsername === currentUser.username) return;
  const author = getPerson(post.authorUsername);
  if (!author.id) return; // not cached yet — safe to just skip, not critical
  await supabaseClient.from("notifications").insert({
    recipient_id: author.id, actor_id: currentUser.id, type, post_id: post.id,
  });
}

async function toggleLike(postId) {
  const post = posts.find((p) => p.id === postId);
  if (!post || !currentUser) return;
  const wasLiked = post.liked;

  // Update the UI immediately (optimistic), then sync to the database —
  // reverting on failure so a dropped connection can't leave the button
  // showing something that didn't actually happen.
  post.liked = !wasLiked;
  post.likes += post.liked ? 1 : -1;
  paintLikeButtons(post);

  const { error } = wasLiked
    ? await supabaseClient.from("likes").delete().eq("post_id", postId).eq("user_id", currentUser.id)
    : await supabaseClient.from("likes").insert({ post_id: postId, user_id: currentUser.id });

  if (error) {
    post.liked = wasLiked;
    post.likes += wasLiked ? 1 : -1;
    paintLikeButtons(post);
    showToast("Couldn't update like — check your connection", "error");
    return;
  }
  if (!wasLiked) notifyPostAuthor(post, "like");
}

function paintLikeButtons(post) {
  document.querySelectorAll(`.like-btn[data-post-id="${post.id}"]`).forEach((btn) => {
    btn.classList.toggle("liked", post.liked);
    btn.querySelector("svg").setAttribute("fill", post.liked ? "currentColor" : "none");
    btn.querySelector(".like-count").textContent = post.likes;
    if (post.liked) {
      btn.classList.remove("stamp");
      void btn.offsetWidth; // restart animation
      btn.classList.add("stamp");
      const burst = document.createElement("span");
      burst.className = "like-burst";
      burst.innerHTML = Array.from({ length: 5 }).map((_, i) =>
        `<span style="--ang:${i * 72}deg"></span>`
      ).join("");
      btn.appendChild(burst);
      setTimeout(() => burst.remove(), 550);
    }
  });
}

// ---------- Comments modal ----------
const commentsModal = document.getElementById("comments-modal");
const commentsList = document.getElementById("comments-list");
const commentInput = document.getElementById("comment-input");
let activeCommentsPostId = null;

function renderComments() {
  const post = posts.find((p) => p.id === activeCommentsPostId);
  if (!post) return;
  if (post.comments.length === 0) {
    commentsList.innerHTML = `<div class="suggestion-empty">No comments yet — be the first to reply</div>`;
    return;
  }
  commentsList.innerHTML = post.comments.map((c) => {
    const author = getPerson(c.authorUsername);
    return `<div class="comment-item">
      ${avatarHTML(author)}
      <div class="comment-body">
        <div class="comment-author">${escapeHTML(author.name)}</div>
        <div class="comment-text">${escapeHTML(c.text)}</div>
        <div class="comment-time">${timeAgo(c.createdAt)}</div>
      </div>
    </div>`;
  }).join("");
}
async function openComments(postId) {
  activeCommentsPostId = postId;
  commentInput.value = "";
  commentsModal.classList.add("show");
  commentsList.innerHTML = `<div class="suggestion-empty">Loading comments…</div>`;
  setTimeout(() => commentInput.focus(), 250);

  const post = posts.find((p) => p.id === postId);
  if (post) {
    post.comments = await fetchCommentsFor(postId);
    if (activeCommentsPostId === postId) renderComments(); // still the open modal, not stale
  }
}
document.getElementById("comments-modal-close").addEventListener("click", () => commentsModal.classList.remove("show"));

async function submitComment() {
  const text = commentInput.value.trim();
  if (!text || !activeCommentsPostId || !currentUser) return;
  const post = posts.find((p) => p.id === activeCommentsPostId);
  if (!post) return;

  const btn = document.getElementById("btn-send-comment");
  btn.disabled = true;
  const { error } = await supabaseClient.from("comments").insert({
    post_id: post.id, author_id: currentUser.id, text,
  });
  btn.disabled = false;
  if (error) { showToast("Couldn't send comment — check your connection", "error"); return; }

  post.comments.push({ authorUsername: currentUser.username, text, createdAt: Date.now() });
  commentInput.value = "";
  renderComments();
  document.querySelectorAll(`.comment-btn[data-post-id="${post.id}"] .comment-count`).forEach((el) => {
    el.textContent = post.comments.length;
  });
  notifyPostAuthor(post, "comment");
}
document.getElementById("btn-send-comment").addEventListener("click", submitComment);
commentInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitComment(); });
