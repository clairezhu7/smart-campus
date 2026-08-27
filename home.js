import { database, authentication } from "./firebase-config.js";
import {
    onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    collection, query, where, orderBy, onSnapshot,
    addDoc, serverTimestamp, doc, getDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ──────────────────────────────────────────────────
const grid = document.getElementById("grid");
const searchInput = document.getElementById("search-input");
const categoryRow = document.getElementById("category-row");
const sellBtn = document.getElementById("sell-btn");
// const logoutBtn = document.getElementById("logout-btn");

const filtersBtn = document.getElementById("filters-btn");
const filterCount = document.getElementById("filter-count");
const activeFiltersEl = document.getElementById("active-filters");
const suggestionsEl = document.getElementById("search-suggestions");

const drawer = document.getElementById("filter-drawer");
const drawerOverlay = drawer.querySelector(".drawer-overlay");
const drawerClose = document.getElementById("drawer-close");
const drawerApply = document.getElementById("drawer-apply");
const drawerReset = document.getElementById("drawer-reset");

const sortSelect = document.getElementById("sort-select");
const minPriceInput = document.getElementById("min-price");
const maxPriceInput = document.getElementById("max-price");
const courseFilterInput = document.getElementById("course-filter");
const teacherFilterInput = document.getElementById("teacher-filter");
const conditionsGroup = drawer.querySelector('[data-group="conditions"]');
const rentGroup = drawer.querySelector('[data-group="rentDurations"]');
const materialGroup = drawer.querySelector('[data-group="materialTypes"]');

// ── State ────────────────────────────────────────────────
let ME = null;
let allListings = [];
let activeCategory = "all";
let searchTerm = "";

const filters = {
    sort: "newest",
    minPrice: null,
    maxPrice: null,
    courseCode: "",
    teacher: "",
    conditions: new Set(),
    rentDurations: new Set(),
    materialTypes: new Set()
};

const CATEGORY_LABEL = {
    new: "New",
    used: "Used",
    rent: "Rent",
    exchange: "Exchange"
};

// ── Auth gate ────────────────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (!user) {
        // Enclose the target view in the fallback parameter
        window.location.replace("login.html?fallback=index.html#login");
    }

    const userDoc = await getDoc(doc(database, "users", user.uid));
    const data = userDoc.data() ?? {};
    ME = {
        uid: user.uid,
        name: data.name ?? user.email,
        email: user.email,
        school: data.school ?? ""
    };

    if (!ME.school) {
        grid.innerHTML = `
            <div id="empty-state">
                <div class="emoji">🏫</div>
                <div class="msg">We don't have a school on file for your account...</div>
                <div class="sub">Add your school to your profile to access the marketplace!</div>
            </div>
        `;
        return;
    }

    loadListings();
});

// ── Listings live query ──────────────────────────────────
function loadListings() {
    const q = query(
        collection(database, "listings"),
        where("sellerSchool", "==", ME.school),
        orderBy("postedAt", "desc")
    );

    onSnapshot(q, snapshot => {
        allListings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        render();
    }, err => {
        console.error("Listings query failed:", err);
        grid.innerHTML = `<div id="loading">Failed to load listings.</div>`;
    });
}

// ── Render ───────────────────────────────────────────────
function render() {
    const items = getSortedListings().filter(matchesFilters);
    renderActiveFilters();
    updateFilterCount();

    if (items.length === 0) {
        grid.innerHTML = renderEmptyState();
        document.getElementById("seed-btn")?.addEventListener("click", seedSampleListings);
        return;
    }

    grid.innerHTML = items.map(renderCard).join("");
}

function getSortedListings() {
    const arr = allListings.slice();
    switch (filters.sort) {
        case "oldest":
            arr.sort((a, b) => tsMs(a.postedAt) - tsMs(b.postedAt));
            break;
        case "price_asc":
            arr.sort((a, b) => priceValue(a) - priceValue(b));
            break;
        case "price_desc":
            arr.sort((a, b) => priceValue(b) - priceValue(a));
            break;
        case "views_desc":
            arr.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
            break;
        // "newest" — already sorted by Firestore query
    }
    return arr;
}

function tsMs(ts) {
    return ts?.toMillis ? ts.toMillis() : 0;
}

function priceValue(item) {
    if (item.category === "exchange") return Infinity;
    return typeof item.price === "number" ? item.price : Infinity;
}

function matchesFilters(item) {
    if (activeCategory !== "all" && item.category !== activeCategory) return false;

    if (searchTerm) {
        const haystack = [
            item.title, item.description, item.courseCode, item.sellerName
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
    }

    // Price range — exchange items have no price, so any price filter excludes them
    if (filters.minPrice != null || filters.maxPrice != null) {
        if (item.category === "exchange") return false;
        const p = typeof item.price === "number" ? item.price : null;
        if (p == null) return false;
        if (filters.minPrice != null && p < filters.minPrice) return false;
        if (filters.maxPrice != null && p > filters.maxPrice) return false;
    }

    if (filters.courseCode) {
        const target = (item.courseCode ?? "").toLowerCase();
        if (!target.includes(filters.courseCode)) return false;
    }

    if (filters.teacher) {
        const target = (item.teacher ?? "").toLowerCase();
        if (!target.includes(filters.teacher)) return false;
    }

    if (filters.materialTypes.size > 0) {
        if (!item.materialType || !filters.materialTypes.has(item.materialType)) return false;
    }

    if (filters.conditions.size > 0) {
        if (!item.condition || !filters.conditions.has(item.condition)) return false;
    }

    if (filters.rentDurations.size > 0) {
        if (!item.rentDuration || !filters.rentDurations.has(item.rentDuration)) return false;
    }

    return true;
}

function renderCard(item) {
    const img = item.images?.[0]
        ? `<img src="${escapeAttr(item.images[0])}" alt="" loading="lazy"
                onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-image-placeholder',innerHTML:'<i class=\\'fa-regular fa-image\\'></i>'}))">`
        : `<div class="card-image-placeholder"><i class="fa-regular fa-image"></i></div>`;

    const price = formatPrice(item);
    const badge = item.category
        ? `<span class="cat-badge cat-${item.category}">${CATEGORY_LABEL[item.category] ?? item.category}</span>`
        : "";

    const deleteBtn = item.sellerId === ME?.uid
        ? `<button class="card-delete" data-action="delete" data-id="${item.id}" title="Delete listing"><i class="fa-regular fa-trash-can"></i></button>`
        : "";

    return `
        <article class="card" data-id="${item.id}">
            <div class="card-image-wrap">
                ${img}
                ${badge}
                ${deleteBtn}
            </div>
            <div class="card-body">
                <div class="card-title">${escapeHtml(item.title ?? "Untitled")}</div>
                <div class="card-price">${price}</div>
                <div class="card-meta">
                    <span class="card-seller">${escapeHtml(item.sellerName ?? "Unknown")}</span>
                    <span>${timeAgo(item.postedAt)}</span>
                </div>
            </div>
        </article>
    `;
}

function renderEmptyState() {
    const filtering = activeCategory !== "all" || searchTerm || activeFilterCount() > 0;
    if (filtering) {
        return `
            <div id="empty-state">
                <div class="emoji">🔍</div>
                <div class="msg">No listings match your filters</div>
                <div class="sub">Try a different category or clear some filters.</div>
            </div>
        `;
    }
    return `
        <div id="empty-state">
            <div class="emoji">📦</div>
            <div class="msg">No listings yet</div>
            <div class="sub">Be the first to post something — or load sample data to preview the layout.</div>
            <button id="seed-btn">Load sample listings</button>
        </div>
    `;
}

// ── Active filters chip row ──────────────────────────────
function activeFilterCount() {
    let n = 0;
    if (filters.minPrice != null || filters.maxPrice != null) n++;
    if (filters.courseCode) n++;
    if (filters.teacher) n++;
    n += filters.materialTypes.size;
    n += filters.conditions.size;
    n += filters.rentDurations.size;
    if (filters.sort !== "newest") n++;
    return n;
}

function updateFilterCount() {
    const n = activeFilterCount();
    if (n === 0) {
        filterCount.classList.add("hidden");
    } else {
        filterCount.classList.remove("hidden");
        filterCount.textContent = n;
    }
}

function renderActiveFilters() {
    const chips = [];

    if (filters.sort !== "newest") {
        chips.push({ label: `Sort: ${SORT_LABEL[filters.sort]}`, key: "sort" });
    }

    if (filters.minPrice != null || filters.maxPrice != null) {
        const lo = filters.minPrice != null ? `$${filters.minPrice}` : "$0";
        const hi = filters.maxPrice != null ? `$${filters.maxPrice}` : "∞";
        chips.push({ label: `${lo} – ${hi}`, key: "price" });
    }

    if (filters.courseCode) {
        chips.push({ label: `Course: ${filters.courseCode.toUpperCase()}`, key: "courseCode" });
    }

    if (filters.teacher) {
        chips.push({ label: `Teacher: ${filters.teacher}`, key: "teacher" });
    }

    for (const m of filters.materialTypes) {
        chips.push({ label: m, key: "material", value: m });
    }

    for (const c of filters.conditions) {
        chips.push({ label: c, key: "condition", value: c });
    }

    for (const d of filters.rentDurations) {
        chips.push({ label: `/ ${d}`, key: "rentDuration", value: d });
    }

    activeFiltersEl.innerHTML = chips.map(c => `
        <span class="active-filter" data-key="${c.key}" ${c.value ? `data-value="${escapeAttr(c.value)}"` : ""}>
            ${escapeHtml(c.label)}
            <span class="remove" title="Remove">✕</span>
        </span>
    `).join("");

    if (chips.length > 1) {
        activeFiltersEl.insertAdjacentHTML("beforeend",
            `<button class="active-filter clear-all" id="clear-all-filters">Clear all</button>`);
    }
}

const SORT_LABEL = {
    newest: "Newest",
    oldest: "Oldest",
    price_asc: "Price ↑",
    price_desc: "Price ↓",
    views_desc: "Most viewed"
};

// ── Formatting helpers ───────────────────────────────────
function formatPrice(item) {
    if (item.category === "exchange") return `<span>Exchange</span>`;
    const price = typeof item.price === "number" ? `$${item.price.toFixed(2)}` : "—";
    if (item.category === "rent") {
        const unit = item.rentDuration ?? "week";
        return `${price}<span class="unit"> / ${unit}</span>`;
    }
    return price;
}

function timeAgo(ts) {
    if (!ts?.toDate) return "";
    const date = ts.toDate();
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

function escapeAttr(s) {
    return escapeHtml(s);
}

// ── Interaction ──────────────────────────────────────────
categoryRow.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    categoryRow.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeCategory = chip.dataset.category;
    render();
});

searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    updateSuggestions();
    render();
});

searchInput.addEventListener("focus", updateSuggestions);

searchInput.addEventListener("blur", () => {
    // Delay so click on a suggestion can register first
    setTimeout(hideSuggestions, 150);
});

searchInput.addEventListener("keydown", e => {
    if (suggestionsEl.classList.contains("hidden")) return;
    const items = [...suggestionsEl.querySelectorAll(".suggestion")];
    if (items.length === 0) return;
    const activeIdx = items.findIndex(el => el.classList.contains("active"));

    if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestion(items, (activeIdx + 1) % items.length);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestion(items, (activeIdx - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
        const pick = items[activeIdx >= 0 ? activeIdx : 0];
        if (pick) {
            e.preventDefault();
            pickSuggestion(pick.dataset.value);
        }
    } else if (e.key === "Escape") {
        hideSuggestions();
    }
});

function setActiveSuggestion(items, idx) {
    items.forEach(el => el.classList.remove("active"));
    items[idx].classList.add("active");
    items[idx].scrollIntoView({ block: "nearest" });
}

suggestionsEl.addEventListener("mousedown", e => {
    // mousedown beats blur so the click still registers
    const item = e.target.closest(".suggestion");
    if (!item) return;
    e.preventDefault();
    pickSuggestion(item.dataset.value);
});

function pickSuggestion(value) {
    searchInput.value = value;
    searchTerm = value.toLowerCase();
    hideSuggestions();
    render();
}

function hideSuggestions() {
    suggestionsEl.classList.add("hidden");
    suggestionsEl.innerHTML = "";
}

function updateSuggestions() {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
        hideSuggestions();
        return;
    }

    // Build dedupe-aware suggestion list from titles and course codes
    const seen = new Set();
    const titleHits = [];
    const courseHits = [];

    for (const item of allListings) {
        const title = item.title;
        if (title) {
            const key = title.toLowerCase();
            if (key.includes(term) && !seen.has(key)) {
                seen.add(key);
                titleHits.push({ value: title, kind: "title", prefix: key.startsWith(term) });
            }
        }
        const cc = item.courseCode;
        if (cc) {
            const key = "cc:" + cc.toLowerCase();
            if (cc.toLowerCase().includes(term) && !seen.has(key)) {
                seen.add(key);
                courseHits.push({ value: cc, kind: "course", prefix: cc.toLowerCase().startsWith(term) });
            }
        }
    }

    // Rank: prefix matches first
    titleHits.sort((a, b) => Number(b.prefix) - Number(a.prefix));
    courseHits.sort((a, b) => Number(b.prefix) - Number(a.prefix));

    const combined = [...titleHits.slice(0, 6), ...courseHits.slice(0, 3)];
    if (combined.length === 0) {
        hideSuggestions();
        return;
    }

    suggestionsEl.innerHTML = combined.map(s => {
        const icon = s.kind === "course"
            ? `<i class="icon fa-solid fa-hashtag"></i>`
            : `<i class="icon fa-solid fa-magnifying-glass"></i>`;
        const tag = s.kind === "course" ? `<span class="tag">course</span>` : "";
        return `
            <div class="suggestion" data-value="${escapeAttr(s.value)}">
                ${icon}
                <span class="label">${highlightMatch(s.value, term)}</span>
                ${tag}
            </div>
        `;
    }).join("");
    suggestionsEl.classList.remove("hidden");
}

function highlightMatch(text, term) {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(term);
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx))
        + `<span class="match">${escapeHtml(text.slice(idx, idx + term.length))}</span>`
        + escapeHtml(text.slice(idx + term.length));
}

grid.addEventListener("click", async e => {
    const deleteEl = e.target.closest('[data-action="delete"]');
    if (deleteEl) {
        e.stopPropagation();
        const id = deleteEl.dataset.id;
        const item = allListings.find(l => l.id === id);
        const label = item?.title ? `"${item.title}"` : "this listing";
        if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

        deleteEl.disabled = true;
        try {
            await deleteDoc(doc(database, "listings", id));
        } catch (err) {
            console.error("Delete failed:", err);
            alert("Couldn't delete the listing. " + (err.message ?? ""));
            deleteEl.disabled = false;
        }
        return;
    }

    const card = e.target.closest(".card");
    if (!card) return;
    window.location.href = `listing.html?id=${card.dataset.id}`;
});

// logoutBtn.addEventListener("click", async () => {
//     await signOut(authentication);
//     window.location.href = "index.html";
// });

// ── Filter drawer ────────────────────────────────────────
filtersBtn.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", closeDrawer);

function openDrawer() {
    syncControlsFromState();
    drawer.classList.add("open");
}

function closeDrawer() {
    drawer.classList.remove("open");
}

function syncControlsFromState() {
    sortSelect.value = filters.sort;
    minPriceInput.value = filters.minPrice ?? "";
    maxPriceInput.value = filters.maxPrice ?? "";
    courseFilterInput.value = filters.courseCode;
    teacherFilterInput.value = filters.teacher;

    conditionsGroup.querySelectorAll(".filter-chip").forEach(c => {
        c.classList.toggle("selected", filters.conditions.has(c.dataset.value));
    });
    rentGroup.querySelectorAll(".filter-chip").forEach(c => {
        c.classList.toggle("selected", filters.rentDurations.has(c.dataset.value));
    });
    materialGroup.querySelectorAll(".filter-chip").forEach(c => {
        c.classList.toggle("selected", filters.materialTypes.has(c.dataset.value));
    });
}

[conditionsGroup, rentGroup, materialGroup].forEach(group => {
    group.addEventListener("click", e => {
        const chip = e.target.closest(".filter-chip");
        if (!chip) return;
        chip.classList.toggle("selected");
    });
});

drawerApply.addEventListener("click", () => {
    filters.sort = sortSelect.value;

    const minV = parseFloat(minPriceInput.value);
    filters.minPrice = Number.isFinite(minV) ? minV : null;
    const maxV = parseFloat(maxPriceInput.value);
    filters.maxPrice = Number.isFinite(maxV) ? maxV : null;

    filters.courseCode = courseFilterInput.value.trim().toLowerCase();
    filters.teacher = teacherFilterInput.value.trim().toLowerCase();

    filters.conditions = new Set(
        [...conditionsGroup.querySelectorAll(".filter-chip.selected")].map(c => c.dataset.value)
    );
    filters.rentDurations = new Set(
        [...rentGroup.querySelectorAll(".filter-chip.selected")].map(c => c.dataset.value)
    );
    filters.materialTypes = new Set(
        [...materialGroup.querySelectorAll(".filter-chip.selected")].map(c => c.dataset.value)
    );

    closeDrawer();
    render();
});

drawerReset.addEventListener("click", () => {
    filters.sort = "newest";
    filters.minPrice = null;
    filters.maxPrice = null;
    filters.courseCode = "";
    filters.teacher = "";
    filters.conditions.clear();
    filters.rentDurations.clear();
    filters.materialTypes.clear();
    syncControlsFromState();
    render();
});

activeFiltersEl.addEventListener("click", e => {
    if (e.target.id === "clear-all-filters" || e.target.closest("#clear-all-filters")) {
        drawerReset.click();
        return;
    }

    const remove = e.target.closest(".remove");
    if (!remove) return;
    const pill = remove.closest(".active-filter");
    const key = pill.dataset.key;
    const value = pill.dataset.value;

    switch (key) {
        case "sort": filters.sort = "newest"; break;
        case "price": filters.minPrice = null; filters.maxPrice = null; break;
        case "courseCode": filters.courseCode = ""; break;
        case "teacher": filters.teacher = ""; break;
        case "material": filters.materialTypes.delete(value); break;
        case "condition": filters.conditions.delete(value); break;
        case "rentDuration": filters.rentDurations.delete(value); break;
    }
    render();
});

// ── Sample data seeding (dev only) ───────────────────────
async function seedSampleListings() {
    if (!ME) return;
    const btn = document.getElementById("seed-btn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Adding sample listings...";
    }

    const samples = [
        {
            title: "Calculus: Early Transcendentals (8th ed.)",
            description: "Used for MATH 1019. Light highlighting on a few pages.",
            price: 45,
            category: "used",
            courseCode: "MATH 1019",
            condition: "Good",
            images: ["https://picsum.photos/seed/calcbook/600/450"]
        },
        {
            title: "TI-84 Plus Graphing Calculator",
            description: "Barely used, comes with cover and USB cable.",
            price: 70,
            category: "used",
            condition: "Like New",
            images: ["https://picsum.photos/seed/ti84/600/450"]
        },
        {
            title: "Wireless Mechanical Keyboard (brand new)",
            description: "Sealed box. Hot-swappable switches, RGB.",
            price: 95,
            category: "new",
            images: ["https://picsum.photos/seed/keyboard/600/450"]
        },
        {
            title: "Dorm Mini-Fridge — Semester Rental",
            description: "Pick up on west campus. Quiet operation.",
            price: 25,
            category: "rent",
            rentDuration: "month",
            images: ["https://picsum.photos/seed/fridge/600/450"]
        },
        {
            title: "Swap: my Intro Psych textbook for Sociology 101",
            description: "Both 3rd edition, I'll meet anywhere on campus.",
            price: 0,
            category: "exchange",
            courseCode: "PSYC 1010",
            images: ["https://picsum.photos/seed/psychbook/600/450"]
        }
    ];

    try {
        for (const s of samples) {
            await addDoc(collection(database, "listings"), {
                ...s,
                sellerId: ME.uid,
                sellerName: ME.name,
                sellerEmail: ME.email,
                sellerSchool: ME.school,
                views: 0,
                postedAt: serverTimestamp()
            });
        }
    } catch (err) {
        console.error("Seed failed:", err);
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Retry";
        }
    }
}