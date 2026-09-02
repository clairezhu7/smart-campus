import { database } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";


async function loadStats() {
    try {
        const snap = await getDoc(doc(database, "stats", "public"));
        const data = snap.exists() ? snap.data() : {};

        const studentsEl = document.getElementById("stat-students");
        const listingsEl = document.getElementById("stat-listings");
        const transactionsEl = document.getElementById("stat-transactions");

        if (studentsEl) studentsEl.textContent = formatStat(data.students);
        if (listingsEl) listingsEl.textContent = formatStat(data.listings);
        if (transactionsEl) transactionsEl.textContent = formatStat(data.sold);
    } catch (e) {
        console.error("Stats unavailable:", e);
    }
}

function formatStat(n) {
    n = n || 0;
    return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

// ── Duplicate cards for seamless infinite auto-scroll ─────────
function initCarousel() {
    const track = document.getElementById("carousel");
    if (!track) return;
    Array.from(track.children).forEach(card => {
        track.appendChild(card.cloneNode(true));
    });
}

loadStats();
initCarousel();