// ─── Sound Engine ─────────────────────────────────────────────────────────────
//
//   ting.mp3   — node selected
//   click.mp3  — link selected / any button pressed
//   thud.mp3   — each cascade wave in What If mode

import { onNodeSelected, onLinkSelected } from "./state.js";
import { onRemovedNodeChange, onWhatIfModeToggle } from "./state.js";
import { links, nodes } from "./state.js";
import { isNodeOnSelectedEras, isNodeBeforePresent, nodeSelectedFromGraph } from "./state.js";

// ─── Lazy AudioContext ────────────────────────────────────────────────────────
// Browsers block AudioContext creation until a user gesture. We create it on
// the first interaction and then decode all three buffers immediately after.

let _ctx    = null;
let _master = null;
const _buffers  = {};
let _loadPromise = null;

function _getCtx() {
    if (_ctx) return _ctx;
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _master = _ctx.createGain();
    _master.gain.value = 0.7;
    _master.connect(_ctx.destination);
    return _ctx;
}

async function _loadAll() {
    const ctx = _getCtx();

    async function load(name, path) {
        try {
            const res = await fetch(path);
            const raw = await res.arrayBuffer();
            _buffers[name] = await ctx.decodeAudioData(raw);
        } catch (err) {
            console.warn(`[Sound] Could not load "${name}" from "${path}":`, err);
        }
    }

    await Promise.all([
        load("ting",  "audio/ting.mp3"),
        load("click", "audio/click.mp3"),
        load("thud",  "audio/thud.mp3"),
    ]);
}

// Trigger loading on the first user interaction anywhere on the page
function _ensureLoaded() {
    if (!_loadPromise) {
        _loadPromise = _loadAll();
    }
    return _loadPromise;
}

document.addEventListener("click", _ensureLoaded, { once: true, capture: true });
document.addEventListener("keydown", _ensureLoaded, { once: true, capture: true });
document.addEventListener("pointerdown", _ensureLoaded, { once: true, capture: true });

// ─── Core play helper ─────────────────────────────────────────────────────────
function _play(name, { volume = 1, playbackRate = 1 } = {}) {
    // If buffers aren't loaded yet, silently skip — this can only happen if
    // _play is somehow called before any user gesture, which shouldn't occur.
    const buf = _buffers[name];
    if (!buf || !_ctx) return;

    if (_ctx.state === "suspended") _ctx.resume();

    const src = _ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = playbackRate;

    const gain = _ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(_master);
    src.start();
}

// ─── Node selection → ting (only on direct graph clicks) ─────────────────────
onNodeSelected((node) => {
    if (node && nodeSelectedFromGraph) _play("ting", { volume: 0.9 });
});

// ─── Link selection → click ───────────────────────────────────────────────────
onLinkSelected((link) => {
    if (link) _play("click", { volume: 0.75 });
});

// ─── Button / interactive-element presses → click ─────────────────────────────
// Capture phase fires before stopPropagation in any element's own handler.
// Covers: <button>, CE/AH era toggle pill, era checkbox labels,
//         timeline node dots, sidebar panel-link items, and search results.
document.addEventListener("click", async (e) => {
    const isButton      = !!e.target.closest("button");
    const isEraToggle   = !!e.target.closest("#tl-cal-toggle");
    const isEraLabel    = !!e.target.closest(".era-checkbox-label, .era-select-all");
    const isTimelineDot = !!e.target.closest(".timeline-node-dot");
    const isPanelLink   = !!e.target.closest(".panel-link");
    const isSearchResult = !!e.target.closest(".search-result-item");
    if (!isButton && !isEraToggle && !isEraLabel && !isTimelineDot && !isPanelLink && !isSearchResult) return;
    await _ensureLoaded();
    _play("click", { volume: 0.55 });
}, { capture: true });

// ─── Search input focus → click ───────────────────────────────────────────────
// The focus event doesn't bubble as a click, so we listen for it separately.
document.addEventListener("focusin", async (e) => {
    if (!e.target.closest("#node-search-input")) return;
    await _ensureLoaded();
    _play("click", { volume: 0.45 });
}, { capture: true });
// Mirrors the WAVE_DELAY constant in what-if.js so each thud lands in sync
// with its visual ripple. Each successive wave is lower-pitched and quieter.

const WAVE_DELAY = 500; // must match what-if.js

let _thudTimers = [];

function _cancelThuds() {
    _thudTimers.forEach(t => clearTimeout(t));
    _thudTimers = [];
}

// Returns true only if the node is both era-visible and before the present year
function _isNodeRendered(nodeId) {
    return isNodeOnSelectedEras(nodeId) && isNodeBeforePresent(nodeId);
}

// BFS returning Map<nodeId, depth> following outgoing links only
function _bfsDepths(startId) {
    const depth = new Map([[startId, 0]]);
    const queue = [startId];
    while (queue.length) {
        const curr = queue.shift();
        for (const l of links) {
            const srcId = typeof l.source === "object" ? l.source.id : l.source;
            const tgtId = typeof l.target === "object" ? l.target.id : l.target;
            if (srcId === curr && !depth.has(tgtId)) {
                depth.set(tgtId, depth.get(curr) + 1);
                queue.push(tgtId);
            }
        }
    }
    return depth;
}

onRemovedNodeChange(async (node) => {
    _cancelThuds();
    if (!node) return;

    await _ensureLoaded();

    // Root thud only if the erased node is actually visible on the graph
    if (_isNodeRendered(node.id)) {
        _play("thud", { volume: 1.0, playbackRate: 1.05 });
    }

    const depthMap = _bfsDepths(node.id);

    // Group downstream node IDs by depth level
    const byDepth = new Map();
    depthMap.forEach((d, id) => {
        if (d === 0) return; // root already handled above
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d).push(id);
    });

    const maxDepth = byDepth.size ? Math.max(...byDepth.keys()) : 0;

    for (let d = 1; d <= maxDepth; d++) {
        const waveIds = byDepth.get(d) ?? [];
        const rate    = Math.max(0.65, 1.05 - d * 0.07);
        const vol     = Math.max(0.35, 1.0  - d * 0.08);
        const delay   = d * WAVE_DELAY;

        const t = setTimeout(() => {
            // Only thud if at least one node in this wave is actually rendered
            const anyVisible = waveIds.some(id => _isNodeRendered(id));
            if (anyVisible) _play("thud", { volume: vol, playbackRate: rate });
        }, delay);

        _thudTimers.push(t);
    }
});

// Cancel pending thuds when What If mode is switched off
onWhatIfModeToggle((active) => {
    if (!active) _cancelThuds();
});