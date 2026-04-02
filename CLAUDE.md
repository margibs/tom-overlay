# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Conventions

- **Never add `Co-Authored-By` lines to commits.** Commits are authored by the repo owner only.

## What This Is

A Tampermonkey userscript that overlays game data on [Tribes of Malaya](https://war.add.ph/my/town/*). It intercepts the game's API responses and renders an overlay panel with tabs for town overview, crafting analysis, and trade evaluation.

## Versioning

When bumping the version, update **two places**:
1. `src/00-header.js` — `@version` line
2. `src/01-state.js` — `const VERSION` constant (displayed in the overlay header)

## Build Commands

```bash
npm run build        # concatenate src/ → tribes-of-malaya-overlay.user.js
npm run build:min    # same but minified via terser (~46KB vs ~77KB)
npm run watch        # auto-rebuild on src/ file changes
```

**Deploy:** paste the contents of `tribes-of-malaya-overlay.user.js` into Tampermonkey.

After editing any `src/` file, always run `npm run build` before testing in the browser.

## Source Layout

The script is split into numbered modules that are concatenated in order. All files contribute content inside one IIFE — there is no module system, just shared closure scope.

| File | Responsibility |
|---|---|
| `src/00-header.js` | `// ==UserScript==` metadata only |
| `src/01-state.js` | Top-level mutable state shared across all modules |
| `src/02-recipes.js` | `CRAFT_RECIPES` array, ingredient resolution helpers (`resolveBaseCost`, `getCraftSteps`, `maxCraftable`, `totalCraftTime`) |
| `src/03-trade.js` | Worker-minutes valuation (`calcValue`), `TRADE_ITEMS`, gold rate config |
| `src/04-interceptors.js` | `fetch` and `XHR` intercepts that capture game API responses and call `notifyListeners` |
| `src/05-parser.js` | `parseTownData` — transforms raw API JSON into the structured object used by the renderer |
| `src/06-styles.js` | All CSS injected via `injectStyles()` |
| `src/07-renderer.js` | `renderPanel` (Overview/Crafting/Trade tabs) + `initDrag` |
| `src/08-badges.js` | `renderBadges` — floating worker/troop labels on the map grid |
| `src/09-timers.js` | `getActiveTimers`, `renderTimerBadges`, `renderActiveCraftingQueue`, `checkExpiredTimers` |
| `src/10-main.js` | `domReady` init, `setInterval` tick (1s), `renderAll`, `rebuildDerived` |

## Data Flow

1. **API intercept** (`04-interceptors.js`): `fetch`/`XHR` intercepts fire on every `GET /my/town/:id` response and call `notifyListeners(json)`.
2. **Parse** (`05-parser.js`): `parseTownData(json)` → `lastParsed` — extracts populations, buildings, resources, inventory, withheld quantities.
3. **Render** (`10-main.js` → `07-renderer.js` + `08-badges.js`): `renderAll()` calls `renderPanel(lastParsed)` and `renderBadges(lastParsed)`.
4. **1-second tick** (`10-main.js`): `setInterval` updates timer badges on the map, the active crafting queue countdown, and the population countdown.

Timer data comes from **`localStorage["persist:timer"]`** (the game's own timer store), not from the API — `getActiveTimers()` parses it directly.

## Key Architectural Decisions

**Withheld resources:** The game withholds resources for active crafting/market orders. Available qty = `item.quantity - crafting_quantity_withheld - market_quantity_withheld - server_withheld`. Both `parseTownData` and `renderPanel`'s craft inventory use this pattern.

**Recipe slugs:** Crafted item slugs use underscore-separated names (e.g. `iron_nugget`, `sword2` for Steel Sword). The `recipeBySlug` lookup maps slug → recipe. Tier-2 weapons append `2` to the base name.

**Worker-minutes (wm):** Base resources have fixed wm rates (food: 0.25, wood/mineral: 0.3125). Crafted items add material wm + craft time wm (1 wm/min). `calcValue(slug, qty)` returns `{ wm, matWm, craftWm, craftSecs, base }`.

**Tribe-locked recipes:** `TRIBE_LOCKED` set marks recipes the current player's tribe cannot craft. `resolveBaseCost` treats these as external (buy/trade) rather than crafting through them.

**Change detection for active crafting queue:** `lastCraftTimerKey` (a sorted fingerprint of active timer IDs) prevents full DOM rebuilds every second — only countdown spans are updated in-place via `data-finish` attributes.

## Design System

See `design/DESIGN.md` for the visual design direction ("The Chronicler's Heritage" — skeuomorphic relic aesthetic). Key CSS conventions already in use:

- Colors: dark background (`rgba(0,0,0,0.88)`), gold accents (`#fbbf24`, `#e9c176`), green positive (`#4ade80`), red urgent (`#ef4444`), purple crafting (`#a855f7`)
- Fonts: Work Sans (labels/timers), system-ui fallback for body
- No 1px solid borders — use `rgba(255,255,255,0.05)` bottom borders for rows
- Category dot colors: resource `#22c55e`, military `#ef4444`, crafting `#a855f7`, infrastructure `#3b82f6`
