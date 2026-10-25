import type { CodexSnapshot } from "@jgengine/core/game/codex";
import type { DecayMeterSetState } from "@jgengine/core/survival/decayMeter";
import type { WorldModel, WorldModelState } from "@jgengine/core/worldModel/worldModel";
import { GEAR, type Gear } from "./fabricator";
import { freshBody, validBody } from "./survival";
import { isStratum, type Stratum } from "./strata";

/**
 * Everything Deepward remembers about going deeper, as its own save section beside the Marrow
 * record: the body, the gear printed at the fabricator, what the scanner has learned, which strata
 * are charted, and Marrow's base and story world. A record written before the strata simply has no
 * section yet and starts here.
 */
export interface Deep {
  version: 1;
  body: DecayMeterSetState;
  gear: Gear[];
  /** Lures printed and waiting in Marrow; the next departure carries up to three. */
  lures: number;
  codex: CodexSnapshot;
  /** Wrecks, logs and species already scanned on this record, so one wreck teaches one fragment once. */
  scanned: string[];
  /** Strata the diver has stood in; the crawler departs to the deepest. */
  charted: Stratum[];
  marrow: WorldModelState | null;
}

export function newDeep(): Deep {
  return { version: 1, body: freshBody(), gear: [], lures: 0, codex: { discovered: {}, progress: {} }, scanned: [], charted: ["vault"], marrow: null };
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(entry => typeof entry === "string");

/** A section that does not hold together starts a fresh descent rather than half-loading one. */
export function readDeep(value: unknown): Deep {
  if (!record(value) || value.version !== 1) return newDeep();
  const gear = value.gear, codex = value.codex, charted = value.charted;
  if (!validBody(value.body) || !strings(gear) || !gear.every(id => Object.hasOwn(GEAR, id)) || !strings(value.scanned)) return newDeep();
  if (!Array.isArray(charted) || !charted.every(isStratum) || !record(codex) || !record(codex.discovered)) return newDeep();
  const lures = typeof value.lures === "number" && Number.isInteger(value.lures) && value.lures >= 0 ? value.lures : 0;
  const marrow = record(value.marrow) && record(value.marrow.facts) ? value.marrow as unknown as WorldModelState : null;
  return { version: 1, body: value.body, gear: gear as Gear[], lures, codex: codex as unknown as CodexSnapshot, scanned: value.scanned, charted, marrow };
}

export function has(deep: Pick<Deep, "gear">, gear: Gear): boolean { return deep.gear.includes(gear); }
export function sealMark(deep: Pick<Deep, "gear">): 1 | 2 | 3 { return has(deep, "seal3") ? 3 : has(deep, "seal2") ? 2 : 1; }
/** Air the gear and the base add to every departure. */
export function airBonus(deep: Pick<Deep, "gear">, world: WorldModel | null): number {
  const scrubbers = world === null || world.num("marrow.power") < 0 ? 0 : world.num("marrow.scrubbers");
  return (has(deep, "o2") ? 40 : 0) + Math.min(2, scrubbers) * 25;
}
export function deepestCharted(deep: Pick<Deep, "charted">): Stratum {
  const order: Stratum[] = ["vault", "cold", "wells", "choir"];
  return order.filter(stratum => deep.charted.includes(stratum)).at(-1) ?? "vault";
}

/** The story's next step, read off the record and Marrow's world: what the docket says to do. */
export interface Goal { id: string; text: string; done: boolean }
export function goals(deep: Deep, world: WorldModel | null): Goal[] {
  const fact = (key: string) => world?.fact(key) === true;
  const num = (key: string) => world?.num(key) ?? 0;
  return [
    { id: "galley", text: "Bring food and water home from the receiving shelves", done: num("marrow.food") + num("marrow.water") >= 8 || num("marrow.stills") + num("marrow.growbeds") > 0 },
    { id: "generator", text: "Build a cell generator in a Marrow bay (2 power cells)", done: num("marrow.generators") >= 1 },
    { id: "cutter", text: "Scan two rail cart wrecks and print the plasma cutter", done: has(deep, "cutter") },
    { id: "mast", text: "Raise a radio mast in a powered bay", done: fact("story.signal") },
    { id: "seal2", text: "Scan three frozen suits in the cold stores; print Seal Mk II", done: has(deep, "seal2") },
    { id: "relay", text: "Find the relay in the Ink Wells for the last lift's cage code", done: fact("story.relay") },
    { id: "seal3", text: "Print Seal Mk III: the Choir is pressure four", done: has(deep, "seal3") },
    { id: "zero", text: "Reach Printer Zero at the bottom of the Choir; take the pattern", done: fact("story.zero") },
    { id: "home", text: "Bring the pattern home", done: fact("story.home") },
  ];
}
export function nextGoal(deep: Deep, world: WorldModel | null): Goal | null { return goals(deep, world).find(goal => !goal.done) ?? null; }

/** Why a lift refuses, or null: the cage codes come from the story. */
export function liftLock(to: Stratum, world: WorldModel | null): string | null {
  if (to === "wells" && world?.fact("story.signal") !== true) return "The lift below the cold stores wants a cage code. Marrow's radio has not heard one; raise a mast.";
  if (to === "choir" && world?.fact("story.relay") !== true) return "The last lift is coded. A relay somewhere in the Ink Wells is broadcasting it.";
  return null;
}
