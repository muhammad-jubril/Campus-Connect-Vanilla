// ============================================================
// create-post.js
// The "write a post" screen — text, photo/video attachment, and posting.
// ============================================================

// ---------- Create post composer ----------
// `images`/`video` hold data URLs for the live preview; `imageFiles`/
// `videoFile` hold the real File objects, uploaded to Storage on submit —
// kept as parallel arrays/values so removing a preview also removes the
// matching real file (see the remove-media handler below).
let composerMedia = { images: [], imageFiles: [], video: null, videoFile: null };
const postTextEl = document.getElementById("post-text");
const postCharCountEl = document.getElementById("post-char-count");
const postMediaPreview = document.getElementById("post-media-preview");
const postMediaHint = document.getElementById("post-media-hint");
const btnAddImage = document.getElementById("btn-add-image");
const btnAddVideo = document.getElementById("btn-add-video");
const postImageFile = document.getElementById("post-image-file");
const postVideoFile = document.getElementById("post-video-file");
const btnSubmitPost = document.getElementById("btn-submit-post");

postTextEl.addEventListener("input", () => { postCharCountEl.textContent = postTextEl.value.length; });

function renderMediaPreview() {
  let html = "";
  composerMedia.images.forEach((src, i) => {
    html += `<div class="post-media-chip"><img src="${src}" alt=""><button type="button" class="remove-media" data-remove-image="${i}">×</button></div>`;
  });
  if (composerMedia.video) {
    html += `<div class="post-media-chip"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><button type="button" class="remove-media" data-remove-video="1">×</button></div>`;
  }
  postMediaPreview.innerHTML = html;
  const hasImages = composerMedia.images.length > 0;
  const hasVideo = !!composerMedia.video;
  btnAddImage.disabled = hasVideo || composerMedia.images.length >= 3;
  btnAddVideo.disabled = hasImages;
  postMediaHint.textContent = hasVideo ? "Video attached (max 30s)" : hasImages ? `${composerMedia.images.length}/3 images` : "";
}
btnAddImage.addEventListener("click", () => postImageFile.click());
postImageFile.addEventListener("change", () => {
  const files = Array.from(postImageFile.files).slice(0, 3 - composerMedia.images.length);
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      composerMedia.images.push(e.target.result);
      composerMedia.imageFiles.push(file);
      renderMediaPreview();
    };
    reader.readAsDataURL(file);
  });
  postImageFile.value = "";
});
btnAddVideo.addEventListener("click", () => postVideoFile.click());
postVideoFile.addEventListener("change", () => {
  const file = postVideoFile.files[0];
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  const probe = document.createElement("video");
  probe.preload = "metadata";
  probe.onloadedmetadata = () => {
    URL.revokeObjectURL(objectUrl);
    if (probe.duration > 30) {
      showToast("Videos are capped at 30 seconds", "error");
      postVideoFile.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      composerMedia.video = e.target.result;
      composerMedia.videoFile = file;
      renderMediaPreview();
    };
    reader.readAsDataURL(file);
  };
  probe.src = objectUrl;
});
postMediaPreview.addEventListener("click", (e) => {
  const removeImg = e.target.closest("[data-remove-image]");
  if (removeImg) {
    const i = Number(removeImg.dataset.removeImage);
    composerMedia.images.splice(i, 1);
    composerMedia.imageFiles.splice(i, 1);
    renderMediaPreview();
    return;
  }
  const removeVid = e.target.closest("[data-remove-video]");
  if (removeVid) { composerMedia.video = null; composerMedia.videoFile = null; renderMediaPreview(); }
});
function resetComposer() {
  postTextEl.value = "";
  postCharCountEl.textContent = "0";
  composerMedia = { images: [], imageFiles: [], video: null, videoFile: null };
  renderMediaPreview();
}

let postSubmitting = false;
btnSubmitPost.addEventListener("click", async () => {
  if (postSubmitting || !currentUser) return;
  const text = postTextEl.value.trim();
  if (!text) { shakeField(postTextEl); showToast("Write something to post", "error"); return; }

  postSubmitting = true;
  btnSubmitPost.disabled = true;

  try {
    let newPost;
    await showLoader(composerMedia.imageFiles.length || composerMedia.videoFile ? "Uploading…" : "Posting…", async () => {
      let mediaType = null;
      let mediaUrls = [];
      if (composerMedia.videoFile) {
        mediaType = "video";
        mediaUrls = [await uploadToStorage("post-media", composerMedia.videoFile, currentUser.id)];
      } else if (composerMedia.imageFiles.length > 0) {
        mediaType = "image";
        mediaUrls = await Promise.all(
          composerMedia.imageFiles.map((file) => uploadToStorage("post-media", file, currentUser.id))
        );
      }

      const { data: inserted, error } = await supabaseClient
        .from("posts")
        .insert({ author_id: currentUser.id, text, media_type: mediaType, media_urls: mediaUrls })
        .select()
        .single();
      if (error) throw error;

      newPost = {
        id: inserted.id,
        authorUsername: currentUser.username,
        text,
        media: !mediaType ? null : {
          type: mediaType,
          images: mediaType === "image" ? mediaUrls : [],
          count: mediaType === "image" ? mediaUrls.length : 1,
          dataUrl: mediaType === "video" ? mediaUrls[0] : undefined,
        },
        createdAt: new Date(inserted.created_at).getTime(),
        likes: 0, liked: false, comments: [],
      };
    });

    posts.unshift(newPost);
    renderFeed();
    renderOwnProfile();
    resetComposer();
    showToast("Posted");
    switchTab("home", { replace: true });
  } catch (err) {
    console.error("Post failed:", err);
    showToast("Couldn't post — check your connection and try again", "error");
  } finally {
    postSubmitting = false;
    btnSubmitPost.disabled = false;
  }
});
