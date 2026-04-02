# Tribes of Malaya — Worker Overlay

A Tampermonkey userscript that adds a HUD overlay to [Tribes of Malaya](https://war.add.ph). It intercepts the game's API and shows town data in real time — no page reload needed.

## Features

- **Overview tab** — worker assignments, idle workers, population countdown, building construction queue
- **Crafting tab** — recipe list with live craftable counts based on your current inventory, total craft time, required-by chains, and active crafting queue with M:SS countdowns
- **Trade tab** — worker-minutes valuation for any item, gold coin rate config

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. Click **[Install Script](https://raw.githubusercontent.com/margibs/tom-overlay/main/tribes-of-malaya-overlay.user.js)**
3. Tampermonkey will prompt you to install — click **Install**

Once installed, the script auto-updates from this repository. No manual reinstall needed for future updates.

## Usage

Open any town page at `https://war.add.ph/my/town/*`. The overlay panel appears in the bottom-right corner. Drag it to reposition, resize from the bottom-right handle, or collapse it with the **−** button.

## Development

```bash
npm install          # install terser (minification only)
npm run build        # concat src/ → tribes-of-malaya-overlay.user.js (~77KB)
npm run build:min    # same but minified via terser (~47KB)
npm run watch        # auto-rebuild on src/ changes
```

Source is split into numbered modules under `src/` that concatenate into one IIFE. Edit a module, run `npm run build:min`, then push — Tampermonkey picks up the update automatically.

| File | Contents |
|---|---|
| `src/00-header.js` | UserScript metadata |
| `src/01-state.js` | Shared mutable state |
| `src/02-recipes.js` | Crafting recipes and ingredient resolution |
| `src/03-trade.js` | Worker-minutes valuation and trade items |
| `src/04-interceptors.js` | `fetch`/XHR intercepts for game API |
| `src/05-parser.js` | Transforms raw API JSON into overlay data |
| `src/06-styles.js` | All injected CSS |
| `src/07-renderer.js` | Panel UI (tabs, trade evaluator) |
| `src/08-badges.js` | Floating worker/troop labels on the map |
| `src/09-timers.js` | Timer badges, active crafting queue countdown |
| `src/10-main.js` | Init, 1-second tick, render orchestration |
