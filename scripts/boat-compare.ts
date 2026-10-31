// `bun run perf boat [game...]`: score every game boat built on `createBoatDynamics` against a reference hull.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatFlightComparison } from "./reference/flight/flightComparison";
import { compareBoat, referenceBoatSubjects, referenceSubjectFor } from "./reference/physics/boatComparison";
import type { BoatTuning } from "../packages/core/src/physics/boatDynamics";
import { printHelpIfAsked } from "./script-help";

if (
  printHelpIfAsked("boat-compare", {
    summary: "run every game boat built on createBoatDynamics and its reference hull (Holtrop–Mennen or Savitsky) through the same straight-line tests, beside the reference boats' published figures",
    usage: "bun run perf boat [game...]",
    flags: [],
    example: "bun run perf boat",
  })
) {
  process.exit(0);
}

const root = resolve(import.meta.dir, "..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBoatTuning(value: Record<string, unknown>): value is Record<string, unknown> & BoatTuning {
  return ["massKg", "length", "beam", "maxThrust", "propSpeed"].every((key) => typeof value[key] === "number") && isRecord(value["steering"]);
}

function sourceFiles(games: readonly string[]): string[] {
  const paths = games.length === 0 ? ["games/*/src/*"] : games.map((game) => `games/${game}/src/*`);
  const found = spawnSync("git", ["grep", "-l", "-E", "BoatTuning|createBoatDynamics", "--", ...paths, ":!*.test.ts"], { cwd: root, encoding: "utf8" });
  return found.stdout.split("\n").filter((line) => line.endsWith(".ts"));
}

/** Every boat tuning a module exports, named by the nearest `label`, `name` or `id`. */
function boatsIn(module: Record<string, unknown>, file: string): { name: string; tuning: BoatTuning }[] {
  const found: { name: string; tuning: BoatTuning }[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, name: string, depth: number): void => {
    if (!isRecord(value) || seen.has(value) || depth > 8) return;
    seen.add(value);
    const own = ["label", "name", "id"].map((key) => value[key]).find((entry) => typeof entry === "string");
    const label = typeof own === "string" ? own : name;
    if (isBoatTuning(value)) {
      found.push({ name: label, tuning: value });
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, typeof own === "string" ? label : `${label}.${key}`, depth + 1);
  };
  for (const [key, value] of Object.entries(module)) visit(value, `${file}:${key}`, 0);
  return found;
}

const games = process.argv.slice(2);
const boats: { name: string; tuning: BoatTuning }[] = [];
for (const file of sourceFiles(games)) {
  const loaded: unknown = await import(pathToFileURL(resolve(root, file)).href);
  if (isRecord(loaded)) boats.push(...boatsIn(loaded, file));
}
if (boats.length === 0) console.log(`no game boats built on createBoatDynamics found${games.length > 0 ? ` in ${games.join(", ")}` : ""}; showing the reference boats' game builds\n`);
const tables = [...boats.map((boat) => compareBoat(referenceSubjectFor(boat.name, boat.tuning), boat.name)), ...referenceBoatSubjects().map((subject) => compareBoat(subject))];
console.log(formatFlightComparison(tables));
