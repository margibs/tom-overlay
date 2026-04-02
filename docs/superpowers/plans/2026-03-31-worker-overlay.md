# Worker Overlay Userscript — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single Tampermonkey userscript that intercepts game API data on `war.add.ph/my/town/*` and renders a floating worker-status overlay panel plus grid badges on building tiles.

**Architecture:** The userscript monkey-patches `fetch` to intercept town API responses, parses the JSON into a normalized data model, then renders two UI layers: (1) a draggable summary panel in the corner, and (2) small count badges positioned on the game grid. All vanilla JS/CSS in one file.

**Tech Stack:** Vanilla JavaScript, CSS, Tampermonkey userscript API

---

## File Structure

- **Create:** `tribes-of-malaya-overlay.user.js` — the complete userscript (single file)

All logic lives in one file with clearly separated sections via IIFEs or labeled comment blocks.

---

### Task 1: Tampermonkey Header + Fetch Intercept

**Files:**
- Create: `tribes-of-malaya-overlay.user.js`

- [ ] **Step 1: Create the userscript with metadata header and fetch hook**

```javascript
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
  'use strict';

  let townData = null;
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
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (/\/my\/town\/\d+/.test(url)) {
      response.clone().json().then((json) => {
        if (json && json.tiles && json.populations) {
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
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this._tomUrl && /\/my\/town\/\d+/.test(this._tomUrl)) {
      this.addEventListener('load', function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.tiles && json.populations) {
            notifyListeners(json);
          }
        } catch (e) {}
      });
    }
    return originalSend.apply(this, args);
  };
```

- [ ] **Step 2: Verify the intercept works**

Open `https://war.add.ph/my/town/800` with Tampermonkey enabled. Open the browser console and add a temporary log inside the `notifyListeners` function:

```javascript
console.log('[TOM Overlay] Town data intercepted:', data.name);
```

Expected: On page load, the console prints `[TOM Overlay] Town data intercepted: Bayan ni rumargibs`.

- [ ] **Step 3: Commit**

```bash
git add tribes-of-malaya-overlay.user.js
git commit -m "feat: userscript with fetch/XHR intercept for town API data"
```

---

### Task 2: Data Parser

**Files:**
- Modify: `tribes-of-malaya-overlay.user.js`

- [ ] **Step 1: Add the data parsing functions**

Add after the XHR intercept block, inside the main IIFE:

```javascript
  // --- Data Parser ---
  function prettifySlug(slug) {
    const match = slug.match(/^(.+?)(\d+)$/);
    if (match) {
      const name = match[1].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
      return name + ' Lv' + match[2];
    }
    return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function prettifyType(type) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function parseTownData(data) {
    const summary = {
      name: data.name,
      population: data.population,
      populationCapacity: data.population_capacity,
      morale: data.morale,
    };

    const idleWorkers = data.populations
      .filter((p) => p.idle_quantity > 0)
      .map((p) => ({
        type: p.type,
        label: prettifyType(p.type),
        idle: p.idle_quantity,
        total: p.quantity,
      }));

    const totalIdle = idleWorkers.reduce((sum, w) => sum + w.idle, 0);

    const assignedBuildings = [];
    const underConstruction = [];

    for (const tile of data.tiles) {
      if (!tile.building) continue;
      const b = tile.building;
      const entry = {
        slug: b.slug,
        label: prettifySlug(b.slug),
        x: tile.x,
        y: tile.y,
        assignees: b.assignee_count,
        builders: b.builders_count,
      };
      if (b.assignee_count > 0) assignedBuildings.push(entry);
      if (b.builders_count > 0) underConstruction.push(entry);
    }

    assignedBuildings.sort((a, b) => b.assignees - a.assignees);

    return { summary, idleWorkers, totalIdle, assignedBuildings, underConstruction };
  }
```

- [ ] **Step 2: Verify parsing**

Add a temporary listener to test:

```javascript
onTownData((data) => {
  const parsed = parseTownData(data);
  console.log('[TOM Overlay] Parsed:', parsed);
});
```

Reload the game page. Expected console output shows the parsed object with `summary.population: 31`, `totalIdle: 2`, `assignedBuildings` array with entries like `{ label: "Farmer Lv3", x: 7, y: 1, assignees: 3 }`.

- [ ] **Step 3: Commit**

```bash
git add tribes-of-malaya-overlay.user.js
git commit -m "feat: add town data parser with slug prettification"
```

---

### Task 3: Inject Styles

**Files:**
- Modify: `tribes-of-malaya-overlay.user.js`

- [ ] **Step 1: Add CSS injection function**

Add after the data parser, inside the main IIFE:

```javascript
  // --- Styles ---
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #tom-overlay {
        position: fixed;
        bottom: 16px;
        right: 16px;
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
      .tom-badge {
        position: absolute;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        font-size: 10px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        pointer-events: none;
        z-index: 99998;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
      }
      .tom-badge-worker {
        background: #3b82f6;
        top: 2px;
        left: 2px;
      }
      .tom-badge-builder {
        background: #f97316;
        top: 2px;
        right: 2px;
      }
    `;
    document.head.appendChild(style);
  }
```

- [ ] **Step 2: Call injectStyles on DOM ready**

Add after the style function:

```javascript
  function domReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  domReady(() => {
    injectStyles();
  });
```

- [ ] **Step 3: Commit**

```bash
git add tribes-of-malaya-overlay.user.js
git commit -m "feat: add overlay and badge CSS styles"
```

---

### Task 4: Overlay Panel Renderer

**Files:**
- Modify: `tribes-of-malaya-overlay.user.js`

- [ ] **Step 1: Add the panel rendering function**

Add after `domReady`, inside the main IIFE:

```javascript
  // --- Panel Renderer ---
  function renderPanel(parsed) {
    let panel = document.getElementById('tom-overlay');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'tom-overlay';
      panel.innerHTML = `
        <div id="tom-overlay-header">
          <span>Workers</span>
          <span class="tom-toggle" id="tom-toggle">▾</span>
        </div>
        <div id="tom-overlay-body"></div>
      `;
      document.body.appendChild(panel);
      initDrag(panel);
      document.getElementById('tom-toggle').addEventListener('click', () => {
        const body = document.getElementById('tom-overlay-body');
        const toggle = document.getElementById('tom-toggle');
        body.classList.toggle('collapsed');
        toggle.textContent = body.classList.contains('collapsed') ? '▸' : '▾';
      });
    }

    const body = document.getElementById('tom-overlay-body');
    const { summary, idleWorkers, totalIdle, assignedBuildings, underConstruction } = parsed;

    let html = '';

    // Summary
    html += `<div class="tom-section">
      <span class="tom-stat">Pop <span class="tom-stat-value">${summary.population}/${summary.populationCapacity}</span></span>
      <span class="tom-stat">Morale <span class="tom-stat-value">${summary.morale}%</span></span>
    </div>`;

    // Idle workers
    if (totalIdle > 0) {
      html += `<div class="tom-idle-alert">`;
      html += `<div class="tom-section-title">Idle Workers</div>`;
      for (const w of idleWorkers) {
        html += `<div><span class="tom-count">${w.idle}</span> ${w.label} idle</div>`;
      }
      html += `</div>`;
    }

    // Assigned workers
    if (assignedBuildings.length > 0) {
      html += `<div class="tom-section">`;
      html += `<div class="tom-section-title">Assigned Workers</div>`;
      for (const b of assignedBuildings) {
        html += `<div class="tom-row">
          <span class="tom-row-label">${b.label}<span class="tom-row-coord">(${b.x},${b.y})</span></span>
          <span class="tom-row-value">${b.assignees}</span>
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
          <span class="tom-row-label">${b.label}<span class="tom-row-coord">(${b.x},${b.y})</span></span>
          <span class="tom-row-value">${b.builders} builders</span>
        </div>`;
      }
      html += `</div>`;
    }

    body.innerHTML = html;
  }
```

- [ ] **Step 2: Wire up the listener**

Replace the temporary `onTownData` test listener with:

```javascript
  domReady(() => {
    injectStyles();
    onTownData((data) => {
      const parsed = parseTownData(data);
      renderPanel(parsed);
    });
  });
```

- [ ] **Step 3: Verify the panel renders**

Reload the game page. Expected: a dark floating panel appears in the bottom-right showing population, idle workers (2 Tausug Warrior idle), assigned workers table, and the barracks under construction.

- [ ] **Step 4: Commit**

```bash
git add tribes-of-malaya-overlay.user.js
git commit -m "feat: add floating overlay panel with worker summary"
```

---

### Task 5: Drag Logic

**Files:**
- Modify: `tribes-of-malaya-overlay.user.js`

- [ ] **Step 1: Add drag function**

Add before the `domReady` call, inside the main IIFE:

```javascript
  // --- Drag Logic ---
  function initDrag(panel) {
    const header = panel.querySelector('#tom-overlay-header');
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      panel.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = (e.clientX - offsetX) + 'px';
      panel.style.top = (e.clientY - offsetY) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
```

- [ ] **Step 2: Verify dragging works**

Reload the game page. Click and drag the panel header bar. Expected: the panel moves freely and stays where you drop it.

- [ ] **Step 3: Commit**

```bash
git add tribes-of-malaya-overlay.user.js
git commit -m "feat: add draggable panel header"
```

---

### Task 6: Grid Badges

**Files:**
- Modify: `tribes-of-malaya-overlay.user.js`

- [ ] **Step 1: Add badge rendering function**

Add after `renderPanel`, inside the main IIFE. This uses a discovery approach — it first tries to find grid tile DOM elements, and falls back to a no-op if the grid structure is unrecognizable:

```javascript
  // --- Grid Badges ---
  let badgeContainer = null;

  function clearBadges() {
    if (badgeContainer) badgeContainer.innerHTML = '';
  }

  function findGridContainer() {
    // Try common patterns — the game likely renders tiles as positioned elements
    // inside a grid container. We look for a container with children that map to
    // the 9x9 tile layout.
    // Strategy: find elements whose count matches tile count (81 = 9x9)
    const candidates = document.querySelectorAll('[class*="grid"], [class*="tile"], [class*="map"], [id*="grid"], [id*="map"]');
    for (const el of candidates) {
      if (el.children.length >= 50) return el;
    }
    // Fallback: look for a container with many absolutely/relatively positioned children
    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
      if (div.children.length >= 70 && div.children.length <= 120) {
        const style = window.getComputedStyle(div);
        if (style.position === 'relative' || style.position === 'absolute') {
          return div;
        }
      }
    }
    return null;
  }

  function renderBadges(parsed) {
    clearBadges();

    if (!badgeContainer) {
      badgeContainer = document.createElement('div');
      badgeContainer.id = 'tom-badges';
      badgeContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99998;';
    }

    const gridEl = findGridContainer();
    if (!gridEl) {
      console.log('[TOM Overlay] Grid container not found — badges disabled. Please report the game DOM structure.');
      return;
    }

    if (!gridEl.contains(badgeContainer)) {
      gridEl.style.position = gridEl.style.position || 'relative';
      gridEl.appendChild(badgeContainer);
    }

    // Build a map of buildings with workers/builders
    const buildingTiles = [];
    for (const b of parsed.assignedBuildings) {
      buildingTiles.push({ x: b.x, y: b.y, assignees: b.assignees, builders: b.builders });
    }
    for (const b of parsed.underConstruction) {
      const existing = buildingTiles.find((t) => t.x === b.x && t.y === b.y);
      if (existing) {
        existing.builders = b.builders;
      } else {
        buildingTiles.push({ x: b.x, y: b.y, assignees: 0, builders: b.builders });
      }
    }

    // Try to determine tile size from the grid children
    const tileEls = gridEl.children;
    if (tileEls.length === 0) return;
    const firstTile = tileEls[0];
    const tileRect = firstTile.getBoundingClientRect();
    const gridRect = gridEl.getBoundingClientRect();
    const tileW = tileRect.width;
    const tileH = tileRect.height;

    for (const bt of buildingTiles) {
      // Attempt to find the tile element by index or data attribute
      // Common patterns: grid children ordered by row then col, or data-x/data-y attributes
      let tileEl = gridEl.querySelector(`[data-x="${bt.x}"][data-y="${bt.y}"]`);
      if (!tileEl) {
        // Fallback: assume row-major order (y * cols + x) for a 9x9 grid
        const index = bt.y * 9 + bt.x;
        tileEl = tileEls[index];
      }

      if (!tileEl) continue;
      const tilePos = tileEl.getBoundingClientRect();
      const relX = tilePos.left - gridRect.left;
      const relY = tilePos.top - gridRect.top;

      if (bt.assignees > 0) {
        const badge = document.createElement('div');
        badge.className = 'tom-badge tom-badge-worker';
        badge.textContent = bt.assignees;
        badge.style.position = 'absolute';
        badge.style.left = (relX + 2) + 'px';
        badge.style.top = (relY + 2) + 'px';
        badgeContainer.appendChild(badge);
      }

      if (bt.builders > 0) {
        const badge = document.createElement('div');
        badge.className = 'tom-badge tom-badge-builder';
        badge.textContent = bt.builders;
        badge.style.position = 'absolute';
        badge.style.left = (relX + tilePos.width - 20) + 'px';
        badge.style.top = (relY + 2) + 'px';
        badgeContainer.appendChild(badge);
      }
    }
  }
```

- [ ] **Step 2: Wire badges into the data listener**

Update the `onTownData` callback in `domReady`:

```javascript
  domReady(() => {
    injectStyles();
    onTownData((data) => {
      const parsed = parseTownData(data);
      renderPanel(parsed);
      renderBadges(parsed);
    });
  });
```

- [ ] **Step 3: Test grid badges**

Reload the game page. If the grid DOM is found, badges should appear on building tiles. If the console shows `[TOM Overlay] Grid container not found`, the game's DOM structure needs manual inspection — user should provide the grid HTML via Claude in Chrome or a screenshot.

- [ ] **Step 4: Commit**

```bash
git add tribes-of-malaya-overlay.user.js
git commit -m "feat: add grid badges for worker/builder counts on tiles"
```

---

### Task 7: Close the IIFE + Final Assembly

**Files:**
- Modify: `tribes-of-malaya-overlay.user.js`

- [ ] **Step 1: Ensure the IIFE is properly closed**

The very last line of the file should close the IIFE:

```javascript
})();
```

- [ ] **Step 2: Remove any temporary console.log statements**

Search the file for any `console.log('[TOM Overlay]` lines that were for debugging (keep the grid-not-found warning). Remove the "Town data intercepted" and "Parsed" debug logs.

- [ ] **Step 3: Full end-to-end test**

1. Install the userscript in Tampermonkey
2. Navigate to `https://war.add.ph/my/town/800`
3. Verify: overlay panel appears with correct population, idle workers, assigned workers, construction status
4. Verify: panel is draggable and collapsible
5. Verify: grid badges appear on buildings (or graceful fallback message in console)
6. Refresh the page — verify data updates

- [ ] **Step 4: Commit**

```bash
git add tribes-of-malaya-overlay.user.js
git commit -m "feat: finalize worker overlay userscript v1.0"
```
