/**
 * Scaffold a new Games/<id> that passes check-game-shape and boots:
 *
 *   bun run new:game my-game --name "My Game"
 *
 * Generates the full in-repo harness (index.html, vite.config.ts, tsconfig
 * with the required @jgengine path aliases, package.json, src skeleton with a
 * flat() world, a spawning loop, a minimal HUD, and a world test stub) and
 * inserts the root `games:<id>` script alphabetically.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const id = argv.find((value) => !value.startsWith("--"));
const nameFlag = argv.indexOf("--name");
const title = nameFlag !== -1 ? (argv[nameFlag + 1] ?? id) : id;

if (id === undefined || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error("usage: bun run new:game <kebab-case-id> [--name \"Display Name\"]");
  process.exit(1);
}

const repoRoot = resolve(import.meta.dir, "..");
const gameDir = join(repoRoot, "Games", id);
if (existsSync(gameDir)) {
  console.error(`Games/${id} already exists`);
  process.exit(1);
}

const files: Record<string, string> = {
  "package.json": `${JSON.stringify(
    {
      name: `@games/${id}`,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        "check-types": "tsgo --noEmit -p tsconfig.json",
        test: "bun test src",
      },
      dependencies: {
        "@jgengine/core": "workspace:*",
        "@jgengine/react": "workspace:*",
        "@jgengine/shell": "workspace:*",
        "@react-three/fiber": "^9.5.0",
        react: "19.2.3",
        "react-dom": "19.2.3",
        three: "^0.182.0",
      },
      devDependencies: {
        "@tailwindcss/vite": "^4.0.15",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "@types/three": "^0.182.0",
        "@vitejs/plugin-react": "^4.3.4",
        tailwindcss: "^4.0.15",
        typescript: "^5",
        vite: "^6.2.2",
      },
      exports: { ".": "./src/index.tsx", "./*": "./src/*" },
    },
    null,
    2,
  )}\n`,
  "tsconfig.json": `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        types: ["vite/client"],
        paths: {
          "@jgengine/core/*": ["../../packages/core/src/*"],
          "@jgengine/react": ["../../packages/react/src/index.ts"],
          "@jgengine/react/*": ["../../packages/react/src/*"],
          "@jgengine/ws/*": ["../../packages/ws/src/*"],
          "@jgengine/shell/*": ["../../packages/shell/src/*"],
          "@jgengine/assets": ["../../packages/assets/src/index.ts"],
          "@jgengine/assets/*": ["../../packages/assets/src/*"],
        },
      },
      include: ["src"],
      exclude: ["src/**/*.test.ts"],
    },
    null,
    2,
  )}\n`,
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  "vite.config.ts": `import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const engineSrc = (pkg: string) => fileURLToPath(new URL(\`../../packages/\${pkg}/src\`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: existsSync(engineSrc("core"))
      ? [
          { find: /^@jgengine\\/core\\/(.*)$/, replacement: \`\${engineSrc("core")}/$1\` },
          { find: /^@jgengine\\/react\\/(.*)$/, replacement: \`\${engineSrc("react")}/$1\` },
          { find: /^@jgengine\\/ws\\/(.*)$/, replacement: \`\${engineSrc("ws")}/$1\` },
          { find: /^@jgengine\\/shell\\/(.*)$/, replacement: \`\${engineSrc("shell")}/$1\` },
          { find: /^@jgengine\\/assets$/, replacement: \`\${engineSrc("assets")}/index.ts\` },
          { find: /^@jgengine\\/assets\\/(.*)$/, replacement: \`\${engineSrc("assets")}/$1\` },
        ]
      : [],
  },
});
`,
  "src/index.css": `@import "tailwindcss";
@source "../../../packages/react/src";
@source "../../../packages/shell/src";

html,
body,
#root {
  height: 100%;
  margin: 0;
  background: #0c0e12;
}
`,
  "src/main.tsx": `import "./index.css";

import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(<GameHost playable={game} />);
`,
  "src/index.tsx": `export { game } from "./game.config";
`,
  "src/world.ts": `import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { flat, type WorldFeature } from "@jgengine/core/world/features";

export const world: WorldFeature = flat();

export const physics: PhysicsConfig = { gravity: -30 };
`,
  "src/loop.ts": `import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { player } from "./game/entities/players/catalog";

function onInit(ctx: GameContext): void {
  void ctx;
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(player.id, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function onTick(ctx: GameContext, dt: number): void {
  void ctx;
  void dt;
}

export const loop = { onInit, onNewPlayer, onTick };
`,
  "src/game.config.ts": `import { offline } from "@jgengine/core/runtime/adapter";
import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: ${JSON.stringify(title)},
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  multiplayer: offline(),
  content,
  loop,
  GameUI,
  camera: { perspective: "third" },
});
`,
  "src/game/keybinds.ts": `import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  interact: ["KeyE"],
};
`,
  "src/game/entities/players/catalog.ts": `import type { StatCatalog } from "@jgengine/core/scene/entityStats";

export interface PlayerDef {
  id: string;
  name: string;
  walkSpeed: number;
  stats: StatCatalog;
}

export const player: PlayerDef = {
  id: "player",
  name: "Player",
  walkSpeed: 5.4,
  stats: { health: { max: 100 } },
};

export const players: PlayerDef[] = [player];
`,
  "src/game/content.ts": `import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { players } from "./entities/players/catalog";

const playersById = new Map(players.map((entry) => [entry.id, entry]));

function entityById(catalogId: string): GameContextEntityEntry | null {
  const def = playersById.get(catalogId);
  if (def === undefined) return null;
  return { stats: def.stats, movement: { poses: ["standing"], walkSpeed: def.walkSpeed } };
}

export const content: GameContextContent = { entityById };
`,
  "src/game/ui/GameUI.tsx": `import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useEntityStat, usePlayer } from "@jgengine/react/hooks";

function HealthPill() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  return (
    <div className="rounded-sm bg-black/70 px-3 py-1 text-sm font-bold text-emerald-300">
      {Math.round(health?.current ?? 0)} / {Math.round(health?.max ?? 0)} HP
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: ${JSON.stringify(id)} });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      <HudPanel id="health" anchor="bottom-left" compact="keep" interactive={false}>
        <HealthPill />
      </HudPanel>
    </HudCanvas>
  );
}
`,
};

for (const [relative, contents] of Object.entries(files)) {
  const path = join(gameDir, relative);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}

const rootPackagePath = join(repoRoot, "package.json");
const rootPackage = readFileSync(rootPackagePath, "utf-8");
const scriptLine = `    "games:${id}": "bun run --cwd Games/${id} dev",`;
const lines = rootPackage.split("\n");
const gameLines = lines
  .map((line, index) => ({ line, index }))
  .filter((entry) => entry.line.trimStart().startsWith('"games:'));
if (gameLines.length === 0) {
  console.error("could not find games:* scripts block in root package.json — add the script by hand");
} else {
  const insertBefore = gameLines.find((entry) => entry.line > scriptLine);
  if (insertBefore !== undefined) {
    lines.splice(insertBefore.index, 0, scriptLine);
  } else {
    const last = gameLines[gameLines.length - 1]!;
    const lastHadComma = last.line.trimEnd().endsWith(",");
    if (!lastHadComma) lines[last.index] = `${last.line.trimEnd()},`;
    lines.splice(last.index + 1, 0, lastHadComma ? scriptLine : scriptLine.replace(/,$/, ""));
  }
  writeFileSync(rootPackagePath, lines.join("\n"));
  const parsed: unknown = JSON.parse(readFileSync(rootPackagePath, "utf-8"));
  void parsed;
}

const install = Bun.spawnSync(["bun", "install"], { cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
if (install.exitCode !== 0) console.error("bun install failed — run it by hand");

console.log(`Games/${id} scaffolded.`);
console.log(`  play it:   bun run games:${id}`);
console.log(`  verify:    bun run check-types && bun test Games/${id}`);
console.log(`  note:      if check-types reports TS2688 vite/client for the new game, run: bun install --force`);
console.log(`  next:      build catalogs under src/game/ per the jgengine skill intake`);
