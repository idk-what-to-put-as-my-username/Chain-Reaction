import NODES from "../data/nodes.json" with { type: "json" };
import LINKS from "../data/links.json" with { type: "json" };
import ERAS from "../data/eras.json" with { type: "json" };
import ERA_BRIDGE_LINKS from "../data/era-bridge-links.json" with { type: "json" };

export const nodes = NODES.map(x => ({ ...x }));
export const links = LINKS.map(x => ({ ...x }));
export { ERAS, ERA_BRIDGE_LINKS };

export let defaultColour = "rgb(255, 255, 255)";

export let linkThickness = 1;

export let nodeRadius = 10;

export let highlight = { colour: "rgb(208, 219, 46)" }

export let maxLen = 12,                                 //maximum length of node names before truncation. Adjust as needed.
        forceLinkDistance = 90,
        forceLinkStrength = 0.5,
        forceRepulsionStrength = -420,
        forceCollisionRadius = 38,
        glowControl = {reg: [0.2, 0.4, 0.9],         //controls the gradient stops for the glow effect.
                       sel: [0.3, 0.6, 0.95]         //The first value controls where most opaque part of glow is.
                    }                                //The second value controls where the half-transparent part of the glow is.
                                                     //The third value controls where the fully transparent part of the glow is.


export let selectedNode = null
const onNodeSelectedCallbacks = []

export function selectNode(node) {
    selectedNode = node;
    onNodeSelectedCallbacks.forEach(func => func(node));
}

export function onNodeSelected(func) {
    onNodeSelectedCallbacks.push(func);
}

// ─── What If Mode State ───
export let whatIfMode = false;
export let removedNode = null;

const onWhatIfModeCallbacks = [];
const onRemovedNodeCallbacks = [];

export function toggleWhatIfMode() {
    whatIfMode = !whatIfMode;
    if (!whatIfMode) {
        removedNode = null;
        onRemovedNodeCallbacks.forEach(func => func(null));
    }
    onWhatIfModeCallbacks.forEach(func => func(whatIfMode));
}

export function setRemovedNode(node) {
    removedNode = node;
    onRemovedNodeCallbacks.forEach(func => func(node));
}

export function onWhatIfModeToggle(func) {
    onWhatIfModeCallbacks.push(func);
}

export function onRemovedNodeChange(func) {
    onRemovedNodeCallbacks.push(func);
}

// DFS: get all nodes reachable by following outgoing links from startNodeId
export function getDownstreamNodes(startNodeId) {
    const visited = new Set();
    const stack = [startNodeId];
    while (stack.length) {
        const curr = stack.pop();
        if (visited.has(curr)) continue;
        visited.add(curr);
        for (const l of links) {
            // l.source and l.target may be objects (after D3 binds) or strings
            const srcId = typeof l.source === 'object' ? l.source.id : l.source;
            const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
            if (srcId === curr && !visited.has(tgtId)) {
                stack.push(tgtId);
            }
        }
    }
    visited.delete(startNodeId); // return only downstream, not the start itself
    return Array.from(visited);
}

export let reRender = null
export function onRerender(func) {
    reRender = func
}

export function CEtoAH(year, month) {
    const date = new Date(year, month - 1, 1);
    const hijriFormatter = new Intl.DateTimeFormat('en', {
        calendar: 'islamic-umalqura',
        year: 'numeric',
        month: 'numeric'
    });
    const parts = hijriFormatter.formatToParts(date);
    const AHYear = parts.find(p => p.type === 'year').value
    return parseInt(AHYear)
}

// Build a lookup map: nodeId -> era
export const NODE_ERA_MAP = {};
ERAS.forEach(era => {
    era.nodes.forEach(nodeId => {
        // If node already assigned, keep it (first era wins)
        if (!NODE_ERA_MAP[nodeId]) {
            NODE_ERA_MAP[nodeId] = era.id;
        }
    });
});

// Get era color for a node
export function getEraColor(nodeId) {
    const eraId = NODE_ERA_MAP[nodeId];
    const era = ERAS.find(e => e.id === eraId);
    return era ? era.color : "rgb(255, 255, 255)";
}

const activeEras = new Set(ERAS.map(e => e.id));
const callbacks = [];

export function onEraFilterChange(cb) {
    callbacks.push(cb);
}

export function notifyChange() {
    callbacks.forEach(cb => cb(activeEras));
}

export function isNodeVisible(nodeId) {
    const eraId = NODE_ERA_MAP[nodeId];
    // If node not assigned to any era, always show
    if (!eraId) return true;
    return activeEras.has(eraId);
}

export function areAllErasActive() {
    return activeEras.size === ERAS.length;
}

export { activeEras };