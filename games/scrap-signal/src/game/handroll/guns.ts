import type { AmmoPool } from "../ammo";

export type GunFamily = "pistol" | "smg" | "shotgun" | "rifle" | "sniper" | "launcher" | "vacuum" | "extinguisher";
export type GunElement = "none" | "incendiary" | "shock" | "corrosive" | "explosive" | "flux";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Surface = "flesh" | "armor";

export interface GunWeaponStats {
  damage: number;
  range: number;
  spread: number;
  fireIntervalMs: number;
  critChance: number;
  critMult: number;
  pellets?: number;
  /** A rocket: flies at this speed and bursts on the first thing it meets. */
  projectile?: { speed: number };
  explosion?: { radius: number };
}

export interface GunDef {
  id: string;
  kind: "gun";
  name: string;
  family: GunFamily;
  /** The gun's Mod (the junk bolted onto its body): an id in {@link MANUFACTURERS}. */
  manufacturer: string;
  /** The gun model: `legendary:<name>` for an heirloom, else `<mod>:<family>`. */
  model?: string;
  rarity: Rarity;
  element: GunElement;
  level: number;
  ammo: AmmoPool;
  auto: boolean;
  ammoPerShot: number;
  magSize: number;
  reloadMs: number;
  elementChance: number;
  elementDps: number;
  use: "fireGun";
  weapon: GunWeaponStats;
  /** Perk ids (see `perks.ts`); absent on guns saved before perks, which derive the same list. */
  perks?: readonly string[];
  /** Personality id (see `personality.ts`); absent on older guns, which derive it from their id. */
  personality?: string;
}

/** What a body does beyond its numbers: the vacuum drags, the extinguisher chills. */
export type BodySpecial = "pull" | "slow";

export interface FamilyBase {
  family: GunFamily;
  /** The household thing the gun is built around: what the player reads instead of a gun class. */
  body: string;
  /** One-line read of how the body shoots. */
  bodyText: string;
  ammo: AmmoPool;
  auto: boolean;
  ammoPerShot: number;
  magSize: number;
  reloadMs: number;
  nouns: readonly string[];
  stats: GunWeaponStats;
  special?: BodySpecial;
}

/**
 * The bodies. Every Junk Drawer weapon is a household thing with a trigger bolted on; the internal
 * family ids (`pistol`, `smg`, ...) stay as the save and drop identity, and the body is what the
 * player reads. Two bodies have no older family: the vacuum (pulls what it hits toward you) and the
 * fire extinguisher (a cold cone that slows).
 */
export const FAMILY_BASES: readonly FamilyBase[] = [
  {
    family: "pistol",
    body: "Staple Gun",
    bodyText: "Semi-auto. Reliable, punchy, office-grade.",
    ammo: "pistol",
    auto: false,
    ammoPerShot: 1,
    magSize: 12,
    reloadMs: 1200,
    nouns: ["Stapler", "Desk Jockey", "Paper Pusher", "Clacker", "Memo"],
    stats: { damage: 14, range: 60, spread: 1.4, fireIntervalMs: 260, critChance: 0.15, critMult: 2 },
  },
  {
    family: "smg",
    body: "Nail Gun",
    bodyText: "Full-auto. Spits nails faster than a roofer in August.",
    ammo: "smg",
    auto: true,
    ammoPerShot: 1,
    magSize: 28,
    reloadMs: 1600,
    nouns: ["Framer", "Roofer", "Brad Driver", "Finish Nailer", "Clatterbox"],
    stats: { damage: 6, range: 42, spread: 3.2, fireIntervalMs: 92, critChance: 0.09, critMult: 1.7 },
  },
  {
    family: "shotgun",
    body: "Leaf Blower",
    bodyText: "A wide blast of gravel and loose change. Up close, devastating.",
    ammo: "shotgun",
    auto: false,
    ammoPerShot: 1,
    magSize: 6,
    reloadMs: 2200,
    nouns: ["Gust", "Yard Storm", "Mulcher", "Big Blow", "Autumn Breeze"],
    stats: { damage: 5, range: 24, spread: 6.8, fireIntervalMs: 760, critChance: 0.06, critMult: 1.6, pellets: 9 },
  },
  {
    family: "rifle",
    body: "Garden Hose",
    bodyText: "A pressurised stream: hold the trigger and walk it onto them.",
    ammo: "rifle",
    auto: true,
    ammoPerShot: 1,
    magSize: 32,
    reloadMs: 1900,
    nouns: ["Soaker", "Drencher", "Jet Stream", "Sprayer", "Nozzle"],
    stats: { damage: 10, range: 72, spread: 2, fireIntervalMs: 128, critChance: 0.1, critMult: 1.8 },
  },
  {
    family: "sniper",
    body: "Microwave",
    bodyText: "A long, slow beep, then it cooks one thing very far away.",
    ammo: "sniper",
    auto: false,
    ammoPerShot: 1,
    magSize: 5,
    reloadMs: 2600,
    nouns: ["Reheater", "Popcorn Button", "Defroster", "Nuker", "Hot Pocket"],
    stats: { damage: 42, range: 130, spread: 0.25, fireIntervalMs: 900, critChance: 0.3, critMult: 2.5 },
  },
  {
    family: "launcher",
    body: "Toaster",
    bodyText: "Lobs burning toast that bursts on contact.",
    ammo: "rocket",
    auto: false,
    ammoPerShot: 1,
    magSize: 3,
    reloadMs: 3200,
    nouns: ["Pop-Up", "Bagel Setting", "Golden Brown", "Four-Slicer", "Crumb Tray"],
    stats: {
      damage: 60,
      range: 60,
      spread: 0.6,
      fireIntervalMs: 1200,
      critChance: 0.05,
      critMult: 1.5,
      projectile: { speed: 26 },
      explosion: { radius: 4.6 },
    },
  },
  {
    family: "vacuum",
    body: "Vacuum",
    bodyText: "Short range. Every hit drags the target toward you.",
    ammo: "shotgun",
    auto: true,
    ammoPerShot: 1,
    magSize: 30,
    reloadMs: 1800,
    nouns: ["Upright", "Canister", "Dust Devil", "Suck-o-Matic", "Bagless"],
    stats: { damage: 4, range: 18, spread: 4.5, fireIntervalMs: 120, critChance: 0.05, critMult: 1.5, pellets: 3 },
    special: "pull",
  },
  {
    family: "extinguisher",
    body: "Fire Extinguisher",
    bodyText: "A freezing foam cone. Whatever it soaks slows down.",
    ammo: "rifle",
    auto: true,
    ammoPerShot: 1,
    magSize: 40,
    reloadMs: 2000,
    nouns: ["Foamer", "Smotherer", "Class B", "Chill Pill", "Snowcone"],
    stats: { damage: 3, range: 15, spread: 8, fireIntervalMs: 110, critChance: 0.03, critMult: 1.4, pellets: 5 },
    special: "slow",
  },
];

const BODY_BY_FAMILY = new Map(FAMILY_BASES.map((base) => [base.family, base]));

/** The body a family is built around. */
export function bodyOf(family: GunFamily): FamilyBase {
  return BODY_BY_FAMILY.get(family) ?? FAMILY_BASES[0]!;
}

/**
 * A Mod: the junk taped, clipped or jammed onto the body. It is the gun's second part and fills the
 * slot an old gun maker held (`GunDef.manufacturer`): multipliers on the body's numbers.
 */
export interface Manufacturer {
  id: string;
  /** One-line read of what the mod changes. */
  text: string;
  damage: number;
  interval: number;
  spread: number;
  mag: number;
  reload: number;
  /** Range multiplier (the extension cord). Default 1. */
  range?: number;
  forcedElement?: GunElement;
  neverElemental?: boolean;
  prefixes: readonly string[];
}

export const MANUFACTURERS: readonly Manufacturer[] = [
  { id: "Cinder Block", text: "+30% damage, slower and heavier. Never takes an element.", damage: 1.3, interval: 1.25, spread: 0.9, mag: 0.8, reload: 1.1, neverElemental: true, prefixes: ["Heavy", "Chunky", "Load-Bearing", "Brick-Stuffed"] },
  { id: "Duct Tape", text: "+Stability: a much tighter spread.", damage: 1, interval: 1, spread: 0.6, mag: 1, reload: 0.95, prefixes: ["Taped-Up", "Steady", "Wrapped", "Reinforced"] },
  { id: "Glitter", text: "Always loaded with glitter: blinds and dazzles what it hits.", damage: 0.95, interval: 1, spread: 0.85, mag: 1, reload: 1, forcedElement: "flux", prefixes: ["Party", "Craft-Night", "Disco", "Pageant"] },
  { id: "Rubber Bands", text: "Snap-back reloads in half the time.", damage: 0.9, interval: 0.95, spread: 1.05, mag: 0.9, reload: 0.45, prefixes: ["Snappy", "Springy", "Twangy", "Bargain"] },
  { id: "Firecrackers", text: "Every shot goes bang.", damage: 1.2, interval: 1.15, spread: 1.15, mag: 1, reload: 1.15, forcedElement: "explosive", prefixes: ["Fourth-of-July", "Bang-Bang", "Sizzling", "Illegal"] },
  { id: "Batteries", text: "+Fire rate and a bigger magazine; lighter hits.", damage: 0.85, interval: 0.6, spread: 1.1, mag: 1.3, reload: 1, prefixes: ["Double-A", "Overclocked", "Zippy", "Hyper"] },
  { id: "Extension Cord", text: "+40% range and a steadier aim.", damage: 0.95, interval: 0.9, spread: 0.75, mag: 1, reload: 0.9, range: 1.4, prefixes: ["Long-Reach", "Fifty-Foot", "Outdoor-Rated", "Far-Flung"] },
  { id: "Laundry Basket", text: "A huge hopper of ammo; sloppy aim, slow to refill.", damage: 1.05, interval: 1.05, spread: 1.3, mag: 1.7, reload: 1.25, prefixes: ["Overstuffed", "Bulk", "Family-Size", "Heaping"] },
];

const MOD_BY_ID = new Map(MANUFACTURERS.map((mod) => [mod.id, mod]));

/** The mod a gun carries, by its `manufacturer` id. */
export function modOf(id: string): Manufacturer | undefined {
  return MOD_BY_ID.get(id);
}

export interface GunRarity {
  id: Rarity;
  mult: number;
  weight: number;
  elementChance: number;
}

export const RARITY_TIERS: readonly GunRarity[] = [
  { id: "common", mult: 1, weight: 100, elementChance: 0 },
  { id: "uncommon", mult: 1.15, weight: 45, elementChance: 0.25 },
  { id: "rare", mult: 1.35, weight: 18, elementChance: 0.5 },
  { id: "epic", mult: 1.6, weight: 6, elementChance: 0.75 },
  { id: "legendary", mult: 2, weight: 1.4, elementChance: 0.9 },
];

/** Rarity reads as the junk's condition. The ids stay the save identity. */
export const CONDITION_LABELS: Record<Rarity, string> = {
  common: "Busted",
  uncommon: "Used",
  rare: "Like New",
  epic: "Mint",
  legendary: "Heirloom",
};

export function conditionOf(rarity: Rarity): string {
  return CONDITION_LABELS[rarity];
}

/**
 * Heirlooms: named one-of-a-kind junk, each with the mod it was built with. Their red-text perk is
 * `SIGNATURE_PERKS` keyed by name; their backstory is {@link HEIRLOOM_STORIES}.
 */
export const LEGENDARY_NAMES: Record<GunFamily, readonly (readonly [string, string])[]> = {
  pistol: [["Firecrackers", "Tax Season"], ["Batteries", "Infinite Memo"], ["Cinder Block", "Six-Pack"]],
  smg: [["Glitter", "Roofer's Revenge"], ["Laundry Basket", "Feature Creep"], ["Duct Tape", "Chatterbox"]],
  shotgun: [["Duct Tape", "Autumn's End"], ["Firecrackers", "Gale Force Gertie"], ["Laundry Basket", "The Big Huff"]],
  rifle: [["Batteries", "Old Faithful"], ["Cinder Block", "Water Torture"], ["Extension Cord", "Slip 'n' Slide"]],
  sniper: [["Batteries", "Leftover Night"], ["Glitter", "Popcorn Apocalypse"], ["Cinder Block", "The Defroster"]],
  launcher: [["Laundry Basket", "Ka-Toast"], ["Glitter", "Wish Upon a Crumb"], ["Firecrackers", "Burnt Offering"]],
  vacuum: [["Batteries", "Dust Bunny"], ["Duct Tape", "Lost Earring Finder"]],
  extinguisher: [["Duct Tape", "Snow Day"], ["Extension Cord", "Kitchen Hero"]],
};

/** Every heirloom's backstory line: who owned it, before the appliances turned. */
export const HEIRLOOM_STORIES: Readonly<Record<string, string>> = {
  "Tax Season": "Stapled forty years of receipts for an accountant who never once took a vacation.",
  "Infinite Memo": "Belonged to an office manager who ran out of staples exactly never.",
  "Six-Pack": "Fixed every fence on Elm Street. Counts in sixes, like the beer it was paid in.",
  "Roofer's Revenge": "Shingled the whole subdivision in one August. It still smells of tar.",
  "Feature Creep": "A prototype from the smart-home company. It was supposed to hang pictures.",
  Chatterbox: "Built a treehouse for three generations of kids. Has opinions about all of them.",
  "Autumn's End": "Cleared the Hendersons' maple every October for thirty-one years.",
  "Gale Force Gertie": "Gertrude Pell blew the HOA president's toupee into the pool with this. Twice.",
  "The Big Huff": "Once blew a raccoon clean across two zip codes. The raccoon was fine. Mostly.",
  "Old Faithful": "Watered the tomatoes that took the county fair in '09. And '10. And '11.",
  "Water Torture": "Kept kids off one lawn for twenty years. Its owner never once raised his voice.",
  "Slip 'n' Slide": "Every summer birthday on Maple Court ended with this hose and a tarp.",
  "Leftover Night": "Reheated the same lasagna every Thursday for a widower who never learned to cook.",
  "Popcorn Apocalypse": "Movie-night microwave of the Gomez family. It has seen every sequel.",
  "The Defroster": "Thawed a turkey in four minutes flat, Thanksgiving '19. Nobody talks about what happened next.",
  "Ka-Toast": "A wedding gift. Never returned, never thrown out, never once made toast.",
  "Wish Upon a Crumb": "A little girl wished on its pop every morning before school. She flies planes now.",
  "Burnt Offering": "Stuck on 'dark' since 1987. Smoke alarms on three streets know its name.",
  "Dust Bunny": "Sucked up a decade of dog hair from a golden retriever named Biscuit. Still misses him.",
  "Lost Earring Finder": "Found Mrs. Okafor's diamond earring in the shag carpet, 1994. She left it everything.",
  "Snow Day": "Saved the elementary school science fair. The volcano did not survive.",
  "Kitchen Hero": "Hung by Grandma's stove for fifty years. Used once. Used well.",
};

export function heirloomStory(name: string): string | undefined {
  return HEIRLOOM_STORIES[name];
}

export const ELEMENTS: readonly GunElement[] = ["incendiary", "shock", "corrosive", "flux"];

/** The element's word in a gun's name. The ids stay the damage model's statuses. */
export const ELEMENT_PREFIX: Record<GunElement, string> = {
  none: "",
  incendiary: "Spicy",
  shock: "Staticky",
  corrosive: "Bleachy",
  explosive: "Fizzy",
  flux: "Glittery",
};

/** The element as the card and HUD name it: what the junk is loaded with. */
export const ELEMENT_LABELS: Record<GunElement, string> = {
  none: "Plain",
  incendiary: "Hot Sauce",
  shock: "Static",
  corrosive: "Bleach",
  explosive: "Fizz",
  flux: "Glitter",
};

/** The two body surfaces of the element chart, as the player reads them on an appliance. */
export const SURFACE_LABELS: Record<Surface, string> = { flesh: "Plastic", armor: "Steel" };

export const LEVEL_DAMAGE_GROWTH = 1.13;
