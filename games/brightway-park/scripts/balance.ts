/**
 * The first 30 minutes of a new game at 1x, headless: a steady haunter who starts the first scenario,
 * unchains the gate once a ride runs, binds a gremlin, and every half minute builds the next ride,
 * stall or scare prop it can afford while keeping an ectoplasm reserve, and keeps the séance table
 * busy when the vault allows. Yields stay at their defaults; props go wherever there is room (no
 * gauntlet planning yet). Prints the vault, harvest and running costs minute by minute, and how the
 * scenario stands: screams, rumor and ghosts.
 *
 *   bun scripts/balance.ts [minutes=30]
 */
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { game } from "../src/game.config";
import { BUILDABLES, BUILD_IDS } from "../src/game/objects/catalog";
import { cellFor, LOT, park } from "../src/game/park";
import { session } from "../src/game/session";
import { connectPark } from "../src/game/build/links";
import { FIRST_SCENARIO } from "../src/game/scenarios";

const records = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => records.get(key) ?? null,
  setItem: (key: string, value: string) => records.set(key, value),
  removeItem: (key: string) => records.delete(key),
} });

const minutes = Number(process.argv[2] ?? 30);
const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
// A new game, as the menu starts one: the first scenario on the empty lot.
runner.ui.invoke("park.scenario", { id: FIRST_SCENARIO });
runner.ui.invoke("park.start");
const w = park.of(runner.ctx);
const buildable = BUILD_IDS.filter((id) => BUILDABLES[id]!.category === "ride" || BUILDABLES[id]!.category === "stall" || BUILDABLES[id]!.category === "prop");
let built = 0;
let spentOnBuilds = 0;
const RESERVE = Number(process.env.RESERVE ?? 1500);
const tryResearch = () => {
  if (w.orders("lab").length > 0 || w.num("park.cash") < 4000) return;
  for (const id of BUILD_IDS) {
    if (BUILDABLES[id]!.research === undefined) continue;
    if (w.canAct(`research_${id}`) === null && runner.ctx.game.commands.run("brightway.act", { action: `research_${id}` }).status === "applied") return;
  }
};
const tryBuild = () => {
  const cash = w.num("park.cash") - RESERVE;
  // A steady player hires a handyman once the paths start to look dirty.
  // A steady player hires a mechanic once a ride runs, and a handyman once the paths start to look dirty.
  const wanted = w.num("park.rides") > 0 && w.num("n.staff_mechanic") < 1 ? ["staff_mechanic"]
    : w.num("park.litter") > 15 && w.num("n.staff_janitor") < 1 + Math.floor(session.guests.size / 80) ? ["staff_janitor"] : [];
  for (const kind of wanted) for (let row = 4; row < LOT.rows - 4; row += 2) for (let col = 4; col < LOT.cols - 4; col += 2) {
    if (wanted.length === 0 || w.canPlace(kind, { cell: [col, row] }) !== null) continue;
    if (runner.ctx.game.commands.run("brightway.place", { kind, cell: [col, row] }).status === "applied") { built += 1; spentOnBuilds += BUILDABLES[kind]!.cost; wanted.length = 0; }
  }
  const order = [...buildable].sort((a, b) => (w.num(`n.${a}`) - w.num(`n.${b}`)) || BUILDABLES[a]!.cost - BUILDABLES[b]!.cost);
  for (const kind of order) {
    if (BUILDABLES[kind]!.cost > cash) continue;
    if (w.canPlace(kind)?.reason === "locked") continue;
    // A scare prop goes beside a path, where the living walk past it: a gauntlet, not a field.
    if (BUILDABLES[kind]!.scare !== undefined) {
      const beside = w.instances("path_walk").flatMap((path) => path.position === null ? [] : [[path.position[0] + 4, path.position[1]], [path.position[0] - 4, path.position[1]]] as const);
      const spot = beside.map(([x, z]) => cellFor(kind, x, z)).find((cell) => w.canPlace(kind, { cell }) === null);
      if (spot !== undefined && runner.ctx.game.commands.run("brightway.place", { kind, cell: spot }).status === "applied") { built += 1; spentOnBuilds += BUILDABLES[kind]!.cost; return; }
      continue;
    }
    for (let row = 2; row < LOT.rows - 2; row += 1) for (let col = 2; col < LOT.cols - 2; col += 1) {
      if (w.canPlace(kind, { cell: [col, row] }) !== null) continue;
      const before = new Set(w.instances().map((i) => i.id));
      if (runner.ctx.game.commands.run("brightway.place", { kind, cell: [col, row] }).status === "applied") {
        // A steady player lays the entrance, exit and paths to it straight away, or takes it back down.
        const id = w.instances().find((i) => !before.has(i.id))!.id;
        const cashBefore = w.num("park.cash");
        connectPark(runner.ctx, { only: id });
        if (w.fact(`${id}.closed`) === true) { runner.ctx.game.commands.run("brightway.remove", { id }); continue; }
        built += 1; spentOnBuilds += BUILDABLES[kind]!.cost + (cashBefore - w.num("park.cash")); return;
      }
    }
  }
};
const start = w.num("park.cash");
let lastCash = start;
let takings = 0;
let peakGuests = 0;
let lastRevenue = w.num("park.revenue_today");
let lastSpent = w.num("park.spent_today");
let lastAdmits = w.num("park.guests_today");
console.log("min  ecto   d.ecto  harvest/min  running/min admits living rumor rides built screams ghosts");
for (let m = 1; m <= minutes; m += 1) {
  let takingsThisMinute = 0;
  let spentThisMinute = 0;
  let admitsThisMinute = 0;
  for (let s = 0; s < 60; s += 1) {
    if (s % 30 === 0) { tryBuild(); tryResearch(); }
    // The gate is the player's: open it once a ride runs.
    if (w.fact("park.gate") !== true && w.canAct("open_gate") === null) runner.ctx.game.commands.run("brightway.act", { action: "open_gate" });
    runner.step(1);
    const rev = w.num("park.revenue_today");
    const delta = rev >= lastRevenue ? rev - lastRevenue : rev;
    takingsThisMinute += delta; lastRevenue = rev;
    const sp = w.num("park.spent_today"); spentThisMinute += sp >= lastSpent ? sp - lastSpent : sp; lastSpent = sp;
    const ad = w.num("park.guests_today"); admitsThisMinute += ad >= lastAdmits ? ad - lastAdmits : ad; lastAdmits = ad;
  }
  takings += takingsThisMinute;
  peakGuests = Math.max(peakGuests, w.num("park.guests"));
  const cash = w.num("park.cash");
  console.log(`${String(m).padStart(3)} ${String(Math.round(cash)).padStart(6)} ${String(Math.round(cash - lastCash)).padStart(7)} ${String(Math.round(takingsThisMinute)).padStart(11)} ${String(Math.round(spentThisMinute)).padStart(11)} ${String(admitsThisMinute).padStart(6)} ${String(session.guests.size).padStart(7)} ${String(Math.round(w.num("park.rating"))).padStart(6)} ${String(w.num("n.ride_carousel") >= 0 ? Object.values(w.instances()).filter((i) => BUILDABLES[i.kind]?.ride).length : 0).padStart(5)} ${String(built).padStart(5)} ${String(w.num("park.screams")).padStart(7)} ${String(w.num("park.ghosts")).padStart(6)}`);
  lastCash = cash;
}
const end = w.num("park.cash");
console.log(`\nstart ${Math.round(start)}  end ${Math.round(end)}  built ${built} (${spentOnBuilds} ecto)`);
console.log(`vault change per minute: ${Math.round((end - start) / minutes)} ecto`);
console.log(`operating ectoplasm per minute (vault change + build spend): ${Math.round((end - start + spentOnBuilds) / minutes)}`);
console.log(`harvest per minute: ${Math.round(takings / minutes)} ecto`);
const result = w.fact("scenario.result");
console.log(`scenario: ${result === "" ? "running" : String(result)}; most living in the park ${peakGuests}; best rumor ${Math.round(w.num("park.peak"))}; screams ${w.num("park.screams")}; ghosts ${w.num("park.ghosts")}; owed to the Ferryman ${w.num("park.loan_owed")}`);
