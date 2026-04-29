import { ERAS, activeEras, notifyChange } from "./state.js";

// Build the UI
const container = document.getElementById("era-filter");

const titleEl = document.createElement("div");
titleEl.className = "era-filter-title";
titleEl.textContent = "Filter by Era";
container.appendChild(titleEl);

const bar = document.createElement("div");
bar.className = "era-filter-bar";
container.appendChild(bar);

// Select All button
const selectAllBtn = document.createElement("button");
selectAllBtn.className = "era-select-all all-checked";
selectAllBtn.innerHTML = `<span style="font-size:0.9rem">⛓</span> ALL ERAS`;
bar.appendChild(selectAllBtn);

// Divider
const divider = document.createElement("div");
divider.className = "era-divider";
bar.appendChild(divider);

// Era checkboxes
const labelEls = {};

ERAS.forEach((era, i) => {
    const label = document.createElement("label");
    label.className = "era-checkbox-label checked";
    label.title = `${era.label} (${era.years[0]}–${era.years[1]} CE)`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.eraId = era.id;

    const dot = document.createElement("span");
    dot.className = "era-dot";
    dot.style.background = era.color;
    dot.style.boxShadow = `0 0 6px ${era.color}`;

    const text = document.createElement("span");
    text.textContent = era.shortLabel;

    label.appendChild(checkbox);
    label.appendChild(dot);
    label.appendChild(text);
    bar.appendChild(label);
    labelEls[era.id] = { label, checkbox };

    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            activeEras.add(era.id);
            label.classList.add("checked");
        } else {
            activeEras.delete(era.id);
            label.classList.remove("checked");
        }
        updateSelectAllBtn();
        notifyChange();
    });
});

function updateSelectAllBtn() {
    const allActive = activeEras.size === ERAS.length;
    if (allActive) {
        selectAllBtn.classList.add("all-checked");
        selectAllBtn.innerHTML = `<span style="font-size:0.9rem">⛓</span> ALL ERAS`;
    } else {
        selectAllBtn.classList.remove("all-checked");
        selectAllBtn.innerHTML = `<span style="font-size:0.9rem">○</span> SELECT ALL`;
    }
}

selectAllBtn.addEventListener("click", () => {
    const allActive = activeEras.size === ERAS.length;
    if (allActive) {
        // Deselect all
        activeEras.clear();
        Object.values(labelEls).forEach(({ label, checkbox }) => {
            checkbox.checked = false;
            label.classList.remove("checked");
        });
    } else {
        // Select all
        ERAS.forEach(era => activeEras.add(era.id));
        Object.values(labelEls).forEach(({ label, checkbox }) => {
            checkbox.checked = true;
            label.classList.add("checked");
        });
    }
    updateSelectAllBtn();
    notifyChange();
});
