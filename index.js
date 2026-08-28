import { database } from "./firebase-config.js";
import { collection, query, where, getCountFromServer } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// NOTE: "items sold" assumes listings have a `sold: true` field once
// marked sold. If that field doesn't exist yet in your schema, this will
// just always read 0 until a "mark as sold" flow sets it somewhere.
async function loadStats() {
    try {
        const [usersSnap, listingsSnap, soldSnap] = await Promise.all([
            getCountFromServer(collection(database, "users")),
            getCountFromServer(collection(database, "listings")),
            getCountFromServer(query(collection(database, "listings"), where("sold", "==", true)))
        ]);

        const studentsEl = document.getElementById("stat-students");
        const listingsEl = document.getElementById("stat-listings");
        const transactionsEl = document.getElementById("stat-transactions");

        if (studentsEl) studentsEl.textContent = formatStat(usersSnap.data().count);
        if (listingsEl) listingsEl.textContent = formatStat(listingsSnap.data().count);
        if (transactionsEl) transactionsEl.textContent = formatStat(soldSnap.data().count);
    } catch (e) {
        console.error("Stats unavailable:", e);
    }
}

function formatStat(n) {
    if (!n) return "0";
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