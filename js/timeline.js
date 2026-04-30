import { nodes, ERAS, NODE_ERA_MAP, selectNode, onTimelineChange, onEraFilterChange } from "./state.js";
import { setTimelinePresentYear, timelinePresentYear, isNodeVisible } from "./state.js";
import * as State from "./state.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_YEAR = 560;
const MAX_YEAR = 1600;

// Continuous zoom: visibleSpan = years shown in the window
const SPAN_MIN = 60;
const SPAN_MAX = 1040;
let visibleSpan = SPAN_MAX;

// viewOffset: year at left edge
let viewOffset = MIN_YEAR;

// Height of the "present scrubber" zone at the bottom of the track (px)
const SCRUB_ZONE_HEIGHT = 20;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const container = document.getElementById("timeline");
container.id = "timeline-container";
container.innerHTML = `
    <div id="timeline-panel">
        <button id="timeline-tab">
            <span class="tab-arrow">▲</span>
            <span>TIMELINE</span>
        </button>
        <div id="timeline-inner">
            <div class="timeline-controls">
                <div class="timeline-present-display">
                    Present: <span id="present-year-val">${timelinePresentYear}</span> <span id="present-era-label">CE</span>
                </div>
                <div class="timeline-hint">scroll to zoom · drag top to set present · drag bottom to pan</div>
                <div class="timeline-hidden-count" id="tl-hidden-count"></div>
                <div class="tl-era-toggle" id="tl-era-toggle" title="Switch timeline between CE and AH">
                    <span class="tl-era-option" data-mode="ce">CE</span>
                    <span class="tl-era-option" data-mode="ah">AH</span>
                    <span class="tl-era-thumb"></span>
                </div>
            </div>
            <div class="timeline-track-wrapper" id="tl-track-wrapper">
                <div class="timeline-era-bands" id="tl-era-bands"></div>
                <div class="timeline-markers" id="tl-markers"></div>
                <div id="tl-node-dots"></div>
                <div class="timeline-future-overlay" id="tl-future-overlay"></div>
                <div class="timeline-cursor" id="tl-cursor">
                    <div class="timeline-cursor-head"></div>
                </div>
                <div class="timeline-scrub-zone" id="tl-scrub-zone"></div>
            </div>
        </div>
    </div>
`;

const panel     = document.getElementById("timeline-panel");
const tab       = document.getElementById("timeline-tab");
const trackWrapper  = document.getElementById("tl-track-wrapper");
const eraBandsEl    = document.getElementById("tl-era-bands");
const markersEl     = document.getElementById("tl-markers");
const nodeDotsEl    = document.getElementById("tl-node-dots");
const futureOverlay = document.getElementById("tl-future-overlay");
const cursorEl      = document.getElementById("tl-cursor");
const scrubZone     = document.getElementById("tl-scrub-zone");
const presentYearVal  = document.getElementById("present-year-val");
const presentEraLabel = document.getElementById("present-era-label");
const hiddenCountEl   = document.getElementById("tl-hidden-count");
const eraToggleBtn    = document.getElementById("tl-era-toggle");
const eraThumb        = eraToggleBtn.querySelector(".tl-era-thumb");
const eraOptions      = eraToggleBtn.querySelectorAll(".tl-era-option");

// ─── CE / AH display mode ─────────────────────────────────────────────────────
let showAH = false;

function ceToAH(year) {
    return Math.round((year - 622) * 1.0307);
}

function formatYear(ceYear) {
    if (!showAH) {
        return ceYear >= MAX_YEAR ? `${ceYear}+` : `${ceYear}`;
    }
    const ah = ceToAH(ceYear);
    return ah >= ceToAH(MAX_YEAR) ? `${ah}+` : `${ah}`;
}

function eraLabel() {
    return showAH ? "AH" : "CE";
}

function updateToggleUI() {
    eraOptions.forEach(opt => opt.classList.toggle("active", opt.dataset.mode === (showAH ? "ah" : "ce")));
    eraThumb.style.transform = showAH ? "translateX(100%)" : "translateX(0%)";
}

updateToggleUI();

eraToggleBtn.addEventListener("click", () => {
    showAH = !showAH;
    updateToggleUI();
    presentEraLabel.textContent = eraLabel();
    presentYearVal.textContent = formatYear(timelinePresentYear);
    render();
});

// ─── Open/Close ───────────────────────────────────────────────────────────────
let isOpen = true;
container.classList.add("open");

tab.addEventListener("click", () => {
    isOpen = !isOpen;
    container.classList.toggle("open", isOpen);
    if (isOpen) render();
    // Update after transition so era-filter repositions smoothly
    setTimeout(updateTimelineHeightVar, 320);
    updateTimelineHeightVar();
});

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function yearToPercent(year) {
    return (year - viewOffset) / visibleSpan * 100;
}

function percentToYear(pct) {
    return viewOffset + pct / 100 * visibleSpan;
}

function clampViewOffset(offset) {
    return Math.max(MIN_YEAR, Math.min(MAX_YEAR - visibleSpan, offset));
}

function clientXToYear(clientX) {
    const rect = trackWrapper.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percentToYear(pct * 100);
}

// ─── Render ───────────────────────────────────────────────────────────────────
function getTickInterval() {
    if (visibleSpan >= 800) return { minor: 50,  major: 100 };
    if (visibleSpan >= 400) return { minor: 25,  major: 100 };
    if (visibleSpan >= 200) return { minor: 10,  major: 50  };
    if (visibleSpan >= 100) return { minor: 5,   major: 25  };
    return                         { minor: 5,   major: 10  };
}

function render() {
    const startYear = viewOffset;
    const endYear   = viewOffset + visibleSpan;

    // ── Era bands ──
    eraBandsEl.innerHTML = "";
    ERAS.forEach(era => {
        const [eStart, eEnd] = era.years;
        const left  = yearToPercent(Math.max(eStart, startYear));
        const right = yearToPercent(Math.min(eEnd,   endYear));
        if (right <= 0 || left >= 100) return;
        const band = document.createElement("div");
        band.className = "timeline-era-band";
        band.style.left  = `${Math.max(0, left)}%`;
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

        const line = document.createElement("div");
        line.className = `timeline-tick-line${isMajor ? " major" : ""}`;
        tick.appendChild(line);

        if (isMajor) {
            const label = document.createElement("div");
            label.className = "timeline-tick-label";
            label.textContent = `${formatYear(y)} ${eraLabel()}`;
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

        const eraId   = NODE_ERA_MAP[node.id];
        const era     = ERAS.find(e => e.id === eraId);
        const color   = era ? era.color : "rgb(255,255,255)";
        const isFuture   = node.year > timelinePresentYear;
        const eraHidden  = !isNodeVisible(node.id);
        const isHidden   = isFuture || eraHidden;

        const dot = document.createElement("div");
        dot.className = `timeline-node-dot${isHidden ? " hidden-dot" : ""}`;
        dot.style.left       = `${pct}%`;
        dot.style.background = color;
        dot.style.boxShadow  = isHidden ? "none" : `0 0 4px ${color}`;
        dot.title = `${node.name} (${formatYear(node.year)} ${eraLabel()})${isFuture ? " — future" : eraHidden ? " — era hidden" : ""}`;
        dot.dataset.nodeId = node.id;

        nodeDotsEl.appendChild(dot);
    });

    // ── Present cursor ──
    const cursorPct = yearToPercent(timelinePresentYear);
    cursorEl.style.left    = `${Math.max(0, Math.min(100, cursorPct))}%`;
    cursorEl.style.display = (cursorPct >= -1 && cursorPct <= 101) ? "block" : "none";

    // ── Future overlay ──
    if (cursorPct >= 100) {
        futureOverlay.style.display = "none";
    } else if (cursorPct <= 0) {
        futureOverlay.style.left  = "0";
        futureOverlay.style.width = "100%";
        futureOverlay.style.display = "block";
    } else {
        futureOverlay.style.left  = `${cursorPct}%`;
        futureOverlay.style.width = `${100 - cursorPct}%`;
        futureOverlay.style.display = "block";
    }

    // ── Hidden count (future + era-filtered) ──
    const hiddenNodes = nodes.filter(n => n.year && (n.year > timelinePresentYear || !isNodeVisible(n.id)));
    hiddenCountEl.textContent = hiddenNodes.length > 0 ? `${hiddenNodes.length} events hidden` : "";
}

// ─── Interaction ──────────────────────────────────────────────────────────────
let dragMode = null;   // "present" | "pan" | null
let panStartX = 0;
let panStartOffset = 0;

function isInPanZone(e) {
    const rect = trackWrapper.getBoundingClientRect();
    return (e.clientY - rect.top) >= (rect.height - SCRUB_ZONE_HEIGHT);
}

trackWrapper.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (isInPanZone(e)) {
        dragMode = "pan";
        panStartX = e.clientX;
        panStartOffset = viewOffset;
        trackWrapper.style.cursor = "grabbing";
    } else {
        // If clicking directly on a node dot, select that node on the graph
        // and do NOT update the present year
        if (e.target.classList.contains("timeline-node-dot") && !e.target.classList.contains("hidden-dot")) {
            const nodeId = e.target.dataset.nodeId;
            if (nodeId) {
                const node = nodes.find(n => n.id === nodeId);
                if (node) {
                    // Toggle: clicking an already-selected node deselects it
                    if (State.selectedNode?.id === nodeId) {
                        selectNode(null);
                    } else {
                        selectNode(node);
                    }
                }
            }
            dragMode = null;
            return;
        }
        dragMode = "present";
        updatePresent(clientXToYear(e.clientX));
    }
});

window.addEventListener("mousemove", (e) => {
    if (!dragMode) return;
    if (dragMode === "present") {
        updatePresent(clientXToYear(e.clientX));
    } else if (dragMode === "pan") {
        const dx = e.clientX - panStartX;
        const trackWidth = trackWrapper.getBoundingClientRect().width;
        const yearDelta  = -(dx / trackWidth) * visibleSpan;
        viewOffset = clampViewOffset(panStartOffset + yearDelta);
        render();
    }
});

window.addEventListener("mouseup", () => {
    dragMode = null;
    trackWrapper.style.cursor = "";
});

// Cursor hints
trackWrapper.addEventListener("mousemove", (e) => {
    if (dragMode) return;
    if (isInPanZone(e)) {
        trackWrapper.style.cursor = visibleSpan < SPAN_MAX ? "grab" : "default";
        scrubZone.classList.add("active");
    } else {
        trackWrapper.style.cursor = "col-resize";
        scrubZone.classList.remove("active");
    }
});

trackWrapper.addEventListener("mouseleave", () => {
    if (!dragMode) {
        trackWrapper.style.cursor = "";
        scrubZone.classList.remove("active");
    }
});

function updatePresent(year) {
    const clamped = Math.round(Math.max(MIN_YEAR, Math.min(MAX_YEAR, year)));
    setTimelinePresentYear(clamped);
    presentYearVal.textContent = formatYear(clamped);
    presentEraLabel.textContent = eraLabel();
    render();
}

// ─── Zoom via scroll wheel (zoom toward cursor position) ──────────────────────
trackWrapper.addEventListener("wheel", (e) => {
    e.preventDefault();

    const rect = trackWrapper.getBoundingClientRect();
    const anchorPct  = (e.clientX - rect.left) / rect.width;
    const anchorYear = percentToYear(anchorPct * 100);

    const factor  = e.deltaY > 0 ? 1.12 : 0.88;
    const newSpan = Math.max(SPAN_MIN, Math.min(SPAN_MAX, visibleSpan * factor));

    viewOffset   = clampViewOffset(anchorYear - anchorPct * newSpan);
    visibleSpan  = newSpan;

    render();
}, { passive: false });

// ─── React to era/timeline state changes ──────────────────────────────────────
onEraFilterChange(() => render());
onTimelineChange(() => render());

// ─── Keep --timeline-height in sync so era-filter can sit above the timeline ──
function updateTimelineHeightVar() {
    // getBoundingClientRect ignores CSS transform, so we measure inner content
    // and add tab height. When closed, only the tab (itself 28px) is visible.
    const tabH = tab.getBoundingClientRect().height;
    const innerH = isOpen ? document.getElementById("timeline-inner").getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty("--timeline-height", `${tabH + innerH}px`);
}

new ResizeObserver(updateTimelineHeightVar).observe(panel);
panel.addEventListener("transitionend", updateTimelineHeightVar);

// ─── Initial render ───────────────────────────────────────────────────────────
viewOffset = clampViewOffset(timelinePresentYear - visibleSpan / 2);
render();
updateTimelineHeightVar();