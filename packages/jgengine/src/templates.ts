export type TemplateVariant = "standalone" | "in-repo";

/** A marker as it appears in an authored `editor.scene.json` — only the fields the scaffold reads. */
export interface EditorSceneMarker {
  id?: string;
  kind?: string;
  position?: { x: number; y: number; z: number };
  meta?: { on?: string; action?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

/** The subset of an authored scene document the scaffold inspects when promoting a folder. */
export interface EditorSceneDoc {
  version?: number;
  markers?: EditorSceneMarker[];
  [key: string]: unknown;
}

export interface TemplateOptions {
  id: string;
  name: string;
  variant: TemplateVariant;
  engineVersion: string;
  /**
   * An authored scene document to bake in as `src/editor.scene.json` instead of the starter scene —
   * the "promote a scene folder into a game" path (`jgengine create --from-scene`). The generated
   * scene test is tailored to what this document actually ships.
   */
  scene?: EditorSceneDoc;
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

const engineAliases = `[
          { find: /^@jgengine\\/core\\/(.*)$/, replacement: \`\${engineSrc("core")}/$1\` },
          { find: /^@jgengine\\/react\\/(.*)$/, replacement: \`\${engineSrc("react")}/$1\` },
          { find: /^@jgengine\\/ws\\/(.*)$/, replacement: \`\${engineSrc("ws")}/$1\` },
          { find: /^@jgengine\\/shell\\/(.*)$/, replacement: \`\${engineSrc("shell")}/$1\` },
          { find: /^@jgengine\\/editor$/, replacement: \`\${engineSrc("editor")}/index.ts\` },
          { find: /^@jgengine\\/editor\\/(.*)$/, replacement: \`\${engineSrc("editor")}/$1\` },
          { find: /^@jgengine\\/assets$/, replacement: \`\${engineSrc("assets")}/index.ts\` },
          { find: /^@jgengine\\/assets\\/(.*)$/, replacement: \`\${engineSrc("assets")}/$1\` },
        ]`;

// The two variants differ only in the save middleware: a standalone project uses the packaged
// @jgengine/node preset; an in-repo game imports the dev runner's source plugin so a fresh
// monorepo checkout needs no package build before `bun dev`.
const viteConfig = (variant: TemplateVariant) =>
  variant === "in-repo"
    ? `import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { devSavePlugin } from "../../apps/dev/devSavePlugin";

const engineSrc = (pkg: string) => fileURLToPath(new URL(\`../../packages/\${pkg}/src\`, import.meta.url));
const gamesDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), devSavePlugin(gamesDir)],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: existsSync(engineSrc("core"))
      ? ${engineAliases}
      : [],
  },
});
`
    : `import { existsSync } from "node:fs";
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
      ? ${engineAliases}
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
  "@jgengine/react": ["../../packages/react/src/index.ts"],
  "@jgengine/react/*": ["../../packages/react/src/*"],
  "@jgengine/ws/*": ["../../packages/ws/src/*"],
  "@jgengine/shell/*": ["../../packages/shell/src/*"],
  "@jgengine/editor": ["../../packages/editor/src/index.ts"],
  "@jgengine/editor/*": ["../../packages/editor/src/*"],
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
@import "./style.css";
${
  variant === "in-repo"
    ? `@source "../../../packages/react/src";
@source "../../../packages/shell/src";`
    : `@source "../node_modules/@jgengine/react/dist";
@source "../node_modules/@jgengine/shell/dist";`
}
`;

const styleCss = `html,
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
export { editorLayers } from "./editorLayers";
`;

// Starter scene document: the authored spawn plus a few placed catalog props, so the very first
// `bun dev` already renders editor-owned content and F2+E opens a non-empty document.
const editorSceneJson = `{
  "version": 1,
  "markers": [
    {
      "id": "player_spawn",
      "kind": "player_spawn",
      "position": { "x": 0, "y": 0, "z": 8 },
      "label": "Player spawn",
      "color": "#22d3ee"
    },
    { "id": "crate_1", "kind": "prop", "position": { "x": 3, "y": 0, "z": -4 }, "rotationY": 0.4, "label": "Crate", "catalogId": "crate" },
    { "id": "crate_2", "kind": "prop", "position": { "x": 4.4, "y": 0, "z": -2.8 }, "rotationY": 1.2, "label": "Crate", "catalogId": "crate" },
    { "id": "tree_1", "kind": "prop", "position": { "x": -8, "y": 0, "z": -10 }, "label": "Tree", "catalogId": "tree" },
    { "id": "tree_2", "kind": "prop", "position": { "x": 10, "y": 0, "z": -14 }, "rotationY": 2.1, "label": "Tree", "catalogId": "tree" },
    { "id": "tree_3", "kind": "prop", "position": { "x": -12, "y": 0, "z": 4 }, "rotationY": 4.2, "label": "Tree", "catalogId": "tree" },
    {
      "id": "goal",
      "kind": "goal",
      "position": { "x": 0, "y": 0, "z": -18 },
      "label": "Goal — walk here to win",
      "color": "#22c55e",
      "meta": { "on": "enter", "action": "win", "message": "You reached the goal — you win!", "triggerRadius": 3 }
    }
  ]
}
`;

const editorLayersTs = `import { normalizeEditorLayers, type EditorDocument } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The authored scene for this game — spawn, props, and everything you place later (paths, zones,
 * terrain, foliage). Edit it in the editor (F2+E; Ctrl+S saves back to editor.scene.json) instead
 * of hand-editing the JSON or hardcoding coordinates in game code.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorDocument);
`;

const editorLayersTest = `import { describe, expect, test } from "bun:test";

import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "./editorLayers";

describe("authored scene", () => {
  test("ships a player_spawn marker the runtime honors", () => {
    expect(authoredSpawnPosition(editorLayers)).not.toBeNull();
  });

  test("ships placed content", () => {
    expect(editorLayers.markers.length).toBeGreaterThan(1);
  });

  test("ships an authored goal that wins on enter — no game code", () => {
    const goal = editorLayers.markers.find((marker) => marker.kind === "goal");
    expect(goal?.meta?.on).toBe("enter");
    expect(goal?.meta?.action).toBe("win");
  });
});
`;

/** Does this document ship a goal marker that wins the moment the player walks into it? */
function sceneHasWinGoal(scene: EditorSceneDoc): boolean {
  return (scene.markers ?? []).some(
    (marker) => marker.kind === "goal" && marker.meta?.on === "enter" && marker.meta?.action === "win",
  );
}

// The scene test is generated to match the scene it ships: any runnable scene honors an authored
// spawn, so that assertion is always emitted; the win-goal assertion is only emitted when the scene
// actually carries such a goal, so a promoted scene without one still passes.
function editorLayersTestFor(scene: EditorSceneDoc): string {
  const goalBlock = sceneHasWinGoal(scene)
    ? `
  test("ships an authored goal that wins on enter — no game code", () => {
    const goal = editorLayers.markers.find((marker) => marker.kind === "goal");
    expect(goal?.meta?.on).toBe("enter");
    expect(goal?.meta?.action).toBe("win");
  });
`
    : "";
  return `import { describe, expect, test } from "bun:test";

import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "./editorLayers";

describe("authored scene", () => {
  test("ships a player_spawn marker the runtime honors", () => {
    expect(authoredSpawnPosition(editorLayers)).not.toBeNull();
  });
${goalBlock}});
`;
}

const gameAssetsTs = `import { createStarterCatalog } from "@jgengine/assets/catalogs/starter";

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

import { editorLayers } from "./editorLayers";
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
  // The authored scene renders and opens in the editor (F2+E) with zero extra wiring.
  editorLayers,
  entityModels,
  objectModels,
  camera: { perspective: "third" },
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
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";
import {
  createAuthoredTriggerRuntime,
  createTriggerOutcome,
  registerBuiltinTriggerActions,
  type AuthoredTriggerRuntime,
} from "@jgengine/core/scene/authoredTriggers";

import { editorLayers } from "./editorLayers";
import { PLAYER, SPAWN } from "./game/tuning";

// Built-in announce/win/advance actions are authorable in the editor (select an object → Triggers).
// The starter scene ships a "goal" marker with { on: enter, action: win }, so walking to it wins —
// authored in the document, zero game code. Add your own rules in the editor, not here.
registerBuiltinTriggerActions();

/** The win/announce/objective read-model the built-in actions write; GameUI renders it. */
export const outcome = createTriggerOutcome();

let triggers: AuthoredTriggerRuntime | null = null;
function triggerRuntime(): AuthoredTriggerRuntime {
  if (triggers === null) {
    triggers = createAuthoredTriggerRuntime({ document: editorLayers, handlers: outcome.handlers });
  }
  return triggers;
}

/** @internal */
export function onInit(_ctx: GameContext): void {}

/** @internal */
export function onNewPlayer(ctx: GameContext): void {
  // Spawns at the scene's authored player_spawn marker — move it in the editor (F2+E), not here.
  ctx.scene.entity.spawn(PLAYER, {
    id: ctx.player.userId,
    position: authoredSpawnPosition(editorLayers) ?? SPAWN,
  });
}

/** @internal */
export function onTick(ctx: GameContext, _dt: number): void {
  // Feed the local player's pose to the authored triggers; enter/exit/interact fire from the scene.
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  triggerRuntime().step({
    actors: [{ id: ctx.player.userId, position: player.position }],
    interact: ctx.input.justPressed("interact") ? [ctx.player.userId] : [],
  });
}
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

// Binding any movement action makes the shell drive the walk controller — a fresh game walks.
export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW"],
  moveBack: ["KeyS"],
  moveLeft: ["KeyA"],
  moveRight: ["KeyD"],
  jump: ["Space"],
  interact: ["KeyE"],
};
`;

const gameUiTsx = (id: string, name: string) => `import { useSyncExternalStore } from "react";
import { HudCanvas, useHudLayout } from "@jgengine/react";

import { outcome } from "../../loop";

// ${name} — your HUD starts as an empty canvas the engine imposes nothing on. Drop widgets from
// "@jgengine/react" into <HudPanel> slots as you need them (each is self-styled and reads the
// local player by default), or write your own — panel placement is editable live in canvas mode
// (F2+C) and persists to the scene document's ui.panels:
//
//   import { HudPanel, StatBar, Hotbar, Clock, Coins } from "@jgengine/react";
//   <HudPanel id="health" anchor="bottom-left"><StatBar statId="health" tone="health" /></HudPanel>
//   <HudPanel id="hotbar" anchor="bottom-center"><Hotbar inventoryId="hotbar" /></HudPanel>
//   <HudPanel id="clock"  anchor="top-left"><Clock /></HudPanel>
//   <HudPanel id="coins"  anchor="top-right"><Coins currencyId="gold" /></HudPanel>

/** @internal */
export function GameUI() {
  const layout = useHudLayout({ storageKey: ${JSON.stringify(id)} });
  // The built-in trigger actions (announce/win/advance) write here; the starter goal wins on enter.
  const status = useSyncExternalStore(outcome.subscribe, outcome.get, outcome.get);
  const tone = status.won
    ? "bg-emerald-600/90 text-white"
    : status.tone === "warn"
      ? "bg-amber-600/90 text-white"
      : "bg-slate-800/85 text-slate-100";
  return (
    <>
      <HudCanvas layout={layout} className="z-20 font-sans text-slate-100" />
      {status.message !== null ? (
        <div className={"pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-lg px-4 py-2 text-center font-sans text-sm font-semibold shadow-lg " + tone}>
          {status.message}
        </div>
      ) : null}
    </>
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

**This project is the game.** Build here, on the \`@jgengine/*\` npm packages. Never clone the jgengine GitHub repo, and never copy code, assets, or content from its \`Games/*\` directory — those are private in-repo test games, not templates, and their content is not licensed for reuse.
- Engine API surface: the skills ship inside every \`@jgengine/*\` tarball — read \`node_modules/@jgengine/<pkg>/skills/\` (each domain skill carries \`SKILL.md\` + a generated \`api.md\` of the full export surface).
- Agent skills — design playbooks, intake router, focused API domains, browserless verify gate: installed by create; recovery via \`npx jgengine skills -p\`.
- Setup broken or UI unstyled: \`npx jgengine doctor\`.

## What to do when the user wants this game built

1. Read skills if present: \`jgengine\` (intake + routing), \`game-design\` for loops and systems, \`level-design\` for playable spaces, domain skills as needed, and \`jgengine-verify\` for evidence. They land under \`.agents/skills/\` or \`.claude/skills/\` when scaffolded via create.
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

- Shape: \`src/\` holds only \`game.config.ts\`, \`index.tsx\`, \`main.tsx\`, \`loop.ts\`, \`world.ts\`, \`editorLayers.ts\`, \`editorLayers.test.ts\`, \`editor.scene.json\`, \`index.css\`, \`style.css\`; everything else under \`src/game/\`.
- Entry: \`defineGame({...})\` from \`@jgengine/shell/defineGame\` in \`game.config.ts\`.
- World content: the scaffold ships \`src/editor.scene.json\` wired via \`defineGame({ editorLayers })\` — place spawns, props, zones, and paths in editor mode (F2+E, Ctrl+S saves), never as coordinate tables in code. The player spawns at the authored \`player_spawn\` marker (\`authoredSpawnPosition\`).
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
  const { id, name, variant, engineVersion, scene } = options;
  if (!GAME_ID_PATTERN.test(id)) {
    throw new Error(`game id "${id}" must be kebab-case: lowercase letters, digits, dashes, starting with a letter`);
  }
  const sceneContents = scene ? `${JSON.stringify(scene, null, 2)}\n` : editorSceneJson;
  const sceneTest = scene ? editorLayersTestFor(scene) : editorLayersTest;
  return [
    { path: "index.html", contents: indexHtml(name) },
    { path: "vite.config.ts", contents: viteConfig(variant) },
    {
      path: "package.json",
      contents: variant === "in-repo" ? inRepoPackageJson(id) : standalonePackageJson(id, engineVersion),
    },
    { path: "tsconfig.json", contents: tsconfigJson(variant) },
    { path: "AGENTS.md", contents: agentsMd(name, variant) },
    { path: "src/index.css", contents: indexCss(variant) },
    { path: "src/style.css", contents: styleCss },
    { path: "src/main.tsx", contents: mainTsx(id) },
    { path: "src/index.tsx", contents: indexTsx },
    { path: "src/editor.scene.json", contents: sceneContents },
    { path: "src/editorLayers.ts", contents: editorLayersTs },
    { path: "src/editorLayers.test.ts", contents: sceneTest },
    { path: "src/game.config.ts", contents: gameConfigTs(name) },
    { path: "src/loop.ts", contents: loopTs },
    { path: "src/world.ts", contents: worldTs(id) },
    { path: "src/game/assets.ts", contents: gameAssetsTs },
    { path: "src/game/models.ts", contents: gameModelsTs },
    { path: "src/game/tuning.ts", contents: tuningTs },
    { path: "src/game/content.ts", contents: contentTs },
    { path: "src/game/keybinds.ts", contents: keybindsTs },
    { path: "src/game/ui/GameUI.tsx", contents: gameUiTsx(id, name) },
    { path: "src/game/world.world.test.ts", contents: worldTest(id) },
  ];
}
