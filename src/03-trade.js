  // --- Trade Calculator ---
  const WM_RATES = { food: 0.25, wood: 0.3125, mineral: 0.3125 };
  let goldWmRate = parseFloat(localStorage.getItem("tom-gold-rate")) || 800;

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
    if (slug === "gold_coin")
      return { wm: qty * goldWmRate, base: { "gold coin": qty }, craftSecs: 0 };
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
