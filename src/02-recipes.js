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
      name: "Gold Dust",
      slug: "gold_dust",
      yield: 3,
      time: null, // TODO: confirm craft time
      ingredients: [{ slug: "mineral", qty: 60 }],
    },
  ];

  // Which tribe exclusively crafts each recipe.
  // TODO: confirm exact in-game tribe name spelling for each entry
  const TRIBE_EXCLUSIVE = {
    "salt":             "sugbuanon",  // TODO: confirm tribe name
    "gold_dust":        "taga_ilog",  // TODO: confirm tribe name
    "coconut_charcoal": "tausug",     // TODO: confirm tribe name
  };

  // Recipes the current user's tribe cannot craft (computed from userTribe).
  // Falls back to locking all tribe-exclusive recipes if tribe is not yet detected.
  function getTribeLocked() {
    if (!userTribe) return new Set(Object.keys(TRIBE_EXCLUSIVE));
    return new Set(
      Object.entries(TRIBE_EXCLUSIVE)
        .filter(([, owner]) => owner !== userTribe)
        .map(([slug]) => slug)
    );
  }

  function canCraftRecipe(slug) {
    return !getTribeLocked().has(slug);
  }

  // Lookup recipe by product slug
  const recipeBySlug = {};
  for (const r of CRAFT_RECIPES) recipeBySlug[r.slug] = r;

  // Resolve base material cost for one craft of a recipe.
  // Tribe-locked ingredients are treated as external (not resolved further).
  function resolveBaseCost(recipe) {
    const base = {};
    for (const ing of recipe.ingredients) {
      if (BASE_MATERIALS.has(ing.slug) || !canCraftRecipe(ing.slug)) {
        base[ing.slug] = (base[ing.slug] || 0) + ing.qty;
      } else {
        const sub = recipeBySlug[ing.slug];
        if (!sub) continue;
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
