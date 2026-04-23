import { link, node, reRender } from "./state.js"

const settingsContainer = document.getElementById("settings");

function setnodeColour(colour) {
    node.colour = colour
    reRender()
}

function setLinkColour(colour) {
    link.colour = colour
    reRender()
}

// Convert "rgb(r, g, b)" to "#rrggbb" hex
function rgbToHex(rgb) {
    const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return rgb;
    return "#" + [match[1], match[2], match[3]]
        .map(n => parseInt(n).toString(16).padStart(2, "0"))
        .join("");
}

// Convert "#rrggbb" to "rgb(r, g, b)"
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
}

let isOpen = false;

settingsContainer.innerHTML = `
    <button id="settings-toggle" title="Settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
    </button>

    <div id="settings-panel" class="settings-panel">
        <div class="settings-header">
            <span class="settings-title">SETTINGS</span>
            <button id="settings-close">✕</button>
        </div>

        <div class="settings-section">
            <div class="settings-section-label">APPEARANCE</div>

            <div class="settings-row">
                <label class="settings-label">Node Color</label>
                <div class="color-input-wrapper">
                    <input type="color" id="node-color-picker" value="${rgbToHex(node.colour)}" />
                    <div class="color-preview" id="node-color-preview" style="background:${node.colour}"></div>
                </div>
            </div>

            <div class="settings-row">
                <label class="settings-label">Link Color</label>
                <div class="color-input-wrapper">
                    <input type="color" id="link-color-picker" value="${rgbToHex(link.colour)}" />
                    <div class="color-preview" id="link-color-preview" style="background:${link.colour}"></div>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <div class="settings-section-label">PRESETS</div>
            <div class="preset-grid">
                <button class="preset-btn" data-node="rgb(255,255,255)" data-link="rgb(255,255,255)" style="--c1:#fff;--c2:#fff" title="Default"></button>
                <button class="preset-btn" data-node="rgb(56,182,255)" data-link="rgb(56,182,255)" style="--c1:#38b6ff;--c2:#38b6ff" title="Ocean"></button>
                <button class="preset-btn" data-node="rgb(255,100,100)" data-link="rgb(255,60,60)" style="--c1:#ff6464;--c2:#ff3c3c" title="Fire"></button>
                <button class="preset-btn" data-node="rgb(100,255,160)" data-link="rgb(60,200,120)" style="--c1:#64ffa0;--c2:#3cc878" title="Forest"></button>
                <button class="preset-btn" data-node="rgb(200,130,255)" data-link="rgb(160,80,255)" style="--c1:#c882ff;--c2:#a050ff" title="Violet"></button>
                <button class="preset-btn" data-node="rgb(255,210,60)" data-link="rgb(255,170,30)" style="--c1:#ffd23c;--c2:#ffaa1e" title="Gold"></button>
            </div>
        </div>
    </div>
`;

const toggle = document.getElementById("settings-toggle");
const panel = document.getElementById("settings-panel");
const closeBtn = document.getElementById("settings-close");
const nodeColorPicker = document.getElementById("node-color-picker");
const linkColorPicker = document.getElementById("link-color-picker");
const nodePreview = document.getElementById("node-color-preview");
const linkPreview = document.getElementById("link-color-preview");

function openPanel() {
    isOpen = true;
    panel.classList.add("open");
    toggle.classList.add("active");
}

function closePanel() {
    isOpen = false;
    panel.classList.remove("open");
    toggle.classList.remove("active");
}

toggle.addEventListener("click", () => isOpen ? closePanel() : openPanel());
closeBtn.addEventListener("click", closePanel);

nodeColorPicker.addEventListener("input", (e) => {
    const rgb = hexToRgb(e.target.value);
    nodePreview.style.background = rgb;
    setnodeColour(rgb);
});

linkColorPicker.addEventListener("input", (e) => {
    const rgb = hexToRgb(e.target.value);
    linkPreview.style.background = rgb;
    setLinkColour(rgb);
});

document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const nodeRgb = btn.dataset.node;
        const linkRgb = btn.dataset.link;

        setnodeColour(nodeRgb);
        setLinkColour(linkRgb);

        nodeColorPicker.value = rgbToHex(nodeRgb);
        linkColorPicker.value = rgbToHex(linkRgb);
        nodePreview.style.background = nodeRgb;
        linkPreview.style.background = linkRgb;
    });
});
