  // --- Building swap helpers ---
  function applySwapsToBuildings(buildings) {
    if (!Object.keys(buildingSwapMap).length) return buildings;
    return buildings.map((b) => {
      const swappedTo = buildingSwapMap[`${b.x},${b.y}`];
      if (!swappedTo) return b;
      const [nx, ny] = swappedTo.split(",").map(Number);
      return Object.assign({}, b, { x: nx, y: ny });
    });
  }

  let _rearrangeOverlay = null;

  function removeSwapHighlight() {
    document.querySelectorAll(".tom-swap-highlight").forEach((el) => el.remove());
  }

  function nearestTileKey(clickX, clickY, containerH) {
    const tilePositions = getSharedTilePositions();
    let bestKey = null;
    let bestDist = Infinity;
    for (const [key, pos] of Object.entries(tilePositions)) {
      const tx = parseInt(pos.left);
      const ty = pos.bottom
        ? containerH - parseInt(pos.bottom) - 15
        : parseInt(pos.top) + 15;
      const d = (clickX - tx) ** 2 + (clickY - ty) ** 2;
      if (d < bestDist) { bestDist = d; bestKey = key; }
    }
    return bestKey;
  }

  function onGridRearrangeClick(e) {
    const rect = _rearrangeOverlay.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const containerH = _rearrangeOverlay.offsetHeight;
    const bestKey = nearestTileKey(clickX, clickY, containerH);
    if (!bestKey) return;
    const [x, y] = bestKey.split(",").map(Number);
    const key = bestKey;

    if (!pendingSwapTile) {
      pendingSwapTile = { x, y };
      removeSwapHighlight();
      const pos = getSharedTilePositions()[key];
      if (pos) {
        const hl = document.createElement("div");
        hl.className = "tom-swap-highlight";
        hl.style.left = parseInt(pos.left) + 60 + "px";
        if (pos.bottom) hl.style.bottom = parseInt(pos.bottom) + 40 + "px";
        else hl.style.top = parseInt(pos.top) + "px";
        _rearrangeOverlay.appendChild(hl);
      }
    } else {
      const aKey = `${pendingSwapTile.x},${pendingSwapTile.y}`;
      if (aKey !== key) {
        if (buildingSwapMap[aKey]) delete buildingSwapMap[buildingSwapMap[aKey]];
        if (buildingSwapMap[key]) delete buildingSwapMap[buildingSwapMap[key]];
        buildingSwapMap[aKey] = key;
        buildingSwapMap[key] = aKey;
        saveSwapMap();
      }
      pendingSwapTile = null;
      removeSwapHighlight();
      lastBadgeKey = "";
      renderAll();
    }
  }

  function toggleRearrangeMode() {
    isRearrangeMode = !isRearrangeMode;
    pendingSwapTile = null;
    removeSwapHighlight();
    const btn = document.getElementById("tom-rearrange-btn");
    if (btn) btn.classList.toggle("active", isRearrangeMode);

    if (isRearrangeMode) {
      const gridContainer = document.querySelector(".town-grid-content");
      if (gridContainer) {
        _rearrangeOverlay = document.createElement("div");
        _rearrangeOverlay.style.cssText =
          "position:absolute;top:0;left:0;width:100%;height:100%;" +
          "cursor:crosshair;z-index:2147483647;";
        _rearrangeOverlay.addEventListener("click", onGridRearrangeClick);
        gridContainer.appendChild(_rearrangeOverlay);
      }
    } else {
      if (_rearrangeOverlay) { _rearrangeOverlay.remove(); _rearrangeOverlay = null; }
    }
  }

  // --- Grid Badges ---
  let badgeRetries = 0;
  let lastBadgeKey = "";

  function renderBadges(parsed) {
    // Fingerprint: assigned buildings + populations for change detection
    const badgeKey = parsed.assignedBuildings
      .map((b) => `${b.id}:${b.assignees}`)
      .join("|") + "~" + parsed.allPopulations
      .map((p) => `${p.type}:${p.idle}:${p.trainable}`)
      .join("|");
    if (badgeKey === lastBadgeKey) return;
    lastBadgeKey = badgeKey;

    // Remove old cards
    document.querySelectorAll(".tom-worker-label").forEach((el) => el.remove());

    // The grid container holds all tiles as absolutely positioned children
    const gridContainer = document.querySelector(".town-grid-content");
    if (!gridContainer) {
      if (badgeRetries < 20) {
        badgeRetries++;
        setTimeout(() => renderBadges(parsed), 500);
      } else {
        console.log(
          "[TOM Overlay] .town-grid-content not found after retries — badges disabled.",
        );
      }
      return;
    }
    badgeRetries = 0;

    const tilePositions = getSharedTilePositions();

    // Build lookups using swapped positions
    const workerLookup = {};
    for (const b of applySwapsToBuildings(parsed.assignedBuildings)) {
      workerLookup[`${b.x},${b.y}`] = {
        assignees: b.assignees,
        category: b.category,
      };
    }

    // Skip buildings with active timers (shown by renderTimerBadges)
    const timerBuildingIds = new Set(
      getActiveTimers()
        .filter(
          (t) =>
            t.callbackType !== "addResearchedTech" &&
            t.callbackArgs?.buildingId,
        )
        .map((t) => String(t.callbackArgs.buildingId)),
    );

    // Per-building trainable: training_grounds → melee troops, archery_grounds → ranged troops
    const troopByBuilding = {};
    for (const p of parsed.allPopulations) {
      if (p.type.includes("warrior") || p.type.includes("spearman"))
        troopByBuilding["training_grounds"] = p;
      if (p.type.includes("musketeer") || p.type.includes("archer"))
        troopByBuilding["archery_grounds"] = p;
    }

    // Build set of building IDs with active crafting timers
    const craftingBuildingIds = new Set(
      getActiveTimers()
        .filter((t) => t.callbackArgs?.recipeName && t.callbackArgs?.buildingId)
        .map((t) => String(t.callbackArgs.buildingId)),
    );

    const displayBuildings = applySwapsToBuildings(parsed.allBuildings);
    for (const tile of displayBuildings) {
      if (timerBuildingIds.has(String(tile.id))) continue;

      const pos = tilePositions[`${tile.x},${tile.y}`];
      if (!pos) continue;

      const left = parseInt(pos.left, 10);
      const bottomRaw = parseInt(pos.bottom, 10);
      const topRaw = parseInt(pos.top, 10);
      const lvl = getBuildingLevel(tile.slug);
      const maxWorkers = lvl;
      const key = `${tile.x},${tile.y}`;
      const wk = workerLookup[key];
      const isCrafting = craftingBuildingIds.has(String(tile.id));

      const baseSlug = tile.slug.replace(/\d+$/, "");
      const troopInfo = troopByBuilding[baseSlug] || null;

      // Show if building has workers, is crafting, or has training info
      if ((!wk || wk.assignees <= 0) && !isCrafting && !troopInfo) continue;

      const label = document.createElement("div");
      label.className = "tom-worker-label";
      label.style.position = "absolute";
      label.style.pointerEvents = "none";
      label.style.zIndex = "2147483646";
      label.style.transform = "translateX(-50%)";
      label.style.display = "flex";
      label.style.flexDirection = "column";
      label.style.alignItems = "center";

      const assignees = wk?.assignees || 0;
      const ratio = maxWorkers > 0 ? assignees / maxWorkers : 0;
      const isFull = ratio >= 1;
      const isCraftBuilding = tile.category === "crafting";
      const craftIdle = isCraftBuilding && !isCrafting;

      let displayText = "";
      if (assignees > 0) {
        displayText = isFull ? "Full!" : assignees + "/" + maxWorkers;
        if (craftIdle) displayText += " | No Craft";
      } else if (craftIdle) {
        displayText = "No Craft";
      }

      const txtColor = getWorkerColor(ratio, isFull, craftIdle, assignees);

      const txt = document.createElement("span");
      txt.style.fontFamily = "'Work Sans', system-ui, sans-serif";
      txt.style.fontSize = "7px";
      txt.style.fontWeight = "700";
      txt.style.color = txtColor;
      txt.style.textShadow =
        "0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5)";
      txt.style.background = "rgba(255,255,255,0.12)";
      txt.style.borderRadius = "2px";
      txt.style.padding = "1px 4px";
      txt.textContent = displayText;
      if (displayText) label.appendChild(txt);

      if (buildingSwapMap[`${tile.x},${tile.y}`]) {
        const dot = document.createElement("span");
        dot.className = "tom-swap-dot";
        label.appendChild(dot);
      }

      // Train label for training/archery buildings
      if (troopInfo && troopInfo.trainable !== null) {
        const trainEl = document.createElement("span");
        trainEl.style.fontFamily = "'Work Sans', system-ui, sans-serif";
        trainEl.style.fontSize = "7px";
        trainEl.style.fontWeight = "700";
        trainEl.style.color = troopInfo.trainable > 0 ? "#4ade80" : "#ef4444";
        trainEl.style.textShadow =
          "0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5)";
        trainEl.style.background = "rgba(255,255,255,0.12)";
        trainEl.style.borderRadius = "2px";
        trainEl.style.padding = "1px 4px";
        trainEl.textContent = troopInfo.label + ": " + troopInfo.trainable;
        label.appendChild(trainEl);
      }

      label.style.left = left + 60 + "px";
      if (!Number.isNaN(bottomRaw)) {
        label.style.bottom = bottomRaw + 50 + "px";
      } else {
        label.style.top = topRaw + 2 + "px";
      }
      gridContainer.appendChild(label);
    }
  }
