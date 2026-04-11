  const VERSION = "1.5.5"; // keep in sync with @version in 00-header.js

  let townData = null;
  let userTribe = null; // detected from owner.tribe in town API
  let tickInterval = 300; // seconds; updated dynamically from last_food_production_time
  let buildingQueueMax = null; // detected from failed PATCH response
  let lastMarketTrades = null; // { items: [...], meta: {...} } from /buildings/:id/trades
  const listeners = [];

  // --- Tick counter for per-tick caching ---
  let _tickCount = 0;
  function advanceTick() { _tickCount++; }
  function currentTick() { return _tickCount; }

  // --- Shared tile position builder ---
  let _sharedTilePositions = {};
  function rebuildTilePositions() {
    const tileEls = document.querySelectorAll(".tile-overlay");
    if (tileEls.length === 0) return;
    _sharedTilePositions = {};
    tileEls.forEach((el, i) => {
      const x = Math.floor(i / 9);
      const y = i % 9;
      _sharedTilePositions[`${x},${y}`] = { left: el.style.left, top: el.style.top };
    });
  }
  function getSharedTilePositions() { return _sharedTilePositions; }

  // --- Worker color helper ---
  function getWorkerColor(ratio, isFull, craftIdle, assignees) {
    if (craftIdle && assignees <= 0) return "#fb923c";
    if (isFull && !craftIdle) return "#fff";
    if (isFull && craftIdle) return "#fb923c";
    if (ratio >= 0.75) return "#4ade80";
    if (ratio >= 0.4) return "#fb923c";
    return "#ef4444";
  }

  // --- Building level extractor ---
  function getBuildingLevel(slug) {
    const m = slug.match(/(\d+)$/);
    return m ? parseInt(m[1]) : 1;
  }
