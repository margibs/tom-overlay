  let townData = null;
  let tickInterval = 300; // seconds; updated dynamically from last_food_production_time
  let popRatePerSec = 0; // population_remainder units per second; measured from API deltas
  let buildingQueueMax = null; // detected from failed PATCH response
  const listeners = [];
