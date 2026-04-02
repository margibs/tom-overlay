// ==UserScript==
// @name         Tribes of Malaya — Worker Overlay
// @namespace    https://war.add.ph
// @version      1.0.0
// @description  Shows worker assignments, idle workers, and construction status as an overlay
// @match        https://war.add.ph/my/town/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  let townData = null;
  let tickInterval = 300; // seconds; updated dynamically from last_food_production_time
  let popRatePerSec = 0;  // population_remainder units per second; measured from API deltas
  let buildingQueueMax = null; // detected from failed PATCH response
  const listeners = [];

  function onTownData(callback) {
    listeners.push(callback);
    if (townData) callback(townData);
  }

  function notifyListeners(data) {
    townData = data;
    listeners.forEach((cb) => cb(data));
  }

  // --- Fetch Intercept ---
  const originalFetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";

    const response = await originalFetch.apply(this, [input, init]);

    if (/\/my\/town\/\d+$/.test(url)) {
      // Town data — handled by notifyListeners → onTownData
      response.clone().json().then((json) => {
        if (json && json.tiles && json.populations) {
          console.log("[TOM] town keys:", Object.keys(json));
          console.log("[TOM] tick fields:", Object.fromEntries(Object.entries(json).filter(([k]) => /tick|interval|cycle|rate|time/i.test(k))));
          notifyListeners(json);
        }
      }).catch(() => {});
    }

    return response;
  };

  // --- XHR Intercept (fallback) ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._tomUrl = url;
    this._tomMethod = method;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this._tomUrl && /\/my\/town\/\d+$/.test(this._tomUrl)) {
      this.addEventListener("load", function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.tiles && json.populations) {
            const t = json.last_food_production_time;
            if (t) {
              const prev = window._tomLastFoodTime;
              if (prev && t !== prev) {
                tickInterval = t - prev;
              }
              window._tomLastFoodTime = t;
            }
            const r = json.population_remainder;
            const prev = window._tomLastRemainder;
            const prevTime = window._tomLastRemainderTime;
            const now = Date.now() / 1000;
            if (prev !== undefined && r > prev && prevTime) {
              const elapsed = now - prevTime;
              popRatePerSec = (r - prev) / elapsed;
            }
            window._tomLastRemainder = r;
            window._tomLastRemainderTime = now;
            notifyListeners(json);
          }
        } catch (e) {}
      });
    } else if (this._tomUrl && /\/town-building-assignees/.test(this._tomUrl) && (this._tomMethod || "").toUpperCase() === "POST") {
      let reqBody = null;
      try { reqBody = JSON.parse(args[0]); } catch (e) {}
      if (reqBody) {
        this.addEventListener("load", function () {
          try {
            const json = JSON.parse(this.responseText);
            if (json && json.quantity !== undefined && lastParsed) {
              const bld = lastParsed.allBuildings.find(b => b.id == reqBody.building_id);
              if (bld) bld.assignees = json.quantity;
              const pop = lastParsed.allPopulations.find(p => p.type === reqBody.population_type);
              if (pop) pop.idle = Math.max(0, pop.idle - reqBody.quantity);
              rebuildDerived();
              renderAll();
            }
          } catch (e) {}
        });
      }
    } else if (this._tomUrl && /\/buildings\/\d+/.test(this._tomUrl) && (this._tomMethod || "").toUpperCase() === "PATCH") {
      this.addEventListener("load", function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.building_id && lastParsed) {
            const bld = lastParsed.allBuildings.find(b => b.id == json.building_id);
            if (bld) bld.builders = 1;
            if (lastParsed.buildingMap[json.building_id]) {
              lastParsed.buildingMap[json.building_id].builders = 1;
            }
            rebuildDerived();
            renderAll();
          } else if (json && json.message) {
            const m = json.message.match(/(\d+)\/(\d+).*building_queue/);
            if (m) { buildingQueueMax = parseInt(m[2]); renderAll(); }
          }
        } catch (e) {}
      });
    }
    return originalSend.apply(this, args);
  };

  // --- Data Parser ---
  function prettifySlug(slug) {
    const match = slug.match(/^(.+?)(\d+)$/);
    if (match) {
      const name = match[1]
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
      return name + " Lv" + match[2];
    }
    return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function prettifyType(type) {
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // --- Building Categories ---
  function getBuildingCategory(slug) {
    const base = slug.replace(/\d+$/, "");
    if (["farmer", "woodcutter", "miner"].includes(base)) return "resource";
    if (["barracks", "training_grounds", "archery_grounds"].includes(base))
      return "military";
    if (["crafter"].includes(base)) return "crafting";
    return "infrastructure"; // domicile, warehouse, center, command_center, academy, market, embassy, etc.
  }

  function parseTownData(data) {
    const summary = {
      name: data.name,
      population: data.population,
      populationCapacity: data.population_capacity,
      morale: data.morale,
      populationRemainder: data.population_remainder || 0,
      populationRemainderTime: Date.now() / 1000,
      troopsCapacity: data.troops_capacity || 0,
      troops: data.populations.filter(p => p.type !== "commoner").reduce((s, p) => s + p.quantity, 0),
    };

    // Resources
    const resources = {
      food: data.items?.food?.quantity || 0,
      wood: data.items?.wood?.quantity || 0,
      mineral: data.items?.mineral?.quantity || 0,
    };

    const capacities = {
      food: data.capacities?.food || 0,
      wood: data.capacities?.wood || 0,
      mineral: data.capacities?.mineral || 0,
    };

    const production = data.production || { food: 0, wood: 0, mineral: 0 };

    const allPopulations = data.populations.map((p) => ({
      type: p.type,
      label: p.name || prettifyType(p.type),
      idle: p.idle_quantity,
      assigned: p.assigned_quantity,
      training: p.training_quantity,
      total: p.quantity,
      category: p.category,
    }));

    const idleWorkers = allPopulations.filter((p) => p.idle > 0);
    const totalIdle = idleWorkers.reduce((sum, w) => sum + w.idle, 0);

    const assignedBuildings = [];
    const underConstruction = [];
    const allBuildings = [];

    for (const tile of data.tiles) {
      if (!tile.building) continue;
      const b = tile.building;
      const entry = {
        id: b.id,
        slug: b.slug,
        label: prettifySlug(b.slug),
        category: getBuildingCategory(b.slug),
        x: tile.x,
        y: tile.y,
        assignees: b.assignee_count,
        builders: b.builders_count,
      };
      allBuildings.push(entry);
      if (b.assignee_count > 0) assignedBuildings.push(entry);
      if (b.builders_count > 0) underConstruction.push(entry);
    }

    assignedBuildings.sort((a, b) => b.assignees - a.assignees);

    // Build a buildingId → (x,y) lookup
    const buildingMap = {};
    for (const tile of data.tiles) {
      if (tile.building) {
        buildingMap[tile.building.id] = {
          id: tile.building.id,
          x: tile.x,
          y: tile.y,
          slug: tile.building.slug,
          builders: tile.building.builders_count,
        };
      }
    }

    return {
      summary,
      resources,
      capacities,
      production,
      allPopulations,
      idleWorkers,
      totalIdle,
      allBuildings,
      assignedBuildings,
      underConstruction,
      buildingMap,
    };
  }

  // --- Styles ---
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #tom-overlay {
        position: fixed;
        left: 8px;
        top: 110px;
        width: 300px;
        max-height: 70vh;
        background: rgba(0, 0, 0, 0.88);
        color: #e0e0e0;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 12px;
        border-radius: 8px;
        z-index: 99999;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        user-select: none;
      }
      #tom-overlay-header {
        background: rgba(255,255,255,0.08);
        padding: 8px 12px;
        cursor: grab;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        font-size: 13px;
      }
      #tom-overlay-header:active { cursor: grabbing; }
      #tom-overlay-body {
        padding: 8px 12px;
        overflow-y: auto;
        max-height: calc(70vh - 40px);
      }
      #tom-overlay-body.collapsed { display: none; }
      .tom-section { margin-bottom: 10px; }
      .tom-section-title {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #888;
        margin-bottom: 4px;
      }
      .tom-idle-alert {
        background: rgba(245, 158, 11, 0.15);
        border-left: 3px solid #f59e0b;
        padding: 6px 8px;
        border-radius: 0 4px 4px 0;
        margin-bottom: 8px;
      }
      .tom-idle-alert .tom-count {
        color: #fbbf24;
        font-weight: 700;
      }
      .tom-row {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .tom-row-label { color: #ccc; }
      .tom-row-value { color: #fff; font-weight: 600; }
      .tom-row-coord { color: #666; font-size: 11px; margin-left: 4px; }
      .tom-construction {
        background: rgba(249, 115, 22, 0.12);
        border-left: 3px solid #f97316;
        padding: 6px 8px;
        border-radius: 0 4px 4px 0;
      }
      .tom-toggle {
        font-size: 14px;
        cursor: pointer;
        opacity: 0.6;
      }
      .tom-toggle:hover { opacity: 1; }
      .tom-stat {
        display: inline-block;
        margin-right: 12px;
      }
      .tom-stat-value { font-weight: 700; color: #fff; }
      .tom-card {
        position: absolute;
        background: rgba(15, 15, 20, 0.85);
        border-radius: 2px;
        padding: 1px 3px;
        pointer-events: none;
        z-index: 20000;
        border: 1px solid rgba(255,255,255,0.12);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0px;
        min-width: 20px;
      }
      .tom-card-resource { border-color: rgba(34,197,94,0.5); }
      .tom-card-military { border-color: rgba(239,68,68,0.5); }
      .tom-card-crafting { border-color: rgba(168,85,247,0.5); }
      .tom-card-infrastructure { border-color: rgba(59,130,246,0.5); }
      .tom-card-lvl {
        font-size: 6px;
        font-weight: 700;
        color: rgba(255,255,255,0.65);
        letter-spacing: 0.2px;
      }
      .tom-card-workers {
        font-size: 7px;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 1px;
      }
      .tom-card-dot {
        width: 3px;
        height: 3px;
        border-radius: 50%;
      }
      .tom-dot-resource { background: #22c55e; }
      .tom-dot-military { background: #ef4444; }
      .tom-dot-crafting { background: #a855f7; }
      .tom-dot-infrastructure { background: #3b82f6; }
      .tom-card-count { color: #fb923c; }
      .tom-card-count-full { color: #4ade80; }
      .tom-card-count-partial { color: #facc15; }
      .tom-card-timer {
        font-size: 6px;
        font-weight: 600;
        color: #fbbf24;
      }
      .tom-res-row {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
      }
      .tom-res-label { color: #999; }
      .tom-res-value { color: #fff; font-weight: 600; }
      .tom-res-rate { color: #4ade80; font-size: 11px; }
      .tom-res-food .tom-res-label { color: #fbbf24; }
      .tom-res-wood .tom-res-label { color: #a3e635; }
      .tom-res-mineral .tom-res-label { color: #60a5fa; }
      .tom-row-cat {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 4px;
        vertical-align: middle;
      }
      .tom-cat-resource { background: #22c55e; }
      .tom-cat-military { background: #ef4444; }
      .tom-cat-crafting { background: #a855f7; }
      .tom-cat-infrastructure { background: #3b82f6; }
      .tom-timer-badge {
        position: absolute;
        background: rgba(15, 15, 20, 0.85);
        color: #4ade80;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 6px;
        font-weight: 700;
        padding: 1px 3px;
        border-radius: 2px;
        white-space: nowrap;
        text-align: center;
        pointer-events: none;
        z-index: 20001;
        border: 1px solid rgba(74,222,128,0.3);
      }
      .tom-timer-construction {
        color: #fbbf24;
        border-color: rgba(251,191,36,0.3);
      }
      .tom-pop-card {
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 5px 8px;
        margin-bottom: 4px;
      }
      .tom-pop-name {
        color: #fbbf24;
        font-weight: 700;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
      }
      .tom-pop-total { color: #fff; }
      .tom-pop-stats {
        display: flex;
        gap: 10px;
        font-size: 10px;
        color: #888;
        margin-top: 3px;
      }
      .tom-pop-val { color: #e0e0e0; font-weight: 600; }
      .tom-pop-idle-alert .tom-pop-val { color: #fbbf24; }
    `;
    document.head.appendChild(style);

  }

  // --- Panel Renderer ---
  function renderPanel(parsed) {
    let panel = document.getElementById("tom-overlay");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "tom-overlay";
      panel.innerHTML = `
        <div id="tom-overlay-header">
          <span>Workers</span>
          <span class="tom-toggle" id="tom-toggle">&blacktriangledown;</span>
        </div>
        <div id="tom-overlay-body"></div>
      `;
      document.body.appendChild(panel);
      initDrag(panel);
      document.getElementById("tom-toggle").addEventListener("click", () => {
        const body = document.getElementById("tom-overlay-body");
        const toggle = document.getElementById("tom-toggle");
        body.classList.toggle("collapsed");
        toggle.textContent = body.classList.contains("collapsed")
          ? "\u25B8"
          : "\u25BE";
      });
    }

    const body = document.getElementById("tom-overlay-body");
    const {
      summary,
      resources,
      capacities,
      production,
      allPopulations,
      allBuildings,
      idleWorkers,
      totalIdle,
      assignedBuildings,
      underConstruction,
    } = parsed;

    let html = "";

    // Summary
    const allTimers = getActiveTimers();
    const queueUsed = allTimers.filter(t => t.callbackType === "completeConstruction").length;
    const queueLabel = buildingQueueMax ? `${queueUsed}/${buildingQueueMax}` : `${queueUsed}`;
    const queueFull = buildingQueueMax && queueUsed >= buildingQueueMax;
    html += `<div class="tom-section">
      <span class="tom-stat">Pop <span class="tom-stat-value">${summary.population}/${summary.populationCapacity}</span></span>
      <span class="tom-stat">Troops <span class="tom-stat-value">${summary.troops}/${summary.troopsCapacity}</span></span>
      <span class="tom-stat">Morale <span class="tom-stat-value">${summary.morale}%</span></span>
      <span class="tom-stat">Queue <span class="tom-stat-value" style="color:${queueFull ? "#ef4444" : "#fff"}">${queueLabel}${queueFull ? " FULL" : ""}</span></span>
      <span class="tom-stat">Next pop <span class="tom-stat-value" id="tom-pop-countdown">--:--</span></span>
    </div>`;

    // Resources
    const perHour = (rate) => Math.round(rate * 3600 / tickInterval);
    const timeToFull = (current, capacity, rate) => {
      const ratePerHr = perHour(rate);
      if (ratePerHr <= 0) return "";
      if (current >= capacity) return " <span style='color:#4ade80'>FULL</span>";
      const hrs = (capacity - current) / ratePerHr;
      if (hrs < 1) return ` <span class="tom-res-rate">(full in ${Math.round(hrs * 60)}m)</span>`;
      return ` <span class="tom-res-rate">(full in ${hrs.toFixed(1)}h)</span>`;
    };
    html += `<div class="tom-section">`;
    html += `<div class="tom-section-title">Resources</div>`;
    html += `<div class="tom-res-row tom-res-food">
      <span class="tom-res-label">Food</span>
      <span><span class="tom-res-value">${resources.food.toLocaleString()}</span> <span class="tom-res-rate">+${perHour(production.food).toLocaleString()}/hr</span>${timeToFull(resources.food, capacities.food, production.food)}</span>
    </div>`;
    html += `<div class="tom-res-row tom-res-wood">
      <span class="tom-res-label">Wood</span>
      <span><span class="tom-res-value">${resources.wood.toLocaleString()}</span> <span class="tom-res-rate">+${perHour(production.wood).toLocaleString()}/hr</span>${timeToFull(resources.wood, capacities.wood, production.wood)}</span>
    </div>`;
    html += `<div class="tom-res-row tom-res-mineral">
      <span class="tom-res-label">Mineral</span>
      <span><span class="tom-res-value">${resources.mineral.toLocaleString()}</span> <span class="tom-res-rate">+${perHour(production.mineral).toLocaleString()}/hr</span>${timeToFull(resources.mineral, capacities.mineral, production.mineral)}</span>
    </div>`;
    html += `</div>`;

    // Population cards
    if (allPopulations.length > 0) {
      html += `<div class="tom-section">`;
      html += `<div class="tom-section-title">Population</div>`;
      for (const p of allPopulations) {
        const hasIdle = p.idle > 0;
        html += `<div class="tom-pop-card${hasIdle ? " tom-pop-idle-alert" : ""}">
          <div class="tom-pop-name"><span>${p.label}</span><span class="tom-pop-total">${p.total}</span></div>
          <div class="tom-pop-stats">
            <span>Idle <span class="tom-pop-val">${p.idle}</span></span>
            <span>Assigned <span class="tom-pop-val">${p.assigned}</span></span>
            <span>Training <span class="tom-pop-val">${p.training}</span></span>
          </div>
        </div>`;
      }
      html += `</div>`;
    }

    // Assigned workers — grouped by base type with capacity
    if (assignedBuildings.length > 0) {
      const grouped = {};
      // Sum assigned per type
      for (const b of assignedBuildings) {
        const base = b.slug.replace(/\d+$/, "");
        const label = base.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        if (!grouped[base]) grouped[base] = { label, category: b.category, total: 0, capacity: 0 };
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
    const researchTimers = getActiveTimers().filter(t => t.callbackType === "addResearchedTech");
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

    // Legend
    html += `<div class="tom-section" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;margin-top:6px;">`;
    html += `<div class="tom-section-title">Legend</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:10px;">`;
    html += `<span><span class="tom-row-cat tom-cat-resource"></span>Resource</span>`;
    html += `<span><span class="tom-row-cat tom-cat-military"></span>Military</span>`;
    html += `<span><span class="tom-row-cat tom-cat-crafting"></span>Crafting</span>`;
    html += `<span><span class="tom-row-cat tom-cat-infrastructure"></span>Infra</span>`;
    html += `<span style="color:#4ade80">&#x25CF;</span> <span style="color:#999">Full</span>`;
    html += `<span style="color:#facc15">&#x25CF;</span> <span style="color:#999">Partial</span>`;
    html += `<span style="color:#999">Timer shows builders (w)</span>`;
    html += `</div></div>`;

    body.innerHTML = html;
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

  // --- Grid Badges ---
  let badgeRetries = 0;

  function renderBadges(parsed) {
    // Remove old cards
    document.querySelectorAll(".tom-card").forEach((el) => el.remove());

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
    const builderLookup = {};
    for (const b of parsed.underConstruction) {
      builderLookup[`${b.x},${b.y}`] = { builders: b.builders };
    }

    for (const tile of parsed.allBuildings) {
      const pos = tilePositions[`${tile.x},${tile.y}`];
      if (!pos) continue;

      const left = parseInt(pos.left, 10);
      const top = parseInt(pos.top, 10);
      const lvl = getLevel(tile.slug);
      const maxWorkers = lvl; // capacity = level number
      const key = `${tile.x},${tile.y}`;
      const wk = workerLookup[key];
      const bl = builderLookup[key];
      const category = tile.category;

      // Skip Lv1 buildings with no workers and no builders
      if (lvl <= 1 && !wk && !bl) continue;

      // Build card
      const card = document.createElement("div");
      card.className = "tom-card tom-card-" + category;

      // Row 1: Level
      const lvlRow = document.createElement("div");
      lvlRow.className = "tom-card-lvl";
      lvlRow.textContent = "Lv" + lvl;
      card.appendChild(lvlRow);

      // Row 2: Assignees (dot + number only)
      if (wk && wk.assignees > 0) {
        const wkRow = document.createElement("div");
        wkRow.className = "tom-card-workers";
        const dot = document.createElement("span");
        dot.className = "tom-card-dot tom-dot-" + wk.category;
        wkRow.appendChild(dot);
        const count = document.createElement("span");
        const isFull = wk.assignees >= maxWorkers;
        count.className = isFull
          ? "tom-card-count-full"
          : "tom-card-count-partial";
        count.textContent = wk.assignees + "/" + maxWorkers;
        wkRow.appendChild(count);
        card.appendChild(wkRow);
      }

      // Center card on tile: tile is 64px wide isometric
      card.style.left = left + 22 + "px";
      card.style.top = top + 10 + "px";
      gridContainer.appendChild(card);
    }
  }

  // --- Timers ---
  let timerInterval = null;

  function getActiveTimers() {
    try {
      const raw = localStorage.getItem("persist:timer");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const timers = JSON.parse(parsed.timers || "{}");
      const allTimers = [];
      for (const userId in timers) {
        if (Array.isArray(timers[userId])) {
          allTimers.push(...timers[userId]);
        }
      }
      return allTimers;
    } catch (e) {
      return [];
    }
  }


  function formatCountdown(seconds) {
    if (seconds <= 0) return "done";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const clearedTimers = new Set();

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

      const bld = lastParsed.allBuildings.find(b => b.id == args.buildingId);
      if (bld && bld.builders > 0) {
        const freed = bld.builders;
        bld.builders = 0;
        if (lastParsed.buildingMap[args.buildingId]) {
          lastParsed.buildingMap[args.buildingId].builders = 0;
        }
        // Free builders back to idle (builders are commoners)
        const commoner = lastParsed.allPopulations.find(p => p.type === "commoner");
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

  function renderTimerBadges(buildingMap, tilePositions, gridContainer) {
    // Remove old timer badges
    document.querySelectorAll(".tom-timer-badge").forEach((el) => el.remove());

    if (!gridContainer) return;

    const timers = getActiveTimers();
    const now = Math.floor(Date.now() / 1000);
    const badgeCount = {}; // track stacking per building

    for (const timer of timers) {
      const args = timer.callbackArgs;
      if (!args || !args.buildingId) continue;

      const building = buildingMap[args.buildingId];
      if (!building) continue;

      const pos = tilePositions[`${building.x},${building.y}`];
      if (!pos) continue;

      const left = parseInt(pos.left, 10);
      const top = parseInt(pos.top, 10);
      const stackIndex = badgeCount[args.buildingId] || 0;
      badgeCount[args.buildingId] = stackIndex + 1;

      // Calculate remaining time
      let remaining;
      if (args.finishTime) {
        remaining = args.finishTime - now;
      } else if (timer.timestamp) {
        remaining = timer.timestamp - now;
      } else {
        continue;
      }

      // Build compact single-line label with builder count
      let label = formatCountdown(remaining);
      let isConstruction = timer.callbackType === "completeConstruction";
      const builders = building.builders || 0;
      if (args.recipeName) {
        label = "Craft";
        if (args.currentIter && args.quantityTotal) {
          label += " " + args.currentIter + "/" + args.quantityTotal;
        }
        label += " " + formatCountdown(remaining);
      } else if (timer.label) {
        if (timer.label.startsWith("Upgrading")) {
          label = "Upgrade " + formatCountdown(remaining);
        } else if (timer.label.startsWith("Training")) {
          const iter = args.currentIter && args.quantityTotal ? ` ${args.currentIter}/${args.quantityTotal}` : "";
          label = "Training" + iter + " " + formatCountdown(remaining);
        } else {
          label = "Build " + formatCountdown(remaining);
        }
      }
      if (builders > 0 && !timer.label?.startsWith("Training")) {
        label += " - " + builders + "w";
      }

      const badge = document.createElement("div");
      badge.className =
        "tom-timer-badge" + (isConstruction ? " tom-timer-construction" : "");
      badge.textContent = label;
      badge.style.left = left + 31 + "px";
      badge.style.top = (top - 2 + stackIndex * 22) + "px";
      gridContainer.appendChild(badge);
    }

    // Research badges — find academy building by slug
    const researchTimers = timers.filter(t => t.callbackType === "addResearchedTech");
    if (researchTimers.length > 0) {
      const academy = Object.values(buildingMap).find(b => /^academy/.test(b.slug));
      if (academy) {
        const pos = tilePositions[`${academy.x},${academy.y}`];
        if (pos) {
          const left = parseInt(pos.left, 10);
          const top = parseInt(pos.top, 10);
          for (const t of researchTimers) {
            const remaining = (t.timestamp || 0) - now;
            const name = t.label.replace(/^Researching\s+/i, "");
            const badge = document.createElement("div");
            badge.className = "tom-timer-badge";
            badge.style.color = "#a855f7";
            badge.style.borderColor = "rgba(168,85,247,0.3)";
            badge.textContent = "Research " + formatCountdown(remaining);
            badge.style.left = left + 31 + "px";
            badge.style.top = top - 2 + "px";
            gridContainer.appendChild(badge);
          }
        }
      }
    }
  }

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
      .filter(b => b.assignees > 0)
      .sort((a, b) => b.assignees - a.assignees);
    lastParsed.underConstruction = lastParsed.allBuildings.filter(b => b.builders > 0);
    lastParsed.idleWorkers = lastParsed.allPopulations.filter(p => p.idle > 0);
    lastParsed.totalIdle = lastParsed.idleWorkers.reduce((sum, w) => sum + w.idle, 0);
  }

  function renderAll() {
    if (!lastParsed) return;
    renderPanel(lastParsed);
    renderBadges(lastParsed);
    lastBuildingMap = lastParsed.buildingMap;
  }

  domReady(() => {
    injectStyles();
    onTownData((data) => {
      lastParsed = parseTownData(data);
      // Derive queue max from command center level
      const cc = data.tiles.find(t => t.building && /^command_center/.test(t.building.slug));
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
      renderTimerBadges(lastBuildingMap, lastTilePositions, lastGridContainer);

      // Update population countdown
      const el = document.getElementById("tom-pop-countdown");
      if (el && lastParsed && popRatePerSec > 0) {
        const s = lastParsed.summary;
        const elapsed = Date.now() / 1000 - s.populationRemainderTime;
        const estimated = s.populationRemainder + popRatePerSec * elapsed;
        const secsLeft = Math.max(0, (1 - estimated) / popRatePerSec);
        el.textContent = formatCountdown(Math.round(secsLeft));
      }
    }, 1000);
  });
})();

