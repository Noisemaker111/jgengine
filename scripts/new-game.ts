/**
 * Scaffold a new Games/<id> that passes check-game-shape and boots:
 *
 *   bun run new:game my-game --name "My Game"
 *
 * Thin wrapper over the same template `npx jgengine create` uses — one template source, so the
 * in-repo and external scaffolds can never drift. Emits the full in-repo harness (standalone dev
 * harness, tsconfig path aliases, walkable WASD skeleton, wired editor.scene.json + editorLayers,
 * HUD canvas, world test stub) and inserts the root `games:<id>` script alphabetically.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { registerRootGameScript } from "../packages/jgengine/src/create";
import { displayNameFromId, gameTemplate } from "../packages/jgengine/src/templates";

const argv = process.argv.slice(2);
const id = argv.find((value) => !value.startsWith("--"));
const nameFlag = argv.indexOf("--name");

if (id === undefined || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('usage: bun run new:game <kebab-case-id> [--name "Display Name"]');
  process.exit(1);
}

const title = nameFlag !== -1 ? (argv[nameFlag + 1] ?? displayNameFromId(id)) : displayNameFromId(id);

const repoRoot = resolve(import.meta.dir, "..");
const gameDir = join(repoRoot, "Games", id);
if (existsSync(gameDir)) {
  console.error(`Games/${id} already exists`);
  process.exit(1);
}

for (const file of gameTemplate({ id, name: title, variant: "in-repo", engineVersion: "0.0.0" })) {
  const path = join(gameDir, file.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, file.contents);
}

registerRootGameScript(repoRoot, id);

const install = Bun.spawnSync(["bun", "install"], { cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
if (install.exitCode !== 0) console.error("bun install failed — run it by hand");

console.log(`Games/${id} scaffolded.`);
console.log(`  play it:   bun run games:${id}`);
console.log(`  editor:    F2+E in the running game opens src/editor.scene.json (Ctrl+S saves)`);
console.log(`  verify:    bun run check-types && bun test Games/${id}`);
console.log(`  models:    pull starter packs once so GLBs resolve:`);
console.log(`             bun run --cwd packages/assets src/cli/pull.ts pull kaykit-adventurers --dir ../../apps/dev/public`);
console.log(`             bun run --cwd packages/assets src/cli/pull.ts pull kaykit-dungeon --dir ../../apps/dev/public`);
console.log(`             bun run --cwd packages/assets src/cli/pull.ts pull quaternius-stylized-nature --dir ../../apps/dev/public`);
console.log(`  shoot:     bun run shoot --serve   # then: bun run shoot ${id} --mode play`);
console.log(`  note:      if check-types reports TS2688 vite/client for the new game, run: bun install --force`);
console.log(`  next:      build catalogs under src/game/ per the jgengine skill intake`);
