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

/** @internal */
export function displayNameFromId(id: string): string {
  return id
    .split("-")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** @internal */
export function displayNameFromInput(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    throw new Error("game name must not be empty");
  }
  if (/\s/.test(trimmed)) return trimmed;
  if (trimmed.includes("-")) return displayNameFromId(trimmed.toLowerCase());
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** @internal */
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

/** @internal */
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

/** @internal */
export function parseCreateName(input: string): { displayName: string; folderName: string; id: string } {
  const displayName = displayNameFromInput(input);
  const folderName = folderNameFromTitle(input);
  const id = packageIdFromFolder(folderName);
  return { displayName, folderName, id };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const indexHtml = (name: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const viteConfig = `import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { standaloneSavePlugin } from "@jgengine/node/devSavePlugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const engineSrc = (pkg: string) => fileURLToPath(new URL(\`../../packages/\${pkg}/src\`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), standaloneSavePlugin()],
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
      "@jgengine/assets": `^${engineVersion}`,
      "@jgengine/core": `^${engineVersion}`,
      "@jgengine/editor": `^${engineVersion}`,
      "@jgengine/react": `^${engineVersion}`,
      "@jgengine/shell": `^${engineVersion}`,
      "@react-three/drei": "^10.7.7",
      "@react-three/fiber": "^9.5.0",
      react: "19.2.3",
      "react-dom": "19.2.3",
      three: "^0.182.0",
    },
    devDependencies: {
      "@jgengine/node": `^${engineVersion}`,
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
      "@jgengine/assets": "workspace:*",
      "@jgengine/core": "workspace:*",
      "@jgengine/editor": "workspace:*",
      "@jgengine/react": "workspace:*",
      "@jgengine/shell": "workspace:*",
      "@react-three/drei": "^10.7.7",
      "@react-three/fiber": "^9.5.0",
      react: "19.2.3",
      "react-dom": "19.2.3",
      three: "^0.182.0",
    },
    devDependencies: {
      "@jgengine/node": "workspace:*",
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

const mainTsx = (id: string) => `import "./index.css";

import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";

import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { GameHost } from "@jgengine/shell/GameHost";

import { game } from "./game.config";

const GAME_ID = "${id}";
if (import.meta.env.DEV) installSaveEndpoint("/__jgengine/save", GAME_ID);

// Editor mode (F2+E / ?mode=editor) loads as a lazy chunk — never bundled into gameplay.
const EditorApp = lazy(async () => {
  const mod = await import("@jgengine/editor");
  return { default: mod.EditorApp as ComponentType<{ gameId: string; playable: typeof game }> };
});

function App() {
  const [editor, setEditor] = useState(
    new URLSearchParams(window.location.search).get("mode") === "editor",
  );
  useEffect(() => {
    if (editor) return;
    const summon = () => setEditor(true);
    (window as { __jgengineSummonEditor?: () => void }).__jgengineSummonEditor = summon;
    let f2Held = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "F2") f2Held = true;
      else if (event.code === "KeyE" && f2Held) {
        event.preventDefault();
        summon();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "F2") f2Held = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      const host = window as { __jgengineSummonEditor?: () => void };
      if (host.__jgengineSummonEditor === summon) delete host.__jgengineSummonEditor;
    };
  }, [editor]);
  if (!editor) return <GameHost playable={game} />;
  return (
    <Suspense fallback={null}>
      <EditorApp gameId={GAME_ID} playable={game} />
    </Suspense>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(<App />);
`;

const indexTsx = `export { game } from "./game.config";
`;

const gameAssetsTs = `import { createStarterCatalog } from "@jgengine/assets";

/** Curated people/props/nature/urban starter packs — resolve asset:person_casual etc. */
export const assets = createStarterCatalog({ basePath: "/models" });
`;

const gameModelsTs = `import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";

/** Drop-in GLTF figures from the curated starter packs (asset:person_casual, …). */
export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  player: { model: "asset:person_casual", style: { targetHeight: 1.8 } },
});

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  crate: { model: "asset:prop_crate", style: { targetHeight: 1.2 } },
  tree: { model: "asset:nature_tree", style: { targetHeight: 4.5 } },
});
`;

const gameConfigTs = (name: string) => `import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { entityById } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels, objectModels } from "./game/models";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: ${JSON.stringify(name)},
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "single" },
  save: "none",
  content: { entityById },
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  entityModels,
  objectModels,
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

/** @internal */
export function onInit(_ctx: GameContext): void {}

/** @internal */
export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(PLAYER, { id: ctx.player.userId, position: SPAWN });
}

/** @internal */
export function onTick(_ctx: GameContext, _dt: number): void {}
`;

const tuningTs = `export const PLAYER = "player";
export const MAX_HEALTH = 5;
export const WALK_SPEED = 4;
export const SPAWN: [number, number, number] = [0, 0, 0];
`;

const contentTs = `import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { MAX_HEALTH, PLAYER, WALK_SPEED } from "./tuning";

/** @internal */
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

const gameUiTsx = (name: string) => `// ${name} — your HUD starts BLANK. The engine imposes nothing; this is the whole HUD.
// Opt into drop-in widgets from "@jgengine/react" as you need them (each is self-styled and reads
// the local player by default), or write your own — anything you return here is your HUD:
//
//   import { StatBar, Hotbar, Speedometer, Clock, WaveBanner, Coins, Crosshair } from "@jgengine/react";
//
//   export function GameUI() {
//     return (
//       <div className="pointer-events-none absolute inset-0 p-4">
//         <StatBar statId="health" tone="health" style={{ position: "absolute", left: 16, bottom: 16 }} />
//         <Hotbar inventoryId="hotbar" style={{ position: "absolute", left: "50%", bottom: 16, transform: "translateX(-50%)" }} />
//         <Clock style={{ position: "absolute", left: 16, top: 16 }} />
//         <Coins currencyId="gold" style={{ position: "absolute", right: 16, top: 16 }} />
//       </div>
//     );
//   }

/** @internal */
export function GameUI() {
  return null;
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

**This project is the game.** Build here, on the \`@jgengine/*\` npm packages. Never clone the jgengine GitHub repo, and never copy code, assets, or content from its \`Games/*\` directory — those are private in-repo test games, not templates, and their content is not licensed for reuse.
- Engine API surface: the skills ship inside every \`@jgengine/*\` tarball — read \`node_modules/@jgengine/<pkg>/skills/\` (each domain skill carries \`SKILL.md\` + a generated \`api.md\` of the full export surface).
- Agent skills — intake router, focused API domains, browserless verify gate: installed by create; recovery via \`npx jgengine skills -p\`.
- Setup broken or UI unstyled: \`npx jgengine doctor\`.

## What to do when the user wants this game built

1. Read skills if present: \`jgengine\` (intake + routing), domain skills as needed, \`jgengine-verify\` (prove it works). They land under \`.agents/skills/\` or \`.claude/skills/\` when scaffolded via create.
2. If skills are missing (your problem, not the user's): \`npx jgengine skills -p\`, or read them straight from \`node_modules/@jgengine/<pkg>/skills/\`.
3. **User-facing first reply is short** — game name, fantasy in 2–4 lines, POV (1st / 3rd / top-down / HUD-only), world kind, scale vibe. Ask a few tight questions (POV, world, multiplayer, how big). **Do not** dump file trees, catalog ids, keybind tables, or full phase plans to the user.
4. Keep the full engineering plan (files, systems, budgets) internal. After they answer, scaffold is already here — build in phases, full game not a slice.

## Engine loaders

- Skills + API docs in every tarball: \`node_modules/@jgengine/<pkg>/skills/\`
- Doctor: \`npx jgengine doctor\`
- Dev: \`bun dev\` / \`npm run dev\`
- Windows installer: \`bun run desktop\` / \`npx jgengine desktop\` (or \`--url https://…\` for a hosted game)

## Built-in modes — every game ships them, use them

The F2 chord family is in every JGengine game, and it is **your** toolkit, not just the player's:

- **F2+D — debug mode**: engine devtools overlay (perf, logs, net, keybinds, live tunables with Save-to-source).
- **F2+C — canvas mode**: drag/resize HUD panels; layout writes to scene document \`ui.panels\` (undoable with live editor).
- **F2+E — editor mode** (also \`?mode=editor\`): the Blender/Unity-style scene editor — place spawns, zones, paths, vegetation; Save writes \`src/editor.scene.json\`.

Prefer these over guessing: tune numbers in debug mode, fix HUD layout in canvas mode, and place/move world content in editor mode instead of hand-editing \`x,y,z\` in tables. Agents drive all three headlessly through \`window.__jgengineAgent.handle({ method: ... })\` on any game page (\`agent_status\`, \`debug_snapshot\`, \`canvas_move_panel\`, \`canvas_resize_panel\`, \`editor_summon\`, editor verbs, \`save_scene\`) — run \`bun dev\`, open the page in your browser tool, and call the bridge. HUD placement lives in \`editor.scene.json\` → \`ui.panels\`; TSX \`HudPanel\` props are fallback-only. See the \`jgengine-editor\` skill.

## Project rules

- Shape: \`src/\` holds only \`game.config.ts\`, \`index.tsx\`, \`main.tsx\`, \`loop.ts\`, \`world.ts\`, \`index.css\`; everything else under \`src/game/\`.
- Entry: \`defineGame({...})\` from \`@jgengine/shell/defineGame\` in \`game.config.ts\`.
- Prove world content with \`summarizeEnvironment\` in \`bun test\` (\`src/game/world.world.test.ts\`), not screenshot loops.
- Tailwind v4: \`@source\` in \`src/index.css\` must cover \`@jgengine/react\` and \`@jgengine/shell\`${
  variant === "in-repo" ? " (engine source under packages/)" : " (dist under node_modules)"
}, or the HUD is silently unstyled.
- Spawn player with \`id === ctx.player.userId\` in \`onNewPlayer\`; \`onTick\` \`dt\` is game time.

## Visual quality bar

"Make it look better" work is screenshot-judged, by you, harshly. Take a shot of live gameplay first and call it honestly — flat untextured ground, default lighting, and an empty horizon "doesn't look like a game" and fails. Then use the whole art stack (terrain texture/variation, materials, lighting/daylight, sky/fog, post-processing, vegetation density, props and landmarks — see the \`jgengine-ui\` skill's "Visual quality bar") and re-shoot at each milestone until the frame reads like a shipped game. Data tests prove content exists; only your eyes prove it looks good.
`;

const editorPackageJson = (engineVersion: string) => `${JSON.stringify(
  {
    name: "jgengine-editor-workspace",
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: {
      "@jgengine/core": `^${engineVersion}`,
      "@jgengine/editor": `^${engineVersion}`,
      "@jgengine/node": `^${engineVersion}`,
      "@jgengine/react": `^${engineVersion}`,
      "@jgengine/shell": `^${engineVersion}`,
      "@react-three/drei": "^10.7.7",
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
      vite: "^6.2.2",
    },
  },
  null,
  2,
)}
`;

const editorIndexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>JGengine Scene Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const editorIndexCss = `@import "tailwindcss";
@source "../node_modules/@jgengine/react/dist";
@source "../node_modules/@jgengine/shell/dist";
@source "../node_modules/@jgengine/editor/dist";

html,
body,
#root {
  height: 100%;
  margin: 0;
  background: #0a0a0a;
}
`;

const editorViteConfig = `import { editorHostPlugin } from "@jgengine/node/editorHostPlugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The folder to author scenes for is handed in by \`jgengine editor <dir>\`.
const dir = process.env.JG_EDITOR_DIR ?? process.cwd();
const assetsDir = process.env.JG_EDITOR_ASSETS;

export default defineConfig({
  plugins: [react(), tailwindcss(), editorHostPlugin({ dir, assetsDir })],
  clearScreen: false,
});
`;

const editorMainTsx = `import "./index.css";

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { EditorLayersInput } from "@jgengine/core/editor/index";
import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { StandaloneEditor, type StandaloneAsset } from "@jgengine/editor";

installSaveEndpoint("/__jgengine/save", "standalone");

interface Manifest {
  scene: EditorLayersInput | null;
  assets: StandaloneAsset[];
}

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    fetch("/__jgengine/manifest")
      .then((response) => response.json() as Promise<Manifest>)
      .then(setManifest)
      .catch(() => setManifest({ scene: null, assets: [] }));
  }, []);
  if (manifest === null) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        Loading workspace…
      </div>
    );
  }
  return (
    <StandaloneEditor
      sceneId="standalone"
      scene={manifest.scene ?? undefined}
      assets={manifest.assets}
    />
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(<App />);
`;

/**
 * Files for the standalone scene-editor workspace `jgengine editor` scaffolds and serves: a Vite app
 * that mounts `@jgengine/editor`'s `StandaloneEditor` over a blank world, loading the target folder's
 * `editor.scene.json` and models through the `@jgengine/node` editor host plugin.
 * @internal
 */
export function editorScaffold(engineVersion: string): TemplateFile[] {
  return [
    { path: "index.html", contents: editorIndexHtml },
    { path: "package.json", contents: editorPackageJson(engineVersion) },
    { path: "vite.config.ts", contents: editorViteConfig },
    { path: "src/index.css", contents: editorIndexCss },
    { path: "src/main.tsx", contents: editorMainTsx },
  ];
}

/** @internal */
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
    { path: "src/main.tsx", contents: mainTsx(id) },
    { path: "src/index.tsx", contents: indexTsx },
    { path: "src/game.config.ts", contents: gameConfigTs(name) },
    { path: "src/loop.ts", contents: loopTs },
    { path: "src/world.ts", contents: worldTs(id) },
    { path: "src/game/assets.ts", contents: gameAssetsTs },
    { path: "src/game/models.ts", contents: gameModelsTs },
    { path: "src/game/tuning.ts", contents: tuningTs },
    { path: "src/game/content.ts", contents: contentTs },
    { path: "src/game/keybinds.ts", contents: keybindsTs },
    { path: "src/game/ui/GameUI.tsx", contents: gameUiTsx(name) },
    { path: "src/game/world.world.test.ts", contents: worldTest(id) },
  ];
}
