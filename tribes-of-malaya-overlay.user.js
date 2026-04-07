// ==UserScript==
// @name         Tribes of Malaya — Worker Overlay
// @namespace    https://war.add.ph
// @version      1.4.7
// @description  Shows worker assignments, idle workers, and construction status as an overlay
// @match        https://war.add.ph/my/town/*
// @match        https://war2.add.ph/my/town/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/margibs/tom-overlay/main/tribes-of-malaya-overlay.user.js
// @downloadURL  https://raw.githubusercontent.com/margibs/tom-overlay/main/tribes-of-malaya-overlay.user.js
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "1.4.7"; // keep in sync with @version in 00-header.js

  let townData = null;
  let userTribe = null; // detected from owner.tribe in town API
  let tickInterval = 300; // seconds; updated dynamically from last_food_production_time
  let buildingQueueMax = null; // detected from failed PATCH response
  let lastMarketTrades = null; // { items: [...], meta: {...} } from /buildings/:id/trades
  const listeners = [];

// --- Crafting Recipes ---
const BASE_MATERIALS = new Set(["food", "wood", "mineral"]);

const CRAFT_RECIPES = [
  {
    name: "Leather",
    slug: "leather",
    yield: 3,
    time: 24,
    ingredients: [{ slug: "food", qty: 30 }],
  },
  {
    name: "Lumber",
    slug: "lumber",
    yield: 30,
    time: 24,
    ingredients: [{ slug: "wood", qty: 3 }],
  },
  {
    name: "Sticks",
    slug: "stick",
    yield: 60,
    time: 24,
    ingredients: [{ slug: "wood", qty: 3 }],
  },
  {
    name: "Tent",
    slug: "tent",
    yield: 2,
    time: 32,
    ingredients: [{ slug: "leather", qty: 2 }],
  },
  {
    name: "Iron Nugget",
    slug: "iron_nugget",
    yield: 2,
    time: 32,
    ingredients: [{ slug: "mineral", qty: 20 }],
  },
  {
    name: "Stone Axe",
    slug: "stone_axe",
    yield: 1,
    time: 24,
    ingredients: [
      { slug: "stick", qty: 2 },
      { slug: "mineral", qty: 1 },
    ],
  },
  {
    name: "Sword",
    slug: "sword",
    yield: 2,
    time: 32,
    ingredients: [
      { slug: "wood", qty: 10 },
      { slug: "iron_nugget", qty: 10 },
    ],
  },
  {
    name: "Gun",
    slug: "gun",
    yield: 2,
    time: 32,
    ingredients: [
      { slug: "wood", qty: 20 },
      { slug: "iron_nugget", qty: 8 },
    ],
  },
  {
    name: "Coconut Charcoal",
    slug: "coconut_charcoal",
    yield: 1,
    time: 40,
    ingredients: [{ slug: "wood", qty: 50 }],
  },
  {
    name: "Steel Nugget",
    slug: "steel_nugget",
    yield: 5,
    time: 40,
    ingredients: [
      { slug: "iron_nugget", qty: 5 },
      { slug: "coconut_charcoal", qty: 5 },
    ],
  },
  {
    name: "Steel Sword",
    slug: "sword2",
    yield: 1,
    time: 32,
    ingredients: [
      { slug: "steel_nugget", qty: 5 },
      { slug: "wood", qty: 5 },
    ],
  },
  {
    name: "Steel Spear",
    slug: "spear2",
    yield: 1,
    time: 32,
    ingredients: [
      { slug: "steel_nugget", qty: 2 },
      { slug: "wood", qty: 10 },
    ],
  },
  {
    name: "Steel Gun",
    slug: "gun2",
    yield: 1,
    time: 32,
    ingredients: [
      { slug: "steel_nugget", qty: 4 },
      { slug: "wood", qty: 10 },
    ],
  },
  {
    name: "Composite Bow and Arrow",
    slug: "bow_and_arrow",
    yield: 1,
    time: 32,
    ingredients: [
      { slug: "wood", qty: 8 },
      { slug: "stick", qty: 40 },
      { slug: "iron_nugget", qty: 2 },
    ],
  },
  {
    name: "Gold Coin",
    slug: "gold_coin",
    yield: 1,
    time: 40,
    ingredients: [{ slug: "gold_dust", qty: 25 }],
  },
  {
    name: "Salt",
    slug: "salt",
    yield: 1,
    time: 40,
    ingredients: [{ slug: "food", qty: 5000 }],
  },
  {
    name: "Tiula Itum",
    slug: "tiula_itum",
    yield: 1,
    time: 90,
    ingredients: [
      { slug: "food", qty: 5000 },
      { slug: "salt", qty: 1 },
    ],
  },
  {
    name: "Inasal",
    slug: "inasal",
    yield: 1,
    time: 90,
    ingredients: [
      { slug: "food", qty: 5000 },
      { slug: "salt", qty: 1 },
    ],
  },
  {
    name: "Adobo",
    slug: "adobo",
    yield: 1,
    time: 90,
    ingredients: [
      { slug: "food", qty: 5000 },
      { slug: "salt", qty: 1 },
    ],
  },
  {
    name: "Gold Dust",
    slug: "gold_dust",
    yield: 3,
    time: 50,
    ingredients: [{ slug: "mineral", qty: 60 }],
  },
];

// Which tribe exclusively crafts each recipe.
// TODO: confirm exact in-game tribe name spelling for each entry
const TRIBE_EXCLUSIVE = {
  salt: "sugboanon",
  gold_dust: "taga_ilog", // TODO: confirm tribe name
  coconut_charcoal: "tausug",
  tiula_itum: "tausug",
  inasal: "sugboanon",
  adobo: "taga_ilog", // TODO: confirm tribe assignment
};

// Recipes the current user's tribe cannot craft (computed from userTribe).
// Falls back to locking all tribe-exclusive recipes if tribe is not yet detected.
function getTribeLocked() {
  if (!userTribe) return new Set(Object.keys(TRIBE_EXCLUSIVE));
  return new Set(
    Object.entries(TRIBE_EXCLUSIVE)
      .filter(([, owner]) => owner !== userTribe)
      .map(([slug]) => slug),
  );
}

function canCraftRecipe(slug) {
  return !getTribeLocked().has(slug);
}

// Lookup recipe by product slug
const recipeBySlug = {};
for (const r of CRAFT_RECIPES) recipeBySlug[r.slug] = r;

// Resolve base material cost for one craft of a recipe.
// Always resolves through the full recipe chain (including tribe-locked steps)
// to show the true raw material equivalent. getCraftSteps handles tribe-lock display.
function resolveBaseCost(recipe) {
  const base = {};
  for (const ing of recipe.ingredients) {
    const sub = recipeBySlug[ing.slug];
    if (BASE_MATERIALS.has(ing.slug) || !sub) {
      base[ing.slug] = (base[ing.slug] || 0) + ing.qty;
    } else {
      const craftsNeeded = Math.ceil(ing.qty / sub.yield);
      const subBase = resolveBaseCost(sub);
      for (const [mat, amt] of Object.entries(subBase)) {
        base[mat] = (base[mat] || 0) + amt * craftsNeeded;
      }
    }
  }
  return base;
}

// Build craft steps for a recipe.
// Steps with tribe-locked ingredients are marked as external (acquire/buy).
function getCraftSteps(recipe) {
  const steps = [];
  for (const ing of recipe.ingredients) {
    if (!BASE_MATERIALS.has(ing.slug) && recipeBySlug[ing.slug]) {
      const sub = recipeBySlug[ing.slug];
      if (!canCraftRecipe(ing.slug)) {
        // Can't craft — must acquire externally
        steps.push({
          recipe: sub,
          crafts: 0,
          needed: ing.qty,
          external: true,
        });
        continue;
      }
      const craftsNeeded = Math.ceil(ing.qty / sub.yield);
      const subSteps = getCraftSteps(sub);
      for (const s of subSteps) {
        steps.push({ ...s, crafts: s.crafts * craftsNeeded });
      }
      steps.push({
        recipe: sub,
        crafts: craftsNeeded,
        needed: ing.qty,
        external: false,
      });
    }
  }
  return steps;
}

// Compute max craftable from available inventory.
// External (tribe-locked) ingredients are checked against inventory directly.
// Check direct ingredients against inventory (not resolved to base materials).
// This correctly handles cases where you already own intermediates like iron_nugget.
function maxCraftable(recipe, inventory) {
  if (!recipe.ingredients.length) return 0;
  let maxCrafts = Infinity;
  for (const ing of recipe.ingredients) {
    const avail = inventory[ing.slug] || 0;
    maxCrafts = Math.min(maxCrafts, Math.floor(avail / ing.qty));
  }
  return maxCrafts === Infinity ? 0 : maxCrafts;
}

// Sum all crafter-seconds across the full recipe chain (intermediate crafts included).
// External (tribe-locked) ingredients contribute 0 craft time (we don't craft them).
function totalCraftTime(recipe, craftsNeeded = 1) {
  let seconds = recipe.time * craftsNeeded;
  for (const ing of recipe.ingredients) {
    if (BASE_MATERIALS.has(ing.slug) || !canCraftRecipe(ing.slug)) continue;
    const sub = recipeBySlug[ing.slug];
    if (!sub) continue;
    const subCrafts = Math.ceil((ing.qty * craftsNeeded) / sub.yield);
    seconds += totalCraftTime(sub, subCrafts);
  }
  return seconds;
}

  // --- Trade Calculator ---
  const WM_RATES = { food: 0.25, wood: 0.3125, mineral: 0.3125 };

  // All tradeable items: base materials + crafted products
  const TRADE_ITEMS = [
    { name: "Food", slug: "food" },
    { name: "Wood", slug: "wood" },
    { name: "Mineral", slug: "mineral" },
    { name: "Gold Dust", slug: "gold_dust" },
    { name: "Gold Coin", slug: "gold_coin" },
    ...CRAFT_RECIPES.map((r) => ({ name: r.name, slug: r.slug })),
  ];

  function calcValue(slug, qty) {
    if (WM_RATES[slug] !== undefined)
      return { wm: qty * WM_RATES[slug], base: { [slug]: qty }, craftSecs: 0 };
    const recipe = recipeBySlug[slug];
    if (!recipe) return null;
    const craftsNeeded = Math.ceil(qty / recipe.yield);
    const baseCostPerCraft = resolveBaseCost(recipe);
    const totalBase = {};
    for (const [mat, amt] of Object.entries(baseCostPerCraft)) {
      totalBase[mat] = amt * craftsNeeded;
    }
    const matWm = Object.entries(totalBase).reduce(
      (sum, [mat, amt]) => sum + (WM_RATES[mat] || 0) * amt,
      0,
    );
    const craftSecs = totalCraftTime(recipe, craftsNeeded);
    const craftWm = craftSecs / 60; // 1 wm/min per worker, assume 1 worker
    return { wm: matWm + craftWm, matWm, craftWm, craftSecs, base: totalBase };
  }

  function fmtBase(base) {
    return (
      Object.entries(base)
        .map(
          ([mat, amt]) => `${amt.toLocaleString()} ${mat.replace(/_/g, " ")}`,
        )
        .join(" + ") || "—"
    );
  }

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
      response
        .clone()
        .json()
        .then((json) => {
          if (json && json.tiles && json.populations) {
            // Tick interval from food production time
            const t = json.last_food_production_time;
            if (t) {
              const prev = window._tomLastFoodTime;
              if (prev && t !== prev) tickInterval = t - prev;
              window._tomLastFoodTime = t;
            }
            notifyListeners(json);
          }
        })
        .catch(() => {});
    }

    if (/\/buildings\/\d+\/trades/.test(url)) {
      response
        .clone()
        .json()
        .then((json) => {
          if (json && json.items && json.meta) {
            lastMarketTrades = json;
            renderAll();
          }
        })
        .catch(() => {});
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
            notifyListeners(json);
          }
        } catch (e) {}
      });
    } else if (
      this._tomUrl &&
      /\/town-building-assignees/.test(this._tomUrl) &&
      (this._tomMethod || "").toUpperCase() === "POST"
    ) {
      let reqBody = null;
      try {
        reqBody = JSON.parse(args[0]);
      } catch (e) {}
      if (reqBody) {
        this.addEventListener("load", function () {
          try {
            const json = JSON.parse(this.responseText);
            if (json && json.quantity !== undefined && lastParsed) {
              const bld = lastParsed.allBuildings.find(
                (b) => b.id == reqBody.building_id,
              );
              if (bld) bld.assignees = json.quantity;
              const pop = lastParsed.allPopulations.find(
                (p) => p.type === reqBody.population_type,
              );
              if (pop) pop.idle = Math.max(0, pop.idle - reqBody.quantity);
              rebuildDerived();
              renderAll();
            }
          } catch (e) {}
        });
      }
    } else if (
      this._tomUrl &&
      /\/buildings\/\d+/.test(this._tomUrl) &&
      (this._tomMethod || "").toUpperCase() === "PATCH"
    ) {
      this.addEventListener("load", function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.building_id && lastParsed) {
            const bld = lastParsed.allBuildings.find(
              (b) => b.id == json.building_id,
            );
            if (bld) bld.builders = 1;
            if (lastParsed.buildingMap[json.building_id]) {
              lastParsed.buildingMap[json.building_id].builders = 1;
            }
            rebuildDerived();
            renderAll();
          } else if (json && json.message) {
            const m = json.message.match(/(\d+)\/(\d+).*building_queue/);
            if (m) {
              buildingQueueMax = parseInt(m[2]);
              renderAll();
            }
          }
        } catch (e) {}
      });
    } else if (
      this._tomUrl &&
      /\/buildings\/\d+\/trades/.test(this._tomUrl) &&
      (this._tomMethod || "").toUpperCase() === "GET"
    ) {
      this.addEventListener("load", function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.items && json.meta) {
            lastMarketTrades = json;
            renderAll();
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
    if (data.owner?.tribe && !userTribe) {
      userTribe = data.owner.tribe.toLowerCase();
    }

    const summary = {
      name: data.name,
      population:
        data.populations?.find((p) => p.type === "commoner")?.quantity ??
        data.population,
      populationCapacity: data.population_capacity,
      morale: data.morale,
      troopsCapacity: data.troops_capacity || 0,
      troops: data.populations
        .filter((p) => p.type !== "commoner")
        .reduce((s, p) => s + p.quantity, 0),
    };

    // Resources
    const getWithheld = (item) =>
      (item?.crafting_quantity_withheld || 0) +
      (item?.market_quantity_withheld || 0) +
      (item?.server_withheld || 0);
    const resources = {
      food: data.items?.food?.quantity || 0,
      wood: data.items?.wood?.quantity || 0,
      mineral: data.items?.mineral?.quantity || 0,
    };
    const withheld = {
      food: getWithheld(data.items?.food),
      wood: getWithheld(data.items?.wood),
      mineral: getWithheld(data.items?.mineral),
    };

    const capacities = {
      food: data.capacities?.food || 0,
      wood: data.capacities?.wood || 0,
      mineral: data.capacities?.mineral || 0,
    };

    const production = data.production || { food: 0, wood: 0, mineral: 0 };

    // Full inventory for trainable calculations
    const inventory = {};
    if (data.items) {
      for (const [key, item] of Object.entries(data.items)) {
        const held =
          (item.crafting_quantity_withheld || 0) +
          (item.market_quantity_withheld || 0) +
          (item.server_withheld || 0);
        inventory[key] = Math.max(0, (item.quantity || 0) - held);
      }
    }

    const allPopulations = data.populations.map((p) => {
      const entry = {
        type: p.type,
        label: p.name || prettifyType(p.type),
        idle: p.idle_quantity,
        assigned: p.assigned_quantity,
        training: p.training_quantity,
        total: p.quantity,
        category: p.category,
        trainingCost: p.items || null,
        trainable: null,
      };
      // Calculate max trainable from available inventory
      if (p.items && Object.keys(p.items).length > 0) {
        entry.trainable = Math.min(
          ...Object.entries(p.items).map(([item, cost]) =>
            Math.floor((inventory[item] || 0) / cost),
          ),
        );
      }
      return entry;
    });

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
      withheld,
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
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Work+Sans:wght@500;700&family=Newsreader:wght@700&display=swap";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent = `
      #tom-overlay {
        position: fixed;
        left: 8px;
        top: 110px;
        width: 480px;
        min-width: 200px;
        max-height: 90vh;
        background: rgba(0, 0, 0, 0.88);
        color: #e0e0e0;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        border-radius: 8px;
        z-index: 99999;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        user-select: none;
        resize: both;
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
        max-height: calc(90vh - 40px);
      }
      #tom-overlay-body.collapsed { display: none; }
      .tom-section { margin-bottom: 10px; }
      .tom-section-title {
        font-size: 11px;
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
      .tom-row-coord { color: #666; font-size: 12px; margin-left: 4px; }
      .tom-construction {
        background: rgba(249, 115, 22, 0.12);
        border-left: 3px solid #f97316;
        padding: 6px 8px;
        border-radius: 0 4px 4px 0;
      }
      .tom-version {
        font-size: 9px;
        opacity: 0.35;
        margin-right: 6px;
        letter-spacing: 0.03em;
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
      .tom-res-row {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
      }
      .tom-res-label { color: #999; }
      .tom-res-value { color: #fff; font-weight: 600; }
      .tom-res-rate { color: #4ade80; font-size: 12px; }
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
        background: none;
        pointer-events: none;
        z-index: 20001;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .tom-badge-time {
        font-family: 'Work Sans', system-ui, sans-serif;
        color: #fff;
        font-size: 7px;
        font-weight: 700;
        white-space: nowrap;
        text-align: center;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5);
        margin-bottom: 1px;
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
        font-size: 13px;
        display: flex;
        justify-content: space-between;
      }
      .tom-pop-total { color: #fff; }
      .tom-pop-stats {
        display: flex;
        gap: 10px;
        font-size: 11px;
        color: #888;
        margin-top: 3px;
      }
      .tom-pop-val { color: #e0e0e0; font-weight: 600; }
      .tom-pop-idle-alert .tom-pop-val { color: #fbbf24; }
      .tom-tabs {
        display: flex;
        gap: 0;
        flex: 1;
      }
      .tom-tab {
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border-radius: 4px 4px 0 0;
        color: #888;
        transition: color 0.15s, background 0.15s;
      }
      .tom-tab:hover { color: #ccc; }
      .tom-tab.active { color: #fff; background: rgba(255,255,255,0.1); }
      .tom-tab-content { display: none; }
      .tom-tab-content.active { display: block; }
      .tom-craft-card {
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 6px 8px;
        margin-bottom: 6px;
        border-left: 3px solid #a855f7;
      }
      .tom-craft-card.tom-craft-locked {
        opacity: 0.55;
        border-left-color: #6b7280;
      }
      .tom-tribe-lock-badge {
        font-size: 9px;
        color: #f59e0b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .tom-craft-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .tom-craft-name { font-weight: 700; font-size: 12px; color: #e0e0e0; }
      .tom-craft-yield { color: #a855f7; font-size: 11px; font-weight: 600; }
      .tom-craft-time { color: #888; font-size: 11px; }
      .tom-craft-step {
        font-size: 11px;
        color: #aaa;
        padding: 2px 0 2px 8px;
        border-left: 2px solid rgba(168,85,247,0.3);
        margin: 2px 0;
      }
      .tom-craft-step-label { color: #a855f7; font-weight: 600; }
      .tom-craft-step-external { border-left-color: #fb923c; }
      .tom-craft-step-acquire { color: #fb923c; font-weight: 600; }
      .tom-craft-search {
        width: 100%;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #e0e0e0;
        font-size: 12px;
        border-radius: 4px;
        padding: 4px 8px;
        box-sizing: border-box;
        outline: none;
      }
      .tom-craft-search:focus { border-color: #a855f7; }
      .tom-craft-base {
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid rgba(255,255,255,0.08);
        font-size: 11px;
      }
      .tom-craft-base-label { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
      .tom-craft-mat { font-weight: 600; }
      .tom-craft-mat-food { color: #fbbf24; }
      .tom-craft-mat-wood { color: #a3e635; }
      .tom-craft-mat-mineral { color: #60a5fa; }
      .tom-craft-mat-gold_dust { color: #fbbf24; }
      .tom-craft-can {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 3px;
        margin-top: 3px;
      }
      .tom-craft-can-yes { color: #4ade80; background: rgba(74,222,128,0.1); }
      .tom-craft-can-no { color: #ef4444; background: rgba(239,68,68,0.1); }
      .tom-craft-reqby { margin-top: 4px; }
      .tom-craft-reqby summary {
        font-size: 11px;
        color: #888;
        cursor: pointer;
        user-select: none;
        list-style: none;
      }
      .tom-craft-reqby summary::before { content: "\\25B8  "; }
      .tom-craft-reqby[open] summary::before { content: "\\25BE  "; }
      .tom-craft-reqby-item {
        font-size: 11px;
        color: #aaa;
        padding: 1px 0 1px 12px;
      }
      .tom-trade-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }
      .tom-trade-side {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 3px;
        min-width: 36px;
        text-align: center;
      }
      .tom-trade-get { background: rgba(74,222,128,0.15); color: #4ade80; }
      .tom-trade-give { background: rgba(239,68,68,0.15); color: #ef4444; }
      .tom-trade-select {
        flex: 1;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #e0e0e0;
        font-size: 11px;
        border-radius: 4px;
        padding: 3px 4px;
      }
      .tom-trade-input {
        width: 64px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #fff;
        font-size: 11px;
        border-radius: 4px;
        padding: 3px 4px;
        text-align: right;
      }
      .tom-trade-btn {
        width: 100%;
        background: rgba(168,85,247,0.2);
        border: 1px solid #a855f7;
        color: #e0d0ff;
        font-size: 12px;
        font-weight: 700;
        border-radius: 4px;
        padding: 5px;
        cursor: pointer;
        margin-bottom: 8px;
      }
      .tom-trade-btn:hover { background: rgba(168,85,247,0.35); }
      .tom-trade-result-inner {
        background: rgba(255,255,255,0.04);
        border-radius: 4px;
        padding: 8px;
      }
      .tom-trade-result-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #e0e0e0;
      }
      .tom-trade-breakdown { font-size: 10px; color: #888; padding-left: 48px; margin: 1px 0; }
      .tom-trade-wm { font-size: 11px; color: #aaa; padding-left: 48px; margin-bottom: 2px; }
      .tom-trade-verdict {
        margin-top: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
      }
      .tom-trade-great { background: rgba(74,222,128,0.15); color: #4ade80; }
      .tom-trade-fair { background: rgba(74,222,128,0.10); color: #86efac; }
      .tom-trade-risky { background: rgba(251,191,36,0.15); color: #fbbf24; }
      .tom-trade-bad { background: rgba(239,68,68,0.15); color: #ef4444; }
      .tom-trade-unknown { color: #fb923c; font-size: 11px; padding: 6px 0; }
      .tom-trade-gold-row {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 3px;
      }
      .tom-trade-gold-label { font-size: 11px; color: #888; }
      .tom-trade-gold-btn {
        background: rgba(251,191,36,0.15);
        border: 1px solid #fbbf24;
        color: #fbbf24;
        font-size: 10px;
        font-weight: 700;
        border-radius: 3px;
        padding: 2px 6px;
        cursor: pointer;
      }
      .tom-trade-gold-btn:hover { background: rgba(251,191,36,0.3); }
      .tom-trade-gold-ref { font-size: 10px; color: #555; margin-bottom: 8px; }
      .tom-aq-section { margin-bottom: 6px; }
      .tom-aq-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        font-weight: 700;
        color: #a855f7;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        cursor: pointer;
        padding: 3px 0;
        user-select: none;
      }
      .tom-aq-header:hover { color: #c084fc; }
      .tom-aq-body { margin-top: 2px; }
      .tom-aq-body.collapsed { display: none; }
      .tom-aq-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        font-size: 11px;
      }
      .tom-aq-label { color: #ccc; flex: 1; margin-right: 8px; }
      .tom-aq-time { color: #fbbf24; font-weight: 700; font-variant-numeric: tabular-nums; }
      .tom-market-empty { color: #555; font-size: 11px; padding: 8px 0; }
      .tom-market-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .tom-market-badge {
        min-width: 44px;
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 4px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .tom-market-badge-good  { background: rgba(74,222,128,0.15);  color: #4ade80; }
      .tom-market-badge-fair  { background: rgba(251,191,36,0.15);  color: #fbbf24; }
      .tom-market-badge-bad   { background: rgba(239,68,68,0.15);   color: #ef4444; }
      .tom-market-badge-unknown { background: rgba(255,255,255,0.08); color: #888; }
      .tom-market-badge-sub { display: block; font-size: 8px; font-weight: 400; opacity: 0.7; }
      .tom-market-sides { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .tom-market-sides > div { display: flex; align-items: center; gap: 4px; }
      .tom-market-item { font-size: 11px; color: #e0e0e0; flex: 1; }
      .tom-market-wm   { font-size: 10px; color: #666; flex-shrink: 0; }

      /* Inventory sort bar */
      .tom-inv-sort-bar {
        display: flex; gap: 4px; padding: 4px 8px 8px; flex-wrap: wrap;
      }
      .tom-inv-sort-btn {
        background: rgba(255,255,255,0.1); color: #ccc; border: none;
        padding: 3px 10px; border-radius: 12px; font-size: 11px;
        cursor: pointer; font-family: 'Work Sans', system-ui, sans-serif;
        transition: background 0.15s, color 0.15s;
      }
      .tom-inv-sort-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
      .tom-inv-sort-btn.active { background: #fbbf24; color: #1a1a1a; font-weight: 600; }
      .tom-inv-cat-divider {
        grid-column: 1 / -1; font-size: 10px; color: #fbbf24; opacity: 0.8;
        padding: 6px 4px 2px; font-family: 'Work Sans', system-ui, sans-serif;
        font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
        border-bottom: 1px solid rgba(251,191,36,0.15);
      }

      /* Building sort toolbar */
      .tom-bld-toolbar {
        display: flex; flex-direction: column; gap: 6px; padding: 4px 20px 8px;
      }
      .tom-bld-tab-row {
        display: flex; gap: 0; border-bottom: 2px solid rgba(251,191,36,0.3); margin-bottom: 2px;
      }
      .tom-bld-tab-btn {
        background: rgba(255,255,255,0.06); color: #999; border: none;
        padding: 5px 14px; font-size: 12px; font-weight: 600;
        cursor: pointer; font-family: 'Work Sans', system-ui, sans-serif;
        transition: background 0.15s, color 0.15s;
        border-radius: 4px 4px 0 0; letter-spacing: 0.3px;
      }
      .tom-bld-tab-btn:hover { background: rgba(255,255,255,0.12); color: #ddd; }
      .tom-bld-tab-btn.active { background: #fbbf24; color: #1a1a1a; }
      .tom-bld-search {
        width: 100%;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #e0e0e0;
        font-size: 12px;
        border-radius: 4px;
        padding: 5px 8px;
        box-sizing: border-box;
        outline: none;
        font-family: 'Work Sans', system-ui, sans-serif;
      }
      .tom-bld-search:focus { border-color: #fbbf24; }
      .tom-bld-search::placeholder { color: #777; }
      .tom-bld-hidden { display: none !important; }
      .tom-bld-no-results {
        grid-column: 1 / -1; text-align: center; color: #888;
        padding: 20px; font-size: 13px;
        font-family: 'Work Sans', system-ui, sans-serif;
      }

      /* Crafter sort toolbar */
      .tom-cft-toolbar {
        display: flex; flex-direction: column; gap: 6px; padding: 6px 10px 8px;
        background: rgba(0,0,0,0.4); border-radius: 6px; margin: 4px 0 8px;
      }
      .tom-cft-search {
        width: 100%;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #e0e0e0;
        font-size: 12px;
        border-radius: 4px;
        padding: 5px 8px;
        box-sizing: border-box;
        outline: none;
        font-family: 'Work Sans', system-ui, sans-serif;
      }
      .tom-cft-search:focus { border-color: #fbbf24; }
      .tom-cft-search::placeholder { color: #777; }
      .tom-cft-sort-row {
        display: flex; gap: 4px; flex-wrap: wrap;
      }
      .tom-cft-sort-btn {
        background: rgba(255,255,255,0.1); color: #ccc; border: none;
        padding: 3px 10px; border-radius: 12px; font-size: 11px;
        cursor: pointer; font-family: 'Work Sans', system-ui, sans-serif;
        transition: background 0.15s, color 0.15s;
      }
      .tom-cft-sort-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
      .tom-cft-sort-btn.active { background: #fbbf24; color: #1a1a1a; font-weight: 600; }
      .tom-cft-hidden { display: none !important; }
      .tom-cft-cat-divider {
        font-size: 11px; color: #fbbf24; opacity: 0.8;
        padding: 8px 4px 2px; font-family: 'Work Sans', system-ui, sans-serif;
        font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
        border-bottom: 1px solid rgba(251,191,36,0.15);
      }
      .tom-cft-no-results {
        text-align: center; color: #888;
        padding: 20px; font-size: 13px;
        font-family: 'Work Sans', system-ui, sans-serif;
      }
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
          if (ratio >= 1.3) {
            verdict = "✅ Great Deal";
            vClass = "tom-trade-great";
          } else if (ratio >= 1.1) {
            verdict = "✅ Good Deal";
            vClass = "tom-trade-great";
          } else if (ratio >= 0.9) {
            verdict = "🟢 Fair";
            vClass = "tom-trade-fair";
          } else if (ratio >= 0.8) {
            verdict = "🟡 Risky";
            vClass = "tom-trade-risky";
          } else {
            verdict = "🔴 Bad Deal";
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
      foodNet,
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

    // Remember which details are expanded before re-render
    const expandedIds = new Set();
    el.querySelectorAll('[id^="tom-market-detail-"]').forEach((d) => {
      if (d.style.display !== "none") expandedIds.add(d.id);
    });

    if (!lastMarketTrades) {
      el.innerHTML = `<div class="tom-section"><div class="tom-market-empty">Open a market building to load listings.</div></div>`;
      return;
    }

    const { items, meta } = lastMarketTrades;

    const rows = items.map((trade) => {
      const getVal = calcValue(trade.offer_item, trade.offer_quantity);
      const giveVal = calcValue(trade.taker_item, trade.taker_quantity);
      const ratio =
        getVal && giveVal && giveVal.wm > 0 ? getVal.wm / giveVal.wm : null;
      return { trade, getVal, giveVal, ratio };
    });

    const fmtSlug = (slug) =>
      slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    let html = `<div class="tom-section">`;
    html += `<div class="tom-section-title">Market Listings <span style="color:#555;font-weight:400;font-size:10px">Page ${meta.current_page}/${meta.total_pages}</span></div>`;

    for (const { trade, getVal, giveVal, ratio } of rows) {
      let badgeClass, badgeText, badgeSubtext;
      if (ratio === null) {
        badgeClass = "tom-market-badge-unknown";
        badgeText = "?";
        badgeSubtext = "";
      } else if (ratio >= 1.1) {
        badgeClass = "tom-market-badge-good";
        badgeText = ratio.toFixed(2) + "x";
        badgeSubtext = "favor";
      } else if (ratio >= 0.9) {
        badgeClass = "tom-market-badge-good";
        badgeText = ratio.toFixed(2) + "x";
        badgeSubtext = "fair";
      } else if (ratio >= 0.8) {
        badgeClass = "tom-market-badge-fair";
        badgeText = (1 / ratio).toFixed(2) + "x";
        badgeSubtext = "risky";
      } else {
        badgeClass = "tom-market-badge-bad";
        badgeText = (1 / ratio).toFixed(2) + "x";
        badgeSubtext = "against";
      }

      const getWm = getVal ? Math.round(getVal.wm) : "?";
      const giveWm = giveVal ? Math.round(giveVal.wm) : "?";
      const tradeId = `tom-market-detail-${trade.id}`;

      html += `<div class="tom-market-row" style="cursor:pointer" onclick="(function(){var d=document.getElementById('${tradeId}');d.style.display=d.style.display==='none'?'block':'none'})()">
        <span class="tom-market-badge ${badgeClass}">${badgeText}${badgeSubtext ? `<span class="tom-market-badge-sub">${badgeSubtext}</span>` : ""}</span>
        <div class="tom-market-sides">
          <div><span class="tom-trade-side tom-trade-get">GET</span> <span class="tom-market-item">${trade.offer_quantity.toLocaleString()} ${fmtSlug(trade.offer_item)}</span> <span class="tom-market-wm">${getWm} wm</span></div>
          <div><span class="tom-trade-side tom-trade-give">GIVE</span> <span class="tom-market-item">${trade.taker_quantity.toLocaleString()} ${fmtSlug(trade.taker_item)}</span> <span class="tom-market-wm">${giveWm} wm</span></div>
        </div>
      </div>`;

      // Expandable detail breakdown
      if (getVal && giveVal) {
        const pct = ((ratio - 1) * 100).toFixed(0);
        const favorStr = ratio >= 1
          ? `${ratio.toFixed(2)}x in your favor (+${pct}%)`
          : `${(1 / ratio).toFixed(2)}x against you (${pct}%)`;
        const vClass = ratio >= 1.3 ? "tom-trade-great" : ratio >= 1.1 ? "tom-trade-great" : ratio >= 0.9 ? "tom-trade-fair" : ratio >= 0.8 ? "tom-trade-risky" : "tom-trade-bad";
        const verdict = ratio >= 1.3 ? "✅ Great Deal" : ratio >= 1.1 ? "✅ Good Deal" : ratio >= 0.9 ? "🟢 Fair" : ratio >= 0.8 ? "🟡 Risky" : "🔴 Bad Deal";

        html += `<div id="${tradeId}" style="display:none;padding:4px 8px 8px 60px">
          <div class="tom-trade-result-inner">
            <div class="tom-trade-result-row">
              <span class="tom-trade-side tom-trade-get">GET</span>
              <span>${trade.offer_quantity.toLocaleString()} × ${fmtSlug(trade.offer_item)}</span>
            </div>
            <div class="tom-trade-breakdown">Materials: ${fmtBase(getVal.base)}</div>
            ${getVal.craftSecs > 0 ? `<div class="tom-trade-breakdown">Craft time: ${getVal.craftSecs}s → ${getVal.craftWm.toFixed(1)} wm</div>` : ""}
            <div class="tom-trade-wm">Total: <strong>${Math.round(getVal.wm).toLocaleString()} wm</strong>${getVal.craftSecs > 0 ? ` <span style="color:#555">(${Math.round(getVal.matWm)} mat + ${Math.round(getVal.craftWm)} time)</span>` : ""}</div>
            <div class="tom-trade-result-row" style="margin-top:6px">
              <span class="tom-trade-side tom-trade-give">GIVE</span>
              <span>${trade.taker_quantity.toLocaleString()} × ${fmtSlug(trade.taker_item)}</span>
            </div>
            <div class="tom-trade-breakdown">Materials: ${fmtBase(giveVal.base)}</div>
            ${giveVal.craftSecs > 0 ? `<div class="tom-trade-breakdown">Craft time: ${giveVal.craftSecs}s → ${giveVal.craftWm.toFixed(1)} wm</div>` : ""}
            <div class="tom-trade-wm">Total: <strong>${Math.round(giveVal.wm).toLocaleString()} wm</strong>${giveVal.craftSecs > 0 ? ` <span style="color:#555">(${Math.round(giveVal.matWm)} mat + ${Math.round(giveVal.craftWm)} time)</span>` : ""}</div>
            <div class="tom-trade-verdict ${vClass}">
              ${verdict} — ${favorStr}
            </div>
          </div>
        </div>`;
      }
    }

    html += `</div>`;
    el.innerHTML = html;

    // Restore expanded details
    expandedIds.forEach((id) => {
      const d = document.getElementById(id);
      if (d) d.style.display = "block";
    });
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

    const timers = getActiveTimers().filter(
      (t) => t.callbackArgs?.recipeName && t.callbackArgs?.buildingId,
    );
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

  function renderTimerBadges(
    buildingMap,
    tilePositions,
    gridContainer,
    parsed,
  ) {
    document.querySelectorAll(".tom-timer-badge").forEach((el) => el.remove());
    if (!gridContainer) return;

    const timers = getActiveTimers();
    const now = Math.floor(Date.now() / 1000);

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
      const top = parseInt(pos.top, 10);

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
        let wColor = "#ef4444";
        if (craftIdle && assignees <= 0) wColor = "#fb923c";
        else if (isFull && !craftIdle) wColor = "#fff";
        else if (isFull && craftIdle) wColor = "#fb923c";
        else if (ratio >= 0.75) wColor = "#4ade80";
        else if (ratio >= 0.4) wColor = "#fb923c";
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

      badge.style.left = left + 62 + "px";
      badge.style.top = top - 8 + "px";
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
          const top = parseInt(pos.top, 10);
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
            if (rUrgent) fill.style.boxShadow = "0 0 3px rgba(255,180,171,0.4)";
            track.appendChild(fill);
            badge.appendChild(track);
          }
          badge.style.left = left + 62 + "px";
          badge.style.top = top - 8 + "px";
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
  renderPanel(lastParsed);
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
    renderTimerBadges(
      lastBuildingMap,
      lastTilePositions,
      lastGridContainer,
      lastParsed,
    );

    renderActiveCraftingQueue();
  }, 1000);
});

// --- Inventory Sort (Town Items modal) ---

const ITEM_NAMES = {
  food: "Food",
  wood: "Wood",
  mineral: "Mineral",
  leather: "Leather",
  lumber: "Lumber",
  stick: "Sticks",
  iron_nugget: "Iron Nugget",
  steel_nugget: "Steel Nugget",
  coconut_charcoal: "Coconut Charcoal",
  gold_dust: "Gold Dust",
  gold_coin: "Gold Coin",
  sword: "Sword",
  sword2: "Steel Sword",
  gun: "Gun",
  gun2: "Steel Gun",
  spear: "Spear",
  spear2: "Steel Spear",
  bow_and_arrow: "Composite Bow",
  bow_and_arrow_2: "Composite Bow II",
  stone_axe: "Stone Axe",
  tent: "Tent",
  salt: "Salt",
  tiula_itum: "Tiula Itum",
  peace_amululet8_free: "Peace Amulet",
};

const ITEM_CATEGORY = {};
["food", "wood", "mineral"].forEach(
  (s) => (ITEM_CATEGORY[s] = { group: "Resources", order: 0 }),
);
[
  "leather",
  "lumber",
  "stick",
  "iron_nugget",
  "steel_nugget",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Materials", order: 1 }));
[
  "sword",
  "sword2",
  "gun",
  "gun2",
  "spear",
  "spear2",
  "bow_and_arrow",
  "bow_and_arrow_2",
  "stone_axe",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Weapons", order: 2 }));
[
  "salt",
  "gold_dust",
  "coconut_charcoal",
  "tiula_itum",
  "inasal",
  "adobo",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Tribal Locked", order: 3 }));
["tent", "gold_coin", "peace_amululet8_free"].forEach(
  (s) => (ITEM_CATEGORY[s] = { group: "Other", order: 4 }),
);

let invCurrentSort = "default";

function getSlug(el) {
  const img = el.querySelector("img[alt]");
  return img ? img.getAttribute("alt") : "";
}

function getQty(el) {
  const span = el.querySelector(".item-quantity");
  return span ? parseInt(span.textContent.replace(/[\s,]/g, ""), 10) || 0 : 0;
}

function getDisplayName(slug) {
  return ITEM_NAMES[slug] || slug.replace(/_/g, " ");
}

function buildSortBar(grid) {
  const bar = document.createElement("div");
  bar.className = "tom-inv-sort-bar";

  const modes = [
    { key: "default", label: "Default" },
    { key: "qty", label: "Qty", desc: "qty-desc", asc: "qty-asc" },
    { key: "name", label: "Name", asc: "name-asc", desc: "name-desc" },
    { key: "category", label: "Category" },
  ];

  modes.forEach((mode) => {
    const btn = document.createElement("button");
    const isToggle = mode.asc && mode.desc;
    const currentDir = isToggle && invCurrentSort === mode.desc ? "desc"
      : isToggle && invCurrentSort === mode.asc ? "asc" : null;
    btn.className =
      "tom-inv-sort-btn" +
      (currentDir || invCurrentSort === mode.key ? " active" : "");
    if (isToggle) {
      btn.textContent = mode.label + " " + (currentDir === "asc" ? "\u2191" : "\u2193");
    } else {
      btn.textContent = mode.label;
    }
    btn.addEventListener("click", () => {
      bar
        .querySelectorAll(".tom-inv-sort-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (isToggle) {
        const wasDir = invCurrentSort === mode.desc ? "desc"
          : invCurrentSort === mode.asc ? "asc" : null;
        const newDir = wasDir === "desc" ? "asc" : "desc";
        invCurrentSort = newDir === "desc" ? mode.desc : mode.asc;
        btn.textContent = mode.label + " " + (newDir === "asc" ? "\u2191" : "\u2193");
      } else {
        invCurrentSort = mode.key;
      }
      applySort(grid, invCurrentSort);
    });
    bar.appendChild(btn);
  });

  return bar;
}

function applySort(grid, sortType) {
  // Remove any existing category dividers
  grid.querySelectorAll(".tom-inv-cat-divider").forEach((el) => el.remove());

  const allSlots = [...grid.querySelectorAll(".inventory-item")];
  const filled = allSlots.filter((el) => !el.classList.contains("empty-slot"));
  const empties = allSlots.filter((el) => el.classList.contains("empty-slot"));

  // Restore original order attribute if present
  if (sortType === "default") {
    filled.sort(
      (a, b) =>
        parseInt(a.dataset.tomOrigIdx, 10) - parseInt(b.dataset.tomOrigIdx, 10),
    );
  } else if (sortType === "qty-desc") {
    filled.sort((a, b) => getQty(b) - getQty(a));
  } else if (sortType === "qty-asc") {
    filled.sort((a, b) => getQty(a) - getQty(b));
  } else if (sortType === "name-asc") {
    filled.sort((a, b) =>
      getDisplayName(getSlug(a)).localeCompare(getDisplayName(getSlug(b))),
    );
  } else if (sortType === "name-desc") {
    filled.sort((a, b) =>
      getDisplayName(getSlug(b)).localeCompare(getDisplayName(getSlug(a))),
    );
  } else if (sortType === "category") {
    filled.sort((a, b) => {
      const catA = ITEM_CATEGORY[getSlug(a)] || { order: 99 };
      const catB = ITEM_CATEGORY[getSlug(b)] || { order: 99 };
      if (catA.order !== catB.order) return catA.order - catB.order;
      return getQty(b) - getQty(a);
    });
  }

  // Re-append filled items
  if (sortType === "category") {
    let lastGroup = null;
    filled.forEach((el) => {
      const cat = ITEM_CATEGORY[getSlug(el)] || {
        group: "Other",
        order: 99,
      };
      if (cat.group !== lastGroup) {
        const divider = document.createElement("div");
        divider.className = "tom-inv-cat-divider";
        divider.textContent = cat.group;
        grid.appendChild(divider);
        lastGroup = cat.group;
      }
      grid.appendChild(el);
    });
  } else {
    filled.forEach((el) => grid.appendChild(el));
  }

  // Empties at the end
  empties.forEach((el) => grid.appendChild(el));
}

function handleTownItemsModal(modal) {
  const header = modal.querySelector(".modal-header");
  const grid = modal.querySelector(".inventory");
  if (!header || !grid) return;

  // Already injected?
  if (modal.querySelector(".tom-inv-sort-bar")) return;

  // Stamp original order and format quantities
  const items = grid.querySelectorAll(".inventory-item:not(.empty-slot)");
  items.forEach((el, i) => {
    el.dataset.tomOrigIdx = i;
    const qtyEl = el.querySelector(".item-quantity");
    if (qtyEl) {
      const num = parseInt(qtyEl.textContent.replace(/\s/g, ""), 10);
      if (!isNaN(num)) qtyEl.textContent = num.toLocaleString("fr-FR");
    }
  });

  // Inject sort bar after header
  const bar = buildSortBar(grid);
  const body = modal.querySelector(".modal-body");
  if (body) {
    body.insertBefore(bar, body.firstChild);
  }

  // Re-apply last sort
  if (invCurrentSort !== "default") {
    applySort(grid, invCurrentSort);
  }

  // Watch for React re-renders that replace inventory children
  const gridObserver = new MutationObserver(() => {
    // Re-stamp and re-format any new items without tomOrigIdx
    const freshItems = grid.querySelectorAll(
      ".inventory-item:not(.empty-slot)",
    );
    let needsReapply = false;
    freshItems.forEach((el, i) => {
      if (!el.dataset.tomOrigIdx) {
        el.dataset.tomOrigIdx = i;
        needsReapply = true;
      }
      const qtyEl = el.querySelector(".item-quantity");
      if (qtyEl && !/\s/.test(qtyEl.textContent) && qtyEl.textContent.length > 3) {
        const num = parseInt(qtyEl.textContent.replace(/[\s,]/g, ""), 10);
        if (!isNaN(num)) qtyEl.textContent = num.toLocaleString("fr-FR");
      }
    });
    if (needsReapply && invCurrentSort !== "default") {
      applySort(grid, invCurrentSort);
    }
  });
  gridObserver.observe(grid, { childList: true, subtree: true });
}

function initInventorySort() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.classList?.contains("modal-overlay")
          ? node
          : node.querySelector?.(".modal-overlay");
        if (!modal) continue;
        const h2 = modal.querySelector("h2");
        if (h2 && h2.textContent.trim() === "Town Items") {
          // Defer to let React finish rendering
          setTimeout(() => handleTownItemsModal(modal), 50);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// --- Building Sort (Construct Building modal) ---

function getBldTab(name) {
  const lower = name.toLowerCase();
  if (["barracks", "training grounds", "archery grounds"].some((k) => lower.includes(k)))
    return "military";
  if (["farmer", "woodcutter", "miner"].some((k) => lower.includes(k)))
    return "resources";
  return "infrastructure";
}

let bldCurrentTab = "infrastructure";
let bldCurrentSearch = "";

function getBldName(card) {
  const h3 = card.querySelector("h3");
  return h3 ? h3.textContent.trim().toLowerCase() : "";
}

function getBldDesc(card) {
  const desc = card.querySelector(".description");
  return desc ? desc.textContent.trim().toLowerCase() : "";
}

function buildBldToolbar(grid) {
  const toolbar = document.createElement("div");
  toolbar.className = "tom-bld-toolbar";

  // Tab row
  const tabRow = document.createElement("div");
  tabRow.className = "tom-bld-tab-row";

  const tabs = [
    { key: "infrastructure", label: "Infrastructure" },
    { key: "military", label: "Military" },
    { key: "resources", label: "Resources" },
  ];

  tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = "tom-bld-tab-btn" + (bldCurrentTab === tab.key ? " active" : "");
    btn.textContent = tab.label;
    btn.addEventListener("click", () => {
      tabRow.querySelectorAll(".tom-bld-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bldCurrentTab = tab.key;
      applyBldFilters(grid);
    });
    tabRow.appendChild(btn);
  });

  toolbar.appendChild(tabRow);

  // Search input
  const search = document.createElement("input");
  search.type = "text";
  search.className = "tom-bld-search";
  search.placeholder = "Search buildings\u2026";
  search.value = bldCurrentSearch;
  search.addEventListener("input", () => {
    bldCurrentSearch = search.value;
    applyBldFilters(grid);
  });
  toolbar.appendChild(search);

  return toolbar;
}

function applyBldFilters(grid) {
  const query = bldCurrentSearch.toLowerCase();

  // Remove existing no-results message
  const existing = grid.querySelector(".tom-bld-no-results");
  if (existing) existing.remove();

  const cards = [...grid.querySelectorAll(".building-option")];

  const visible = [];
  const hidden = [];

  cards.forEach((card) => {
    const name = getBldName(card);
    const desc = getBldDesc(card);
    const tabMatch = getBldTab(name) === bldCurrentTab;
    const searchMatch = !query || name.includes(query) || desc.includes(query);
    if (tabMatch && searchMatch) {
      visible.push(card);
    } else {
      hidden.push(card);
    }
  });

  // Re-append in original order
  visible.sort(
    (a, b) => parseInt(a.dataset.tomOrigIdx, 10) - parseInt(b.dataset.tomOrigIdx, 10)
  );

  visible.forEach((card) => {
    card.classList.remove("tom-bld-hidden");
    grid.appendChild(card);
  });
  hidden.forEach((card) => {
    card.classList.add("tom-bld-hidden");
    grid.appendChild(card);
  });

  if (visible.length === 0 && hidden.length > 0) {
    const msg = document.createElement("div");
    msg.className = "tom-bld-no-results";
    msg.textContent = "No matching buildings";
    grid.appendChild(msg);
  }
}

function handleConstructModal(modal) {
  const body = modal.querySelector(".modal-body");
  const grid = modal.querySelector(".building-list");
  if (!body || !grid) return;

  // Already injected?
  if (modal.querySelector(".tom-bld-toolbar")) return;

  // Stamp original order
  const cards = grid.querySelectorAll(".building-option");
  cards.forEach((card, i) => {
    card.dataset.tomOrigIdx = i;
  });

  // Inject toolbar
  const toolbar = buildBldToolbar(grid);
  body.insertBefore(toolbar, body.firstChild);

  // Apply initial tab filter
  applyBldFilters(grid);

  // Watch for React re-renders
  const gridObserver = new MutationObserver(() => {
    const freshCards = grid.querySelectorAll(".building-option");
    let needsReapply = false;
    freshCards.forEach((card, i) => {
      if (!("tomOrigIdx" in card.dataset)) {
        card.dataset.tomOrigIdx = i;
        needsReapply = true;
      }
    });
    if (needsReapply) applyBldFilters(grid);
  });
  gridObserver.observe(grid, { childList: true, subtree: true });
}

function initBuildingSort() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.classList?.contains("modal-overlay")
          ? node
          : node.querySelector?.(".modal-overlay");
        if (!modal) continue;
        const h2 = modal.querySelector("h2");
        if (h2 && h2.textContent.trim().startsWith("Construct Building")) {
          setTimeout(() => handleConstructModal(modal), 50);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// --- Crafter Sort (Crafter building sidebar panel) ---

let cftCurrentSort = "default";
let cftCurrentSearch = "";

// Reverse lookup: display name → slug (reuses ITEM_NAMES from 11-inventory-sort.js)
function buildReverseLookup() {
  const map = {};
  for (const [slug, display] of Object.entries(ITEM_NAMES)) {
    map[display.toLowerCase()] = slug;
  }
  return map;
}
const ITEM_SLUG_BY_NAME = buildReverseLookup();

function getCraftItemSlug(card) {
  const h3 = card.querySelector("h3");
  if (!h3) return "";
  // "Craft Leather (3x)" → "Leather"
  let name = h3.textContent.trim();
  name = name.replace(/^Craft\s+/i, "").replace(/\s*\(\d+x\)\s*$/, "").trim();
  const slug = ITEM_SLUG_BY_NAME[name.toLowerCase()];
  if (slug) return slug;
  return name.toLowerCase().replace(/\s+/g, "_");
}

function getCraftName(card) {
  const h3 = card.querySelector("h3");
  return h3 ? h3.textContent.trim().toLowerCase() : "";
}

function getCraftTimeSecs(card) {
  const costDivs = card.querySelectorAll(".costs");
  for (const d of costDivs) {
    const text = d.textContent;
    if (/time/i.test(text)) {
      let secs = 0;
      const m = text.match(/(\d+)m/);
      if (m) secs += parseInt(m[1], 10) * 60;
      const s = text.match(/(\d+)s/);
      if (s) secs += parseInt(s[1], 10);
      return secs;
    }
  }
  return 0;
}

function getCraftMaxQty(card) {
  // qty row is the 4th child; max qty span is inside first div
  const qtyRow = card.children[3];
  if (!qtyRow) return 0;
  const span = qtyRow.querySelector("span");
  return span ? parseInt(span.textContent.replace(/[\s,]/g, ""), 10) || 0 : 0;
}

function buildCftToolbar(grid) {
  const toolbar = document.createElement("div");
  toolbar.className = "tom-cft-toolbar";

  // Search input
  const search = document.createElement("input");
  search.type = "text";
  search.className = "tom-cft-search";
  search.placeholder = "Search crafts\u2026";
  search.value = cftCurrentSearch;
  search.addEventListener("input", () => {
    cftCurrentSearch = search.value;
    applyCftFilters(grid);
  });
  toolbar.appendChild(search);

  // Sort buttons
  const sortRow = document.createElement("div");
  sortRow.className = "tom-cft-sort-row";

  const modes = [
    { key: "default", label: "Default" },
    { key: "name", label: "Name", asc: "name-asc", desc: "name-desc" },
    { key: "time", label: "Time", asc: "time-asc", desc: "time-desc" },
    { key: "cancraft", label: "Can Craft", asc: "cancraft-asc", desc: "cancraft-desc" },
    { key: "category", label: "Category" },
  ];

  modes.forEach((mode) => {
    const btn = document.createElement("button");
    const isToggle = mode.asc && mode.desc;
    const currentDir = isToggle && cftCurrentSort === mode.desc ? "desc"
      : isToggle && cftCurrentSort === mode.asc ? "asc" : null;
    btn.className =
      "tom-cft-sort-btn" +
      (currentDir || cftCurrentSort === mode.key ? " active" : "");
    if (isToggle) {
      btn.textContent = mode.label + " " + (currentDir === "asc" ? "\u2191" : "\u2193");
    } else {
      btn.textContent = mode.label;
    }
    btn.addEventListener("click", () => {
      sortRow
        .querySelectorAll(".tom-cft-sort-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (isToggle) {
        const wasDir = cftCurrentSort === mode.desc ? "desc"
          : cftCurrentSort === mode.asc ? "asc" : null;
        const newDir = wasDir === "desc" ? "asc" : "desc";
        cftCurrentSort = newDir === "desc" ? mode.desc : mode.asc;
        btn.textContent = mode.label + " " + (newDir === "asc" ? "\u2191" : "\u2193");
      } else {
        cftCurrentSort = mode.key;
      }
      applyCftFilters(grid);
    });
    sortRow.appendChild(btn);
  });

  toolbar.appendChild(sortRow);
  return toolbar;
}

function applyCftFilters(grid) {
  const query = cftCurrentSearch.toLowerCase();

  // Remove existing dividers and no-results
  grid.querySelectorAll(".tom-cft-cat-divider").forEach((el) => el.remove());
  const existing = grid.querySelector(".tom-cft-no-results");
  if (existing) existing.remove();

  const cards = [...grid.querySelectorAll(".building-option")];

  // Filter
  const visible = [];
  const hidden = [];
  cards.forEach((card) => {
    const name = getCraftName(card);
    if (query && !name.includes(query)) {
      hidden.push(card);
    } else {
      visible.push(card);
    }
  });

  // Sort
  visible.sort((a, b) => {
    switch (cftCurrentSort) {
      case "name-asc":
        return getCraftName(a).localeCompare(getCraftName(b));
      case "name-desc":
        return getCraftName(b).localeCompare(getCraftName(a));
      case "time-asc":
        return getCraftTimeSecs(a) - getCraftTimeSecs(b);
      case "time-desc":
        return getCraftTimeSecs(b) - getCraftTimeSecs(a);
      case "cancraft-asc":
        return getCraftMaxQty(a) - getCraftMaxQty(b);
      case "cancraft-desc":
        return getCraftMaxQty(b) - getCraftMaxQty(a);
      case "category": {
        const catA = ITEM_CATEGORY[getCraftItemSlug(a)] || { order: 99 };
        const catB = ITEM_CATEGORY[getCraftItemSlug(b)] || { order: 99 };
        if (catA.order !== catB.order) return catA.order - catB.order;
        return parseInt(a.dataset.tomOrigIdx, 10) - parseInt(b.dataset.tomOrigIdx, 10);
      }
      default:
        return (
          parseInt(a.dataset.tomOrigIdx, 10) -
          parseInt(b.dataset.tomOrigIdx, 10)
        );
    }
  });

  // Re-append with category dividers if needed
  if (cftCurrentSort === "category") {
    let lastGroup = null;
    visible.forEach((card) => {
      card.classList.remove("tom-cft-hidden");
      const cat = ITEM_CATEGORY[getCraftItemSlug(card)] || { group: "Other", order: 99 };
      if (cat.group !== lastGroup) {
        const divider = document.createElement("div");
        divider.className = "tom-cft-cat-divider";
        divider.textContent = cat.group;
        grid.appendChild(divider);
        lastGroup = cat.group;
      }
      grid.appendChild(card);
    });
  } else {
    visible.forEach((card) => {
      card.classList.remove("tom-cft-hidden");
      grid.appendChild(card);
    });
  }

  hidden.forEach((card) => {
    card.classList.add("tom-cft-hidden");
    grid.appendChild(card);
  });

  if (visible.length === 0 && hidden.length > 0) {
    const msg = document.createElement("div");
    msg.className = "tom-cft-no-results";
    msg.textContent = "No matching crafts";
    grid.appendChild(msg);
  }
}

function handleCrafterPanel(panel) {
  const grid = panel.querySelector(".building-list");
  if (!grid) return;

  // Already injected?
  if (panel.querySelector(".tom-cft-toolbar")) return;

  // Stamp original order
  const cards = grid.querySelectorAll(".building-option");
  cards.forEach((card, i) => {
    card.dataset.tomOrigIdx = i;
  });

  // Inject toolbar before the building-list
  const toolbar = buildCftToolbar(grid);
  grid.parentElement.insertBefore(toolbar, grid);

  // Re-apply last state
  if (cftCurrentSort !== "default" || cftCurrentSearch) {
    applyCftFilters(grid);
  }

  // Watch for React re-renders
  const gridObserver = new MutationObserver(() => {
    const freshCards = grid.querySelectorAll(".building-option");
    let needsReapply = false;
    freshCards.forEach((card, i) => {
      if (!card.dataset.tomOrigIdx) {
        card.dataset.tomOrigIdx = i;
        needsReapply = true;
      }
    });
    if (needsReapply && (cftCurrentSort !== "default" || cftCurrentSearch)) {
      applyCftFilters(grid);
    }
  });
  gridObserver.observe(grid, { childList: true, subtree: true });
}

function initCrafterSort() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const panel = node.classList?.contains("right-sidebar")
          ? node
          : node.querySelector?.(".right-sidebar");
        if (!panel) continue;
        const h2 = panel.querySelector("h2");
        if (h2 && /^crafter/i.test(h2.textContent.trim())) {
          setTimeout(() => handleCrafterPanel(panel), 50);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

})();
