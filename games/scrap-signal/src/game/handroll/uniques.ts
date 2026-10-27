import type { GunElement, GunFamily, Rarity } from "./guns";

/**
 * A quest-reward unique: Borderlands' named blue and purple guns a side quest hands over. Its maker,
 * family, rarity and element are fixed; its numbers still roll at the player's level like any gun.
 */
export interface UniqueGun {
  name: string;
  maker: string;
  family: GunFamily;
  rarity: Extract<Rarity, "rare" | "epic">;
  /** The element it always carries. A maker that never goes elemental (Blackwood) takes none. */
  element: GunElement;
}

export const UNIQUE_GUNS: readonly UniqueGun[] = [
  { name: "Kindler", maker: "Voltek", family: "pistol", rarity: "rare", element: "incendiary" },
  { name: "Static Cling", maker: "Voltek", family: "smg", rarity: "rare", element: "shock" },
  { name: "Undertow", maker: "Vanguard", family: "rifle", rarity: "rare", element: "none" },
  { name: "Toll Booth", maker: "Chuckwerk", family: "shotgun", rarity: "rare", element: "none" },
  { name: "Scald's Kiss", maker: "Detonic", family: "shotgun", rarity: "rare", element: "explosive" },
  { name: "Vexer", maker: "Apex", family: "sniper", rarity: "rare", element: "shock" },
  { name: "Shore Leave", maker: "Ironworks", family: "rifle", rarity: "rare", element: "none" },
  { name: "Triage", maker: "Apex", family: "pistol", rarity: "rare", element: "corrosive" },
  { name: "Brood Ender", maker: "Scrapjack", family: "shotgun", rarity: "epic", element: "incendiary" },
  { name: "Cache Key", maker: "Vanguard", family: "smg", rarity: "rare", element: "none" },
  { name: "Hauler's Due", maker: "Ironworks", family: "smg", rarity: "rare", element: "corrosive" },
  { name: "Gristle's Fang", maker: "Blackwood", family: "pistol", rarity: "epic", element: "none" },
  { name: "Ridgeback", maker: "Vanguard", family: "rifle", rarity: "epic", element: "shock" },
  { name: "Spitfire", maker: "Voltek", family: "smg", rarity: "epic", element: "incendiary" },
  { name: "Rivet Gun", maker: "Scrapjack", family: "launcher", rarity: "epic", element: "none" },
  { name: "Skitter Swatter", maker: "Chuckwerk", family: "shotgun", rarity: "epic", element: "corrosive" },
  { name: "Glass Cannon", maker: "Blackwood", family: "sniper", rarity: "epic", element: "none" },
  { name: "Shard Splitter", maker: "Voltek", family: "sniper", rarity: "epic", element: "shock" },
  { name: "Cinder Heart", maker: "Detonic", family: "launcher", rarity: "epic", element: "explosive" },
  { name: "Krell's Hammer", maker: "Ironworks", family: "rifle", rarity: "epic", element: "corrosive" },
  { name: "Census Taker", maker: "Apex", family: "rifle", rarity: "rare", element: "flux" },
  { name: "Wreck Diver", maker: "Scrapjack", family: "smg", rarity: "epic", element: "flux" },
  { name: "Blight Lance", maker: "Voltek", family: "rifle", rarity: "epic", element: "corrosive" },
  { name: "Slag Spitter", maker: "Detonic", family: "smg", rarity: "epic", element: "explosive" },
  { name: "Dust Devil", maker: "Vanguard", family: "pistol", rarity: "rare", element: "incendiary" },
  { name: "Long Way Home", maker: "Blackwood", family: "rifle", rarity: "epic", element: "none" },
];

export function uniqueGun(name: string): UniqueGun | undefined {
  return UNIQUE_GUNS.find((gun) => gun.name === name);
}
