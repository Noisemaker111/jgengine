import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeEditorLayers } from "../packages/core/src/editor/document";
import type { EditorDocument } from "../packages/core/src/editor/types";
import { resolveAuthoredObjects } from "../packages/core/src/world/authoredObjects";
import { authoredSpawnPosition } from "../packages/core/src/world/authoredSpawn";
import { GAME_TEMPLATES, type GameTemplate } from "../packages/jgengine/src/projectConfig";
import { editorScaffold, gameTemplate } from "../packages/jgengine/src/templates";
import { standaloneOptimizeDeps, UNBUNDLED_ENGINE_MODULES } from "../packages/jgengine/src/templates/gameFiles";
import type { TemplateFile } from "../packages/jgengine/src/templates/types";

/**
 * What a new developer gets from `jgengine create`, without booting it: every template opens to
 * something to see and play, its engine imports exist, and a game on the npm packages can start
 * Vite's dev server (`bun run shoot --load <game> --guard` covers the drawn pixels by hand).
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function scaffold(template: GameTemplate): TemplateFile[] {
  return gameTemplate({
    id: "probe-game",
    name: "Probe Game",
    variant: "standalone",
    engineVersion: "0.0.0",
    ...(template === "2d" ? { dimension: "2d" as const } : {}),
    ...(template === "builder" ? { shape: "shared-world-builder" as const } : {}),
  });
}

function fileOf(files: TemplateFile[], path: string): string {
  const file = files.find((entry) => entry.path === path);
  if (file === undefined) throw new Error(`template missing ${path}`);
  return file.contents;
}

/** The `@jgengine/*` packages a standalone scaffold installs from npm, read from its package.json. */
function enginePackages(files: TemplateFile[]): string[] {
  const manifest = JSON.parse(fileOf(files, "package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    .filter((name) => name.startsWith("@jgengine/"))
    .map((name) => name.slice("@jgengine/".length));
}

function engineSourceFile(specifier: string): string | null {
  const [, pkg, sub] = /^@jgengine\/([^/]+)(?:\/(.+))?$/.exec(specifier) ?? [];
  if (pkg === undefined) return null;
  const base = join(ROOT, "packages", pkg, "src", sub ?? "index");
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

describe("a fresh create opens to something to see", () => {
  for (const template of ["3d", "builder"] as const) {
    test(`${template}: the default scene has a spawn, ground and props in view`, () => {
      const files = scaffold(template);
      const raw = JSON.parse(fileOf(files, "src/editor.scene.json")) as EditorDocument & { terrain?: unknown };
      const document = normalizeEditorLayers(raw);
      expect(authoredSpawnPosition(document)).not.toBeNull();
      expect(resolveAuthoredObjects(document).length).toBeGreaterThan(0);
      expect(raw.terrain).toBeDefined();
      expect(fileOf(files, "src/world.ts")).toContain("terrain(");
    });
  }

  test("builder: with no backend configured it still mounts the game, offline", () => {
    const main = fileOf(scaffold("builder"), "src/main.tsx");
    const offline = main.slice(main.indexOf("if (!url)"), main.indexOf("} else {"));
    expect(offline).toContain("<GameHost playable={game} multiplayer={null}");
  });

  test("2d: the board, its rules and its HUD are all scaffolded", () => {
    const files = scaffold("2d");
    expect(fileOf(files, "src/game/board.ts").length).toBeGreaterThan(0);
    expect(fileOf(files, "src/game/ui/GameUI.tsx")).toContain("GameUI");
  });
});

describe("the scaffold's engine imports exist", () => {
  for (const template of GAME_TEMPLATES) {
    test(`${template}: every @jgengine import names a module and a value it exports`, async () => {
      const files = scaffold(template);
      const missing: string[] = [];
      for (const file of files.filter((entry) => /\.(ts|tsx)$/.test(entry.path) && entry.path !== "vite.config.ts")) {
        for (const match of file.contents.matchAll(/import\s+(type\s+)?(?:\{([^}]*)\}|(\w+))?[^"';]*?from\s+["'](@jgengine\/[^"']+)["']/g)) {
          const [, typeOnly, named, , specifier] = match;
          const source = engineSourceFile(specifier!);
          if (source === null) {
            missing.push(`${file.path}: ${specifier} has no source module`);
            continue;
          }
          if (typeOnly !== undefined || named === undefined) continue;
          const values = named
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part.length > 0 && !part.startsWith("type "))
            .map((part) => part.split(/\s+as\s+/)[0]!);
          const module = (await import(source)) as Record<string, unknown>;
          for (const name of values) if (!(name in module)) missing.push(`${file.path}: ${specifier} does not export ${name}`);
        }
      }
      expect(missing).toEqual([]);
    });
  }
});

describe("a game on the npm packages can start Vite's dev server", () => {
  test("every engine module with a bundler-only .js?url import is kept out of pre-bundling, and imported by package name", async () => {
    const packages = [...new Set(GAME_TEMPLATES.flatMap((template) => enginePackages(scaffold(template))))];
    const offenders: string[] = [];
    const relativeImporters: string[] = [];
    const glob = new Bun.Glob(`packages/{${packages.join(",")}}/src/**/*.{ts,tsx}`);
    const sources: { id: string; text: string }[] = [];
    for await (const path of glob.scan({ cwd: ROOT })) {
      if (/\.test\.tsx?$/.test(path)) continue;
      const [, pkg, sub] = /^packages\/([^/]+)\/src\/(.+)\.tsx?$/.exec(path.replace(/\\/g, "/"))!;
      sources.push({ id: `@jgengine/${pkg}/${sub}`, text: readFileSync(join(ROOT, path), "utf8") });
    }
    for (const { id, text } of sources) {
      if (/from\s+["'][^"']+\.(?:m?js|cjs|jsx?|tsx?|json)\?[^"']*["']/.test(text)) offenders.push(id);
    }
    expect(offenders.sort()).toEqual([...UNBUNDLED_ENGINE_MODULES].sort());
    for (const id of UNBUNDLED_ENGINE_MODULES) {
      const leaf = id.split("/").pop()!;
      for (const { id: importer, text } of sources) {
        if (new RegExp(`["']\\.{1,2}/(?:[^"']*/)?${leaf}(?:\\.js)?["']`).test(text)) relativeImporters.push(`${importer} imports ${leaf} by path`);
      }
    }
    expect(relativeImporters).toEqual([]);
    for (const template of GAME_TEMPLATES) expect(fileOf(scaffold(template), "vite.config.ts")).toContain(standaloneOptimizeDeps);
    expect(fileOf(editorScaffold("0.0.0"), "vite.config.ts")).toContain(standaloneOptimizeDeps);
  });
});
