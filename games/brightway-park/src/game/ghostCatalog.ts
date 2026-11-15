import { BUILDABLES, type RideGroup, type ScareData } from "./objects/catalog";

/**
 * The ghosts who might make the park their home, as data. Each one has a rumor it must hear before
 * it comes looking, a short list of wants the park has to hold all at once, the ectoplasm it seeps
 * every night it stays, and the séance it whispers for free the night it moves in. Pure: the
 * runtime that moves them in and out is `ghosts.ts`.
 */

/** What a ghost's wants are counted against: the park's structures and its crowd. */
export interface Census {
  /** Structures of one kind standing in the park. */
  count(kind: string): number;
  /** Rides of one family. */
  family(group: RideGroup): number;
  /** Scare props with a trait (fog, a toy, something breakable). */
  tagged(trait: keyof Pick<ScareData, "fog" | "toy" | "breakable">): number;
  /** The living in the park right now. */
  living: number;
}

export interface GhostWant {
  id: string;
  label: string;
  need: number;
  have: (census: Census) => number;
}

export interface GhostDef {
  id: string;
  label: string;
  icon: string;
  blurb: string;
  /** The rumor the park must reach before this ghost comes looking. */
  rumor: number;
  /** Ectoplasm it seeps into the vault each night it stays. */
  yield: number;
  /** The buildable whose séance it completes the night it moves in. */
  unlocks: string;
  /** The body the scene draws for it. */
  body: string;
  wants: readonly GhostWant[];
}

const kinds = (...ids: string[]) => (census: Census) => ids.reduce((sum, id) => sum + census.count(id), 0);

export const GHOSTS: readonly GhostDef[] = [
  {
    id: "child", label: "Victorian Child", icon: "🧸", body: "ghost_child", rumor: 0, yield: 60, unlocks: "ride_teacups",
    blurb: "She lost her hoop on the carousel in 1889 and has been looking for something to play with ever since.",
    wants: [
      { id: "carousel", label: "An Upside-Down Carousel", need: 1, have: kinds("ride_carousel") },
      { id: "toy", label: "A toy: a Jack-in-the-Coffin or a Black Balloon Cart", need: 1, have: (c) => c.tagged("toy") + c.count("stall_balloon") },
    ],
  },
  {
    id: "sailor", label: "Drowned Sailor", icon: "⚓", body: "ghost_sailor", rumor: 60, yield: 90, unlocks: "ride_logflume",
    blurb: "Went down with the Mary Ellen off the end of the pier. Misses the fog, and the sound of water under boards.",
    wants: [
      { id: "fog", label: "Sea fog: a Fog Cauldron", need: 1, have: (c) => c.tagged("fog") },
      { id: "pier", label: "The pier: any Pier & Tide ride", need: 1, have: (c) => c.family("tide") },
    ],
  },
  {
    id: "poltergeist", label: "Poltergeist", icon: "🍽️", body: "ghost_poltergeist", rumor: 120, yield: 80, unlocks: "ride_bumper",
    blurb: "Nobody remembers who it was. Everybody remembers the plates.",
    wants: [
      { id: "breakables", label: "Things to smash: Crockery Shelves, Possessed Vases or a Hall of Wrong Mirrors", need: 3, have: (c) => c.tagged("breakable") + c.count("ride_maze") },
    ],
  },
  {
    id: "banshee", label: "Banshee", icon: "🗣️", body: "ghost_banshee", rumor: 220, yield: 140, unlocks: "ride_swings",
    blurb: "Her wail is wasted on an empty park. She needs a crowd, and somewhere high to wail from.",
    wants: [
      { id: "audience", label: "An audience: 30 of the living in the park at once", need: 30, have: (c) => c.living },
      { id: "perch", label: "A high perch: the Bell Tower Slide or the Lighthouse of the Lost", need: 1, have: kinds("ride_helter", "ride_obs") },
    ],
  },
  {
    id: "bride", label: "Pale Bride", icon: "💐", body: "ghost_bride", rumor: 340, yield: 160, unlocks: "deco_statue",
    blurb: "Waited at the top of the wheel for a groom who never came. She counts the gravestones to pass the time.",
    wants: [
      { id: "wheel", label: "The Wheel That Doesn't Stop", need: 1, have: kinds("ride_ferris") },
      { id: "graves", label: "Gravestones to count: 4", need: 4, have: kinds("deco_gravestone") },
    ],
  },
  {
    id: "keeper", label: "Lighthouse Keeper", icon: "🏮", body: "ghost_keeper", rumor: 460, yield: 200, unlocks: "ride_monorail",
    blurb: "Kept the light for forty years and then one night he didn't. He tends every lantern he can find.",
    wants: [
      { id: "lighthouse", label: "His lighthouse: the Lighthouse of the Lost", need: 1, have: kinds("ride_obs") },
      { id: "lanterns", label: "Lanterns to tend: 4 Gas Lanterns", need: 4, have: kinds("deco_lamp") },
    ],
  },
];

for (const ghost of GHOSTS) {
  if (BUILDABLES[ghost.unlocks]?.research === undefined) throw new Error(`hauntworks: ghost "${ghost.id}" unlocks "${ghost.unlocks}", which has no séance`);
}

/** The world fact that says whether a ghost haunts the park (1) or not (0). */
export const ghostFact = (id: string): string => `ghost.${id}`;

export function ghostDef(id: string): GhostDef | undefined {
  return GHOSTS.find((ghost) => ghost.id === id);
}

/** Each want's progress and whether every one holds. */
export function ghostWantsMet(ghost: GhostDef, census: Census): { wants: { id: string; label: string; have: number; need: number; met: boolean }[]; met: boolean } {
  const wants = ghost.wants.map((want) => {
    const have = want.have(census);
    return { id: want.id, label: want.label, have, need: want.need, met: have >= want.need };
  });
  return { wants, met: wants.every((want) => want.met) };
}

/** Every ghost body the scene draws, by entity id. */
export const GHOST_BODIES: readonly string[] = GHOSTS.map((ghost) => ghost.body);
