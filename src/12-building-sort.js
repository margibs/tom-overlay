// --- Building Sort (Construct Building modal) ---

let bldCurrentSort = "default";
let bldCurrentSearch = "";

function parseBldCosts(card) {
  const costs = {};
  const costItems = card.querySelectorAll(".cost-item");
  costItems.forEach((item) => {
    const match = item.textContent.trim().match(/^(.+?):\s*(\d+)/);
    if (match) {
      costs[match[1].toLowerCase().trim()] = parseInt(match[2], 10);
    }
  });
  // Fallback: parse full .costs text if no .cost-item spans found
  if (Object.keys(costs).length === 0) {
    const costsEl = card.querySelector(".costs");
    if (costsEl) {
      const pairs = costsEl.textContent.split("\u2022"); // bullet •
      pairs.forEach((pair) => {
        const match = pair.trim().match(/^(.+?):\s*(\d+)/);
        if (match) {
          costs[match[1].toLowerCase().trim()] = parseInt(match[2], 10);
        }
      });
    }
  }
  return costs;
}

function getBldName(card) {
  const h3 = card.querySelector("h3");
  return h3 ? h3.textContent.trim().toLowerCase() : "";
}

function getBldDesc(card) {
  const desc = card.querySelector(".description");
  return desc ? desc.textContent.trim().toLowerCase() : "";
}

function buildBldToolbar(grid) {
  const toolbar = document.createElement("div");
  toolbar.className = "tom-bld-toolbar";

  // Search input
  const search = document.createElement("input");
  search.type = "text";
  search.className = "tom-bld-search";
  search.placeholder = "Search buildings\u2026";
  search.value = bldCurrentSearch;
  search.addEventListener("input", () => {
    bldCurrentSearch = search.value;
    applyBldFilters(grid);
  });
  toolbar.appendChild(search);

  // Sort buttons
  const sortRow = document.createElement("div");
  sortRow.className = "tom-bld-sort-row";

  const modes = [
    { key: "default", label: "Default" },
    { key: "name-asc", label: "A\u2192Z" },
    { key: "name-desc", label: "Z\u2192A" },
    { key: "builders-asc", label: "Builders \u2191" },
    { key: "builders-desc", label: "Builders \u2193" },
    { key: "food-asc", label: "Food \u2191" },
    { key: "food-desc", label: "Food \u2193" },
  ];

  modes.forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.className =
      "tom-bld-sort-btn" + (key === bldCurrentSort ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      sortRow
        .querySelectorAll(".tom-bld-sort-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bldCurrentSort = key;
      applyBldFilters(grid);
    });
    sortRow.appendChild(btn);
  });

  toolbar.appendChild(sortRow);
  return toolbar;
}

function applyBldFilters(grid) {
  const query = bldCurrentSearch.toLowerCase();

  // Remove existing no-results message
  const existing = grid.querySelector(".tom-bld-no-results");
  if (existing) existing.remove();

  const cards = [...grid.querySelectorAll(".building-option")];

  // Filter
  const visible = [];
  const hidden = [];
  cards.forEach((card) => {
    const name = getBldName(card);
    const desc = getBldDesc(card);
    if (query && !name.includes(query) && !desc.includes(query)) {
      hidden.push(card);
    } else {
      visible.push(card);
    }
  });

  // Sort visible cards
  visible.sort((a, b) => {
    const costsA = a._tomCosts || {};
    const costsB = b._tomCosts || {};
    switch (bldCurrentSort) {
      case "name-asc":
        return getBldName(a).localeCompare(getBldName(b));
      case "name-desc":
        return getBldName(b).localeCompare(getBldName(a));
      case "builders-asc":
        return (costsA.builders || 0) - (costsB.builders || 0);
      case "builders-desc":
        return (costsB.builders || 0) - (costsA.builders || 0);
      case "food-asc":
        return (costsA.food || 0) - (costsB.food || 0);
      case "food-desc":
        return (costsB.food || 0) - (costsA.food || 0);
      default:
        return (
          parseInt(a.dataset.tomOrigIdx, 10) -
          parseInt(b.dataset.tomOrigIdx, 10)
        );
    }
  });

  // Re-append in order: visible sorted, then hidden
  visible.forEach((card) => {
    card.classList.remove("tom-bld-hidden");
    grid.appendChild(card);
  });
  hidden.forEach((card) => {
    card.classList.add("tom-bld-hidden");
    grid.appendChild(card);
  });

  // Show no-results message if needed
  if (visible.length === 0 && hidden.length > 0) {
    const msg = document.createElement("div");
    msg.className = "tom-bld-no-results";
    msg.textContent = "No matching buildings";
    grid.appendChild(msg);
  }
}

function handleConstructModal(modal) {
  const body = modal.querySelector(".modal-body");
  const grid = modal.querySelector(".building-list");
  if (!body || !grid) return;

  // Already injected?
  if (modal.querySelector(".tom-bld-toolbar")) return;

  // Stamp original order and parse costs
  const cards = grid.querySelectorAll(".building-option");
  cards.forEach((card, i) => {
    card.dataset.tomOrigIdx = i;
    card._tomCosts = parseBldCosts(card);
  });

  // Inject toolbar
  const toolbar = buildBldToolbar(grid);
  body.insertBefore(toolbar, body.firstChild);

  // Re-apply last state
  if (bldCurrentSort !== "default" || bldCurrentSearch) {
    applyBldFilters(grid);
  }

  // Watch for React re-renders
  const gridObserver = new MutationObserver(() => {
    const freshCards = grid.querySelectorAll(".building-option");
    let needsReapply = false;
    freshCards.forEach((card, i) => {
      if (!card.dataset.tomOrigIdx) {
        card.dataset.tomOrigIdx = i;
        card._tomCosts = parseBldCosts(card);
        needsReapply = true;
      }
    });
    if (needsReapply && (bldCurrentSort !== "default" || bldCurrentSearch)) {
      applyBldFilters(grid);
    }
  });
  gridObserver.observe(grid, { childList: true, subtree: true });
}

function initBuildingSort() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.classList?.contains("modal-overlay")
          ? node
          : node.querySelector?.(".modal-overlay");
        if (!modal) continue;
        const h2 = modal.querySelector("h2");
        if (h2 && h2.textContent.trim().startsWith("Construct Building")) {
          setTimeout(() => handleConstructModal(modal), 50);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
