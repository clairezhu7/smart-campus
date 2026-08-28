import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    doc, getDoc, setDoc, deleteDoc, updateDoc, increment,
    collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ───────────────────────────────────────────────────
const statusScreen  = document.getElementById("status-screen");
const detailMain    = document.getElementById("detail-main");
const mainImageWrap = document.getElementById("main-image-wrap");
const thumbRow      = document.getElementById("thumb-row");
const categoryEl    = document.getElementById("detail-category");
const titleEl       = document.getElementById("detail-title");
const priceEl       = document.getElementById("detail-price");
const metaEl        = document.getElementById("detail-meta");
const descriptionEl = document.getElementById("detail-description");
const sellerAvatar  = document.getElementById("seller-avatar");
const sellerName    = document.getElementById("seller-name");
const sellerSchool  = document.getElementById("seller-school");
const sellerEmail   = document.getElementById("seller-email");
const actionsEl     = document.getElementById("actions");

let ME        = null;
let listingId = null;
let listing   = null;
let isFaved   = false;

const CATEGORY_LABEL = { new:"New", used:"Used", rent:"Rent", exchange:"Exchange" };

const params = new URLSearchParams(window.location.search);
listingId    = params.get("id");
if (!listingId) showStatus("⚠️", "No listing ID provided.");

onAuthStateChanged(authentication, async user => {
    if (!user) { window.location.href = "login.html#login"; return; }

    const ud = await getDoc(doc(database, "users", user.uid));
    const d  = ud.data() ?? {};
    ME = { uid: user.uid, name: d.name ?? user.email, email: user.email, school: d.school ?? "" };

    if (listingId) await loadListing();
});

async function loadListing() {
    try {
        const snap = await getDoc(doc(database, "listings", listingId));
        if (!snap.exists()) { showStatus("📭", "This listing no longer exists."); return; }

        listing = { id: snap.id, ...snap.data() };
        render();

        if (listing.sellerId !== ME.uid) {
            updateDoc(doc(database, "listings", listingId), { views: increment(1) })
                .catch(() => {});
        }
    } catch (err) {
        console.error(err);
        showStatus("⚠️", "Couldn't load this listing.");
    }
}

async function render() {
    statusScreen.classList.add("hidden");
    detailMain.classList.remove("hidden");

    // Gallery
    const images = listing.images ?? [];
    if (images.length > 0) {
        setMainImage(images[0]);
        thumbRow.innerHTML = images.map((src, i) => `
            <div class="thumb ${i === 0 ? "active" : ""}" data-i="${i}">
                <img src="${esc(src)}" alt="">
            </div>`).join("");
        thumbRow.addEventListener("click", e => {
            const t = e.target.closest(".thumb");
            if (!t) return;
            thumbRow.querySelectorAll(".thumb").forEach(x => x.classList.remove("active"));
            t.classList.add("active");
            setMainImage(images[Number(t.dataset.i)]);
        });
    }

    // Category / title / price
    if (listing.category) {
        categoryEl.textContent = CATEGORY_LABEL[listing.category] ?? listing.category;
        categoryEl.classList.add(`cat-${listing.category}`);
    }
    titleEl.textContent = listing.title ?? "Untitled";
    priceEl.innerHTML   = formatPrice(listing);

    // Meta row
    const parts = [];
    if (listing.condition)    parts.push(`<span class="meta-item"><strong>Condition:</strong> ${escHtml(listing.condition)}</span>`);
    if (listing.materialType) parts.push(`<span class="meta-item"><strong>Type:</strong> ${escHtml(listing.materialType)}</span>`);
    if (listing.courseCode)   parts.push(`<span class="meta-item"><strong>Course:</strong> ${escHtml(listing.courseCode)}</span>`);
    if (listing.teacher)      parts.push(`<span class="meta-item"><strong>Teacher:</strong> ${escHtml(listing.teacher)}</span>`);
    parts.push(`<span class="meta-item"><i class="fa-regular fa-clock"></i> ${timeAgo(listing.postedAt)}</span>`);
    if (typeof listing.views === "number")
        parts.push(`<span class="meta-item"><i class="fa-regular fa-eye"></i> ${listing.views} view${listing.views===1?"":"s"}</span>`);
    metaEl.innerHTML = parts.join("");

    descriptionEl.textContent = listing.description ?? "";

    // Seller card
    const sName = listing.sellerName ?? "Unknown";
    sellerAvatar.textContent = (sName[0] ?? "?").toUpperCase();
    sellerName.textContent   = sName;
    sellerSchool.textContent = listing.sellerSchool || "";
    sellerSchool.classList.toggle("hidden", !listing.sellerSchool);
    if (listing.sellerEmail) {
        sellerEmail.innerHTML = `<i class="fa-regular fa-envelope"></i> ${escHtml(listing.sellerEmail)}`;
        sellerEmail.href = `mailto:${listing.sellerEmail}`;
        sellerEmail.classList.remove("hidden");
    } else {
        sellerEmail.classList.add("hidden");
    }

    // ── Actions ──────────────────────────────────────────
    const isOwner = listing.sellerId === ME.uid;

    if (isOwner) {
        // Owner: edit + delete only
        actionsEl.innerHTML = `
            <button class="action-btn primary" id="edit-btn">
                <i class="fa-regular fa-pen-to-square"></i>&nbsp; Edit
            </button>
            <button class="action-btn danger" id="delete-btn">Delete</button>
        `;
        document.getElementById("edit-btn").addEventListener("click", () => {
            window.location.href = `sell.html?edit=${listingId}`;
        });
        document.getElementById("delete-btn").addEventListener("click", handleDelete);

    } else {
        const favRef  = doc(database, "users", ME.uid, "favourites", listingId);
        const favSnap = await getDoc(favRef);
        isFaved       = favSnap.exists();

        const isSoldToSomeoneElse = ["sold","rented"].includes(listing.status) ||
            (listing.status === "escrow" && listing.buyerId !== ME.uid);

        actionsEl.innerHTML = `
            <button class="action-btn ${isFaved ? "faved" : ""}" id="fav-btn">
                <i class="fa-${isFaved ? "solid" : "regular"} fa-heart"></i>
                <span id="fav-label">${isFaved ? "Saved" : "Save"}</span>
            </button>
            ${isSoldToSomeoneElse
                ? `<button class="action-btn secondary" disabled>🔒 No longer available</button>`
                : `<button class="action-btn primary" id="msg-btn">
                       <i class="fa-regular fa-comment"></i>&nbsp; Message Seller
                   </button>`
            }
        `;

        document.getElementById("fav-btn").addEventListener("click", handleToggleFavourite);
        document.getElementById("msg-btn")?.addEventListener("click", openChat);
    }
}

function setMainImage(src) {
    mainImageWrap.innerHTML = `<img src="${esc(src)}" alt=""
        onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',innerHTML:'<i class=\\'fa-regular fa-image\\'></i>'}))">`;
}

// ── Open chat with listing context ────────────────────────
// The listing banner + buy button live inside the chat.
// No status changes happen here — just open the conversation.
async function openChat() {
    const btn = document.getElementById("msg-btn");
    btn.disabled    = true;
    btn.textContent = "Opening chat...";

    try {
        const otherUid  = listing.sellerId;
        const otherName = listing.sellerName ?? "Seller";

        const snapshot = await getDocs(collection(database, "conversations"));
        const existing  = snapshot.docs.find(d => {
            const p = d.data().participants ?? [];
            return p.includes(ME.uid) && p.includes(otherUid);
        });

        const listingRefData = {
            id:    listingId,
            title: listing.title,
            price: listing.price,
            image: listing.images?.[0] ?? null
        };

        let convId;
        if (existing) {
            convId = existing.id;
            // Always update listingRef so the chat banner reflects the current listing
            await updateDoc(doc(database, "conversations", convId), { listingRef: listingRefData });
        } else {
            const ref = await addDoc(collection(database, "conversations"), {
                participants: [ME.uid, otherUid],
                names:        { [ME.uid]: ME.name, [otherUid]: otherName },
                lastMessage:  "",
                listingRef:   listingRefData,
            });
            convId = ref.id;
        }

        window.location.href = `chat.html?conv=${convId}&listing=${listingId}`;

    } catch (err) {
        console.error(err);
        alert("Couldn't open chat: " + (err.message ?? ""));
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-regular fa-comment"></i>&nbsp; Message Seller`;
    }
}

// ── Favourite toggle ──────────────────────────────────────
async function handleToggleFavourite() {
    const btn   = document.getElementById("fav-btn");
    const icon  = btn.querySelector("i");
    const label = document.getElementById("fav-label");
    const favRef = doc(database, "users", ME.uid, "favourites", listingId);
    btn.disabled = true;
    try {
        if (isFaved) {
            await deleteDoc(favRef);
            isFaved = false;
            icon.className    = "fa-regular fa-heart";
            label.textContent = "Save";
            btn.classList.remove("faved");
        } else {
            await setDoc(favRef, {
                listingId, title: listing.title ?? "", price: listing.price ?? null,
                image: listing.images?.[0] ?? null, category: listing.category ?? null,
                sellerName: listing.sellerName ?? ""
            });
            isFaved = true;
            icon.className    = "fa-solid fa-heart";
            label.textContent = "Saved";
            btn.classList.add("faved");
        }
    } catch (err) { console.error(err); }
    finally { btn.disabled = false; }
}

// ── Delete ────────────────────────────────────────────────
async function handleDelete() {
    if (!confirm(`Delete "${listing.title}"? This cannot be undone.`)) return;
    const btn = document.getElementById("delete-btn");
    btn.disabled = true; btn.textContent = "Deleting...";
    try {
        await deleteDoc(doc(database, "listings", listingId));
        window.location.href = "home.html";
    } catch (err) {
        alert("Couldn't delete: " + (err.message ?? ""));
        btn.disabled = false; btn.textContent = "Delete";
    }
}

// ── Helpers ───────────────────────────────────────────────
function showStatus(emoji, msg) {
    statusScreen.classList.remove("hidden");
    detailMain.classList.add("hidden");
    statusScreen.innerHTML = `<div class="emoji">${emoji}</div><div class="msg">${escHtml(msg)}</div>`;
}

function formatPrice(item) {
    if (item.category === "exchange") return `<span>Exchange</span>`;
    const p = typeof item.price === "number" ? `$${item.price.toFixed(2)}` : "—";
    return item.category === "rent" ? `${p}<span class="unit"> / ${item.rentDuration ?? "week"}</span>` : p;
}

function timeAgo(ts) {
    if (!ts?.toDate) return "";
    const s = Math.floor((Date.now() - ts.toDate().getTime()) / 1000);
    if (s < 60)     return "just now";
    if (s < 3600)   return `${Math.floor(s/60)}m ago`;
    if (s < 86400)  return `${Math.floor(s/3600)}h ago`;
    if (s < 604800) return `${Math.floor(s/86400)}d ago`;
    return ts.toDate().toLocaleDateString();
}

function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function esc(s) { return escHtml(s); }