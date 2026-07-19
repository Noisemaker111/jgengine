import { describe, expect, test } from "bun:test";

import { isAllowedGameSrcEntry } from "./gameShape";
import {
  displayNameFromId,
  editorScaffold,
  folderNameFromTitle,
  gameTemplate,
  IN_REPO_TSCONFIG_PATHS,
  packageIdFromFolder,
  parseCreateName,
  type TemplateFile,
} from "./templates";

function render(
  variant: "standalone" | "in-repo",
  options?: { world?: boolean; editor?: boolean },
): TemplateFile[] {
  return gameTemplate({ id: "probe-game", name: "Probe Game", variant, engineVersion: "0.8.0", ...options });
}

function fileOf(files: TemplateFile[], path: string): string {
  const file = files.find((entry) => entry.path === path);
  if (file === undefined) throw new Error(`template missing ${path}`);
  return file.contents;
}

const THIN_FILES = [
  "index.html",
  "vite.config.ts",
  "package.json",
  "tsconfig.json",
  "AGENTS.md",
  "src/index.css",
  "src/style.css",
  "src/main.tsx",
  "src/index.tsx",
  "src/editor.scene.json",
  "src/editorLayers.ts",
  "src/editorLayers.test.ts",
  "src/game.config.ts",
  "src/loop.ts",
  "src/game/ui/GameUI.tsx",
];

describe("gameTemplate canonical shape (mirrors check-game-shape)", () => {
  for (const variant of ["standalone", "in-repo"] as const) {
    test(`${variant}: default is exactly the thin editor-first file set`, () => {
      expect(render(variant).map((file) => file.path).sort()).toEqual([...THIN_FILES].sort());
    });

    test(`${variant}: src/ holds only the skeleton, everything else under src/game/`, () => {
      const srcEntries = render(variant)
        .map((file) => file.path)
        .filter((path) => path.startsWith("src/"))
        .map((path) => path.slice("src/".length));
      for (const entry of srcEntries) {
        const top = entry.split("/")[0]!;
        const nested = entry.includes("/");
        expect(isAllowedGameSrcEntry(top, nested)).toBe(true);
      }
    });

    test(`${variant}: game.config.ts uses defineGame from gameKit and index.tsx re-exports game`, () => {
      const files = render(variant);
      expect(/from\s+["']@jgengine\/shell\/gameKit["']/.test(fileOf(files, "src/game.config.ts"))).toBe(true);
      expect(/\bgame\b/.test(fileOf(files, "src/index.tsx").match(/export\s*\{[^}]*\}/g)?.join(" ") ?? "")).toBe(true);
    });

    test(`${variant}: game.config.ts omits server/multiplayer/save/camera knobs (shell defaults)`, () => {
      const config = fileOf(render(variant), "src/game.config.ts");
      expect(config).not.toContain("server:");
      expect(config).not.toContain("multiplayer:");
      expect(config).not.toContain("save:");
      expect(config).not.toContain("camera:");
    });

    test(`${variant}: main.tsx is a bare GameHost mount — GameHost owns F2+E and the save endpoint`, () => {
      const main = fileOf(render(variant), "src/main.tsx");
      expect(main).toContain('editor={() => import("@jgengine/editor")}');
      expect(main).not.toContain("installSaveEndpoint");
      expect(main).not.toContain("__jgengineSummonEditor");
    });

    test(`${variant}: package.json has a dev script and is ESM`, () => {
      const pkg = JSON.parse(fileOf(render(variant), "package.json")) as {
        type?: string;
        scripts?: Record<string, string>;
      };
      expect(pkg.type).toBe("module");
      expect(pkg.scripts?.dev).toBe("vite");
    });

    test(`${variant}: package.json ships desktop next to dev/build`, () => {
      const pkg = JSON.parse(fileOf(render(variant), "package.json")) as {
        scripts?: Record<string, string>;
      };
      expect(pkg.scripts?.desktop).toBe("jgengine desktop");
      expect(pkg.scripts?.build).toBe("vite build");
    });
  }

  test("in-repo: tsconfig paths match the exact map check-game-shape requires", () => {
    const tsconfig = JSON.parse(fileOf(render("in-repo"), "tsconfig.json")) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    expect(tsconfig.compilerOptions.paths).toEqual(IN_REPO_TSCONFIG_PATHS);
  });

  test("in-repo: engine deps use workspace protocol and css @source points at engine source", () => {
    const files = render("in-repo");
    const pkg = JSON.parse(fileOf(files, "package.json")) as { name: string; dependencies: Record<string, string> };
    expect(pkg.name).toBe("@games/probe-game");
    expect(pkg.dependencies["@jgengine/core"]).toBe("workspace:*");
    const css = fileOf(files, "src/index.css");
    expect(css).toContain('@source "../../../packages/react/src"');
    // The F2+E editor summon mounts into this page — its classes must be scanned or it renders unstyled.
    expect(css).toContain('@source "../../../packages/editor/src"');
  });

  test("standalone: no workspace protocol, no monorepo paths, css @source points at node_modules", () => {
    const files = render("standalone");
    const raw = fileOf(files, "package.json");
    const pkg = JSON.parse(raw) as { name: string; dependencies: Record<string, string> };
    expect(pkg.name).toBe("probe-game");
    expect(raw).not.toContain("workspace:*");
    expect(pkg.dependencies["@jgengine/core"]).toBe("^0.8.0");
    expect(fileOf(files, "tsconfig.json")).not.toContain("../../packages");
    const css = fileOf(files, "src/index.css");
    expect(css).toContain('@source "../node_modules/@jgengine/react/dist"');
    expect(css).toContain('@source "../node_modules/@jgengine/shell/dist"');
    // The F2+E editor summon mounts into this page — its classes must be scanned or it renders unstyled.
    expect(css).toContain('@source "../node_modules/@jgengine/editor/dist"');
  });

  test("standalone: engine deps pin the CLI's own version", () => {
    const files = gameTemplate({ id: "pin-probe", name: "Pin Probe", variant: "standalone", engineVersion: "1.2.3" });
    const pkg = JSON.parse(fileOf(files, "package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@jgengine/shell"]).toBe("^1.2.3");
  });

  for (const variant of ["standalone", "in-repo"] as const) {
    test(`${variant}: scaffold walks out of the box (movement actions bound inline)`, () => {
      const config = fileOf(render(variant), "src/game.config.ts");
      for (const action of ["moveForward", "moveBack", "moveLeft", "moveRight", "jump", "interact"]) {
        expect(config).toContain(`${action}:`);
      }
    });

    test(`${variant}: scaffold ships a wired editor scene document`, () => {
      const files = render(variant);
      const scene = JSON.parse(fileOf(files, "src/editor.scene.json")) as {
        markers: { kind: string; catalogId?: string }[];
      };
      expect(scene.markers.some((marker) => marker.kind === "player_spawn")).toBe(true);
      expect(scene.markers.some((marker) => marker.catalogId !== undefined)).toBe(true);
      expect(fileOf(files, "src/editorLayers.ts")).toContain("normalizeEditorLayers");
      expect(fileOf(files, "src/game.config.ts")).toContain("editorLayers,");
      expect(fileOf(files, "src/index.tsx")).toContain("editorLayers");
      expect(fileOf(files, "src/loop.ts")).toContain("authoredSpawnPosition(editorLayers)");
      expect(fileOf(files, "src/index.css")).toContain('@import "./style.css"');
    });

    test(`${variant}: scaffold authors a zero-code "reach the goal to win" via systems`, () => {
      const files = render(variant);
      const scene = JSON.parse(fileOf(files, "src/editor.scene.json")) as {
        markers: { kind: string; meta?: { on?: string; action?: string } }[];
      };
      const goal = scene.markers.find((marker) => marker.kind === "goal");
      expect(goal?.meta?.on).toBe("enter");
      expect(goal?.meta?.action).toBe("win");
      const loop = fileOf(files, "src/loop.ts");
      expect(loop).toContain('defineSystem');
      expect(loop).toContain('from "@jgengine/shell/gameKit"');
      expect(loop).toContain("registerBuiltinTriggerActions");
      expect(loop).toContain("createTriggerOutcome");
      expect(fileOf(files, "src/game.config.ts")).toContain("systems,");
      expect(fileOf(files, "src/game/ui/GameUI.tsx")).toContain("outcome");
    });
  }

  test("--world: adds world.ts + game/assets.ts + game/models.ts wired into the config", () => {
    const files = render("standalone", { world: true });
    const paths = files.map((file) => file.path);
    for (const extra of ["src/world.ts", "src/game/assets.ts", "src/game/models.ts"]) {
      expect(paths).toContain(extra);
    }
    const worldFile = fileOf(files, "src/world.ts");
    expect(worldFile).toContain("place(");
    expect(worldFile).toContain('mode: "flat"');
    expect(worldFile).toContain("x: Infinity");
    expect(worldFile).not.toContain("environment(");
    expect(worldFile).not.toContain("sky(");
    expect(worldFile).not.toContain("grass(");
    expect(worldFile).not.toContain("seed");
    const config = fileOf(files, "src/game.config.ts");
    expect(config).toContain("world,");
    expect(config).not.toContain("physics,");
    expect(config).toContain("entityModels,");
    expect(config).toContain("objectModels,");
  });

  test("--no-editor: drops the scene document and all editor wiring", () => {
    const files = render("standalone", { editor: false });
    const paths = files.map((file) => file.path);
    for (const dropped of ["src/editor.scene.json", "src/editorLayers.ts", "src/editorLayers.test.ts"]) {
      expect(paths).not.toContain(dropped);
    }
    expect(fileOf(files, "src/main.tsx")).not.toContain("editor=");
    expect(fileOf(files, "src/index.tsx")).not.toContain("editorLayers");
    expect(fileOf(files, "src/game.config.ts")).not.toContain("editorLayers");
    expect(fileOf(files, "src/loop.ts")).not.toContain("editorLayers");
    expect(fileOf(files, "src/game/ui/GameUI.tsx")).not.toContain("outcome");
    // No editor summon → no editor dep → drop its @source so Tailwind isn't pointed at a missing package.
    expect(fileOf(files, "src/index.css")).not.toContain("@jgengine/editor");
  });

  test("templates carry the gameKit-first agent onboarding", () => {
    const files = render("standalone");
    const agents = fileOf(files, "AGENTS.md");
    expect(agents).toContain("User-facing first reply is short");
    expect(agents).toContain("dump file trees");
    expect(agents).toContain("@jgengine/shell/gameKit");
    expect(agents).toContain("recipes/minimal-game.md");
    expect(agents).toContain("npx jgengine skills -p");
    expect(agents).toContain("--all");
    // Every new game is briefed to file engine bugs/gaps upstream instead of burying a workaround.
    expect(agents).toContain("File it upstream");
    expect(agents).toContain("https://github.com/Noisemaker111/jgengine/issues");
    expect(agents).toContain("[BUG]");
    expect(agents).toContain("[FEATURE]");
    expect(agents).not.toContain("full export surface");
    expect(agents).not.toContain("full game not a slice");
  });

  test("rejects a non-kebab-case id", () => {
    expect(() => gameTemplate({ id: "My Game", name: "My Game", variant: "standalone", engineVersion: "0.8.0" })).toThrow();
  });

  test("a promoted scene is baked in with a test tailored to what it ships", () => {
    const scene = {
      version: 1,
      markers: [
        { id: "player_spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 9 } },
        { id: "prop", kind: "prop", position: { x: 1, y: 0, z: 1 }, catalogId: "rock" },
      ],
    };
    const files = gameTemplate({ id: "probe-game", name: "Probe Game", variant: "standalone", engineVersion: "0.8.0", scene });
    expect(JSON.parse(fileOf(files, "src/editor.scene.json")).markers[0].position.z).toBe(9);
    // No win-goal in this scene → the goal assertion is omitted so the generated test passes.
    expect(fileOf(files, "src/editorLayers.test.ts")).toContain("player_spawn marker the runtime honors");
    expect(fileOf(files, "src/editorLayers.test.ts")).not.toContain("wins on enter");
  });

  test("a promoted scene with a win-goal keeps the goal assertion", () => {
    const scene = {
      version: 1,
      markers: [
        { id: "player_spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } },
        { id: "goal", kind: "goal", position: { x: 0, y: 0, z: -5 }, meta: { on: "enter", action: "win" } },
      ],
    };
    const files = gameTemplate({ id: "probe-game", name: "Probe Game", variant: "standalone", engineVersion: "0.8.0", scene });
    expect(fileOf(files, "src/editorLayers.test.ts")).toContain("wins on enter");
  });

  test("displayNameFromId title-cases", () => {
    expect(displayNameFromId("maze-muncher")).toBe("Maze Muncher");
  });

  test("editorScaffold mounts StandaloneEditor over the node editor host plugin", () => {
    const files = editorScaffold("0.10.0");
    const paths = new Set(files.map((file) => file.path));
    for (const path of ["index.html", "package.json", "vite.config.ts", "src/index.css", "src/main.tsx"]) {
      expect(paths.has(path)).toBe(true);
    }
    expect(fileOf(files, "src/main.tsx")).toContain("StandaloneEditor");
    expect(fileOf(files, "src/main.tsx")).toContain("/__jgengine/manifest");
    expect(fileOf(files, "vite.config.ts")).toContain("editorHostPlugin");
    expect(fileOf(files, "vite.config.ts")).toContain("JG_EDITOR_DIR");
    const pkg = JSON.parse(fileOf(files, "package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@jgengine/editor"]).toBe("^0.10.0");
    expect(pkg.dependencies["@jgengine/node"]).toBe("^0.10.0");
  });

  test("folderNameFromTitle dashes spaces and keeps casing", () => {
    expect(folderNameFromTitle("My Game Name")).toBe("My-Game-Name");
    expect(packageIdFromFolder("My-Game-Name")).toBe("my-game-name");
    expect(parseCreateName("My Game Name").displayName).toBe("My Game Name");
  });
});
