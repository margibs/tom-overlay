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

    const workerLookup = {};
    for (const b of parsed.assignedBuildings) {
      workerLookup[`${b.x},${b.y}`] = {
        assignees: b.assignees,
        category: b.category,
      };
    }

    for (const tile of parsed.allBuildings) {
      const pos = tilePositions[`${tile.x},${tile.y}`];
      if (!pos) continue;

      const left = parseInt(pos.left, 10);
      const bottomRaw = parseInt(pos.bottom, 10);
      const topRaw = parseInt(pos.top, 10);
      const lvl = getBuildingLevel(tile.slug);
      const maxWorkers = lvl;
      const key = `${tile.x},${tile.y}`;
      const wk = workerLookup[key];

      if (!wk || wk.assignees <= 0) continue;

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

      let displayText = "";
      if (assignees > 0) {
        displayText = isFull ? "Full!" : assignees + "/" + maxWorkers;
      }

      const txtColor = getWorkerColor(ratio, isFull, false, assignees);

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

      label.style.left = left + 60 + "px";
      if (!Number.isNaN(bottomRaw)) {
        label.style.bottom = bottomRaw + 50 + "px";
      } else {
        label.style.top = topRaw + 2 + "px";
      }
      gridContainer.appendChild(label);
    }
  }
