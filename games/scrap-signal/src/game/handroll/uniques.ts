import type { GunElement, GunFamily, Rarity } from "./guns";

/**
 * A quest-reward unique: a neighbour's own named piece of junk, handed over when a job is done. Its
 * mod, body, condition and element are fixed; its numbers still roll at the player's level like any
 * gun. `maker` is the mod id (the slot an old gun maker held).
 */
export interface UniqueGun {
  name: string;
  maker: string;
  family: GunFamily;
  rarity: Extract<Rarity, "rare" | "epic">;
  /** The element it always carries. A mod that never goes elemental (Cinder Block) takes none. */
  element: GunElement;
}

export const UNIQUE_GUNS: readonly UniqueGun[] = [
  { name: "Kindler", maker: "Duct Tape", family: "pistol", rarity: "rare", element: "incendiary" },
  { name: "Static Cling", maker: "Batteries", family: "smg", rarity: "rare", element: "shock" },
  { name: "Undertow", maker: "Extension Cord", family: "rifle", rarity: "rare", element: "none" },
  { name: "Toll Booth", maker: "Rubber Bands", family: "shotgun", rarity: "rare", element: "none" },
  { name: "Toasty's Kiss", maker: "Firecrackers", family: "shotgun", rarity: "rare", element: "explosive" },
  { name: "Wet Blanket", maker: "Duct Tape", family: "sniper", rarity: "rare", element: "shock" },
  { name: "Abdication", maker: "Batteries", family: "rifle", rarity: "rare", element: "none" },
  { name: "Triage", maker: "Duct Tape", family: "pistol", rarity: "rare", element: "corrosive" },
  { name: "Swarm Ender", maker: "Laundry Basket", family: "shotgun", rarity: "epic", element: "incendiary" },
  { name: "Cache Key", maker: "Extension Cord", family: "smg", rarity: "rare", element: "none" },
  { name: "Freezer Burn", maker: "Batteries", family: "smg", rarity: "rare", element: "corrosive" },
  { name: "Buzzkill's Stinger", maker: "Cinder Block", family: "pistol", rarity: "epic", element: "none" },
  { name: "Gutter Cleaner", maker: "Extension Cord", family: "rifle", rarity: "epic", element: "shock" },
  { name: "Spitfire", maker: "Batteries", family: "smg", rarity: "epic", element: "incendiary" },
  { name: "Frosty's Toaster", maker: "Laundry Basket", family: "launcher", rarity: "epic", element: "none" },
  { name: "Door Stopper", maker: "Rubber Bands", family: "shotgun", rarity: "epic", element: "corrosive" },
  { name: "Glass Cannon", maker: "Cinder Block", family: "sniper", rarity: "epic", element: "none" },
  { name: "Shard Splitter", maker: "Glitter", family: "sniper", rarity: "epic", element: "flux" },
  { name: "Coil Burner", maker: "Firecrackers", family: "launcher", rarity: "epic", element: "explosive" },
  { name: "Sid's Woofer", maker: "Batteries", family: "rifle", rarity: "epic", element: "corrosive" },
  { name: "Census Taker", maker: "Glitter", family: "rifle", rarity: "rare", element: "flux" },
  { name: "News at Eleven", maker: "Glitter", family: "smg", rarity: "epic", element: "flux" },
  { name: "Antivirus", maker: "Extension Cord", family: "rifle", rarity: "epic", element: "corrosive" },
  { name: "Bass Spitter", maker: "Firecrackers", family: "smg", rarity: "epic", element: "explosive" },
  { name: "Dust Devil", maker: "Extension Cord", family: "pistol", rarity: "rare", element: "incendiary" },
  { name: "Long Way Home", maker: "Cinder Block", family: "rifle", rarity: "epic", element: "none" },
  { name: "Hairball", maker: "Duct Tape", family: "vacuum", rarity: "rare", element: "none" },
  { name: "Cold Shoulder", maker: "Extension Cord", family: "extinguisher", rarity: "epic", element: "shock" },
];

export function uniqueGun(name: string): UniqueGun | undefined {
  return UNIQUE_GUNS.find((gun) => gun.name === name);
}
