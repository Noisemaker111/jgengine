export type TemplateVariant = "standalone" | "in-repo";

export interface TemplateOptions {
  id: string;
  name: string;
  variant: TemplateVariant;
  engineVersion: string;
}

export interface TemplateFile {
  path: string;
  contents: string;
}

export const GAME_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const FOLDER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;

export function displayNameFromId(id: string): string {
  return id
    .split("-")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function displayNameFromInput(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    throw new Error("game name must not be empty");
  }
  if (/\s/.test(trimmed)) return trimmed;
  if (trimmed.includes("-")) return displayNameFromId(trimmed.toLowerCase());
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function folderNameFromTitle(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ");
  if (cleaned.length === 0) {
    throw new Error("game name must not be empty");
  }
  const folder = cleaned
    .split(" ")
    .filter((part) => part.length > 0)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!FOLDER_NAME_PATTERN.test(folder)) {
    throw new Error(
      `folder name "${folder}" must start with a letter and contain only letters, digits, and dashes`,
    );
  }
  return folder;
}

export function packageIdFromFolder(folder: string): string {
  const id = folder
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!GAME_ID_PATTERN.test(id)) {
    throw new Error(
      `package id "${id}" must be kebab-case: lowercase letters, digits, dashes, starting with a letter`,
    );
  }
  return id;
}

export function parseCreateName(input: string): { displayName: string; folderName: string; id: string } {
  const displayName = displayNameFromInput(input);
  const folderName = folderNameFromTitle(input);
  const id = packageIdFromFolder(folderName);
  return { displayName, folderName, id };
}

const indexHtml = (name: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const viteConfig = `import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const engineSrc = (pkg: string) => fileURLToPath(new URL(\`../../packages/\${pkg}/src\`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
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
`;

const standalonePackageJson = (id: string, engineVersion: string) => `${JSON.stringify(
  {
    name: id,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      desktop: "jgengine desktop",
      preview: "vite preview",
      "check-types": "tsc --noEmit -p tsconfig.json",
      test: "bun test src",
    },
    dependencies: {
      "@jgengine/core": `^${engineVersion}`,
      "@jgengine/react": `^${engineVersion}`,
      "@jgengine/shell": `^${engineVersion}`,
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
  },
  null,
  2,
)}
`;

const inRepoPackageJson = (id: string) => `${JSON.stringify(
  {
    name: `@games/${id}`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      desktop: "jgengine desktop",
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
    exports: {
      ".": "./src/index.tsx",
      "./*": "./src/*",
    },
  },
  null,
  2,
)}
`;

const sharedCompilerOptions = {
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
};

export const IN_REPO_TSCONFIG_PATHS: Record<string, string[]> = {
  "@jgengine/core/*": ["../../packages/core/src/*"],
  "@jgengine/react/*": ["../../packages/react/src/*"],
  "@jgengine/ws/*": ["../../packages/ws/src/*"],
  "@jgengine/shell/*": ["../../packages/shell/src/*"],
  "@jgengine/assets": ["../../packages/assets/src/index.ts"],
  "@jgengine/assets/*": ["../../packages/assets/src/*"],
};

const tsconfigJson = (variant: TemplateVariant) => `${JSON.stringify(
  {
    compilerOptions:
      variant === "in-repo" ? { ...sharedCompilerOptions, paths: IN_REPO_TSCONFIG_PATHS } : sharedCompilerOptions,
    include: ["src"],
    exclude: ["src/**/*.test.ts"],
  },
  null,
  2,
)}
`;

const indexCss = (variant: TemplateVariant) => `@import "tailwindcss";
${
  variant === "in-repo"
    ? `@source "../../../packages/react/src";
@source "../../../packages/shell/src";`
    : `@source "../node_modules/@jgengine/react/dist";
@source "../node_modules/@jgengine/shell/dist";`
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  background: #0a0a0a;
}
`;

const mainTsx = `import "./index.css";

import { createRoot } from "react-dom/client";

import { GameHost } from "@jgengine/shell/GameHost";

import { game } from "./game.config";

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(<GameHost playable={game} />);
`;

const indexTsx = `export { game } from "./game.config";
`;

const gameConfigTs = (name: string) => `import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGame } from "@jgengine/shell/defineGame";

import { entityById } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "${name}",
  assets: createAssetCatalog(),
  world,
  physics,
  input: keybinds,
  server: { mode: "single" },
  save: "none",
  content: { entityById },
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
});
`;

const worldTs = (id: string) => `import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, grass, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({ bounds: { w: 96, d: 96 }, height: 0, material: "grass" }),
  sky: sky({ preset: "day" }),
  vegetation: grass({ area: { w: 80, d: 80 }, density: 2, colors: ["#3f7d2d", "#6bbf4a"], seed: "${id}" }),
});

export const physics: PhysicsConfig = { gravity: -24 };
`;

const loopTs = `import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { PLAYER, SPAWN } from "./game/tuning";

export function onInit(_ctx: GameContext): void {}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(PLAYER, { id: ctx.player.userId, position: SPAWN });
}

export function onTick(_ctx: GameContext, _dt: number): void {}
`;

const tuningTs = `export const PLAYER = "player";
export const MAX_HEALTH = 5;
export const WALK_SPEED = 4;
export const SPAWN: [number, number, number] = [0, 0, 0];
`;

const contentTs = `import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { MAX_HEALTH, PLAYER, WALK_SPEED } from "./tuning";

export function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId === PLAYER) {
    return {
      role: "player",
      stats: { health: { max: MAX_HEALTH, min: 0 } },
      receive: { damage: { order: ["health"] } },
      movement: { walkSpeed: WALK_SPEED },
    };
  }
  return null;
}
`;

const keybindsTs = `import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

export const keybinds: ActionCodesMap = {
  interact: ["KeyE"],
};
`;

const gameUiTsx = (name: string) => `import { useEntityStat, usePlayer } from "@jgengine/react/hooks";

import { MAX_HEALTH } from "../tuning";

function Hearts({ userId }: { userId: string }) {
  const health = useEntityStat(userId, "health");
  const current = health === null ? MAX_HEALTH : Math.round(health.current);
  const max = health === null ? MAX_HEALTH : Math.round(health.max);
  return (
    <div className="flex items-center gap-1" aria-label="health">
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={index < current ? "text-lg leading-none text-rose-400" : "text-lg leading-none text-white/20"}
        >
          {index < current ? "\\u2665" : "\\u2661"}
        </span>
      ))}
    </div>
  );
}

export function GameUI() {
  const { userId } = usePlayer();
  return (
    <div className="pointer-events-none absolute inset-0 p-4 text-white">
      <div className="flex w-fit items-center gap-4 rounded-lg bg-black/40 px-3 py-2 backdrop-blur">
        <span className="text-sm font-semibold tracking-wide">${name}</span>
        <Hearts userId={userId} />
      </div>
    </div>
  );
}
`;

const worldTest = (id: string) => `import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { world } from "../world";

describe("${id} world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has the expected backdrop content", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.vegetationFields).toBe(1);
  });

  test("terrain resolves to a finite ground plane", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });
});
`;

const agentsMd = (name: string, variant: TemplateVariant) => `# ${name} — agent briefing

You are in a **JGengine** game project. JGengine is a pure-TypeScript game engine SDK on npm (\`@jgengine/core\`, \`react\`, \`shell\`, …). Site: https://jgengine.com · source: https://github.com/Noisemaker111/jgengine

**How people use JGengine:** they say *Make a game that … with jgengine* to an agent. They do **not** start from a CLI tutorial. \`npx jgengine\` is for **you** (scaffold, skills, docs).
- Engine API surface: \`npx jgengine llms core\` (any package name works) prints the packaged API docs.
- Agent skills — intake router, focused API domains, browserless verify gate: installed by create; recovery via \`npx jgengine skills -p\`.
- Setup broken or UI unstyled: \`npx jgengine doctor\`.

## What to do when the user wants this game built

1. Read skills if present: \`jgengine\` (intake + routing), domain skills as needed, \`jgengine-verify\` (prove it works). They land under \`.agents/skills/\` or \`.claude/skills/\` when scaffolded via create.
2. If skills are missing (your problem, not the user's): \`npx jgengine skills -p\` or use this file + \`npx jgengine llms core\`.
3. **User-facing first reply is short** — game name, fantasy in 2–4 lines, POV (1st / 3rd / top-down / HUD-only), world kind, scale vibe. Ask a few tight questions (POV, world, multiplayer, how big). **Do not** dump file trees, catalog ids, keybind tables, or full phase plans to the user.
4. Keep the full engineering plan (files, systems, budgets) internal. After they answer, scaffold is already here — build in phases, full game not a slice.

## Engine loaders

- API docs in the tarball: \`npx jgengine llms core\` (any package: react, shell, …)
- Doctor: \`npx jgengine doctor\`
- Dev: \`bun dev\` / \`npm run dev\`
- Windows installer: \`bun run desktop\` / \`npx jgengine desktop\` (or \`--url https://…\` for a hosted game)

## Project rules

- Shape: \`src/\` holds only \`game.config.ts\`, \`index.tsx\`, \`main.tsx\`, \`loop.ts\`, \`world.ts\`, \`index.css\`; everything else under \`src/game/\`.
- Entry: \`defineGame({...})\` from \`@jgengine/shell/defineGame\` in \`game.config.ts\`.
- Prove world content with \`summarizeEnvironment\` in \`bun test\` (\`src/game/world.world.test.ts\`), not screenshot loops.
- Tailwind v4: \`@source\` in \`src/index.css\` must cover \`@jgengine/react\` and \`@jgengine/shell\`${
  variant === "in-repo" ? " (engine source under packages/)" : " (dist under node_modules)"
}, or the HUD is silently unstyled.
- Spawn player with \`id === ctx.player.userId\` in \`onNewPlayer\`; \`onTick\` \`dt\` is game time.
`;

export function gameTemplate(options: TemplateOptions): TemplateFile[] {
  const { id, name, variant, engineVersion } = options;
  if (!GAME_ID_PATTERN.test(id)) {
    throw new Error(`game id "${id}" must be kebab-case: lowercase letters, digits, dashes, starting with a letter`);
  }
  return [
    { path: "index.html", contents: indexHtml(name) },
    { path: "vite.config.ts", contents: viteConfig },
    {
      path: "package.json",
      contents: variant === "in-repo" ? inRepoPackageJson(id) : standalonePackageJson(id, engineVersion),
    },
    { path: "tsconfig.json", contents: tsconfigJson(variant) },
    { path: "AGENTS.md", contents: agentsMd(name, variant) },
    { path: "src/index.css", contents: indexCss(variant) },
    { path: "src/main.tsx", contents: mainTsx },
    { path: "src/index.tsx", contents: indexTsx },
    { path: "src/game.config.ts", contents: gameConfigTs(name) },
    { path: "src/loop.ts", contents: loopTs },
    { path: "src/world.ts", contents: worldTs(id) },
    { path: "src/game/tuning.ts", contents: tuningTs },
    { path: "src/game/content.ts", contents: contentTs },
    { path: "src/game/keybinds.ts", contents: keybindsTs },
    { path: "src/game/ui/GameUI.tsx", contents: gameUiTsx(name) },
    { path: "src/game/world.world.test.ts", contents: worldTest(id) },
  ];
}
