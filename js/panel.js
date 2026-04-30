import { onNodeSelected, links, nodes, selectNode, CEtoAH, selectedNode } from './state.js';
import { whatIfMode, removedNode, onWhatIfModeToggle, onRemovedNodeChange, getDownstreamNodes, toggleWhatIfMode } from './state.js';

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

    // Find causes: links where target is this node
    const causes = links
        .filter(l => l.target === node.id)
        .map(l => nodes.find(n => n.id === l.source))
        .filter(Boolean);

    // Find effects: links where source is this node
    const effects = links
        .filter(l => l.source === node.id)
        .map(l => nodes.find(n => n.id === l.target))
        .filter(Boolean);

    const causesHtml = causes.length ? `
        <div class="panel-section">
            <div class="panel-section-label">Led to this</div>
            <div class="panel-links">
                ${causes.map(c => `<div class="panel-link" onclick="selectNodeById('${c.id}')">← ${c.name}</div>`).join('')}
            </div>
        </div>
    ` : '';

    const effectsHtml = effects.length ? `
        <div class="panel-section">
            <div class="panel-section-label">Rippled into</div>
            <div class="panel-links">
                ${effects.map(e => `<div class="panel-link" onclick="selectNodeById('${e.id}')">→ ${e.name}</div>`).join('')}
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
                    <span class="erased-count-badge">${erasedCount}</span>
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

// Make functions global for onclick
window.selectNodeById = selectNodeById;
window.resetWhatIf = () => {
    toggleWhatIfMode();
};