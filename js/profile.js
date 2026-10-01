// ============================================================
// profile.js
// Viewing your own profile and other students' profiles, plus the edit-profile screen.
// ============================================================

// ---------- Profiles (own + other students, read-only) ----------
function renderOwnProfile() {
  if (!currentUser) return;
  setAvatarInto(document.getElementById("profile-avatar"), currentUser);
  document.getElementById("profile-name").textContent = currentUser.name;
  document.getElementById("profile-username").textContent = `@${currentUser.username}`;
  const bioEl = document.getElementById("profile-bio");
  bioEl.style.display = currentUser.bio ? "block" : "none";
  bioEl.textContent = currentUser.bio || "";
  document.getElementById("profile-meta").textContent =
    `${currentUser.department || ""}${currentUser.level ? " · " + currentUser.level + " Level" : ""}`;
  const mine = posts.filter((p) => p.authorUsername === currentUser.username).sort((a, b) => b.createdAt - a.createdAt);
  const postsEl = document.getElementById("profile-posts");
  const emptyEl = document.getElementById("profile-posts-empty");
  if (mine.length === 0) {
    postsEl.style.display = "none";
    emptyEl.style.display = "flex";
  } else {
    postsEl.style.display = "block";
    emptyEl.style.display = "none";
    postsEl.innerHTML = mine.map(postCardHTML).join("");
  }
  renderRailProfile();
}
function renderRailProfile() {
  if (!currentUser) return;
  const railAvatar = document.getElementById("rail-avatar");
  if (railAvatar) {
    setSmallAvatarInto(railAvatar, currentUser);
    document.getElementById("rail-name").textContent = currentUser.name;
    document.getElementById("rail-meta").textContent =
      `${currentUser.department || ""}${currentUser.level ? " · " + currentUser.level + " Level" : ""}`;
  }
  const drawerAvatar = document.getElementById("drawer-avatar");
  if (drawerAvatar) {
    setMediumAvatarInto(drawerAvatar, currentUser);
    document.getElementById("drawer-name").textContent = currentUser.name;
    document.getElementById("drawer-username").textContent = `@${currentUser.username}`;
  }
  const sidebarAvatar = document.getElementById("sidebar-avatar");
  if (sidebarAvatar) {
    setSmallAvatarInto(sidebarAvatar, currentUser);
    document.getElementById("sidebar-name").textContent = currentUser.name;
    document.getElementById("sidebar-username").textContent = `@${currentUser.username}`;
  }
  const countEl = document.getElementById("profile-post-count");
  if (countEl) countEl.textContent = mine.length;
  const levelEl = document.getElementById("profile-level-short");
  if (levelEl) levelEl.textContent = currentUser.level || "—";
}
document.getElementById("btn-profile-empty-cta").addEventListener("click", () => goto("screen-create-post"));
document.getElementById("btn-edit-profile").addEventListener("click", () => openEditProfile());
const secondaryEditProfileBtn = document.getElementById("btn-edit-profile-secondary");
if (secondaryEditProfileBtn) secondaryEditProfileBtn.addEventListener("click", () => openEditProfile());

// `posts` already holds every post (fetchPosts() has no author filter — see
// data.js), so viewing someone's profile just filters what's already
// loaded. The one thing that's NOT guaranteed to be loaded yet is the
// person's profile info itself if they have zero posts, so that's fetched
// directly rather than relying on the post-author cache warm-up.
async function openProfile(username) {
  if (currentUser && username === currentUser.username) { switchTab("profile"); return; }
  await fetchPersonByUsername(username);
  const person = getPerson(username);
  setAvatarInto(document.getElementById("view-profile-avatar"), person);
  document.getElementById("view-profile-name").textContent = person.name;
  document.getElementById("view-profile-username").textContent = `@${username}`;
  document.getElementById("view-profile-meta").textContent =
    `${person.department || ""}${person.level ? " · " + person.level + " Level" : ""}`;
  const theirs = posts.filter((p) => p.authorUsername === username).sort((a, b) => b.createdAt - a.createdAt);
  const postsEl = document.getElementById("view-profile-posts");
  const emptyEl = document.getElementById("view-profile-posts-empty");
  if (theirs.length === 0) {
    postsEl.style.display = "none";
    emptyEl.style.display = "flex";
  } else {
    postsEl.style.display = "block";
    emptyEl.style.display = "none";
    postsEl.innerHTML = theirs.map(postCardHTML).join("");
  }
  goto("screen-view-profile");
}

// ---------- Search students ----------
document.getElementById("home-search-trigger").addEventListener("click", () => goto("screen-search"));
const desktopSearchTriggerBtn = document.getElementById("desktop-search-trigger");
if (desktopSearchTriggerBtn) desktopSearchTriggerBtn.addEventListener("click", () => goto("screen-search"));

const searchInputEl = document.getElementById("search-input");
const searchResultsEl = document.getElementById("search-results");
const searchStateEmpty = document.getElementById("search-state-empty");
const searchStateNone = document.getElementById("search-state-none");

function searchResultRowHTML(person) {
  return `<button type="button" class="search-result-row" data-username="${person.username}">
    ${avatarHTML(person, "avatar-circle-sm")}
    <div class="search-result-info">
      <div class="search-result-name">${escapeHTML(person.name)}</div>
      <div class="search-result-username">@${escapeHTML(person.username)}</div>
    </div>
  </button>`;
}

let searchDebounce = null;
let searchRequestId = 0;
searchInputEl.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const query = searchInputEl.value.trim();
  if (!query) {
    searchResultsEl.innerHTML = "";
    searchStateNone.style.display = "none";
    searchStateEmpty.style.display = "flex";
    return;
  }
  searchStateEmpty.style.display = "none";
  searchDebounce = setTimeout(() => runSearch(query), 300);
});

async function runSearch(query) {
  const thisRequest = ++searchRequestId;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
    .limit(20);
  if (thisRequest !== searchRequestId) return; // a newer keystroke already superseded this request

  if (error || !data || data.length === 0) {
    searchResultsEl.innerHTML = "";
    searchStateNone.style.display = "flex";
    return;
  }
  searchStateNone.style.display = "none";
  searchResultsEl.innerHTML = data.map((row) => searchResultRowHTML(personFromProfileRow(row))).join("");
}

searchResultsEl.addEventListener("click", (e) => {
  const row = e.target.closest(".search-result-row");
  if (row) openProfile(row.dataset.username);
});

// Reset to a blank slate every time the search screen is opened fresh.
document.querySelectorAll('[data-goto="screen-search"], #home-search-trigger, #desktop-search-trigger').forEach((el) => {
  el.addEventListener("click", () => {
    searchInputEl.value = "";
    searchResultsEl.innerHTML = "";
    searchStateNone.style.display = "none";
    searchStateEmpty.style.display = "flex";
    setTimeout(() => searchInputEl.focus(), 350);
  });
});

// ---------- Edit profile (reuses the faculty/department picker widget) ----------
const editAvatarFile = document.getElementById("edit-avatar-file");
const editAvatarPicker = document.getElementById("edit-avatar-picker");
const editAvatarPreview = document.getElementById("edit-avatar-preview");
const editAvatarPlaceholderText = document.getElementById("edit-avatar-placeholder-text");
const editNameField = document.getElementById("edit-name");
const editFacultyInput = document.getElementById("edit-faculty-input");
const editFacultySuggestions = document.getElementById("edit-faculty-suggestions");
const editDepartmentField = document.getElementById("edit-department-field");
const editDepartmentDisplay = document.getElementById("edit-department-display");
const editLevelSelect = document.getElementById("edit-level");
const saveProfileBtn = document.getElementById("btn-save-profile");
let editState = { faculty: "", department: "", avatarFile: null };

editAvatarPicker.addEventListener("click", () => editAvatarFile.click());
editAvatarFile.addEventListener("change", () => {
  const file = editAvatarFile.files[0];
  if (!file) return;
  editState.avatarFile = file; // the real file, uploaded on Save — see below
  const reader = new FileReader();
  reader.onload = (e) => {
    editState.avatarDataUrl = e.target.result; // just for the live preview
    editAvatarPreview.src = e.target.result;
    editAvatarPreview.style.display = "block";
    editAvatarPlaceholderText.style.display = "none";
  };
  reader.readAsDataURL(file);
});

createFacultyPicker({
  inputEl: editFacultyInput, suggestionsEl: editFacultySuggestions,
  deptFieldEl: editDepartmentField, deptDisplayEl: editDepartmentDisplay,
  deptChangeBtnId: "edit-dept-change-btn",
  state: editState, onChange: () => {},
});

function openEditProfile() {
  editState.faculty = currentUser.faculty;
  editState.department = currentUser.department;
  editState.avatarDataUrl = currentUser.avatarDataUrl || "";
  editState.avatarFile = null; // no new photo chosen yet — keep the existing one unless they pick a new one
  editNameField.value = currentUser.name;
  document.getElementById("edit-bio").value = currentUser.bio || "";
  editFacultyInput.value = currentUser.faculty;
  editDepartmentDisplay.value = currentUser.department;
  editDepartmentField.style.display = currentUser.department ? "block" : "none";
  editLevelSelect.value = currentUser.level;
  if (editState.avatarDataUrl) {
    editAvatarPreview.src = editState.avatarDataUrl;
    editAvatarPreview.style.display = "block";
    editAvatarPlaceholderText.style.display = "none";
  } else {
    editAvatarPreview.style.display = "none";
    editAvatarPlaceholderText.style.display = "block";
  }
  goto("screen-edit-profile");
}

let editSubmitting = false;
saveProfileBtn.addEventListener("click", async () => {
  if (editSubmitting) return;
  const name = editNameField.value.trim();
  const bio = document.getElementById("edit-bio").value.trim();
  const missing = [];
  if (!name) { missing.push("your name"); shakeField(editNameField.closest(".field")); }
  if (!editState.faculty) { missing.push("your faculty"); shakeField(editFacultyInput.closest(".field")); }
  else if (!editState.department) { missing.push("your department"); shakeField(editDepartmentField); }
  if (!editLevelSelect.value) { missing.push("your level"); shakeField(editLevelSelect.closest(".field")); }
  if (missing.length > 0) { showToast(`Fill in ${joinList(missing)} to save`, "error"); return; }

  editSubmitting = true;

  try {
    await showLoader("Saving changes…", async () => {
      let avatarUrl = currentUser.avatarDataUrl || null;
      if (editState.avatarFile) {
        avatarUrl = await uploadToStorage("avatars", editState.avatarFile, currentUser.id);
      }
      const { error } = await supabaseClient.from("profiles").update({
        name, faculty: editState.faculty, department: editState.department,
        level: editLevelSelect.value, avatar_url: avatarUrl,
      }).eq("id", currentUser.id);
      if (error) throw error;

      currentUser.name = name;
      currentUser.bio = bio; // UI-only for now — no profiles.bio column yet, so this resets on next login
      currentUser.faculty = editState.faculty;
      currentUser.department = editState.department;
      currentUser.level = editLevelSelect.value;
      currentUser.avatarDataUrl = avatarUrl || "";
    });

    renderOwnProfile();
    renderFeed();
    showToast("Profile updated");
    history.back();
  } catch (err) {
    console.error("Profile save failed:", err);
    showToast("Couldn't save — check your connection and try again", "error");
  } finally {
    editSubmitting = false;
  }
});
