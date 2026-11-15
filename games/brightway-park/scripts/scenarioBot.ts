/**
 * A mid-skill haunter plays a scenario headless from the empty lot to its result, the way a player
 * who has read the hints and the ghost register would: a boardwalk spine from the gate, rides off it,
 * a gauntlet of scares along it, the stalls the living need, a gremlin and a ghoul, the séance table
 * kept busy toward what the next ghost wants, and the Ferryman when the vault runs dry. It prints the
 * scenario's targets moon by moon and the result.
 *
 *   bun scripts/scenarioBot.ts <scenario id> [--quiet]
 *   bun scripts/scenarioBot.ts all
 */
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { game } from "../src/game.config";
import { BUILDABLES } from "../src/game/objects/catalog";
import { cellFor, park, researched } from "../src/game/park";
import { connectPark } from "../src/game/build/links";
import { recordScenarioWin, SCENARIOS, scenarioDef, scenarioSeconds } from "../src/game/scenarios";
import { session } from "../src/game/session";
import { GHOSTS, ghostFact } from "../src/game/ghostCatalog";
import { MONTH_DAYS } from "../src/game/books";
import { DAY_LENGTH } from "../src/game/catalog";

const records = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => records.get(key) ?? null,
  setItem: (key: string, value: string) => records.set(key, value),
  removeItem: (key: string) => records.delete(key),
} });

/** What the haunter wants next, in order: each entry is built when it can be, once (or up to `count`). */
type Want = { kind: string; count: number; side?: "near-carousel" };
const PLAN: readonly Want[] = [
  { kind: "ride_carousel", count: 1 },
  { kind: "prop_coffin", count: 1, side: "near-carousel" },
  { kind: "stall_food", count: 1 },
  { kind: "prop_portrait", count: 2 },
  { kind: "ride_haunted", count: 1 },
  { kind: "prop_coldspot", count: 2 },
  { kind: "stall_drink", count: 1 },
  { kind: "fac_toilet", count: 1 },
  { kind: "ride_boats", count: 1 },
  { kind: "prop_fogger", count: 1 },
  { kind: "prop_shelf", count: 3 },
  { kind: "ride_helter", count: 1 },
  { kind: "ride_teacups", count: 1 },
  { kind: "deco_lamp", count: 4 },
  { kind: "prop_flicker", count: 2 },
  { kind: "ride_bumper", count: 1 },
  { kind: "deco_gravestone", count: 4 },
  { kind: "fac_info", count: 1 },
  { kind: "ride_ferris", count: 1 },
  { kind: "ride_obs", count: 1 },
  { kind: "prop_vase", count: 2 },
  { kind: "ride_swings", count: 1 },
  { kind: "ride_logflume", count: 1 },
  { kind: "stall_icecream", count: 1 },
  { kind: "prop_candles", count: 2 },
  { kind: "ride_pirate", count: 1 },
  { kind: "ride_maze", count: 1 },
  { kind: "ride_vintage", count: 1 },
  { kind: "ride_junior", count: 1 },
  { kind: "ride_monorail", count: 1 },
  { kind: "ride_gokarts", count: 1 },
  { kind: "ride_rapids", count: 1 },
  { kind: "ride_mouse", count: 1 },
  { kind: "ride_looping", count: 1 },
];
/** Séances in the order the plan needs them. */
const SEANCES = ["stall_icecream", "ride_teacups", "prop_flicker", "ride_bumper", "ride_maze", "ride_vintage", "ride_ferris", "ride_obs", "prop_vase", "ride_swings",
  "ride_logflume", "prop_candles", "ride_pirate", "ride_junior", "ride_train", "ride_chairlift", "ride_monorail", "ride_gokarts", "ride_rapids", "ride_mouse", "ride_looping"];

function play(id: string, quiet: boolean): { won: boolean; line: string } {
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  runner.ctx.sim.retune({ hz: "variable" });
  const run = (name: string, input: Record<string, unknown> = {}) => runner.ctx.game.commands.run(name, input);
  run("park.scenario", { id });
  run("park.start");
  const w = park.of(runner.ctx);
  const def = scenarioDef(id)!;
  // The boardwalk spine north from the gate plaza, with cross-walks every 16 m.
  run("build.line", { kind: "path_walk", from: [0, 48], to: [0, -44] });
  for (const z of [32, 8, -16, -40]) run("build.line", { kind: "path_walk", from: [-44, z], to: [44, z] });
  const spine: [number, number][] = [];
  for (let z = 44; z >= -44; z -= 4) spine.push([0, z]);
  for (const z of [32, 8, -16, -40]) for (let x = -44; x <= 44; x += 4) if (x !== 0) spine.push([x, z]);

  /** Put one structure of a kind beside the boardwalk, joined to it; false when it would not go. */
  const place = (kind: string, near?: readonly [number, number]): boolean => {
    const def = BUILDABLES[kind]!;
    if (w.num("park.cash") < def.cost + 300 || w.canPlace(kind)?.reason === "locked") return false;
    const reach = def.footprint / 2 + 2;
    const order = near === undefined ? spine : [...spine].sort((a, b) => Math.hypot(a[0] - near[0], a[1] - near[1]) - Math.hypot(b[0] - near[0], b[1] - near[1]));
    for (const [px, pz] of order) {
      for (const [dx, dz] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]] as const) {
        const cell = cellFor(kind, px + dx, pz + dz);
        if (w.canPlace(kind, { cell }) !== null) continue;
        const before = new Set(w.instances().map((i) => i.id));
        if (run("brightway.place", { kind, cell }).status !== "applied") continue;
        const placed = w.instances().find((i) => !before.has(i.id))!.id;
        if (def.ride !== undefined || def.stall !== undefined) {
          connectPark(runner.ctx, { only: placed });
          if (w.fact(`${placed}.closed`) === true) { run("brightway.remove", { id: placed }); continue; }
        }
        return true;
      }
    }
    return false;
  };
  const carousel = (): [number, number] | undefined => { const c = w.instances("ride_carousel")[0]?.position; return c === null || c === undefined ? undefined : [c[0], c[1]]; };

  const seconds = scenarioSeconds(def.months);
  let line = "";
  for (let t = 0; t < seconds + 5 && w.fact("scenario.result") === ""; t += 1) {
    if (w.fact("park.gate") !== true && w.canAct("open_gate") === null) run("brightway.act", { action: "open_gate" });
    if (t % 15 === 0) {
      // Spooks first when they are due, then the next thing on the plan.
      if (w.num("park.rides") > 0 && w.num("n.staff_mechanic") < 1 + Math.floor(w.num("park.rides") / 6)) place("staff_mechanic");
      else if (w.num("park.litter") > 15 && w.num("n.staff_janitor") < 1 + Math.floor(session.guests.size / 70)) place("staff_janitor");
      else if (w.num("park.evidence") > 40 && w.num("n.staff_security") < 2) place("staff_security");
      else {
        const next = PLAN.find((want) => w.num(`n.${want.kind}`) < want.count && w.canPlace(want.kind)?.reason !== "locked");
        if (next !== undefined) place(next.kind, next.side === "near-carousel" ? carousel() : undefined);
      }
      if (w.orders("lab").length === 0 && w.num("park.cash") > 2500) {
        const topic = SEANCES.find((k) => w.fact(researched(k)) !== true && w.canAct(`research_${k}`) === null);
        if (topic !== undefined) run("brightway.act", { action: `research_${topic}` });
      }
      // The Ferryman when the vault runs low; paid back when it is fat.
      if (w.num("park.cash") < 400 && w.canAct("take_loan") === null) run("brightway.act", { action: "take_loan" });
      if (w.num("park.cash") > 9000 && w.canAct("repay_loan") === null) run("brightway.act", { action: "repay_loan" });
      // A rumor on the full moon when there is ectoplasm to spare.
      if (w.num("park.cash") > 4000 && w.canAct("ad_posters") === null) run("brightway.act", { action: "ad_posters" });
    }
    runner.step(1);
    if ((t + 1) % (MONTH_DAYS * DAY_LENGTH) === 0) {
      const moon = (t + 1) / (MONTH_DAYS * DAY_LENGTH);
      line = `${id} moon ${moon}: screams ${w.num("park.screams")} rumor ${Math.round(w.num("park.rating"))} ghosts ${w.num("park.ghosts")} ecto ${Math.round(w.num("park.cash"))} owed ${w.num("park.loan_owed")} rides ${w.num("park.rides")} props ${w.num("park.props")} living ${session.guests.size} evidence ${Math.round(w.num("park.evidence"))} exorcisms ${w.num("park.exorcisms")}`;
      if (!quiet) console.log(line);
    }
  }
  const result = String(w.fact("scenario.result") || "running");
  const at = Math.round(runner.ctx.time.now() / (MONTH_DAYS * DAY_LENGTH) * 10) / 10;
  const ghosts = GHOSTS.filter((g) => w.num(ghostFact(g.id)) >= 1).map((g) => g.id).join(",");
  const summary = `${id}: ${result} at moon ${at} of ${def.months} · screams ${w.num("park.screams")} · rumor ${Math.round(w.num("park.rating"))} (peak ${Math.round(w.num("park.peak"))}) · ghosts ${ghosts || "none"} · ecto ${Math.round(w.num("park.cash"))} · ${w.fact("scenario.reason") || ""}`;
  return { won: result === "won", line: summary };
}

const arg = process.argv[2] ?? "first_chill";
const quiet = process.argv.includes("--quiet");
const ids = arg === "all" ? SCENARIOS.map((s) => s.id) : [arg];
// A scenario played on its own opens as if the ones before it were won.
if (arg !== "all") for (const s of SCENARIOS) { if (s.id === arg) break; recordScenarioWin(s.id); }
for (const id of ids) {
  const { won, line } = play(id, quiet);
  console.log(line);
  // Winning one opens the next, as it does in the browser.
  if (won) recordScenarioWin(id);
}
