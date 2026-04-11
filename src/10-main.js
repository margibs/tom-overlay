// --- Init ---
function domReady(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

// Shared state
let lastParsed = null;
let lastBuildingMap = {};
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
  rebuildTilePositions();
  renderPanel(lastParsed);
  lastBadgeKey = ""; // force badge rebuild on data change
  lastTimerBadgeKey = ""; // force timer badge rebuild on data change
  renderBadges(lastParsed);
  lastBuildingMap = lastParsed.buildingMap;
}

domReady(() => {
  injectStyles();
  initInventorySort();
  initBuildingSort();
  initCrafterSort();
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
    advanceTick();

    if (!lastGridContainer) {
      lastGridContainer = document.querySelector(".town-grid-content");
    }
    if (!lastGridContainer) return;

    // Rebuild shared tile positions if needed
    if (Object.keys(getSharedTilePositions()).length === 0) {
      rebuildTilePositions();
    }

    checkExpiredTimers();
    renderTimerBadges(
      lastBuildingMap,
      getSharedTilePositions(),
      lastGridContainer,
      lastParsed,
    );

    renderActiveCraftingQueue();
  }, 1000);
});

