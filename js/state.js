import NODES from "../data/nodes.json" with { type: "json" };
import LINKS from "../data/links.json" with { type: "json" };

export const nodes = NODES.map(x => ({ ...x }));
export const links = LINKS.map(x => ({ ...x }));

export let linkColour = "rgb(255, 255, 255)",
        linkThickness = 1,
        nodeColour = "rgb(255, 255, 255)",
        nodeRadius = 10,
        maxLen = 12,                                 //maximum length of node names before truncation. Adjust as needed.
        forceLinkDistance = 90,
        forceLinkStrength = 0.5,
        forceRepulsionStrength = -380,
        forceCollisionRadius = 38,
        glowControl = {reg: [0.2, 0.4, 0.9],         //controls the gradient stops for the glow effect.
                       sel: [0.3, 0.6, 0.95]         //The first value controls where most opaque part of glow is.
                    }                                //The second value controls where the half-transparent part of the glow is.
                                                     //The third value controls where the fully transparent part of the glow is.


export let selectedNode = null;
const onNodeSelectedCallbacks = [];
const onSettingChangedCallbacks = [];

export function selectNode(node) {
    selectedNode = node;
    onNodeSelectedCallbacks.forEach(func => func(node));
}

export function onNodeSelected(func) {
    onNodeSelectedCallbacks.push(func);
}

export function onSettingChanged(func) {
    onSettingChangedCallbacks.push(func);
}

export function setNodeColour(colour) {
    nodeColour = colour;
    onSettingChangedCallbacks.forEach(func => func({ type: "nodeColour", value: colour }));
}

export function setLinkColour(colour) {
    linkColour = colour;
    onSettingChangedCallbacks.forEach(func => func({ type: "linkColour", value: colour }));
}
