import { nodes, ERAS, NODE_ERA_MAP } from "./state.js";

const input   = document.getElementById("node-search-input");
const results = document.getElementById("node-search-results");

let activeIndex = -1;
let currentItems = [];

// ─── Fuzzy / substring match ──────────────────────────────────────────────────
function score(node, query) {
    const q = query.toLowerCase();
    const name = node.name.toLowerCase();
    if (name === q) return 100;
    if (name.startsWith(q)) return 80;
    if (name.includes(q)) return 60;
    // word-start match
    if (name.split(/\s+/).some(w => w.startsWith(q))) return 50;
    return 0;
}

function highlight(text, query) {
    if (!query) return text;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
    return text.replace(re, "<mark>$1</mark>");
}

// ─── Render dropdown ──────────────────────────────────────────────────────────
function render(query) {
    activeIndex = -1;

    if (!query.trim()) {
        hide();
        return;
    }

    const matches = nodes
        .map(n => ({ node: n, s: score(n, query.trim()) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s || a.node.name.localeCompare(b.node.name))
        .slice(0, 10)
        .map(x => x.node);

    currentItems = matches;

    if (!matches.length) {
        results.innerHTML = `<div class="search-no-results">No events found</div>`;
        results.classList.add("visible");
        return;
    }

    results.innerHTML = matches.map((node, i) => {
        const eraId  = NODE_ERA_MAP[node.id];
        const era    = ERAS.find(e => e.id === eraId);
        const color  = era ? era.color : "rgba(255,255,255,0.4)";
        const eraDot = `<span class="search-result-era-dot" style="background:${color};box-shadow:0 0 4px ${color}"></span>`;
        const label  = era ? era.shortLabel : "—";

        return `
            <div class="search-result-item" data-index="${i}" data-node-id="${node.id}">
                <div class="search-result-name">${highlight(node.name, query.trim())}</div>
                <div class="search-result-meta">${eraDot}${label} &nbsp;·&nbsp; ${node.year ?? "—"} CE</div>
            </div>
        `;
    }).join("");

    results.classList.add("visible");
}

function hide() {
    results.classList.remove("visible");
    results.innerHTML = "";
    activeIndex = -1;
    currentItems = [];
}

function selectResult(nodeId) {
    hide();
    input.value = "";
    input.blur();
    if (window.focusNode) {
        window.focusNode(nodeId);
    }
}

// ─── Events ───────────────────────────────────────────────────────────────────
input.addEventListener("input", () => render(input.value));

input.addEventListener("focus", () => {
    if (input.value.trim()) render(input.value);
});

input.addEventListener("keydown", (e) => {
    const items = results.querySelectorAll(".search-result-item");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
        items[activeIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
        items[activeIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
        e.preventDefault();
        const idx = activeIndex >= 0 ? activeIndex : 0;
        if (currentItems[idx]) selectResult(currentItems[idx].id);
    } else if (e.key === "Escape") {
        hide();
        input.blur();
    }
});

results.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".search-result-item");
    if (item) {
        e.preventDefault(); // prevent input blur before click fires
        selectResult(item.dataset.nodeId);
    }
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
    if (!e.target.closest("#node-search-container")) hide();
});