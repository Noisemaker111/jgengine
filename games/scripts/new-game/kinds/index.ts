/**
 * Which kind of game an idea is. Every kind is a real genre with its own loop; the idea's words pick
 * one, and an idea that names no genre goes to the closest one by what it talks about (a castle is
 * built, a dragon is explored, a gun is shot). There is no fallback starter.
 */
import type { KindName } from "../template/common/src/game/ideaShape";
import { score } from "./shared";
import type { KindModule } from "./types";

/** Genre words: naming the genre. Phrases count double. */
const GENRE: Record<KindName, readonly string[]> = {
  survival: ["survival", "survive", "zombie", "zombies", "undead", "horde", "outbreak", "apocalypse", "fortify", "tame", "taming", "scavenge", "base defense", "wave survival"],
  racer: ["race", "racer", "racing", "drift", "drifting", "kart", "rally", "street race", "time trial", "circuit", "grand prix", "driving game"],
  builder: ["builder", "city builder", "castle builder", "tycoon", "management", "settlement", "construct", "construction", "economy", "sim", "simulation", "manage", "build a city", "build a castle", "base builder"],
  defense: ["tower defense", "tower defence", "td", "towers", "turrets", "lanes", "defend the", "defense", "defence", "waves of enemies", "creeps"],
  farm: ["farm", "farming", "cozy", "cosy", "harvest", "crops", "fishing", "fish", "garden", "gardening", "village life", "life sim", "ranch", "homestead", "stardew"],
  shooter: ["shooter", "third person shooter", "third-person", "tps", "shooting", "shoot", "gun", "guns", "gunfight", "firefight", "cover shooter", "sniper", "rifle", "blaster", "mercenary"],
  colony: ["colony", "colonist", "colonists", "rts", "real time strategy", "strategy", "settlers", "workers", "command", "army", "units", "rimworld", "outpost management"],
  explorer: ["explore", "exploration", "explorer", "adventure", "open world", "journey", "quest", "relics", "ruins", "discover", "treasure", "expedition", "zelda", "climb", "glide"],
};

/** What an idea talks about, for an idea that names no genre: the closest genre for those things. */
const LEANS: Record<KindName, readonly string[]> = {
  survival: ["night", "nights", "dinosaur", "dinosaurs", "dino", "raptor", "wilderness", "stranded", "island", "camp", "infected"],
  racer: ["car", "cars", "drive", "driving", "speed", "highway", "street", "streets", "neon", "motorbike", "bike"],
  builder: ["castle", "kingdom", "city", "town", "empire", "medieval", "village", "build", "building", "walls", "economy", "trade"],
  defense: ["defend", "tower", "invaders", "invasion", "siege", "orbital", "barrier", "shield", "gate", "lane"],
  farm: ["cozy", "village", "fishing", "farm", "seeds", "cottage", "bakery", "orchard", "animals", "chickens", "cows", "seasons"],
  shooter: ["soldier", "mech", "robot", "robots", "alien", "aliens", "heist", "cop", "agent", "bullet", "war", "battle"],
  colony: ["colony", "settlers", "mars", "planet", "base", "crew", "tribe", "outpost", "workers", "rts"],
  explorer: ["dragon", "temple", "cave", "caves", "forest", "mountain", "mountains", "ocean", "sky", "lost", "ancient", "magic", "wander", "map"],
};

const MODULES: Record<KindName, () => Promise<{ kind: KindModule<never> }>> = {
  survival: () => import("./survival"),
  racer: () => import("./racer"),
  builder: () => import("./builder"),
  defense: () => import("./defense"),
  farm: () => import("./farm"),
  shooter: () => import("./shooter"),
  colony: () => import("./colony"),
  explorer: () => import("./explorer"),
};

export const KIND_NAMES = Object.keys(GENRE) as KindName[];

export interface KindChoice {
  kind: KindName;
  /** Why: "named the genre (tower defense)" or "closest genre for castle, kingdom". */
  why: string;
}

/** The kind an idea is. `forced` (from `--kind`) wins. */
export function chooseKind(said: readonly string[], forced?: string): KindChoice {
  if (forced !== undefined) {
    if (!KIND_NAMES.includes(forced as KindName)) throw new Error(`new-game: --kind must be one of ${KIND_NAMES.join(", ")}`);
    return { kind: forced as KindName, why: "chosen with --kind" };
  }
  const rank = (table: Record<KindName, readonly string[]>) =>
    KIND_NAMES.map((kind) => ({ kind, hits: score(said, table[kind]) })).sort((a, b) => b.hits - a.hits);
  const named = rank(GENRE);
  const leans = rank(LEANS);
  // A named genre wins outright; between equal genres, what the idea talks about breaks the tie.
  const top = named[0]!;
  if (top.hits > 0) {
    const tied = named.filter((entry) => entry.hits === top.hits).map((entry) => entry.kind);
    const pick = tied.length === 1 ? top.kind : (leans.find((entry) => tied.includes(entry.kind))?.kind ?? top.kind);
    const hit = GENRE[pick].filter((word) => (word.includes(" ") ? ` ${said.join(" ")} `.includes(` ${word} `) : said.includes(word)));
    return { kind: pick, why: `named the genre (${hit.join(", ")})` };
  }
  const lean = leans[0]!;
  if (lean.hits > 0) {
    const hit = LEANS[lean.kind].filter((word) => said.includes(word));
    return { kind: lean.kind, why: `closest genre for ${hit.join(", ")}` };
  }
  // Nothing in the idea points anywhere: walking a world and finding things is the widest genre.
  return { kind: "explorer", why: "closest genre: the idea names no genre or setting, so it starts as an open world to explore" };
}

export async function loadKind(kind: KindName): Promise<KindModule<never>> {
  return (await MODULES[kind]()).kind;
}
