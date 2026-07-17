import { describe, expect, test } from "bun:test";

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

const SKELETON_FILES = new Set([
  "game.config.ts",
  "index.tsx",
  "main.tsx",
  "loop.ts",
  "world.ts",
  "index.css",
  "style.css",
  "editorLayers.ts",
  "editorLayers.test.ts",
  "editorCatalogs.ts",
  "editorCatalogs.test.ts",
  "editor.scene.json",
]);

function render(variant: "standalone" | "in-repo"): TemplateFile[] {
  return gameTemplate({ id: "probe-game", name: "Probe Game", variant, engineVersion: "0.8.0" });
}

function fileOf(files: TemplateFile[], path: string): string {
  const file = files.find((entry) => entry.path === path);
  if (file === undefined) throw new Error(`template missing ${path}`);
  return file.contents;
}

describe("gameTemplate canonical shape (mirrors check-game-shape)", () => {
  for (const variant of ["standalone", "in-repo"] as const) {
    test(`${variant}: ships the standalone harness and skeleton`, () => {
      const paths = render(variant).map((file) => file.path);
      for (const required of [
        "index.html",
        "vite.config.ts",
        "package.json",
        "tsconfig.json",
        "src/index.css",
        "src/main.tsx",
        "src/index.tsx",
        "src/game.config.ts",
      ]) {
        expect(paths).toContain(required);
      }
    });

    test(`${variant}: src/ holds only the skeleton, everything else under src/game/`, () => {
      const srcEntries = render(variant)
        .map((file) => file.path)
        .filter((path) => path.startsWith("src/"))
        .map((path) => path.slice("src/".length));
      for (const entry of srcEntries) {
        const top = entry.split("/")[0]!;
        expect(entry.includes("/") ? top === "game" : SKELETON_FILES.has(top)).toBe(true);
      }
    });

    test(`${variant}: game.config.ts uses defineGame and index.tsx re-exports game`, () => {
      const files = render(variant);
      expect(/from\s+["']@jgengine\/shell\/defineGame["']/.test(fileOf(files, "src/game.config.ts"))).toBe(true);
      expect(/\bgame\b/.test(fileOf(files, "src/index.tsx").match(/export\s*\{[^}]*\}/g)?.join(" ") ?? "")).toBe(true);
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
    expect(fileOf(files, "src/index.css")).toContain('@source "../../../packages/react/src"');
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
  });

  test("standalone: engine deps pin the CLI's own version", () => {
    const files = gameTemplate({ id: "pin-probe", name: "Pin Probe", variant: "standalone", engineVersion: "1.2.3" });
    const pkg = JSON.parse(fileOf(files, "package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@jgengine/shell"]).toBe("^1.2.3");
  });

  for (const variant of ["standalone", "in-repo"] as const) {
    test(`${variant}: scaffold walks out of the box (movement actions bound)`, () => {
      const keybinds = fileOf(render(variant), "src/game/keybinds.ts");
      for (const action of ["moveForward", "moveBack", "moveLeft", "moveRight", "jump", "interact"]) {
        expect(keybinds).toContain(`${action}:`);
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

    test(`${variant}: scaffold authors entity definitions in a starter catalog`, () => {
      const files = render(variant);
      // The Data tab is never empty: a starter `entities` catalog ships, wired into the editor.
      const catalogs = fileOf(files, "src/editorCatalogs.ts");
      expect(catalogs).toContain("ENTITY_CATALOG_ID");
      expect(catalogs).toContain("entityDefinitionSchema");
      expect(fileOf(files, "src/main.tsx")).toContain("catalogs={editorCatalogs}");
      expect(fileOf(files, "src/index.tsx")).toContain("editorCatalogs");
      // A mob marker references a catalog row, and content resolves stats from the document.
      const scene = JSON.parse(fileOf(files, "src/editor.scene.json")) as {
        markers: { kind: string; catalogId?: string }[];
      };
      const mob = scene.markers.find((marker) => marker.kind === "mob");
      expect(mob?.catalogId).toBe("grunt");
      expect(fileOf(files, "src/game/content.ts")).toContain("entityEntryFromCatalog");
      expect(fileOf(files, "src/loop.ts")).toContain("authoredEntitySpawns(editorLayers)");
    });

    test(`${variant}: scaffold authors a zero-code "reach the goal to win"`, () => {
      const files = render(variant);
      const scene = JSON.parse(fileOf(files, "src/editor.scene.json")) as {
        markers: { kind: string; meta?: { on?: string; action?: string } }[];
      };
      const goal = scene.markers.find((marker) => marker.kind === "goal");
      expect(goal?.meta?.on).toBe("enter");
      expect(goal?.meta?.action).toBe("win");
      // The loop wires the shared trigger primitive; the win rule lives in the document, not code.
      expect(fileOf(files, "src/loop.ts")).toContain("registerBuiltinTriggerActions");
      expect(fileOf(files, "src/loop.ts")).toContain("createTriggerOutcome");
      expect(fileOf(files, "src/game/ui/GameUI.tsx")).toContain("outcome");
    });
  }

  test("templates carry the verify gate and agent onboarding", () => {
    const files = render("standalone");
    expect(fileOf(files, "src/game/world.world.test.ts")).toContain("summarizeEnvironment");
    expect(fileOf(files, "AGENTS.md")).toContain("User-facing first reply is short");
    expect(fileOf(files, "AGENTS.md")).toContain("dump file trees");
  });

  test("rejects a non-kebab-case id", () => {
    expect(() => gameTemplate({ id: "My Game", name: "My Game", variant: "standalone", engineVersion: "0.8.0" })).toThrow();
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
