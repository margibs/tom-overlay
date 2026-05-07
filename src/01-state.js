  const VERSION = "1.6.8"; // keep in sync with @version in 00-header.js

  let townData = null;
  let userTribe = null; // detected from owner.tribe in town API
  let tickInterval = 300; // seconds; updated dynamically from last_food_production_time
  let buildingQueueMax = null; // detected from failed PATCH response
  let lastMarketTrades = null; // { items: [...], meta: {...} } from /buildings/:id/trades
  const listeners = [];

  // Chat market offers captured from /api/updates polling
  // Each entry: { id, username, timestamp, offerSlug, offerQty, takerSlug, takerQty, raw }
  const chatOffers = [];
  const chatOfferIds = new Set();
  const CHAT_OFFER_CAP = 200;
  const CHAT_OFFER_REGEX = /Nag-aalok ako ng .+ sa Market!/;
  const CHAT_OFFER_TOKEN_REGEX = /\[item:([a-z_]+):(\d+)\]/g;

  // Parse one chat update payload; push new market offers into chatOffers.
  // Returns true if any new offers were added (so caller can re-render).
  function ingestChatOffers(json) {
    const msgs = json && json.append && json.append.global_messages;
    if (!Array.isArray(msgs) || msgs.length === 0) return false;
    let added = false;
    for (const m of msgs) {
      if (!m || !m.message || chatOfferIds.has(m.id)) continue;
      if (!CHAT_OFFER_REGEX.test(m.message)) continue;
      const tokens = [];
      let match;
      CHAT_OFFER_TOKEN_REGEX.lastIndex = 0;
      while ((match = CHAT_OFFER_TOKEN_REGEX.exec(m.message)) !== null) {
        tokens.push({ slug: match[1], qty: parseInt(match[2], 10) });
      }
      if (tokens.length < 2) continue;
      const qtyMatch = m.message.match(
        /Nag-aalok ako ng .+? x\s*([\d,]+)\s+para sa .+? x\s*([\d,]+)/,
      );
      const offerQty = qtyMatch
        ? parseInt(qtyMatch[1].replace(/,/g, ""), 10)
        : tokens[0].qty;
      const takerQty = qtyMatch
        ? parseInt(qtyMatch[2].replace(/,/g, ""), 10)
        : tokens[1].qty;
      chatOfferIds.add(m.id);
      chatOffers.unshift({
        id: m.id,
        username: m.username,
        timestamp: m.timestamp,
        emblem: m.emblem || null,
        offerSlug: tokens[0].slug,
        offerQty,
        takerSlug: tokens[1].slug,
        takerQty,
        raw: m.message,
      });
      added = true;
    }
    if (chatOffers.length > CHAT_OFFER_CAP) {
      const dropped = chatOffers.splice(CHAT_OFFER_CAP);
      for (const d of dropped) chatOfferIds.delete(d.id);
    }
    return added;
  }

  // --- Tick counter for per-tick caching ---
  let _tickCount = 0;
  function advanceTick() { _tickCount++; }
  function currentTick() { return _tickCount; }

  // --- Shared tile position builder ---
  let _sharedTilePositions = {};
  function rebuildTilePositions() {
    const tileEls = document.querySelectorAll(".tile-overlay");
    if (tileEls.length === 0) return;
    _sharedTilePositions = {};
    tileEls.forEach((el, i) => {
      const x = Math.floor(i / 9);
      const y = i % 9;
      _sharedTilePositions[`${x},${y}`] = {
        left: el.style.left,
        top: el.style.top,
        bottom: el.style.bottom,
      };
    });
  }
  function getSharedTilePositions() { return _sharedTilePositions; }

  // --- Worker color helper ---
  function getWorkerColor(ratio, isFull, craftIdle, assignees) {
    if (craftIdle && assignees <= 0) return "#fb923c";
    if (isFull && !craftIdle) return "#fff";
    if (isFull && craftIdle) return "#fb923c";
    if (ratio >= 0.75) return "#4ade80";
    if (ratio >= 0.4) return "#fb923c";
    return "#ef4444";
  }

  // --- Building level extractor ---
  function getBuildingLevel(slug) {
    const m = slug.match(/(\d+)$/);
    return m ? parseInt(m[1]) : 1;
  }
