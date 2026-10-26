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

/**
 * The one command that fills `public/models` for a scaffolded game. `starter` is a meta-id the
 * assets CLI resolves to every pack the starter catalog needs. It names the package, not its `assets`
 * bin: npx only finds a bare bin through npm's own `.bin` shims, which bun and pnpm installs do not
 * write on Windows, so `npx assets` there asks the registry for an unrelated package.
 */
export const ASSETS_PULL_HINT = "npx @jgengine/assets pull starter";

/**
 * Engine modules a game on the npm packages keeps out of Vite's dependency pre-bundling: their
 * `.js?url` imports are bundler-only, and the pre-bundler's esbuild cannot read them (the dev server
 * dies on first load). Vite serves them unbundled instead, where `?url` works.
 */
export const UNBUNDLED_ENGINE_MODULES = ["@jgengine/shell/render/decoderFiles"] as const;

/** The `optimizeDeps` line of a standalone game's or editor workspace's `vite.config.ts`. */
export const standaloneOptimizeDeps = `  // Engine files with \`.js?url\` imports, which Vite's dependency pre-bundler cannot read.
  optimizeDeps: { exclude: ${JSON.stringify(UNBUNDLED_ENGINE_MODULES)} },`;

// A standalone project saves through the packaged @jgengine/node preset. An in-repo game runs on
// the games' shared wiring (games/shared): engine source aliases with one copy of each peer, asset
// provisioning, and an idle exit; the dev runner (apps/dev) serves its F2 saves.
const viteConfig = (variant: TemplateVariant) =>
  variant === "in-repo"
    ? `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { viteProvisionAssets } from "../shared/provisionAssets";
import { engineSource } from "../shared/viteEngineSource";

export default defineConfig({
  resolve: engineSource(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss(), viteIdleExit(), viteProvisionAssets()],
  clearScreen: false,
  build: { target: "es2022" },
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
${standaloneOptimizeDeps}
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: existsSync(engineSrc("core"))
      ? ${engineAliases}
      : [],
  },
});
`;

const standalonePackageJson = (id: string, engineVersion: string, cliVersion: string, editor: boolean) => `${JSON.stringify(
  {
    name: id,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      desktop: "npx jgengine desktop",
      preview: "vite preview",
      shoot: "jgengine shoot",
      drive: "jgengine drive",
      "check-types": "tsc --noEmit -p tsconfig.json",
      test: "bun test src",
    },
    dependencies: {
      "@jgengine/assets": `^${engineVersion}`,
      "@jgengine/core": `^${engineVersion}`,
      ...(editor ? { "@jgengine/editor": `^${engineVersion}` } : {}),
      "@jgengine/react": `^${engineVersion}`,
      "@jgengine/shell": `^${engineVersion}`,
      "@react-three/drei": "^10.7.7",
      "@react-three/fiber": "^9.5.0",
      react: "19.2.3",
      "react-dom": "19.2.3",
      three: "^0.182.0",
    },
    devDependencies: {
      jgengine: cliVersion,
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
      shoot: "jgengine shoot",
      drive: "jgengine drive",
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
      jgengine: "workspace:*",
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

// An in-repo game takes the engine source paths from the repo's tsconfig.base.json (via games/).
const tsconfigJson = (variant: TemplateVariant) => `${JSON.stringify(
  {
    ...(variant === "in-repo" ? { extends: "../tsconfig.base.json" } : {}),
    compilerOptions: sharedCompilerOptions,
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
@import "${variant === "in-repo" ? "../../../packages/react/src/styles.css" : "@jgengine/react/styles.css"}";
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

const gitignore = `node_modules/
dist/
shots/
*.log
.DS_Store
`;


// GameHost owns the whole editor summon (F2+E / ?mode=editor), the agent bridge hook, and the
// DEV-guarded save endpoint — main.tsx stays a mount point.
// An in-repo game names itself by its folder id, the id the dev runner and world host use.
const mainTsx = (editor: boolean, variant: TemplateVariant, id: string) => {
  const props = [
    "playable={game}",
    ...(variant === "in-repo" ? [`gameId="${id}"`] : []),
    ...(editor ? ['editor={() => import("@jgengine/editor")}'] : []),
  ].join(" ");
  return `import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<GameHost ${props} />);
`;
};

const indexTsx = (editor: boolean) =>
  editor
    ? `export { game } from "./game.config";
export { editorLayers } from "./editorLayers";
`
    : `export { game } from "./game.config";
`;

// Starter scene document: the authored spawn plus a few placed catalog props, so the very first
// `bun dev` already renders editor-owned content and F2+E opens a non-empty document. Content sits
// at +Z of the spawn because rotationY 0 faces +Z: the follow camera frames it and W walks to the goal.
/**
 * Seeded sky for a new 3D scene: the `day` preset honors intensities and custom tints, so the first
 * frame reads bright, and the sun sits low ahead-left of the spawn's +Z facing so its glow is in
 * frame. Retune in the editor lighting workspace (F2+E), which rewrites this block.
 */
export const STARTER_ENVIRONMENT = {
  preset: "day",
  zenithColor: "#2c6cc6",
  horizonColor: "#cfe4f5",
  sunAzimuth: 128,
  sunElevation: 20,
  fog: { color: "#cfe4f5", near: 90, far: 460 },
} as const;

const editorSceneJson = `{
  "version": 1,
  "markers": [
    {
      "id": "player_spawn",
      "kind": "player_spawn",
      "position": { "x": 0, "y": 0, "z": -8 },
      "label": "Player spawn",
      "color": "#22d3ee"
    },
    { "id": "crate_1", "kind": "prop", "position": { "x": -3, "y": 0, "z": 4 }, "rotationY": 0.4, "label": "Crate", "catalogId": "crate" },
    { "id": "crate_2", "kind": "prop", "position": { "x": -4.4, "y": 0, "z": 2.8 }, "rotationY": 1.2, "label": "Crate", "catalogId": "crate" },
    { "id": "tree_1", "kind": "prop", "position": { "x": 8, "y": 0, "z": 10 }, "label": "Tree", "catalogId": "tree" },
    { "id": "tree_2", "kind": "prop", "position": { "x": -10, "y": 0, "z": 14 }, "rotationY": 2.1, "label": "Tree", "catalogId": "tree" },
    { "id": "tree_3", "kind": "prop", "position": { "x": 12, "y": 0, "z": -4 }, "rotationY": 4.2, "label": "Tree", "catalogId": "tree" },
    {
      "id": "goal",
      "kind": "goal",
      "position": { "x": 0, "y": 0, "z": 18 },
      "label": "Goal — walk here to win",
      "color": "#22c55e",
      "meta": { "on": "enter", "action": "win", "message": "You reached the goal — you win!", "triggerRadius": 3 }
    }
  ],
  "environment": ${JSON.stringify(STARTER_ENVIRONMENT)}
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

const gameModelsTs = (player = "asset:person_casual") => `import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";

/** Drop-in GLTF figures from the curated starter packs (asset:person_casual, …). */
export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  player: { model: ${JSON.stringify(player)}, style: { targetHeight: 1.8 } },
});

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  crate: { model: "asset:prop_crate", style: { targetHeight: 1.2 } },
  tree: { model: "asset:nature_tree", style: { targetHeight: 4.5 } },
});
`;

export interface GameConfigOptions {
  /** Ship world.ts + game/assets.ts + game/models.ts (every 3d template). */
  world: boolean;
  /** Ship the authored scene document + editor wiring (dropped by create --no-editor). */
  editor: boolean;
}

const gameConfigTs = (name: string, options: GameConfigOptions) => {
  const imports = [
    'import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";',
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
    "  simulation: { hz: 60 },",
    "  // Pick the look for this game's art direction: cinematic | photoreal | toon | comic | retro, or an explicit postProcessing stack.",
    '  look: "cinematic",',
    "  // The light: day | bright | golden | dusk | overcast | night, or { preset, sun, skyColor, fog, saturation } to move a few tokens.",
    '  mood: "day",',
    // The world carries its own physics (laws of the place) — no separate physics field to wire.
    ...(options.world ? ["  assets,", "  world,"] : []),
    "  // Binding any movement action makes the shell drive the walk controller — a fresh game walks.",
    "  input: { ...DEFAULT_WALK_CODES, interact: [\"KeyE\"] },",
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

const flatWorldTs = (id: string) => `import { world as place } from "@jgengine/core/placement/place";

// The world is the place you play in: substrate + laws. Dress the place — sky look, foliage,
// props, sculpt — in the editor (F2+E), which writes editor.scene.json; never here.
export const world = place({
  id: "${id}",
  ground: { mode: "flat", size: { x: Infinity, z: Infinity } },
  physics: { gravity: -24 },
});
`;

const TERRAIN_TUNING = `    material: "grass",
    colors: { low: "#4f7f35", high: "#7d9a4a" },
    // Keeps the detail shader's sand band below the hills; raise it when you add water.
    waterLevel: -40,
    detail: {},`;

const terrainWorldTs = (editor: boolean) =>
  editor
    ? `import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, sky, terrain } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";

// The hills (terrain sculpt), footprint, clearings under spawns, and sky all live in
// editor.scene.json — reshape them in the editor (F2+E). This file only picks the ground palette.
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: 960, d: 960 } });

export const world = environment({
  terrain: terrain({
    bounds: authored.bounds,
    segments: 192,
${TERRAIN_TUNING}
  }),
  sky: sky(authored.sky ?? {}),
  ...(authored.sculpt === undefined ? {} : { sculpt: authored.sculpt }),
  clearings: authored.clearings,
});
`
    : `import { environment, sky, terrain } from "@jgengine/core/world/features";

export const world = environment({
  terrain: terrain({
    bounds: { w: 960, d: 960 },
${TERRAIN_TUNING}
  }),
  sky: sky(${JSON.stringify(STARTER_ENVIRONMENT)}),
});
`;

const worldTs = (id: string, ground: "flat" | "terrain" = "terrain", editor = true) =>
  ground === "flat" ? flatWorldTs(id) : terrainWorldTs(editor);

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
  const header = `// ${name} — GameUI starts empty on purpose. Every game owns its UI composition: write a
// short UI art direction, then compose the shipped building blocks (HudSlots, KitVitals, Hotbar, Coins,
// InventoryGrid, CharacterSheet, Window shells — see jgengine-ui) and reskin them with HudTheme
// tokens. Reaching for those is correct, not incomplete work. What you must not ship is an
// unarranged, unskinned generic face — layout, terminology, and art direction stay game-owned.
// Panel placement is editable live in canvas mode (F2+C) and can persist to the scene document's
// ui.panels.`;
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

**This project is the game.** Build here, on the \`@jgengine/*\` npm packages. Never clone the jgengine GitHub repo, and never copy code, assets, or content from its \`games/*\` directory — those are private in-repo test games, not templates, and their content is not licensed for reuse.

## Framework-first game development

For every interaction, feature, fix or visual change, discover the installed SDK capability before implementing reusable behavior. The game owns unique rules, content, assets, authored scenes and presentation; JGengine owns common input, rendering lifecycle, storage, interaction and UI accessibility. Compose its APIs instead of copying those mechanisms into game helpers.

Check installed versions before recreating a fix already delivered upstream. Adopt compatible published updates, apply required migrations and remove superseded local code. In a workspace using an SDK catalog, versions belong to that root catalog, not each game manifest. Shared behavior must preserve distinct game designs and artwork.

When a reusable contract is missing, report the upstream gap below. Engine contributors fix its shared owner with a real game adopter; recipes illustrate SDK composition rather than another implementation. A necessary temporary fallback must have a tracked upstream issue and removal path, and does not complete the shared fix. Never use engine source aliases to bypass publication.

## Path to a playable game

1. Start from \`.claude/skills/jgengine/recipes/minimal-game.md\` — the default end-to-end path, installed with the project skills. Skills missing (your problem, not the user's): \`npx jgengine skills -p\` restores the minimal set; add \`--all\` for the full domain skills when the game outgrows it.
2. Discovery ladder: a skill's \`capabilities.md\` → its recipes → package source under \`node_modules/@jgengine/<pkg>/\` — never a full api inventory.
3. Import from \`@jgengine/shell/gameKit\` first — the happy-path surface (\`defineGame\`, \`defineSystem\`, \`GameHost\`, HUD primitives, editor-layer helpers). Reach for deeper module paths only when the kit lacks the seam.
4. **User-facing first reply is short** — game name, fantasy in 2–4 lines, POV (1st / 3rd / top-down / HUD-only), world kind, scale vibe. Ask a few tight questions. **Do not** dump file trees, catalog ids, keybind tables, or full phase plans to the user. Keep the engineering plan internal.
5. Setup broken or UI unstyled: \`npx jgengine doctor\`. Dev: \`bun dev\`. Windows installer: \`npx jgengine desktop\`.

## Built-in modes — engine-owned via GameHost, use them

\`GameHost\` owns the F2 chord family in every JGengine game, and it is **your** toolkit, not just the player's:

- **F2+E — editor mode** (also \`?mode=editor\`): the scene editor on \`src/editor.scene.json\` — place spawns, props, zones, paths, vegetation; Ctrl+S saves. Leave it via the top-bar **Exit to game** button or **F2+Q**; the mode mirrors to the URL, so stripping \`?mode=editor\` (and reloading) also drops back to the game.
- **F2+D — debug mode** (also \`?debug\`): engine devtools overlay (perf, logs, keybinds, live tunables with Save-to-source). Open/close mirrors to the \`?debug\` param — share the URL to reopen it, strip the param to close.
- **F2+C — canvas mode**: drag/resize HUD panels; layout persists to the scene document's \`ui.panels\`.

Author world content in the editor — never as coordinate tables in code. Agents drive all three headlessly through \`window.__jgengineAgent.handle({ method: ... })\` on any running game page (\`agent_status\`, \`debug_snapshot\`, \`canvas_move_panel\`, \`editor_summon\`, editor verbs, \`save_scene\`) — the easiest way is \`bun run drive -- --rpc '{"method":"agent_status"}'\`, which boots the dev server and Chrome for you; a browser tool on the \`bun dev\` page works too. See the \`jgengine-editor\` skill.

## Before you hand-roll UI or motion — check what's already shipped

The engine ships far more drop-in building blocks than you'll discover by writing code. Reinventing them is the #1 way agents waste a build. **Before you write a window manager, a bag, a paperdoll, a keydown listener for a hotkey, a stat bar, a minimap, or a walk-cycle/bob, run \`npx jgengine find <intent>\`** — it searches every shipped capability by intent and prints the primitive + its import:

\`\`\`sh
npx jgengine find "toggleable window"   # → usePanels / PanelHost (hotkeys, ESC, drag, z-stack — all wired)
npx jgengine find inventory             # → InventoryGrid (real drag/stack/split)
npx jgengine find "character sheet"     # → CharacterSheet / Paperdoll
npx jgengine find "3d portrait"         # → EntityPreview (live in-game model in a panel)
\`\`\`

If you catch yourself writing a \`z-index\` for a HUD window, a \`keydown\` listener to open a panel, a \`<div>\`-grid inventory, or a sine-wave limb bob, **stop and \`find\` it first** — a shipped, accessible, themeable version almost certainly exists. Games own their *look* (skin, layout, terminology, art direction) — compose and reskin the blocks; don't re-derive them from raw divs. Only genuinely game-specific content is hand-built.

## Hit an engine bug or gap? File it upstream, don't just work around it

When a shared primitive misbehaves or lacks a reusable contract, **file a short upstream issue** at https://github.com/Noisemaker111/jgengine/issues. Check the installed version and existing fixes first. Do not treat a game-local replacement as the finished solution. Engine contributors fix the package and verify its adopter; independent projects track the gap and the published version that can replace any temporary adapter. Include:

- **What** you were doing and what you expected.
- **Cause** — the underlying behavior you traced, precisely. e.g. *"\`HeadlessRunner.step(dt)\` clamps game-dt to \`maxStepSeconds\` (default 0.05s) regardless of the dt passed, so time-based tests need ~20 steps per second of game-time."*
- **Why** it bit you — the false negative, wrong result, wasted time, or blocked path it caused.
- **How** to reproduce (smallest steps) and, if you can see it, a suggested fix or the missing seam.
- A **screenshot** whenever the problem is visual.

Title it \`[BUG] …\` for wrong behavior or \`[FEATURE] …\` for a missing capability. One clear report beats a paragraph of workaround apologetics — the fix belongs in the engine, not in your game.

## Project rules

- Shape: \`src/\` holds only \`game.config.ts\`, \`index.tsx\`, \`main.tsx\`, \`index.css\`, \`style.css\` plus optional \`loop.ts\`, \`world.ts\`, \`editorLayers.ts\`, \`editorLayers.test.ts\`, \`editor.scene.json\`; everything else under \`src/game/\`.
- Entry: \`defineGame({...})\` in \`game.config.ts\`; \`editorLayers\` passed to defineGame auto-mounts the authored scene, and the player spawns at the authored \`player_spawn\` marker.
- Spawn player with \`id === ctx.player.userId\` in \`onNewPlayer\`; systems (\`defineSystem\`) own the rules tick.
- Tailwind v4: \`@source\` in \`src/index.css\` must cover \`@jgengine/react\`, \`@jgengine/shell\`, and \`@jgengine/editor\`${
  variant === "in-repo" ? " (engine source under packages/)" : " (dist under node_modules)"
}, or the HUD — and the F2+E editor chrome mounted into this same page — is silently unstyled.
- Visual claims are screenshot-judged, by you, harshly — flat untextured ground and an empty horizon fail. Prove content with \`bun test\`, prove looks with your eyes (\`jgengine-verify\` skill).
- Models live in \`public/models\`, pulled — not shipped inside the package. \`jgengine create\` pulls them for you; if that was skipped (offline, \`--no-assets\`, \`--no-install\`) run \`${ASSETS_PULL_HINT}\` in this folder, or every \`asset:\` id falls back to an untextured placeholder primitive and fails the bar above.
- Screenshots: \`bun run shoot\` (\`npx jgengine shoot\`) captures the running game to \`shots/shot.png\` with the jgengine CLI's own harness — it starts the dev server if needed, forces a real viewport so the WebGL canvas is not stuck at 300x150, waits for an honest frame, and works headless. Add \`--device mobile\`, \`--out shots/hud.png\`, \`--settle <ms>\`, or \`--url <page>\`; \`--help\` for all flags. Do **not** rely on a browser tool's "screenshot" button for the 3D canvas — it captures before the GPU draws.
- Play & test from the CLI: \`bun run drive\` (\`npx jgengine drive\`) drives the running game headlessly — ordered \`--click "TEXT"\`, \`--click-at 240,180\` (CSS viewport pixels; \`--right-click-at\` for right-click orders), \`--double-click "TEXT"\`, \`--fill "Label=value"\`, \`--key KeyW:2500\` (or \`mouse0:1200\` to hold a mouse button over the play canvas), \`--wait <ms>\`, \`--shot <name>\`, and \`--rpc '{"method":"agent_status"}'\` steps, plus \`--playtest --strict\` for a progress/softlock verdict off the game's \`capture.probe\`; \`--help\` for all flags. **Never hand-roll a Playwright/Puppeteer/CDP script to play or test this game** — if drive cannot express what you need, that is an engine gap: file it upstream (see below).
`;

const artDirectionMd = `# Art direction

## Reference images
TODO: fill in

## World palette
TODO: fill in

## Material language
TODO: fill in

## Lighting mood
TODO: fill in

## Silhouette rules
TODO: fill in

## UI typography
TODO: fill in

## Chosen look
TODO: fill in
`;

export {
  agentsMd,
  artDirectionMd,
  editorLayersTest,
  editorLayersTestFor,
  editorLayersTs,
  editorSceneJson,
  gameAssetsTs,
  gameConfigTs,
  gameModelsTs,
  gameUiTsx,
  gitignore,
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
