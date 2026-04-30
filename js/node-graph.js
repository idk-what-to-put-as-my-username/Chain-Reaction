import { nodes, links } from "./state.js"
import { selectNode, selectedNode, onNodeSelected } from "./state.js"
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
svg.call(d3.zoom()
    .scaleExtent([0.3, 2.5])
    .on("zoom", (e) => { mainGroup.attr("transform", e.transform); }))

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

// Gradients for What If mode
createGradient("erasedGlow", "rgb(255, 60, 60)", glowControl.reg);
createGradient("affectedGlow", "rgb(255, 160, 40)", glowControl.reg);

function applyWhatIfVisuals(removedId) {
    if (!removedId) {
        clearWhatIfVisuals();
        return;
    }
    const downstream = new Set(getDownstreamNodes(removedId));
    const deadIds = new Set([removedId, ...downstream]);

    // Clear any inline opacity styles from normal selection
    nodePoints.style("opacity", null);
    linkLines.style("opacity", null).style("stroke-width", null);
    linkGroups.selectAll(".link-direction").remove();

    // Remove any existing what-if rings
    mainGroup.selectAll(".whatif-ring").remove();

    nodePoints.each(function(n) {
        const g = d3.select(this);
        const isDead = deadIds.has(n.id);
        const isRoot = n.id === removedId;

        g.classed("node-erased", isRoot)
         .classed("node-affected", !isRoot && downstream.has(n.id))
         .classed("node-surviving", false); // all nodes stay normally visible
    });

    // Grey out dead links
    linkLines.each(function(l) {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        const isDead = deadIds.has(srcId) || deadIds.has(tgtId);
        d3.select(this).classed("link-erased", isDead);
    });
}



function clearWhatIfVisuals() {
    mainGroup.selectAll(".whatif-ring").remove();
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
        if (selectedNode || whatIfMode) return;
        d3.select(this.parentNode).select(".link-line")
            .classed("link-hovered", true)
            .attr("stroke", highlight.colour);
    })
    .on("mouseleave", function(e, l) {
        if (selectedNode || whatIfMode) return;
        d3.select(this.parentNode).select(".link-line")
            .classed("link-hovered", false)
            .attr("stroke", getLinkColor(l));
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

function getNodeId(d) {
  return typeof d === 'object' ? d.id : d;
}

function applyEraFilter() {
  const allActive = areAllErasActive();
  const visibleNodes = nodes.filter(n => isNodeVisible(n.id) && isNodeBeforePresent(n.id));
  const visibleLinks = links.filter(l => {
    const srcId = getNodeId(l.source);
    const tgtId = getNodeId(l.target);
    return isNodeVisible(srcId) && isNodeVisible(tgtId)
        && isNodeBeforePresent(srcId) && isNodeBeforePresent(tgtId);
  });

  // Update simulation data - exclude hidden from physics
  simulation.nodes(visibleNodes);
  simulation.force("link").links(visibleLinks);
  simulation.alpha(0.3).restart();

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
applyEraFilter();

// ─── Click on SVG background to deselect ───
svg.on("click", function(e) {
    if (whatIfMode) return;
    if (!selectedNode) return;
    // Only deselect if the click target is the SVG or main group background, not a node
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
        .style("stroke-width", null);
    linkGroups.selectAll(".link-direction").remove();
    _internalSelecting = true;
    selectNode(null);
    _internalSelecting = false;
    applyEraFilter();
}

function applySelectionVisuals(node) {
    const distMap = bfsDistances(node.id);
    const maxDist = Math.max(...distMap.values());

    nodePoints.style("opacity", n => {
        if (!isNodeVisible(n.id) || !isNodeBeforePresent(n.id)) return 0;
        if (n.id === node.id) return 1;
        const nd = distMap.get(n.id) ?? (maxDist + 1);
        return Math.max(0.15, 1 - nd * 0.28);
    });

    linkLines
        .style("opacity", l => {
            const ld = getLinkDistance(l, distMap);
            if (ld === Infinity) return 0.05;
            return Math.max(0.08, 1 - ld * 0.3);
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
        if (selectedNode || whatIfMode) return;
        if (!isNodeVisible(d.id)) return;
        const nodeGroup = d3.select(this.parentNode);
        nodeGroup.classed("node-hovered", true);
        nodePoints.filter(n => n.id !== d.id && isNodeVisible(n.id)).classed("node-muted", true);
    })
    .on("mouseleave", function(e, d) {
        if (selectedNode || whatIfMode) return;
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
            .style("stroke-width", null);
        linkGroups.selectAll(".link-direction").remove();

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