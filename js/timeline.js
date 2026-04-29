import { nodes, ERAS, NODE_ERA_MAP, selectNode, onTimelineChange } from "./state.js";
import { setTimelinePresentYear, timelinePresentYear } from "./state.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_YEAR = 560;
const MAX_YEAR = 1600;
const TOTAL_SPAN = MAX_YEAR - MIN_YEAR;

// Zoom levels: how many years fit in the visible window
const ZOOM_SPANS = [1040, 600, 300, 150, 75];
let zoomIndex = 0;

// viewOffset: the year at the LEFT edge of the visible window
let viewOffset = MIN_YEAR;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const container = document.getElementById("timeline");
container.id = "timeline-container";
container.innerHTML = `
    <button id="timeline-tab">
        <span class="tab-arrow">▲</span>
        <span>TIMELINE</span>
    </button>
    <div id="timeline-panel">
        <div class="timeline-controls">
            <div class="timeline-present-display">
                Present: <span class="present-year-val" id="present-year-val">${timelinePresentYear}</span> CE
            </div>
            <div class="timeline-zoom-group">
                <span class="timeline-zoom-label">ZOOM</span>
                <button class="timeline-zoom-btn" id="tl-zoom-out" title="Zoom Out">−</button>
                <span class="timeline-zoom-level" id="tl-zoom-level">1×</span>
                <button class="timeline-zoom-btn" id="tl-zoom-in" title="Zoom In">+</button>
            </div>
            <div class="timeline-hidden-count" id="tl-hidden-count"></div>
        </div>
        <div class="timeline-track-wrapper" id="tl-track-wrapper">
            <div class="timeline-era-bands" id="tl-era-bands"></div>
            <div class="timeline-markers" id="tl-markers"></div>
            <div id="tl-node-dots"></div>
            <div class="timeline-future-overlay" id="tl-future-overlay"></div>
            <div class="timeline-cursor" id="tl-cursor">
                <div class="timeline-cursor-head"></div>
            </div>
            <div class="timeline-scrubber" id="tl-scrubber"></div>
        </div>
    </div>
`;

const tab = document.getElementById("timeline-tab");
const panel = document.getElementById("timeline-panel");
const trackWrapper = document.getElementById("tl-track-wrapper");
const eraBandsEl = document.getElementById("tl-era-bands");
const markersEl = document.getElementById("tl-markers");
const nodeDotsEl = document.getElementById("tl-node-dots");
const futureOverlay = document.getElementById("tl-future-overlay");
const cursorEl = document.getElementById("tl-cursor");
const scrubberEl = document.getElementById("tl-scrubber");
const presentYearVal = document.getElementById("present-year-val");
const hiddenCount = document.getElementById("tl-hidden-count");
const zoomInBtn = document.getElementById("tl-zoom-in");
const zoomOutBtn = document.getElementById("tl-zoom-out");
const zoomLevelEl = document.getElementById("tl-zoom-level");

// ─── Open/Close ───────────────────────────────────────────────────────────────
let isOpen = false;
tab.addEventListener("click", () => {
    isOpen = !isOpen;
    container.classList.toggle("open", isOpen);
    if (isOpen) render();
});

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function getVisibleSpan() { return ZOOM_SPANS[zoomIndex]; }

function yearToPercent(year) {
    return (year - viewOffset) / getVisibleSpan() * 100;
}

function percentToYear(pct) {
    return viewOffset + pct / 100 * getVisibleSpan();
}

function clampViewOffset(offset) {
    const span = getVisibleSpan();
    return Math.max(MIN_YEAR, Math.min(MAX_YEAR - span, offset));
}

// ─── Render ───────────────────────────────────────────────────────────────────
function getTickInterval() {
    const span = getVisibleSpan();
    if (span >= 800) return { minor: 50, major: 100 };
    if (span >= 400) return { minor: 25, major: 50 };
    if (span >= 200) return { minor: 10, major: 25 };
    if (span >= 100) return { minor: 5,  major: 25 };
    return { minor: 5, major: 10 };
}

function render() {
    const span = getVisibleSpan();
    const startYear = viewOffset;
    const endYear = viewOffset + span;

    // ── Era bands ──
    eraBandsEl.innerHTML = "";
    ERAS.forEach(era => {
        const [eStart, eEnd] = era.years;
        // clamp to visible
        const left = yearToPercent(Math.max(eStart, startYear));
        const right = yearToPercent(Math.min(eEnd, endYear));
        if (right <= 0 || left >= 100) return;
        const band = document.createElement("div");
        band.className = "timeline-era-band";
        band.style.left = `${Math.max(0, left)}%`;
        band.style.width = `${Math.min(100, right) - Math.max(0, left)}%`;
        band.style.background = era.color;
        eraBandsEl.appendChild(band);
    });

    // ── Year tick marks ──
    markersEl.innerHTML = "";
    const { minor, major } = getTickInterval();

    const firstTick = Math.ceil(startYear / minor) * minor;
    for (let y = firstTick; y <= endYear; y += minor) {
        const pct = yearToPercent(y);
        if (pct < 0 || pct > 100) continue;
        const isMajor = y % major === 0;

        const tick = document.createElement("div");
        tick.className = "timeline-tick";
        tick.style.left = `${pct}%`;
        tick.style.position = "absolute";

        const line = document.createElement("div");
        line.className = `timeline-tick-line${isMajor ? " major" : ""}`;
        line.style.height = isMajor ? "100%" : "40%";
        line.style.marginTop = isMajor ? "0" : "auto";
        line.style.position = "absolute";
        line.style.bottom = "18px";
        line.style.top = isMajor ? "0" : "auto";
        tick.appendChild(line);

        if (isMajor) {
            const label = document.createElement("div");
            label.className = "timeline-tick-label";
            label.textContent = `${y} CE`;
            label.style.position = "absolute";
            label.style.bottom = "2px";
            label.style.left = "50%";
            label.style.transform = "translateX(-50%)";
            tick.appendChild(label);
        }

        markersEl.appendChild(tick);
    }

    // ── Node dots ──
    nodeDotsEl.innerHTML = "";
    nodes.forEach(node => {
        if (!node.year) return;
        const pct = yearToPercent(node.year);
        if (pct < -1 || pct > 101) return;

        const eraId = NODE_ERA_MAP[node.id];
        const era = ERAS.find(e => e.id === eraId);
        const color = era ? era.color : "rgb(255,255,255)";
        const isFuture = node.year > timelinePresentYear;

        const dot = document.createElement("div");
        dot.className = `timeline-node-dot${isFuture ? " future" : ""}`;
        dot.style.left = `${pct}%`;
        dot.style.top = "50%";
        dot.style.background = color;
        dot.style.boxShadow = isFuture ? "none" : `0 0 4px ${color}`;
        dot.title = `${node.name} (${node.year} CE)`;

        if (!isFuture) {
            dot.addEventListener("click", () => {
                selectNode(node);
            });
        }

        nodeDotsEl.appendChild(dot);
    });

    // ── Present cursor ──
    const cursorPct = yearToPercent(timelinePresentYear);
    const clampedCursorPct = Math.max(0, Math.min(100, cursorPct));
    cursorEl.style.left = `${clampedCursorPct}%`;
    cursorEl.style.display = (cursorPct >= -1 && cursorPct <= 101) ? "block" : "none";

    // ── Future overlay (everything right of cursor) ──
    if (cursorPct >= 100) {
        futureOverlay.style.display = "none";
    } else if (cursorPct <= 0) {
        futureOverlay.style.left = "0";
        futureOverlay.style.display = "block";
        futureOverlay.style.width = "100%";
    } else {
        futureOverlay.style.left = `${cursorPct}%`;
        futureOverlay.style.width = `${100 - cursorPct}%`;
        futureOverlay.style.display = "block";
    }

    // ── Hidden nodes count ──
    const futureCount = nodes.filter(n => n.year && n.year > timelinePresentYear).length;
    hiddenCount.textContent = futureCount > 0 ? `${futureCount} events hidden` : "";

    // ── Zoom level display ──
    const zoomMultipliers = ["1×", "1.7×", "3.5×", "7×", "14×"];
    zoomLevelEl.textContent = zoomMultipliers[zoomIndex];
    zoomInBtn.disabled = zoomIndex >= ZOOM_SPANS.length - 1;
    zoomOutBtn.disabled = zoomIndex <= 0;
}

// ─── Scrubbing (click/drag to set present year) ───────────────────────────────
let isDraggingPresent = false;

function yearFromEvent(e) {
    const rect = trackWrapper.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(percentToYear(pct * 100));
}

scrubberEl.addEventListener("mousedown", (e) => {
    isDraggingPresent = true;
    updatePresent(yearFromEvent(e));
    e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
    if (!isDraggingPresent) return;
    updatePresent(yearFromEvent(e));
});

window.addEventListener("mouseup", () => { isDraggingPresent = false; });

function updatePresent(year) {
    const clamped = Math.max(MIN_YEAR, Math.min(MAX_YEAR, year));
    setTimelinePresentYear(clamped);
    presentYearVal.textContent = clamped;
    render();
}

// ─── Pan by dragging the track ────────────────────────────────────────────────
let isPanning = false;
let panStartX = 0;
let panStartOffset = 0;

trackWrapper.addEventListener("mousedown", (e) => {
    if (e.target === scrubberEl) return; // scrubber takes priority
    isPanning = true;
    panStartX = e.clientX;
    panStartOffset = viewOffset;
    e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartX;
    const trackWidth = trackWrapper.getBoundingClientRect().width;
    const yearDelta = -(dx / trackWidth) * getVisibleSpan();
    viewOffset = clampViewOffset(panStartOffset + yearDelta);
    render();
});

window.addEventListener("mouseup", () => { isPanning = false; });

// Mouse wheel to pan
trackWrapper.addEventListener("wheel", (e) => {
    e.preventDefault();
    const span = getVisibleSpan();
    const delta = (e.deltaY > 0 ? 1 : -1) * span * 0.08;
    viewOffset = clampViewOffset(viewOffset + delta);
    render();
}, { passive: false });

// ─── Zoom ─────────────────────────────────────────────────────────────────────
function zoomAround(anchorYear, newZoomIndex) {
    const oldSpan = getVisibleSpan();
    zoomIndex = Math.max(0, Math.min(ZOOM_SPANS.length - 1, newZoomIndex));
    const newSpan = getVisibleSpan();

    // Keep anchor year in the same proportional position
    const anchorFrac = (anchorYear - viewOffset) / oldSpan;
    viewOffset = clampViewOffset(anchorYear - anchorFrac * newSpan);
    render();
}

zoomInBtn.addEventListener("click", () => {
    const anchor = viewOffset + getVisibleSpan() / 2;
    zoomAround(anchor, zoomIndex + 1);
});

zoomOutBtn.addEventListener("click", () => {
    const anchor = viewOffset + getVisibleSpan() / 2;
    zoomAround(anchor, zoomIndex - 1);
});

// Ctrl+wheel to zoom
trackWrapper.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = trackWrapper.getBoundingClientRect();
    const anchorPct = (e.clientX - rect.left) / rect.width;
    const anchorYear = percentToYear(anchorPct * 100);
    zoomAround(anchorYear, zoomIndex + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });

// ─── Initial render when open ─────────────────────────────────────────────────
// Center view on the present year
function centerOnPresent() {
    const span = getVisibleSpan();
    viewOffset = clampViewOffset(timelinePresentYear - span / 2);
}

// Open by default, centered on the present year
centerOnPresent();
container.classList.add("open");
isOpen = true;
render();