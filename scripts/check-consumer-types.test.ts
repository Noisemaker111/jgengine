import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXIT_TYPE_FAILURE,
  EXIT_UNKNOWN,
  attributeOwners,
  parseTypeFailures,
  readGamesPin,
  resolveGames,
  runConsumerTypes,
  swapCatalog,
  type RunReport,
} from "./check-consumer-types";

const root = fileURLToPath(new URL("..", import.meta.url));
const scratchRoot = join(root, ".scratch", "check-consumer-types-test");
const tsgo = join(root, "node_modules", ".bin", "tsgo");

afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));

/** A manifest shaped like the games workspace: one engine catalog plus unrelated entries. */
function gamesManifest(catalog: Record<string, string>) {
  return {
    name: "fixture-games",
    private: true,
    workspaces: { packages: ["*"], catalog },
  };
}

describe("resolveGames", () => {
  const existsEverywhere = () => true;
  const existsNowhere = () => false;
  // Absolute on every OS: a drive-letter path was resolved relative to the runner's cwd on Linux,
  // so these cases asserted Windows semantics and failed in CI.
  const here = process.cwd();
  const named = join(here, "somewhere");
  const missing = join(here, "gone");
  const repo = join(here, "repo-test");

  test("--games wins over the sibling checkout", () => {
    const result = resolveGames({ explicit: named, root: repo, pin: "abc", exists: existsEverywhere });
    expect(result.checkout?.path).toBe(resolve(named));
    expect(result.checkout?.ref).toBe("abc");
  });

  test("a named games path that does not exist is unknown, not a fallback to another checkout", () => {
    const result = resolveGames({ explicit: missing, root: repo, exists: existsNowhere });
    expect(result.checkout).toBeNull();
    expect(result.tried).toEqual([resolve(missing)]);
  });

  test("falls back to Games/ then the sibling checkout", () => {
    const sibling = resolve(repo, "..", "jgengine-games");
    const seen: string[] = [];
    const exists = (path: string) => {
      seen.push(path.replaceAll("\\", "/"));
      return path.replaceAll("\\", "/").endsWith("/jgengine-games/package.json");
    };
    const result = resolveGames({ root: repo, exists });
    expect(result.checkout?.path).toBe(sibling);
    expect(seen.some((path) => path.endsWith("/Games/package.json"))).toBe(true);
  });

  test("the pin is read only when it is a full commit SHA", () => {
    expect(readGamesPin("C:/repo", () => `${"a".repeat(40)}\n`)).toBe("a".repeat(40));
    expect(readGamesPin("C:/repo", () => "beta\n")).toBeNull();
    expect(
      readGamesPin("C:/repo", () => {
        throw new Error("missing");
      }),
    ).toBeNull();
  });
});

describe("swapCatalog", () => {
  test("every @jgengine entry becomes the packed tarball and unrelated entries stay", () => {
    const manifest = gamesManifest({ "@jgengine/core": "0.38.0", "@jgengine/shell": "0.38.0", react: "^19" });
    const { manifest: next, swapped, kept } = swapCatalog(
      manifest,
      new Map([
        ["@jgengine/core", "file:../tarballs/core.tgz"],
        ["@jgengine/shell", "file:../tarballs/shell.tgz"],
      ]),
    );
    expect(next.workspaces).toEqual({
      packages: ["*"],
      catalog: { "@jgengine/core": "file:../tarballs/core.tgz", "@jgengine/shell": "file:../tarballs/shell.tgz", react: "^19" },
    });
    expect(swapped.map((entry) => `${entry.name}:${entry.from}`)).toEqual(["@jgengine/core:0.38.0", "@jgengine/shell:0.38.0"]);
    expect(kept).toEqual([]);
    expect(manifest.workspaces.catalog["@jgengine/core"]).toBe("0.38.0");
  });

  test("a catalog entry this checkout does not pack is named instead of silently skipped", () => {
    const { kept } = swapCatalog(gamesManifest({ "@jgengine/core": "0.38.0", "@jgengine/github": "0.30.0" }), new Map([["@jgengine/core", "file:core.tgz"]]));
    expect(kept).toEqual(["@jgengine/github"]);
  });

  test("the same tarballs become overrides, so a packed package's own ^range resolves before publish", () => {
    const manifest = { ...gamesManifest({ "@jgengine/core": "0.38.4" }), overrides: { three: "0.182.0" } };
    const { manifest: next } = swapCatalog(
      manifest,
      new Map([
        ["@jgengine/core", "file:../tarballs/core.tgz"],
        ["@jgengine/editor", "file:../tarballs/editor.tgz"],
      ]),
    );
    // `@jgengine/editor@0.38.4` depends on `@jgengine/core@^0.38.4`, which the registry cannot answer yet.
    expect(next.overrides).toEqual({
      three: "0.182.0",
      "@jgengine/core": "file:../tarballs/core.tgz",
      "@jgengine/editor": "file:../tarballs/editor.tgz",
    });
  });
});

describe("parseTypeFailures", () => {
  const output = [
    "@games/harbor-heat check-types: src/game/ui/menu/HarborMenu.tsx(261,9): error TS2322: Type 'CSSProperties' is not assignable to type 'GameMenuStyle'.",
    "@games/beacon-bastion check-types: src/game.config.ts(76,20): error TS2769: No overload matches this call.",
    "@games/harbor-heat check-types: Exited with code 1",
  ].join("\n");

  test("names the game, the full file, the line and the code", () => {
    const failures = parseTypeFailures(output, ["@games/harbor-heat", "@games/beacon-bastion"]);
    expect(failures.map((failure) => [failure.game, failure.file, failure.line, failure.code])).toEqual([
      ["@games/harbor-heat", "src/game/ui/menu/HarborMenu.tsx", 261, "TS2322"],
      ["@games/beacon-bastion", "src/game.config.ts", 76, "TS2769"],
    ]);
    expect(failures[0]!.message).toContain("not assignable to type 'GameMenuStyle'");
  });

  test("attributes the type to the package that declares it", () => {
    const dist = join(scratchRoot, "owner", "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.d.ts"), "export type GameMenuStyle = Record<string, string>;\n");
    const failures = parseTypeFailures(output, ["@games/harbor-heat"]);
    attributeOwners(failures, new Map([["@jgengine/react", dist]]));
    expect(failures[0]!.owner).toBe("@jgengine/react");
  });
});

describe("runConsumerTypes without an adopter", () => {
  test("no games checkout is unknown, never a pass", () => {
    const report = runConsumerTypes({ root, games: join(scratchRoot, "no-such-games") });
    expect(report.outcome).toBe("unknown");
    expect(report.reason).toContain("no JGengine-games checkout");
    expect(report.games).toBeNull();
  });

  test("an unreadable games manifest is unknown, never a pass", () => {
    const broken = join(scratchRoot, "unreadable-games");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "package.json"), "{ this is not json");
    const report = runConsumerTypes({
      root,
      version: "1.0.0",
      games: broken,
      scratchDir: join(scratchRoot, "unreadable-run"),
      materialize: (games, dest) => cpSync(games.path, dest, { recursive: true }),
      install: () => ({ status: 0, output: "" }),
      typecheck: () => ({ status: 0, output: "" }),
    });
    expect(report.outcome).toBe("unknown");
    expect(report.reason).toContain("unreadable package.json");
  });

  test("the exit codes keep a compile failure and an unproven run apart", () => {
    expect(EXIT_UNKNOWN).toBe(2);
    expect(EXIT_TYPE_FAILURE).toBe(1);
  });
});

/**
 * The whole path the release takes, on a fixture small enough to run in seconds: a package is
 * packed, the adopter's catalog points at the tarball, bun installs it, and a source file that uses
 * the public type either compiles or does not. 0.38.2 is the second case.
 */
describe("packed tarball decides whether the adopter compiles", () => {
  const fixture = join(scratchRoot, "fixture");
  const engineDir = join(fixture, "packages", "shapes");
  const gamesDir = join(fixture, "games");

  function writePackage(styleType: string, version = "1.0.0"): void {
    mkdirSync(join(engineDir, "dist"), { recursive: true });
    writeFileSync(
      join(engineDir, "package.json"),
      JSON.stringify(
        {
          name: "@fixture/shapes",
          version,
          type: "module",
          files: ["dist"],
          exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
        },
        null,
        2,
      ),
    );
    writeFileSync(join(engineDir, "dist", "index.js"), "export const panel = () => null;\n");
    writeFileSync(join(engineDir, "dist", "index.d.ts"), styleType);
  }

  function writeGames(version = "1.0.0"): void {
    mkdirSync(join(gamesDir, "panel"), { recursive: true });
    writeFileSync(
      join(gamesDir, "package.json"),
      JSON.stringify(
        {
          name: "fixture-games",
          private: true,
          workspaces: { packages: ["*"], catalog: { "@fixture/shapes": version } },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(gamesDir, "panel", "package.json"),
      JSON.stringify({ name: "@games/panel", version: "0.1.0", private: true, type: "module", dependencies: { "@fixture/shapes": "catalog:" } }, null, 2),
    );
    writeFileSync(
      join(gamesDir, "panel", "src.ts"),
      [
        'import type { CSSProperties, PanelStyle } from "@fixture/shapes";',
        "export const plain: CSSProperties = { padding: 8 };",
        "export const styled: PanelStyle = plain;",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(gamesDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: "ESNext", moduleResolution: "bundler", target: "ES2022", skipLibCheck: true }, include: ["panel/src.ts"] }, null, 2),
    );
  }

  const typecheck = (cwd: string): { status: number; output: string } => {
    const result = Bun.spawnSync([tsgo, "--noEmit", "-p", join(cwd, "tsconfig.json")], { cwd, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
    return { status: result.exitCode ?? 1, output: `${result.stdout.toString()}${result.stderr.toString()}` };
  };

  const copyGames = (games: { path: string }, dest: string): void =>
    cpSync(games.path, dest, {
      recursive: true,
      filter: (path) => !/[\\/]node_modules([\\/]|$)/.test(path),
    });

  const run = (version = "1.0.0"): RunReport =>
    runConsumerTypes({
      root: fixture,
      version,
      games: gamesDir,
      scratchDir: join(scratchRoot, "run"),
      packages: [engineDir],
      materialize: copyGames,
      install: (cwd) => {
        const result = Bun.spawnSync(["bun", "install"], { cwd, stdout: "pipe", stderr: "pipe", timeout: 300_000 });
        return { status: result.exitCode ?? 1, output: `${result.stdout.toString()}${result.stderr.toString()}` };
      },
      typecheck,
      keep: true,
    });

  test("a style prop typed as CSSProperties | TokenBag compiles, and the install came from the tarball", () => {
    writePackage(
      [
        "export type CSSProperties = { padding?: number };",
        "export type PanelStyle = CSSProperties | Record<`--${string}`, string | number>;",
        "export const panel: () => null;",
        "",
      ].join("\n"),
    );
    writeGames();
    const report = run();
    expect(report.reason).toBeNull();
    expect(report.failures).toEqual([]);
    expect(report.outcome).toBe("pass");
    const installed = JSON.parse(readFileSync(join(scratchRoot, "run", "games", "panel", "node_modules", "@fixture", "shapes", "package.json"), "utf8"));
    expect(installed.version).toBe("1.0.0");
  }, 120_000);

  test("a public type narrowed in a patch is a type failure naming the file, and nothing is published", () => {
    writePackage(
      [
        "export type CSSProperties = { padding?: number };",
        "export type PanelStyle = CSSProperties & { \"--surface-radius\": string | number };",
        "export const panel: () => null;",
        "",
      ].join("\n"),
      "1.0.1",
    );
    writeGames("1.0.1");
    const report = run("1.0.1");
    expect(report.outcome).toBe("type-failure");
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.failures[0]!.file).toContain("src.ts");
    expect(report.failures[0]!.owner).toBe("@fixture/shapes");
  }, 120_000);

  test("an install that cannot fetch the tarball is unknown, not a pass", () => {
    writePackage("export type PanelStyle = Record<string, string | number>;\nexport const panel: () => null;\n");
    const report = runConsumerTypes({
      root: fixture,
      version: "1.0.0",
      games: gamesDir,
      scratchDir: join(scratchRoot, "broken-install"),
      packages: [engineDir],
      materialize: copyGames,
      install: () => ({ status: 1, output: "error: failed to resolve @fixture/shapes" }),
      typecheck: () => ({ status: 0, output: "clean" }),
    });
    expect(report.outcome).toBe("unknown");
    expect(report.reason).toContain("installing the packed tarballs failed");
  }, 60_000);
});

test("the publish workflow runs the adopter check before it publishes anything", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "publish.yml"), "utf8");
  const check = workflow.indexOf("check:consumer-types");
  const publish = workflow.indexOf("npm publish");
  expect(check).toBeGreaterThan(-1);
  expect(publish).toBeGreaterThan(-1);
  expect(check).toBeLessThan(publish);
  expect(workflow).not.toMatch(/check:consumer-types[^\n]*\|\|\s*true/);
});
