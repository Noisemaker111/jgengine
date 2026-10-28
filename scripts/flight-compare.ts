// `bun run perf flight [game...]`: fly every game aircraft built on `createRigidAircraft` against the reference flight model.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RigidAircraftTuning } from "../packages/core/src/flight/aircraftDynamics";
import { compareFlight, formatFlightComparison, type FlightComparisonAircraft } from "../packages/core/src/flight/reference/flightComparison";
import { compareJetEngines, type JetComparisonAircraft } from "../packages/core/src/flight/reference/jetEngineComparison";
import { compareRocketAscent } from "../packages/core/src/flight/reference/rocketComparison";
import { compareRotorcraft } from "../packages/core/src/flight/reference/rotorcraftComparison";
import { printHelpIfAsked } from "./script-help";

if (
  printHelpIfAsked("flight-compare", {
    summary: "fly every game aircraft built on createRigidAircraft and its reference aircraft through the same flight tests, then measure every game jet engine against the F100 cycle every game rotor against the Bo-105 rotor and every game rocket (and a game build of the Saturn V) against the reference rocket",
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

type FoundAircraft = FlightComparisonAircraft & JetComparisonAircraft;

/**
 * Every fixed-wing tuning a module exports, named by the nearest `label` or `id` above it, with the nearest `afterburner`
 * thrust multiplier beside it. Rotor-only craft go to `rotors` alone; a VTOL goes to both.
 */
function aircraftIn(module: Record<string, unknown>, file: string, rotors: FoundAircraft[]): FoundAircraft[] {
  const found: FoundAircraft[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, name: string, labelled: boolean, topSpeed: number | undefined, afterburner: number | undefined, depth: number): void => {
    if (!isRecord(value) || seen.has(value) || depth > 8) return;
    seen.add(value);
    const own = typeof value["label"] === "string" ? value["label"] : typeof value["id"] === "string" ? value["id"] : undefined;
    const label = own ?? name;
    const speed = typeof value["topSpeed"] === "number" ? value["topSpeed"] : topSpeed;
    const boost = typeof value["afterburner"] === "number" ? value["afterburner"] : afterburner;
    if (isTuning(value)) {
      if (value.rotor !== undefined) rotors.push({ name: label, tuning: value, cruiseSpeed: 0 });
      if (value.engine !== undefined || value.motor !== undefined) {
        found.push({ name: label, tuning: value, cruiseSpeed: 0.6 * (speed ?? 80), ...(boost === undefined ? {} : { afterburner: boost }) });
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, labelled || own !== undefined || Array.isArray(value) ? label : `${label}.${key}`, labelled || own !== undefined, speed, boost, depth + 1);
  };
  for (const [key, value] of Object.entries(module)) visit(value, `${file}:${key}`, false, undefined, undefined, 0);
  return found;
}

const games = process.argv.slice(2);
const aircraft: FoundAircraft[] = [];
const rotors: FoundAircraft[] = [];
for (const file of sourceFiles(games)) {
  const loaded: unknown = await import(pathToFileURL(resolve(root, file)).href);
  if (isRecord(loaded)) aircraft.push(...aircraftIn(loaded, file, rotors));
}
if (aircraft.length === 0 && rotors.length === 0) {
  console.log("no game aircraft built on createRigidAircraft found");
  process.exit(0);
}
const rockets = aircraft.filter((entry) => entry.tuning.motor !== undefined).map((entry) => compareRocketAscent(entry.tuning, entry.name));
const tables = [...compareFlight(aircraft), ...compareJetEngines(aircraft), ...compareRotorcraft(rotors), compareRocketAscent(), ...rockets];
console.log(formatFlightComparison(tables));
