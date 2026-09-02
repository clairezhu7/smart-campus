import { authentication } from "./firebase-config.js";
import {
    sendPasswordResetEmail,
    confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const actionCodeSettings = {
    url: `${window.location.origin}/login.html#login`,
    handleCodeInApp: false
};

// ── DOM ───────────────────────────────────────────────────
const forgotPanel    = document.getElementById("forgot-password");
const resetPanel     = document.getElementById("password-reset");
const errorPanel     = document.getElementById("reset-error");
const errorMessage   = document.getElementById("error-message");

const forgotForm     = document.getElementById("forgot-form");
const forgotBtn      = document.getElementById("forgot-btn");
const resetEmailInput = document.getElementById("reset-email");

const resetForm      = document.getElementById("reset-form");
const resetBtn       = document.getElementById("reset-btn");
const resetPwdInput  = document.getElementById("reset-password");

// ── Toast ─────────────────────────────────────────────────
const toastEl   = document.getElementById("toast");
const toastIcon = document.getElementById("toast-icon");
const toastMsg  = document.getElementById("toast-msg");

function showToast(msg, type = "success") {
    toastEl.className = `show toast-${type}`;
    toastIcon.className = type === "success"
        ? "fa-solid fa-circle-check"
        : "fa-solid fa-circle-xmark";
    toastMsg.textContent = msg;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.className = ""; }, 3500);
}

// ── Hash routing ──────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
    // Firebase redirects back with ?oobCode=...&mode=resetPassword in the URL
    const params     = new URLSearchParams(window.location.search);
    const oobCode    = params.get("oobCode");
    const mode       = params.get("mode");

    if (oobCode && mode === "resetPassword") {
        // Store the token in the hash so handleHashChange picks it up
        window.location.hash = `#password-reset?token=${oobCode}`;
    } else {
        handleHashChange();
    }
});

window.addEventListener("hashchange", handleHashChange);

function handleHashChange() {
    forgotPanel.classList.add("hidden");
    resetPanel.classList.add("hidden");
    errorPanel.classList.add("hidden");

    const hash      = window.location.hash;           // e.g. "#password-reset?token=xyz"
    const hashBase  = hash.split("?")[0];
    const hashQuery = new URLSearchParams(hash.split("?")[1] ?? "");
    const token     = hashQuery.get("token");

    if (hashBase === "#password-reset" && token) {
        resetPanel.classList.remove("hidden");
    } else {
        if (hashBase !== "#forgot-password") {
            window.history.replaceState(null, "", "#forgot-password");
        }
        forgotPanel.classList.remove("hidden");
    }
}

// ── Send reset email ──────────────────────────────────────
forgotForm.addEventListener("submit", async e => {
    e.preventDefault();
    const email = resetEmailInput.value.trim();
    if (!email) { showToast("Please enter your email address.", "error"); return; }

    forgotBtn.disabled    = true;
    forgotBtn.textContent = "Sending…";

    try {
        await sendPasswordResetEmail(authentication, email, actionCodeSettings);
        showToast("Reset link sent! Check your inbox.");
        forgotBtn.textContent = "Email Sent ✓";
    } catch (err) {
        console.error(err);
        forgotBtn.disabled    = false;
        forgotBtn.textContent = "Send Reset Link";
        if (err.code === "auth/user-not-found") {
            showToast("No account found with that email.", "error");
        } else {
            showToast("Couldn't send reset email. Try again.", "error");
        }
    }
});

// ── Confirm new password ──────────────────────────────────
resetForm.addEventListener("submit", async e => {
    e.preventDefault();
    const newPassword = resetPwdInput.value;
    if (newPassword.length < 6) {
        showToast("Password must be at least 6 characters.", "error");
        return;
    }

    const hash     = window.location.hash;
    const token    = new URLSearchParams(hash.split("?")[1] ?? "").get("token");
    if (!token) {
        showToast("Invalid reset link.", "error");
        return;
    }

    resetBtn.disabled    = true;
    resetBtn.textContent = "Updating…";

    try {
        await confirmPasswordReset(authentication, token, newPassword);
        showToast("Password updated! Redirecting to login…");
        setTimeout(() => window.location.href = "login.html#login", 1800);
    } catch (err) {
        console.error(err);
        resetBtn.disabled    = false;
        resetBtn.textContent = "Update Password";

        if (err.code === "auth/expired-action-code") {
            errorMessage.textContent = "This link has expired. For security reasons, please request a new one.";
        } else if (err.code === "auth/invalid-action-code") {
            errorMessage.textContent = "This link is invalid or has already been used.";
        } else if (err.code === "auth/weak-password") {
            showToast("Password is too weak — use at least 6 characters.", "error");
            return;
        } else {
            errorMessage.textContent = "Something went wrong. Please try again later.";
        }

        resetPanel.classList.add("hidden");
        errorPanel.classList.remove("hidden");
    }
});

// ── Password toggle ───────────────────────────────────────
document.querySelectorAll(".pwd-toggle").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => {
        const input  = document.getElementById(btn.dataset.target);
        const isText = input.type === "text";
        input.type   = isText ? "password" : "text";
        btn.querySelector("i").className = isText ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
    });
});