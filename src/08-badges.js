  // --- Grid Badges ---
  let badgeRetries = 0;

  function renderBadges(parsed) {
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

    // Build a left/top lookup from tile-overlay elements
    // Tiles are ordered column-major: index = x * 9 + y
    const tileEls = document.querySelectorAll(".tile-overlay");
    const tilePositions = {};
    tileEls.forEach((el, i) => {
      const x = Math.floor(i / 9);
      const y = i % 9;
      tilePositions[`${x},${y}`] = { left: el.style.left, top: el.style.top };
    });

    function getLevel(slug) {
      const m = slug.match(/(\d+)$/);
      return m ? parseInt(m[1]) : 1;
    }

    // Build lookups
    const workerLookup = {};
    for (const b of parsed.assignedBuildings) {
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

    // Per-building trainable: training_grounds → Gagandilan, archery_grounds → Musketeer
    const troopByBuilding = {};
    for (const p of parsed.allPopulations) {
      if (p.type.includes("warrior")) troopByBuilding["training_grounds"] = p;
      if (p.type.includes("musketeer")) troopByBuilding["archery_grounds"] = p;
    }

    // Build set of building IDs with active crafting timers
    const craftingBuildingIds = new Set(
      getActiveTimers()
        .filter((t) => t.callbackArgs?.recipeName && t.callbackArgs?.buildingId)
        .map((t) => String(t.callbackArgs.buildingId)),
    );

    for (const tile of parsed.allBuildings) {
      if (timerBuildingIds.has(String(tile.id))) continue;

      const pos = tilePositions[`${tile.x},${tile.y}`];
      if (!pos) continue;

      const left = parseInt(pos.left, 10);
      const top = parseInt(pos.top, 10);
      const lvl = getLevel(tile.slug);
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
      label.style.zIndex = "20001";
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

      let txtColor = "#ef4444";
      if (craftIdle && assignees <= 0) txtColor = "#fb923c";
      else if (isFull && !craftIdle) txtColor = "#fff";
      else if (isFull && craftIdle) txtColor = "#fb923c";
      else if (ratio >= 0.75) txtColor = "#4ade80";
      else if (ratio >= 0.4) txtColor = "#fb923c";

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

      label.style.left = left + 62 + "px";
      label.style.top = top + 2 + "px";
      gridContainer.appendChild(label);
    }
  }
