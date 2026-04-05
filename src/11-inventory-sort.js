// --- Inventory Sort (Town Items modal) ---

const ITEM_NAMES = {
  food: "Food",
  wood: "Wood",
  mineral: "Mineral",
  leather: "Leather",
  lumber: "Lumber",
  stick: "Sticks",
  iron_nugget: "Iron Nugget",
  steel_nugget: "Steel Nugget",
  coconut_charcoal: "Coconut Charcoal",
  gold_dust: "Gold Dust",
  gold_coin: "Gold Coin",
  sword: "Sword",
  sword2: "Steel Sword",
  gun: "Gun",
  gun2: "Steel Gun",
  spear: "Spear",
  spear2: "Steel Spear",
  bow_and_arrow: "Composite Bow",
  bow_and_arrow_2: "Composite Bow II",
  stone_axe: "Stone Axe",
  tent: "Tent",
  salt: "Salt",
  tiula_itum: "Tiula Itum",
  peace_amululet8_free: "Peace Amulet",
};

const ITEM_CATEGORY = {};
["food", "wood", "mineral"].forEach(
  (s) => (ITEM_CATEGORY[s] = { group: "Resources", order: 0 }),
);
[
  "leather",
  "lumber",
  "stick",
  "iron_nugget",
  "steel_nugget",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Materials", order: 1 }));
[
  "sword",
  "sword2",
  "gun",
  "gun2",
  "spear",
  "spear2",
  "bow_and_arrow",
  "bow_and_arrow_2",
  "stone_axe",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Weapons", order: 2 }));
[
  "salt",
  "gold_dust",
  "coconut_charcoal",
  "tiula_itum",
  "inasal",
  "adobo",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Tribal Locked", order: 3 }));
["tent", "gold_coin", "peace_amululet8_free"].forEach(
  (s) => (ITEM_CATEGORY[s] = { group: "Other", order: 4 }),
);

let invCurrentSort = "default";

function getSlug(el) {
  const img = el.querySelector("img[alt]");
  return img ? img.getAttribute("alt") : "";
}

function getQty(el) {
  const span = el.querySelector(".item-quantity");
  return span ? parseInt(span.textContent.replace(/[\s,]/g, ""), 10) || 0 : 0;
}

function getDisplayName(slug) {
  return ITEM_NAMES[slug] || slug.replace(/_/g, " ");
}

function buildSortBar(grid) {
  const bar = document.createElement("div");
  bar.className = "tom-inv-sort-bar";

  const modes = [
    { key: "default", label: "Default" },
    { key: "qty", label: "Qty", desc: "qty-desc", asc: "qty-asc" },
    { key: "name", label: "Name", asc: "name-asc", desc: "name-desc" },
    { key: "category", label: "Category" },
  ];

  modes.forEach((mode) => {
    const btn = document.createElement("button");
    const isToggle = mode.asc && mode.desc;
    const currentDir = isToggle && invCurrentSort === mode.desc ? "desc"
      : isToggle && invCurrentSort === mode.asc ? "asc" : null;
    btn.className =
      "tom-inv-sort-btn" +
      (currentDir || invCurrentSort === mode.key ? " active" : "");
    if (isToggle) {
      btn.textContent = mode.label + " " + (currentDir === "asc" ? "\u2191" : "\u2193");
    } else {
      btn.textContent = mode.label;
    }
    btn.addEventListener("click", () => {
      bar
        .querySelectorAll(".tom-inv-sort-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (isToggle) {
        const wasDir = invCurrentSort === mode.desc ? "desc"
          : invCurrentSort === mode.asc ? "asc" : null;
        const newDir = wasDir === "desc" ? "asc" : "desc";
        invCurrentSort = newDir === "desc" ? mode.desc : mode.asc;
        btn.textContent = mode.label + " " + (newDir === "asc" ? "\u2191" : "\u2193");
      } else {
        invCurrentSort = mode.key;
      }
      applySort(grid, invCurrentSort);
    });
    bar.appendChild(btn);
  });

  return bar;
}

function applySort(grid, sortType) {
  // Remove any existing category dividers
  grid.querySelectorAll(".tom-inv-cat-divider").forEach((el) => el.remove());

  const allSlots = [...grid.querySelectorAll(".inventory-item")];
  const filled = allSlots.filter((el) => !el.classList.contains("empty-slot"));
  const empties = allSlots.filter((el) => el.classList.contains("empty-slot"));

  // Restore original order attribute if present
  if (sortType === "default") {
    filled.sort(
      (a, b) =>
        parseInt(a.dataset.tomOrigIdx, 10) - parseInt(b.dataset.tomOrigIdx, 10),
    );
  } else if (sortType === "qty-desc") {
    filled.sort((a, b) => getQty(b) - getQty(a));
  } else if (sortType === "qty-asc") {
    filled.sort((a, b) => getQty(a) - getQty(b));
  } else if (sortType === "name-asc") {
    filled.sort((a, b) =>
      getDisplayName(getSlug(a)).localeCompare(getDisplayName(getSlug(b))),
    );
  } else if (sortType === "name-desc") {
    filled.sort((a, b) =>
      getDisplayName(getSlug(b)).localeCompare(getDisplayName(getSlug(a))),
    );
  } else if (sortType === "category") {
    filled.sort((a, b) => {
      const catA = ITEM_CATEGORY[getSlug(a)] || { order: 99 };
      const catB = ITEM_CATEGORY[getSlug(b)] || { order: 99 };
      if (catA.order !== catB.order) return catA.order - catB.order;
      return getQty(b) - getQty(a);
    });
  }

  // Re-append filled items
  if (sortType === "category") {
    let lastGroup = null;
    filled.forEach((el) => {
      const cat = ITEM_CATEGORY[getSlug(el)] || {
        group: "Other",
        order: 99,
      };
      if (cat.group !== lastGroup) {
        const divider = document.createElement("div");
        divider.className = "tom-inv-cat-divider";
        divider.textContent = cat.group;
        grid.appendChild(divider);
        lastGroup = cat.group;
      }
      grid.appendChild(el);
    });
  } else {
    filled.forEach((el) => grid.appendChild(el));
  }

  // Empties at the end
  empties.forEach((el) => grid.appendChild(el));
}

function handleTownItemsModal(modal) {
  const header = modal.querySelector(".modal-header");
  const grid = modal.querySelector(".inventory");
  if (!header || !grid) return;

  // Already injected?
  if (modal.querySelector(".tom-inv-sort-bar")) return;

  // Stamp original order and format quantities
  const items = grid.querySelectorAll(".inventory-item:not(.empty-slot)");
  items.forEach((el, i) => {
    el.dataset.tomOrigIdx = i;
    const qtyEl = el.querySelector(".item-quantity");
    if (qtyEl) {
      const num = parseInt(qtyEl.textContent.replace(/\s/g, ""), 10);
      if (!isNaN(num)) qtyEl.textContent = num.toLocaleString("fr-FR");
    }
  });

  // Inject sort bar after header
  const bar = buildSortBar(grid);
  const body = modal.querySelector(".modal-body");
  if (body) {
    body.insertBefore(bar, body.firstChild);
  }

  // Re-apply last sort
  if (invCurrentSort !== "default") {
    applySort(grid, invCurrentSort);
  }

  // Watch for React re-renders that replace inventory children
  const gridObserver = new MutationObserver(() => {
    // Re-stamp and re-format any new items without tomOrigIdx
    const freshItems = grid.querySelectorAll(
      ".inventory-item:not(.empty-slot)",
    );
    let needsReapply = false;
    freshItems.forEach((el, i) => {
      if (!el.dataset.tomOrigIdx) {
        el.dataset.tomOrigIdx = i;
        needsReapply = true;
      }
      const qtyEl = el.querySelector(".item-quantity");
      if (qtyEl && !/\s/.test(qtyEl.textContent) && qtyEl.textContent.length > 3) {
        const num = parseInt(qtyEl.textContent.replace(/[\s,]/g, ""), 10);
        if (!isNaN(num)) qtyEl.textContent = num.toLocaleString("fr-FR");
      }
    });
    if (needsReapply && invCurrentSort !== "default") {
      applySort(grid, invCurrentSort);
    }
  });
  gridObserver.observe(grid, { childList: true, subtree: true });
}

function initInventorySort() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.classList?.contains("modal-overlay")
          ? node
          : node.querySelector?.(".modal-overlay");
        if (!modal) continue;
        const h2 = modal.querySelector("h2");
        if (h2 && h2.textContent.trim() === "Town Items") {
          // Defer to let React finish rendering
          setTimeout(() => handleTownItemsModal(modal), 50);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

