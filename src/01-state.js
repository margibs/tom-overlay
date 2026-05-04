  const VERSION = "1.6.2"; // keep in sync with @version in 00-header.js

  let townData = null;
  let userTribe = null; // detected from owner.tribe in town API
  let tickInterval = 300; // seconds; updated dynamically from last_food_production_time
  let buildingQueueMax = null; // detected from failed PATCH response
  let lastMarketTrades = null; // { items: [...], meta: {...} } from /buildings/:id/trades

  // --- Building swap map (visual planning, localStorage-persisted) ---
  let buildingSwapMap = JSON.parse(localStorage.getItem("tom-building-swaps") || "{}");
  let isRearrangeMode = false;
  let pendingSwapTile = null; // {x, y} of first selected tile

  function saveSwapMap() {
    localStorage.setItem("tom-building-swaps", JSON.stringify(buildingSwapMap));
  }
  function clearAllSwaps() {
    buildingSwapMap = {};
    saveSwapMap();
  }
  const listeners = [];

  // --- Tick counter for per-tick caching ---
  let _tickCount = 0;
  function advanceTick() { _tickCount++; }
  function currentTick() { return _tickCount; }

  // --- Shared tile position builder ---
  let _sharedTilePositions = {};
  let _originalTilePositions = null; // set once on first capture; never overwritten
  function rebuildTilePositions() {
    const tileEls = document.querySelectorAll(".tile-overlay");
    if (tileEls.length === 0) return;
    _sharedTilePositions = {};
    tileEls.forEach((el, i) => {
      const x = Math.floor(i / 9);
      const y = i % 9;
      _sharedTilePositions[`${x},${y}`] = {
        left: el.style.left,
        top: el.style.top,
        bottom: el.style.bottom,
      };
    });
    if (!_originalTilePositions) {
      _originalTilePositions = Object.assign({}, _sharedTilePositions);
    }
  }
  function getSharedTilePositions() { return _sharedTilePositions; }
  function getOriginalTilePositions() { return _originalTilePositions; }

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
