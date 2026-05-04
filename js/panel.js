import { onNodeSelected, links, nodes, selectNode, CEtoAH, selectedNode } from './state.js';
import { whatIfMode, removedNode, onWhatIfModeToggle, onRemovedNodeChange, getDownstreamNodes, toggleWhatIfMode } from './state.js';
import { onLinkSelected, LINK_DESCRIPTIONS } from './state.js';

const sidebar = document.getElementById('sidebar');
const sidebarHeader = document.querySelector('.sidebar-header');
const sidebarContent = document.querySelector('.sidebar-content');

function selectNodeById(id) {
    const node = nodes.find(n => n.id === id);
    if (node) selectNode(node);
}

function formatNodeInfo(node) {
    if (!node) {
        return `
            <div class="panel-card panel-card-empty">
                <div class="panel-card-name">Select a node</div>
                <div class="panel-card-desc">Click any node on the graph to show its information here.</div>
            </div>
        `;
    }

    const getId = val => (typeof val === 'object' && val !== null) ? val.id : val;

    // Find causes: links where target is this node
    const causes = links
        .filter(l => getId(l.target) === node.id)
        .map(l => nodes.find(n => n.id === getId(l.source)))
        .filter(Boolean);

    // Find effects: links where source is this node
    const effects = links
        .filter(l => getId(l.source) === node.id)
        .map(l => nodes.find(n => n.id === getId(l.target)))
        .filter(Boolean);

    const causesHtml = causes.length ? `
        <div class="panel-section">
            <div class="panel-section-label panel-section-label--cause">
                <span class="panel-section-icon">←</span> Led to this
            </div>
            <div class="panel-links">
                ${causes.map(c => `<div class="panel-link panel-link--cause" onclick="selectNodeById('${c.id}'); panToNode('${c.id}')">← ${c.name}</div>`).join('')}
            </div>
        </div>
    ` : '';

    const effectsHtml = effects.length ? `
        <div class="panel-section">
            <div class="panel-section-label panel-section-label--effect">
                <span class="panel-section-icon">→</span> Rippled into
            </div>
            <div class="panel-links">
                ${effects.map(e => `<div class="panel-link panel-link--effect" onclick="selectNodeById('${e.id}'); panToNode('${e.id}')">→ ${e.name}</div>`).join('')}
            </div>
        </div>
    ` : '';

    return `
        <div class="panel-card">
            <div class="panel-card-name">${node.name}</div>
            <div class="panel-card-desc">${node.desc || 'No description available.'}</div>
            <div class="panel-card-time">
                <span><strong>Year: </strong> ${node.year ?? '—'} CE &nbsp/ <span class="ah-time">${CEtoAH(node.year, 1) ?? '—'} AH</span></span>
            </div>
            ${causesHtml}
            ${effectsHtml}
        </div>
    `;
}

function formatWhatIfAnalysis(removed) {
    if (!removed) {
        return `
            <div class="panel-card panel-card-empty">
                <div class="panel-card-name">What If Mode</div>
                <div class="panel-card-desc">Click any node on the graph to simulate its removal from history and see the alternate timeline.</div>
            </div>
        `;
    }

    const downstreamIds = getDownstreamNodes(removed.id);
    const erasedNodes = [removed, ...downstreamIds.map(id => nodes.find(n => n.id === id)).filter(Boolean)];
    const erasedCount = erasedNodes.length;
    const years = erasedNodes.map(n => n.year).filter(Boolean).sort((a, b) => a - b);
    const minYear = years.length ? years[0] : null;
    const maxYear = years.length ? years[years.length - 1] : null;

    const erasedListHtml = erasedNodes.map((n, i) => `
        <div class="erased-item ${i === 0 ? 'erased-root' : ''}">
            <span class="erased-bullet"></span>
            <span class="erased-name">${n.name}</span>
            <span class="erased-year">${n.year ?? '—'} CE</span>
        </div>
    `).join('');

    const timeSpanHtml = (minYear && maxYear) ? `
        <div class="impact-time">
            <span>Timeline affected:</span>
            <strong>${minYear} – ${maxYear} CE</strong>
        </div>
    ` : '';

    return `
        <div class="panel-card what-if-analysis">
            <div class="what-if-header">
                <div class="what-if-label">ALTERNATE TIMELINE</div>
                <div class="what-if-title">What if <em>${removed.name}</em> never happened?</div>
            </div>
            <div class="impact-summary">
                <div class="impact-number">${erasedCount}</div>
                <div class="impact-text">event${erasedCount !== 1 ? 's' : ''} erased from history</div>
            </div>
            ${timeSpanHtml}
            <div class="panel-section">
                <div class="panel-section-label erased-section-label">
                    Erased Events
                </div>
                <div class="erased-list-scroll">
                    <div class="erased-list">
                        ${erasedListHtml}
                    </div>
                </div>
            </div>
            <button class="what-if-reset-btn" onclick="resetWhatIf()">↺ Reset Simulation</button>
        </div>
    `;
}

function renderSidebarPanel(node) {
    if (node) {
        sidebar.classList.add('open')
    }

    sidebarHeader.innerHTML = '<span class="sidebar-title"> N O D E &nbsp I N F O </span>'

    sidebarContent.innerHTML = formatNodeInfo(node)
    sidebarContent.scrollTop = 0;
}

function renderWhatIfPanel(removed) {
    sidebar.classList.add('open');
    sidebarHeader.innerHTML = '<span class="sidebar-title"> W H A T &nbsp I F ? </span>';
    sidebarContent.innerHTML = formatWhatIfAnalysis(removed);
    sidebarContent.scrollTop = 0;
}

renderSidebarPanel(null);
onNodeSelected(renderSidebarPanel);

onWhatIfModeToggle((active) => {
    if (active) {
        renderWhatIfPanel(removedNode);
    } else {
        renderSidebarPanel(selectedNode);
    }
});

onRemovedNodeChange((node) => {
    if (whatIfMode) {
        renderWhatIfPanel(node);
    }
});

function formatLinkInfo(link) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;

    const srcNode = nodes.find(n => n.id === srcId);
    const tgtNode = nodes.find(n => n.id === tgtId);

    const key = `${srcId}->${tgtId}`;
    const desc = LINK_DESCRIPTIONS[key] || null;

    return `
        <div class="panel-card panel-card-link">
            <div class="panel-link-flow">
                <div class="panel-link-node panel-link-node--cause" onclick="selectNodeById('${srcId}'); panToNode('${srcId}')">
                    <span class="panel-link-arrow-label">FROM</span>
                    <span class="panel-link-node-name">${srcNode?.name ?? srcId}</span>
                    <span class="panel-link-node-year">${srcNode?.year ?? '—'} CE</span>
                </div>
                <div class="panel-link-connector">
                    <div class="panel-link-arrowhead">←</div>
                    <div class="panel-link-line"></div>
                    <div class="panel-link-arrowhead">→</div>
                </div>
                <div class="panel-link-node panel-link-node--effect" onclick="selectNodeById('${tgtId}'); panToNode('${tgtId}')">
                    <span class="panel-link-arrow-label">TO</span>
                    <span class="panel-link-node-name">${tgtNode?.name ?? tgtId}</span>
                    <span class="panel-link-node-year">${tgtNode?.year ?? '—'} CE</span>
                </div>
            </div>
            ${desc ? `
            <div class="panel-section">
                <div class="panel-section-label panel-link-desc-label">Connection</div>
                <div class="panel-card-desc">${desc}</div>
            </div>
            ` : `<div class="panel-card-desc" style="opacity:0.5;font-style:italic;">No description available for this connection.</div>`}
        </div>
    `;
}

function renderLinkPanel(link) {
    sidebar.classList.add('open');
    sidebarHeader.innerHTML = '<span class="sidebar-title"> L I N K &nbsp I N F O </span>';
    sidebarContent.innerHTML = formatLinkInfo(link);
    sidebarContent.scrollTop = 0;
}

onLinkSelected((link) => {
    if (!link) {
        // Restore node panel (or empty state)
        renderSidebarPanel(selectedNode);
        return;
    }
    renderSidebarPanel(null); // ensure node panel state is cleared visually
    renderLinkPanel(link);
});

// Make functions global for onclick
window.selectNodeById = selectNodeById;
window.focusNode = focusNode;
window.resetWhatIf = () => {
    toggleWhatIfMode();
};

// ─── Custom themed scrollbar for sidebar content ──────────────────────────────
(function injectScrollbarStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .sidebar-content {
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: rgba(180, 150, 80, 0.45) transparent;
        }
        .sidebar-content::-webkit-scrollbar {
            width: 4px;
        }
        .sidebar-content::-webkit-scrollbar-track {
            background: transparent;
        }
        .sidebar-content::-webkit-scrollbar-thumb {
            background: rgba(180, 150, 80, 0.45);
            border-radius: 2px;
            transition: background 0.2s;
        }
        .sidebar-content::-webkit-scrollbar-thumb:hover {
            background: rgba(208, 180, 100, 0.75);
        }
    `;
    document.head.appendChild(style);
})();

// ─── Dynamic sidebar content height ───────────────────────────────────────────
// Only constrain height (and enable scrolling) when the timeline inner panel is
// actually open — i.e. its content is visible and eating into the viewport.
// When the timeline is closed (only the tab strip is showing), the sidebar
// content reverts to its natural, unconstrained height.
function updateSidebarContentHeight() {
    const tlContainer = document.getElementById('timeline-container');
    const isTimelineOpen = tlContainer && tlContainer.classList.contains('open');

    if (!isTimelineOpen) {
        // Timeline closed — no content obscured, let the sidebar breathe freely
        sidebarContent.style.maxHeight = '';
        return;
    }

    const header = document.querySelector('.sidebar-header');
    const headerH = header ? header.getBoundingClientRect().height : 0;

    // Measure how tall the full timeline panel (tab + inner content) is right now
    const tlPanel = document.getElementById('timeline-panel');
    const tlHeight = tlPanel ? tlPanel.getBoundingClientRect().height : 0;

    // Account for the fixed page header at the top
    const pageHeader = document.querySelector('header.title');
    const pageHeaderH = pageHeader ? pageHeader.getBoundingClientRect().height : 0;

    // Visible sidebar height = viewport − page header − timeline panel − sidebar header
    const available = window.innerHeight - pageHeaderH - tlHeight - headerH;
    sidebarContent.style.maxHeight = `${Math.max(80, available)}px`;
}

function observeTimelineHeight() {
    const tlPanel = document.getElementById('timeline-panel');
    if (!tlPanel) {
        setTimeout(observeTimelineHeight, 100);
        return;
    }

    // Watch the panel resize (open/close transitions change its height)
    const ro = new ResizeObserver(updateSidebarContentHeight);
    ro.observe(tlPanel);

    // Also re-check after every CSS transition on the timeline container
    // (the open/close toggle animates, so we need the settled value)
    const tlContainer = document.getElementById('timeline-container');
    if (tlContainer) {
        tlContainer.addEventListener('transitionend', updateSidebarContentHeight);
    }
}

window.addEventListener('resize', updateSidebarContentHeight);
updateSidebarContentHeight();
observeTimelineHeight();