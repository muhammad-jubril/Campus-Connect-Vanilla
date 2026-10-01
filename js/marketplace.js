// ============================================================
// marketplace.js
// Browse listings by category, create a listing (with photos), view a
// listing's detail, and manage your own (mark sold / delete).
// ============================================================

let marketplaceListings = [];
let marketplaceActiveCategory = "";
let marketplaceLoaded = false;

function formatNaira(n) {
  return "₦" + Number(n).toLocaleString("en-NG");
}

async function fetchListings() {
  const { data: rows, error } = await supabaseClient
    .from("marketplace_listings")
    .select("id, seller_id, title, description, price, category, contact, images, status, created_at, profiles!marketplace_listings_seller_id_fkey(username)")
    .order("created_at", { ascending: false });
  if (error || !rows) { console.warn("fetchListings failed:", error); return; }

  marketplaceListings = rows.map((row) => ({
    id: row.id,
    sellerId: row.seller_id,
    sellerUsername: row.profiles ? row.profiles.username : "unknown",
    title: row.title,
    description: row.description,
    price: row.price,
    category: row.category,
    contact: row.contact,
    images: row.images || [],
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
  }));

  await warmPeopleCache(marketplaceListings.map((l) => l.sellerUsername));
}

async function loadMarketplace() {
  if (!marketplaceLoaded) {
    await fetchListings();
    marketplaceLoaded = true;
  }
  renderMarketplace();
}

function listingCardHTML(listing) {
  const img = listing.images[0];
  return `<button type="button" class="mkt-card" data-listing-id="${listing.id}">
    <div class="mkt-card-image" style="${img ? `background-image:url('${img}')` : ""}">
      ${listing.status === "sold" ? '<span class="mkt-card-sold">SOLD</span>' : ""}
    </div>
    <div class="mkt-card-body">
      <div class="mkt-card-price">${formatNaira(listing.price)}</div>
      <div class="mkt-card-title">${escapeHTML(listing.title)}</div>
    </div>
  </button>`;
}

function renderMarketplace() {
  const filtered = marketplaceActiveCategory
    ? marketplaceListings.filter((l) => l.category === marketplaceActiveCategory)
    : marketplaceListings;
  const gridEl = document.getElementById("mkt-grid");
  const emptyEl = document.getElementById("mkt-empty");
  if (filtered.length === 0) {
    gridEl.style.display = "none";
    emptyEl.style.display = "flex";
    document.getElementById("mkt-empty-tag").textContent =
      marketplaceActiveCategory ? `No ${marketplaceActiveCategory} listings yet` : "Nothing here yet";
  } else {
    gridEl.style.display = "grid";
    emptyEl.style.display = "none";
    gridEl.innerHTML = filtered.map(listingCardHTML).join("");
  }
}

document.querySelectorAll("#mkt-category-chips .mkt-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#mkt-category-chips .mkt-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    marketplaceActiveCategory = chip.dataset.category;
    renderMarketplace();
  });
});

document.getElementById("mkt-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".mkt-card");
  if (card) openListing(card.dataset.listingId);
});

document.getElementById("btn-open-create-listing").addEventListener("click", () => goto("screen-create-listing"));
document.getElementById("mkt-empty-cta").addEventListener("click", () => goto("screen-create-listing"));

// ---------- Create listing composer (mirrors create-post's image picker) ----------
let listingMedia = { images: [], imageFiles: [] };
const mktMediaPreview = document.getElementById("mkt-media-preview");
const mktMediaHint = document.getElementById("mkt-media-hint");
const mktBtnAddImage = document.getElementById("mkt-btn-add-image");
const mktImageFile = document.getElementById("mkt-image-file");
const btnSubmitListing = document.getElementById("btn-submit-listing");

function renderListingMediaPreview() {
  mktMediaPreview.innerHTML = listingMedia.images
    .map((src, i) => `<div class="post-media-chip"><img src="${src}" alt=""><button type="button" class="remove-media" data-remove-listing-image="${i}">×</button></div>`)
    .join("");
  mktBtnAddImage.disabled = listingMedia.images.length >= 3;
  mktMediaHint.textContent = listingMedia.images.length > 0 ? `${listingMedia.images.length}/3 images` : "";
}
mktMediaPreview.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove-listing-image]");
  if (!btn) return;
  const i = Number(btn.dataset.removeListingImage);
  listingMedia.images.splice(i, 1);
  listingMedia.imageFiles.splice(i, 1);
  renderListingMediaPreview();
});
mktBtnAddImage.addEventListener("click", () => mktImageFile.click());
mktImageFile.addEventListener("change", () => {
  const files = Array.from(mktImageFile.files).slice(0, 3 - listingMedia.images.length);
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      listingMedia.images.push(e.target.result);
      listingMedia.imageFiles.push(file);
      renderListingMediaPreview();
    };
    reader.readAsDataURL(file);
  });
  mktImageFile.value = "";
});

function resetListingComposer() {
  listingMedia = { images: [], imageFiles: [] };
  document.getElementById("mkt-title").value = "";
  document.getElementById("mkt-category").value = "";
  document.getElementById("mkt-price").value = "";
  document.getElementById("mkt-description").value = "";
  document.getElementById("mkt-contact").value = "";
  renderListingMediaPreview();
}

let listingSubmitting = false;
btnSubmitListing.addEventListener("click", async () => {
  if (listingSubmitting) return;
  const title = document.getElementById("mkt-title").value.trim();
  const category = document.getElementById("mkt-category").value;
  const price = document.getElementById("mkt-price").value;
  const description = document.getElementById("mkt-description").value.trim();
  const contact = document.getElementById("mkt-contact").value.trim();

  const missing = [];
  if (!title) missing.push("a title");
  if (!category) missing.push("a category");
  if (!price || Number(price) < 0) missing.push("a price");
  if (!description) missing.push("a description");
  if (missing.length > 0) { showToast(`Fill in ${joinList(missing)} to continue`, "error"); return; }

  listingSubmitting = true;
  btnSubmitListing.disabled = true;

  try {
    await showLoader(listingMedia.imageFiles.length ? "Uploading…" : "Listing item…", async () => {
      const imageUrls = await Promise.all(
        listingMedia.imageFiles.map((file) => uploadToStorage("post-media", file, currentUser.id))
      );
      const { error } = await supabaseClient.from("marketplace_listings").insert({
        seller_id: currentUser.id, title, description, price: Number(price),
        category, contact: contact || null, images: imageUrls,
      });
      if (error) throw error;
      marketplaceLoaded = false; // force a refresh so the new listing actually shows up
    });

    resetListingComposer();
    showToast("Listed!");
    switchTab("marketplace", { replace: true });
    await loadMarketplace();
  } catch (err) {
    console.error("Listing failed:", err);
    showToast("Couldn't list your item — check your connection and try again", "error");
  } finally {
    listingSubmitting = false;
    btnSubmitListing.disabled = false;
  }
});

// ---------- Listing detail ----------
let currentListingId = null;

async function openListing(id) {
  const listing = marketplaceListings.find((l) => l.id === id);
  if (!listing) return;
  currentListingId = id;

  const imagesEl = document.getElementById("mkt-detail-images");
  imagesEl.innerHTML = listing.images.length > 0
    ? listing.images.map((src) => `<img src="${src}" alt="">`).join("")
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(28,27,23,.3);">No photo</div>`;

  document.getElementById("mkt-detail-category").textContent = listing.category;
  document.getElementById("mkt-detail-title").textContent = listing.title;
  document.getElementById("mkt-detail-price").textContent = formatNaira(listing.price);
  document.getElementById("mkt-detail-description").textContent = listing.description;
  document.getElementById("mkt-detail-sold-badge").style.display = listing.status === "sold" ? "inline-block" : "none";

  const seller = getPerson(listing.sellerUsername);
  document.getElementById("mkt-detail-seller-name").textContent = (seller && seller.name) || listing.sellerUsername;
  document.getElementById("mkt-detail-seller-username").textContent = `@${listing.sellerUsername}`;
  setSmallAvatarInto(document.getElementById("mkt-detail-seller-avatar"), seller || { username: listing.sellerUsername });

  const contactEl = document.getElementById("mkt-detail-contact");
  if (listing.contact) {
    const digits = listing.contact.replace(/[^\d]/g, "");
    contactEl.href = digits ? `https://wa.me/${digits}` : "#";
    contactEl.style.display = "block";
  } else {
    contactEl.style.display = "none";
  }

  const isOwner = currentUser && listing.sellerId === currentUser.id;
  const ownerActionsEl = document.getElementById("mkt-detail-owner-actions");
  ownerActionsEl.style.display = isOwner ? "flex" : "none";
  document.getElementById("mkt-detail-toggle-sold").textContent = listing.status === "sold" ? "Mark as available" : "Mark as sold";

  goto("screen-listing-detail");
}

document.getElementById("mkt-detail-seller").addEventListener("click", () => {
  const listing = marketplaceListings.find((l) => l.id === currentListingId);
  if (listing) openProfile(listing.sellerUsername);
});

document.getElementById("mkt-detail-toggle-sold").addEventListener("click", async () => {
  const listing = marketplaceListings.find((l) => l.id === currentListingId);
  if (!listing) return;
  const newStatus = listing.status === "sold" ? "active" : "sold";
  try {
    await showLoader("Updating…", async () => {
      const { error } = await supabaseClient.from("marketplace_listings").update({ status: newStatus }).eq("id", listing.id);
      if (error) throw error;
    });
    listing.status = newStatus;
    showToast(newStatus === "sold" ? "Marked as sold" : "Marked as available");
    openListing(listing.id);
    renderMarketplace();
  } catch (err) {
    console.error("Updating listing failed:", err);
    showToast("Couldn't update — check your connection and try again", "error");
  }
});

document.getElementById("mkt-detail-delete").addEventListener("click", async () => {
  const listing = marketplaceListings.find((l) => l.id === currentListingId);
  if (!listing) return;
  try {
    await showLoader("Deleting…", async () => {
      const { error } = await supabaseClient.from("marketplace_listings").delete().eq("id", listing.id);
      if (error) throw error;
    });
    marketplaceListings = marketplaceListings.filter((l) => l.id !== listing.id);
    showToast("Listing deleted");
    history.back();
    renderMarketplace();
  } catch (err) {
    console.error("Deleting listing failed:", err);
    showToast("Couldn't delete — check your connection and try again", "error");
  }
});
