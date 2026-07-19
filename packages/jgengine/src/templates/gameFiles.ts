import { escapeHtml } from "../escapeHtml";
import type { EditorSceneDoc, TemplateVariant } from "./types";

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

// Tailwind v4 only emits utility classes it finds in @source-scanned files. The F2+E editor summon
// (GameHost) mounts @jgengine/editor's chrome into THIS page, so its classes must be scanned here too
// — omit the editor @source and the summoned editor renders unstyled (all-white, no theme) from day one.
const indexCss = (variant: TemplateVariant, editor: boolean) => `@import "tailwindcss";
@import "./style.css";
${
  variant === "in-repo"
    ? `@source "../../../packages/react/src";
@source "../../../packages/shell/src";${editor ? `\n@source "../../../packages/editor/src";` : ""}`
    : `@source "../node_modules/@jgengine/react/dist";
@source "../node_modules/@jgengine/shell/dist";${editor ? `\n@source "../node_modules/@jgengine/editor/dist";` : ""}`
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

// GameHost owns the whole editor summon (F2+E / ?mode=editor), the agent bridge hook, and the
// DEV-guarded save endpoint — main.tsx stays a mount point.
const mainTsx = (editor: boolean) =>
  editor
    ? `import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<GameHost playable={game} editor={() => import("@jgengine/editor")} />);
`
    : `import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<GameHost playable={game} />);
`;

const indexTsx = (editor: boolean) =>
  editor
    ? `export { game } from "./game.config";
export { editorLayers } from "./editorLayers";
`
    : `export { game } from "./game.config";
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

export interface GameConfigOptions {
  /** Ship world.ts + game/assets.ts + game/models.ts (create --world). */
  world: boolean;
  /** Ship the authored scene document + editor wiring (dropped by create --no-editor). */
  editor: boolean;
}

const gameConfigTs = (name: string, options: GameConfigOptions) => {
  const imports = [
    'import { defineGame } from "@jgengine/shell/gameKit";',
    "",
    ...(options.editor ? ['import { editorLayers } from "./editorLayers";'] : []),
    ...(options.world
      ? ['import { assets } from "./game/assets";', 'import { entityModels, objectModels } from "./game/models";']
      : []),
    'import { GameUI } from "./game/ui/GameUI";',
    'import { onNewPlayer, systems } from "./loop";',
    ...(options.world ? ['import { world } from "./world";'] : []),
  ];
  const fields = [
    `  name: ${JSON.stringify(name)},`,
    // The world carries its own physics (laws of the place) — no separate physics field to wire.
    ...(options.world ? ["  assets,", "  world,"] : []),
    "  // Binding any movement action makes the shell drive the walk controller — a fresh game walks.",
    "  input: {",
    '    moveForward: ["KeyW"],',
    '    moveBack: ["KeyS"],',
    '    moveLeft: ["KeyA"],',
    '    moveRight: ["KeyD"],',
    '    jump: ["Space"],',
    '    interact: ["KeyE"],',
    "  },",
    "  systems,",
    "  loop: { onNewPlayer },",
    "  GameUI,",
    ...(options.editor
      ? [
          "  // The authored scene renders and opens in the editor (F2+E) with zero extra wiring.",
          "  editorLayers,",
        ]
      : []),
    ...(options.world ? ["  entityModels,", "  objectModels,"] : []),
  ];
  return `${imports.join("\n")}

export const game = defineGame({
${fields.join("\n")}
});
`;
};

const worldTs = (id: string) => `import { world as place } from "@jgengine/core/world/place";

// The world is the place you play in: substrate + laws. Dress the place — sky look, foliage,
// props, sculpt — in the editor (F2+E), which writes editor.scene.json; never here. With no
// authored sky the engine renders its default sky.
export const world = place({
  id: "${id}",
  ground: { mode: "flat", size: { x: Infinity, z: Infinity } },
  physics: { gravity: -24 },
});
`;

const editorLoopTs = `import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  createAuthoredTriggerRuntime,
  createTriggerOutcome,
  registerBuiltinTriggerActions,
  type AuthoredTriggerRuntime,
} from "@jgengine/core/scene/authoredTriggers";
import { authoredEntitySpawns } from "@jgengine/core/world/authoredEntities";
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";

// Built-in announce/win/advance actions are authorable in the editor (select an object → Triggers).
// The starter scene ships a "goal" marker with { on: enter, action: win }, so walking to it wins —
// authored in the document, zero game code. Add your own rules in the editor, not here.
registerBuiltinTriggerActions();

/** The win/announce/objective read-model the built-in actions write; GameUI renders it. */
export const outcome = createTriggerOutcome();

const ORIGIN: [number, number, number] = [0, 0, 0];
let triggers: AuthoredTriggerRuntime | null = null;

/** Spawns the authored scene's entities and steps its triggers — content stays in the editor. */
export const systems = [
  defineSystem({
    id: "authored-scene",
    tick: { type: "frame" },
    create(ctx) {
      // Every authored mob/boss marker spawns at its placed position — place entities in the
      // editor (F2+E), not here.
      for (const spawn of authoredEntitySpawns(editorLayers)) {
        ctx.scene.entity.spawn(spawn.catalogId, { id: spawn.markerId, position: spawn.position });
      }
      triggers = createAuthoredTriggerRuntime({ document: editorLayers, handlers: outcome.handlers });
    },
    update(ctx) {
      // Feed the local player's pose to the authored triggers; enter/exit/interact fire from the scene.
      const player = ctx.scene.entity.get(ctx.player.userId);
      if (player === null || triggers === null) return;
      triggers.step({
        actors: [{ id: ctx.player.userId, position: player.position }],
        interact: ctx.input.justPressed("interact") ? [ctx.player.userId] : [],
      });
    },
  }),
];

/** @internal */
export function onNewPlayer(ctx: GameContext): void {
  // Spawns at the scene's authored player_spawn marker — move it in the editor (F2+E), not here.
  ctx.scene.entity.spawn("player", {
    id: ctx.player.userId,
    position: authoredSpawnPosition(editorLayers) ?? ORIGIN,
  });
}
`;

const plainLoopTs = `import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineSystem } from "@jgengine/shell/gameKit";

const ORIGIN: [number, number, number] = [0, 0, 0];

/** Your game rules tick here — one system per meaningful capability. */
export const systems = [
  defineSystem({
    id: "rules",
    tick: { type: "fixed" },
    update(_ctx, _dt) {},
  }),
];

/** @internal */
export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: ORIGIN });
}
`;

const loopTs = (editor: boolean) => (editor ? editorLoopTs : plainLoopTs);

const gameUiTsx = (id: string, name: string, editor: boolean) => {
  const header = `// ${name} — GameUI starts empty on purpose. Every game owns its UI: write a short UI art
// direction, then build custom panels for this pitch. The engine supplies layout (HudCanvas /
// HudPanel), data hooks, and interaction models — not a finished stock HUD. Do not ship
// default StatBar/Hotbar/Coins/glass frames as the product face; compose game-owned chrome
// (see jgengine-ui). Panel placement is editable live in canvas mode (F2+C) and can persist
// to the scene document's ui.panels.`;
  if (!editor) {
    return `import { HudCanvas, useHudLayout } from "@jgengine/react";

${header}

/** @internal */
export function GameUI() {
  const layout = useHudLayout({ storageKey: ${JSON.stringify(id)} });
  return <HudCanvas layout={layout} className="z-20 font-sans text-slate-100" />;
}
`;
  }
  return `import { useSyncExternalStore } from "react";
import { HudCanvas, useHudLayout } from "@jgengine/react";

import { outcome } from "../../loop";

${header}

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
};

const agentsMd = (name: string, variant: TemplateVariant) => `# ${name} — agent briefing

You are in a **JGengine** game project. JGengine is a pure-TypeScript game engine SDK on npm (\`@jgengine/core\`, \`react\`, \`shell\`, …). Site: https://jgengine.com · source: https://github.com/Noisemaker111/jgengine

**How people use JGengine:** they say *Make a game that … with jgengine* to an agent. They do **not** start from a CLI tutorial. \`npx jgengine\` is for **you** (scaffold, skills, docs).

**This project is the game.** Build here, on the \`@jgengine/*\` npm packages. Never clone the jgengine GitHub repo, and never copy code, assets, or content from its \`Games/*\` directory — those are private in-repo test games, not templates, and their content is not licensed for reuse.

## Path to a playable game

1. Start from \`.claude/skills/jgengine/recipes/minimal-game.md\` — the default end-to-end path, installed with the project skills. Skills missing (your problem, not the user's): \`npx jgengine skills -p\` restores the minimal set; add \`--all\` for the full domain skills when the game outgrows it.
2. Discovery ladder: a skill's \`capabilities.md\` → its recipes → package source under \`node_modules/@jgengine/<pkg>/\` — never a full api inventory.
3. Import from \`@jgengine/shell/gameKit\` first — the happy-path surface (\`defineGame\`, \`defineSystem\`, \`GameHost\`, HUD primitives, editor-layer helpers). Reach for deeper module paths only when the kit lacks the seam.
4. **User-facing first reply is short** — game name, fantasy in 2–4 lines, POV (1st / 3rd / top-down / HUD-only), world kind, scale vibe. Ask a few tight questions. **Do not** dump file trees, catalog ids, keybind tables, or full phase plans to the user. Keep the engineering plan internal.
5. Setup broken or UI unstyled: \`npx jgengine doctor\`. Dev: \`bun dev\`. Windows installer: \`npx jgengine desktop\`.

## Built-in modes — engine-owned via GameHost, use them

\`GameHost\` owns the F2 chord family in every JGengine game, and it is **your** toolkit, not just the player's:

- **F2+E — editor mode** (also \`?mode=editor\`): the scene editor on \`src/editor.scene.json\` — place spawns, props, zones, paths, vegetation; Ctrl+S saves.
- **F2+D — debug mode**: engine devtools overlay (perf, logs, keybinds, live tunables with Save-to-source).
- **F2+C — canvas mode**: drag/resize HUD panels; layout persists to the scene document's \`ui.panels\`.

Author world content in the editor — never as coordinate tables in code. Agents drive all three headlessly through \`window.__jgengineAgent.handle({ method: ... })\` on any running game page (\`agent_status\`, \`debug_snapshot\`, \`canvas_move_panel\`, \`editor_summon\`, editor verbs, \`save_scene\`) — run \`bun dev\`, open the page in your browser tool, and call the bridge. See the \`jgengine-editor\` skill.

## Project rules

- Shape: \`src/\` holds only \`game.config.ts\`, \`index.tsx\`, \`main.tsx\`, \`index.css\`, \`style.css\` plus optional \`loop.ts\`, \`world.ts\`, \`editorLayers.ts\`, \`editorLayers.test.ts\`, \`editor.scene.json\`; everything else under \`src/game/\`.
- Entry: \`defineGame({...})\` in \`game.config.ts\`; \`editorLayers\` passed to defineGame auto-mounts the authored scene, and the player spawns at the authored \`player_spawn\` marker.
- Spawn player with \`id === ctx.player.userId\` in \`onNewPlayer\`; systems (\`defineSystem\`) own the rules tick.
- Tailwind v4: \`@source\` in \`src/index.css\` must cover \`@jgengine/react\`, \`@jgengine/shell\`, and \`@jgengine/editor\`${
  variant === "in-repo" ? " (engine source under packages/)" : " (dist under node_modules)"
}, or the HUD — and the F2+E editor chrome mounted into this same page — is silently unstyled.
- Visual claims are screenshot-judged, by you, harshly — flat untextured ground and an empty horizon fail. Prove content with \`bun test\`, prove looks with your eyes (\`jgengine-verify\` skill).
`;

export {
  agentsMd,
  editorLayersTest,
  editorLayersTestFor,
  editorLayersTs,
  editorSceneJson,
  gameAssetsTs,
  gameConfigTs,
  gameModelsTs,
  gameUiTsx,
  indexCss,
  indexHtml,
  indexTsx,
  inRepoPackageJson,
  loopTs,
  mainTsx,
  standalonePackageJson,
  styleCss,
  tsconfigJson,
  viteConfig,
  worldTs,
};
