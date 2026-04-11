// --- Building Sort (Construct Building modal) ---

function getBldTab(name) {
  const lower = name.toLowerCase();
  if (["barracks", "training grounds", "archery grounds"].some((k) => lower.includes(k)))
    return "military";
  if (["farmer", "woodcutter", "miner"].some((k) => lower.includes(k)))
    return "resources";
  return "infrastructure";
}

let bldCurrentTab = "infrastructure";
let bldCurrentSearch = "";

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

  // Tab row
  const tabRow = document.createElement("div");
  tabRow.className = "tom-bld-tab-row";

  const tabs = [
    { key: "infrastructure", label: "Infrastructure" },
    { key: "military", label: "Military" },
    { key: "resources", label: "Resources" },
  ];

  tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = "tom-bld-tab-btn" + (bldCurrentTab === tab.key ? " active" : "");
    btn.textContent = tab.label;
    btn.addEventListener("click", () => {
      tabRow.querySelectorAll(".tom-bld-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bldCurrentTab = tab.key;
      applyBldFilters(grid);
    });
    tabRow.appendChild(btn);
  });

  toolbar.appendChild(tabRow);

  // Search input
  const search = document.createElement("input");
  search.type = "text";
  search.className = "tom-search-input tom-bld-search";
  search.placeholder = "Search buildings\u2026";
  search.value = bldCurrentSearch;
  search.addEventListener("input", () => {
    bldCurrentSearch = search.value;
    applyBldFilters(grid);
  });
  toolbar.appendChild(search);

  return toolbar;
}

function applyBldFilters(grid) {
  const query = bldCurrentSearch.toLowerCase();

  // Remove existing no-results message
  const existing = grid.querySelector(".tom-bld-no-results");
  if (existing) existing.remove();

  const cards = [...grid.querySelectorAll(".building-option")];

  const visible = [];
  const hidden = [];

  cards.forEach((card) => {
    const name = getBldName(card);
    const desc = getBldDesc(card);
    const tabMatch = getBldTab(name) === bldCurrentTab;
    const searchMatch = !query || name.includes(query) || desc.includes(query);
    if (tabMatch && searchMatch) {
      visible.push(card);
    } else {
      hidden.push(card);
    }
  });

  // Re-append in original order
  visible.sort(
    (a, b) => parseInt(a.dataset.tomOrigIdx, 10) - parseInt(b.dataset.tomOrigIdx, 10)
  );

  visible.forEach((card) => {
    card.classList.remove("tom-bld-hidden");
    grid.appendChild(card);
  });
  hidden.forEach((card) => {
    card.classList.add("tom-bld-hidden");
    grid.appendChild(card);
  });

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

  // Stamp original order
  const cards = grid.querySelectorAll(".building-option");
  cards.forEach((card, i) => {
    card.dataset.tomOrigIdx = i;
  });

  // Inject toolbar
  const toolbar = buildBldToolbar(grid);
  body.insertBefore(toolbar, body.firstChild);

  // Apply initial tab filter
  applyBldFilters(grid);

  // Watch for React re-renders
  setupGridObserver(grid, ".building-option", () => applyBldFilters(grid));
}

function initBuildingSort() {
  setupModalDetector("modal-overlay", (title) => title.startsWith("Construct Building"), handleConstructModal);
}
