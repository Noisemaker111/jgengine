// `bun run jgengine plants <import|fit|write|report>`: build the plant species library from public
// tables. Raw downloads live in the shared asset store; only the reference table and the species
// records are committed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CrownForm, PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import { siteIndexHeightM, type SiteIndexCurve } from "../../packages/core/src/plants/validation/heightAgeCurves";
import { crownArchitectureTarget } from "../../packages/core/src/plants/validation/crownArchitecture";
import { growthCurveAt, standDbhAtCm, standHeightAtM, type SpeciesReference } from "../../packages/core/src/plants/species/speciesReference";
import { SPECIES_REFERENCE } from "../../packages/core/src/plants/species/speciesReferenceTable";
import { parseCsv, csvNumber } from "./csv";
import { parseBechtoldCrownWidth, parseCarmeanCurves, parseEkCrownWidth, type CarmeanCurveRow } from "./fvsSource";
import { BAAD, FIA_SPECIES, FVS_LS_CROWN, FVS_LS_HEIGHT, TALLO, fiaSiteTrees, readRaw } from "./rawSources";
import { siteTreesOf, standReference } from "./siteTrees";
import type { CmaEsState } from "./cmaEs";
import { FIT_PARAMETERS, fitSpecies, type Evaluate, type FitParameter } from "./speciesFit";
import { buildSpeciesRecord, speciesRecordSource, type FittedParameters, type ImportedValues } from "./speciesRecord";
import { scoreTrial, type FitTarget, type TrialScore } from "./speciesScore";
import { SHADE_TOLERANCE, SPECIES_TRAITS, type SpeciesTraits } from "./speciesTraits";
import { TRIAL_AGES, runHabitTrial, runTrial, type Trial } from "./speciesTrial";
import { talloCrownWidthClasses } from "./tallo";
import { buildHabitRecord, habitFitParameters, HABIT_TRAITS, startingHabitCarbon, startingHabitGrowth, habitReferenceTableSource, importHabitReference, scoreHabitTrial, type HabitTraits } from "./habitSpecies";
import { HABIT_REFERENCE } from "../../packages/core/src/plants/species/habitReferenceTable";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PLANTS = join(ROOT, "packages/core/src/plants");
const FIT_DIR = join(ROOT, ".scratch/species-fit");
// A fresh fit searches widely; one resuming a saved fit searches near it, since with ~20 parameters a
// wide step lands every trial far from a good start and the search drifts away from it.
const FRESH_SIGMA = "0.12";
const RESUMED_SIGMA = "0.04";
const INCH_CM = 2.54;
const FOOT_M = 0.3048;

const HELP = `bun run jgengine plants <verb> [species ids]

  import              download (once) and read FIA, FVS, Tallo and BAAD; write species/speciesReferenceTable.ts
  fit <id...|--all>   fit growth and carbon parameters by CMA-ES; the best and the search so far in .scratch/species-fit/<id>.json
  write <id...|--all> write species/data records from traits, imported values and the fit
  report <id...>      grow each record and print it against its reference

fit flags: --generations <n> (40, more on top of a saved search) --lambda <n> (16) --workers <n> (at most 4) --seeds a,b
  --sigma <x>         step size (0.12 fresh, 0.04 around a saved best with no saved search)
  --until-pass        stop a tree's fit once it is inside the fit's height, DBH, Tallo, crown-shape and crown-architecture limits;
                      exit 1 when a fit runs its generations out still outside them

A fit takes minutes per species (one trial grows the tree for 100 years, 3-8 s; a generation is --lambda
trials over the workers), so run it as \`bun run background start -- bun run jgengine plants fit <id...>\`
and read its progress with \`bun run background status <id>\`: each generation prints its number, the
budget, the best score, its parts, and the time elapsed and left. Fitting the same species again carries
its saved search on; delete .scratch/species-fit/<id>.json to start over.`;

const scientificKey = (traits: SpeciesTraits): string => traits.scientific.split(" ").slice(0, 2).join(" ");
const camel = (id: string): string => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

function traitsOf(id: string): SpeciesTraits {
  const traits = SPECIES_TRAITS.find((t) => t.id === id);
  if (traits === undefined) throw new Error(`no traits for ${id} in scripts/species-import/speciesTraits.ts`);
  return traits;
}

function yearsToBreastHeight(carmean: SiteIndexCurve, siteIndexFt: number): number {
  for (let age = 1; age < 40; age += 1) if (siteIndexHeightM(carmean, siteIndexFt, age) >= 4.5 * FOOT_M) return age;
  return 40;
}

function carmeanOf(traits: SpeciesTraits, curves: readonly CarmeanCurveRow[]): SiteIndexCurve | undefined {
  if (traits.carmeanCurve === undefined) return undefined;
  const row = curves.find((c) => c.curve === traits.carmeanCurve);
  if (row === undefined) throw new Error(`no Carmean curve ${traits.carmeanCurve}`);
  return { speciesId: traits.id, curve: row.curve, region: row.label.split(",").slice(1).join(",").trim().toLowerCase(), b1: row.b1, b2: row.b2, b3: row.b3, b4: row.b4, b5: row.b5, breastHeightFt: row.breastHeightFt };
}

function runImport(): void {
  const curves = parseCarmeanCurves(readRaw(ROOT, FVS_LS_HEIGHT));
  const crown = readRaw(ROOT, FVS_LS_CROWN);
  const tallo = parseCsv(readRaw(ROOT, TALLO));
  const states = new Map<string, Record<string, string>[]>();
  const rowsOf = (state: string): Record<string, string>[] => {
    const known = states.get(state);
    if (known !== undefined) return known;
    const rows = parseCsv(readRaw(ROOT, fiaSiteTrees(state)));
    states.set(state, rows);
    return rows;
  };
  const references: SpeciesReference[] = [];
  for (const traits of SPECIES_TRAITS) {
    const carmean = carmeanOf(traits, curves);
    const trees = traits.states.flatMap((state) => siteTreesOf(rowsOf(state), traits.fiaCode));
    const probe = standReference(trees, 0, traits.siteIndexFt);
    const toBreastHeight = carmean === undefined ? (traits.yearsToBreastHeight ?? 10) : yearsToBreastHeight(carmean, probe.siteIndexFt);
    const stand = standReference(trees, toBreastHeight, traits.siteIndexFt);
    const widths = talloCrownWidthClasses(tallo, scientificKey(traits));
    const ek = parseEkCrownWidth(crown, traits.fiaCode);
    const bechtold = parseBechtoldCrownWidth(crown, traits.fiaCode);
    references.push({
      speciesId: traits.id,
      ...(carmean === undefined ? {} : { carmean }),
      siteIndexFt: stand.siteIndexFt,
      yearsToBreastHeight: toBreastHeight,
      siteTrees: { count: stand.trees, youngestYears: stand.youngestYears, oldestYears: stand.oldestYears },
      standHeightM: stand.height,
      standDbhCm: stand.dbh,
      dbhByHeight: { a: Number(stand.dbhByHeight.a.toPrecision(5)), b: Number(stand.dbhByHeight.b.toPrecision(5)) },
      crownWidth: { trees: widths.trees, classes: widths.classes },
      ...(ek === undefined ? {} : { openCrownWidth: ek }),
      ...(bechtold === undefined ? {} : { forestCrownWidth: bechtold }),
    });
    const at = (curve: SpeciesReference["standHeightM"]): string => TRIAL_AGES.map((age) => growthCurveAt(curve, age).toFixed(1)).join("/");
    console.log(`${traits.id}: SI ${stand.siteIndexFt} ft, ${stand.trees} site trees, H ${at(stand.height)} m, DBH ${at(stand.dbh)} cm, Tallo ${widths.trees} trees${ek === undefined ? ", no Ek" : ""}`);
  }
  writeFileSync(join(PLANTS, "species/speciesReferenceTable.ts"), referenceTableSource(references));
  const habits = HABIT_TRAITS.map((traits) => importHabitReference(ROOT, traits));
  for (const habit of habits) console.log(`${habit.speciesId}: PLANTS ${habit.heightAt20M} m at 20 y, ${habit.matureHeightM} m mature${habit.multiStem ? ", multi-stem" : ""}`);
  writeFileSync(join(PLANTS, "species/habitReferenceTable.ts"), habitReferenceTableSource(habits));
}

const habitOf = (id: string): HabitTraits | undefined => HABIT_TRAITS.find((traits) => traits.id === id);

function habitReferenceOf(id: string) {
  const reference = HABIT_REFERENCE[id];
  if (reference === undefined) throw new Error(`no PLANTS reference for ${id}: run bun run jgengine plants import`);
  return reference;
}

async function startingHabitRecord(traits: HabitTraits): Promise<PlantSpecies> {
  const prior = await loadRecord(traits.prior);
  if (prior === undefined) throw new Error(`prior ${traits.prior} has no record`);
  const own = await loadRecord(traits.id);
  const source = own ?? prior;
  const growth = own === undefined ? startingHabitGrowth(traits, prior.growth) : own.growth;
  const carbon = own === undefined ? startingHabitCarbon(traits, prior.carbon) : own.carbon;
  return buildHabitRecord(traits, growth, carbon, { score: 0, against: "" }, prior, (own?.version ?? 0) + 1);
}

const HABIT_AGAINST = "usda-plants";

const num = (x: number): string => String(Number(x.toPrecision(5)));

function referenceTableSource(references: readonly SpeciesReference[]): string {
  const entry = (r: SpeciesReference): string => {
    const c = r.carmean;
    const lines = [
      `  "${r.speciesId}": {`,
      `    speciesId: "${r.speciesId}",`,
      ...(c === undefined ? [] : [`    carmean: { speciesId: "${c.speciesId}", curve: ${c.curve}, region: ${JSON.stringify(c.region)}, b1: ${c.b1}, b2: ${c.b2}, b3: ${c.b3}, b4: ${c.b4}, b5: ${c.b5}, breastHeightFt: ${c.breastHeightFt} },`]),
      `    siteIndexFt: ${r.siteIndexFt},`,
      `    yearsToBreastHeight: ${r.yearsToBreastHeight},`,
      `    siteTrees: { count: ${r.siteTrees.count}, youngestYears: ${r.siteTrees.youngestYears}, oldestYears: ${r.siteTrees.oldestYears} },`,
      `    standHeightM: { a: ${num(r.standHeightM.a)}, k: ${num(r.standHeightM.k)}, p: ${num(r.standHeightM.p)} },`,
      `    standDbhCm: { a: ${num(r.standDbhCm.a)}, k: ${num(r.standDbhCm.k)}, p: ${num(r.standDbhCm.p)} },`,
      `    dbhByHeight: { a: ${r.dbhByHeight.a}, b: ${r.dbhByHeight.b} },`,
      `    crownWidth: {`,
      `      trees: ${r.crownWidth.trees},`,
      `      classes: [`,
      ...r.crownWidth.classes.map((k) => `        { dbhCm: ${k.dbhCm}, p10M: ${k.p10M}, p50M: ${k.p50M}, p90M: ${k.p90M}${k.genus === true ? ", genus: true" : ""} },`),
      `      ],`,
      `    },`,
      ...(r.openCrownWidth === undefined ? [] : [`    openCrownWidth: { a: ${r.openCrownWidth.a}, b: ${r.openCrownWidth.b}, c: ${r.openCrownWidth.c} },`]),
      ...(r.forestCrownWidth === undefined ? [] : [`    forestCrownWidth: { a: ${r.forestCrownWidth.a}, b: ${r.forestCrownWidth.b}, cr: ${r.forestCrownWidth.cr}, hi: ${r.forestCrownWidth.hi} },`]),
      `  },`,
    ];
    return lines.join("\n");
  };
  return `import type { SpeciesReference } from "./speciesReference";

/**
 * Written by \`bun run jgengine plants import\` from USDA FIA site trees and FVS (US public domain),
 * Tallo (Jucker et al. 2022, CC BY 4.0) and BAAD (Falster et al. 2015, CC0). Do not edit by hand.
 */
export const SPECIES_REFERENCE: Readonly<Record<string, SpeciesReference>> = {
${references.map(entry).join("\n")}
};
`;
}

function importedValues(traits: SpeciesTraits, reference: SpeciesReference): ImportedValues {
  const species = parseCsv(readRaw(ROOT, FIA_SPECIES)).find((row) => csvNumber(row["SPCD"]) === traits.fiaCode);
  const gravity = csvNumber(species?.["WOOD_SPGR_GREENVOL_DRYWT"]);
  const moisture = csvNumber(species?.["MC_PCT_GREEN_WOOD"]);
  const slas: number[] = [];
  for (const row of parseCsv(readRaw(ROOT, BAAD))) {
    if (row["species"] !== scientificKey(traits)) continue;
    const area = csvNumber(row["a.lf"]);
    const mass = csvNumber(row["m.lf"]);
    // Saplings carry thin shade leaves; a canopy tree's leaves are thicker, so only plants of 5 m or more count.
    const height = csvNumber(row["h.t"]);
    if (area !== undefined && mass !== undefined && height !== undefined && area > 0 && mass > 0 && height >= 5) slas.push(area / mass);
  }
  slas.sort((a, b) => a - b);
  const ek = reference.openCrownWidth;
  const dbhIn = traits.limits.maxDbhCm / INCH_CM;
  const ekRadius = ek === undefined ? undefined : (0.5 * (ek.a + ek.b * dbhIn ** ek.c) * FOOT_M);
  const tallo = reference.crownWidth.classes.at(-1);
  return {
    ...(gravity === undefined ? {} : { densityKgM3: Math.round(gravity * 1000) }),
    ...(moisture === undefined ? {} : { greenFactor: Math.round((1 + moisture / 100) * 100) / 100 }),
    ...(slas.length >= 10 ? { sla: Math.round((slas[slas.length >> 1] ?? 0) * 10) / 10 } : {}),
    maxCrownRadiusM: Math.round(ekRadius ?? (tallo === undefined ? 8 : 0.5 * tallo.p90M * 1.3)),
    maxCrownRadiusSource: ekRadius === undefined ? "tallo-2022" : "ek-1974",
  };
}

function fitTarget(traits: SpeciesTraits, record: PlantSpecies, reference: SpeciesReference): FitTarget {
  const architecture = crownArchitectureTarget({ architecture: { ...record.architecture, crownForm: traits.form }, tolerance: { ...record.tolerance, shade: SHADE_TOLERANCE[traits.shade] }, leaf: record.leaf });
  return { reference, form: traits.form, architecture, maxCrownRadiusM: record.limits.maxCrownRadiusM, shadeTolerant: SHADE_TOLERANCE[traits.shade] >= 0.7 };
}

async function loadRecord(id: string): Promise<PlantSpecies | undefined> {
  const path = join(PLANTS, "species/data", `${camel(id)}.ts`);
  if (!existsSync(path)) return undefined;
  const module: Record<string, unknown> = await import(path);
  return Object.values(module).find((value): value is PlantSpecies => typeof value === "object" && value !== null && "id" in value && value.id === id);
}

function referenceOf(id: string): SpeciesReference {
  const reference = SPECIES_REFERENCE[id];
  if (reference === undefined) throw new Error(`no reference for ${id}: run bun run jgengine plants import`);
  return reference;
}

async function startingRecord(traits: SpeciesTraits): Promise<PlantSpecies> {
  const prior = await loadRecord(traits.prior);
  if (prior === undefined) throw new Error(`prior ${traits.prior} has no record`);
  const own = await loadRecord(traits.id);
  const fitted: FittedParameters = { growth: (own ?? prior).growth, carbon: (own ?? prior).carbon, score: 0, against: "" };
  return buildSpeciesRecord(traits, importedValues(traits, referenceOf(traits.id)), fitted, prior, (own?.version ?? 0) + 1);
}

const HABIT: Readonly<Record<CrownForm, string>> = {
  excurrent: "Excurrent: the leader keeps its lead into a conical crown.",
  decurrent: "Decurrent: laterals overtake the leader into a rounded crown with age.",
  columnar: "Columnar: a narrow crown of near-even width from base to top.",
  weeping: "Weeping: a conical crown whose fine shoots hang below the horizontal.",
};

function flag(argv: readonly string[], name: string, fallback: string): string {
  const at = argv.indexOf(name);
  return at >= 0 ? (argv[at + 1] ?? fallback) : fallback;
}

/** How one species' trials are grown: the seeds, whether a shaded sapling runs too, and the habit trial for shrubs, palms and ferns. */
interface TrialSetup {
  seeds: readonly string[];
  shade: boolean;
  habit: boolean;
}

/**
 * `size` workers that grow trials, shared by every species of one fit run: each worker loads the
 * growth model once, not once per species.
 */
export function workerPool(size: number): { evaluator: (setup: TrialSetup) => Evaluate; close: () => void } {
  const workers = Array.from({ length: size }, () => new Worker(new URL("./fitWorker.ts", import.meta.url).href));
  const idle = [...workers];
  const queue: (() => void)[] = [];
  const waiting = new Map<number, (trial: Trial | null) => void>();
  let next = 0;
  for (const worker of workers) {
    worker.onmessage = (event: MessageEvent<{ id: number; trial?: Trial; error?: string }>) => {
      if (event.data.error !== undefined) console.error(event.data.error);
      waiting.get(event.data.id)?.(event.data.trial ?? null);
      waiting.delete(event.data.id);
      idle.push(worker);
      queue.shift()?.();
    };
  }
  const evaluator =
    ({ seeds, shade, habit }: TrialSetup): Evaluate =>
    (species) =>
      new Promise((resolve) => {
        const go = (): void => {
          const worker = idle.pop();
          if (worker === undefined) {
            queue.push(go);
            return;
          }
          const id = next++;
          waiting.set(id, resolve);
          worker.postMessage({ id, species, seeds, shade, habit });
        };
        go();
      });
  return { evaluator, close: () => workers.forEach((w) => w.terminate()) };
}

/**
 * `.scratch/species-fit/<id>.json`: the best species so far, and the search as it stood after the last
 * generation, so the next `plants fit <id>` carries that search on instead of starting a new one
 * around the best point. `plants write <id>` reads the species from it.
 */
interface FitFile {
  score: number;
  parts: Record<string, number>;
  against: string;
  species: PlantSpecies;
  search?: CmaEsState;
  /** Generations the saved search has run, over every run of this fit. */
  generation?: number;
  /** Whether the last run with `--until-pass` ended inside the pass limits. */
  passed?: boolean;
}

const AGAINST = "fia, carmean-1989, tallo-2022, ek-1974";

/** The score parts `--until-pass` holds at zero: a species inside every one passes the library's size and crown checks. */
const PASS_PARTS = ["limits", "tallo", "shape", "architecture", "dead"] as const;

function insidePassLimits(parts: Record<string, number>): boolean {
  return PASS_PARTS.every((part) => (parts[part] ?? (part === "architecture" || part === "dead" ? 0 : 1)) === 0);
}

/** `limits 3.8, tallo 59.8`: the pass parts a best is still outside, for the log. */
function missedParts(parts: Record<string, number>): string {
  return PASS_PARTS.filter((part) => (parts[part] ?? 0) !== 0)
    .map((part) => `${part} ${(parts[part] ?? 0).toFixed(1)}`)
    .join(", ");
}

const clock = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
};

function readFitFile(path: string): FitFile | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as FitFile) : undefined;
}

/** One species' starting record, the parameters its fit searches, how its trials are grown and scored. */
interface FitSetup {
  start: PlantSpecies;
  parameters: readonly FitParameter[];
  trial: TrialSetup;
  score: (trial: Trial) => TrialScore;
  against: string;
}

async function fitSetup(id: string, resumed: FitFile | undefined, seeds: readonly string[]): Promise<FitSetup> {
  const habit = habitOf(id);
  if (habit !== undefined) {
    const reference = habitReferenceOf(id);
    return {
      start: resumed?.species ?? (await startingHabitRecord(habit)),
      parameters: habitFitParameters(habit),
      trial: { seeds, shade: false, habit: true },
      score: (trial) => scoreHabitTrial(reference, habit, trial),
      against: HABIT_AGAINST,
    };
  }
  const traits = traitsOf(id);
  // A fit saved before a field existed resumes with that field's neutral value.
  const resumedStart = resumed === undefined ? await startingRecord(traits) : { ...resumed.species, carbon: { ...resumed.species.carbon, hydraulicHeightShare: resumed.species.carbon.hydraulicHeightShare ?? 1 } };
  // The trial reads the crown form to grow the seeded individuals the guardrails check.
  const start: PlantSpecies = { ...resumedStart, architecture: { ...resumedStart.architecture, crownForm: traits.form } };
  const target = fitTarget(traits, start, referenceOf(id));
  return { start, parameters: FIT_PARAMETERS, trial: { seeds, shade: target.shadeTolerant, habit: false }, score: (trial) => scoreTrial(target, trial), against: AGAINST };
}

/** What one species' fit ended as, for the run's summary and exit code. */
interface FitOutcome {
  id: string;
  score: number;
  generation: number;
  passed: boolean;
  missed: string;
}

/**
 * Fit each species in turn, logging one line per generation that says where the run is and how long
 * is left, and one line per species that says how it ended and where its file is. Returns 1 when a
 * `--until-pass` fit ran out of generations outside the limits, so a caller never reads a timed-out
 * search as a pass.
 */
async function runFit(ids: readonly string[], argv: readonly string[]): Promise<number> {
  mkdirSync(FIT_DIR, { recursive: true });
  const seeds = flag(argv, "--seeds", "a,b").split(",");
  // The PC is shared: never more than 4 workers, whatever the flag says (AGENTS.md).
  const workers = Math.max(1, Math.min(4, Number(flag(argv, "--workers", "4")), availableParallelism() - 2));
  const generations = Number(flag(argv, "--generations", "40"));
  const lambda = Number(flag(argv, "--lambda", "16"));
  const untilPass = argv.includes("--until-pass");
  const pool = workerPool(workers);
  const outcomes: FitOutcome[] = [];
  const relative = (path: string): string => path.slice(ROOT.length).replaceAll("\\", "/");
  console.log(`plants fit: ${ids.length} species, ${generations} generation(s) x ${lambda} trial(s) x ${seeds.length} seed(s) each, ${workers} worker(s)${untilPass ? ", stopping each at the pass limits" : ""}`);
  try {
    for (const [index, id] of ids.entries()) {
      const out = join(FIT_DIR, `${id}.json`);
      const resumed = readFitFile(out);
      const setup = await fitSetup(id, resumed, seeds);
      const { start, parameters } = setup;
      const from = resumed === undefined ? `fresh from record v${start.version}` : resumed.search === undefined ? `from the best in ${relative(out)} (score ${resumed.score.toFixed(2)}, no saved search: a new one starts around it)` : `carrying on the search in ${relative(out)} (generation ${resumed.search.generation}, score ${resumed.score.toFixed(2)})`;
      console.log(`${id} (${index + 1}/${ids.length}): ${parameters.length} parameters, ${from}`);
      const file: FitFile = { score: resumed?.score ?? Number.POSITIVE_INFINITY, parts: resumed?.parts ?? {}, against: setup.against, species: start, ...(resumed?.search === undefined ? {} : { search: resumed.search, generation: resumed.search.generation }) };
      const save = (): void => writeFileSync(out, JSON.stringify(file, null, 1));
      const started = Date.now();
      let done = 0;
      // Shrubs, palms and ferns have no pass limits: their fit runs its generations out.
      const canPass = untilPass && setup.trial.habit === false;
      const result = await fitSpecies(start, setup.score, pool.evaluator(setup.trial), {
        generations,
        lambda,
        sigma: Number(flag(argv, "--sigma", resumed === undefined ? FRESH_SIGMA : RESUMED_SIGMA)),
        seed: 1,
        parameters,
        resume: resumed?.search,
        ...(canPass ? { until: (best: { parts: Record<string, number> }) => insidePassLimits(best.parts) } : {}),
        onBest: (best) => {
          Object.assign(file, { score: best.score, parts: best.parts, species: best.species });
          save();
        },
        onGeneration: (report) => {
          done += 1;
          Object.assign(file, { search: report.search, generation: report.generation, passed: report.passed });
          save();
          const left = report.passed ? "" : `, ~${clock(((Date.now() - started) / done) * (report.last - report.generation))} left`;
          console.log(`${id} ${report.line}  (${clock(Date.now() - started)} elapsed${left})`);
        },
      });
      file.passed = result.passed;
      save();
      const outcome: FitOutcome = { id, score: result.score, generation: result.generation, passed: result.passed, missed: missedParts(result.parts) };
      outcomes.push(outcome);
      const write = `\`bun run jgengine plants write ${id}\` writes the record`;
      if (!canPass) console.log(`${id}: done, best score ${result.score.toFixed(2)} at generation ${result.generation}; ${relative(out)} holds it; ${write}`);
      else if (result.passed) console.log(`${id}: passed at generation ${result.generation}, score ${result.score.toFixed(2)}; ${relative(out)} holds it; ${write}`);
      else console.log(`${id}: NOT passed after ${file.generation ?? 0} generations, score ${result.score.toFixed(2)}, still outside: ${outcome.missed}; ${relative(out)} holds the search, and the same command runs ${generations} more generations from it`);
    }
  } finally {
    pool.close();
  }
  const failed = outcomes.filter((outcome) => !outcome.passed);
  if (ids.length > 1 || failed.length > 0) {
    console.log(`plants fit: ${outcomes.length - failed.length} of ${outcomes.length} species ${untilPass ? "passed" : "fitted"}${failed.length === 0 ? "" : `; not passed: ${failed.map((outcome) => `${outcome.id} (${outcome.missed})`).join(", ")}`}`);
  }
  return failed.length === 0 ? 0 : 1;
}

function wrap(text: string, width: number): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line.length + word.length + 1 > width && line.length > 0) {
      lines.push(line);
      line = word;
    } else line = line.length === 0 ? word : `${line} ${word}`;
  }
  if (line.length > 0) lines.push(line);
  return lines.join("\n * ");
}

async function writeHabit(traits: HabitTraits): Promise<void> {
  const { id } = traits;
  const fit = join(FIT_DIR, `${id}.json`);
  const own = await loadRecord(id);
  const prior = await loadRecord(traits.prior);
  if (prior === undefined) throw new Error(`no prior record for ${id}`);
  const fitted: FitFile | undefined = existsSync(fit) ? JSON.parse(readFileSync(fit, "utf8")) : undefined;
  const source = fitted?.species ?? own;
  if (source === undefined) throw new Error(`${id} has neither a fit nor a record`);
  const ownFit = own?.provenance["growth"]?.fitted;
  const score = { score: fitted?.score ?? ownFit?.score ?? 0, against: fitted?.against ?? ownFit?.against ?? HABIT_AGAINST };
  const unchanged = own === undefined ? undefined : buildHabitRecord(traits, source.growth, source.carbon, score, prior, own.version);
  const record = unchanged !== undefined && JSON.stringify(unchanged) === JSON.stringify(own) ? unchanged : buildHabitRecord(traits, source.growth, source.carbon, score, prior, (own?.version ?? 0) + 1);
  const reference = habitReferenceOf(id);
  const name = `${traits.common.en[0]?.toUpperCase() ?? ""}${traits.common.en.slice(1)}.`;
  const form = traits.habit === "shrub" ? `A shrub of ${traits.basalStems} stems at the collar that die and resprout.` : `A ${traits.habit} of one unbranched stem under a crown of ${traits.leaf.shape.kind === "fan" ? "fan leaves" : "fronds"}.`;
  const heights = reference.heightAt20M === null ? `${reference.matureHeightM} m mature` : `${reference.heightAt20M} m at 20 years, ${reference.matureHeightM} m mature`;
  const summary = `${name} ${form} Traits from USDA PLANTS and NRCS plant guides; growth and carbon fitted to PLANTS heights (${heights}). Written by \`bun run jgengine plants write ${id}\`; edit the importer's traits or refit, not this file.`;
  writeFileSync(join(PLANTS, "species/data", `${camel(id)}.ts`), speciesRecordSource(traits, record, wrap(summary, 96)));
  console.log(`wrote ${id} v${record.version}`);
}

async function runWrite(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    const habitTraits = habitOf(id);
    if (habitTraits !== undefined) {
      await writeHabit(habitTraits);
      continue;
    }
    const traits = traitsOf(id);
    const fit = join(FIT_DIR, `${id}.json`);
    const own = await loadRecord(id);
    const prior = (await loadRecord(traits.prior)) ?? own;
    if (prior === undefined) throw new Error(`no prior record for ${id}`);
    const fitted: FitFile | undefined = existsSync(fit) ? JSON.parse(readFileSync(fit, "utf8")) : undefined;
    const source = fitted?.species ?? own;
    if (source === undefined) throw new Error(`${id} has neither a fit nor a record`);
    const ownFit = own?.provenance["growth"]?.fitted;
    const parameters: FittedParameters = {
      growth: source.growth,
      carbon: source.carbon,
      score: fitted?.score ?? ownFit?.score ?? 0,
      against: fitted?.against ?? ownFit?.against ?? AGAINST,
    };
    const reference = referenceOf(id);
    const unchanged = own === undefined ? undefined : buildSpeciesRecord(traits, importedValues(traits, reference), parameters, prior, own.version);
    const record = unchanged !== undefined && JSON.stringify(unchanged) === JSON.stringify(own) ? unchanged : buildSpeciesRecord(traits, importedValues(traits, reference), parameters, prior, (own?.version ?? 0) + 1);
    const habit = HABIT[traits.form] + (traits.basalStems !== undefined && traits.basalStems > 1 ? ` It forks at the base into ${traits.basalStems} stems.` : "");
    const name = `${traits.common.en[0]?.toUpperCase() ?? ""}${traits.common.en.slice(1)}.`;
    const summary = `${name} ${habit} Traits from Silvics of North America, the Wood Handbook, FIA and USDA PLANTS; growth and carbon fitted to ${reference.siteTrees.count} FIA site trees on site index ${reference.siteIndexFt} ft and ${reference.crownWidth.trees} Tallo crowns. Written by \`bun run jgengine plants write ${id}\`; edit the importer's traits or refit, not this file.`;
    writeFileSync(join(PLANTS, "species/data", `${camel(id)}.ts`), speciesRecordSource(traits, record, wrap(summary, 96)));
    console.log(`wrote ${id} v${record.version}`);
  }
  const all = [...SPECIES_TRAITS, ...HABIT_TRAITS].filter((traits) => existsSync(join(PLANTS, "species/data", `${camel(traits.id)}.ts`)));
  writeFileSync(
    join(PLANTS, "species/data/plantLibrary.ts"),
    `import type { PlantSpecies } from "../plantSpecies";\n${all.map((t) => `import { ${t.exportName} } from "./${camel(t.id)}";`).join("\n")}\n\n/**
 * Every species record the engine ships, registered with the grown-plant generator. Written by
 * \`bun run jgengine plants write\`.
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */\nexport const PLANT_LIBRARY: readonly PlantSpecies[] = [\n${all.map((t) => `  ${t.exportName},`).join("\n")}\n];\n`,
  );
}

async function runReport(ids: readonly string[], argv: readonly string[]): Promise<void> {
  const seeds = flag(argv, "--seeds", "a").split(",");
  for (const id of ids) {
    const fit = join(FIT_DIR, `${id}.json`);
    const fitted: FitFile | undefined = argv.includes("--fitted") && existsSync(fit) ? JSON.parse(readFileSync(fit, "utf8")) : undefined;
    const habit = habitOf(id);
    if (habit !== undefined) {
      const record = fitted?.species ?? (await loadRecord(id)) ?? (await startingHabitRecord(habit));
      const reference = habitReferenceOf(id);
      const trial = runHabitTrial(record, seeds);
      const score = scoreHabitTrial(reference, habit, trial);
      console.log(`${id} score ${score.total.toFixed(2)} ${JSON.stringify(score.parts)}`);
      for (const r of trial.open.flat()) console.log(`  ${r.age} y: H ${r.heightM.toFixed(2)} CW ${r.crownWidthM.toFixed(2)} stems ${r.stems}${r.alive ? "" : " dead"}`);
      continue;
    }
    const record = fitted?.species ?? (await loadRecord(id)) ?? (await startingRecord(traitsOf(id)));
    const traits = traitsOf(id);
    const reference = referenceOf(id);
    const trial = runTrial(record, seeds, SHADE_TOLERANCE[traits.shade] >= 0.7);
    const score = scoreTrial(fitTarget(traits, record, reference), trial);
    console.log(`${id} score ${score.total.toFixed(2)} ${JSON.stringify(score.parts)}`);
    for (const readings of trial.stand) {
      for (const r of readings) {
        console.log(`  stand ${r.age} y: H ${r.heightM.toFixed(1)} (${standHeightAtM(reference, r.age).toFixed(1)}) DBH ${r.dbhCm.toFixed(1)} (${standDbhAtCm(reference, r.age).toFixed(1)}) CW ${r.crownWidthM.toFixed(1)}`);
      }
    }
  }
}

export async function runPlants(argv: readonly string[]): Promise<number> {
  const [verb, ...rest] = argv;
  const ids = rest.includes("--all") ? SPECIES_TRAITS.map((t) => t.id) : rest.filter((arg, i) => !arg.startsWith("--") && !(rest[i - 1] ?? "").startsWith("--"));
  switch (verb) {
    case "import":
      runImport();
      return 0;
    case "fit":
      if (ids.length === 0) {
        console.error("plants fit: name the species to fit (ids from scripts/species-import/speciesTraits.ts), or --all");
        return 2;
      }
      return runFit(ids, rest);
    case "write":
      await runWrite(ids);
      return 0;
    case "report":
      await runReport(ids, rest);
      return 0;
    default:
      console.log(HELP);
      return verb === undefined || verb === "help" || verb === "--help" ? 0 : 1;
  }
}

if (import.meta.main) process.exit(await runPlants(process.argv.slice(2)));
