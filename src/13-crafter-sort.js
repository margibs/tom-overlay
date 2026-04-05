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

function buildCftToolbar(grid) {
  const toolbar = document.createElement("div");
  toolbar.className = "tom-cft-toolbar";

  // Search input
  const search = document.createElement("input");
  search.type = "text";
  search.className = "tom-cft-search";
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

  modes.forEach((mode) => {
    const btn = document.createElement("button");
    const isToggle = mode.asc && mode.desc;
    const currentDir = isToggle && cftCurrentSort === mode.desc ? "desc"
      : isToggle && cftCurrentSort === mode.asc ? "asc" : null;
    btn.className =
      "tom-cft-sort-btn" +
      (currentDir || cftCurrentSort === mode.key ? " active" : "");
    if (isToggle) {
      btn.textContent = mode.label + " " + (currentDir === "asc" ? "\u2191" : "\u2193");
    } else {
      btn.textContent = mode.label;
    }
    btn.addEventListener("click", () => {
      sortRow
        .querySelectorAll(".tom-cft-sort-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (isToggle) {
        const wasDir = cftCurrentSort === mode.desc ? "desc"
          : cftCurrentSort === mode.asc ? "asc" : null;
        const newDir = wasDir === "desc" ? "asc" : "desc";
        cftCurrentSort = newDir === "desc" ? mode.desc : mode.asc;
        btn.textContent = mode.label + " " + (newDir === "asc" ? "\u2191" : "\u2193");
      } else {
        cftCurrentSort = mode.key;
      }
      applyCftFilters(grid);
    });
    sortRow.appendChild(btn);
  });

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

  // Sort
  visible.sort((a, b) => {
    switch (cftCurrentSort) {
      case "name-asc":
        return getCraftName(a).localeCompare(getCraftName(b));
      case "name-desc":
        return getCraftName(b).localeCompare(getCraftName(a));
      case "time-asc":
        return getCraftTimeSecs(a) - getCraftTimeSecs(b);
      case "time-desc":
        return getCraftTimeSecs(b) - getCraftTimeSecs(a);
      case "cancraft-asc":
        return getCraftMaxQty(a) - getCraftMaxQty(b);
      case "cancraft-desc":
        return getCraftMaxQty(b) - getCraftMaxQty(a);
      case "category": {
        const catA = ITEM_CATEGORY[getCraftItemSlug(a)] || { order: 99 };
        const catB = ITEM_CATEGORY[getCraftItemSlug(b)] || { order: 99 };
        if (catA.order !== catB.order) return catA.order - catB.order;
        return parseInt(a.dataset.tomOrigIdx, 10) - parseInt(b.dataset.tomOrigIdx, 10);
      }
      default:
        return (
          parseInt(a.dataset.tomOrigIdx, 10) -
          parseInt(b.dataset.tomOrigIdx, 10)
        );
    }
  });

  // Re-append with category dividers if needed
  if (cftCurrentSort === "category") {
    let lastGroup = null;
    visible.forEach((card) => {
      card.classList.remove("tom-cft-hidden");
      const cat = ITEM_CATEGORY[getCraftItemSlug(card)] || { group: "Other", order: 99 };
      if (cat.group !== lastGroup) {
        const divider = document.createElement("div");
        divider.className = "tom-cft-cat-divider";
        divider.textContent = cat.group;
        grid.appendChild(divider);
        lastGroup = cat.group;
      }
      grid.appendChild(card);
    });
  } else {
    visible.forEach((card) => {
      card.classList.remove("tom-cft-hidden");
      grid.appendChild(card);
    });
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
  const gridObserver = new MutationObserver(() => {
    const freshCards = grid.querySelectorAll(".building-option");
    let needsReapply = false;
    freshCards.forEach((card, i) => {
      if (!card.dataset.tomOrigIdx) {
        card.dataset.tomOrigIdx = i;
        needsReapply = true;
      }
    });
    if (needsReapply && (cftCurrentSort !== "default" || cftCurrentSearch)) {
      applyCftFilters(grid);
    }
  });
  gridObserver.observe(grid, { childList: true, subtree: true });
}

function initCrafterSort() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const panel = node.classList?.contains("right-sidebar")
          ? node
          : node.querySelector?.(".right-sidebar");
        if (!panel) continue;
        const h2 = panel.querySelector("h2");
        if (h2 && /^crafter/i.test(h2.textContent.trim())) {
          setTimeout(() => handleCrafterPanel(panel), 50);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
