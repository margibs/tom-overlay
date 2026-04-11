// --- Crafter Sort (Crafter building sidebar panel) ---

let cftCurrentSort = "default";
let cftCurrentSearch = "";

// Reverse lookup: display name → slug (reuses ITEM_NAMES from 11-inventory-sort.js)
function buildReverseLookup() {
  const map = {};
  for (const [slug, display] of Object.entries(ITEM_NAMES)) {
    map[display.toLowerCase()] = slug;
  }
  return map;
}
const ITEM_SLUG_BY_NAME = buildReverseLookup();

function getCraftItemSlug(card) {
  const h3 = card.querySelector("h3");
  if (!h3) return "";
  // "Craft Leather (3x)" → "Leather"
  let name = h3.textContent.trim();
  name = name.replace(/^Craft\s+/i, "").replace(/\s*\(\d+x\)\s*$/, "").trim();
  const slug = ITEM_SLUG_BY_NAME[name.toLowerCase()];
  if (slug) return slug;
  return name.toLowerCase().replace(/\s+/g, "_");
}

function getCraftName(card) {
  const h3 = card.querySelector("h3");
  return h3 ? h3.textContent.trim().toLowerCase() : "";
}

function getCraftTimeSecs(card) {
  const costDivs = card.querySelectorAll(".costs");
  for (const d of costDivs) {
    const text = d.textContent;
    if (/time/i.test(text)) {
      let secs = 0;
      const m = text.match(/(\d+)m/);
      if (m) secs += parseInt(m[1], 10) * 60;
      const s = text.match(/(\d+)s/);
      if (s) secs += parseInt(s[1], 10);
      return secs;
    }
  }
  return 0;
}

function getCraftMaxQty(card) {
  // qty row is the 4th child; max qty span is inside first div
  const qtyRow = card.children[3];
  if (!qtyRow) return 0;
  const span = qtyRow.querySelector("span");
  return span ? parseInt(span.textContent.replace(/[\s,]/g, ""), 10) || 0 : 0;
}

const _cftSortRef = { get value() { return cftCurrentSort; }, set value(v) { cftCurrentSort = v; } };

function buildCftToolbar(grid) {
  const toolbar = document.createElement("div");
  toolbar.className = "tom-cft-toolbar";

  // Search input
  const search = document.createElement("input");
  search.type = "text";
  search.className = "tom-search-input tom-cft-search";
  search.placeholder = "Search crafts\u2026";
  search.value = cftCurrentSearch;
  search.addEventListener("input", () => {
    cftCurrentSearch = search.value;
    applyCftFilters(grid);
  });
  toolbar.appendChild(search);

  // Sort buttons
  const sortRow = document.createElement("div");
  sortRow.className = "tom-cft-sort-row";

  const modes = [
    { key: "default", label: "Default" },
    { key: "name", label: "Name", asc: "name-asc", desc: "name-desc" },
    { key: "time", label: "Time", asc: "time-asc", desc: "time-desc" },
    { key: "cancraft", label: "Can Craft", asc: "cancraft-asc", desc: "cancraft-desc" },
    { key: "category", label: "Category" },
  ];

  buildToggleSortButtons(sortRow, modes, _cftSortRef, () => applyCftFilters(grid), "tom-cft-sort-btn");

  toolbar.appendChild(sortRow);
  return toolbar;
}

function applyCftFilters(grid) {
  const query = cftCurrentSearch.toLowerCase();

  // Remove existing dividers and no-results
  grid.querySelectorAll(".tom-cft-cat-divider").forEach((el) => el.remove());
  const existing = grid.querySelector(".tom-cft-no-results");
  if (existing) existing.remove();

  const cards = [...grid.querySelectorAll(".building-option")];

  // Filter
  const visible = [];
  const hidden = [];
  cards.forEach((card) => {
    const name = getCraftName(card);
    if (query && !name.includes(query)) {
      hidden.push(card);
    } else {
      visible.push(card);
    }
  });

  // Pre-cache sort values to avoid repeated DOM queries in comparator
  const sortCache = new Map();
  visible.forEach((card) => {
    sortCache.set(card, {
      name: getCraftName(card),
      time: getCraftTimeSecs(card),
      qty: getCraftMaxQty(card),
      slug: getCraftItemSlug(card),
      idx: parseInt(card.dataset.tomOrigIdx, 10),
    });
  });

  // Sort
  visible.sort((a, b) => {
    const ca = sortCache.get(a), cb = sortCache.get(b);
    switch (cftCurrentSort) {
      case "name-asc":
        return ca.name.localeCompare(cb.name);
      case "name-desc":
        return cb.name.localeCompare(ca.name);
      case "time-asc":
        return ca.time - cb.time;
      case "time-desc":
        return cb.time - ca.time;
      case "cancraft-asc":
        return ca.qty - cb.qty;
      case "cancraft-desc":
        return cb.qty - ca.qty;
      case "category": {
        const catA = ITEM_CATEGORY[ca.slug] || { order: 99 };
        const catB = ITEM_CATEGORY[cb.slug] || { order: 99 };
        if (catA.order !== catB.order) return catA.order - catB.order;
        return ca.idx - cb.idx;
      }
      default:
        return ca.idx - cb.idx;
    }
  });

  // Re-append with category dividers if needed
  visible.forEach((card) => card.classList.remove("tom-cft-hidden"));
  if (cftCurrentSort === "category") {
    insertCategoryDividers(grid, visible, (card) => ITEM_CATEGORY[sortCache.get(card)?.slug || getCraftItemSlug(card)] || { group: "Other", order: 99 }, "tom-cft-cat-divider");
  } else {
    visible.forEach((card) => grid.appendChild(card));
  }

  hidden.forEach((card) => {
    card.classList.add("tom-cft-hidden");
    grid.appendChild(card);
  });

  if (visible.length === 0 && hidden.length > 0) {
    const msg = document.createElement("div");
    msg.className = "tom-cft-no-results";
    msg.textContent = "No matching crafts";
    grid.appendChild(msg);
  }
}

function handleCrafterPanel(panel) {
  const grid = panel.querySelector(".building-list");
  if (!grid) return;

  // Already injected?
  if (panel.querySelector(".tom-cft-toolbar")) return;

  // Stamp original order
  const cards = grid.querySelectorAll(".building-option");
  cards.forEach((card, i) => {
    card.dataset.tomOrigIdx = i;
  });

  // Inject toolbar before the building-list
  const toolbar = buildCftToolbar(grid);
  grid.parentElement.insertBefore(toolbar, grid);

  // Re-apply last state
  if (cftCurrentSort !== "default" || cftCurrentSearch) {
    applyCftFilters(grid);
  }

  // Watch for React re-renders
  setupGridObserver(grid, ".building-option", () => {
    if (cftCurrentSort !== "default" || cftCurrentSearch) applyCftFilters(grid);
  });
}

function initCrafterSort() {
  setupModalDetector("right-sidebar", (title) => /^crafter/i.test(title), handleCrafterPanel);
}
