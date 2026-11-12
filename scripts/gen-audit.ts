// `bun run gen-audit`: see and measure the street, city and race-circuit generators without a GPU.
//
// Runs every preset of each generator over a few seeds, measures each output with the model-code
// metrics in packages/core (roads/streetMetrics, roads/circuitMetrics, roads/lapSim, city/cityMetrics),
// judges them against the cited reference bands (generator/referenceBands), and writes:
//   <out>/<generator>-<preset>.svg/.png  top-down contact sheet, one column per seed, annotated
//   <out>/metrics.json                    every run's metrics, timing and band verdicts
//   <out>/report.md                       per-preset tables against the bands, plus key figures
// To judge a generator change: run it before and after, open the PNGs, compare report.md.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CITY_GENERATOR, CITY_SCHEMA, type ResolvedCity } from "../packages/core/src/city/cityKind";
import { cityMetrics, cityMetricsInput } from "../packages/core/src/city/cityMetrics";
import { runGenerator } from "../packages/core/src/generator/generator";
import { roundedFingerprint, withOtherLibm } from "../packages/core/src/random/testFixtures/otherLibm";
import { formatBand, judgeBands, referenceProfileFor, type BandJudgement, type ReferenceGenerator } from "../packages/core/src/generator/referenceBands";
import { analyzeCircuit, type CircuitAnalysis, type CircuitMetrics, type CircuitMetricsInput } from "../packages/core/src/roads/circuitMetrics";
import { RACE_CIRCUIT_GENERATOR, RACE_CIRCUIT_SCHEMA, type RaceCircuit } from "../packages/core/src/roads/raceCircuit";
import { STREET_NETWORK_GENERATOR, STREET_NETWORK_SCHEMA, type StreetNetwork } from "../packages/core/src/roads/streetGenerator";
import { roadElevationMetrics, streetNetworkMetrics, type PlanPoint } from "../packages/core/src/roads/streetMetrics";
import { contactSheet, drawCircuit, drawCity, drawStreets, Panel, PANEL_FOOTER, PANEL_HEADER, type DrawRace } from "./gen-audit-draw";
import { findChromeExecutable } from "./browser-lib";
import { printHelpIfAsked, type Usage } from "./script-help";

const root = fileURLToPath(new URL("..", import.meta.url));

const USAGE: Usage = {
  summary: "render and measure the street / city / race-circuit generators against cited reference bands (no GPU)",
  usage: "bun run gen-audit [--generator streets|city|circuit|race]... [--preset <id>]... [--seeds <n>] [--half <m>] [--out <dir>] [--no-png] [--other-libm]",
  flags: [
    { flag: "--generator <g>", detail: "streets, city, circuit (closed race circuit) or race (street race, city race); repeat for several (default all)" },
    { flag: "--preset <id>", detail: "only these preset ids (repeatable); streets also has a `terrain` case (river valley + hill)" },
    { flag: "--seeds <n>", detail: "seeds per preset, named s1..sN (default 3)" },
    { flag: "--half <m>", detail: "district half-extent for every run (default: each generator's own default)" },
    { flag: "--out <dir>", detail: "output folder (default .scratch/gen-audit)" },
    { flag: "--no-png", detail: "write SVG, metrics.json and report.md only (skips Chrome)" },
    { flag: "--other-libm", detail: "generate under a simulated other libm (Math results 1 ulp off) and report whether each output's rounded fingerprint still matches" },
  ],
  example: "bun run gen-audit --generator circuit --seeds 4 --out .scratch/gen-audit-before",
};

export type AuditGenerator = "streets" | "city" | "circuit" | "race";
const ALL_GENERATORS: readonly AuditGenerator[] = ["streets", "city", "circuit", "race"];

export interface AuditArgs {
  generators: AuditGenerator[];
  presets: string[];
  seeds: number;
  half?: number;
  out: string;
  png: boolean;
  /** Generate under the simulated other libm and compare fingerprints. */
  otherLibm: boolean;
}

export function parseAuditArgs(argv: readonly string[]): AuditArgs | string {
  const args: AuditArgs = { generators: [], presets: [], seeds: 3, out: join(root, ".scratch", "gen-audit"), png: true, otherLibm: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    const value = argv[i + 1];
    const need = (): string | undefined => (value === undefined || value.startsWith("--") ? undefined : (i += 1, value));
    if (flag === "--no-png") args.png = false;
    else if (flag === "--other-libm") args.otherLibm = true;
    else if (flag === "--generator") {
      const v = need();
      if (v === undefined || !ALL_GENERATORS.includes(v as AuditGenerator)) return `--generator takes one of ${ALL_GENERATORS.join(", ")}`;
      args.generators.push(v as AuditGenerator);
    } else if (flag === "--preset") {
      const v = need();
      if (v === undefined) return "--preset needs an id";
      args.presets.push(v);
    } else if (flag === "--seeds") {
      const v = Number(need());
      if (!Number.isInteger(v) || v < 1 || v > 12) return "--seeds takes a whole number 1..12";
      args.seeds = v;
    } else if (flag === "--half") {
      const v = Number(need());
      if (!Number.isFinite(v) || v < 20) return "--half takes metres (≥ 20)";
      args.half = v;
    } else if (flag === "--out") {
      const v = need();
      if (v === undefined) return "--out needs a folder";
      args.out = resolve(process.cwd(), v);
    } else return `unknown argument ${flag}`;
  }
  if (args.generators.length === 0) args.generators = [...ALL_GENERATORS];
  return args;
}

/** A river valley (8 m deep, 50 m wide) across the district, a 25 m hill and a gentle tilt. */
function valleyTerrain(x: number, z: number): number {
  const d = Math.abs(z - 0.3 * x - 20);
  const river = d < 25 ? -8 * (1 - (d / 25) ** 2) : 0;
  const hill = 25 * Math.exp(-((x + 110) ** 2 + (z + 110) ** 2) / (2 * 45 ** 2));
  return river + hill + x * 0.02;
}

/** One preset to run over seeds. */
interface AuditCase {
  generator: AuditGenerator;
  preset: string;
  /** Profile lookup: which band family and preset id. */
  bands: { generator: ReferenceGenerator; preset: string };
  meta: Record<string, unknown>;
  heightAt?: (x: number, z: number) => number;
  /** City district half-extent (the city generator takes its footprint as input, not params). */
  cityHalf?: number;
}

function presetValues(schema: { presets?: readonly { id: string; values: Readonly<Record<string, unknown>> }[] }, id: string): Record<string, unknown> {
  return { ...(schema.presets?.find((p) => p.id === id)?.values ?? {}) };
}

function fieldDefault(schema: { fields: readonly { key: string; default?: unknown }[] }, key: string): number | undefined {
  const value = schema.fields.find((f) => f.key === key)?.default;
  return typeof value === "number" ? value : undefined;
}

export function auditCases(args: Pick<AuditArgs, "generators" | "presets" | "half">): AuditCase[] {
  const cases: AuditCase[] = [];
  const half = args.half === undefined ? {} : { halfX: args.half, halfZ: args.half };
  for (const generator of args.generators) {
    if (generator === "streets") {
      for (const p of STREET_NETWORK_SCHEMA.presets ?? []) cases.push({ generator, preset: p.id, bands: { generator: "streets", preset: p.id }, meta: { ...presetValues(STREET_NETWORK_SCHEMA, p.id), ...half } });
      cases.push({
        generator,
        preset: "terrain",
        bands: { generator: "streets", preset: "net" },
        meta: { ...presetValues(STREET_NETWORK_SCHEMA, "net"), bridges: true, tunnels: true, elevation: 0.6, ...half },
        heightAt: valleyTerrain,
      });
    } else if (generator === "city") {
      for (const id of ["default", ...(CITY_SCHEMA.presets ?? []).map((p) => p.id)]) cases.push({ generator, preset: id, bands: { generator: "city", preset: id }, meta: id === "default" ? {} : presetValues(CITY_SCHEMA, id), ...(args.half === undefined ? {} : { cityHalf: args.half }) });
    } else if (generator === "circuit") {
      for (const p of RACE_CIRCUIT_SCHEMA.presets ?? []) {
        if (p.id === "street-race") continue;
        cases.push({ generator, preset: p.id, bands: { generator: "circuit", preset: p.id }, meta: { ...presetValues(RACE_CIRCUIT_SCHEMA, p.id), ...half } });
      }
    } else {
      cases.push({ generator, preset: "street-race", bands: { generator: "circuit", preset: "street-race" }, meta: { ...presetValues(RACE_CIRCUIT_SCHEMA, "street-race"), ...half } });
      cases.push({ generator, preset: "city", bands: { generator: "circuit", preset: "city" }, meta: { ...presetValues(CITY_SCHEMA, "metropolis"), race: true, raceLapLength: 1200 }, ...(args.half === undefined ? {} : { cityHalf: args.half }) });
    }
  }
  return args.presets.length === 0 ? cases : cases.filter((c) => args.presets.includes(c.preset));
}

/** One seed's result. */
export interface AuditRun {
  generator: AuditGenerator;
  preset: string;
  profile: string | undefined;
  seed: string;
  ms: number;
  /** With `--other-libm`: whether the output's rounded fingerprint matched the native-libm run. */
  libmStable?: boolean;
  metrics: Record<string, unknown>;
  verdicts: { metric: string; band: string; kind: string; value: number | null; verdict: string }[];
}

/** A square world window for a panel. */
interface View {
  minX: number;
  minZ: number;
  span: number;
}

/** The window holding the declared district and everything drawn (a lap may leave the district). */
function viewOf(half: number, lines: readonly (readonly PlanPoint[])[]): View {
  let minX = -half;
  let maxX = half;
  let minZ = -half;
  let maxZ = half;
  for (const line of lines) for (const p of line) (minX = Math.min(minX, p[0])), (maxX = Math.max(maxX, p[0])), (minZ = Math.min(minZ, p[1])), (maxZ = Math.max(maxZ, p[1]));
  const span = Math.max(maxX - minX, maxZ - minZ) * 1.03;
  return { minX: (minX + maxX) / 2 - span / 2, minZ: (minZ + maxZ) / 2 - span / 2, span };
}

interface Drawn {
  run: AuditRun;
  view: View;
  draw: (panel: Panel, row: number) => void;
  rows: number;
  caption: (row: number) => string[];
}

function round(value: number, digits = 3): number {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

/** NaN and Infinity become null in JSON; numbers keep 3 decimals. */
function tidy(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? round(value) : null;
  if (Array.isArray(value)) return value.map(tidy);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tidy(v)]));
  return value;
}

export function fmt(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "–";
  if (Number.isInteger(value)) return String(value);
  const a = Math.abs(value);
  if (a >= 100) return value.toFixed(0);
  if (a >= 10) return value.toFixed(1);
  if (a >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function judge(bands: AuditCase["bands"], metrics: Record<string, unknown>): { profile: string | undefined; verdicts: AuditRun["verdicts"]; raw: BandJudgement[] } {
  const profile = referenceProfileFor(bands.generator, bands.preset);
  const raw = profile === undefined ? [] : judgeBands(metrics, profile.bands);
  return {
    profile: profile?.id,
    raw,
    verdicts: raw.map((j) => ({ metric: j.band.metric, band: formatBand(j.band), kind: j.band.kind, value: j.value === undefined || !Number.isFinite(j.value) ? null : round(j.value), verdict: j.verdict })),
  };
}

function circuitInput(route: RaceCircuit["route"] & object, pits: readonly (readonly PlanPoint[])[]): CircuitMetricsInput {
  return { centerline: route.centerline, widths: route.widths, ...(route.heights ? { heights: route.heights } : {}), grid: route.grid, seals: route.seals, sectors: route.sectors, start: route.start, pits };
}

function circuitCaption(seed: string, ms: number, m: CircuitMetrics): string[] {
  const n = (k: keyof CircuitMetrics): string => fmt(m[k]);
  return [
    `${seed}  lap ${n("lengthM")} m (${n("lengthErrorPct")}%)  ${n("corners")} corners, ${n("cornersPerKm")}/km  90°-share ${n("rightAngleShare")}`,
    `R p10/50/90 ${n("radiusP10")}/${n("radiusP50")}/${n("radiusP90")} m  longest straight ${n("longestStraightM")} m (≥400 m: ${n("straightsOver400")})`,
    `sim ${n("lapTimeS")} s, ${n("avgKph")} kph  OT spots ${n("overtakingSpots")}  grid in corner ${n("gridInCorner")}/${n("gridSlots")}  ${fmt(ms)} ms`,
  ];
}

/**
 * Run one generator call; under `--other-libm` the drawn output comes from the simulated libm and the
 * run notes whether its rounded fingerprint matches a native run.
 */
function generate<T>(otherLibm: boolean, make: () => T): { out: T; ms: number; libmStable?: boolean } {
  const started = performance.now();
  if (!otherLibm) {
    const out = make();
    return { out, ms: performance.now() - started };
  }
  const out = withOtherLibm(1, make);
  const ms = performance.now() - started;
  return { out, ms, libmStable: roundedFingerprint(out) === roundedFingerprint(make()) };
}

function runCase(c: AuditCase, seed: string, otherLibm = false): Drawn {
  const drawn = runCaseInner(c, seed, otherLibm);
  if (drawn.run.libmStable !== undefined) {
    const caption = drawn.caption;
    const note = drawn.run.libmStable ? "other libm: same output" : "other libm: OUTPUT DIFFERS";
    drawn.caption = (row) => (row === 0 ? [...caption(row).slice(0, 2), `${caption(row)[2] ?? ""}  ${note}`] : caption(row));
  }
  return drawn;
}

function runCaseInner(c: AuditCase, seed: string, otherLibm: boolean): Drawn {
  const meta: Record<string, unknown> = { ...c.meta, seed };
  const num = (key: string, fallback: number): number => Number(meta[key] ?? fallback);
  const libm = (libmStable: boolean | undefined): { libmStable?: boolean } => (libmStable === undefined ? {} : { libmStable });
  if (c.generator === "streets") {
    const { out: net, ms, libmStable } = generate(otherLibm, () => runGenerator(STREET_NETWORK_GENERATOR, meta, c.heightAt ? { input: { heightAt: c.heightAt } } : {}) as StreetNetwork);
    const halfX = num("halfX", fieldDefault(STREET_NETWORK_SCHEMA, "halfX") ?? 200);
    const halfZ = num("halfZ", fieldDefault(STREET_NETWORK_SCHEMA, "halfZ") ?? 200);
    const sm = streetNetworkMetrics(net, { bounds: { halfX, halfZ } });
    const elevation = net.streets.some((s) => s.heights !== undefined) ? roadElevationMetrics(net.streets, c.heightAt ? { heightAt: c.heightAt } : {}) : undefined;
    const metrics: Record<string, unknown> = { mode: net.mode, streets: net.streets.length, bridges: net.bridges.length, tunnels: net.tunnels.length, ...sm, ...(elevation ? { elevation } : {}) };
    const j = judge(c.bands, metrics);
    const run: AuditRun = { generator: c.generator, preset: c.preset, profile: j.profile, seed, ms, ...libm(libmStable), metrics, verdicts: j.verdicts };
    return {
      run,
      view: viewOf(Math.max(halfX, halfZ), net.streets.map((s) => s.points)),
      rows: elevation ? 2 : 1,
      draw: (panel, row) => drawStreets(panel, net, row === 1 ? { elevation: true, ...(c.heightAt ? { heightAt: c.heightAt } : {}) } : {}),
      caption: (row) => {
        if (row === 1 && elevation) {
          return [
            `relief ${fmt(elevation.reliefM)} m  max grade ${fmt(elevation.maxGrade)}  junction step ${fmt(elevation.junctionStepMax)} m`,
            `road vs ground mean ${fmt(elevation.roadVsGroundMean)} m  max ${fmt(elevation.roadVsGroundMax)} m  bridges ${net.bridges.length}`,
          ];
        }
        return [
          `${seed} ${net.mode}  ${fmt(sm.intersectionsPerKm2)} int/km²  ${fmt(sm.roadKmPerKm2)} km/km²  ${fmt(ms)} ms`,
          `4-way ${fmt(sm.fourWayShare)}  dead ${fmt(sm.deadEndInteriorShare)}  φ ${fmt(sm.orientationOrder)}  detour ${fmt(sm.detourRatio)}`,
          `arterial ${fmt(sm.arterialShare)}  flips ${fmt(sm.levelFlipRate)}  blocks ${sm.blocks.count} med ${fmt(sm.blocks.medianHa)} ha  kept ${fmt(sm.keptLengthShare)}`,
        ];
      },
    };
  }
  if (c.generator === "city" || (c.generator === "race" && c.preset === "city")) {
    const { out: city, ms, libmStable } = generate(otherLibm, () => runGenerator(CITY_GENERATOR, meta, c.cityHalf === undefined ? {} : { input: { halfX: c.cityHalf, halfZ: c.cityHalf } }) as ResolvedCity);
    const H = city.size[0] / 2;
    if (c.generator === "race") {
      const race = city.race;
      const analysis = race
        ? analyzeCircuit(
            { centerline: race.centerline, widths: race.widths, ...(race.heights ? { heights: race.heights } : {}), grid: race.grid, seals: race.seals, sectors: race.sectors, start: race.start },
            { requestedLength: num("raceLapLength", 1200) },
          )
        : undefined;
      const metrics: Record<string, unknown> = analysis && race ? { ...analysis.metrics, generatorCorners: race.corners.length } : { noRoute: 1 };
      const j = judge(c.bands, metrics);
      const run: AuditRun = { generator: c.generator, preset: c.preset, profile: j.profile, seed, ms, ...libm(libmStable), metrics, verdicts: j.verdicts };
      return circuitDrawn(run, viewOf(H, [...city.streets.map((s) => s.points), race?.centerline ?? []]), analysis, race ? { ...race, length: race.length } : undefined, city.streets, []);
    }
    const cm = cityMetrics(cityMetricsInput(city));
    const metrics: Record<string, unknown> = { ...cm, ...(city.network ? { network: streetNetworkMetrics(city.network, { bounds: { halfX: H, halfZ: city.size[1] / 2 } }) } : {}) };
    const j = judge(c.bands, metrics);
    const run: AuditRun = { generator: c.generator, preset: c.preset, profile: j.profile, seed, ms, ...libm(libmStable), metrics, verdicts: j.verdicts };
    const maxHeight = Math.max(30, cm.heightMaxM);
    return {
      run,
      view: viewOf(H, []),
      rows: 2,
      draw: (panel, row) => drawCity(panel, city, row === 0 ? "use" : "height", maxHeight),
      caption: (row) =>
        row === 0
          ? [
              `${seed}  ${cm.buildings} bldgs  coverage ${fmt(cm.coverage)}  FAR ${fmt(cm.far)}  ${fmt(ms)} ms`,
              `pavement ${fmt(cm.pavementShare)}  land in blocks ${fmt(cm.landInBlocksShare)}  open ${fmt(cm.openBlockShare)}  kept ${fmt(cm.keptLengthShare)}`,
              `templates ${cm.uniqueTemplates} (min/class ${fmt(cm.minTemplatesPerClass)})  landmarks ${cm.landmarks}  on-road ${cm.buildingsOnRoad}`,
            ]
          : [`height ρ(dist) ${fmt(cm.heightDistanceRho)}  floors p50/p90/max ${fmt(cm.floorsP50)}/${fmt(cm.floorsP90)}/${fmt(cm.floorsMax)}  top ${fmt(cm.heightMaxM)} m`],
    };
  }
  // circuit / street race on the race-circuit generator
  const { out: race, ms, libmStable } = generate(otherLibm, () => runGenerator(RACE_CIRCUIT_GENERATOR, meta) as RaceCircuit);
  const halfX = num("halfX", fieldDefault(RACE_CIRCUIT_SCHEMA, "halfX") ?? 200);
  const halfZ = num("halfZ", fieldDefault(RACE_CIRCUIT_SCHEMA, "halfZ") ?? 200);
  const requested = num("lapLength", fieldDefault(RACE_CIRCUIT_SCHEMA, "lapLength") ?? 2400);
  const pits = race.network.mode === "circuit" ? race.network.streets.filter((s) => s.level === "lane").map((s) => s.points) : [];
  const analysis = race.route ? analyzeCircuit(circuitInput(race.route, pits), { requestedLength: requested }) : undefined;
  const metrics: Record<string, unknown> = analysis && race.route ? { ...analysis.metrics, requestedLengthM: requested, generatorCorners: race.route.corners.length } : { noRoute: 1 };
  const j = judge(c.bands, metrics);
  const run: AuditRun = { generator: c.generator, preset: c.preset, profile: j.profile, seed, ms, ...libm(libmStable), metrics, verdicts: j.verdicts };
  return circuitDrawn(run, viewOf(Math.max(halfX, halfZ), [...race.network.streets.map((s) => s.points), race.route?.centerline ?? []]), analysis, race.route ?? undefined, race.network.streets, pits);
}

function circuitDrawn(
  run: AuditRun,
  view: View,
  analysis: CircuitAnalysis | undefined,
  race: DrawRace | undefined,
  streets: Parameters<typeof drawStreets>[1]["streets"],
  pits: readonly (readonly PlanPoint[])[],
): Drawn {
  const elevated = analysis?.heights !== undefined;
  return {
    run,
    view,
    rows: elevated ? 3 : 2,
    draw: (panel, row) => {
      if (analysis === undefined || race === undefined) {
        drawStreets(panel, { streets }, {});
        return;
      }
      drawCircuit(panel, analysis, race, row === 0 ? "detail" : row === 1 ? "speed" : "elevation", { streets, pits });
    },
    caption: (row) => {
      if (analysis === undefined) return [`${run.seed}: NO LAP FOUND`];
      const m = analysis.metrics;
      if (row === 0) return circuitCaption(run.seed, run.ms, m);
      if (row === 1) {
        return [
          `braking zones ${m.brakingZones} (heavy ${m.heavyBrakingZones})  full throttle ${fmt(m.fullThrottleShare)}`,
          `min ${fmt(m.minKph)} / max ${fmt(m.maxKph)} kph  chicanes ${m.chicanes}  seals ${m.seals}  pits ${m.pitsConnected}/${m.pits}`,
        ];
      }
      return [`elevation range ${fmt(m.elevationRangeM)} m  climb ${fmt(m.climbM)} m  max grade ${fmt(m.maxGrade)}`];
    },
  };
}

const PANEL = 440;
const GAP = 12;
const TOP = 46;
const CELL = PANEL_HEADER + PANEL + PANEL_FOOTER;

function sheetFor(c: AuditCase, drawn: readonly Drawn[]): string {
  const rows = Math.max(...drawn.map((d) => d.rows));
  const grid: Panel[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: Panel[] = [];
    drawn.forEach((d, col) => {
      const panel = new Panel(GAP + col * (PANEL + GAP), TOP + row * CELL + PANEL_HEADER, PANEL, d.view.minX, d.view.minZ, d.view.span);
      if (row < d.rows) {
        panel.frame();
        d.draw(panel, row);
        panel.caption(d.caption(row), 10);
        panel.scaleBar();
      }
      line.push(panel);
    });
    grid.push(line);
  }
  const profile = drawn[0]?.run.profile ?? "none";
  return contactSheet(`gen-audit: ${c.generator} / ${c.preset}`, `profile "${profile}" · ${drawn.length} seeds · columns are seeds; rows: ${c.generator === "city" ? "use, height" : c.generator === "streets" ? "levels (+ road height)" : "corners & dressing, sim speed (+ elevation)"}`, grid);
}

/** Median of a numeric metric over runs (NaN-safe). */
function median(values: readonly unknown[]): number {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return Number.NaN;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 1 ? nums[mid]! : (nums[mid - 1]! + nums[mid]!) / 2;
}

const KEY_METRICS: Record<AuditGenerator, string[]> = {
  streets: ["intersectionsPerKm2", "roadKmPerKm2", "fourWayShare", "deadEndInteriorShare", "orientationOrder", "detourRatio", "edgeCircuity", "arterialShare", "levelFlipRate", "blocks.medianHa", "landInBlocksShare", "keptLengthShare", "elevation.maxGrade", "elevation.junctionStepMax", "elevation.roadVsGroundMean", "bridges"],
  city: ["buildings", "coverage", "far", "pavementShare", "landInBlocksShare", "openBlockShare", "uniqueTemplates", "minTemplatesPerClass", "landmarks", "heightDistanceRho", "floorsP90", "buildingsOnRoad", "keptLengthShare", "network.intersectionsPerKm2", "network.orientationOrder"],
  circuit: ["lengthM", "lengthErrorPct", "cornersPerKm", "rightAngleShare", "radiusP10", "radiusP50", "radiusP90", "longestStraightM", "straightsOver400", "overtakingSpots", "lapTimeS", "avgKph", "elevationRangeM", "maxGrade", "gridInCorner", "pitsConnected", "sealsBlockingPit", "sectorBoundariesInCorners"],
  race: ["lengthM", "lengthErrorPct", "cornersPerKm", "rightAngleShare", "radiusP10", "radiusP50", "radiusP90", "longestStraightM", "straightsOver400", "overtakingSpots", "lapTimeS", "avgKph", "gridInCorner", "seals", "sealsPerKm"],
};

function pick(metrics: unknown, path: string): unknown {
  let cur: unknown = metrics;
  for (const key of path.split(".")) cur = cur !== null && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined;
  return cur;
}

export function reportMarkdown(cases: readonly { c: AuditCase; runs: AuditRun[] }[], header: string): string {
  const lines: string[] = [header, ""];
  const libm = cases.some(({ runs }) => runs.some((r) => r.libmStable !== undefined));
  lines.push(`| generator / preset | profile | bands in | ms (median) |${libm ? " other libm |" : ""}`, `| --- | --- | --- | --- |${libm ? " --- |" : ""}`);
  for (const { c, runs } of cases) {
    const verdicts = runs.flatMap((r) => r.verdicts);
    const inBand = verdicts.filter((v) => v.verdict === "in").length;
    const differs = runs.filter((r) => r.libmStable === false).map((r) => r.seed);
    const libmCell = libm ? ` ${differs.length === 0 ? "same" : `DIFFERS (${differs.join(", ")})`} |` : "";
    lines.push(`| ${c.generator} / ${c.preset} | ${runs[0]?.profile ?? "–"} | ${inBand}/${verdicts.length} | ${fmt(median(runs.map((r) => r.ms)))} |${libmCell}`);
  }
  for (const { c, runs } of cases) {
    lines.push("", `## ${c.generator} / ${c.preset}`, "", `Profile \`${runs[0]?.profile ?? "none"}\`; sheet \`${c.generator}-${c.preset}.png\`.`, "");
    if (runs[0] !== undefined && runs[0].verdicts.length > 0) {
      lines.push(`| metric | band | kind | ${runs.map((r) => r.seed).join(" | ")} | in band |`, `| --- | --- | --- | ${runs.map(() => "---").join(" | ")} | --- |`);
      runs[0].verdicts.forEach((v, i) => {
        const cells = runs.map((r) => {
          const verdict = r.verdicts[i]!;
          const mark = verdict.verdict === "in" ? "" : verdict.verdict === "missing" ? " ?" : verdict.verdict === "low" ? " ▼" : " ▲";
          return `${fmt(verdict.value ?? Number.NaN)}${mark}`;
        });
        lines.push(`| ${v.metric} | ${v.band} | ${v.kind} | ${cells.join(" | ")} | ${runs.filter((r) => r.verdicts[i]!.verdict === "in").length}/${runs.length} |`);
      });
      lines.push("");
    }
    lines.push(`| key metric | ${runs.map((r) => r.seed).join(" | ")} | median |`, `| --- | ${runs.map(() => "---").join(" | ")} | --- |`);
    for (const key of KEY_METRICS[c.generator]) {
      const values = runs.map((r) => pick(r.metrics, key));
      if (values.every((v) => v === undefined)) continue;
      lines.push(`| ${key} | ${values.map(fmt).join(" | ")} | ${fmt(median(values))} |`);
    }
  }
  lines.push("", "▼ below band, ▲ above band, ? metric missing (no lap, or not measured). Bands and citations: packages/core/src/generator/referenceBands.ts.");
  return lines.join("\n") + "\n";
}

async function rasterize(svgPaths: readonly string[]): Promise<string[]> {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: findChromeExecutable(), args: ["--no-sandbox"] });
  const written: string[] = [];
  try {
    const page = await browser.newPage();
    for (const path of svgPaths) {
      const svg = await Bun.file(path).text();
      const size = /width="(\d+)" height="(\d+)"/.exec(svg);
      await page.setViewportSize({ width: Number(size?.[1] ?? 1200), height: Number(size?.[2] ?? 800) });
      await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
      const png = path.replace(/\.svg$/, ".png");
      await page.screenshot({ path: png });
      written.push(png);
    }
  } finally {
    await browser.close();
  }
  return written;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  if (printHelpIfAsked("gen-audit", USAGE, argv)) return 0;
  const args = parseAuditArgs(argv);
  if (typeof args === "string") {
    console.error(`gen-audit: ${args}`);
    return 1;
  }
  const cases = auditCases(args);
  if (cases.length === 0) {
    console.error(`gen-audit: no preset matches ${args.presets.join(", ")}`);
    return 1;
  }
  mkdirSync(args.out, { recursive: true });
  const started = performance.now();
  const seeds = Array.from({ length: args.seeds }, (_, i) => `s${i + 1}`);
  const results: { c: AuditCase; runs: AuditRun[] }[] = [];
  const svgs: string[] = [];
  for (const c of cases) {
    const drawn = seeds.map((seed) => runCase(c, seed, args.otherLibm));
    const svgPath = join(args.out, `${c.generator}-${c.preset}.svg`);
    writeFileSync(svgPath, sheetFor(c, drawn));
    svgs.push(svgPath);
    results.push({ c, runs: drawn.map((d) => d.run) });
    const verdicts = drawn.flatMap((d) => d.run.verdicts);
    const unstable = drawn.filter((d) => d.run.libmStable === false).map((d) => d.run.seed);
    const libmNote = args.otherLibm ? (unstable.length === 0 ? "  other libm: same output" : `  other libm: OUTPUT DIFFERS for ${unstable.join(", ")}`) : "";
    console.log(`gen-audit: ${c.generator}/${c.preset}  ${verdicts.filter((v) => v.verdict === "in").length}/${verdicts.length} bands in  (median ${fmt(median(drawn.map((d) => d.run.ms)))} ms)${libmNote}`);
  }
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    // not a checkout; leave it unknown
  }
  const header = `# gen-audit (${commit}, ${args.seeds} seeds)\n\nEach preset ran over seeds ${seeds.join(", ")}; metrics from packages/core (roads/streetMetrics, roads/circuitMetrics, roads/lapSim, city/cityMetrics).`;
  writeFileSync(join(args.out, "report.md"), reportMarkdown(results, header));
  writeFileSync(join(args.out, "metrics.json"), `${JSON.stringify(tidy({ commit, seeds, runs: results.flatMap((r) => r.runs) }), null, 1)}\n`);
  let pngs: string[] = [];
  if (args.png) {
    try {
      pngs = await rasterize(svgs);
    } catch (error) {
      console.error(`gen-audit: PNG skipped (${error instanceof Error ? error.message.split("\n")[0] : String(error)}); the SVGs are written`);
    }
  }
  const rel = relative(process.cwd(), args.out);
  const shown = rel === "" ? "." : rel.startsWith("..") ? args.out : rel;
  console.log(`gen-audit: wrote ${svgs.length} sheet(s)${pngs.length > 0 ? " (svg + png)" : " (svg)"}, metrics.json and report.md to ${shown} in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  return 0;
}

if (import.meta.main) process.exit(await main());
