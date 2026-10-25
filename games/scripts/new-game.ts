/**
 * `bun run games:new "<idea in plain words>"` - a playable starter in one command.
 *
 * It reads which kind of game the idea is (`new-game/kinds/index.ts`: survival, racer, builder,
 * tower defense, farming, shooter, colony, exploration), lets that kind read the idea into its data
 * (`src/game/idea.ts`) and lay out a dressed world (`src/editor.scene.json`: towns from the city
 * studio, forests, lakes, trails, clusters), copies the kind's starter and every model it names, and
 * writes the package, README design checklist, loop and clip flows and capabilities the gates ask for.
 *
 * Usage:
 *   bun run games:new "zombie survival where you scavenge by day and fortify for nights"
 *   bun run games:new "<idea>" --name "Dead Acre" [--kind farm] [--force] [--no-install]
 *   bun run games:new --print "<idea>"        # show what the idea reads as, write nothing
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { repoRoot, root } from "./repo";
import { chooseKind, loadKind } from "./new-game/kinds/index";
import { words } from "./new-game/kinds/shared";
import type { BaseIdea, ModelRef } from "./new-game/template/common/src/game/ideaShape";
import { Layout } from "./new-game/world/layout";

const started = performance.now();
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const valued = new Set(["--name", "--kind"]);
const text = args.filter((arg, index) => !arg.startsWith("--") && !valued.has(args[index - 1] ?? "")).join(" ").trim();
if (text.length === 0) {
  console.error('new-game: say the idea in plain words, e.g. bun run games:new "dinosaur survival: tame, build, craft"');
  process.exit(1);
}

const name = option("name");
const said = words(text);
const choice = chooseKind(said, option("kind"));
const kind = await loadKind(choice.kind);
const idea: BaseIdea = kind.read(text, said, name === undefined ? {} : { name });
if (flag("print")) {
  console.log(`${choice.kind}: ${choice.why}`);
  console.log(JSON.stringify(idea, null, 2));
  process.exit(0);
}

const gameDir = join(root, idea.id);
if (existsSync(gameDir)) {
  if (!flag("force")) {
    console.error(`new-game: ${idea.id}/ already exists; pass --force to write over it, or --name "Another Name"`);
    process.exit(1);
  }
  for (const entry of readdirSync(gameDir)) if (entry !== "node_modules") rmSync(join(gameDir, entry), { recursive: true, force: true });
}

const template = join(import.meta.dir, "new-game", "template");
const step = (label: string) => console.log(`  ${label}`);
console.log(`new-game: "${idea.name}" - ${kind.genre} (${choice.why}) -> ${idea.id}/`);

// 1. The template: shared screens, flow, world and HUD frame, then the kind's own game.
cpSync(join(template, "common"), gameDir, { recursive: true });
cpSync(join(template, idea.kind), gameDir, { recursive: true });
// Template tests are stored as `*.ts.tmpl` so the repo's own test run skips them; the game gets them as `*.ts`.
untemplate(gameDir);
step(`copied the ${idea.kind} starter`);

// 2. Models: pack files the dev runner serves are copied in and committed; library models come from
// any game that already pulled them (they are large and gitignored), else `bun run games:provision`.
const engine = repoRoot;
const devPublic = join(engine, "apps", "dev", "public");
const missingLibrary: string[] = [];

function untemplate(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) untemplate(path);
    else if (entry.endsWith(".tmpl")) renameSync(path, path.slice(0, -".tmpl".length));
  }
}

function imagesOf(glb: string): string[] {
  const bytes = readFileSync(glb);
  if (bytes.readUInt32LE(0) !== 0x46546c67) return [];
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as { images?: { uri?: string }[] };
  return (json.images ?? []).map((image) => image.uri).filter((uri): uri is string => typeof uri === "string" && !uri.startsWith("data:"));
}

/** Textures over 1 MB are 2-4K maps; a starter commits them at 1024 px (ffmpeg, when installed) so a game stays a few MB. */
function copyTexture(source: string, target: string): void {
  if (existsSync(target)) return;
  // A model's textures can sit in a sibling folder ("../scenery/T_Brick.png"), which may not exist yet.
  mkdirSync(dirname(target), { recursive: true });
  if (statSync(source).size > 1_000_000 && /\.(png|jpe?g)$/i.test(source)) {
    const shrunk = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", source, "-vf", "scale='min(1024,iw)':-1", target], { stdio: "ignore" });
    if (shrunk.status === 0 && existsSync(target)) return;
  }
  cpSync(source, target);
}

function copyPackModel(url: string): string {
  const from = join(devPublic, url);
  const served = `/models/imported/${url.replace(/^\/models\//, "")}`;
  const to = join(gameDir, "public", served);
  if (!existsSync(from)) throw new Error(`new-game: ${url} is not in ${relative(root, devPublic) || devPublic}`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  for (const image of imagesOf(from)) {
    const source = join(dirname(from), decodeURIComponent(image));
    if (existsSync(source)) copyTexture(source, join(dirname(to), decodeURIComponent(image)));
  }
  return served;
}

function libraryCaches(): string[] {
  const places = [repoRoot, join(repoRoot, "..", "..", "..")];
  const found: string[] = [];
  for (const place of places) {
    for (const top of [place, join(place, ".claude", "worktrees")]) {
      if (!existsSync(top)) continue;
      for (const entry of readdirSync(top)) {
        const direct = join(top, entry, "public", "models", "library");
        if (existsSync(direct)) found.push(direct);
        const nested = join(top, entry);
        if (top.endsWith("worktrees") && statSync(nested).isDirectory()) {
          for (const game of readdirSync(nested)) {
            const cache = join(nested, game, "public", "models", "library");
            if (existsSync(cache)) found.push(cache);
          }
        }
      }
    }
  }
  return found.filter((cache) => !cache.startsWith(gameDir));
}

const caches = libraryCaches();
function copyLibraryModel(model: string): void {
  const to = join(gameDir, "public", "models", "library", model);
  if (existsSync(to)) return;
  const cache = caches.find((dir) => existsSync(join(dir, model)));
  if (cache === undefined) {
    missingLibrary.push(model);
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(cache, model), to, { recursive: true });
}

/** Every model the idea names: any object in it with a string `model`. */
function modelsIn(value: unknown, found: ModelRef[] = []): ModelRef[] {
  if (Array.isArray(value)) for (const item of value) modelsIn(item, found);
  else if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record["model"] === "string") found.push(record as unknown as ModelRef);
    for (const item of Object.values(record)) modelsIn(item, found);
  }
  return found;
}

/** The idea with every pack model pointed at the copy the game serves. */
function repointed<T>(value: T): T {
  if (Array.isArray(value)) return value.map(repointed) as T;
  if (typeof value !== "object" || value === null) return value;
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repointed(item)]));
  const ref = record["model"];
  if (typeof ref === "string" && served.has(ref)) record["model"] = served.get(ref);
  return record as T;
}

const served = new Map<string, string>();
for (const ref of modelsIn(idea)) {
  if (ref.model.startsWith("/")) {
    if (!served.has(ref.model)) served.set(ref.model, copyPackModel(ref.model));
  } else copyLibraryModel(ref.model);
}
const localIdea = repointed(idea);
step(`copied ${served.size} models into public/models/imported${missingLibrary.length === 0 ? "" : `; ${missingLibrary.length} library models to pull`}`);

// 3. The idea itself: one data file the whole starter reads.
writeFileSync(
  join(gameDir, "src", "game", "idea.ts"),
  `import type { Idea } from "./kindShape";

/**
 * ${localIdea.name}: "${localIdea.pitch.replace(/\*\//g, "* /")}"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in \`src/editor.scene.json\` (F2+E in the running game).
 */
export const idea: Idea = ${JSON.stringify(localIdea, null, 2)};
`,
);
step("wrote src/game/idea.ts");

// 4. The authored scene: the kind lays out a dressed world, seeded so the same idea lays out the same one.
const layout = new Layout(localIdea.id);
kind.scene(localIdea as never, layout);
writeFileSync(join(gameDir, "src", "editor.scene.json"), `${JSON.stringify({ version: 1, ...layout.doc }, null, 2)}\n`);
const volumeKinds = layout.doc.volumes.map((volume) => String(volume["kind"]));
const scatterCount = layout.doc.paths.filter((path) => path["kind"] === "scatter").length;
step(`laid out the world: ${volumeKinds.filter((k) => k === "city").length} towns, ${scatterCount} woods and drifts, ${volumeKinds.filter((k) => k === "water").length} lakes, ${layout.doc.markers.length} markers`);

// 5. Package, page, README checklist, loop proof flow.
const sample = JSON.parse(readFileSync(join(template, "common", "package.json"), "utf8")) as Record<string, unknown>;
writeFileSync(join(gameDir, "package.json"), `${JSON.stringify({ ...sample, name: `@games/${localIdea.id}` }, null, 2)}\n`);
writeFileSync(
  join(gameDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${localIdea.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
);
writeFileSync(join(gameDir, "README.md"), kind.readme(localIdea as never));
mkdirSync(join(gameDir, "proofs", "flows"), { recursive: true });
writeFileSync(join(gameDir, "proofs", "flows", `${localIdea.id}-loop.json`), `${JSON.stringify(kind.loopFlow(localIdea as never), null, 2)}\n`);
writeFileSync(join(gameDir, "proofs", "flows", `${localIdea.id}-clip.json`), `${JSON.stringify(kind.clipFlow(localIdea as never), null, 2)}\n`);

step("wrote package.json, index.html, README.md and the loop and clip flows");

// 6. Install and seed capabilities.
const run = (command: string[], cwd = repoRoot) => {
  const result = spawnSync(command[0]!, command.slice(1), { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return result.status ?? 1;
};
if (!flag("no-install")) {
  run(["bun", "install"]);
  run(["bun", "games/scripts/capabilities-declare.ts", localIdea.id, "--force"]);
  fillDeclines(localIdea);
}

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`\nnew-game: ${localIdea.name} is ready in ${seconds}s.`);
if (missingLibrary.length > 0) console.log(`  pull its library models first: bun run games:provision ${localIdea.id}   (${missingLibrary.join(", ")})`);
console.log(`  play it:   bun --cwd=games/${localIdea.id} run dev`);
console.log(`  change it: ${localIdea.id}/src/game/idea.ts (words, costs, models) and F2+E in the game (places)`);
console.log(`  clip it:   bun run drive ${localIdea.id} --game-dir ${gameDir}${kind.clipState === undefined ? "" : ` --state ${kind.clipState}`} --flow ${localIdea.id}-clip --record clip`);
console.log("  guide:     games/docs/new-game.md");

/** Every capability the starter does not use is declined in words that name its domain, as the ledger asks. */
function fillDeclines(made: BaseIdea): void {
  const path = join(gameDir, "capabilities.json");
  if (!existsSync(path)) return;
  const ledger = JSON.parse(readFileSync(join(root, "capabilities.json"), "utf8")) as { capabilities: { id: string; domain: string }[] };
  const domains = new Map(ledger.capabilities.map((entry) => [entry.id, entry.domain]));
  const declared = JSON.parse(readFileSync(path, "utf8")) as { declines?: Record<string, { kind: string; reason: string; issue?: string }> };
  const loop = `a ${kind.genre} starter`;
  for (const [capability, decline] of Object.entries(declared.declines ?? {})) {
    if (!/TODO/i.test(decline.reason)) continue;
    const domain = domains.get(capability) ?? capability;
    declared.declines![capability] = { kind: "not-applicable", reason: `${made.name} has no ${domain} yet: it is ${loop}, and nothing in its loop uses ${capability}.` };
  }
  writeFileSync(path, `${JSON.stringify(declared, null, 2)}
`);
}
