// --- Shared Sort Utilities ---

function setupModalDetector(selector, titleMatch, callback) {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const target = node.classList?.contains(selector)
          ? node
          : node.querySelector?.("." + selector);
        if (!target) continue;
        const h2 = target.querySelector("h2");
        if (h2 && titleMatch(h2.textContent.trim())) {
          setTimeout(() => callback(target), 50);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function buildToggleSortButtons(container, modes, currentSortRef, onSort, btnClass) {
  modes.forEach((mode) => {
    const btn = document.createElement("button");
    const isToggle = mode.asc && mode.desc;
    const currentDir = isToggle && currentSortRef.value === mode.desc ? "desc"
      : isToggle && currentSortRef.value === mode.asc ? "asc" : null;
    btn.className =
      btnClass +
      (currentDir || currentSortRef.value === mode.key ? " active" : "");
    if (isToggle) {
      btn.textContent = mode.label + " " + (currentDir === "asc" ? "\u2191" : "\u2193");
    } else {
      btn.textContent = mode.label;
    }
    btn.addEventListener("click", () => {
      container
        .querySelectorAll("." + btnClass)
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (isToggle) {
        const wasDir = currentSortRef.value === mode.desc ? "desc"
          : currentSortRef.value === mode.asc ? "asc" : null;
        const newDir = wasDir === "desc" ? "asc" : "desc";
        currentSortRef.value = newDir === "desc" ? mode.desc : mode.asc;
        btn.textContent = mode.label + " " + (newDir === "asc" ? "\u2191" : "\u2193");
      } else {
        currentSortRef.value = mode.key;
      }
      onSort();
    });
    container.appendChild(btn);
  });
}

function insertCategoryDividers(grid, items, getCategoryFn, dividerClass) {
  let lastGroup = null;
  items.forEach((el) => {
    const cat = getCategoryFn(el);
    if (cat.group !== lastGroup) {
      const divider = document.createElement("div");
      divider.className = dividerClass;
      divider.textContent = cat.group;
      grid.appendChild(divider);
      lastGroup = cat.group;
    }
    grid.appendChild(el);
  });
}

function setupGridObserver(grid, cardSelector, needsReapply) {
  const gridObserver = new MutationObserver(() => {
    const freshCards = grid.querySelectorAll(cardSelector);
    let changed = false;
    freshCards.forEach((card, i) => {
      if (!card.dataset.tomOrigIdx) {
        card.dataset.tomOrigIdx = i;
        changed = true;
      }
    });
    if (changed) needsReapply();
  });
  gridObserver.observe(grid, { childList: true, subtree: true });
}
