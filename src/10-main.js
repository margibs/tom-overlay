// --- Init ---
function domReady(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

// Shared state
let lastParsed = null;
let lastBuildingMap = {};
let lastTilePositions = {};
let lastGridContainer = null;

function rebuildDerived() {
  lastParsed.assignedBuildings = lastParsed.allBuildings
    .filter((b) => b.assignees > 0)
    .sort((a, b) => b.assignees - a.assignees);
  lastParsed.underConstruction = lastParsed.allBuildings.filter(
    (b) => b.builders > 0,
  );
  lastParsed.idleWorkers = lastParsed.allPopulations.filter((p) => p.idle > 0);
  lastParsed.totalIdle = lastParsed.idleWorkers.reduce(
    (sum, w) => sum + w.idle,
    0,
  );
}

function renderAll() {
  if (!lastParsed) return;
  renderPanel(lastParsed);
  renderBadges(lastParsed);
  lastBuildingMap = lastParsed.buildingMap;
}

domReady(() => {
  injectStyles();
  initInventorySort();
  initBuildingSort();
  onTownData((data) => {
    lastParsed = parseTownData(data);
    // Derive queue max from command center level
    const cc = data.tiles.find(
      (t) => t.building && /^command_center/.test(t.building.slug),
    );
    if (cc) {
      const m = cc.building.slug.match(/(\d+)$/);
      if (m) buildingQueueMax = parseInt(m[1]) + 1;
    }
    renderAll();
  });

  // Update timer badges every second
  timerInterval = setInterval(() => {
    if (!lastGridContainer) {
      lastGridContainer = document.querySelector(".town-grid-content");
    }
    if (!lastGridContainer) return;

    // Rebuild tile positions if needed
    if (Object.keys(lastTilePositions).length === 0) {
      const tileEls = document.querySelectorAll(".tile-overlay");
      tileEls.forEach((el, i) => {
        const x = Math.floor(i / 9);
        const y = i % 9;
        lastTilePositions[`${x},${y}`] = {
          left: el.style.left,
          top: el.style.top,
        };
      });
    }

    checkExpiredTimers();
    renderTimerBadges(
      lastBuildingMap,
      lastTilePositions,
      lastGridContainer,
      lastParsed,
    );

    renderActiveCraftingQueue();
  }, 1000);
});

