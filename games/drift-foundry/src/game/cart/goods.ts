/**
 * What the shelves hold. Every grab goes in the basket and changes the cart: heavy goods add momentum
 * and stability but kill the launch, a basket of light goods makes it twitchy, and five items are
 * power-ups that ride in the child seat until you use them. Prices are what the self-checkout rings
 * up at the finish. No real brands: every label is a generic store-brand product.
 */

/** How an item sits in the basket: heavy goods settle the cart, light goods leave it twitchy. */
export type GoodsHeft = "heavy" | "normal" | "light";

export type PowerUpId = "extinguisher" | "marbles" | "mop" | "bouncy_balls" | "rotisserie_chicken";

export interface GoodsDef {
  id: string;
  kind: "goods";
  label: string;
  /** Kilograms in the basket. */
  weight: number;
  /** Dollars at the self-checkout. */
  price: number;
  heft: GoodsHeft;
  /** Packaging colour: the shelf model and the HUD chip. */
  color: string;
}

export interface PowerUpDef {
  id: PowerUpId;
  kind: "power";
  label: string;
  weight: number;
  price: number;
  color: string;
  /** What the PA says when you use it. */
  useLine: string;
  /** One line for the HUD and the pit. */
  blurb: string;
}

export type ShelfItem = GoodsDef | PowerUpDef;

const goods = (id: string, label: string, weight: number, price: number, color: string): GoodsDef => ({
  id,
  kind: "goods",
  label,
  weight,
  price,
  heft: weight >= HEAVY_KG ? "heavy" : weight <= LIGHT_KG ? "light" : "normal",
  color,
});

/** An item at or over this weight reads as heavy. */
export const HEAVY_KG = 4;
/** An item at or under this weight reads as light. */
export const LIGHT_KG = 1;

export const GOODS: readonly GoodsDef[] = [
  goods("watermelon", "Watermelon", 8, 6, "#3fae4a"),
  goods("kettlebell", "Kettlebell", 12, 40, "#2b2f36"),
  goods("paint_can", "Paint Can", 5, 28, "#e8463a"),
  goods("dog_food", "Giant Dog Food", 9, 24, "#c98a2b"),
  goods("skillet", "Cast-Iron Skillet", 4, 35, "#3a3a3a"),
  goods("big_tv", "65\" Television", 14, 480, "#1b1d24"),
  goods("pumpkin", "Pumpkin", 5, 7, "#ff8a1e"),
  goods("garden_gnome", "Garden Gnome", 4, 22, "#d6403a"),
  goods("potted_fern", "Potted Fern", 3, 18, "#2f8f4a"),
  goods("soda_case", "Soda 24-Pack", 6, 12, "#e8463a"),
  goods("frozen_pizza", "Frozen Pizza", 1.5, 7, "#ffcf3a"),
  goods("ice_cream", "Ice-Cream Tub", 1.5, 6, "#f7b8d2"),
  goods("game_console", "Game Console", 2.5, 380, "#f4f4f4"),
  goods("headphones", "Headphones", 0.4, 140, "#4a6cff"),
  goods("teddy_bear", "Teddy Bear", 0.8, 24, "#b0703a"),
  goods("chips", "Party-Size Chips", 0.3, 4, "#ffd21e"),
  goods("paper_towels", "Paper Towels 12-Roll", 0.6, 11, "#f2f2f2"),
  goods("cereal", "Frosted Loops Cereal", 0.5, 5, "#3fb6ff"),
  goods("marshmallows", "Jumbo Marshmallows", 0.2, 3, "#ffe9f2"),
  goods("rubber_duck", "Rubber Duck", 0.1, 2, "#ffd400"),
];

export const POWER_UPS: readonly PowerUpDef[] = [
  {
    id: "extinguisher",
    kind: "power",
    label: "Fire Extinguisher",
    weight: 3,
    price: 45,
    color: "#e8262a",
    useLine: "EXTINGUISHER BOOST — WHOOSH!",
    blurb: "Point it backwards and squeeze: two seconds of boost.",
  },
  {
    id: "marbles",
    kind: "power",
    label: "Bag of Marbles",
    weight: 1,
    price: 6,
    color: "#5de0ce",
    useLine: "MARBLES ON AISLE 9 — WATCH YOUR STEP BACK THERE",
    blurb: "Spill them behind you. Anyone who rolls through spins out.",
  },
  {
    id: "mop",
    kind: "power",
    label: "Wet Mop",
    weight: 2,
    price: 18,
    color: "#7a5cff",
    useLine: "MOP SPIN — CLEANUP ON AISLE 9!",
    blurb: "Spin it round: every cart beside you gets swatted off its line.",
  },
  {
    id: "bouncy_balls",
    kind: "power",
    label: "Bouncy Ball Stack",
    weight: 1,
    price: 9,
    color: "#ff4fa0",
    useLine: "BOUNCY BALLS — BOING BOING BOING",
    blurb: "Dump them under the casters for one huge bounce. Clears any pallet ramp.",
  },
  {
    id: "rotisserie_chicken",
    kind: "power",
    label: "Rotisserie Chicken",
    weight: 1.5,
    price: 8,
    color: "#d9902b",
    useLine: "ROTISSERIE CHICKEN — CART FEELS BRAND NEW",
    blurb: "Heals the cart. Obviously.",
  },
];

const BY_ID = new Map<string, ShelfItem>([...GOODS, ...POWER_UPS].map((item) => [item.id, item]));

export function shelfItemById(id: string): ShelfItem | null {
  return BY_ID.get(id) ?? null;
}

export function powerUpById(id: string): PowerUpDef | null {
  const item = BY_ID.get(id);
  return item?.kind === "power" ? item : null;
}
