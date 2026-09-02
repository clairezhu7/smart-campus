import { database, authentication } from "./firebase-config.js";
import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, setDoc, increment
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ──────────────────────────────────────────────────
const form = document.getElementById("sell-form");
const titleInput = document.getElementById("title-input");
const descInput = document.getElementById("description-input");
const priceInput = document.getElementById("price-input");
const priceField = document.getElementById("price-field");
const rentField = document.getElementById("rent-field");
const rentDurationSel = document.getElementById("rent-duration");
const conditionField = document.getElementById("condition-field");
const conditionInput = document.getElementById("condition-input");
const materialInput = document.getElementById("material-input");
const courseRelatedToggle = document.getElementById("course-related-toggle");
const courseFieldsWrap = document.getElementById("course-fields");
const courseInput = document.getElementById("course-input");
const teacherInput = document.getElementById("teacher-input");
const categoryGroup = document.getElementById("category-group");
const imageDrop = document.getElementById("image-drop");
const imageInput = document.getElementById("image-input");
const previews = document.getElementById("image-previews");
const submitBtn = document.getElementById("submit-btn");
const formError = document.getElementById("form-error");
const backBtn = document.getElementById("back-link")

// ── State ────────────────────────────────────────────────
let ME = null;
let selectedCategory = null;
let pendingImages = []; // { dataUrl, sizeKB }

const params = new URLSearchParams(window.location.search);
const editingId = params.get("edit");
const isEditMode = !!editingId;

const MAX_IMAGES = 3;
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.75;

// ── Page title / submit text by mode ─────────────────────
const pageTitle = document.getElementById("page-title");
const backLink = document.getElementById("back-link");
if (isEditMode) {
    pageTitle.textContent = "Edit Listing";
    submitBtn.textContent = "Save Changes";
    backLink.href = `listing.html?id=${editingId}`;
    document.title = "Edit Listing";
}

// ── Auth gate ────────────────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (!user) {
        window.location.href = "login.html#login";
        return;
    }
    const userDoc = await getDoc(doc(database, "users", user.uid));
    const data = userDoc.data() ?? {};
    ME = {
        uid: user.uid,
        name: data.name ?? user.email,
        email: user.email,
        school: data.school ?? ""
    };

    if (isEditMode) await loadExistingListing();
});

async function loadExistingListing() {
    try {
        const snap = await getDoc(doc(database, "listings", editingId));
        if (!snap.exists()) {
            setError("This listing no longer exists.");
            submitBtn.disabled = true;
            return;
        }
        const data = snap.data();
        if (data.sellerId !== ME.uid) {
            setError("You can only edit your own listings.");
            submitBtn.disabled = true;
            return;
        }
        prefillForm(data);
    } catch (err) {
        console.error("Load for edit failed:", err);
        setError("Couldn't load listing for editing.");
        submitBtn.disabled = true;
    }
}

function prefillForm(data) {
    titleInput.value = data.title ?? "";
    descInput.value = data.description ?? "";
    if (data.materialType) materialInput.value = data.materialType;

    const hasCourseInfo = !!(data.courseCode || data.teacher);
    courseRelatedToggle.checked = hasCourseInfo;
    courseFieldsWrap.classList.toggle("hidden", !hasCourseInfo);
    courseInput.value = data.courseCode ?? "";
    teacherInput.value = data.teacher ?? "";

    // Trigger category selection (handles field visibility)
    if (data.category) {
        const catBtn = categoryGroup.querySelector(`.cat-btn[data-category="${data.category}"]`);
        if (catBtn) catBtn.click();
    }

    if (typeof data.price === "number") priceInput.value = data.price;
    if (data.rentDuration) rentDurationSel.value = data.rentDuration;
    if (data.condition) conditionInput.value = data.condition;

    // Existing images become "pending" so they show in previews + can be removed
    pendingImages = (data.images ?? []).map(dataUrl => ({
        dataUrl,
        sizeKB: Math.round((dataUrl.length * 3) / 4 / 1024)
    }));
    renderPreviews();
}

// ── Course-related toggle ────────────────────────────────
courseRelatedToggle.addEventListener("change", () => {
    const on = courseRelatedToggle.checked;
    courseFieldsWrap.classList.toggle("hidden", !on);
    if (!on) {
        courseInput.value = "";
        teacherInput.value = "";
    }
});

// ── Category selection ───────────────────────────────────
categoryGroup.addEventListener("click", e => {
    const btn = e.target.closest(".cat-btn");
    if (!btn) return;

    categoryGroup.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedCategory = btn.dataset.category;

    // Toggle conditional fields
    const isRent = selectedCategory === "rent";
    const isExchange = selectedCategory === "exchange";
    const isUsed = selectedCategory === "used";

    rentField.classList.toggle("hidden", !isRent);
    priceField.classList.toggle("hidden", isExchange);
    conditionField.classList.toggle("hidden", !isUsed);

    priceInput.required = !isExchange;
});

// ── Image picking ────────────────────────────────────────
imageDrop.addEventListener("click", () => imageInput.click());

imageDrop.addEventListener("dragover", e => {
    e.preventDefault();
    imageDrop.classList.add("dragover");
});

imageDrop.addEventListener("dragleave", () => imageDrop.classList.remove("dragover"));

imageDrop.addEventListener("drop", async e => {
    e.preventDefault();
    imageDrop.classList.remove("dragover");
    await handleFiles(e.dataTransfer.files);
});

imageInput.addEventListener("change", async () => {
    await handleFiles(imageInput.files);
    imageInput.value = "";
});

async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) {
        setError(`Max ${MAX_IMAGES} images.`);
        return;
    }

    for (const file of files.slice(0, room)) {
        try {
            const dataUrl = await compressImage(file);
            const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
            pendingImages.push({ dataUrl, sizeKB });
        } catch (err) {
            console.error("Image compress failed:", err);
            setError("Couldn't process one of the images.");
        }
    }
    renderPreviews();
}

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
                width = Math.round(width * scale);
                height = Math.round(height * scale);

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                // Stepwise quality reduction if too big (Firestore 1MB doc limit)
                let quality = JPEG_QUALITY;
                let dataUrl = canvas.toDataURL("image/jpeg", quality);
                while (dataUrl.length > 320 * 1024 && quality > 0.35) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL("image/jpeg", quality);
                }
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderPreviews() {
    previews.innerHTML = pendingImages.map((p, i) => `
        <div class="preview-tile">
            <img src="${p.dataUrl}" alt="preview">
            <button type="button" class="preview-remove" data-i="${i}" title="Remove">✕</button>
        </div>
    `).join("");
}

previews.addEventListener("click", e => {
    const btn = e.target.closest(".preview-remove");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    pendingImages.splice(i, 1);
    renderPreviews();
});

// ── Submit ───────────────────────────────────────────────
form.addEventListener("submit", async e => {
    e.preventDefault();
    setError("");

    if (!ME) {
        setError("Please wait — still signing in.");
        return;
    }
    if (!selectedCategory) {
        setError("Please pick a category.");
        return;
    }

    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const isExchange = selectedCategory === "exchange";
    const priceRaw = priceInput.value.trim();
    const price = isExchange ? 0 : parseFloat(priceRaw);

    if (!title || !description) {
        setError("Title and description are required.");
        return;
    }
    if (!isExchange && (!Number.isFinite(price) || price < 0)) {
        setError("Please enter a valid price.");
        return;
    }

    const courseRelated = courseRelatedToggle.checked;
    const baseFields = {
        title,
        description,
        category: selectedCategory,
        price,
        images: pendingImages.map(p => p.dataUrl),
        courseCode: courseRelated ? (courseInput.value.trim() || null) : null,
        teacher: courseRelated ? (teacherInput.value.trim() || null) : null,
        materialType: materialInput.value || null,
        condition: selectedCategory === "used" ? (conditionInput.value || null) : null,
        rentDuration: selectedCategory === "rent" ? rentDurationSel.value : null
    };

    submitBtn.disabled = true;

    if (isEditMode) {
        submitBtn.textContent = "Saving...";
        try {
            await updateDoc(doc(database, "listings", editingId), baseFields);
            window.location.href = `listing.html?id=${editingId}`;
        } catch (err) {
            console.error("Update failed:", err);
            setError(err.message || "Failed to save changes. Try again.");
            submitBtn.disabled = false;
            submitBtn.textContent = "Save Changes";
        }
        return;
    }

    submitBtn.textContent = "Publishing...";
    try {
        await addDoc(collection(database, "listings"), {
            ...baseFields,
            sellerId: ME.uid,
            sellerName: ME.name,
            sellerEmail: ME.email,
            sellerSchool: ME.school,
            views: 0,
            sold: false,
            postedAt: serverTimestamp()
        });
        setDoc(doc(database, "stats", "public"), { listings: increment(1) }, { merge: true })
            .catch(err => console.warn("Couldn't update public stats:", err));
        window.location.href = "home.html";
    } catch (err) {
        console.error("Publish failed:", err);
        setError(err.message || "Failed to publish. Try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Publish Listing";
    }
});

function setError(msg) {
    formError.textContent = msg;
}


backBtn.addEventListener("click", () => {
    event.preventDefault();
    if (document.referrer !== "" && window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = "home.html";
    }
})