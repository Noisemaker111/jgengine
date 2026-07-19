import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  auditManifest,
  isSceneOwnershipManifest,
  type SceneOwnershipManifest,
} from "../packages/core/src/scene/sceneOwnership";

const ROOT = process.cwd();
const GAMES_DIR = join(ROOT, "Games");
const CONTENT_BASELINE = join(ROOT, "scripts/content-gate-baseline.json");
const COORD_BASELINE = join(ROOT, "scripts/coordinate-literal-baseline.json");
const BUILDER_BASELINE = join(ROOT, "scripts/content-builder-baseline.json");
const OWNERSHIP_MANIFEST = "scene-ownership.json";

const GAME_THRESHOLD = 20;
const FILE_THRESHOLD = 15;

/**
 * Content-bearing feature builders from `@jgengine/core/world/features`. Unlike coordinate
 * literals, a parameterized fill (`grass({ area, density })`, `building({ count, style })`,
 * `road({ path })`, a bounded `ocean({ bounds })`, `pad({ center, size })`) authors visible
 * world *content* — turf, structures, streets, water bodies, platforms — with no scoreable
 * coordinates, so it slips past the coordinate lint entirely. For an authored game these are the
 * scene document's job (author them in the editor, consume at runtime), never game code. See #1125.
 */
const CONTENT_BUILDERS = ["grass", "building", "road", "ocean", "pad"] as const;
type ContentBuilder = (typeof CONTENT_BUILDERS)[number];
const FEATURE_MODULE = /@jgengine\/core\/world\/features/;

interface OwnershipDeclaration {
  /** The game legitimately owns runtime-only/geometry-free content it declared cleanly. */
  declared: boolean;
  /** Problems that must fail the gate (malformed manifest or a boundary violation). */
  problems: string[];
}

/**
 * A game opts out of the hard-coded-geometry gate by shipping a `scene-ownership.json`
 * {@link SceneOwnershipManifest} that declares its genuinely runtime-only or geometry-free
 * content — replacing the old game-name allowlist with an explicit, validated declaration.
 */
function readOwnershipDeclaration(id: string): OwnershipDeclaration {
  const path = join(GAMES_DIR, id, "src", OWNERSHIP_MANIFEST);
  if (!existsSync(path)) return { declared: false, problems: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return {
      declared: false,
      problems: [`Games/${id}/src/${OWNERSHIP_MANIFEST}: not valid JSON (${String(error)}).`],
    };
  }
  if (!isSceneOwnershipManifest(parsed)) {
    return {
      declared: false,
      problems: [
        `Games/${id}/src/${OWNERSHIP_MANIFEST}: not a valid scene-ownership manifest ` +
          `(expected { version: 1, declarations: [...] } with a valid provenance per declaration).`,
      ],
    };
  }
  const manifest: SceneOwnershipManifest = parsed;
  const violations = auditManifest(manifest);
  if (violations.length > 0) {
    return {
      declared: false,
      problems: violations.map(
        (v) =>
          `Games/${id}/src/${OWNERSHIP_MANIFEST}: ${v.message} — declare a bake capability or a reason, ` +
          `or author the content in the scene document.`,
      ),
    };
  }
  const declaresRuntime = manifest.declarations.some(
    (d) => d.provenance.kind === "runtime" || d.provenance.kind === "transient",
  );
  if (!declaresRuntime) {
    return {
      declared: false,
      problems: [
        `Games/${id}/src/${OWNERSHIP_MANIFEST}: declares no runtime/transient content, so it does not ` +
          `explain any hard-coded geometry. Remove it, or author the content in the scene document.`,
      ],
    };
  }
  return { declared: true, problems: [] };
}

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

/**
 * Which content builders a file imports from the feature module. Tying detection to the import
 * (not a bare name) keeps unrelated local helpers — e.g. a `pad(value)` string-padding function —
 * from false-positiving, and only flags the actual `@jgengine/core/world/features` fills.
 */
function importedContentBuilders(txt: string): Set<ContentBuilder> {
  const set = new Set<ContentBuilder>();
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) {
    if (!FEATURE_MODULE.test(m[2])) continue;
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim() ?? "";
      if ((CONTENT_BUILDERS as readonly string[]).includes(name)) set.add(name as ContentBuilder);
    }
  }
  return set;
}

/**
 * Content builders actually called as fills in this file. A default `ocean()` is an ambient
 * full-world water plane (environment tuning), so only a *bounded* ocean — one passing explicit
 * `bounds`/`position` — counts as placed content per #1125; the other builders are content the
 * moment they are called.
 */
function contentBuilderCalls(txt: string): ContentBuilder[] {
  const found = new Set<ContentBuilder>();
  for (const builder of importedContentBuilders(txt)) {
    if (builder === "ocean") {
      const re = /\bocean\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt)) !== null) {
        if (/\bbounds\b|\bposition\b/.test(txt.slice(m.index, m.index + 400))) {
          found.add(builder);
          break;
        }
      }
    } else if (new RegExp(`\\b${builder}\\s*\\(`).test(txt)) {
      found.add(builder);
    }
  }
  return [...found];
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
  /** `Games/<id>/src/<file>:<builder>` for each content-builder fill called in game source. */
  builderOffenders: string[];
}

function scanGame(id: string): GameScan | null {
  const src = join(GAMES_DIR, id, "src");
  if (!existsSync(src)) return null;
  const files: string[] = [];
  walk(src, files);
  let gameScore = 0;
  let authored = false;
  const fileOffenders: string[] = [];
  const builderOffenders: string[] = [];
  for (const file of files) {
    const txt = readFileSync(file, "utf8");
    if (/\bAuthoredScene\b|\bAuthoredPaths\b/.test(txt)) authored = true;
    const score = coordScore(txt);
    gameScore += score;
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (score >= FILE_THRESHOLD) fileOffenders.push(rel);
    for (const builder of contentBuilderCalls(txt)) builderOffenders.push(`${rel}:${builder}`);
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
  builderOffenders.sort();
  return { id, gameScore, authored, fileOffenders, builderOffenders };
}

function scanAll(): GameScan[] {
  const out: GameScan[] = [];
  for (const id of readdirSync(GAMES_DIR).sort()) {
    const dir = join(GAMES_DIR, id);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "package.json"))) continue;
    const scan = scanGame(id);
    if (scan !== null) out.push(scan);
  }
  return out;
}

function currentOffenders(
  scans: GameScan[],
  declared: ReadonlySet<string>,
): { games: string[]; files: string[]; builders: string[] } {
  const games: string[] = [];
  const files: string[] = [];
  const builders: string[] = [];
  for (const scan of scans) {
    // A clean scene-ownership.json declaration exempts the whole game from every content check.
    if (declared.has(scan.id)) continue;
    if (!scan.authored && scan.gameScore >= GAME_THRESHOLD) games.push(scan.id);
    files.push(...scan.fileOffenders);
    // Parameterized fills are content only when the game is authored — a fully procedural game
    // with no scene document is out of scope for the "author it in the editor" rule.
    if (scan.authored) builders.push(...scan.builderOffenders);
  }
  return { games: games.sort(), files: files.sort(), builders: builders.sort() };
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
  const declared = new Set<string>();
  const declarationProblems: string[] = [];
  for (const scan of scans) {
    const declaration = readOwnershipDeclaration(scan.id);
    if (declaration.declared) declared.add(scan.id);
    declarationProblems.push(...declaration.problems);
  }
  const { games, files, builders } = currentOffenders(scans, declared);

  if (argv.includes("--update")) {
    writeBaseline(CONTENT_BASELINE, games);
    writeBaseline(COORD_BASELINE, files);
    writeBaseline(BUILDER_BASELINE, builders);
    console.log(
      `check-content-gate: baselines written — ${games.length} offender game(s), ${files.length} coordinate-literal file(s), ` +
        `${builders.length} content-builder call(s)`,
    );
    return 0;
  }

  const contentBaseline = new Set(readBaseline(CONTENT_BASELINE));
  const coordBaseline = new Set(readBaseline(COORD_BASELINE));
  const builderBaseline = new Set(readBaseline(BUILDER_BASELINE));
  const problems: string[] = [...declarationProblems];

  for (const id of games) {
    if (!contentBaseline.has(id)) {
      const score = scans.find((s) => s.id === id)?.gameScore;
      problems.push(
        `Games/${id}: hard-coded world/level geometry (coordinate-literal score ${score}) with no <AuthoredScene>/editor.scene.json. ` +
          `Author the scene in the editor (jgengine-editor skill) and render it with <AuthoredScene>, or — if this game is legitimately procedural/geometry-free — declare its runtime-only content in Games/${id}/src/scene-ownership.json (a SceneOwnershipManifest with a reason per object).`,
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

  const builderSet = new Set(builders);
  for (const entry of builders) {
    if (!builderBaseline.has(entry)) {
      const sep = entry.lastIndexOf(":");
      const file = entry.slice(0, sep);
      const builder = entry.slice(sep + 1);
      problems.push(
        `${file}: authored game calls the content builder ${builder}(...). Parameterized fills author visible world content ` +
          `(vegetation/structures/roads/pads/bounded water), which belongs in the scene document — author it in the editor ` +
          `(jgengine-editor skill) as an editor.scene.json volume/kind and consume it at runtime, not as a code-side fill. If this ` +
          `content is genuinely runtime-only, declare it in Games/${file.split("/")[1]}/src/scene-ownership.json (a SceneOwnershipManifest with a reason).`,
      );
    }
  }
  for (const entry of builderBaseline) {
    if (!builderSet.has(entry)) {
      problems.push(
        `content-builder-baseline.json lists "${entry}" but that content-builder call is gone (moved to the editor, or the game is now exempt). Remove it — the baseline only shrinks.`,
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
        `the editor"). Parameterized content fills (grass()/building()/road()/pad()/bounded ocean()) in an\n` +
        `authored game are the same violation with no scoreable coordinates and are caught independently.\n` +
        `Three shrinking baselines pin today's known offenders so main stays green while the per-game\n` +
        `migrations land; all may only lose entries, never gain them. After a migration reseed with\n` +
        `  bun run check-content-gate --update\n` +
        `and commit the trimmed baselines. Genuinely procedural / geometry-free games declare their\n` +
        `runtime-only content in Games/<id>/src/scene-ownership.json (a SceneOwnershipManifest) instead of a\n` +
        `game-name exemption; the manifest is validated by the scene-ownership boundary in @jgengine/core.\n`,
    );
    return 1;
  }

  console.log(
    `check-content-gate: clean — ${games.length} game(s), ${files.length} coordinate-literal file(s), and ` +
      `${builders.length} content-builder call(s) baselined; ${declared.size} game(s) with declared runtime-only content; ` +
      `no new hard-coded-geometry or content-fill offenders`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
