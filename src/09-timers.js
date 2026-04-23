  // --- Timers ---
  let timerInterval = null;
  let _cachedTimers = null;
  let _cachedTimersTick = -1;

  function getActiveTimers() {
    const tick = currentTick();
    if (_cachedTimersTick === tick && _cachedTimers !== null) return _cachedTimers;
    _cachedTimersTick = tick;
    try {
      const raw = localStorage.getItem("persist:timer");
      if (!raw) { _cachedTimers = []; return _cachedTimers; }
      const parsed = JSON.parse(raw);
      const timers = JSON.parse(parsed.timers || "{}");
      const allTimers = [];
      for (const userId in timers) {
        if (Array.isArray(timers[userId])) {
          allTimers.push(...timers[userId]);
        }
      }
      _cachedTimers = allTimers;
      return allTimers;
    } catch (e) {
      _cachedTimers = [];
      return [];
    }
  }

  function formatCountdown(seconds) {
    if (seconds <= 0) return "done";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }


  const clearedTimers = new Set();
  const timerFirstSeen = {}; // { [buildingId-finishTime]: unixSeconds }
  let lastCraftTimerKey = ""; // tracks active crafting timer set for change detection

  function renderActiveCraftingQueue() {
    const section = document.getElementById("tom-aq-section");
    if (!section) return;

    const allCraftTimers = getActiveTimers().filter(
      (t) => t.callbackArgs?.recipeName && t.callbackArgs?.buildingId,
    );
    // Deduplicate by buildingId — keep only the soonest-finishing entry per building
    const byBuilding = new Map();
    for (const t of allCraftTimers) {
      const bid = t.callbackArgs.buildingId;
      const finish = t.callbackArgs.finishTime || t.timestamp || 0;
      const existing = byBuilding.get(bid);
      if (!existing || finish < (existing.callbackArgs.finishTime || existing.timestamp || 0)) {
        byBuilding.set(bid, t);
      }
    }
    const timers = [...byBuilding.values()];
    const now = Math.floor(Date.now() / 1000);

    // Build a key representing the current set of active crafting jobs
    const currentKey = timers
      .map(
        (t) =>
          `${t.callbackArgs.buildingId}-${t.callbackArgs.finishTime || t.timestamp}`,
      )
      .sort()
      .join("|");

    const collapsed = localStorage.getItem("tom-craft-queue-collapsed") === "1";
    const arrow = collapsed ? "\u25B8" : "\u25BE";

    if (timers.length === 0) {
      section.innerHTML = "";
      lastCraftTimerKey = currentKey;
      return;
    }

    if (currentKey !== lastCraftTimerKey) {
      // Full rebuild — timer set has changed
      lastCraftTimerKey = currentKey;
      const rowsHtml = timers
        .map((t) => {
          const finishTime = t.callbackArgs.finishTime || t.timestamp || 0;
          const remaining = Math.max(0, finishTime - now);
          const label = (t.label || "").replace(/^Crafting\s+/i, "");
          return `<div class="tom-aq-row">
            <span class="tom-aq-label">${label}</span>
            <span class="tom-aq-time" data-finish="${finishTime}">${formatCountdown(remaining)}</span>
          </div>`;
        })
        .join("");
      section.innerHTML = `
        <div class="tom-aq-header" id="tom-aq-header">
          <span>${arrow} Active Crafting (${timers.length})</span>
        </div>
        <div id="tom-aq-body" class="tom-aq-body${collapsed ? " collapsed" : ""}">
          ${rowsHtml}
        </div>
      `;
    } else {
      // In-place countdown update only
      section.querySelectorAll(".tom-aq-time[data-finish]").forEach((el) => {
        const finishTime = parseInt(el.dataset.finish, 10);
        el.textContent = formatCountdown(Math.max(0, finishTime - now));
      });
      // Keep arrow in sync (collapsed state may have changed)
      const headerSpan = section.querySelector("#tom-aq-header span");
      if (headerSpan) {
        headerSpan.textContent = `${arrow} Active Crafting (${timers.length})`;
      }
    }
  }

  function checkExpiredTimers() {
    if (!lastParsed) return;
    const now = Math.floor(Date.now() / 1000);
    const timers = getActiveTimers();
    let changed = false;

    for (const timer of timers) {
      if (timer.callbackType !== "completeConstruction") continue;
      const args = timer.callbackArgs;
      if (!args || !args.buildingId) continue;
      const finishTime = args.finishTime || timer.timestamp;
      if (!finishTime || now < finishTime) continue;

      const key = `${args.buildingId}-${finishTime}`;
      if (clearedTimers.has(key)) continue;

      const bld = lastParsed.allBuildings.find((b) => b.id == args.buildingId);
      if (bld && bld.builders > 0) {
        const freed = bld.builders;
        bld.builders = 0;
        if (lastParsed.buildingMap[args.buildingId]) {
          lastParsed.buildingMap[args.buildingId].builders = 0;
        }
        // Free builders back to idle (builders are commoners)
        const commoner = lastParsed.allPopulations.find(
          (p) => p.type === "commoner",
        );
        if (commoner) {
          commoner.idle += freed;
          commoner.assigned = Math.max(0, commoner.assigned - freed);
        }
        changed = true;
      }
      clearedTimers.add(key);
    }

    if (changed) {
      rebuildDerived();
      renderAll();
    }
  }

  let lastTimerBadgeKey = "";

  function renderTimerBadges(
    buildingMap,
    tilePositions,
    gridContainer,
    parsed,
  ) {
    if (!gridContainer) return;

    const timers = getActiveTimers();
    const now = Math.floor(Date.now() / 1000);

    // Build fingerprint for change detection
    const timerBadgeKey = timers
      .filter((t) => t.callbackArgs?.buildingId || t.callbackType === "addResearchedTech")
      .map((t) => `${t.callbackArgs?.buildingId || "r"}-${t.callbackArgs?.finishTime || t.timestamp}`)
      .sort()
      .join("|");

    // If timer set unchanged, just update countdowns in-place
    if (timerBadgeKey === lastTimerBadgeKey && timerBadgeKey !== "") {
      gridContainer.querySelectorAll(".tom-timer-badge .tom-badge-time[data-finish]").forEach((el) => {
        const finish = parseInt(el.dataset.finish, 10);
        el.textContent = formatCountdown(Math.max(0, finish - now));
      });
      // Update progress bars
      gridContainer.querySelectorAll(".tom-timer-badge [data-pct-start]").forEach((fill) => {
        const start = parseInt(fill.dataset.pctStart, 10);
        const finish = parseInt(fill.dataset.pctFinish, 10);
        const total = finish - start;
        const pct = total > 0 ? Math.min(100, Math.max(0, ((now - start) / total) * 100)) : 0;
        fill.style.width = Math.max(3, pct).toFixed(1) + "%";
        const isUrgent = (finish - now) > 0 && total > 0 && (finish - now) < total * 0.25;
        fill.style.boxShadow = isUrgent ? "0 0 3px rgba(255,180,171,0.4)" : "";
      });
      return;
    }
    lastTimerBadgeKey = timerBadgeKey;

    // Full rebuild
    document.querySelectorAll(".tom-timer-badge").forEach((el) => el.remove());

    // Worker lookup from parsed data (id → building info)
    const workerById = {};
    if (parsed?.allBuildings) {
      for (const b of parsed.allBuildings) workerById[String(b.id)] = b;
    }

    // Buildings with active crafting timers
    const craftIds = new Set(
      timers
        .filter((t) => t.callbackArgs?.recipeName && t.callbackArgs?.buildingId)
        .map((t) => String(t.callbackArgs.buildingId)),
    );

    // Group timers by building, pick highest priority
    // Priority: Build(0) > Upgrade(1) > Craft(2) > Training(3)
    const bestTimer = {};
    for (const timer of timers) {
      if (timer.callbackType === "addResearchedTech") continue;
      const args = timer.callbackArgs;
      if (!args || !args.buildingId) continue;
      const building = buildingMap[args.buildingId];
      if (!building) continue;
      const pos = tilePositions[`${building.x},${building.y}`];
      if (!pos) continue;

      let priority = 3;
      let icon = "\u2694"; // ⚔ training
      let color = "#88d982";
      if (timer.callbackType === "completeConstruction") {
        if ((timer.label || "").startsWith("Upgrading")) {
          priority = 1;
          icon = "\u25B2";
          color = "#e9c176"; // ▲ upgrade (gold)
        } else {
          priority = 0;
          icon = "\u2692";
          color = "#e9c176"; // ⚒ build (gold)
        }
      } else if (args.recipeName) {
        priority = 2;
        icon = "\u2699";
        color = "#e7bdb1"; // ⚙ craft (cream)
      }

      const bid = args.buildingId;
      if (!bestTimer[bid] || priority < bestTimer[bid].priority) {
        bestTimer[bid] = { timer, args, building, pos, priority, icon, color };
      }
    }

    // Render one badge per building
    for (const [buildingId, entry] of Object.entries(bestTimer)) {
      const { timer, args, building, pos, icon, color: baseColor } = entry;
      const left = parseInt(pos.left, 10);
      const topRaw = parseInt(pos.top, 10);
      const bottomRaw = parseInt(pos.bottom, 10);

      const finishTime = args.finishTime || timer.timestamp;
      if (!finishTime) continue;
      const remaining = finishTime - now;
      const fsKey = `${buildingId}-${finishTime}`;
      if (!timerFirstSeen[fsKey]) timerFirstSeen[fsKey] = now;
      const totalDuration = finishTime - timerFirstSeen[fsKey];
      const pct =
        totalDuration > 0
          ? Math.min(
              100,
              Math.max(
                0,
                ((now - timerFirstSeen[fsKey]) / totalDuration) * 100,
              ),
            )
          : 0;
      const isUrgent =
        remaining > 0 && totalDuration > 0 && remaining < totalDuration * 0.25;
      const color = isUrgent ? "#ffb4ab" : baseColor;

      const badge = document.createElement("div");
      badge.className = "tom-timer-badge";

      // Time text
      const timeEl = document.createElement("span");
      timeEl.className = "tom-badge-time";
      timeEl.dataset.finish = finishTime;
      timeEl.textContent = formatCountdown(remaining);
      badge.appendChild(timeEl);

      // Icon + bar row
      const barRow = document.createElement("div");
      barRow.style.display = "flex";
      barRow.style.alignItems = "center";
      barRow.style.gap = "3px";

      const iconEl = document.createElement("span");
      iconEl.style.fontSize = "5px";
      iconEl.style.color = color;
      iconEl.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
      iconEl.textContent = icon;
      barRow.appendChild(iconEl);

      const track = document.createElement("div");
      track.style.width = "40px";
      track.style.height = "4px";
      track.style.background = "rgba(255,255,255,0.15)";
      track.style.borderRadius = "2px";
      track.style.overflow = "hidden";
      track.style.outline = "1px solid rgba(0,0,0,0.4)";
      const fill = document.createElement("div");
      fill.style.width = Math.max(3, pct).toFixed(1) + "%";
      fill.style.height = "100%";
      fill.style.borderRadius = "2px";
      fill.style.background = color;
      fill.dataset.pctStart = timerFirstSeen[fsKey];
      fill.dataset.pctFinish = finishTime;
      if (isUrgent) fill.style.boxShadow = "0 0 3px rgba(255,180,171,0.4)";
      track.appendChild(fill);
      barRow.appendChild(track);
      badge.appendChild(barRow);

      // Workers + craft label
      const slugMatch = (building.slug || "").match(/(\d+)$/);
      const lvl = slugMatch ? parseInt(slugMatch[1]) : 0;
      const bInfo = workerById[String(buildingId)];
      const assignees = bInfo?.assignees || 0;
      const hasCraft = craftIds.has(String(buildingId));
      const isCraftBldg = /^crafter/.test(building.slug || "");
      const craftIdle = isCraftBldg && !hasCraft;
      if ((assignees > 0 && lvl > 0) || craftIdle) {
        const ratio = lvl > 0 ? assignees / lvl : 0;
        const isFull = ratio >= 1;
        const wColor = getWorkerColor(ratio, isFull, craftIdle, assignees);
        let wText = "";
        if (assignees > 0) {
          wText = isFull ? "Full!" : `${assignees}/${lvl}`;
          if (craftIdle) wText += " | No Craft";
        } else {
          wText = "No Craft";
        }
        const wEl = document.createElement("span");
        wEl.style.fontFamily = "'Work Sans', system-ui, sans-serif";
        wEl.style.fontSize = "6px";
        wEl.style.fontWeight = "700";
        wEl.style.color = wColor;
        wEl.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
        wEl.style.marginTop = "1px";
        wEl.textContent = wText;
        badge.appendChild(wEl);
      }

      badge.style.left = left + 60 + "px";
      if (!Number.isNaN(bottomRaw)) {
        badge.style.bottom = bottomRaw + 60 + "px";
      } else {
        badge.style.top = topRaw - 8 + "px";
      }
      gridContainer.appendChild(badge);
    }

    // Research badge on academy
    const researchTimers = timers.filter(
      (t) => t.callbackType === "addResearchedTech",
    );
    if (researchTimers.length > 0) {
      const academy = Object.values(buildingMap).find((b) =>
        /^academy/.test(b.slug),
      );
      if (academy) {
        const pos = tilePositions[`${academy.x},${academy.y}`];
        if (pos) {
          const left = parseInt(pos.left, 10);
          const topRaw = parseInt(pos.top, 10);
          const bottomRaw = parseInt(pos.bottom, 10);
          const badge = document.createElement("div");
          badge.className = "tom-timer-badge";
          for (const t of researchTimers) {
            const remaining = (t.timestamp || 0) - now;
            const rfsKey = `research-${t.timestamp}`;
            if (!timerFirstSeen[rfsKey]) timerFirstSeen[rfsKey] = now;
            const rTotal = t.timestamp - timerFirstSeen[rfsKey];
            const rPct =
              rTotal > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      ((now - timerFirstSeen[rfsKey]) / rTotal) * 100,
                    ),
                  )
                : 0;
            const rUrgent =
              remaining > 0 && rTotal > 0 && remaining < rTotal * 0.25;
            const rColor = rUrgent ? "#ffb4ab" : "#a855f7";

            const timeEl = document.createElement("span");
            timeEl.className = "tom-badge-time";
            timeEl.dataset.finish = t.timestamp || 0;
            timeEl.textContent = formatCountdown(remaining);
            badge.appendChild(timeEl);

            const track = document.createElement("div");
            track.style.width = "40px";
            track.style.height = "4px";
            track.style.background = "rgba(255,255,255,0.15)";
            track.style.borderRadius = "2px";
            track.style.overflow = "hidden";
            track.style.outline = "1px solid rgba(0,0,0,0.4)";
            const fill = document.createElement("div");
            fill.style.width = Math.max(3, rPct).toFixed(1) + "%";
            fill.style.height = "100%";
            fill.style.borderRadius = "2px";
            fill.style.background = rColor;
            fill.dataset.pctStart = timerFirstSeen[rfsKey];
            fill.dataset.pctFinish = t.timestamp;
            if (rUrgent) fill.style.boxShadow = "0 0 3px rgba(255,180,171,0.4)";
            track.appendChild(fill);
            badge.appendChild(track);
          }
          badge.style.left = left + 60 + "px";
          if (!Number.isNaN(bottomRaw)) {
            badge.style.bottom = bottomRaw + 60 + "px";
          } else {
            badge.style.top = topRaw - 8 + "px";
          }
          gridContainer.appendChild(badge);
        }
      }
    }

    // Prune stale entries from timerFirstSeen and clearedTimers
    const activeKeys = new Set();
    for (const t of timers) {
      const a = t.callbackArgs;
      if (a?.buildingId)
        activeKeys.add(`${a.buildingId}-${a.finishTime || t.timestamp}`);
      if (t.callbackType === "addResearchedTech")
        activeKeys.add(`research-${t.timestamp}`);
    }
    for (const key of Object.keys(timerFirstSeen)) {
      if (!activeKeys.has(key)) delete timerFirstSeen[key];
    }
    for (const key of clearedTimers) {
      if (!activeKeys.has(key)) clearedTimers.delete(key);
    }
  }
