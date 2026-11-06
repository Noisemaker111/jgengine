import { SUITE_ENTRIES, SUITE_GENRES, SUITE_UNIVERSAL, type SuiteEntry } from "./suiteCatalog";

/**
 * A game's suite answers, from the `suite` section of its `jgengine.json`: its genres, the entries it
 * cuts (each with the reason the score shows), and the entries it cannot simulate (each naming the file
 * where the logic lives, so the finding can be fixed).
 */
export interface GameSuiteConfig {
  genres: readonly string[];
  cut: Readonly<Record<string, string>>;
  notSimulatable: Readonly<Record<string, string>>;
}

/** One proof's result, as the suite test records it. */
export interface SuiteProofResult {
  /** The proof file, relative to the game. */
  file: string;
  proves: readonly string[];
  ok: boolean;
  /** The failing step and why, when it failed. */
  failure?: string;
}

/** One data entry's result from the content check. */
export interface SuiteDataResult {
  id: string;
  ok: boolean;
  problems: readonly string[];
}

/** What a game's suite test writes to `proofs/suite-report.json`. */
export interface SuiteReport {
  game: string;
  proofs: readonly SuiteProofResult[];
  data: readonly SuiteDataResult[];
}

/** Where an entry stands for one game. */
export type SuiteStatus = "proven" | "failing" | "not-simulatable" | "missing" | "cut";

/** One required entry's row in a game's score. */
export interface SuiteScoreRow {
  entry: SuiteEntry;
  status: SuiteStatus;
  /** The cut reason, the not-simulatable file, the failing proof's reason, or the proof that proved it. */
  detail?: string;
}

/** A game's whole score. */
export interface GameSuiteScore {
  game: string;
  genres: readonly string[];
  rows: readonly SuiteScoreRow[];
  /** Entries proven. */
  proven: number;
  /** Entries required and not cut. */
  required: number;
  counts: Readonly<Record<SuiteStatus, number>>;
  /** Mistakes in the game's own declarations: unknown genres or entry ids, empty reasons. */
  problems: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown, field: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`suite.${field} maps entry ids to a reason string`);
  const out: Record<string, string> = {};
  for (const [id, reason] of Object.entries(value)) {
    if (typeof reason !== "string" || reason.trim() === "") throw new Error(`suite.${field}["${id}"] needs a reason string`);
    out[id] = reason;
  }
  return out;
}

/**
 * Read the `suite` section of a parsed `jgengine.json`; `null` when the game declares none.
 * Throws on a malformed section, naming the field.
 */
export function readGameSuiteConfig(projectConfig: unknown): GameSuiteConfig | null {
  if (!isRecord(projectConfig)) return null;
  const suite = projectConfig["suite"];
  if (suite === undefined) return null;
  if (!isRecord(suite)) throw new Error('"suite" is { genres: [...], cut?: { id: reason }, notSimulatable?: { id: "file: why" } }');
  const genres = suite["genres"];
  if (!Array.isArray(genres) || genres.some((genre) => typeof genre !== "string")) throw new Error("suite.genres lists genre ids");
  return {
    genres: genres.filter((genre): genre is string => typeof genre === "string"),
    cut: stringMap(suite["cut"], "cut"),
    notSimulatable: stringMap(suite["notSimulatable"], "notSimulatable"),
  };
}

const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.every((item) => typeof item === "string") ? value.filter((item): item is string => typeof item === "string") : null);

/** Read a suite report from parsed JSON (a game's `proofs/suite-report.json`); throws on anything else. */
export function parseSuiteReport(raw: unknown): SuiteReport {
  if (!isRecord(raw) || typeof raw["game"] !== "string" || !Array.isArray(raw["proofs"]) || !Array.isArray(raw["data"])) throw new Error("not a suite report: { game, proofs, data }");
  const proofs = raw["proofs"].map((proof): SuiteProofResult => {
    const proves = isRecord(proof) ? strings(proof["proves"]) : null;
    if (!isRecord(proof) || typeof proof["file"] !== "string" || proves === null || typeof proof["ok"] !== "boolean") throw new Error("suite report proof rows are { file, proves, ok, failure? }");
    const failure = proof["failure"];
    return { file: proof["file"], proves, ok: proof["ok"], ...(typeof failure === "string" ? { failure } : {}) };
  });
  const data = raw["data"].map((row): SuiteDataResult => {
    const problems = isRecord(row) ? strings(row["problems"]) : null;
    if (!isRecord(row) || typeof row["id"] !== "string" || typeof row["ok"] !== "boolean" || problems === null) throw new Error("suite report data rows are { id, ok, problems }");
    return { id: row["id"], ok: row["ok"], problems };
  });
  return { game: raw["game"], proofs, data };
}

/** The genres a declaration reaches, its includes followed. */
export function expandSuiteGenres(genres: readonly string[]): string[] {
  const reached = new Set<string>();
  const visit = (id: string): void => {
    if (reached.has(id)) return;
    reached.add(id);
    for (const included of SUITE_GENRES.find((genre) => genre.id === id)?.includes ?? []) visit(included);
  };
  for (const genre of genres) visit(genre);
  return [...reached];
}

/** Every entry a game with these genres must prove: the universal set plus each genre's. */
export function requiredSuiteEntries(genres: readonly string[], entries: readonly SuiteEntry[] = SUITE_ENTRIES): SuiteEntry[] {
  const reached = new Set([SUITE_UNIVERSAL, ...expandSuiteGenres(genres)]);
  return entries.filter((entry) => entry.genres.some((genre) => reached.has(genre)));
}

/**
 * Score a game: each required entry is `cut` (with its reason), `proven` (a passing proof or content
 * check), `failing` (a proof or check that names it fails), `not-simulatable` (declared, with its file) or
 * `missing`. A passing proof wins over a failing one for the same entry. No report: everything not cut is
 * missing.
 *
 * @capability game-suite-score score a game against the engine's game suite: proven, failing, not simulatable, missing and cut, by area
 */
export function scoreGameSuite(game: string, config: GameSuiteConfig, report: SuiteReport | null, entries: readonly SuiteEntry[] = SUITE_ENTRIES): GameSuiteScore {
  const problems: string[] = [];
  const known = new Set(entries.map((entry) => entry.id));
  for (const genre of config.genres) if (!SUITE_GENRES.some((candidate) => candidate.id === genre)) problems.push(`unknown genre "${genre}" (known: ${SUITE_GENRES.map((candidate) => candidate.id).join(", ")})`);
  for (const id of [...Object.keys(config.cut), ...Object.keys(config.notSimulatable)]) if (!known.has(id)) problems.push(`jgengine.json names unknown suite entry "${id}"`);
  for (const proof of report?.proofs ?? []) for (const id of proof.proves) if (!known.has(id)) problems.push(`${proof.file} proves unknown suite entry "${id}"`);

  const rows = requiredSuiteEntries(config.genres, entries).map((entry): SuiteScoreRow => {
    const cut = config.cut[entry.id];
    if (cut !== undefined) return { entry, status: "cut", detail: cut };
    if (entry.by === "data") {
      const result = report?.data.find((candidate) => candidate.id === entry.id);
      if (result === undefined) return { entry, status: "missing", detail: "no content sheet (proofs/content.ts)" };
      return result.ok ? { entry, status: "proven", detail: "content check" } : { entry, status: "failing", detail: result.problems.slice(0, 3).join("; ") };
    }
    const proofs = (report?.proofs ?? []).filter((proof) => proof.proves.includes(entry.id));
    const passed = proofs.find((proof) => proof.ok);
    if (passed !== undefined) return { entry, status: "proven", detail: passed.file };
    const failed = proofs[0];
    if (failed !== undefined) return { entry, status: "failing", detail: `${failed.file}: ${failed.failure ?? "failed"}` };
    const why = config.notSimulatable[entry.id];
    if (why !== undefined) return { entry, status: "not-simulatable", detail: why };
    return { entry, status: "missing" };
  });
  const count = (status: SuiteStatus): number => rows.filter((row) => row.status === status).length;
  const counts: Record<SuiteStatus, number> = { proven: count("proven"), failing: count("failing"), "not-simulatable": count("not-simulatable"), missing: count("missing"), cut: count("cut") };
  return { game, genres: config.genres, rows, proven: counts.proven, required: rows.length - counts.cut, counts, problems };
}

/** The entry's area: its id up to the first dot. */
export function suiteArea(id: string): string {
  const dot = id.indexOf(".");
  return dot < 0 ? id : id.slice(0, dot);
}

/** One line: `12/62 proven · 3 failing · 1 not simulatable · 2 cut · 46 missing`. */
export function suiteScoreLine(score: GameSuiteScore): string {
  const parts = [`${score.proven}/${score.required} proven`];
  if (score.counts.failing > 0) parts.push(`${score.counts.failing} failing`);
  if (score.counts["not-simulatable"] > 0) parts.push(`${score.counts["not-simulatable"]} not simulatable`);
  if (score.counts.cut > 0) parts.push(`${score.counts.cut} cut`);
  if (score.counts.missing > 0) parts.push(`${score.counts.missing} missing`);
  return parts.join(" · ");
}

function areas(score: GameSuiteScore): Map<string, SuiteScoreRow[]> {
  const grouped = new Map<string, SuiteScoreRow[]>();
  for (const row of score.rows) {
    const area = suiteArea(row.entry.id);
    grouped.set(area, [...(grouped.get(area) ?? []), row]);
  }
  return grouped;
}

const STATUS_MARK: Record<SuiteStatus, string> = { proven: "proven", failing: "FAILING", "not-simulatable": "not simulatable", missing: "missing", cut: "cut" };

/** The score as terminal lines, grouped by area. */
export function renderSuiteText(score: GameSuiteScore): string[] {
  const lines = [`${score.game} game suite (${score.genres.join(", ") || "universal only"}): ${suiteScoreLine(score)}`];
  for (const problem of score.problems) lines.push(`  problem: ${problem}`);
  for (const [area, rows] of areas(score)) {
    const proven = rows.filter((row) => row.status === "proven").length;
    const counted = rows.filter((row) => row.status !== "cut").length;
    lines.push("", `${area} ${proven}/${counted}`);
    for (const row of rows) lines.push(`  ${STATUS_MARK[row.status].padEnd(15)} ${row.entry.id}${row.detail === undefined ? "" : ` — ${row.detail}`}`);
  }
  return lines;
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** The score as a markdown table grouped by area, for a game's `PLAN.md`. */
export function renderSuiteMarkdown(score: GameSuiteScore): string[] {
  const lines = [`Genres: ${score.genres.join(", ") || "none"}. ${suiteScoreLine(score)}.`, "", "| Entry | Status | What the player does | Detail |", "| --- | --- | --- | --- |"];
  for (const [, rows] of areas(score)) {
    for (const row of rows) lines.push(`| \`${row.entry.id}\` | ${STATUS_MARK[row.status]} | ${cell(row.entry.does)} | ${cell(row.detail ?? "")} |`);
  }
  return lines;
}

/** The score as one markdown row per area: proven of counted, then what is failing, not simulatable, missing and cut. */
export function renderSuiteAreaTable(score: GameSuiteScore): string[] {
  const lines = ["| Area | Proven | Failing | Not simulatable | Missing | Cut |", "| --- | --- | --- | --- | --- | --- |"];
  const count = (rows: readonly SuiteScoreRow[], status: SuiteStatus) => rows.filter((row) => row.status === status).length;
  for (const [area, rows] of areas(score)) {
    const counted = rows.length - count(rows, "cut");
    lines.push(`| ${area} | ${count(rows, "proven")}/${counted} | ${count(rows, "failing")} | ${count(rows, "not-simulatable")} | ${count(rows, "missing")} | ${count(rows, "cut")} |`);
  }
  lines.push(`| **total** | **${score.proven}/${score.required}** | ${score.counts.failing} | ${score.counts["not-simulatable"]} | ${score.counts.missing} | ${score.counts.cut} |`);
  return lines;
}

/** Entry ids proven in `before` and not in `after`: regressions the suite test refuses. */
export function suiteRegressions(before: GameSuiteScore, after: GameSuiteScore): string[] {
  const now = new Map(after.rows.map((row) => [row.entry.id, row.status]));
  return before.rows.filter((row) => row.status === "proven" && now.get(row.entry.id) !== "proven" && now.get(row.entry.id) !== "cut").map((row) => row.entry.id);
}
