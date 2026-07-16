import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const GAMES_DIR = join(ROOT, "Games");
const CONTENT_BASELINE = join(ROOT, "scripts/content-gate-baseline.json");
const COORD_BASELINE = join(ROOT, "scripts/coordinate-literal-baseline.json");

const GAME_THRESHOLD = 20;
const FILE_THRESHOLD = 15;

const EXEMPT: Record<string, string> = {
  "spire-cards": "geometry-free card game — no world/level placement to author in the editor",
  "duet-keys": "geometry-free rhythm game — no world/level placement to author in the editor",
};

const NUM = "-?\\d[\\d._eE+-]*";
const TUP = `\\[\\s*${NUM}\\s*,\\s*${NUM}(?:\\s*,\\s*${NUM})?\\s*\\]`;
const POS_OBJ = new RegExp(`\\{[^{}]*\\bx\\s*:\\s*${NUM}[^{}]*\\bz\\s*:\\s*${NUM}[^{}]*\\}`, "g");
const POS_KEYS =
  "from|to|center|centre|pos|position|point|points|origin|start|end|waypoint|waypoints|coord|coords|offset|anchor|spawn|corner|dest|destination|p0|p1|p2|p3";
const KEYED_TUP = new RegExp(`\\b(?:${POS_KEYS})\\s*:\\s*${TUP}`, "g");
const TUP_RUN = new RegExp(`(?:${TUP}\\s*,\\s*){2,}${TUP}`, "g");
const ONE_TUP = new RegExp(TUP, "g");

function coordScore(txt: string): number {
  const posObj = (txt.match(POS_OBJ) ?? []).length;
  const keyedTup = (txt.match(KEYED_TUP) ?? []).length;
  let runTup = 0;
  for (const run of txt.match(TUP_RUN) ?? []) runTup += (run.match(ONE_TUP) ?? []).length;
  return posObj + keyedTup + runTup;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full);
  }
}

interface GameScan {
  id: string;
  gameScore: number;
  authored: boolean;
  fileOffenders: string[];
}

function scanGame(id: string): GameScan | null {
  const src = join(GAMES_DIR, id, "src");
  if (!existsSync(src)) return null;
  const files: string[] = [];
  walk(src, files);
  let gameScore = 0;
  let authored = false;
  const fileOffenders: string[] = [];
  for (const file of files) {
    const txt = readFileSync(file, "utf8");
    if (/\bAuthoredScene\b|\bAuthoredPaths\b/.test(txt)) authored = true;
    const score = coordScore(txt);
    gameScore += score;
    if (score >= FILE_THRESHOLD) fileOffenders.push(relative(ROOT, file).replaceAll("\\", "/"));
  }
  const sceneDoc = join(src, "editor.scene.json");
  if (existsSync(sceneDoc)) {
    try {
      const doc = JSON.parse(readFileSync(sceneDoc, "utf8")) as {
        markers?: unknown[];
        paths?: unknown[];
        volumes?: unknown[];
      };
      if ((doc.markers?.length ?? 0) + (doc.paths?.length ?? 0) + (doc.volumes?.length ?? 0) > 0) authored = true;
    } catch { /* ignore */ }
  }
  fileOffenders.sort();
  return { id, gameScore, authored, fileOffenders };
}

function scanAll(): GameScan[] {
  const out: GameScan[] = [];
  for (const id of readdirSync(GAMES_DIR).sort()) {
    const dir = join(GAMES_DIR, id);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "package.json"))) continue;
    if (id in EXEMPT) continue;
    const scan = scanGame(id);
    if (scan !== null) out.push(scan);
  }
  return out;
}

function currentOffenders(scans: GameScan[]): { games: string[]; files: string[] } {
  const games: string[] = [];
  const files: string[] = [];
  for (const scan of scans) {
    if (!scan.authored && scan.gameScore >= GAME_THRESHOLD) games.push(scan.id);
    files.push(...scan.fileOffenders);
  }
  return { games: games.sort(), files: files.sort() };
}

function readBaseline(path: string): string[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as string[];
}

function writeBaseline(path: string, values: string[]): void {
  writeFileSync(path, `${JSON.stringify([...values].sort(), null, 2)}\n`);
}

function main(argv: string[]): number {
  const scans = scanAll();
  const { games, files } = currentOffenders(scans);

  if (argv.includes("--update")) {
    writeBaseline(CONTENT_BASELINE, games);
    writeBaseline(COORD_BASELINE, files);
    console.log(
      `check-content-gate: baselines written — ${games.length} offender game(s), ${files.length} coordinate-literal file(s)`,
    );
    return 0;
  }

  const contentBaseline = new Set(readBaseline(CONTENT_BASELINE));
  const coordBaseline = new Set(readBaseline(COORD_BASELINE));
  const problems: string[] = [];

  for (const id of games) {
    if (!contentBaseline.has(id)) {
      const score = scans.find((s) => s.id === id)?.gameScore;
      problems.push(
        `Games/${id}: hard-coded world/level geometry (coordinate-literal score ${score}) with no <AuthoredScene>/editor.scene.json. ` +
          `Author the scene in the editor (jgengine-editor skill) and render it with <AuthoredScene>, or — if this game is legitimately procedural/geometry-free — add it to EXEMPT in scripts/check-content-gate.ts with a reason.`,
      );
    }
  }
  for (const id of contentBaseline) {
    if (!games.includes(id)) {
      problems.push(
        `content-gate-baseline.json lists "${id}" but it no longer hard-codes geometry (now compliant or exempt). Remove it — the baseline only shrinks.`,
      );
    }
  }

  const fileSet = new Set(files);
  for (const file of files) {
    if (!coordBaseline.has(file)) {
      problems.push(
        `${file}: dense hand-placed coordinate literals (score >= ${FILE_THRESHOLD}). Move these positions into the editor document and read them at runtime, or add the file to coordinate-literal-baseline.json only as a genuine reviewed exception.`,
      );
    }
  }
  for (const file of coordBaseline) {
    if (!fileSet.has(file)) {
      problems.push(
        `coordinate-literal-baseline.json lists "${file}" but it no longer trips the lint (moved to the editor, or below threshold). Remove it — the baseline only shrinks.`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(
      `\ncheck-content-gate: ${problems.length} content-governance issue(s):\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\n\nRule: scene/level geometry and placement are authored in the scene editor and saved into\n` +
        `editor.scene.json, then rendered at runtime by <AuthoredScene>/<AuthoredPaths> — never hand-rolled\n` +
        `as mesh generation or magic-number placement arrays in game code (CLAUDE.md → "Author scenes in\n` +
        `the editor"). Two shrinking baselines pin today's known offenders so main stays green while the\n` +
        `per-game migrations land; both may only lose entries, never gain them. After a migration reseed with\n` +
        `  bun run check-content-gate --update\n` +
        `and commit the trimmed baselines. Exempt (procedural / geometry-free) games live in EXEMPT in\n` +
        `scripts/check-content-gate.ts.\n`,
    );
    return 1;
  }

  console.log(
    `check-content-gate: clean — ${games.length} game(s) and ${files.length} file(s) baselined; ` +
      `${Object.keys(EXEMPT).length} game(s) exempt; no new hard-coded-geometry offenders`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
