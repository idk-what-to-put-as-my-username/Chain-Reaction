import { nodes, links } from "./state.js"
import { selectNode, selectedNode, onNodeSelected, selectLink, selectedLink } from "./state.js"
import { linkThickness, nodeRadius, defaultColour, highlight, maxLen, forceLinkDistance, forceLinkStrength, forceRepulsionStrength, forceCollisionRadius, glowControl } from "./state.js"
import { whatIfMode, removedNode, toggleWhatIfMode, setRemovedNode, onWhatIfModeToggle, onRemovedNodeChange, getDownstreamNodes } from "./state.js"
import { ERAS, NODE_ERA_MAP, getEraColor, ERA_BRIDGE_LINKS } from "./state.js"
import { onEraFilterChange, isNodeVisible, areAllErasActive, onTimelineChange, isNodeBeforePresent } from "./state.js"

const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#node-graph")
    .attr("viewBox", `0, 0, ${width}, ${height}`)

const defs = svg.select("defs")

const mainGroup = svg.select("#main-g")

let simulation, linkGroups, linkLines, nodePoints, nodeCircles, nodeNames
let bridgeLinkGroups, bridgeLinkLines

// converts "rgb(r, g, b)" into "rgba(r, g, b, a)"
function rgbToRgba(rgb, alpha) {
    return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

function createGradient(id, colour, stops) {
    defs.append("radialGradient")
        .attr("id", id)
        .selectAll("stop")
        .data([
            { offset: `${stops[0]*100}%`, color: rgbToRgba(colour, 1)   },
            { offset: `${stops[1]*100}%`, color: rgbToRgba(colour, 0.5) },
            { offset: `${stops[2]*100}%`, color: rgbToRgba(colour, 0)   }
        ])
        .enter()
        .append("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color);
}

function createEraGradient(eraId, colour) {
    const gradId = `eraGlow-${eraId}`;
    defs.select(`#${gradId}`).remove();
    defs.append("radialGradient")
        .attr("id", gradId)
        .selectAll("stop")
        .data([
            { offset: `${glowControl.reg[0]*100}%`, color: rgbToRgba(colour, 1)   },
            { offset: `${glowControl.reg[1]*100}%`, color: rgbToRgba(colour, 0.5) },
            { offset: `${glowControl.reg[2]*100}%`, color: rgbToRgba(colour, 0)   }
        ])
        .enter()
        .append("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color);
    return gradId;
}

// Initializing gradients
ERAS.forEach(era => createEraGradient(era.id, era.color));
createGradient("defaultGlow", defaultColour, glowControl.reg);

//zooming and panning
const zoomBehaviour = d3.zoom()
    .scaleExtent([0.2, 2.5])
    .on("zoom", (e) => { mainGroup.attr("transform", e.transform); });
svg.call(zoomBehaviour)

  // Initial centered zoom-out
  const initialScale = 0.272;
  const { cx, cy } = _getVisualCenter();
  const tx = cx - (width / 2) * initialScale;
  const ty = cy - (height / 2) * initialScale;
  svg.call(
    zoomBehaviour.transform,
    d3.zoomIdentity.translate(tx, ty).scale(initialScale)
  );



// ─── What If Mode UI ───
const whatIfToggle = document.createElement("button");
whatIfToggle.id = "what-if-toggle";
whatIfToggle.className = "what-if-toggle";
whatIfToggle.title = "What If Mode";
whatIfToggle.innerHTML = "What if?";
document.body.appendChild(whatIfToggle);

whatIfToggle.addEventListener("click", () => {
    toggleWhatIfMode();
});

// ─── Cascade animation state ──────────────────────────────────────────────────
let _cascadeTimers = [];

function cancelCascade() {
    _cascadeTimers.forEach(t => clearTimeout(t));
    _cascadeTimers = [];
}

// BFS from removedId following outgoing links only, returns Map<nodeId, depth>
function bfsDownstreamDepths(removedId) {
    const depth = new Map();
    depth.set(removedId, 0);
    const queue = [removedId];
    while (queue.length) {
        const curr = queue.shift();
        for (const l of links) {
            const srcId = typeof l.source === 'object' ? l.source.id : l.source;
            const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
            if (srcId === curr && !depth.has(tgtId)) {
                depth.set(tgtId, depth.get(curr) + 1);
                queue.push(tgtId);
            }
        }
    }
    return depth; // includes the root at depth 0
}

function applyWhatIfVisuals(removedId) {
    cancelCascade();

    if (!removedId) {
        clearWhatIfVisuals();
        return;
    }

    // Clear any inline opacity styles from normal selection
    nodePoints.style("opacity", null);
    linkLines.style("opacity", null).style("stroke-width", null);
    linkGroups.selectAll(".link-direction").remove();
    mainGroup.selectAll(".whatif-ring").remove();

    // Reset all what-if classes so previous selection is fully cleared
    nodePoints
        .classed("node-erased", false)
        .classed("node-affected", false);
    linkLines.classed("link-erased", false);
    nodePoints.selectAll(".whatif-cross").remove();

    // Build depth map (root=0, direct children=1, grandchildren=2, …)
    const depthMap = bfsDownstreamDepths(removedId);
    const maxDepth = Math.max(...depthMap.values());

    // Group nodes by depth
    const byDepth = new Map();
    depthMap.forEach((d, id) => {
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d).push(id);
    });

    const WAVE_DELAY = 500; // ms between each depth wave

    // Apply root immediately (depth 0)
    nodePoints.each(function(n) {
        if (n.id !== removedId) return;
        const g = d3.select(this);
        g.classed("node-erased", true);
        g.selectAll(".whatif-cross").remove();
        const arm = 16;
        const cy  = 13;
        g.append("line")
            .attr("class", "whatif-cross")
            .attr("x1", -arm).attr("y1", cy - arm)
            .attr("x2",  arm).attr("y2", cy + arm);
        g.append("line")
            .attr("class", "whatif-cross")
            .attr("x1",  arm).attr("y1", cy - arm)
            .attr("x2", -arm).attr("y2", cy + arm);
    });

    // Also erased links touching root immediately
    linkLines.each(function(l) {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        if (srcId === removedId || tgtId === removedId) {
            d3.select(this).classed("link-erased", true);
        }
    });

    // Wave in the downstream nodes depth by depth
    for (let d = 1; d <= maxDepth; d++) {
        const waveIds = new Set(byDepth.get(d) ?? []);
        const delay = d * WAVE_DELAY;

        const t = setTimeout(() => {
            // Mark nodes at this depth as affected
            nodePoints.each(function(n) {
                if (waveIds.has(n.id)) {
                    d3.select(this).classed("node-affected", true);
                }
            });
            // Mark links whose target is in this wave (the link that "carries" the erasure)
            linkLines.each(function(l) {
                const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
                const srcId = typeof l.source === 'object' ? l.source.id : l.source;
                // Erased if either end is in the dead set (all depths up to current)
                if (waveIds.has(tgtId) || waveIds.has(srcId)) {
                    d3.select(this).classed("link-erased", true);
                }
            });
        }, delay);

        _cascadeTimers.push(t);
    }
}



function clearWhatIfVisuals() {
    cancelCascade();
    mainGroup.selectAll(".whatif-ring").remove();
    nodePoints.selectAll(".whatif-cross").remove();
    nodePoints
        .classed("node-erased", false)
        .classed("node-affected", false)
        .classed("node-surviving", false)
        .style("opacity", null);
    linkLines
        .classed("link-erased", false)
        .style("opacity", null)
        .style("stroke-width", null);
}

onWhatIfModeToggle((active) => {
    whatIfToggle.classList.toggle("active", active);
    document.body.classList.toggle("what-if-active", active);
    if (!active) {
        clearWhatIfVisuals();
        // Restore normal selection visuals if a node was selected before
        if (selectedNode) {
            _internalSelecting = true;
            selectNode(selectedNode);
            _internalSelecting = false;
            applySelectionVisuals(selectedNode);
        }
    }
});

onRemovedNodeChange((node) => {
    if (whatIfMode) {
        applyWhatIfVisuals(node?.id ?? null);
    }
});



//physics
simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(x => x.id).distance(forceLinkDistance).strength(forceLinkStrength))
    .force("repulsion", d3.forceManyBody().strength(forceRepulsionStrength))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(forceCollisionRadius))

//rendering links
linkGroups = mainGroup.append("g").selectAll("g")
    .data(links).enter().append("g")
    .attr("class", "link-group")

linkGroups.append("line")
    .attr("class", "link-hitbox")
    .attr("stroke", "transparent")
    .attr("stroke-width", Math.max(8, linkThickness + 4))
    .attr("pointer-events", "stroke")
    .on("mouseenter", function(e, l) {
        if (selectedNode || selectedLink || whatIfMode) return;
        d3.select(this.parentNode).select(".link-line")
            .classed("link-hovered", true)
            .attr("stroke", highlight.colour);
    })
    .on("mouseleave", function(e, l) {
        if (selectedNode || selectedLink || whatIfMode) return;
        d3.select(this.parentNode).select(".link-line")
            .classed("link-hovered", false)
            .attr("stroke", getLinkColor(l));
    })
    .on("click", function(e, l) {
        e.stopPropagation();
        if (whatIfMode) return;

        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        const alreadySelected = selectedLink &&
            (typeof selectedLink.source === 'object' ? selectedLink.source.id : selectedLink.source) === srcId &&
            (typeof selectedLink.target === 'object' ? selectedLink.target.id : selectedLink.target) === tgtId;

        // Clear node selection first
        nodePoints
            .classed("node-hovered", false)
            .classed("node-muted", false)
            .classed("node-selected", false)
            .style("opacity", null);
        _internalSelecting = true;
        selectNode(null);
        _internalSelecting = false;

        // Clear all link visuals
        linkLines
            .classed("link-hovered", false)
            .classed("link-dimmed", false)
            .style("opacity", null)
            .style("stroke-width", null)
            .attr("stroke", d => getLinkColor(d));
        linkGroups.selectAll(".link-direction").remove();

        if (alreadySelected) {
            selectLink(null);
            applyEraFilter();
            return;
        }

        applyLinkSelectionVisuals(l);
        selectLink(l);
    });

linkLines = linkGroups.append("line")
    .attr("class", "link-line")
    .attr("stroke", d => getLinkColor(d))
    .attr("stroke-width", linkThickness)
    .attr("pointer-events", "none")

// Bridge links (cross-era connectors)
const bridgeLinksData = ERA_BRIDGE_LINKS.map(bl => ({
    ...bl,
    source: nodes.find(n => n.id === bl.source) || bl.source,
    target: nodes.find(n => n.id === bl.target) || bl.target
}));

bridgeLinkGroups = mainGroup.append("g").selectAll("g")
    .data(bridgeLinksData).enter().append("g")
    .attr("class", "link-group bridge-link-group")
    .style("opacity", 0)

//rendering nodes
nodePoints = mainGroup.append("g").selectAll("g")
    .data(nodes).enter().append("g")
    .attr("class", "node-points")
    .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }))

//rendering node circles
nodeCircles = nodePoints.append("circle")
    .attr("class", "node-circle")
    .attr("r", nodeRadius)
    .attr("fill", d => {
        const eraId = NODE_ERA_MAP[d.id];
        return eraId ? `url(#eraGlow-${eraId})` : "url(#defaultGlow)";
    })

//rendering node names
nodeNames = nodePoints.append("text")
    .attr("class", "node-name")
    .attr("text-anchor", "middle")
    .attr("dy", 26)
    .attr("fill", d => {
        const eraId = NODE_ERA_MAP[d.id];
        const era = ERAS.find(e => e.id === eraId);
        return era ? era.color : defaultColour;
    })
    .text(d => d.name.length > maxLen ? d.name.slice(0, maxLen - 2) + "…" : d.name)

function getLinkColor(l) {
    const srcId = typeof l.source === "object" ? l.source.id : l.source;
    const tgtId = typeof l.target === "object" ? l.target.id : l.target;
    const srcEra = NODE_ERA_MAP[srcId];
    const tgtEra = NODE_ERA_MAP[tgtId];
    if (srcEra && srcEra === tgtEra) {
        const era = ERAS.find(e => e.id === srcEra);
        if (era) return rgbToRgba(era.color, 0.4);
    }
    return rgbToRgba(defaultColour, 0.25);
}

linkLines.attr("stroke", d => getLinkColor(d));

//simulating everything
simulation.on("tick", () => {
    linkGroups.selectAll("line")
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
    nodePoints
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
    bridgeLinkGroups.selectAll("line")
        .attr("x1", d => (typeof d.source === "object" ? d.source.x : 0))
        .attr("y1", d => (typeof d.source === "object" ? d.source.y : 0))
        .attr("x2", d => (typeof d.target === "object" ? d.target.x : 0))
        .attr("y2", d => (typeof d.target === "object" ? d.target.y : 0));
    // Keep what-if rings on their nodes
    mainGroup.selectAll(".whatif-ring").each(function() {
        const id = d3.select(this).attr("data-node-id");
        const node = nodes.find(n => n.id === id);
        if (node) {
            d3.select(this).attr("cx", node.x).attr("cy", node.y);
        }
    });
})

ERAS.forEach(era => createEraGradient(era.id, era.color));
createGradient("hoverGlow", highlight.colour, glowControl.sel);

// ─── Loading Screen ───────────────────────────────────────────────────────────
(function initLoadingScreen() {
    const style = document.createElement("style");
    style.textContent = `
        #qadar-loader {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #0a0a0f;
            pointer-events: all;
            transition: opacity 0.9s ease;
        }
        #qadar-loader.fade-out {
            opacity: 0;
            pointer-events: none;
        }
        .loader-brand {
            font-family: 'Cinzel', serif;
            font-size: 2.4rem;
            letter-spacing: 0.35em;
            color: rgba(255,255,255,0.92);
            margin-bottom: 0.25rem;
            user-select: none;
        }
        .loader-brand .loader-accent {
            color: rgb(180, 150, 80);
        }
        .loader-sub {
            font-family: 'Cinzel', serif;
            font-size: 0.72rem;
            letter-spacing: 0.55em;
            color: rgba(180,150,80,0.6);
            margin-bottom: 3rem;
            text-transform: uppercase;
            user-select: none;
        }
        .loader-chain {
            display: flex;
            align-items: center;
            margin-bottom: 2.5rem;
        }
        .loader-link {
            width: 18px;
            height: 10px;
            border: 1.5px solid rgba(180, 150, 80, 0.25);
            border-radius: 5px;
            animation: chainPulse 1.6s ease-in-out infinite;
        }
        .loader-link:nth-child(1) { animation-delay: 0.00s; }
        .loader-link:nth-child(2) { animation-delay: 0.18s; }
        .loader-link:nth-child(3) { animation-delay: 0.36s; }
        .loader-link:nth-child(4) { animation-delay: 0.54s; }
        .loader-link:nth-child(5) { animation-delay: 0.72s; }
        .loader-link:nth-child(6) { animation-delay: 0.90s; }
        .loader-link:nth-child(7) { animation-delay: 1.08s; }
        @keyframes chainPulse {
            0%, 100% {
                border-color: rgba(180, 150, 80, 0.2);
                box-shadow: none;
            }
            50% {
                border-color: rgba(208, 180, 100, 0.9);
                box-shadow: 0 0 8px rgba(208, 180, 100, 0.5);
            }
        }
        .loader-status {
            font-family: 'Roboto', sans-serif;
            font-size: 0.7rem;
            letter-spacing: 0.2em;
            color: rgba(255,255,255,0.3);
            text-transform: uppercase;
        }
    `;
    document.head.appendChild(style);

    const loader = document.createElement("div");
    loader.id = "qadar-loader";
    loader.innerHTML = `
        <div class="loader-brand">QADAR<span class="loader-accent">CHAIN</span></div>
        <div class="loader-sub">Connecting the threads of history</div>
        <div class="loader-chain">
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
            <div class="loader-link"></div>
        </div>
        <div class="loader-status">Settling the graph\u2026</div>
    `;
    document.body.appendChild(loader);

    function dismissLoader() {
        loader.classList.add("fade-out");
        setTimeout(() => loader.remove(), 950);
    }

    // Debounced "end" listener — the sim can restart briefly (alpha bumps from
    // applyEraFilter), so we wait a short beat after it truly goes quiet.
    let _settleTimer = null;

    simulation.on("end.loader", () => {
        clearTimeout(_settleTimer);
        _settleTimer = setTimeout(() => {
            simulation.on("end.loader", null);
            dismissLoader();
        }, 400);
    });

    // Safety fallback: always dismiss after 6 s
    setTimeout(() => {
        simulation.on("end.loader", null);
        clearTimeout(_settleTimer);
        dismissLoader();
    }, 6000);
})();

function getNodeId(d) {
  return typeof d === 'object' ? d.id : d;
}

// Track which node IDs were visible on the last applyEraFilter call
let _prevVisibleIds = new Set();
let _initialLoad = true;
// rAF handle for the post-reveal camera-follow loop
let _followAnimId = null;

function applyEraFilter() {
  const allActive = areAllErasActive();
  const visibleNodes = nodes.filter(n => isNodeVisible(n.id) && isNodeBeforePresent(n.id));
  const visibleLinks = links.filter(l => {
    const srcId = getNodeId(l.source);
    const tgtId = getNodeId(l.target);
    return isNodeVisible(srcId) && isNodeVisible(tgtId)
        && isNodeBeforePresent(srcId) && isNodeBeforePresent(tgtId);
  });

  // ── Pan camera to newly revealed nodes, then follow them as they settle ──
  const newlyVisible = visibleNodes.filter(n => !_prevVisibleIds.has(n.id));
  if (newlyVisible.length > 0) {
    // Cancel any in-progress follow loop from a previous reveal
    if (_followAnimId !== null) {
      cancelAnimationFrame(_followAnimId);
      _followAnimId = null;
    }

    const FOLLOW_DURATION = 1200; // ms to follow the nodes after they appear
    const followStart = performance.now();

    function followNodes(now) {
      const elapsed = now - followStart;
      const progress = Math.min(elapsed / FOLLOW_DURATION, 1); // 0 → 1

      // Average *current* position of the newly-visible nodes (they're still moving)
      const avgX = newlyVisible.reduce((s, n) => s + (n.x ?? 0), 0) / newlyVisible.length;
      const avgY = newlyVisible.reduce((s, n) => s + (n.y ?? 0), 0) / newlyVisible.length;

      const t = d3.zoomTransform(svg.node());
      const { cx, cy } = _getVisualCenter();
      const targetX = cx - avgX * t.k;
      const targetY = cy - avgY * t.k;

      // Snap strength fades from 1 → 0 over the follow duration so the
      // camera gradually releases the node instead of abruptly stopping
      const strength = 1 - progress;

      // Lerp current translate toward the ideal centre position
      const newTx = t.x + (targetX - t.x) * (0.12 + strength * 0.08);
      const newTy = t.y + (targetY - t.y) * (0.12 + strength * 0.08);

      // Apply without a CSS transition so we're driving it frame-by-frame
      svg.call(
        zoomBehaviour.transform,
        d3.zoomIdentity.translate(newTx, newTy).scale(t.k)
      );

      if (progress < 1) {
        _followAnimId = requestAnimationFrame(followNodes);
      } else {
        _followAnimId = null;
      }
    }

    _followAnimId = requestAnimationFrame(followNodes);
  }

  _prevVisibleIds = new Set(visibleNodes.map(n => n.id));

  // Update simulation data - exclude hidden from physics
  simulation.nodes(visibleNodes);
  simulation.force("link").links(visibleLinks);
  if (_initialLoad) {
    _initialLoad = false;
    // Let the simulation run at full alpha from creation for proper spread
  } else {
    simulation.alpha(0.3).restart();
  }

  // Visual updates
  nodePoints.each(function(d) {
    const visible = visibleNodes.some(vn => vn.id === d.id);
    d3.select(this)
      .classed("era-hidden", !visible)
      .style("opacity", visible ? null : 0)
      .style("pointer-events", visible ? null : "none");
  });

  linkGroups.each(function(d) {
    const srcId = getNodeId(d.source);
    const tgtId = getNodeId(d.target);
    const visible = isNodeVisible(srcId) && isNodeVisible(tgtId)
                 && isNodeBeforePresent(srcId) && isNodeBeforePresent(tgtId);
    d3.select(this)
      .classed("era-hidden", !visible)
      .style("opacity", visible ? null : 0);
  });

  bridgeLinkGroups
    .style("opacity", allActive ? 1 : 0)
    .style("pointer-events", allActive ? null : "none");
}

onEraFilterChange(() => {
    if (!whatIfMode) {
        _internalSelecting = true;
        selectNode(null);
        _internalSelecting = false;
    }
    nodePoints
        .classed("node-hovered", false)
        .classed("node-muted", false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed", false)
        .style("opacity", null)
        .style("stroke-width", null);
    linkGroups.selectAll(".link-direction").remove();
    applyEraFilter();
});

onTimelineChange(() => {
    applyEraFilter();
    // Re-apply selection dimming if a node is selected, since applyEraFilter resets opacity
    if (selectedNode) {
        applySelectionVisuals(selectedNode);
    }
});
// Seed prevVisible so the initial nodes don't animate in from centre
_prevVisibleIds = new Set(
    nodes.filter(n => isNodeVisible(n.id) && isNodeBeforePresent(n.id)).map(n => n.id)
);
applyEraFilter();

// ─── Click on SVG background to deselect ───
svg.on("click", function(e) {
    if (whatIfMode) return;
    if (!selectedNode && !selectedLink) return;
    if (e.target === svg.node() || e.target === mainGroup.node()) {
        deselectNode();
    }
});

function deselectNode() {
    nodePoints
        .classed("node-hovered", false)
        .classed("node-muted", false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed", false)
        .style("opacity", null)
        .style("stroke-width", null)
        .attr("stroke", l => getLinkColor(l));
    linkGroups.selectAll(".link-direction").remove();
    _internalSelecting = true;
    selectNode(null);
    _internalSelecting = false;
    selectLink(null);
    applyEraFilter();
}

// ─── Link selection: distance-based dimming from both endpoints ───────────────
function applyLinkSelectionVisuals(link) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;

    // BFS from both endpoints, take the minimum distance for each node
    const distSrc = bfsDistances(srcId);
    const distTgt = bfsDistances(tgtId);
    const distMap = new Map();
    const allIds = new Set([...distSrc.keys(), ...distTgt.keys()]);
    allIds.forEach(id => {
        const ds = distSrc.get(id) ?? Infinity;
        const dt = distTgt.get(id) ?? Infinity;
        distMap.set(id, Math.min(ds, dt));
    });

    // The link itself is distance-0; its endpoints are already at dist 0 from BFS
    nodePoints.style("opacity", n => {
        if (!isNodeVisible(n.id) || !isNodeBeforePresent(n.id)) return 0;
        const nd = distMap.get(n.id) ?? Infinity;
        if (nd === Infinity) return 0.08;
        return Math.max(0.15, 1 - nd * 0.254);
    });

    linkLines
        .style("opacity", l => {
            const lSrc = typeof l.source === 'object' ? l.source.id : l.source;
            const lTgt = typeof l.target === 'object' ? l.target.id : l.target;
            // The selected link itself
            if (lSrc === srcId && lTgt === tgtId) return 1;
            const ld = getLinkDistance(l, distMap);
            if (ld === Infinity) return 0.05;
            return Math.max(0.08, 1 - ld * 0.272);
        })
        .style("stroke-width", l => {
            const lSrc = typeof l.source === 'object' ? l.source.id : l.source;
            const lTgt = typeof l.target === 'object' ? l.target.id : l.target;
            return (lSrc === srcId && lTgt === tgtId) ? "2px" : null;
        })
        .attr("stroke", l => getLinkColor(l));

    // Directional flow only on the selected link
    linkGroups.selectAll(".link-direction").remove();
    linkGroups.each(function(l) {
        const lSrc = typeof l.source === 'object' ? l.source.id : l.source;
        const lTgt = typeof l.target === 'object' ? l.target.id : l.target;
        if (lSrc === srcId && lTgt === tgtId) {
            d3.select(this).append("line")
                .attr("class", "link-direction")
                .attr("stroke", highlight.colour)
                .attr("stroke-width", 3)
                .attr("x1", link.source.x ?? link.source)
                .attr("y1", link.source.y ?? 0)
                .attr("x2", link.target.x ?? link.target)
                .attr("y2", link.target.y ?? 0);
        }
    });
}

function applySelectionVisuals(node) {
    const distMap = bfsDistances(node.id);
    const maxDist = Math.max(...distMap.values());

    nodePoints.style("opacity", n => {
        if (!isNodeVisible(n.id) || !isNodeBeforePresent(n.id)) return 0;
        if (n.id === node.id) return 1;
        const nd = distMap.get(n.id) ?? (maxDist + 1);
        return Math.max(0.15, 1 - nd * 0.254);
    });

    linkLines
        .style("opacity", l => {
            const ld = getLinkDistance(l, distMap);
            if (ld === Infinity) return 0.05;
            return Math.max(0.08, 1 - ld * 0.272);
        })
        .style("stroke-width", l => {
            const ld = getLinkDistance(l, distMap);
            return ld === 0 ? "2px" : null;
        });

    linkGroups.selectAll(".link-direction").remove();
    linkGroups.each(function(l) {
        const ld = getLinkDistance(l, distMap);
        if (ld === 0) {
            d3.select(this).append("line")
                .attr("class", "link-direction")
                .attr("stroke", highlight.colour)
                .attr("stroke-width", 3)
                .attr("x1", l.source.x)
                .attr("y1", l.source.y)
                .attr("x2", l.target.x)
                .attr("y2", l.target.y);
        }
    });

    nodePoints.filter(n => n.id === node.id).classed("node-selected", true);
}


function bfsDistances(sourceId) {
    const dist = new Map();
    dist.set(sourceId, 0);
    const queue = [sourceId];
    while (queue.length) {
        const curr = queue.shift();
        for (const l of links) {
            const neighbor = l.source.id === curr ? l.target.id
                           : l.target.id === curr ? l.source.id
                           : null;
            if (neighbor !== null && !dist.has(neighbor)) {
                dist.set(neighbor, dist.get(curr) + 1);
                queue.push(neighbor);
            }
        }
    }
    return dist;
}

function getLinkDistance(link, distMap) {
    const sd = distMap.get(link.source.id) ?? Infinity;
    const td = distMap.get(link.target.id) ?? Infinity;
    return Math.min(sd, td); // link's distance = closer of its two endpoints
}

let _internalSelecting = false;

nodeCircles
    .on("mouseenter", function(e, d) {
        if (selectedNode || selectedLink || whatIfMode) return;
        if (!isNodeVisible(d.id)) return;
        const nodeGroup = d3.select(this.parentNode);
        nodeGroup.classed("node-hovered", true);
        nodePoints.filter(n => n.id !== d.id && isNodeVisible(n.id)).classed("node-muted", true);
    })
    .on("mouseleave", function(e, d) {
        if (selectedNode || selectedLink || whatIfMode) return;
        const nodeGroup = d3.select(this.parentNode);
        nodeGroup.classed("node-hovered", false);
        nodePoints.filter(n => n.id !== d.id).classed("node-muted", false);
    })
    .on("click", function(e, d) {
        e.stopPropagation(); // prevent SVG background click from firing
        if (!isNodeVisible(d.id)) return;
        // What If Mode Click
        if (whatIfMode) {
            if (removedNode?.id === d.id) {
                setRemovedNode(null);
            } else {
                setRemovedNode(d);
            }
            return;
        }

        const alreadySelected = selectedNode?.id === d.id;

        // Reset everything
        nodePoints
            .classed("node-hovered", false)
            .classed("node-muted", false)
            .classed("node-selected", false)
            .style("opacity", null);
        linkLines
            .classed("link-hovered", false)
            .classed("link-dimmed", false)
            .style("opacity", null)
            .style("stroke-width", null)
            .attr("stroke", l => getLinkColor(l));
        linkGroups.selectAll(".link-direction").remove();
        selectLink(null);

        if (alreadySelected) {
            _internalSelecting = true;
            selectNode(null);
            _internalSelecting = false;
            applyEraFilter();
            return;
        }

        applySelectionVisuals(d);
        _internalSelecting = true;
        selectNode(d);
        _internalSelecting = false;
    });

// ─── React to external node selections (e.g. from timeline dots) ───
onNodeSelected((node) => {
    if (_internalSelecting) return;
    if (whatIfMode) return; // don't mess with visuals during what-if mode

    nodePoints
        .classed("node-hovered", false)
        .classed("node-muted", false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed", false)
        .style("opacity", null)
        .style("stroke-width", null);
    linkGroups.selectAll(".link-direction").remove();

    if (!node) {
        applyEraFilter();
        return;
    }

    applySelectionVisuals(node);
});
// ─── Shared helper: pan (and optionally zoom) to a node ──────────────────────
// Computes the visual center of the free canvas — excluding the sidebar on the
// left and the timeline panel on the bottom — so the node lands where the user
// actually perceives the middle of the graph to be.
function _getVisualCenter() {
    const svgEl = svg.node();
    const svgWidth  = svgEl.clientWidth  || window.innerWidth;
    const svgHeight = svgEl.clientHeight || (window.innerHeight - 80); // SVG already starts below header

    // Sidebar: measure its rendered width only when it's open
    const sidebarEl = document.getElementById("sidebar");
    const sidebarW  = (sidebarEl && sidebarEl.classList.contains("open"))
        ? (sidebarEl.getBoundingClientRect().width || 0)
        : 0;

    // Timeline: how many px of the SVG height does the timeline panel consume?
    const timelineInner = document.getElementById("timeline-inner");
    const timelineTab   = document.getElementById("timeline-tab");
    const tlPanelEl     = document.getElementById("timeline-panel");
    let timelineH = 0;
    if (tlPanelEl) {
        const tlContainer = document.getElementById("timeline-container");
        const isOpen = tlContainer && tlContainer.classList.contains("open");
        const tabH   = timelineTab   ? timelineTab.getBoundingClientRect().height   : 0;
        const innerH = (isOpen && timelineInner)
            ? timelineInner.getBoundingClientRect().height
            : 0;
        timelineH = tabH + innerH;
    }

    // Free canvas bounds (SVG-element-local coordinates)
    const freeLeft   = sidebarW;
    const freeRight  = svgWidth;
    const freeTop    = 0;
    const freeBottom = svgHeight - timelineH;

    return {
        cx: freeLeft + (freeRight  - freeLeft) / 2,
        cy: freeTop  + (freeBottom - freeTop)  / 2,
    };
}

function _panToNode(node, { zoom = false } = {}) {
    if (!node || node.x == null || node.y == null) return;

    const { cx, cy } = _getVisualCenter();

    if (zoom) {
        const targetScale = 1.2;
        const tx = cx - node.x * targetScale;
        const ty = cy - node.y * targetScale;
        svg.transition()
            .duration(600)
            .ease(d3.easeCubicInOut)
            .call(
                zoomBehaviour.transform,
                d3.zoomIdentity.translate(tx, ty).scale(targetScale)
            );
    } else {
        const t  = d3.zoomTransform(svg.node());
        const tx = cx - node.x * t.k;
        const ty = cy - node.y * t.k;
        svg.transition()
            .duration(500)
            .ease(d3.easeCubicInOut)
            .call(
                zoomBehaviour.transform,
                d3.zoomIdentity.translate(tx, ty).scale(t.k)
            );
    }
}

// ─── Global: focus + select a node by id (used by search) ────────────────────
// Selects the node AND pans+zooms to centre it.
window.focusNode = function(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    nodePoints
        .classed("node-hovered", false)
        .classed("node-muted", false)
        .classed("node-selected", false)
        .style("opacity", null);
    linkLines
        .classed("link-hovered", false)
        .classed("link-dimmed", false)
        .style("opacity", null)
        .style("stroke-width", null);
    linkGroups.selectAll(".link-direction").remove();

    applySelectionVisuals(node);
    _internalSelecting = true;
    selectNode(node);
    _internalSelecting = false;

    _panToNode(node, { zoom: true });
};

// ─── Global: pan only (no zoom, no re-select) — used by sidebar links ────────
window.panToNode = function(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    _panToNode(node, { zoom: false });
};