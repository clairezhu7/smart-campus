import { database, authentication } from "./firebase-config.js";
import {
    onAuthStateChanged, signOut,
    updatePassword, EmailAuthProvider,
    reauthenticateWithCredential, verifyBeforeUpdateEmail
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    doc, getDoc, updateDoc, setDoc, increment,
    collection, query, where, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// — Sidebar / avatar
const avatarRing          = document.getElementById("avatar-ring");
const avatarInitials      = document.getElementById("avatar-initials");
const avatarEditBtn       = document.getElementById("avatar-edit-btn");
const avatarFileInput     = document.getElementById("avatar-file-input");
const sidebarName         = document.getElementById("sidebar-name");
const sidebarSchool       = document.getElementById("sidebar-school");
const sidebarJoined       = document.getElementById("sidebar-joined");

// — Tab nav (only buttons with a data-tab attribute; excludes logout)
const navItems            = document.querySelectorAll(".nav-item[data-tab]");
const tabPanels           = document.querySelectorAll(".tab-panel");

// — Profile tab: personal info
const infoEditBtn         = document.getElementById("info-edit-btn");
const infoFields          = document.getElementById("info-fields");
const infoActions         = document.getElementById("info-actions");
const displayName         = document.getElementById("display-name");
const displaySchool       = document.getElementById("display-school");
const inputName           = document.getElementById("input-name");
const inputSchool         = document.getElementById("input-school");
const profileSchoolsList  = document.getElementById("profile-schools-list");
const infoCancelBtn       = document.getElementById("info-cancel");
const infoSaveBtn         = document.getElementById("info-save");

// — Profile tab: email
const emailEditBtn        = document.getElementById("email-edit-btn");
const emailChangeForm     = document.getElementById("email-change-form");
const emailActions        = document.getElementById("email-actions");
const emailPending        = document.getElementById("email-pending");
const currentEmailDisplay = document.getElementById("current-email-display");
const inputNewEmail       = document.getElementById("input-new-email");
const emailCancelBtn      = document.getElementById("email-cancel");
const emailSendBtn        = document.getElementById("email-send");
const emailResendBtn      = document.getElementById("email-resend");
const pendingEmailDisplay = document.getElementById("pending-email-display");

// — Profile tab: password
const pwdEditBtn          = document.getElementById("pwd-edit-btn");
const pwdForm             = document.getElementById("pwd-form");
const pwdActions          = document.getElementById("pwd-actions");
const inputPwdCurrent     = document.getElementById("input-pwd-current");
const inputPwdNew         = document.getElementById("input-pwd-new");
const inputPwdConfirm     = document.getElementById("input-pwd-confirm");
const pwdStrengthWrap     = document.getElementById("pwd-strength");
const pwdCancelBtn        = document.getElementById("pwd-cancel");
const pwdSaveBtn          = document.getElementById("pwd-save");

// — Profile tab: danger zone
const deleteAccountBtn    = document.getElementById("delete-account-btn");

// — Listings tab
const listingsGrid        = document.getElementById("listings-grid");
const listingsSubTabs     = document.getElementById("listings-sub-tabs");
const listingsCountBadge  = document.getElementById("listings-count");

// — Favourites tab
const favouritesGrid      = document.getElementById("favourites-grid");
const favCountBadge       = document.getElementById("fav-count");

// — Orders tab
const ordersList          = document.getElementById("orders-list");
const ordersSubTabs       = document.getElementById("orders-sub-tabs");
const ordersCountBadge    = document.getElementById("orders-count");

// — Toast
const toastEl             = document.getElementById("toast");
const toastIcon           = document.getElementById("toast-icon");
const toastMsg            = document.getElementById("toast-msg");

// — Confirm modal
const confirmModal        = document.getElementById("confirm-modal");
const modalTitle          = document.getElementById("modal-title");
const modalBody           = document.getElementById("modal-body");
const modalCancelBtn      = document.getElementById("modal-cancel");
const modalConfirmBtn     = document.getElementById("modal-confirm");

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────

let ME             = null;   // { uid, name, email, school, joined, photoURL }
let myListings     = [];
let myFavourites   = [];
let myOrders       = [];
let listingsFilter = "active";
let ordersFilter   = "in_progress";
let pendingNewEmail = "";

// ─────────────────────────────────────────────────────────
// AUTH GATE
// ─────────────────────────────────────────────────────────

onAuthStateChanged(authentication, async user => {
    if (!user) {
        window.location.replace("login.html?fallback=profile.html#login");
        return;
    }

    const userSnap = await getDoc(doc(database, "users", user.uid));
    const data = userSnap.data() ?? {};

    ME = {
        uid:      user.uid,
        name:     data.name     ?? user.displayName ?? user.email,
        email:    user.email,
        school:   data.school   ?? "",
        photoURL: data.photoURL ?? user.photoURL ?? "",
        joined:   data.dateCreated
            ? new Date(data.dateCreated).toLocaleDateString("en-CA", { month: "short", year: "numeric" })
            : "Unknown"
    };

    initPage();
});

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────

function initPage() {
    updateSidebarProfile();
    populateProfileFields();
    wireTabNav();
    wireAvatar();
    wireInfoEdit();
    wireSchoolAutocomplete();
    loadOntarioSchools();
    wireEmailEdit();
    wirePwdEdit();
    wireDeleteAccount();
    wireLogout();
    renderListings();
    renderFavourites();
    renderOrders();
    wireListingsSubTabs();
    wireOrdersSubTabs();
}

// ─────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────

function updateSidebarProfile() {
    const initials = ME.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

    if (ME.photoURL) {
        avatarInitials.style.display = "none";
        let img = document.getElementById("avatar-photo");
        if (!img) {
            img = document.createElement("img");
            img.id = "avatar-photo";
            img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;";
            avatarRing.prepend(img);
        }
        img.src = ME.photoURL;
    } else {
        avatarInitials.style.display = "";
        avatarInitials.textContent = initials;
        const existing = document.getElementById("avatar-photo");
        if (existing) existing.remove();
    }

    sidebarName.textContent   = ME.name;
    sidebarSchool.textContent = ME.school;
    sidebarJoined.textContent = `Member since ${ME.joined}`;
}

// ─────────────────────────────────────────────────────────
// AVATAR UPLOAD
// ─────────────────────────────────────────────────────────

function wireAvatar() {
    avatarEditBtn.addEventListener("click", () => avatarFileInput.click());

    avatarFileInput.addEventListener("change", async () => {
        const file = avatarFileInput.files[0];
        if (!file) return;

        avatarEditBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
        avatarEditBtn.disabled  = true;

        try {
            const dataUrl = await compressAvatar(file);
            await updateDoc(doc(database, "users", ME.uid), { photoURL: dataUrl });
            ME.photoURL = dataUrl;
            updateSidebarProfile();
            showToast("Profile photo updated!");
        } catch (err) {
            console.error("Avatar upload failed:", err);
            showToast("Couldn't update photo.", "error");
        } finally {
            avatarEditBtn.innerHTML = `<i class="fa-solid fa-camera"></i>`;
            avatarEditBtn.disabled  = false;
            avatarFileInput.value   = "";
        }
    });
}

// Compress avatar to a small square base64 JPEG (same technique as sell.js)
function compressAvatar(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                // Crop to square from centre, then resize to 256×256
                const size   = Math.min(img.width, img.height);
                const sx     = (img.width  - size) / 2;
                const sy     = (img.height - size) / 2;
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 256;
                canvas.getContext("2d").drawImage(img, sx, sy, size, size, 0, 0, 256, 256);

                let quality = 0.8;
                let dataUrl = canvas.toDataURL("image/jpeg", quality);
                // Keep shrinking until it fits comfortably in a Firestore field (~100 KB)
                while (dataUrl.length > 130 * 1024 && quality > 0.35) {
                    quality -= 0.1;
                    dataUrl  = canvas.toDataURL("image/jpeg", quality);
                }
                resolve(dataUrl);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

// ─────────────────────────────────────────────────────────
// TAB NAVIGATION
// ─────────────────────────────────────────────────────────

function wireTabNav() {
    const mobileNavBtns = document.querySelectorAll(".mobile-nav-btn[data-tab]");

    function activateTab(tabName) {
        const match = [...navItems].find(b => b.dataset.tab === tabName);
        if (!match) return;
        navItems.forEach(b  => b.classList.remove("active"));
        tabPanels.forEach(p => p.classList.remove("active"));
        match.classList.add("active");
        document.getElementById(`tab-${tabName}`).classList.add("active");
        history.replaceState(null, "", `#${tabName}`);

        // Sync mobile bottom nav active state
        mobileNavBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === tabName));
    }

    navItems.forEach(btn => {
        btn.addEventListener("click", () => {
            activateTab(btn.dataset.tab);
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });

    // Mobile bottom nav buttons
    mobileNavBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            activateTab(btn.dataset.tab);
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });

    // On load: honour the hash if present, otherwise default to "profile"
    const initialTab = window.location.hash.replace("#", "") || "profile";
    activateTab(initialTab);

    // Respond to browser back/forward
    window.addEventListener("popstate", () => {
        const tab = window.location.hash.replace("#", "") || "profile";
        activateTab(tab);
    });
}

// ─────────────────────────────────────────────────────────
// PROFILE TAB — Personal info
// ─────────────────────────────────────────────────────────

function populateProfileFields() {
    // Each field targeted by its own id — no ambiguous querySelector
    displayName.textContent   = ME.name;
    displaySchool.textContent = ME.school;
    inputName.value           = ME.name;
    inputSchool.value         = ME.school;
    currentEmailDisplay.textContent = ME.email;
}

// ─────────────────────────────────────────────────────────
// PROFILE TAB — School autocomplete (same source list as sign-up)
// ─────────────────────────────────────────────────────────

let allSchools = [];

async function loadOntarioSchools() {
    try {
        const res = await fetch("ontario-public-schools.json");
        const data = await res.json();
        allSchools = data.records.map(r => r[7]);
    } catch (err) {
        console.error("Couldn't load schools list:", err);
    }
}

function wireSchoolAutocomplete() {
    inputSchool.addEventListener("focus", () => filterProfileSchools(inputSchool.value));
    inputSchool.addEventListener("input", () => filterProfileSchools(inputSchool.value));
    inputSchool.addEventListener("blur", () => {
        setTimeout(() => profileSchoolsList.classList.add("hidden"), 200);
    });
}

function filterProfileSchools(value) {
    const q = value.toLowerCase().trim();
    const matches = allSchools.filter(s => s.toLowerCase().includes(q)).slice(0, 20);
    if (!q || matches.length === 0) {
        profileSchoolsList.classList.add("hidden");
        profileSchoolsList.innerHTML = "";
        return;
    }
    profileSchoolsList.innerHTML = matches.map(name => {
        const div = document.createElement("div");
        div.className = "profile-school-option";
        div.textContent = name;
        return div.outerHTML;
    }).join("");
    profileSchoolsList.classList.remove("hidden");
    profileSchoolsList.querySelectorAll(".profile-school-option").forEach((el, i) => {
        el.addEventListener("mousedown", () => {
            inputSchool.value = matches[i];
            profileSchoolsList.classList.add("hidden");
        });
    });
}

function wireInfoEdit() {
    const setEditing = (on) => {
        infoFields.querySelectorAll(".field-display").forEach(el => el.classList.toggle("hidden", on));
        infoFields.querySelectorAll(".field-input").forEach(el   => el.classList.toggle("hidden", !on));
        infoActions.classList.toggle("hidden", !on);
        infoEditBtn.innerHTML = on
            ? `<i class="fa-solid fa-xmark"></i> Close`
            : `<i class="fa-solid fa-pen"></i> Edit`;
    };

    // Enter key inside the info card triggers Save
    document.getElementById("settings-card-info").addEventListener("keydown", e => {
        if (e.key === "Enter" && !infoActions.classList.contains("hidden")) {
            e.preventDefault();
            infoSaveBtn.click();
        }
    });

    infoEditBtn.addEventListener("click", () => {
        const isEditing = !infoActions.classList.contains("hidden");
        if (isEditing) {
            inputName.value   = ME.name;
            inputSchool.value = ME.school;
        }
        setEditing(!isEditing);
    });

    infoCancelBtn.addEventListener("click", () => {
        inputName.value   = ME.name;
        inputSchool.value = ME.school;
        setEditing(false);
    });

    infoSaveBtn.addEventListener("click", async () => {
        const name   = inputName.value.trim();
        const school = inputSchool.value.trim();
        if (!name) { showToast("Name cannot be empty.", "error"); return; }

        infoSaveBtn.textContent = "Saving…";
        infoSaveBtn.disabled    = true;

        try {
            await updateDoc(doc(database, "users", ME.uid), { name, school });
            ME.name   = name;
            ME.school = school;
            populateProfileFields();
            updateSidebarProfile();
            setEditing(false);
            showToast("Profile updated!");
        } catch (err) {
            console.error("Profile update failed:", err);
            showToast("Couldn't save changes.", "error");
        } finally {
            infoSaveBtn.textContent = "Save Changes";
            infoSaveBtn.disabled    = false;
        }
    });
}

// ─────────────────────────────────────────────────────────
// PROFILE TAB — Email change
// Uses verifyBeforeUpdateEmail() so the address only changes
// in Firebase Auth after the user clicks the link.
// ─────────────────────────────────────────────────────────

function wireEmailEdit() {
    const setEditing = (on) => {
        emailChangeForm.classList.toggle("hidden", !on);
        emailActions.classList.toggle("hidden", !on);
        emailEditBtn.innerHTML = on
            ? `<i class="fa-solid fa-xmark"></i> Close`
            : `<i class="fa-solid fa-pen"></i> Edit`;
        if (!on) emailPending.classList.add("hidden");
    };

    // Enter key inside the email card triggers Send Verification
    document.getElementById("settings-card-email").addEventListener("keydown", e => {
        if (e.key === "Enter" && !emailActions.classList.contains("hidden")) {
            e.preventDefault();
            emailSendBtn.click();
        }
    });

    emailEditBtn.addEventListener("click", () => {
        setEditing(emailActions.classList.contains("hidden"));
    });

    emailCancelBtn.addEventListener("click", () => {
        inputNewEmail.value = "";
        inputNewEmail.classList.remove("error");
        setEditing(false);
    });

    emailSendBtn.addEventListener("click", async () => {
        const newEmail = inputNewEmail.value.trim();
        if (!newEmail || !newEmail.includes("@")) {
            inputNewEmail.classList.add("error");
            showToast("Enter a valid email address.", "error");
            return;
        }
        inputNewEmail.classList.remove("error");
        emailSendBtn.textContent = "Sending…";
        emailSendBtn.disabled    = true;

        try {
            await verifyBeforeUpdateEmail(authentication.currentUser, newEmail);
            pendingNewEmail = newEmail;
            pendingEmailDisplay.textContent = newEmail;
            emailPending.classList.remove("hidden");
            setEditing(false);
            showToast("Verification email sent! Check your inbox.");
        } catch (err) {
            console.error("Email change failed:", err);
            if (err.code === "auth/requires-recent-login") {
                showToast("Please log out and back in, then try again.", "error");
            } else if (err.code === "auth/email-already-in-use") {
                showToast("That email is already linked to another account.", "error");
            } else {
                showToast("Couldn't send verification email.", "error");
            }
        } finally {
            emailSendBtn.textContent = "Send Verification";
            emailSendBtn.disabled    = false;
        }
    });

    emailResendBtn.addEventListener("click", async () => {
        if (!pendingNewEmail) return;
        try {
            await verifyBeforeUpdateEmail(authentication.currentUser, pendingNewEmail);
            showToast("Verification email resent!");
        } catch (err) {
            console.error("Resend failed:", err);
            showToast("Couldn't resend verification email.", "error");
        }
    });
}

// ─────────────────────────────────────────────────────────
// PROFILE TAB — Password change
// ─────────────────────────────────────────────────────────

function wirePwdEdit() {
    const setEditing = (on) => {
        pwdForm.classList.toggle("hidden", !on);
        pwdActions.classList.toggle("hidden", !on);
        pwdEditBtn.innerHTML = on
            ? `<i class="fa-solid fa-xmark"></i> Close`
            : `<i class="fa-solid fa-pen"></i> Change`;
    };

    // Enter key inside the password card triggers Update Password
    document.getElementById("settings-card-pwd").addEventListener("keydown", e => {
        if (e.key === "Enter" && !pwdActions.classList.contains("hidden")) {
            e.preventDefault();
            pwdSaveBtn.click();
        }
    });

    pwdEditBtn.addEventListener("click", () => {
        setEditing(pwdActions.classList.contains("hidden"));
    });

    pwdCancelBtn.addEventListener("click", () => {
        clearPwdFields();
        setEditing(false);
    });

    document.querySelectorAll(".pwd-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.target);
            const isText = input.type === "text";
            input.type = isText ? "password" : "text";
            btn.querySelector("i").className = isText ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
        });
    });

    inputPwdNew.addEventListener("input", e => renderStrength(e.target.value));

    pwdSaveBtn.addEventListener("click", async () => {
        const currentPwd = inputPwdCurrent.value;
        const newPwd     = inputPwdNew.value;
        const confirmPwd = inputPwdConfirm.value;

        let valid = true;
        const mark = (el, bad) => { el.classList.toggle("error", bad); if (bad) valid = false; };
        mark(inputPwdCurrent, !currentPwd);
        mark(inputPwdNew,     newPwd.length < 6);
        mark(inputPwdConfirm, newPwd !== confirmPwd);

        if (!valid) {
            showToast(newPwd !== confirmPwd ? "Passwords don't match." : "Please fill in all fields correctly.", "error");
            return;
        }

        pwdSaveBtn.textContent = "Updating…";
        pwdSaveBtn.disabled    = true;

        try {
            const credential = EmailAuthProvider.credential(ME.email, currentPwd);
            await reauthenticateWithCredential(authentication.currentUser, credential);
            await updatePassword(authentication.currentUser, newPwd);
            clearPwdFields();
            setEditing(false);
            showToast("Password updated!");
        } catch (err) {
            console.error("Password update failed:", err);
            if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
                inputPwdCurrent.classList.add("error");
                showToast("Current password is incorrect.", "error");
            } else {
                showToast("Couldn't update password.", "error");
            }
        } finally {
            pwdSaveBtn.textContent = "Update Password";
            pwdSaveBtn.disabled    = false;
        }
    });
}

function clearPwdFields() {
    [inputPwdCurrent, inputPwdNew, inputPwdConfirm].forEach(el => {
        el.value = "";
        el.classList.remove("error");
    });
    renderStrength("");
}

function renderStrength(pwd) {
    if (pwd.length === 0) {
        pwdStrengthWrap.innerHTML = "";
        pwdStrengthWrap.className = "pwd-strength";
        const lbl = document.getElementById("pwd-strength-label");
        if (lbl) lbl.textContent = "";
        return;
    }

    let level = "weak";
    if      (pwd.length >= 10 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd) && /[^a-zA-Z0-9]/.test(pwd)) level = "great";
    else if (pwd.length >= 8  && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) level = "strong";
    else if (pwd.length >= 6)  level = "fair";

    pwdStrengthWrap.innerHTML = `<span class="seg"></span><span class="seg"></span><span class="seg"></span><span class="seg"></span>`;
    pwdStrengthWrap.className = `pwd-strength ${level}`;

    let labelEl = document.getElementById("pwd-strength-label");
    if (!labelEl) {
        labelEl = document.createElement("div");
        labelEl.id = "pwd-strength-label";
        pwdStrengthWrap.parentNode.insertBefore(labelEl, pwdStrengthWrap.nextSibling);
    }
    const labels = { weak: "Weak", fair: "Fair", strong: "Strong", great: "Great" };
    labelEl.textContent = labels[level];
    labelEl.className   = `pwd-strength-label ${level}`;
}

// ─────────────────────────────────────────────────────────
// PROFILE TAB — Delete account
// ─────────────────────────────────────────────────────────

function wireDeleteAccount() {
    deleteAccountBtn.addEventListener("click", () => {
        showConfirm(
            "Delete your account?",
            "This will permanently erase your profile and all your data. There is no going back.",
            async () => {
                try {
                    await deleteDoc(doc(database, "users", ME.uid));
                    await setDoc(doc(database, "stats", "public"), { students: increment(-1) }, { merge: true })
                        .catch(err => console.warn("Couldn't update public stats:", err));
                    await authentication.currentUser.delete();
                    showToast("Account deleted. Redirecting…", "error");
                    setTimeout(() => window.location.href = "index.html", 2000);
                } catch (err) {
                    console.error("Account deletion failed:", err);
                    if (err.code === "auth/requires-recent-login") {
                        showToast("Please log out and back in before deleting.", "error");
                    } else {
                        showToast("Couldn't delete account.", "error");
                    }
                }
            }
        );
    });
}

// ─────────────────────────────────────────────────────────
// LISTINGS TAB
// NOTE: We query by sellerId only (no orderBy) to avoid
// needing a composite Firestore index, then sort client-side.
// ─────────────────────────────────────────────────────────

async function renderListings() {
    listingsGrid.innerHTML = `<div class="empty-state"><div class="empty-sub">Loading…</div></div>`;

    try {
        const q    = query(collection(database, "listings"), where("sellerId", "==", ME.uid));
        const snap = await getDocs(q);
        myListings = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.postedAt?.seconds ?? 0) - (a.postedAt?.seconds ?? 0));
    } catch (err) {
        console.error("Listings fetch failed:", err);
        listingsGrid.innerHTML = `<div class="empty-state"><div class="empty-sub">Failed to load listings.</div></div>`;
        return;
    }

    applyListingsFilter();
}

function wireListingsSubTabs() {
    listingsSubTabs.addEventListener("click", e => {
        const tab = e.target.closest(".sub-tab");
        if (!tab) return;
        listingsSubTabs.querySelectorAll(".sub-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        listingsFilter = tab.dataset.filter;
        applyListingsFilter();
    });
}

function applyListingsFilter() {
    const items = myListings.filter(l => {
        if (listingsFilter === "active") return !l.sold;
        if (listingsFilter === "sold")   return !!l.sold;
        return true;
    });

    listingsCountBadge.textContent = myListings.filter(l => !l.sold).length;
    syncMobileBadge("mobile-listings-count", listingsCountBadge.textContent);

    if (items.length === 0) {
        const msgs = {
            active: ["📦", "No active listings",  "Items you post will appear here."],
            sold:   ["🏷️", "No sold items yet",    "Completed sales will appear here."],
        };
        const [emoji, msg, sub] = msgs[listingsFilter] ?? ["📦", "Nothing here", ""];
        listingsGrid.innerHTML = `<div class="empty-state">
            <div class="empty-emoji">${emoji}</div>
            <div class="empty-msg">${msg}</div>
            <div class="empty-sub">${sub}</div>
        </div>`;
        return;
    }

    listingsGrid.innerHTML = items.map(item => {
        const status  = item.sold ? "sold" : "active";
        const imgHTML = item.images?.[0]
            ? `<img src="${escapeAttr(item.images[0])}" alt="" loading="lazy"
                   onerror="this.parentElement.innerHTML='<i class=\\'fa-regular fa-image\\'></i>'">`
            : `<i class="fa-regular fa-image" style="font-size:2rem;color:var(--text-prompt)"></i>`;

        return `
        <div class="listing-card" data-id="${item.id}">
            <div class="listing-card-img">
                ${imgHTML}
                <span class="listing-status-badge status-${status}">${status}</span>
            </div>
            <div class="listing-card-body">
                <div class="listing-card-title">${escapeHtml(item.title ?? "Untitled")}</div>
                <div class="listing-card-price">${formatPrice(item)}</div>
                <div class="listing-card-meta">
                    <span><i class="fa-regular fa-eye"></i> ${item.views ?? 0} views</span>
                    <span>${timeAgo(item.postedAt)}</span>
                </div>
            </div>
            <div class="listing-card-actions">
                <button onclick="window.location.href='sell.html?edit=${item.id}'">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn-remove" data-delete="${item.id}">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
            </div>
        </div>`;
    }).join("");

    listingsGrid.querySelectorAll("[data-delete]").forEach(btn => {
        btn.addEventListener("click", () => {
            const id    = btn.dataset.delete;
            const item  = myListings.find(l => l.id === id);
            const label = item?.title ? `"${item.title}"` : "this listing";
            showConfirm(`Remove ${label}?`, "This listing will be permanently deleted.", async () => {
                try {
                    await deleteDoc(doc(database, "listings", id));
                    setDoc(doc(database, "stats", "public"), {
                        listings: increment(-1),
                        ...(item?.sold ? { sold: increment(-1) } : {})
                    }, { merge: true }).catch(err => console.warn("Couldn't update public stats:", err));
                    myListings = myListings.filter(l => l.id !== id);
                    applyListingsFilter();
                    showToast("Listing removed.");
                } catch (err) {
                    console.error("Delete listing failed:", err);
                    showToast("Couldn't delete listing.", "error");
                }
            });
        });
    });
}

// ─────────────────────────────────────────────────────────
// FAVOURITES TAB
// Sub-collection: users/{uid}/favourites/{listingId}
// Doc fields: listingId, title, price, image, category, sellerName
// ─────────────────────────────────────────────────────────

async function renderFavourites() {
    favouritesGrid.innerHTML = `<div class="empty-state"><div class="empty-sub">Loading…</div></div>`;

    try {
        const snap = await getDocs(collection(database, "users", ME.uid, "favourites"));
        myFavourites = snap.docs.map(d => ({ favDocId: d.id, ...d.data() }));
    } catch (err) {
        console.error("Favourites fetch failed:", err);
        favouritesGrid.innerHTML = `<div class="empty-state"><div class="empty-sub">Failed to load favourites.</div></div>`;
        return;
    }

    favCountBadge.textContent = myFavourites.length;
    syncMobileBadge("mobile-fav-count", myFavourites.length);

    if (myFavourites.length === 0) {
        favouritesGrid.innerHTML = `<div class="empty-state">
            <div class="empty-emoji">🤍</div>
            <div class="empty-msg">No favourites yet</div>
            <div class="empty-sub">Tap the heart on any listing to save it here.</div>
        </div>`;
        return;
    }

    const catLabel = { new: "New", used: "Used", rent: "Rent", exchange: "Exchange" };

    favouritesGrid.innerHTML = myFavourites.map(item => {
        const imgHTML = item.image
            ? `<img src="${escapeAttr(item.image)}" alt="" loading="lazy"
                   onerror="this.parentElement.innerHTML='<i class=\\'fa-regular fa-image\\'></i>'">`
            : `<i class="fa-regular fa-image" style="font-size:2rem;color:var(--text-prompt)"></i>`;
        const target = item.listingId ?? item.favDocId;

        return `
        <div class="listing-card fav-card" data-id="${target}">
            <div class="listing-card-img" style="cursor:pointer"
                 onclick="window.location.href='listing.html?id=${target}'">
                ${imgHTML}
                ${item.category ? `<span class="listing-status-badge" style="background:#eef2ff;color:#4f46e5">${catLabel[item.category] ?? item.category}</span>` : ""}
                <button class="fav-remove-btn" data-fav="${item.favDocId}" title="Remove from favourites">
                    <i class="fa-solid fa-heart"></i>
                </button>
            </div>
            <div class="listing-card-body" style="cursor:pointer"
                 onclick="window.location.href='listing.html?id=${target}'">
                <div class="listing-card-title">${escapeHtml(item.title ?? "Untitled")}</div>
                <div class="listing-card-price">${item.category === "exchange" ? "Exchange" : (item.price != null ? `$${Number(item.price).toFixed(2)}` : "—")}</div>
                <div class="listing-card-meta">
                    <span>by ${escapeHtml(item.sellerName ?? "Unknown")}</span>
                </div>
            </div>
        </div>`;
    }).join("");

    favouritesGrid.querySelectorAll("[data-fav]").forEach(btn => {
        btn.addEventListener("click", async e => {
            e.stopPropagation();
            const favDocId = btn.dataset.fav;
            try {
                await deleteDoc(doc(database, "users", ME.uid, "favourites", favDocId));
                myFavourites = myFavourites.filter(f => f.favDocId !== favDocId);
                favCountBadge.textContent = myFavourites.length;
                syncMobileBadge("mobile-fav-count", myFavourites.length);
                btn.closest(".listing-card").remove();
                if (myFavourites.length === 0) renderFavourites();
                showToast("Removed from favourites.");
            } catch (err) {
                console.error("Remove favourite failed:", err);
                showToast("Couldn't remove favourite.", "error");
            }
        });
    });
}

// ─────────────────────────────────────────────────────────
// ORDERS TAB
// Sub-collection: users/{uid}/orders/{orderId}
// Doc fields: listingId, title, price, image, sellerName,
//             status ("in_progress"|"completed"|"cancelled"),
//             currentStep (0-3), createdAt (Timestamp)
// ─────────────────────────────────────────────────────────

async function renderOrders() {
    ordersList.innerHTML = `<div class="empty-state"><div class="empty-sub">Loading…</div></div>`;

    try {
        const snap = await getDocs(collection(database, "users", ME.uid, "orders"));
        myOrders = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    } catch (err) {
        console.error("Orders fetch failed:", err);
        ordersList.innerHTML = `<div class="empty-state"><div class="empty-sub">Failed to load orders.</div></div>`;
        return;
    }

    ordersCountBadge.textContent = myOrders.filter(o => o.status === "in_progress").length;
    syncMobileBadge("mobile-orders-count", ordersCountBadge.textContent);
    applyOrdersFilter();
}

function wireOrdersSubTabs() {
    ordersSubTabs.addEventListener("click", e => {
        const tab = e.target.closest(".sub-tab");
        if (!tab) return;
        ordersSubTabs.querySelectorAll(".sub-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        ordersFilter = tab.dataset.filter;
        applyOrdersFilter();
    });
}

function applyOrdersFilter() {
    const items = myOrders.filter(o => o.status === ordersFilter);

    const emptyMsgs = {
        in_progress: ["📬", "No active orders",    "Orders awaiting meet-up will appear here."],
        completed:   ["✅", "No completed orders", "Once you receive an item it shows up here."],
        cancelled:   ["🚫", "No cancelled orders", "Cancelled transactions appear here."],
    };

    if (items.length === 0) {
        const [emoji, msg, sub] = emptyMsgs[ordersFilter] ?? ["📦", "Nothing here", ""];
        ordersList.innerHTML = `<div class="empty-state">
            <div class="empty-emoji">${emoji}</div>
            <div class="empty-msg">${msg}</div>
            <div class="empty-sub">${sub}</div>
        </div>`;
        return;
    }

    const STEPS     = ["Ordered", "Confirmed", "Meet-up", "Received"];
    const pillClass = { in_progress: "pill-in-progress", completed: "pill-completed", cancelled: "pill-cancelled" };
    const pillLabel = { in_progress: "In Progress",      completed: "Completed",      cancelled: "Cancelled" };

    ordersList.innerHTML = items.map(order => {
        const imgHTML = order.image
            ? `<img src="${escapeAttr(order.image)}" alt="" loading="lazy"
                   onerror="this.parentElement.innerHTML='<i class=\\'fa-regular fa-image\\'></i>'">`
            : `<i class="fa-regular fa-image" style="font-size:1.5rem;color:var(--text-prompt)"></i>`;

        const step = typeof order.currentStep === "number" ? order.currentStep : 0;
        const timelineHTML = order.status !== "cancelled" ? `
            <div class="order-timeline">
                ${STEPS.map((s, i) => {
                    const cls = i < step ? "done" : i === step ? "current" : "";
                    return `<div class="order-step ${cls}">
                        <div class="step-dot"></div>
                        <div class="step-label">${s}</div>
                    </div>`;
                }).join("")}
            </div>` : "";

        const dateStr = order.createdAt?.toDate
            ? order.createdAt.toDate().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
            : "";

        return `
        <div class="order-card">
            <div class="order-img">${imgHTML}</div>
            <div class="order-info">
                <div class="order-title">${escapeHtml(order.title ?? "Unknown item")}</div>
                <div class="order-seller">Seller: ${escapeHtml(order.sellerName ?? "Unknown")}</div>
                ${timelineHTML}
            </div>
            <div class="order-right">
                <div class="order-price">${order.price != null ? `$${order.price}` : "—"}</div>
                <div class="order-status-pill ${pillClass[order.status] ?? ""}">${pillLabel[order.status] ?? order.status}</div>
                <div class="order-date">${dateStr}</div>
            </div>
        </div>`;
    }).join("");
}

// ─────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────

function wireLogout() {
    const doLogout = () => {
        showConfirm(
            "Log out?",
            "You'll be signed out of your session.",
            async () => {
                try {
                    await signOut(authentication);
                    window.location.href = "index.html";
                } catch (error) {
                    console.error("Logout failed:", error);
                    showToast("Couldn't log out. Try again.", "error");
                }
            }
        );
    };

    // Sidebar logout button
    const sidebarLogoutBtn = document.getElementById("sidebar-logout-btn");
    if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener("click", doLogout);

    // Mobile bottom-nav logout button
    const mobileLogoutBtn = document.getElementById("mobile-logout-btn");
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener("click", doLogout);
}

// ─────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────

function syncMobileBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    const n = parseInt(count, 10) || 0;
    el.textContent = n;
    el.dataset.count = n;
}

function showToast(msg, type = "success") {
    toastEl.className       = `show toast-${type}`;
    toastIcon.className     = type === "success" ? "fa-solid fa-circle-check" : "fa-solid fa-circle-xmark";
    toastMsg.textContent    = msg;
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => { toastEl.className = "hidden"; }, 3000);
}

function showConfirm(title, body, onConfirm) {
    modalTitle.textContent = title;
    modalBody.textContent  = body;
    confirmModal.classList.remove("hidden");
    const close = () => confirmModal.classList.add("hidden");
    modalCancelBtn.onclick  = close;
    confirmModal.querySelector(".modal-overlay").onclick = close;
    modalConfirmBtn.onclick = () => { close(); onConfirm(); };
}

// ─────────────────────────────────────────────────────────
// DATA HELPERS
// ─────────────────────────────────────────────────────────

function formatPrice(item) {
    if (item.category === "exchange") return `<span>Exchange</span>`;
    const price = typeof item.price === "number" ? `$${item.price.toFixed(2)}` : "—";
    if (item.category === "rent") return `${price}<span class="unit"> / ${item.rentDuration ?? "week"}</span>`;
    return price;
}

function timeAgo(ts) {
    if (!ts?.toDate) return "";
    const date    = ts.toDate();
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60)     return "just now";
    if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

function escapeAttr(s) { return escapeHtml(s); }