import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    collection, addDoc, onSnapshot, query, where, orderBy,
    serverTimestamp, doc, setDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const convList      = document.getElementById("conv-list");
const emptyState    = document.getElementById("empty-state");
const chatView      = document.getElementById("chat-view");
const chatName      = document.getElementById("chat-name");
const chatAvatar    = document.getElementById("chat-avatar");
const messagesEl    = document.getElementById("messages");
const msgForm       = document.getElementById("msg-form");
const msgInput      = document.getElementById("msg-input");
const backBtn       = document.getElementById("back-btn");
const sidebar       = document.getElementById("sidebar");
const txnBanner     = document.getElementById("transaction-banner");
const txnImgWrap    = document.getElementById("txn-img-wrap");
const txnTitleEl    = document.getElementById("txn-title");
const txnPriceEl    = document.getElementById("txn-price");
const txnActionArea = document.getElementById("txn-action-area");
const confirmModal  = document.getElementById("confirm-sale-modal");
const confirmYes    = document.getElementById("confirm-sale-yes");
const confirmNo     = document.getElementById("confirm-sale-no");

let ME               = null;
let activeConvId     = null;
let stopListening    = null;
let returnListingId  = null;
let pendingConfirmLId = null;
let otherUidInConv   = null;

const listingTitleCache = new Map(); // listingId -> title
const userPhotoCache    = new Map(); // uid -> photoURL | null

async function getListingTitle(listingId) {
    if (listingTitleCache.has(listingId)) return listingTitleCache.get(listingId);
    try {
        const snap  = await getDoc(doc(database, "listings", listingId));
        const title = snap.exists() ? (snap.data().title ?? null) : null;
        listingTitleCache.set(listingId, title);
        return title;
    } catch {
        return null;
    }
}

async function getUserPhoto(uid) {
    if (userPhotoCache.has(uid)) return userPhotoCache.get(uid);
    try {
        const snap  = await getDoc(doc(database, "users", uid));
        const photo = snap.exists() ? (snap.data().photoURL || null) : null;
        userPhotoCache.set(uid, photo);
        return photo;
    } catch {
        return null;
    }
}

// Shows a profile photo if we have one, otherwise falls back to initials —
// same pattern profile.js uses for its own avatar.
function renderAvatar(el, name, photoURL) {
    if (photoURL) {
        el.style.backgroundImage = `url('${photoURL}')`;
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        el.style.backgroundRepeat = "no-repeat";
        el.textContent = "";
    } else {
        el.style.backgroundImage = "";
        el.textContent = initials(name);
    }
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

onAuthStateChanged(authentication, async user => {
    if (!user) { window.location.href = "login.html#login"; return; }
    const ud = await getDoc(doc(database, "users", user.uid));
    ME = { uid: user.uid, name: ud.data()?.name ?? user.email, email: user.email };
    loadConversations();
    autoOpenFromUrl();
});

async function autoOpenFromUrl() {
    const p = new URLSearchParams(window.location.search);
    const convId    = p.get("conv");
    const listingId = p.get("listing");
    if (listingId) returnListingId = listingId;
    if (!convId) return;
    try {
        const convDoc = await getDoc(doc(database, "conversations", convId));
        if (!convDoc.exists()) return;
        const data      = convDoc.data();
        const otherId   = data.participants?.find(id => id !== ME.uid);
        const otherName = data.names?.[otherId] ?? "Unknown";
        await openConv(convId, otherName, otherId);
        history.replaceState(null, "", "chat.html");
    } catch (err) { console.warn("Auto-open failed:", err); }
}

function loadConversations() {
    // Query only conversations where the logged-in user is a participant
    const q = query(
        collection(database, "conversations"),
        where("participants", "array-contains", ME.uid)
    );

    onSnapshot(q, snapshot => {
        convList.innerHTML = "";
        if (snapshot.empty) {
            convList.innerHTML = `<li style="padding:1rem 1.4rem;color:var(--text-prompt);font-size:0.85rem;">No conversations yet.</li>`;
            return;
        }
        snapshot.docs.forEach(d => {
            const data      = d.data();
            const otherId   = data.participants.find(id => id !== ME.uid);
            const otherName = data.names?.[otherId] ?? "Unknown";
            const li        = document.createElement("li");
            li.className    = "conv-item" + (d.id === activeConvId ? " active" : "");
            li.innerHTML    = `
                <div class="conv-avatar"></div>
                <div class="conv-text">
                    <div class="conv-name">${escapeHtml(otherName)}</div>
                    <div class="conv-listing"></div>
                    <div class="conv-preview">${escapeHtml(data.lastMessage) || "No messages yet"}</div>
                </div>`;
            li.onclick = () => openConv(d.id, otherName, otherId);
            convList.appendChild(li);

            const avatarEl = li.querySelector(".conv-avatar");
            renderAvatar(avatarEl, otherName, null);
            getUserPhoto(otherId).then(photo => renderAvatar(avatarEl, otherName, photo));

            const listingId = data.listingRef?.id;
            if (listingId) {
                const listingEl = li.querySelector(".conv-listing");
                getListingTitle(listingId).then(title => {
                    if (title) listingEl.textContent = `Re: ${title}`;
                });
            }
        });
    });
}

async function openConv(convId, name, otherId) {
    if (stopListening) stopListening();
    activeConvId   = convId;
    otherUidInConv = otherId;
    chatName.textContent   = name;
    renderAvatar(chatAvatar, name, null);
    if (returnListingId) backBtn.classList.add("show");
    emptyState.classList.add("hidden");
    chatView.classList.remove("hidden");
    if (window.innerWidth <= 640) sidebar.classList.add("hidden");
    txnBanner.classList.add("hidden");

    const [convSnap, otherPhoto] = await Promise.all([
        getDoc(doc(database, "conversations", convId)),
        getUserPhoto(otherId)
    ]);
    renderAvatar(chatAvatar, name, otherPhoto);

    const listingRef = convSnap.data()?.listingRef;
    if (listingRef?.id) {
        onSnapshot(doc(database, "listings", listingRef.id), snap => {
            if (snap.exists()) renderBanner(snap.data(), listingRef.id);
        });
    }

    const q = query(collection(database, "conversations", convId, "messages"), orderBy("sentAt"));
    stopListening = onSnapshot(q, snapshot => {
        messagesEl.innerHTML = "";
        snapshot.docs.forEach(d => {
            const msg    = d.data();
            const isMine = msg.senderId === ME.uid;
            const row    = document.createElement("div");
            row.className = "msg-row " + (isMine ? "sent" : "received");
            if (!isMine) {
                const av = document.createElement("div");
                av.className = "msg-avatar";
                renderAvatar(av, name, otherPhoto);
                row.appendChild(av);
            }
            const bubble = document.createElement("div");
            bubble.className   = "bubble " + (isMine ? "sent" : "received");
            bubble.textContent = msg.text;
            row.appendChild(bubble);
            messagesEl.appendChild(row);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
    });
    msgInput.focus();
}

function renderBanner(listing, lId) {
    const isSeller = listing.sellerId === ME.uid;
    const isBuyer  = listing.buyerId  === ME.uid;
    const status   = listing.status;
    const price    = listing.price != null ? `$${listing.price.toFixed(2)}` : "Exchange";

    txnImgWrap.innerHTML = listing.image
        ? `<img src="${listing.image}" alt="">`
        : `<div class="txn-img-placeholder"><i class="fa-regular fa-image"></i></div>`;
    txnTitleEl.textContent = listing.title ?? "Listing";
    txnPriceEl.textContent = price;
    txnActionArea.innerHTML = "";

    if (isSeller) {
        if (status === "escrow" || status === "pending") {
            // Buyer has paid — seller needs to scan QR at meetup
            const span = document.createElement("span");
            span.id = "txn-status-label";
            span.className = "approved";
            span.innerHTML = `<i class="fa-solid fa-circle-check"></i> Payment received`;
            const btn = document.createElement("button");
            btn.id = "confirm-sale-btn";
            btn.innerHTML = `<i class="fa-solid fa-qrcode"></i> Scan QR at Meetup`;
            btn.onclick = () => { window.location.href = `confirmation.html?id=${lId}&method=${listing.payMethod ?? "wallet"}`; };
            txnActionArea.appendChild(span);
            txnActionArea.appendChild(btn);
        } else if (status === "sold" || status === "rented") {
            const span = document.createElement("span");
            span.id = "txn-status-label";
            span.className = "approved";
            span.innerHTML = `<i class="fa-solid fa-circle-check"></i> Sale complete`;
            txnActionArea.appendChild(span);
        } else if (status === "approved") {
            const span = document.createElement("span");
            span.id = "txn-status-label";
            span.className = "approved";
            span.innerHTML = `<i class="fa-solid fa-circle-check"></i> Sale confirmed — buyer can now pay`;
            txnActionArea.appendChild(span);
        } else {
            const label = document.createElement("span");
            label.id = "txn-status-label";
            label.innerHTML = listing.buyerName
                ? `<strong>${listing.buyerName}</strong> wants to buy this item`
                : `Confirm when ready to sell`;
            const btn = document.createElement("button");
            btn.id = "confirm-sale-btn";
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Confirm Sale`;
            btn.onclick = () => { pendingConfirmLId = lId; confirmModal.classList.remove("hidden"); };
            txnActionArea.appendChild(label);
            txnActionArea.appendChild(btn);
        }
    } else {
        const btn = document.createElement("button");
        btn.id = "buy-btn";

        if ((status === "escrow" || status === "sold" || status === "rented" || status === "pending") && isBuyer) {
            // Already paid — give access to QR / confirmation page
            btn.textContent = "View Confirmation Code";
            btn.classList.add("enabled");
            btn.onclick = () => { window.location.href = `confirmation.html?id=${lId}&method=${listing.payMethod ?? "wallet"}`; };
        } else if (status === "approved" && isBuyer) {
            btn.textContent = "Buy Now";
            btn.classList.add("enabled");
            btn.onclick = () => { window.location.href = `payment.html?id=${lId}`; };
        } else {
            btn.textContent = "Buy";
            btn.disabled = true;
        }
        txnActionArea.appendChild(btn);
    }
    txnBanner.classList.remove("hidden");
}

confirmYes.addEventListener("click", async () => {
    if (!pendingConfirmLId) return;
    confirmModal.classList.add("hidden");
    await updateDoc(doc(database, "listings", pendingConfirmLId), {
        status: "approved",
        buyerId: otherUidInConv,
    });
    await sendMessage("✅ Sale confirmed! You can now proceed to payment.");
    pendingConfirmLId = null;
});

confirmNo.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
    pendingConfirmLId = null;
});

confirmModal.addEventListener("click", e => {
    if (e.target === confirmModal) { confirmModal.classList.add("hidden"); pendingConfirmLId = null; }
});

async function sendMessage(text) {
    if (!text?.trim() || !activeConvId) return;
    await addDoc(collection(database, "conversations", activeConvId, "messages"), {
        text: text.trim(), senderId: ME.uid, sentAt: serverTimestamp(),
    });
    await setDoc(doc(database, "conversations", activeConvId), { lastMessage: text.trim() }, { merge: true });
}

msgForm.addEventListener("submit", async e => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text) return;
    msgInput.value = "";
    await sendMessage(text);
});

msgInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        msgForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
});

backBtn.addEventListener("click", () => {
    if (returnListingId) { window.location.href = `listing.html?id=${returnListingId}`; return; }
    if (stopListening) stopListening();
    activeConvId = null;
    sidebar.classList.remove("hidden");
    chatView.classList.add("hidden");
    emptyState.classList.remove("hidden");
    backBtn.classList.remove("show");
});

function initials(name) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
}