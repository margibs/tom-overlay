  // --- Panel Renderer ---
  function renderPanel(parsed) {
    let panel = document.getElementById("tom-overlay");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "tom-overlay";
      panel.innerHTML = `
        <div id="tom-overlay-header">
          <div class="tom-tabs">
            <span class="tom-tab active" data-tab="overview">Overview</span>
            <span class="tom-tab" data-tab="crafting">Crafting</span>
            <span class="tom-tab" data-tab="trade">Trade</span>
            <span class="tom-tab" data-tab="market">Market</span>
          </div>
          <span class="tom-version">v${VERSION}</span>
          <span class="tom-toggle" id="tom-toggle">&blacktriangledown;</span>
        </div>
        <div id="tom-overlay-body">
          <div id="tom-tab-overview" class="tom-tab-content active"></div>
          <div id="tom-tab-crafting" class="tom-tab-content"></div>
          <div id="tom-tab-trade" class="tom-tab-content"></div>
          <div id="tom-tab-market" class="tom-tab-content"></div>
        </div>
      `;
      document.body.appendChild(panel);
      initDrag(panel);
      document.getElementById("tom-toggle").addEventListener("click", () => {
        const body = document.getElementById("tom-overlay-body");
        const toggle = document.getElementById("tom-toggle");
        body.classList.toggle("collapsed");
        const isCollapsed = body.classList.contains("collapsed");
        toggle.textContent = isCollapsed ? "\u25B8" : "\u25BE";
        // Reset explicit height from resize so collapsed state shrinks properly
        if (isCollapsed) {
          panel.style.height = "auto";
        }
      });
      // Tab switching
      panel.querySelectorAll(".tom-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          panel
            .querySelectorAll(".tom-tab")
            .forEach((t) => t.classList.remove("active"));
          panel
            .querySelectorAll(".tom-tab-content")
            .forEach((c) => c.classList.remove("active"));
          tab.classList.add("active");
          document
            .getElementById("tom-tab-" + tab.dataset.tab)
            .classList.add("active");
        });
      });

      // Active crafting queue collapse toggle (event delegation)
      document
        .getElementById("tom-tab-crafting")
        .addEventListener("click", (e) => {
          if (e.target.closest("#tom-aq-header")) {
            const collapsed =
              localStorage.getItem("tom-craft-queue-collapsed") === "1";
            localStorage.setItem(
              "tom-craft-queue-collapsed",
              collapsed ? "0" : "1",
            );
            lastCraftTimerKey = ""; // force full rebuild on next tick
            renderActiveCraftingQueue();
          }
        });

      // Render Trade tab static UI (options built from TRADE_ITEMS)
      const opts = TRADE_ITEMS.map(
        (i) => `<option value="${i.slug}">${i.name}</option>`,
      ).join("");
      document.getElementById("tom-tab-trade").innerHTML = `
        <div class="tom-section">
          <div class="tom-section-title">Trade Evaluator</div>
          <div class="tom-trade-row">
            <span class="tom-trade-side tom-trade-get">GET</span>
            <select id="tom-trade-get-item" class="tom-trade-select">${opts}</select>
            <input id="tom-trade-get-qty" class="tom-trade-input" type="number" min="1" value="1000">
          </div>
          <div class="tom-trade-row">
            <span class="tom-trade-side tom-trade-give">GIVE</span>
            <select id="tom-trade-give-item" class="tom-trade-select">${opts}</select>
            <input id="tom-trade-give-qty" class="tom-trade-input" type="number" min="1" value="100">
          </div>
          <button id="tom-trade-eval" class="tom-trade-btn">Evaluate</button>
          <div id="tom-trade-result"></div>
        </div>
      `;

      document
        .getElementById("tom-trade-eval")
        .addEventListener("click", () => {
          const getSlug = document.getElementById("tom-trade-get-item").value;
          const giveSlug = document.getElementById("tom-trade-give-item").value;
          const getQty = Math.max(
            1,
            parseInt(document.getElementById("tom-trade-get-qty").value) || 1,
          );
          const giveQty = Math.max(
            1,
            parseInt(document.getElementById("tom-trade-give-qty").value) || 1,
          );
          const getVal = calcValue(getSlug, getQty);
          const giveVal = calcValue(giveSlug, giveQty);
          const res = document.getElementById("tom-trade-result");

          if (!getVal || !giveVal) {
            res.innerHTML = `<div class="tom-trade-unknown">⚠ One or more items have unknown value (gold dust has no production cost).</div>`;
            return;
          }

          const ratio = giveVal.wm > 0 ? getVal.wm / giveVal.wm : Infinity;
          const pct = ((ratio - 1) * 100).toFixed(0);
          let verdict, vClass;
          if (ratio >= 1.5) {
            verdict = "✅ Great Deal";
            vClass = "tom-trade-great";
          } else if (ratio >= 0.9) {
            verdict = "⚖ Fair";
            vClass = "tom-trade-fair";
          } else {
            verdict = "❌ Bad Deal";
            vClass = "tom-trade-bad";
          }

          const favorStr =
            ratio >= 1
              ? `${ratio.toFixed(2)}x in your favor (+${pct}%)`
              : `${(1 / ratio).toFixed(2)}x against you (${pct}%)`;

          res.innerHTML = `
          <div class="tom-trade-result-inner">
            <div class="tom-trade-result-row">
              <span class="tom-trade-side tom-trade-get">GET</span>
              <span>${getQty.toLocaleString()} × ${TRADE_ITEMS.find((i) => i.slug === getSlug)?.name}</span>
            </div>
            <div class="tom-trade-breakdown">Materials: ${fmtBase(getVal.base)}</div>
            ${getVal.craftSecs > 0 ? `<div class="tom-trade-breakdown">Craft time: ${getVal.craftSecs}s → ${getVal.craftWm.toFixed(1)} wm</div>` : ""}
            <div class="tom-trade-wm">Total: <strong>${Math.round(getVal.wm).toLocaleString()} wm</strong>${getVal.craftSecs > 0 ? ` <span style="color:#555">(${Math.round(getVal.matWm)} mat + ${Math.round(getVal.craftWm)} time)</span>` : ""}</div>
            <div class="tom-trade-result-row" style="margin-top:6px">
              <span class="tom-trade-side tom-trade-give">GIVE</span>
              <span>${giveQty.toLocaleString()} × ${TRADE_ITEMS.find((i) => i.slug === giveSlug)?.name}</span>
            </div>
            <div class="tom-trade-breakdown">Materials: ${fmtBase(giveVal.base)}</div>
            ${giveVal.craftSecs > 0 ? `<div class="tom-trade-breakdown">Craft time: ${giveVal.craftSecs}s → ${giveVal.craftWm.toFixed(1)} wm</div>` : ""}
            <div class="tom-trade-wm">Total: <strong>${Math.round(giveVal.wm).toLocaleString()} wm</strong>${giveVal.craftSecs > 0 ? ` <span style="color:#555">(${Math.round(giveVal.matWm)} mat + ${Math.round(giveVal.craftWm)} time)</span>` : ""}</div>
            <div class="tom-trade-verdict ${vClass}">
              ${verdict} — ${favorStr}
            </div>
          </div>
        `;
        });
    }

    const {
      summary,
      resources,
      withheld,
      capacities,
      production,
      allPopulations,
      allBuildings,
      idleWorkers,
      totalIdle,
      assignedBuildings,
      underConstruction,
    } = parsed;

    // --- Overview Tab ---
    let html = "";

    // Summary
    const allTimers = getActiveTimers();
    const queueUsed = allTimers.filter(
      (t) => t.callbackType === "completeConstruction",
    ).length;
    const queueLabel = buildingQueueMax
      ? `${queueUsed}/${buildingQueueMax}`
      : `${queueUsed}`;
    const queueFull = buildingQueueMax && queueUsed >= buildingQueueMax;
    const consumption = summary.population + summary.troops * 2;
    const foodNet = production.food - consumption;
    const isGrowing = foodNet > 0;
    const growthColor = isGrowing ? "#4ade80" : "#ef4444";
    const growthLabel = isGrowing ? "Growing" : "Halted";
    const growthTooltip = `Prod ${production.food.toLocaleString()} vs Cons ${consumption.toLocaleString()} (${summary.population} + ${summary.troops}×2)`;
    html += `<div class="tom-section">
      <span class="tom-stat">Pop <span class="tom-stat-value">${summary.population}/${summary.populationCapacity}</span></span>
      <span class="tom-stat">Troops <span class="tom-stat-value">${summary.troops}/${summary.troopsCapacity}</span></span>
      <span class="tom-stat">Morale <span class="tom-stat-value">${summary.morale}%</span></span>
      <span class="tom-stat">Queue <span class="tom-stat-value" style="color:${queueFull ? "#ef4444" : "#fff"}">${queueLabel}${queueFull ? " FULL" : ""}</span></span>
      <span class="tom-stat" title="${growthTooltip}">Growth <span class="tom-stat-value" style="color:${growthColor}">${growthLabel}</span></span>
    </div>`;

    // Food economy
    const netSign = foodNet > 0 ? "+" : "";
    const netColor = foodNet > 0 ? "#4ade80" : foodNet < 0 ? "#ef4444" : "#fff";
    let foodTimeLabel = "";
    if (foodNet < 0) {
      const secs = (resources.food / Math.abs(foodNet)) * tickInterval;
      const hrs = secs / 3600;
      foodTimeLabel = hrs < 1 ? `${Math.round(hrs * 60)}m` : `${hrs.toFixed(1)}h`;
    } else if (foodNet > 0 && resources.food < capacities.food) {
      const secs = ((capacities.food - resources.food) / foodNet) * tickInterval;
      const hrs = secs / 3600;
      foodTimeLabel = hrs < 1 ? `${Math.round(hrs * 60)}m` : `${hrs.toFixed(1)}h`;
    }
    const foodEconTooltip = `${summary.population} commoners + ${summary.troops}×2 troops = ${consumption.toLocaleString()}`;
    html += `<div class="tom-section" style="border-top:1px solid rgba(255,255,255,0.05);padding-top:4px">
      <span class="tom-stat" title="${foodEconTooltip}">Cons <span class="tom-stat-value">${consumption.toLocaleString()}</span></span>
      <span class="tom-stat">Prod <span class="tom-stat-value">${production.food.toLocaleString()}</span></span>
      <span class="tom-stat">Net <span class="tom-stat-value" style="color:${netColor}">${netSign}${foodNet.toLocaleString()}/tick</span></span>
      ${foodNet < 0 && foodTimeLabel ? `<span class="tom-stat">Depletes <span class="tom-stat-value" style="color:#ef4444">${foodTimeLabel}</span></span>` : ""}
      ${foodNet > 0 && resources.food >= capacities.food ? `<span class="tom-stat">Storage <span class="tom-stat-value" style="color:#4ade80">FULL</span></span>` : ""}
      ${foodNet > 0 && resources.food < capacities.food && foodTimeLabel ? `<span class="tom-stat">Full in <span class="tom-stat-value" style="color:#4ade80">${foodTimeLabel}</span></span>` : ""}
    </div>`;

    // Resources
    const perHour = (rate) => Math.round((rate * 3600) / tickInterval);
    const timeToFull = (current, capacity, rate) => {
      const ratePerHr = perHour(rate);
      if (ratePerHr <= 0) return "";
      if (current >= capacity)
        return " <span style='color:#4ade80'>FULL</span>";
      const hrs = (capacity - current) / ratePerHr;
      if (hrs < 1)
        return ` <span class="tom-res-rate">(full in ${Math.round(hrs * 60)}m)</span>`;
      return ` <span class="tom-res-rate">(full in ${hrs.toFixed(1)}h)</span>`;
    };
    const resRow = (label, cssClass, total, held, cap, rate) => {
      const avail = total - held;
      const heldStr =
        held > 0
          ? ` <span style="color:#fb923c;font-size:11px">(-${held.toLocaleString()})</span>`
          : "";
      return `<div class="tom-res-row ${cssClass}">
        <span class="tom-res-label">${label}</span>
        <span><span class="tom-res-value">${avail.toLocaleString()}</span>${heldStr} <span class="tom-res-rate">+${perHour(rate).toLocaleString()}/hr</span>${timeToFull(total, cap, rate)}</span>
      </div>`;
    };
    html += `<div class="tom-section">`;
    html += `<div class="tom-section-title">Resources</div>`;
    html += resRow(
      "Food",
      "tom-res-food",
      resources.food,
      withheld.food,
      capacities.food,
      production.food,
    );
    html += resRow(
      "Wood",
      "tom-res-wood",
      resources.wood,
      withheld.wood,
      capacities.wood,
      production.wood,
    );
    html += resRow(
      "Mineral",
      "tom-res-mineral",
      resources.mineral,
      withheld.mineral,
      capacities.mineral,
      production.mineral,
    );
    html += `</div>`;

    // Population cards
    if (allPopulations.length > 0) {
      html += `<div class="tom-section">`;
      html += `<div class="tom-section-title">Population</div>`;
      for (const p of allPopulations) {
        const hasIdle = p.idle > 0;
        const trainLine =
          p.trainable !== null
            ? `<div style="font-size:11px;margin-top:2px;"><span style="color:${p.trainable > 0 ? "#4ade80" : "#ef4444"}">Can train: ${p.trainable}</span>${
                p.trainingCost
                  ? ` <span style="color:#666;font-size:10px">(${Object.entries(
                      p.trainingCost,
                    )
                      .map(([k, v]) => `${v} ${k}`)
                      .join(", ")})</span>`
                  : ""
              }</div>`
            : "";
        html += `<div class="tom-pop-card${hasIdle ? " tom-pop-idle-alert" : ""}">
          <div class="tom-pop-name"><span>${p.label}</span><span class="tom-pop-total">${p.total}</span></div>
          <div class="tom-pop-stats">
            <span>Idle <span class="tom-pop-val">${p.idle}</span></span>
            <span>Assigned <span class="tom-pop-val">${p.assigned}</span></span>
            <span>Training <span class="tom-pop-val">${p.training}</span></span>
          </div>
          ${trainLine}
        </div>`;
      }
      html += `</div>`;
    }

    // Building counts grouped by category
    const buildingCounts = {};
    for (const b of allBuildings) {
      const base = b.slug.replace(/\d+$/, "").replace(/_$/, "");
      const label = base
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      if (!buildingCounts[base])
        buildingCounts[base] = { label, category: b.category, count: 0 };
      buildingCounts[base].count++;
    }
    const catNames = {
      resource: "Resource",
      military: "Military",
      crafting: "Crafting",
      infrastructure: "Infra",
    };
    const catColors = {
      resource: "#22c55e",
      military: "#ef4444",
      crafting: "#a855f7",
      infrastructure: "#3b82f6",
    };
    const bGrouped = {};
    for (const b of Object.values(buildingCounts)) {
      if (!bGrouped[b.category]) bGrouped[b.category] = { items: [], total: 0 };
      bGrouped[b.category].items.push(b);
      bGrouped[b.category].total += b.count;
    }
    for (const g of Object.values(bGrouped))
      g.items.sort((a, b) => b.count - a.count);
    html += `<div class="tom-section">`;
    html += `<div class="tom-section-title">Buildings (${allBuildings.length})</div>`;
    for (const cat of ["resource", "military", "crafting", "infrastructure"]) {
      const g = bGrouped[cat];
      if (!g) continue;
      const color = catColors[cat] || "#888";
      const name = catNames[cat] || cat;
      const items = g.items
        .map((b) => `${b.label} <span style="color:#fff">${b.count}</span>`)
        .join(" · ");
      html += `<div style="margin-bottom:4px;">
        <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:1px;">${name} <span style="color:#888;font-weight:400">(${g.total})</span></div>
        <div style="font-size:10px;color:#aaa;padding-left:4px;">${items}</div>
      </div>`;
    }
    html += `</div>`;

    // Assigned workers — grouped by base type with capacity
    if (assignedBuildings.length > 0) {
      const grouped = {};
      // Sum assigned per type
      for (const b of assignedBuildings) {
        const base = b.slug.replace(/\d+$/, "");
        const label = base
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        if (!grouped[base])
          grouped[base] = {
            label,
            category: b.category,
            total: 0,
            capacity: 0,
          };
        grouped[base].total += b.assignees;
      }
      // Sum capacity per type across ALL buildings (not just assigned)
      for (const b of allBuildings) {
        const base = b.slug.replace(/\d+$/, "");
        if (!grouped[base]) continue; // only show types that have assignees
        const m = b.slug.match(/(\d+)$/);
        grouped[base].capacity += m ? parseInt(m[1]) : 1;
      }
      const entries = Object.values(grouped).sort((a, b) => b.total - a.total);
      html += `<div class="tom-section">`;
      html += `<div class="tom-section-title">Assigned Workers</div>`;
      for (const g of entries) {
        html += `<div class="tom-row">
          <span class="tom-row-label"><span class="tom-row-cat tom-cat-${g.category}"></span>${g.label}</span>
          <span class="tom-row-value">${g.total}/${g.capacity}</span>
        </div>`;
      }
      html += `</div>`;
    }

    // Research
    const researchTimers = getActiveTimers().filter(
      (t) => t.callbackType === "addResearchedTech",
    );
    if (researchTimers.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      html += `<div class="tom-construction" style="border-left-color:#a855f7;">`;
      html += `<div class="tom-section-title">Research</div>`;
      for (const t of researchTimers) {
        const remaining = (t.timestamp || 0) - now;
        const name = t.label.replace(/^Researching\s+/i, "");
        html += `<div class="tom-row">
          <span class="tom-row-label"><span class="tom-row-cat tom-cat-crafting"></span>${name}</span>
          <span class="tom-row-value">${formatCountdown(remaining)}</span>
        </div>`;
      }
      html += `</div>`;
    }

    // Under construction
    if (underConstruction.length > 0) {
      html += `<div class="tom-construction">`;
      html += `<div class="tom-section-title">Under Construction</div>`;
      for (const b of underConstruction) {
        html += `<div class="tom-row">
          <span class="tom-row-label"><span class="tom-row-cat tom-cat-${b.category}"></span>${b.label}<span class="tom-row-coord">(${b.x},${b.y})</span></span>
          <span class="tom-row-value">${b.builders} builders</span>
        </div>`;
      }
      html += `</div>`;
    }

    document.getElementById("tom-tab-overview").innerHTML = html;

    // --- Crafting Tab ---
    const matColor = (slug) => {
      if (slug === "food") return "tom-craft-mat-food";
      if (slug === "wood") return "tom-craft-mat-wood";
      if (slug === "mineral") return "tom-craft-mat-mineral";
      if (slug === "gold_dust") return "tom-craft-mat-gold_dust";
      return "";
    };
    const matLabel = (slug) =>
      slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const fmtCost = (costs) =>
      Object.entries(costs)
        .map(
          ([mat, amt]) =>
            `<span class="tom-craft-mat ${matColor(mat)}">${amt % 1 === 0 ? amt : amt.toFixed(2)} ${matLabel(mat)}</span>`,
        )
        .join(", ");

    // Build inventory from parsed resources + full item data
    const craftInventory = { ...resources };
    // Include non-base items from townData if available
    if (townData?.items) {
      for (const [key, item] of Object.entries(townData.items)) {
        const held =
          (item.crafting_quantity_withheld || 0) +
          (item.market_quantity_withheld || 0) +
          (item.server_withheld || 0);
        craftInventory[key] = Math.max(0, (item.quantity || 0) - held);
      }
    }

    // Build reverse lookup: slug → recipes that use it
    const requiredBy = {};
    for (const recipe of CRAFT_RECIPES) {
      for (const ing of recipe.ingredients) {
        if (!requiredBy[ing.slug]) requiredBy[ing.slug] = [];
        requiredBy[ing.slug].push({ recipe, qty: ing.qty });
      }
    }

    let craftHtml = "";
    const tribeLocked = getTribeLocked();
    for (const recipe of CRAFT_RECIPES) {
      const isLocked = tribeLocked.has(recipe.slug);
      const exclusiveTribe = TRIBE_EXCLUSIVE[recipe.slug];
      const baseCost = resolveBaseCost(recipe);
      const steps = getCraftSteps(recipe);
      const canCraft = maxCraftable(recipe, craftInventory);
      const totalYield = canCraft * recipe.yield;
      const craftSecs = totalCraftTime(recipe);
      const craftWm = craftSecs / 60;

      craftHtml += `<div class="tom-craft-card${isLocked ? ' tom-craft-locked' : ''}">`;
      // Header
      const owned = craftInventory[recipe.slug] || 0;
      craftHtml += `<div class="tom-craft-header">
        <span class="tom-craft-name">${recipe.name} <span class="tom-craft-yield">(${recipe.yield}x)</span> — <span style="color:#fff">${owned.toLocaleString()}</span></span>
        <span class="tom-craft-time">${recipe.time != null ? recipe.time + 's' : 'TBA'}</span>
      </div>`;
      if (isLocked) {
        const tribeLabel = exclusiveTribe ? exclusiveTribe.replace(/_/g, ' ') : 'other tribe';
        craftHtml += `<div class="tom-tribe-lock-badge">Tribe Locked — ${tribeLabel} only</div>`;
      }

      // Craft steps (only for recipes with intermediate ingredients)
      if (steps.length > 0) {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (s.external) {
            craftHtml += `<div class="tom-craft-step tom-craft-step-external">
              <span class="tom-craft-step-acquire">Acquire:</span> ${s.needed} × ${s.recipe.name} <span style="color:#555">(trade/buy — other tribe)</span>
            </div>`;
          } else {
            const ingDesc = s.recipe.ingredients
              .map((ing) => `${ing.qty * s.crafts} ${matLabel(ing.slug)}`)
              .join(" + ");
            craftHtml += `<div class="tom-craft-step">
              <span class="tom-craft-step-label">Step ${i + 1}:</span> ${s.recipe.name} — ${s.crafts} craft${s.crafts > 1 ? "s" : ""} (${ingDesc}) = ${s.crafts * s.recipe.yield} ${matLabel(s.recipe.slug)}
            </div>`;
          }
        }
        // Final step
        const finalIngDesc = recipe.ingredients
          .map((ing) => `${ing.qty} ${matLabel(ing.slug)}`)
          .join(" + ");
        craftHtml += `<div class="tom-craft-step">
          <span class="tom-craft-step-label">Step ${steps.length + 1}:</span> ${recipe.name} — ${finalIngDesc}
        </div>`;
      }

      // Base cost
      craftHtml += `<div class="tom-craft-base">`;
      craftHtml += `<div><span class="tom-craft-base-label">Total base cost:</span> ${fmtCost(baseCost)}</div>`;
      craftHtml += `<div><span class="tom-craft-base-label">Craft time:</span> <span style="color:#e0e0e0">${craftSecs}s total</span> <span style="color:#888;font-size:10px">→ ${craftWm.toFixed(1)} wm</span></div>`;
      if (recipe.yield > 1) {
        const perUnit = {};
        for (const [mat, amt] of Object.entries(baseCost))
          perUnit[mat] = amt / recipe.yield;
        craftHtml += `<div><span class="tom-craft-base-label">Per unit:</span> ${fmtCost(perUnit)}</div>`;
      }
      craftHtml += `</div>`;

      // Craftable count
      const canClass = canCraft > 0 ? "tom-craft-can-yes" : "tom-craft-can-no";
      craftHtml += `<span class="tom-craft-can ${canClass}">Can craft: ${canCraft}${totalYield !== canCraft ? ` (${totalYield} units)` : ""}</span>`;

      // Required by
      const deps = requiredBy[recipe.slug];
      if (deps && deps.length > 0) {
        craftHtml += `<details class="tom-craft-reqby"><summary>Required by (${deps.length})</summary>`;
        for (const d of deps) {
          craftHtml += `<div class="tom-craft-reqby-item">${d.recipe.name} — ${d.qty} ${recipe.name}</div>`;
        }
        craftHtml += `</details>`;
      }

      craftHtml += `</div>`;
    }

    const craftTab = document.getElementById("tom-tab-crafting");
    const prevSearch = craftTab.querySelector("#tom-craft-search")?.value || "";
    craftTab.innerHTML = `
      <div id="tom-aq-section" class="tom-aq-section"></div>
      <div style="padding:4px 0 6px">
        <input id="tom-craft-search" class="tom-craft-search" type="text" placeholder="Search recipes…" value="${prevSearch.replace(/"/g, "&quot;")}">
      </div>
      <div id="tom-craft-list">${craftHtml}</div>
    `;
    lastCraftTimerKey = ""; // section was rebuilt, force full queue render
    renderActiveCraftingQueue();
    const searchEl = document.getElementById("tom-craft-search");
    const listEl = document.getElementById("tom-craft-list");
    function applySearch(q) {
      const lower = q.toLowerCase();
      listEl.querySelectorAll(".tom-craft-card").forEach((card) => {
        const name =
          card.querySelector(".tom-craft-name")?.textContent?.toLowerCase() ||
          "";
        card.style.display = name.includes(lower) ? "" : "none";
      });
    }
    applySearch(prevSearch);
    searchEl.addEventListener("input", (e) => applySearch(e.target.value));
    renderMarketTab();
  }

  function renderMarketTab() {
    const el = document.getElementById("tom-tab-market");
    if (!el) return;

    if (!lastMarketTrades) {
      el.innerHTML = `<div class="tom-section"><div class="tom-market-empty">Open a market building to load listings.</div></div>`;
      return;
    }

    const { items, meta } = lastMarketTrades;

    // Evaluate and sort by ratio descending
    const rows = items
      .map((trade) => {
        const getVal = calcValue(trade.offer_item, trade.offer_quantity);
        const giveVal = calcValue(trade.taker_item, trade.taker_quantity);
        const ratio =
          getVal && giveVal && giveVal.wm > 0
            ? getVal.wm / giveVal.wm
            : null;
        return { trade, getVal, giveVal, ratio };
      })
      .sort((a, b) => {
        if (a.ratio === null && b.ratio === null) return 0;
        if (a.ratio === null) return 1;
        if (b.ratio === null) return -1;
        return b.ratio - a.ratio;
      });

    const fmtSlug = (slug) =>
      slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    let html = `<div class="tom-section">`;
    html += `<div class="tom-section-title">Market Listings <span style="color:#555;font-weight:400;font-size:10px">Page ${meta.current_page}/${meta.total_pages}</span></div>`;

    for (const { trade, getVal, giveVal, ratio } of rows) {
      let badgeClass, badgeText;
      if (ratio === null) {
        badgeClass = "tom-market-badge-unknown";
        badgeText = "?";
      } else if (ratio >= 1.0) {
        badgeClass = "tom-market-badge-good";
        badgeText = ratio.toFixed(2) + "x";
      } else if (ratio >= 0.8) {
        badgeClass = "tom-market-badge-fair";
        badgeText = ratio.toFixed(2) + "x";
      } else {
        badgeClass = "tom-market-badge-bad";
        badgeText = ratio.toFixed(2) + "x";
      }

      const getWm = getVal ? Math.round(getVal.wm) : "?";
      const giveWm = giveVal ? Math.round(giveVal.wm) : "?";

      html += `<div class="tom-market-row">
        <span class="tom-market-badge ${badgeClass}">${badgeText}</span>
        <div class="tom-market-sides">
          <div><span class="tom-trade-side tom-trade-get">GET</span> <span class="tom-market-item">${trade.offer_quantity.toLocaleString()} ${fmtSlug(trade.offer_item)}</span> <span class="tom-market-wm">${getWm} wm</span></div>
          <div><span class="tom-trade-side tom-trade-give">GIVE</span> <span class="tom-market-item">${trade.taker_quantity.toLocaleString()} ${fmtSlug(trade.taker_item)}</span> <span class="tom-market-wm">${giveWm} wm</span></div>
        </div>
      </div>`;
    }

    html += `</div>`;
    el.innerHTML = html;
  }

  // --- Drag Logic ---
  function initDrag(panel) {
    const header = panel.querySelector("#tom-overlay-header");
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      panel.style.transition = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      panel.style.left = e.clientX - offsetX + "px";
      panel.style.top = e.clientY - offsetY + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }
