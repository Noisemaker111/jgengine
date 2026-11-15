import type { Category } from "./loot";

/**
 * The Littles you can send out. Each one is a different run: what they notice, how much they carry,
 * how loud they are and what the house's hunters make of them. Two live in the burrow from the
 * start; the rest move in as the burrow grows.
 */
export type LittleId = "pip" | "bolt" | "wren" | "tuck" | "dot" | "fennel" | "moth";

export interface LittleDef {
  name: string;
  title: string;
  /** What they do differently, in one line for the nook. */
  ability: string;
  color: string;
  /** Loot weights by category on top of the room's own: what they find more of. */
  finds: Partial<Record<Category, number>>;
  /** Footstep and work noise, as a multiple. */
  noise: number;
  /** Walk speed multiple. */
  speed: number;
  /** Carry weight multiple. */
  carry: number;
  /** Whether both-arms finds slow them. */
  bulkyFree: boolean;
  /** Sees mousetraps from across a room and disarms them quickly and safely. */
  trapSense: boolean;
  /** Smells food: food spots glow and every room rolls one extra food find. */
  foodSense: boolean;
  /** Shiny curios sparkle and roll a rarity step higher. */
  shinySense: boolean;
  /** Knows what lies beyond each door before going through. */
  scout: boolean;
  /** Seconds of night added to the clock. */
  extraNight: number;
  /** How quickly hunters notice them, as a multiple of sight time. */
  stillness: number;
  /** How the nook says they move in. */
  unlock: string;
}

export const LITTLES: Record<LittleId, LittleDef> = {
  pip: {
    name: "Pip", title: "the Forager", ability: "Smells food through walls. Every room has an extra bite, and food weighs half for Pip.",
    color: "#e0a24a", finds: { food: 2.2 }, noise: 1, speed: 1, carry: 1, bulkyFree: false, trapSense: false, foodSense: true, shinySense: false, scout: false, extraNight: 0, stillness: 1,
    unlock: "Lives in the burrow.",
  },
  bolt: {
    name: "Bolt", title: "the Tinkerer", ability: "Spots mousetraps from across the room and disarms them in a second for a spring. Finds more parts.",
    color: "#6aa0c8", finds: { part: 2.2 }, noise: 1, speed: 1, carry: 1, bulkyFree: false, trapSense: true, foodSense: false, shinySense: false, scout: false, extraNight: 0, stillness: 1,
    unlock: "Lives in the burrow.",
  },
  wren: {
    name: "Wren", title: "the Scout", ability: "Half as loud, so the Cat hears less. Reads what waits behind every door before going through.",
    color: "#7cc48a", finds: {}, noise: 0.5, speed: 1.08, carry: 0.9, bulkyFree: false, trapSense: false, foodSense: false, shinySense: false, scout: true, extraNight: 0, stillness: 1.2,
    unlock: "Moves in once the burrow has a map room.",
  },
  tuck: {
    name: "Tuck", title: "the Brute", ability: "Carries cheese, coins and bricks two-handed without slowing, and half again the weight. Loud.",
    color: "#c45a4a", finds: {}, noise: 1.3, speed: 0.95, carry: 1.5, bulkyFree: true, trapSense: false, foodSense: false, shinySense: false, scout: false, extraNight: 0, stillness: 0.9,
    unlock: "Moves in after three two-handed finds are banked.",
  },
  dot: {
    name: "Dot", title: "the Collector", ability: "Shiny things sparkle for Dot. Curios turn up more often and a rarity step finer.",
    color: "#c45ab3", finds: { curio: 2.4 }, noise: 1, speed: 1, carry: 1, bulkyFree: false, trapSense: false, foodSense: false, shinySense: true, scout: false, extraNight: 0, stillness: 1,
    unlock: "Moves in once a full set is banked.",
  },
  fennel: {
    name: "Old Fennel", title: "the Night Owl", ability: "Keeps hours nobody else can: the night lasts much longer, and hunters take longer to notice someone so still. Walks slowly.",
    color: "#9a86d6", finds: { cap: 1.6 }, noise: 0.8, speed: 0.86, carry: 1, bulkyFree: false, trapSense: false, foodSense: false, shinySense: false, scout: false, extraNight: 120, stillness: 1.6,
    unlock: "Moves in after an extraction six rooms deep.",
  },
  moth: {
    name: "Moth", title: "the Shadow", ability: "Barely there. Every hunter sees her at half the distance, torches and kids included, and she finds the odd curio. Carries little.",
    color: "#b8b0a0", finds: { curio: 1.4 }, noise: 0.8, speed: 1.04, carry: 0.8, bulkyFree: false, trapSense: false, foodSense: false, shinySense: false, scout: false, extraNight: 0, stillness: 2,
    unlock: "Moves in after a find from the basement is banked.",
  },
};
export const LITTLE_IDS = Object.keys(LITTLES) as LittleId[];
export function isLittle(value: unknown): value is LittleId { return typeof value === "string" && Object.hasOwn(LITTLES, value); }
export const STARTING_LITTLES: readonly LittleId[] = ["pip", "bolt"];
