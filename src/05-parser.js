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
      populationRemainder: data.population_remainder || 0,
      populationRemainderTime: Date.now() / 1000,
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
