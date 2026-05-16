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
  renderBadges(lastParsed);
  lastBuildingMap = lastParsed.buildingMap;
}

domReady(() => {
  injectStyles();
  initChatFilter();
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
});
