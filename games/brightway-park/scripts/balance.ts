/**
 * The first 30 minutes of play at 1x, headless: a steady player who opens the park and, every half
 * minute, builds the next ride or shop it can afford while keeping a cash reserve, and keeps the lab
 * busy when the till allows. Prices stay at their defaults.
 * Prints the till, takings and running costs minute by minute and the cash per minute.
 *
 *   bun scripts/balance.ts [minutes=30]
 */
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { game } from "../src/game.config";
import { content } from "../src/game/content";
import { BUILDABLES, BUILD_IDS } from "../src/game/objects/catalog";
import { LOT, park } from "../src/game/park";
import { session } from "../src/game/session";
import { connectPark } from "../src/game/build/links";

const records = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => records.get(key) ?? null,
  setItem: (key: string, value: string) => records.set(key, value),
  removeItem: (key: string) => records.delete(key),
} });

const minutes = Number(process.argv[2] ?? 30);
const runner = createHeadlessRunner({ definition: game.game, content, loop: game.game.loop, maxStepSeconds: 1 });
runner.ui.invoke("park.start");
const w = park.of(runner.ctx);
const buildable = BUILD_IDS.filter((id) => BUILDABLES[id]!.category === "ride" || BUILDABLES[id]!.category === "stall");
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
  const wanted = w.num("park.litter") > 15 && w.num("n.staff_janitor") < 1 + Math.floor(session.guests.size / 80) ? ["staff_janitor"] : [];
  for (const kind of wanted) for (let row = 4; row < LOT.rows - 4; row += 2) for (let col = 4; col < LOT.cols - 4; col += 2) {
    if (wanted.length === 0 || w.canPlace(kind, { cell: [col, row] }) !== null) continue;
    if (runner.ctx.game.commands.run("brightway.place", { kind, cell: [col, row] }).status === "applied") { built += 1; spentOnBuilds += BUILDABLES[kind]!.cost; wanted.length = 0; }
  }
  const order = [...buildable].sort((a, b) => (w.num(`n.${a}`) - w.num(`n.${b}`)) || BUILDABLES[a]!.cost - BUILDABLES[b]!.cost);
  for (const kind of order) {
    if (BUILDABLES[kind]!.cost > cash) continue;
    if (w.canPlace(kind)?.reason === "locked") continue;
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
let lastRevenue = w.num("park.revenue_today");
let lastSpent = w.num("park.spent_today");
let lastAdmits = w.num("park.guests_today");
console.log("min  cash   d.cash  takings/min  running/min admits guests rating rides built");
for (let m = 1; m <= minutes; m += 1) {
  let takingsThisMinute = 0;
  let spentThisMinute = 0;
  let admitsThisMinute = 0;
  for (let s = 0; s < 60; s += 1) {
    if (s % 30 === 0) { tryBuild(); tryResearch(); }
    runner.step(1);
    const rev = w.num("park.revenue_today");
    const delta = rev >= lastRevenue ? rev - lastRevenue : rev;
    takingsThisMinute += delta; lastRevenue = rev;
    const sp = w.num("park.spent_today"); spentThisMinute += sp >= lastSpent ? sp - lastSpent : sp; lastSpent = sp;
    const ad = w.num("park.guests_today"); admitsThisMinute += ad >= lastAdmits ? ad - lastAdmits : ad; lastAdmits = ad;
  }
  takings += takingsThisMinute;
  const cash = w.num("park.cash");
  console.log(`${String(m).padStart(3)} ${String(Math.round(cash)).padStart(6)} ${String(Math.round(cash - lastCash)).padStart(7)} ${String(Math.round(takingsThisMinute)).padStart(11)} ${String(Math.round(spentThisMinute)).padStart(11)} ${String(admitsThisMinute).padStart(6)} ${String(session.guests.size).padStart(7)} ${String(Math.round(w.num("park.rating"))).padStart(6)} ${String(w.num("n.ride_carousel") >= 0 ? Object.values(w.instances()).filter((i) => BUILDABLES[i.kind]?.ride).length : 0).padStart(5)} ${String(built).padStart(5)}`);
  lastCash = cash;
}
const end = w.num("park.cash");
console.log(`\nstart $${Math.round(start)}  end $${Math.round(end)}  built ${built} ($${spentOnBuilds})`);
console.log(`till change per minute: $${Math.round((end - start) / minutes)}`);
console.log(`operating cash per minute (till change + build spend): $${Math.round((end - start + spentOnBuilds) / minutes)}`);
console.log(`takings per minute: $${Math.round(takings / minutes)}`);
