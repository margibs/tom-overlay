  const VERSION = "1.4.6"; // keep in sync with @version in 00-header.js

  let townData = null;
  let userTribe = null; // detected from owner.tribe in town API
  let tickInterval = 300; // seconds; updated dynamically from last_food_production_time
  let buildingQueueMax = null; // detected from failed PATCH response
  let lastMarketTrades = null; // { items: [...], meta: {...} } from /buildings/:id/trades
  const listeners = [];
