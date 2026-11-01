// `bun run games:capabilities handling <module>#<export> ...`: score game vehicles against real physics.
// Every VehicleSpec or VehicleDynamicsTuning found in each export runs the same scenarios as the
// multi-body reference model of a real car (or, for a tuning with a lean block, a real motorcycle with
// its rider), and the table shows game / reference / real per metric.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  checkRuntimeAgainstReference,
  compareBikeTuning,
  compareRuntimeBike,
  compareRuntimeCar,
  compareVehicleTuning,
  formatHandlingComparison,
  RUNTIME_TOLERANCE,
  measureReferenceCar,
  measureReferenceMotorcycle,
  validateReferenceCars,
  validateReferenceMotorcycles,
  type ComparableHandlingMetrics,
} from "../../scripts/reference/physics/compareHandling";
import type { BikeHandlingMetrics } from "../../scripts/reference/physics/motorcycleManeuvers";
import { REAL_MOTORCYCLES } from "../../scripts/reference/physics/realMotorcycles";
import { REAL_CARS, type RealCar } from "../../scripts/reference/physics/realCars";
import type { VehicleDynamicsTuning } from "@jgengine/core/physics/vehicleDynamics";
import { vehicleTuning, type VehicleSpec } from "@jgengine/core/physics/vehicleSpec";

const USAGE = `usage: bun run games:capabilities handling <module>#<export> ... [--car <id>] [--json]
       bun run games:capabilities handling --validate
       bun run games:capabilities handling --runtime
  --validate         full validation: every real car's and motorcycle's reference model against its published tests (slow)
  --runtime          carFromReference's runtime cars and bike (every effect at 1) against their reference sims, 5% per metric (slow)
  <module>#<export>  a file and the export holding a VehicleSpec, a VehicleDynamicsTuning, or arrays/records of them
  --car <id>         real car to compare with (default: the closest in mass): ${REAL_CARS.map((car) => car.id).join(", ")}
                     a tuning with a lean block is a bike: it is compared with ${REAL_MOTORCYCLES.map((bike) => bike.name).join(", ")}
  --json             print the rows as JSON
example: bun run games:capabilities handling games/drift-foundry/src/game/parts/build.ts#BASE_HANDLING`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTuning(value: Record<string, unknown>): value is Record<string, unknown> & VehicleDynamicsTuning {
  return typeof value["massKg"] === "number" && isRecord(value["powertrain"]) && isRecord(value["steering"]);
}

function isSpec(value: Record<string, unknown>): value is Record<string, unknown> & VehicleSpec {
  const group = (name: string) => (isRecord(value[name]) ? value[name] : undefined);
  return (
    typeof group("engine")?.["topSpeed"] === "number" &&
    typeof group("engine")?.["accel"] === "number" &&
    typeof group("brakes")?.["brake"] === "number" &&
    typeof group("steering")?.["turnRate"] === "number" &&
    typeof group("tires")?.["grip"] === "number"
  );
}

/** Every car tuning inside `value`, labelled by its path and the nearest `id`/`label`/`name`. */
function collect(value: unknown, label: string, out: { label: string; tuning: VehicleDynamicsTuning }[], depth = 0): void {
  if (!isRecord(value) || depth > 5) return;
  if (isTuning(value)) {
    out.push({ label, tuning: value });
    return;
  }
  if (isSpec(value)) {
    out.push({ label, tuning: vehicleTuning(value) });
    return;
  }
  const name = ["label", "name", "id"].map((key) => value[key]).find((entry) => typeof entry === "string");
  const here = typeof name === "string" ? `${label} ${name}` : label;
  if (Array.isArray(value)) value.forEach((entry, index) => collect(entry, `${here}[${index}]`, out, depth + 1));
  else for (const [key, entry] of Object.entries(value)) collect(entry, typeof name === "string" ? here : `${here}.${key}`, out, depth + 1);
}

function nearest(massKg: number): RealCar {
  let best = REAL_CARS[0];
  for (const car of REAL_CARS) if (best === undefined || Math.abs(car.spec.massKg - massKg) < Math.abs(best.spec.massKg - massKg)) best = car;
  if (best === undefined) throw new Error("no real cars");
  return best;
}

function validate(): number {
  let failed = 0;
  for (const { car, metrics, checks } of validateReferenceCars()) {
    console.log(`${car.name}`);
    for (const check of checks) {
      const gap = check.metric === "skidpadG" ? `${check.gap >= 0 ? "+" : ""}${check.gap.toFixed(3)} g` : `${check.gap >= 0 ? "+" : ""}${(check.gap * 100).toFixed(1)}%`;
      const allowed = check.metric === "skidpadG" ? `${check.allowed} g` : `${check.allowed * 100}%`;
      console.log(`  ${check.pass ? "ok  " : "FAIL"} ${check.metric.padEnd(12)} reference ${check.reference.toFixed(2).padStart(6)}  published ${check.published.toFixed(2).padStart(6)}  gap ${gap} (allowed ${allowed})`);
      if (!check.pass) failed += 1;
    }
    console.log(`  ISO 4138 understeer ${metrics.understeerGradient.toFixed(2)} deg/g, max ${metrics.steadyStateMaxG.toFixed(2)} g; ISO 7401 response ${metrics.stepResponseTime.toFixed(2)} s, overshoot ${metrics.stepOvershoot.toFixed(2)}; ISO 3888-1 ${metrics.laneChangeSpeed.toFixed(0)} km/h
`);
  }
  for (const { bike, metrics, checks } of validateReferenceMotorcycles()) {
    console.log(`${bike.name}`);
    for (const check of checks) {
      console.log(`  ${check.pass ? "ok  " : "FAIL"} ${check.metric.padEnd(12)} reference ${check.reference.toFixed(2).padStart(6)}  published ${check.published.toFixed(2).padStart(6)}  gap ${check.gap >= 0 ? "+" : ""}${(check.gap * 100).toFixed(1)}% (allowed ${check.allowed * 100}%)`);
      if (!check.pass) failed += 1;
    }
    console.log(`  lean ${metrics.steadyLeanDeg.toFixed(0)} deg at ${metrics.steadyLateralG.toFixed(2)} g, 90% in ${metrics.timeToLean.toFixed(2)} s, countersteer ${metrics.counterSteerDeg.toFixed(1)} deg; lane change ${metrics.laneChangeSpeed.toFixed(0)} km/h, slalom ${metrics.slalomSpeed.toFixed(0)} km/h
`);
  }
  return failed === 0 ? 0 : 1;
}

function runtime(): number {
  let failed = 0;
  // The MX-5 and the GSX-R are the gated pair; the other real cars are built the same way and shown as predictions.
  const report = (title: string, rows: Parameters<typeof checkRuntimeAgainstReference>[0], gated: boolean) => {
    console.log(formatHandlingComparison(title, rows));
    for (const check of checkRuntimeAgainstReference(rows)) {
      const relative = check.allowed === RUNTIME_TOLERANCE.share;
      const gap = relative ? `${(check.gap * 100).toFixed(1)}%` : check.gap.toFixed(2);
      const allowed = relative ? `${check.allowed * 100}%` : `${check.allowed}`;
      console.log(`  ${check.pass ? "ok  " : gated ? "FAIL" : "off "} ${check.label.padEnd(34)} gap ${gap} (allowed ${allowed})`);
      if (!check.pass && gated) failed += 1;
    }
    console.log("");
  };
  for (const car of REAL_CARS) report(`carFromReference("${car.id}") vs its reference${car.id === "mazda-mx5-nd" ? "" : " (prediction, not gated)"}`, compareRuntimeCar(car).comparison.rows, car.id === "mazda-mx5-nd");
  for (const bike of REAL_MOTORCYCLES) report(`carFromReference("suzuki-gsxr1000-k1") vs ${bike.name} reference`, compareRuntimeBike(bike).comparison.rows, true);
  return failed === 0 ? 0 : 1;
}

async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes("--validate")) return validate();
  if (argv.includes("--runtime")) return runtime();
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return argv.length === 0 ? 2 : 0;
  }
  const carAt = argv.indexOf("--car");
  const carId = carAt >= 0 ? argv[carAt + 1] : undefined;
  const forced = carId === undefined ? undefined : REAL_CARS.find((car) => car.id === carId);
  if (carId !== undefined && forced === undefined) {
    console.error(`handling: no real car ${carId}\n\n${USAGE}`);
    return 2;
  }
  const json = argv.includes("--json");
  const targets = argv.filter((arg, index) => !arg.startsWith("--") && argv[index - 1] !== "--car");
  const found: { label: string; tuning: VehicleDynamicsTuning }[] = [];
  for (const target of targets) {
    const [file, exportName] = target.split("#");
    if (file === undefined || exportName === undefined || exportName.length === 0) {
      console.error(`handling: ${target} needs <module>#<export>\n\n${USAGE}`);
      return 2;
    }
    const module: unknown = await import(pathToFileURL(resolve(file)).href);
    const value = isRecord(module) ? module[exportName] : undefined;
    if (value === undefined) {
      console.error(`handling: ${file} exports no ${exportName}`);
      return 1;
    }
    const before = found.length;
    collect(value, `${file.replace(/\\/g, "/")}#${exportName}`, found);
    if (found.length === before) console.error(`handling: ${target} holds no VehicleSpec or VehicleDynamicsTuning`);
  }
  const references = new Map<string, ComparableHandlingMetrics>();
  let bikeReference: BikeHandlingMetrics | undefined;
  const results = [];
  for (const entry of found) {
    if (entry.tuning.lean !== undefined) {
      const bike = REAL_MOTORCYCLES[0];
      if (bike === undefined) throw new Error("no real motorcycles");
      bikeReference ??= measureReferenceMotorcycle(bike);
      const comparison = compareBikeTuning(entry.tuning, bike, bikeReference);
      results.push({ label: entry.label, bike: bike.name, rows: comparison.rows });
      if (!json) console.log(`${formatHandlingComparison(`${entry.label} vs ${bike.name} (${Math.round(entry.tuning.massKg)} kg)`, comparison.rows)}\n`);
      continue;
    }
    const car = forced ?? nearest(entry.tuning.massKg);
    let reference = references.get(car.id);
    if (reference === undefined) {
      reference = measureReferenceCar(car);
      references.set(car.id, reference);
    }
    const comparison = compareVehicleTuning(entry.tuning, car, reference);
    results.push({ label: entry.label, car: car.id, rows: comparison.rows });
    if (!json) console.log(`${formatHandlingComparison(`${entry.label} vs ${car.name} (${Math.round(entry.tuning.massKg)} kg vs ${car.spec.massKg} kg)`, comparison.rows)}\n`);
  }
  if (json) console.log(JSON.stringify(results, null, 2));
  return found.length > 0 ? 0 : 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
