import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    doc, getDoc, updateDoc, runTransaction, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ───────────────────────────────────────────────────
const loading        = document.getElementById("loading");
const page           = document.getElementById("page");
const orderImg       = document.getElementById("order-img");
const orderTitle     = document.getElementById("order-title");
const orderMeta      = document.getElementById("order-meta");
const orderPrice     = document.getElementById("order-price");
const dotMeetup      = document.getElementById("dot-meetup");
const dotDone        = document.getElementById("dot-done");
const line1          = document.getElementById("line-1");
const line2          = document.getElementById("line-2");
const codeCard       = document.getElementById("code-card");
const codeDisplay    = document.getElementById("code-display");
const copyBtn        = document.getElementById("copy-btn");
const emailBtn       = document.getElementById("email-btn");
const verifyCard     = document.getElementById("verify-card");
const codeInput      = document.getElementById("code-input");
const verifyBtn      = document.getElementById("verify-btn");
const verifyResult   = document.getElementById("verify-result");
const completedCard  = document.getElementById("completed-card");
const completedTitle = document.getElementById("completed-title");
const completedSub   = document.getElementById("completed-sub");
const primaryBtn     = document.getElementById("primary-btn");

// ── State ─────────────────────────────────────────────────
let ME        = null;
let listing   = null;
let listingId = null;
let payMethod = null;
let myCode    = null;

const params = new URLSearchParams(window.location.search);
listingId    = params.get("id");
payMethod    = params.get("method") ?? "wallet";

// ── Auth ──────────────────────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (!user) { window.location.href = "login.html#login"; return; }
    const ud = await getDoc(doc(database, "users", user.uid));
    ME = { uid: user.uid, name: ud.data()?.name ?? user.email, email: user.email };
    if (!listingId) { showError("No order found."); return; }
    await init();
});

// ── Init ──────────────────────────────────────────────────
async function init() {
    try {
        const snap = await getDoc(doc(database, "listings", listingId));
        if (!snap.exists()) { showError("This order no longer exists."); return; }
        listing = { id: snap.id, ...snap.data() };

        // Show page
        loading.style.display = "none";
        page.style.display    = "block";

        // Order card
        if (listing.images?.[0]) {
            orderImg.innerHTML = `<img src="${listing.images[0]}" alt="">`;
        }
        orderTitle.textContent = listing.title ?? "Untitled";
        orderMeta.textContent  = `Sold by ${listing.sellerName ?? "Unknown"}`;
        orderPrice.textContent = listing.price ? `$${listing.price.toFixed(2)}` : "Exchange";

        const isBuyer  = listing.buyerId  === ME.uid;
        const isSeller = listing.sellerId === ME.uid;

        // Already completed
        if (listing.status === "sold" || listing.status === "rented") {
            showCompleted(isSeller);
            return;
        }

        dotMeetup.classList.add("active");

        if (isBuyer) {
            // Generate or retrieve the code — stored on the listing so seller can verify
            myCode = await getOrCreateCode();
            codeDisplay.textContent = myCode;
            codeCard.classList.remove("hidden");
            setupCopyBtn();
            setupEmailBtn();
        } else if (isSeller) {
            verifyCard.classList.remove("hidden");
            setupVerifyBtn();
        } else {
            showError("You're not part of this transaction.");
        }

    } catch (err) {
        console.error(err);
        showError("Couldn't load this order. " + err.message);
    }
}

// ── Handover code ─────────────────────────────────────────
// Stored on the listing doc so seller can verify it server-side
async function getOrCreateCode() {
    // If code already exists on the listing, reuse it
    if (listing.handoverCode) return listing.handoverCode;

    // Generate a new 10-char alphanumeric code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
    let code = "";
    for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];

    // Save to Firestore so seller can verify
    await updateDoc(doc(database, "listings", listingId), { handoverCode: code });
    listing.handoverCode = code;
    return code;
}

// ── Copy button ───────────────────────────────────────────
function setupCopyBtn() {
    copyBtn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(myCode);
            copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
            setTimeout(() => { copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy Code`; }, 2000);
        } catch {
            // fallback
            const el = document.createElement("textarea");
            el.value = myCode;
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
            copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
            setTimeout(() => { copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy Code`; }, 2000);
        }
    });
}

// ── Email button ──────────────────────────────────────────
function setupEmailBtn() {
    emailBtn.addEventListener("click", () => {
        const subject = encodeURIComponent(`Smart Campus Order — ${listing.title}`);
        const body    = encodeURIComponent(
            `Hi ${ME.name},\n\nYour order is confirmed!\n\n` +
            `Item: ${listing.title}\n` +
            `Price: ${listing.price ? "$" + listing.price.toFixed(2) : "Exchange"}\n` +
            `Seller: ${listing.sellerName ?? "Unknown"}\n\n` +
            `Your handover code: ${myCode}\n\n` +
            `Show this code to the seller at the meetup to complete the transaction.\n\n` +
            `Smart Campus`
        );
        window.location.href = `mailto:${ME.email}?subject=${subject}&body=${body}`;
    });
}

// ── Verify button (seller) ────────────────────────────────
function setupVerifyBtn() {
    // Allow Enter key
    codeInput.addEventListener("keydown", e => {
        if (e.key === "Enter") verifyBtn.click();
    });
    // Auto uppercase
    codeInput.addEventListener("input", () => {
        codeInput.value = codeInput.value.toUpperCase();
    });

    verifyBtn.addEventListener("click", async () => {
        const entered = codeInput.value.trim().toUpperCase();
        if (entered.length < 10) {
            showVerifyResult("error", "Please enter the full 10-character code.");
            return;
        }

        verifyBtn.disabled = true;
        verifyBtn.textContent = "Verifying…";

        // Fetch fresh listing to get the stored code
        const freshSnap = await getDoc(doc(database, "listings", listingId));
        const stored    = freshSnap.data()?.handoverCode ?? "";

        if (entered !== stored) {
            showVerifyResult("error", "Incorrect code. Ask the buyer to double-check their confirmation screen.");
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Confirm & Release`;
            return;
        }

        showVerifyResult("success", "✓ Code matched! Releasing funds to your wallet…");
        await releaseEscrow();
    });
}

// ── Atomic escrow release ─────────────────────────────────
// Both listing → sold AND seller wallet credit happen together.
// If either fails → both roll back → money stays safe in escrow.
async function releaseEscrow() {
    try {
        await runTransaction(database, async tx => {
            const listingRef = doc(database, "listings", listingId);
            const sellerRef  = doc(database, "users", listing.sellerId);
            const statsRef   = doc(database, "stats", "public");

            const [listingSnap, sellerSnap] = await Promise.all([
                tx.get(listingRef),
                tx.get(sellerRef),
            ]);

            if (!listingSnap.exists()) throw new Error("Listing not found.");
            if (["sold","rented"].includes(listingSnap.data().status)) throw new Error("Already completed.");

            const escrowAmt     = listingSnap.data().escrowAmt ?? listing.price ?? 0;
            const sellerBalance = sellerSnap.data()?.walletBalance ?? 0;
            const newStatus     = listing.category === "rent" ? "rented" : "sold";

            tx.update(listingRef, { status: newStatus, sold: true, completedAt: serverTimestamp() });
            tx.update(sellerRef,  { walletBalance: sellerBalance + escrowAmt });
            tx.set(statsRef, { sold: increment(1) }, { merge: true });
        });

        showCompleted(true);

    } catch (err) {
        console.error("Escrow release failed:", err);
        showVerifyResult("error", `Failed: ${err.message} — Money is safe in escrow. Try again or contact support.`);
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Try Again`;
    }
}

// ── Completed ─────────────────────────────────────────────
function showCompleted(isSeller) {
    codeCard.classList.add("hidden");
    verifyCard.classList.add("hidden");
    completedCard.classList.remove("hidden");

    dotMeetup.className = "step-dot done";
    dotMeetup.innerHTML = `<i class="fa-solid fa-check"></i>`;
    dotDone.className   = "step-dot done";
    dotDone.innerHTML   = `<i class="fa-solid fa-check"></i>`;
    line1.classList.add("done");
    line2.classList.add("done");

    const amount = (listing.escrowAmt ?? listing.price ?? 0).toFixed(2);

    if (isSeller) {
        completedTitle.textContent = "Payment Received!";
        completedSub.textContent   = `$${amount} has been added to your wallet. Nice work!`;
        primaryBtn.classList.remove("hidden");
        primaryBtn.textContent = "View Wallet";
        primaryBtn.onclick     = () => window.location.href = "profile.html";
    } else {
        completedTitle.textContent = "You're all set! 🎉";
        completedSub.textContent   = `Enjoy your ${listing.title}. Your $${amount} payment has been released to the seller.`;
        if (typeof confetti === "function") {
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });
            setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.4 }, angle: 60 }), 400);
            setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.4 }, angle: 120 }), 700);
        }
    }
}

// ── Helpers ───────────────────────────────────────────────
function showError(msg) {
    loading.innerHTML = `<div style="font-size:2rem">⚠️</div><div style="color:var(--text-main);font-weight:500;margin-top:0.5rem;">${msg}</div>`;
}

function showVerifyResult(type, msg) {
    verifyResult.textContent  = msg;
    verifyResult.className    = `${type}`;
    verifyResult.style.display = "block";
}