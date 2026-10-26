import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { engineSource } from "../shared/viteEngineSource";

/**
 * A game's dev server runs the engine source in this repo and loads one copy of three.js, React
 * and React Three Fiber. If a Vite config stops using `engineSource`, `@jgengine/*` falls back to
 * an unbuilt dist, or engine source loads a second three.js ("The game view couldn't load").
 */

const repo = resolve(import.meta.dir, "..");
const packagesDir = resolve(repo, "..", "packages");
const LIVE_GAMES = ["brightway-park", "harbor-heat"] as const;

function gameViteConfigs(): string[] {
  const games = readdirSync(repo, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => ["vite.config.ts", "vite.config.dev.ts"].map((name) => join(repo, entry.name, name)))
    .filter((file) => existsSync(file));
  return games;
}

async function loadVite(root: string): Promise<typeof import("vite")> {
  const viteDir = realpathSync(join(root, "node_modules/vite"));
  const entry = join(viteDir, "dist/node/index.js");
  if (!existsSync(entry)) throw new Error(`${root} has no Vite build at ${entry}; run bun install`);
  return (await import(pathToFileURL(entry).href)) as typeof import("vite");
}

describe("every game Vite config resolves the engine from source", () => {
  test("the helper maps each engine package to its src and dedupes the peers a game declares", () => {
    const resolved = engineSource(join(repo, "harbor-heat"));
    const shell = resolved.alias.find((alias) => String(alias.find) === String(/^@jgengine\/shell\/(.*)$/));
    expect(shell?.replacement).toBe(`${join(packagesDir, "shell", "src").replaceAll("\\", "/")}/$1`);
    expect(resolved.dedupe).toEqual(expect.arrayContaining(["react", "three", "@react-three/fiber"]));
  });

  for (const file of gameViteConfigs()) {
    test(`${relative(repo, file)} passes engineSource to resolve`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("engineSource(");
      expect(src).not.toContain("engineDedupe");
      // A second `resolve:` key silently replaces the engine aliases (drift-foundry shipped one).
      expect(src.match(/^\s*resolve:/gm) ?? []).toHaveLength(1);
    });
  }
});

describe("a live dev server runs engine source with one copy of each peer", () => {
  for (const game of LIVE_GAMES) {
    test(`${game}: engine imports resolve to source and to the game's own three, React and R3F`, async () => {
      const root = join(repo, game);
      const vite = await loadVite(root);
      const server = await vite.createServer({
        root,
        configFile: join(root, "vite.config.ts"),
        logLevel: "silent",
        clearScreen: false,
        appType: "custom",
        server: { middlewareMode: true, hmr: false },
        optimizeDeps: { disabled: true },
      });
      try {
        const gameEntry = join(root, "src", "index.tsx");
        const shell = await server.pluginContainer.resolveId("@jgengine/core/index", gameEntry, { ssr: false });
        expect(shell?.id.replaceAll("\\", "/")).toStartWith(join(packagesDir, "core", "src").replaceAll("\\", "/"));

        const importer = join(packagesDir, "shell", "src", "index.ts");
        const escapes: string[] = [];
        for (const pkg of ["react", "three", "@react-three/fiber"]) {
          const own = realpathSync(join(root, "node_modules", pkg));
          const resolved = await server.pluginContainer.resolveId(pkg, importer, { ssr: false });
          if (resolved === null) {
            escapes.push(`${pkg}: not resolvable from engine source`);
            continue;
          }
          const file = realpathSync(resolved.id.split("?")[0]!);
          if (!file.startsWith(own + sep)) escapes.push(`${pkg}: engine loads ${file}, the game installs ${own}`);
        }
        expect(escapes).toEqual([]);
      } finally {
        await server.close();
      }
    }, 180_000);
  }
});
