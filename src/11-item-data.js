// --- Item display names + categories (shared by crafter sort) ---

const ITEM_NAMES = {
  food: "Food",
  wood: "Wood",
  mineral: "Mineral",
  leather: "Leather",
  lumber: "Lumber",
  stick: "Sticks",
  iron_nugget: "Iron Nugget",
  steel_nugget: "Steel Nugget",
  coconut_charcoal: "Coconut Charcoal",
  gold_dust: "Gold Dust",
  gold_coin: "Gold Coin",
  sword: "Sword",
  sword2: "Steel Sword",
  gun: "Gun",
  gun2: "Steel Gun",
  spear: "Spear",
  spear2: "Steel Spear",
  bow_and_arrow: "Composite Bow",
  bow_and_arrow_2: "Composite Bow II",
  stone_axe: "Stone Axe",
  tent: "Tent",
  salt: "Salt",
  tiula_itum: "Tiula Itum",
  peace_amululet8_free: "Peace Amulet",
};

const ITEM_CATEGORY = {};
["food", "wood", "mineral"].forEach(
  (s) => (ITEM_CATEGORY[s] = { group: "Resources", order: 0 }),
);
[
  "leather",
  "lumber",
  "stick",
  "iron_nugget",
  "steel_nugget",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Materials", order: 1 }));
[
  "sword",
  "sword2",
  "gun",
  "gun2",
  "spear",
  "spear2",
  "bow_and_arrow",
  "bow_and_arrow_2",
  "stone_axe",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Weapons", order: 2 }));
[
  "salt",
  "gold_dust",
  "coconut_charcoal",
  "tiula_itum",
  "inasal",
  "adobo",
].forEach((s) => (ITEM_CATEGORY[s] = { group: "Tribal Locked", order: 3 }));
["tent", "gold_coin", "peace_amululet8_free"].forEach(
  (s) => (ITEM_CATEGORY[s] = { group: "Other", order: 4 }),
);
