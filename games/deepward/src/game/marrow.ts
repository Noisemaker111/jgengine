import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldConditions, WorldModel, WorldModelState } from "@jgengine/core/worldModel/worldModel";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RecipeDef } from "@jgengine/core/crafting/recipe";
import { BAYS } from "../world";

/**
 * Marrow as a living base, declared once and run by the engine's world model: modules built in the
 * workshop bays draw or make power, the growbed and the still fill the galley while you are down in
 * Bellwether, and the radio mast is how the story reaches you. The salvage a module costs is paid
 * from the stash by the fabricator; the world model owns everything after that.
 */
export type Module = "generator" | "scrubber" | "still" | "growbed" | "mast";
export interface ModuleDef { name: string; effect: string; recipe: RecipeDef; power: number }
const cost = (id: Module, inputs: RecipeDef["inputs"]): RecipeDef => ({ id: `module-${id}`, inputs, outputs: [], category: "bay" });
export const MODULES: Record<Module, ModuleDef> = {
  generator: { name: "Cell generator", effect: "+3 power", power: 3, recipe: cost("generator", [{ itemId: "cells", count: 2 }]) },
  scrubber: { name: "Air scrubber", effect: "+25 s of air every departure while powered", power: -1, recipe: cost("scrubber", [{ itemId: "polymer", count: 1 }, { itemId: "wire", count: 1 }]) },
  still: { name: "Water still", effect: "One water an 80 s while powered", power: -1, recipe: cost("still", [{ itemId: "wire", count: 1 }, { itemId: "polymer", count: 1 }]) },
  growbed: { name: "Growbed", effect: "One ration a 110 s while powered", power: -1, recipe: cost("growbed", [{ itemId: "polymer", count: 1 }, { itemId: "cells", count: 1 }]) },
  mast: { name: "Radio mast", effect: "Listens below Bellwether while powered", power: -1, recipe: cost("mast", [{ itemId: "wire", count: 2 }, { itemId: "cells", count: 1 }]) },
};
export const MODULE_ORDER: readonly Module[] = ["generator", "still", "growbed", "scrubber", "mast"];
const POWERED: WorldConditions = { "marrow.power": { atLeast: 0 } };
/** The galley holds this much of each; past it the growbed and still idle. */
export const GALLEY_MAX = 12;

/** What the rest of the game tells the world each read: whether a blueprint is known, where the diver is. */
export interface MarrowLive { growbedKnown: boolean; home: boolean }

export const marrowSpec = defineGameSpec({
  id: "marrow",
  world: {
    places: {
      marrow: { label: "Marrow", facts: { food: { value: 3, min: 0, max: GALLEY_MAX }, water: { value: 3, min: 0, max: GALLEY_MAX } } },
      bellwether: { label: "Bellwether" },
    },
    people: {
      halloway: {
        name: "Halloway", at: "marrow", known: true,
        says: [
          { text: "The printer has you again. Food and water first; the galley is thin. Bring home what the shelves still hold." },
          { text: "A generator in a bay and Marrow can run a still and a growbed while you're down there.", when: { "marrow.power": { atMost: 0 }, "marrow.generators": { atMost: 0 } } },
          { text: "The modules are pulling more than the generator makes. Nothing runs until the power is back over zero.", when: { "marrow.power": { atMost: -1 } } },
          { text: "With power to spare, raise a radio mast. Something below Bellwether has been broadcasting since the shift went quiet.", when: { "marrow.generators": { atLeast: 1 }, "marrow.masts": { atMost: 0 } } },
          { text: "The mast has it: a cage code for the lift under the cold stores, and a voice calling itself Printer Zero.", when: { "story.signal": true, "story.relay": false } },
          { text: "The relay's tones are the code for the last lift. The Choir is pressure four; you need the Mk III seal.", when: { "story.relay": true, "story.zero": false } },
          { text: "You have the pattern. Get it home. Nothing else matters now.", when: { "story.zero": true, "story.home": false } },
          { text: "Pattern 406 is whole again. The next Life Marrow prints will remember this one.", when: { "story.home": true } },
        ],
      },
    },
    facts: {
      "story.signal": false, "story.relay": false, "story.zero": false, "story.home": false,
    },
    kinds: Object.fromEntries((Object.keys(MODULES) as Module[]).map(id => [id, {
      label: MODULES[id].name, tags: ["module"], slot: "bay", takes: id === "generator" ? 6 : 10,
      facts: { power: MODULES[id].power },
      ...(id === "growbed" ? { when: { "live.growbedKnown": true }, refuse: "Scan a seed tray in the cold stores to learn the growbed" } : {}),
      ...(id === "mast" ? { limit: 1 } : {}),
    }])),
    slots: { bay: Object.fromEntries(BAYS.map((bay, index) => [bay.id, { marker: bay.id, label: `Bay ${index + 1}` }])) },
    queues: { build: { lanes: 2 } },
    totals: {
      "marrow.power": { of: "module", sum: "power" },
      "marrow.generators": { of: "generator" },
      "marrow.stills": { of: "still" },
      "marrow.growbeds": { of: "growbed" },
      "marrow.scrubbers": { of: "scrubber" },
      "marrow.masts": { of: "mast" },
    },
    flows: {
      water: { to: "marrow.water", rate: 1 / 80, from: "marrow.stills", when: POWERED },
      food: { to: "marrow.food", rate: 1 / 110, from: "marrow.growbeds", when: POWERED },
    },
    triggers: {
      signal: { when: { "marrow.masts": { atLeast: 1 }, ...POWERED }, then: { "story.signal": true }, once: true, note: "The mast caught a broadcast from below the ink wells: Printer Zero." },
      relay: { when: { "story.relay": true }, once: true, note: "The relay's tones decoded: the cage code for the lift into the Choir." },
      zero: { when: { "story.zero": true }, once: true, note: "Pattern 406 recovered from Printer Zero." },
      home: { when: { "story.home": true }, once: true, note: "The pattern is home. Marrow's printer reads it." },
    },
  },
  markers: () => Object.fromEntries(BAYS.map(bay => [bay.id, { x: bay.at[0], y: bay.at[1], z: bay.at[2] }])),
  live: (ctx: GameContext) => {
    const live = liveOf(ctx);
    return { "live.growbedKnown": live.growbedKnown, "live.home": live.home };
  },
});

const lives = new WeakMap<GameContext, MarrowLive>();
export function setMarrowLive(ctx: GameContext, live: MarrowLive): void { lives.set(ctx, live); }
function liveOf(ctx: GameContext): MarrowLive { return lives.get(ctx) ?? { growbedKnown: false, home: true }; }

export function marrowOf(ctx: GameContext): WorldModel { return marrowSpec.of(ctx); }
export function marrowState(ctx: GameContext): WorldModelState | undefined { return marrowSpec.store.read(ctx); }
/** Put a saved base back (or a fresh one for a new record); the world model reads its store on every call. */
export function restoreMarrow(ctx: GameContext, saved: WorldModelState | null): void { marrowSpec.store.write(ctx, saved ?? undefined); }
export function powered(world: WorldModel): boolean { return world.num("marrow.power") >= 0; }
