// `bun run perf flight [game...]`: fly every game aircraft built on `createRigidAircraft` against the reference flight model.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RigidAircraftTuning } from "../packages/core/src/flight/aircraftDynamics";
import { compareFlight, formatFlightComparison, type FlightComparisonAircraft } from "../packages/core/src/flight/reference/flightComparison";
import { printHelpIfAsked } from "./script-help";

if (
  printHelpIfAsked("flight-compare", {
    summary: "fly every game aircraft built on createRigidAircraft and its reference aircraft through the same flight tests",
    usage: "bun run perf flight [game...]",
    flags: [],
    example: "bun run perf flight harbor-heat",
  })
) {
  process.exit(0);
}

const root = resolve(import.meta.dir, "..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTuning(value: Record<string, unknown>): value is Record<string, unknown> & RigidAircraftTuning {
  return typeof value["massKg"] === "number" && isRecord(value["inertia"]) && Array.isArray(value["surfaces"]);
}

function sourceFiles(games: readonly string[]): string[] {
  const paths = games.length === 0 ? ["games/*/src/*"] : games.map((game) => `games/${game}/src/*`);
  const found = spawnSync("git", ["grep", "-l", "RigidAircraftTuning", "--", ...paths, ":!*.test.ts"], { cwd: root, encoding: "utf8" });
  return found.stdout.split("\n").filter((line) => line.endsWith(".ts"));
}

/** Every fixed-wing tuning a module exports, named by the nearest `label` or `id` above it; rotor-only craft are skipped. */
function aircraftIn(module: Record<string, unknown>, file: string): FlightComparisonAircraft[] {
  const found: FlightComparisonAircraft[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, name: string, labelled: boolean, topSpeed: number | undefined, depth: number): void => {
    if (!isRecord(value) || seen.has(value) || depth > 8) return;
    seen.add(value);
    const own = typeof value["label"] === "string" ? value["label"] : typeof value["id"] === "string" ? value["id"] : undefined;
    const label = own ?? name;
    const speed = typeof value["topSpeed"] === "number" ? value["topSpeed"] : topSpeed;
    if (isTuning(value)) {
      if (value.engine !== undefined || value.motor !== undefined) found.push({ name: label, tuning: value, cruiseSpeed: 0.6 * (speed ?? 80) });
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, labelled || own !== undefined || Array.isArray(value) ? label : `${label}.${key}`, labelled || own !== undefined, speed, depth + 1);
  };
  for (const [key, value] of Object.entries(module)) visit(value, `${file}:${key}`, false, undefined, 0);
  return found;
}

const games = process.argv.slice(2);
const aircraft: FlightComparisonAircraft[] = [];
for (const file of sourceFiles(games)) {
  const loaded: unknown = await import(pathToFileURL(resolve(root, file)).href);
  if (isRecord(loaded)) aircraft.push(...aircraftIn(loaded, file));
}
if (aircraft.length === 0) {
  console.log("no game aircraft built on createRigidAircraft found");
  process.exit(0);
}
console.log(formatFlightComparison(compareFlight(aircraft)));
