# Tribes of Malaya — Worker Overlay Userscript

## Overview

A Tampermonkey userscript that runs on `war.add.ph/my/town/*` and displays a floating overlay panel showing worker assignments, idle workers, and building construction status. The goal is to make worker management visible at a glance while the game UI is still rough (beta).

## Data Capture

- The userscript hooks `fetch` and/or `XMLHttpRequest.prototype.open` on the game page
- Intercepts responses matching the town API pattern (`/my/town/*`)
- Parses the JSON response to extract: `populations`, `tiles` (with buildings), `population`, `population_capacity`
- Re-triggers parsing whenever the game re-fetches (navigation, refresh)
- No additional API calls — reads what the game already fetches

## Overlay Panel

A floating, draggable, collapsible panel rendered in the bottom-right corner of the game page.

### Panel Sections

1. **Summary Header**
   - Population: current / capacity (e.g. "31 / 112")
   - Morale percentage
   - Total idle workers count (highlighted if > 0)

2. **Idle Workers** (highlighted section)
   - Lists each population type with idle count > 0
   - Format: "{quantity} {type_label} idle"
   - e.g. "2 Tausug Warriors idle"

3. **Assigned Workers Table**
   - Each building that has `assignee_count > 0`
   - Columns: Building name (from slug, prettified), Location (x,y), Workers assigned
   - Sorted by worker count descending
   - e.g. "Farmer Lv3 — (7,1) — 3 workers"

4. **Under Construction**
   - Buildings with `builders_count > 0`
   - Shows: building name, location, builder count
   - e.g. "Barracks Lv1 — (0,4) — 3 builders"

### Grid Badges

Small numbered badges overlaid directly on each building tile in the game grid.

- For each tile with a building, position a small badge on top of the corresponding grid cell
- **Worker badge** (blue): shows `assignee_count` if > 0
- **Builder badge** (orange): shows `builders_count` if > 0
- Badges are small circles (~18px) with the count number inside
- Positioned relative to the game's grid DOM elements — the userscript finds the grid container and maps (x,y) coordinates to the corresponding tile elements
- If both assignees and builders exist on a building, show both badges (worker top-left, builder top-right)
- Badges update whenever the intercepted data refreshes
- **Discovery needed:** The exact DOM structure of the game grid (how tiles are rendered) will determine how we position badges. May need to inspect the game page to find the grid container and tile selectors. User can provide this info via Claude in Chrome if needed.

### Styling

- Dark semi-transparent background (`rgba(0,0,0,0.85)`)
- Light text, small font (~12px)
- Fixed position, bottom-right corner by default
- Draggable via header bar
- Collapsible: click header to toggle body visibility
- High z-index to float above game elements
- Max height with scroll for long lists
- Idle workers section uses a highlight color (amber/yellow) when idle > 0

### Slug Prettification

Building slugs like `farmer3`, `command_center5`, `archery_grounds2` are converted to display names:
- Split on underscore, capitalize each word
- Extract trailing number as level
- Result: "Farmer Lv3", "Command Center Lv5", "Archery Grounds Lv2"

Population type slugs like `tausug_warrior` → "Tausug Warrior"

## File Structure

Single file: `tribes-of-malaya-overlay.user.js`

Sections within the file:
1. Tampermonkey metadata header (`@match`, `@grant`, etc.)
2. Fetch/XHR intercept logic
3. Data parser (extract workers, buildings, idle counts)
4. UI renderer (create/update DOM overlay)
5. Drag logic
6. Styles (injected via `<style>` tag)

## Scope

**In scope:**
- Worker visibility (idle counts, assignments per building)
- Grid badges showing worker/builder counts on each building tile
- Construction status (builders per building)
- Population summary
- Auto-update on game data refresh

**Out of scope (future):**
- Resource tracking / production rates
- Build recommendations / advisor
- Automation of any game actions
- Persistent settings (panel position, etc.)

## Technical Details

- Tampermonkey `@match`: `https://war.add.ph/my/town/*`
- `@grant`: `none` (runs in page context to intercept fetch)
- No external dependencies — vanilla JS and CSS
- Compatible with standard Tampermonkey on Chrome
