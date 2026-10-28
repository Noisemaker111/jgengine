import { CHANG_KRAM_CURVE_SPEEDS, maxCurveSpeed, RECREATIONAL_SPRINTER } from "./curveRunning";
import { RECREATIONAL_SPRINT_PROFILE, slopeCostOfTransport, sprint, sprintTopSpeed, stoppingDistance, test505Time } from "./humanEnvelope";
import { FITTED_WALKS, measureWalk, type FittedWalk } from "./humanGaits";
import type { GaitReport } from "./humanGaitAnalysis";
import { simulateJump } from "./humanJump";
import { RECREATIONAL_RUNNER, springMassStep } from "./springMassRunning";

/** One reference number against the range published for real people. */
export interface HumanValidationRow {
  metric: string;
  label: string;
  unit: string;
  /** The reference model's value. */
  reference: number;
  /** Published range for real people. */
  low: number;
  high: number;
  source: string;
  pass: boolean;
}

/**
 * Gross metabolic power of walking, W/kg: `2.23 + 1.26·v²` (H. J. Ralston, *Int. Z. Angew. Physiol.* 17, 1958).
 * @internal
 */
export function ralstonWalkingPower(speed: number): number {
  return 2.23 + 1.26 * speed * speed;
}

/**
 * Net metabolic cost of level running, J/(kg·m), nearly independent of speed: 3.8–4.0 (P. E. di Prampero et al.,
 * *Eur. J. Appl. Physiol.* 55, 1986; R. Margaria et al., *J. Appl. Physiol.* 18, 1963).
 */
export const RUNNING_NET_COST = 3.9;

const BASAL = 1.16;

/**
 * Walking speed where the reference walk's gross cost of transport crosses running's, m/s, by linear interpolation.
 * @internal
 */
export function energeticTransitionSpeed(walks: readonly { speed: number; grossCost: number }[]): number {
  const runCost = (v: number) => RUNNING_NET_COST + BASAL / v;
  const sorted = [...walks].sort((a, b) => a.speed - b.speed);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a === undefined || b === undefined) continue;
    const da = a.grossCost - runCost(a.speed);
    const db = b.grossCost - runCost(b.speed);
    if (da <= 0 && db > 0) return a.speed + ((b.speed - a.speed) * -da) / (db - da);
  }
  return Number.NaN;
}

/**
 * Speed of least gross cost of transport, m/s: the vertex of a parabola through the cheapest walk and its neighbours.
 * @internal
 */
export function preferredWalkingSpeed(walks: readonly { speed: number; grossCost: number }[]): number {
  const sorted = [...walks].sort((a, b) => a.speed - b.speed);
  let k = 0;
  sorted.forEach((w, i) => {
    if (w.grossCost < (sorted[k]?.grossCost ?? Number.POSITIVE_INFINITY)) k = i;
  });
  const i = Math.min(Math.max(1, k), sorted.length - 2);
  const a = sorted[i - 1];
  const b = sorted[i];
  const c = sorted[i + 1];
  if (a === undefined || b === undefined || c === undefined) return sorted[k]?.speed ?? Number.NaN;
  const denom = (a.speed - b.speed) * (a.speed - c.speed) * (b.speed - c.speed);
  const A = (c.speed * (b.grossCost - a.grossCost) + b.speed * (a.grossCost - c.grossCost) + a.speed * (c.grossCost - b.grossCost)) / denom;
  const B = (c.speed ** 2 * (a.grossCost - b.grossCost) + b.speed ** 2 * (c.grossCost - a.grossCost) + a.speed ** 2 * (b.grossCost - c.grossCost)) / denom;
  return A > 0 ? -B / (2 * A) : (sorted[k]?.speed ?? Number.NaN);
}

const round = (value: number) => Math.round(value * 100) / 100;

function row(metric: string, label: string, unit: string, reference: number, low: number, high: number, source: string): HumanValidationRow {
  return { metric, label, unit, reference, low, high, source, pass: reference >= low && reference <= high };
}

/**
 * Measured fitted walks, keyed by fit; pass them to {@link validateHumanReference} to avoid re-simulating.
 * @internal
 */
export function measureFittedWalks(walks: readonly FittedWalk[] = FITTED_WALKS): { walk: FittedWalk; report: GaitReport }[] {
  return walks.map((walk) => ({ walk, report: measureWalk(walk) }));
}

/**
 * Validate the human locomotion reference against published biomechanics: walking energetics, stride and ground
 * force from the muscle-reflex walker; the walk–run transition; running ground force and contact from the
 * spring-mass runner; sprint, braking, change of direction and curve limits; and the countermovement jump.
 * @capability human-reference-validation check the locomotion reference human against published walking, running, sprint, turn and jump data
 */
export function validateHumanReference(measured = measureFittedWalks()): HumanValidationRow[] {
  const level = measured.filter((m) => m.walk.terrain === "level" && !m.report.fell);
  const near = (speed: number) => level.reduce<(typeof level)[number] | undefined>((best, m) => (best === undefined || Math.abs(m.walk.speed - speed) < Math.abs(best.walk.speed - speed) ? m : best), undefined);
  const rows: HumanValidationRow[] = [];
  const costs = level.map((m) => ({ speed: m.report.speed, grossCost: m.report.grossCost }));
  const walk = near(1.3);
  if (walk !== undefined) {
    const r = walk.report;
    const ralston = ralstonWalkingPower(r.speed) / r.speed;
    rows.push(row("walkCost", `Gross cost of transport at ${r.speed.toFixed(2)} m/s`, "J/(kg·m)", r.grossCost, round(0.88 * ralston), round(1.12 * ralston), "Ralston 1958, ±12%"));
    rows.push(row("walkStride", `Stride length at ${r.speed.toFixed(2)} m/s`, "m", r.strideLength, 1.3, 1.6, "Winter 1991; Murray et al. 1964"));
    rows.push(row("walkCadence", `Cadence at ${r.speed.toFixed(2)} m/s`, "steps/min", 120 * r.strideFrequency, 100, 120, "Winter 1991; Murray et al. 1964"));
    rows.push(row("walkDuty", "Walking duty factor", "", r.dutyFactor, 0.57, 0.65, "Winter 1991 (stance 60–62% of stride)"));
    rows.push(row("walkFirstPeak", "Walking ground force, loading peak", "BW", r.force.firstPeak, 1.0, 1.3, "Winter 1991"));
    rows.push(row("walkValley", "Walking ground force, mid-stance valley", "BW", r.force.valley, 0.55, 0.85, "Winter 1991"));
    rows.push(row("walkSecondPeak", "Walking ground force, push-off peak", "BW", r.force.secondPeak, 1.0, 1.3, "Winter 1991"));
  }
  if (walk !== undefined) {
    for (const terrain of ["uphill", "downhill"] as const) {
      const slope = measured.find((m) => m.walk.terrain === terrain && !m.report.fell);
      if (slope === undefined) continue;
      const grade = terrain === "uphill" ? 0.06 : -0.06;
      const published = slopeCostOfTransport("walk", grade) / slopeCostOfTransport("walk", 0);
      rows.push(row(`${terrain}Cost`, `Net walking cost on a ${grade > 0 ? "+" : ""}${grade * 100}% grade over level`, "×", slope.report.netCost / walk.report.netCost, round(published - 0.1), round(published + 0.1), "Minetti et al. 2002, ±0.1"));
    }
  }
  rows.push(row("preferredWalk", "Preferred walking speed (least cost of transport)", "m/s", preferredWalkingSpeed(costs), 1.2, 1.5, "Ralston 1958 (1.33); Bohannon & Andrews 2011"));
  rows.push(row("fastestWalk", "Fastest steady walk", "m/s", Math.max(...costs.map((c) => c.speed)), 2.0, 2.6, "Bohannon & Andrews 2011 (maximal gait speed, men 20–59)"));
  const transition = energeticTransitionSpeed(costs);
  rows.push(row("walkRunSpeed", "Walk–run transition (walk cost meets run cost)", "m/s", transition, 1.8, 2.2, "Hreljac 1993; Thorstensson & Roberthson 1987"));
  rows.push(row("walkRunFroude", "Walk–run transition Froude number", "", (transition * transition) / (9.81 * 0.94), 0.35, 0.6, "Alexander 1989 (≈0.5)"));
  const run35 = springMassStep(RECREATIONAL_RUNNER, 3.5);
  const run45 = springMassStep(RECREATIONAL_RUNNER, 4.5);
  rows.push(row("runPeak", "Running ground force peak at 4.5 m/s", "BW", run45.peakForce, 2.5, 2.9, "Cavanagh & Lafortune 1980 (2.7–2.8)"));
  rows.push(row("runContact", "Running contact time at 3.5 m/s", "s", run35.contactTime, 0.21, 0.27, "Weyand et al. 2000; Cavanagh & Kram 1989"));
  rows.push(row("runDuty", "Running duty factor at 3.5 m/s", "", run35.dutyFactor, 0.28, 0.38, "Cavanagh & Kram 1989"));
  rows.push(row("runTouchdown", "Running leg angle at touchdown at 3.5 m/s", "deg", (run35.touchdownAngle * 180) / Math.PI, 20, 32, "Farley et al. 1993; McMahon & Cheng 1990"));
  const profile = RECREATIONAL_SPRINT_PROFILE;
  rows.push(row("sprintTop", "Sprint top speed", "m/s", sprintTopSpeed(profile), 7.2, 8.5, "Chang & Kram 2007 (7.7, recreational)"));
  rows.push(row("sprint30", "30 m sprint from standing", "s", sprint(profile, { distance: 30 }).time, 4.4, 5.2, "Morin & Samozino 2016 (team-sport to recreational)"));
  rows.push(row("stop7", "Stopping distance from 7 m/s", "m", stoppingDistance(profile, 7).distance, 3.3, 5.5, "Harper et al. 2022 (4.5–7.5 m/s²)"));
  rows.push(row("test505", "505 change-of-direction time", "s", test505Time(profile), 2.2, 2.8, "Draper & Lancaster 1985; Nimphius et al. 2016"));
  for (const curve of CHANG_KRAM_CURVE_SPEEDS) {
    if (!Number.isFinite(curve.radius)) continue;
    rows.push(row(`curve${curve.radius}`, `Top speed on a ${curve.radius} m radius curve`, "m/s", maxCurveSpeed(RECREATIONAL_SPRINTER, curve.radius), round(0.95 * curve.speed), round(1.05 * curve.speed), "Chang & Kram 2007, ±5%"));
  }
  const jump = simulateJump();
  rows.push(row("jumpHeight", "Countermovement jump: centre-of-mass rise", "m", jump.height, 0.3, 0.45, "Bobbert et al. 1996; Markovic et al. 2004 (no arm swing)"));
  rows.push(row("jumpTakeoff", "Countermovement jump: takeoff speed", "m/s", jump.takeoffSpeed, 2.3, 2.9, "Bobbert et al. 1996"));
  rows.push(row("jumpDepth", "Countermovement depth", "m", jump.countermovement, 0.2, 0.4, "Bobbert et al. 1996"));
  rows.push(row("jumpPush", "Countermovement jump: push force peak", "BW", jump.pushPeak, 2.0, 3.2, "Linthorne 2001"));
  rows.push(row("jumpAir", "Countermovement jump: airtime", "s", jump.airTime, 0.45, 0.62, "Bosco et al. 1983"));
  return rows;
}

/**
 * Plain-text table of {@link validateHumanReference} rows.
 * @capability human-validation-table markdown table of the locomotion reference against published ranges
 */
export function formatHumanValidation(rows: readonly HumanValidationRow[]): string {
  const lines = ["| Metric | Reference | Published | Source | |", "| --- | --- | --- | --- | --- |"];
  for (const r of rows) lines.push(`| ${r.label} | ${r.reference.toFixed(2)} ${r.unit} | ${r.low}–${r.high} ${r.unit} | ${r.source} | ${r.pass ? "pass" : "FAIL"} |`);
  return lines.join("\n");
}
