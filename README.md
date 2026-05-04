# Qadar Chain

An interactive, force-directed knowledge graph that maps the causal chain of Islamic history from the Prophetic Era through the height of the Ottoman Empire. Click any event, trace its causes and consequences, and explore how history is connected.

---

## Features

### 🕸️ Node Graph
An SVG force-simulation graph (powered by D3.js) where each node represents a historical event and each directed edge represents causation. Nodes are colour-coded by era and glow with radial gradients. The graph supports zoom, pan, hover highlighting, and selection clicking a node dims unrelated nodes and animates the causal flow along connected links.

### ❓ What If? Mode
Toggle "What If?" mode and click any node to simulate its removal from history. The panel calculates all downstream events that would have been erased via a DFS traversal, displays the count and year range of affected events, and greys out those nodes on the graph with a red cross on the root.

### 📅 Timeline
A collapsible timeline panel at the bottom of the screen spanning 560–1600 CE. It shows all events as coloured dots on a scrubable track with era-band backgrounds. You can:
- **Drag the top zone** to set the "present year". events after that year fade from the graph
- **Scroll** to zoom in/out on the time axis
- **Drag the bottom zone** to pan left/right
- **Play** an animated sweep through time using the play button and adjustable speed (1×–20×)
- **Toggle CE/AH** to switch between Common Era and Hijri year labels

### 🔍 Search
A fuzzy/substring search bar in the header. Results rank by name match quality and show each event's era colour dot and year. Keyboard navigation (↑ ↓ Enter Esc) and click are supported. Selecting a result focuses and highlights that node on the graph.

### 🏷️ Era Filter
A pill-bar filter fixed above the timeline lets you show/hide events by era. Each era has a distinct colour. "ALL ERAS" toggles everything at once.

### 📋 Info Panel (Sidebar)
A collapsible left sidebar shows the selected node's name, description, CE/AH year, and two link sections, **Led to this** (causes) and **Rippled into** (effects), each clickable to navigate to that node. In What If? mode the panel switches to the alternate timeline analysis view.

### ✨ Particles
Ambient floating square particles in the background for atmosphere, rendered via tsParticles.

---

## Project Structure

```
/
├── index.html
├── css/
│   ├── base.css          # Layout, body, header, global resets
│   ├── sidebar.css       # Sidebar panel & What If analysis styles
│   ├── graph.css         # SVG graph, node/link states, What If visuals
│   ├── era.css           # Era filter bar styles
│   ├── timeline.css      # Timeline panel styles
│   └── search.css        # Search bar and dropdown styles
├── js/
│   ├── state.js          # Central state: nodes, links, eras, events, filters
│   ├── node-graph.js     # D3 force simulation, rendering, interaction
│   ├── panel.js          # Sidebar content rendering
│   ├── timeline.js       # Timeline panel logic and scrubbing
│   ├── era-filter.js     # Era filter checkbox UI
│   ├── search.js         # Search input, scoring, and result rendering
│   ├── sidebar.js        # Sidebar open/close toggle
│   ├── quiz.js           # (Reserved for future quiz feature)
│   └── particles.js      # tsParticles background configuration
└── data/
    ├── nodes.json         # Historical event nodes (id, name, desc, year)
    ├── links.json         # Causal directed edges between nodes
    ├── eras.json          # Era definitions (id, label, color, year range, node list)
    └── era-bridge-links.json  # Cross-era links rendered with dashed strokes
```

---

## Data Format

### `nodes.json`
```json
[
  { "id": "battle_badr", "name": "Battle of Badr", "desc": "...", "year": 624 }
]
```

### `links.json`
```json
[
  { "source": "hijra_madinah", "target": "battle_badr" }
]
```
All links are directed: `source` caused or led to `target`.

### `eras.json`
```json
[
  {
    "id": "rashidun",
    "label": "Rashidun Caliphate",
    "shortLabel": "Rashidun",
    "color": "rgb(100, 210, 180)",
    "years": [632, 661],
    "nodes": ["abu_bakr_caliphate", "ridda_wars", ...]
  }
]
```

### `era-bridge-links.json`
Same shape as `links.json` entries, with an extra `"bridge": true` flag. These are rendered as dashed lines to indicate cross-era connections.

---

## Dependencies

All loaded via CDN — no build step required.

| Library | Version | Purpose |
|---|---|---|
| [D3.js](https://d3js.org/) | v7 | Force simulation and SVG graph |
| [tsParticles](https://particles.js.org/) | v2 | Background particle effect |
| [Cinzel](https://fonts.google.com/specimen/Cinzel) | — | Display / heading typeface |
| [Roboto](https://fonts.google.com/specimen/Roboto) | — | Body / UI typeface |

---

## Getting Started

Because the JS modules use `import … with { type: "json" }` syntax to load data files, the project must be served over HTTP rather than opened directly as a local file.

```bash
# Python (any machine with Python 3)
python3 -m http.server 8080

# Node.js
npx serve .
```

Then open `http://localhost:8080` in your browser.

---

## Customisation

All simulation physics are exposed as named constants at the top of `state.js`:

```js
export let forceLinkDistance    = 90;   // resting length of edges
export let forceLinkStrength    = 0.5;  // spring stiffness
export let forceRepulsionStrength = -420; // node repulsion
export let forceCollisionRadius = 38;   // minimum node separation
export let nodeRadius           = 10;
export let maxLen               = 12;   // label truncation length
```

To add new historical events, add an entry to `nodes.json`, wire it into `links.json`, and include its `id` in the appropriate era's `nodes` array in `eras.json`.

---

## Eras Covered

| Era | Period (CE) | Colour |
|---|---|---|
| Prophetic Era | 570 – 632 | Gold |
| Rashidun Caliphate | 632 – 661 | Teal |
| Umayyad Caliphate | 661 – 750 | Violet |
| Abbasid Golden Age | 750 – 1258 | Blue |
| Al-Andalus | 756 – 1492 | Orange |
| Crusades & Counter | 1095 – 1291 | Rose |
| West African Islam | 1000 – 1500 | Amber |
| Islamic India | 711 – 1600 | Pink |
| Ottoman Empire | 1299 – 1600 | Red |
