import { describe, expect, test } from "bun:test";
import { extractDesktopMaps, readPrivateDesktopMap } from "./desktopMaps";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeGame } from "./create";
import {
  buildPlan,
  checkToolchains,
  defaultIdentifier,
  defineGameName,
  desktopCodeHash,
  desktopLibRs,
  frontendBuildCommand,
  isAllowedDesktopOrigin,
  parseDesktopArgs,
  resolveMetadata,
  runDesktopAsync,
  slugFromProductName,
  validateHttpsUrl,
  validateIdentifier,
  writeStaging,
} from "./desktop";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "jgengine-desktop-"));
}

test("private maps leave the package and match its exact script and map bytes", () => {
  const dir = scratch();
  const dist = join(dir, "dist");
  const privateRoot = join(dir, "private");
  mkdirSync(dist);
  writeFileSync(join(dist, "app.js"), "generated code");
  writeFileSync(join(dist, "app.js.map"), '{"version":3,"sources":["private.ts"],"names":[],"mappings":"AAAA"}');
  writeFileSync(join(dist, "world.map"), "game data");
  const result = extractDesktopMaps(dist, privateRoot);
  expect(result.count).toBe(1);
  expect(existsSync(join(dist, "app.js.map"))).toBe(false);
  expect(readFileSync(join(dist, "world.map"), "utf8")).toBe("game data");
  expect(readPrivateDesktopMap(privateRoot, result.digest, "generated code")).toContain("private.ts");
  expect(readPrivateDesktopMap(privateRoot, result.digest, "different code")).toBeNull();
  const indexPath = join(result.directory, "index.json");
  const entry = JSON.parse(readFileSync(indexPath, "utf8"))[0];
  const mapPath = join(result.directory, `${entry.map}.map`);
  writeFileSync(mapPath, "wrong map");
  expect(() => readPrivateDesktopMap(privateRoot, result.digest, "generated code")).toThrow("source map does not match");
  rmSync(mapPath);
  expect(() => readPrivateDesktopMap(privateRoot, result.digest, "generated code")).toThrow();
  writeFileSync(indexPath, "[]");
  expect(() => readPrivateDesktopMap(privateRoot, result.digest, "generated code")).toThrow("does not match");
});

function scaffoldGame(): string {
  const dir = join(scratch(), "probe-game");
  writeGame(dir, "probe-game", "Probe Game", "standalone");
  return dir;
}

describe("parseDesktopArgs", () => {
  test("defaults to project mode in cwd", () => {
    const parsed = parseDesktopArgs([]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.mode).toBe("project");
    expect(parsed.projectDir).toBe(".");
    expect(parsed.dryRun).toBe(false);
  });

  test("accepts project dir and metadata flags", () => {
    const parsed = parseDesktopArgs([
      "./my-game",
      "--name",
      "My Game",
      "--id",
      "com.example.mygame",
      "--version",
      "1.2.3",
      "--icon",
      "icon.png",
      "--out",
      "staging",
      "--dry-run",
      "--skip-frontend-build",
    ]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed).toMatchObject({
      mode: "project",
      projectDir: "./my-game",
      name: "My Game",
      id: "com.example.mygame",
      version: "1.2.3",
      icon: "icon.png",
      outDir: "staging",
      dryRun: true,
      skipFrontendBuild: true,
    });
  });

  test("url mode rejects a second project dir", () => {
    const parsed = parseDesktopArgs(["./game", "--url", "https://example.com"]);
    expect(parsed).toEqual({ error: "pass either a project directory or --url, not both" });
  });

  test("--no-installer builds only the .exe; an installer is the default", () => {
    expect(parseDesktopArgs(["./game", "--diagnostics", "--no-installer"])).toMatchObject({ diagnostics: true, installer: false });
    expect(parseDesktopArgs(["./game"])).toMatchObject({ installer: true });
  });

  test("rejects unknown flags", () => {
    const parsed = parseDesktopArgs(["--nope"]);
    expect(parsed).toEqual({ error: "unknown option: --nope" });
  });

  test("rejects --url without value", () => {
    const parsed = parseDesktopArgs(["--url"]);
    expect(parsed).toEqual({ error: "--url requires a value" });
  });
});

describe("validateHttpsUrl", () => {
  test("accepts https", () => {
    const result = validateHttpsUrl("https://jgengine.com/games/snake");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url.hostname).toBe("jgengine.com");
  });

  test("rejects http", () => {
    const result = validateHttpsUrl("http://example.com");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("https");
  });

  test("rejects garbage", () => {
    const result = validateHttpsUrl("not a url");
    expect(result.ok).toBe(false);
  });
});

describe("isAllowedDesktopOrigin", () => {
  test("allows localhost and jgengine.com hosts", () => {
    expect(isAllowedDesktopOrigin("localhost")).toBe(true);
    expect(isAllowedDesktopOrigin("127.0.0.1")).toBe(true);
    expect(isAllowedDesktopOrigin("jgengine.com")).toBe(true);
    expect(isAllowedDesktopOrigin("play.jgengine.com")).toBe(true);
    expect(isAllowedDesktopOrigin("JGENGINE.COM")).toBe(true);
  });

  test("rejects an arbitrary host", () => {
    expect(isAllowedDesktopOrigin("evil.example.com")).toBe(false);
    expect(isAllowedDesktopOrigin("notjgengine.com")).toBe(false);
  });
});

describe("buildPlan remote origin allowlist", () => {
  test("rejects --url outside the allowlist without --allow-remote", () => {
    const parsed = parseDesktopArgs(["--url", "https://evil.example.com/game"]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const plan = buildPlan(parsed, scratch());
    expect("error" in plan).toBe(true);
    if (!("error" in plan)) return;
    expect(plan.error).toContain("evil.example.com");
    expect(plan.error).toContain("--allow-remote");
  });

  test("accepts --url outside the allowlist with --allow-remote", () => {
    const parsed = parseDesktopArgs(["--url", "https://evil.example.com/game", "--allow-remote"]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const plan = buildPlan(parsed, scratch());
    expect("error" in plan).toBe(false);
  });

  test("accepts --url on the default allowlist without --allow-remote", () => {
    const parsed = parseDesktopArgs(["--url", "https://jgengine.com/games/snake"]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const plan = buildPlan(parsed, scratch());
    expect("error" in plan).toBe(false);
  });
});

describe("metadata defaults", () => {
  test("defaultIdentifier strips hyphens into reverse-DNS", () => {
    expect(defaultIdentifier("Probe Game")).toBe("com.jgengine.probegame");
    expect(defaultIdentifier("my-cool-game")).toBe("com.jgengine.mycoolgame");
  });

  test("slugFromProductName kebab-cases scoped package names", () => {
    expect(slugFromProductName("@games/probe-game")).toBe("probe-game");
  });

  test("project mode reads game.config name and package version", () => {
    const dir = scaffoldGame();
    const meta = resolveMetadata({ mode: "project", projectDir: dir, url: null });
    expect("error" in meta).toBe(false);
    if ("error" in meta) return;
    expect(meta.productName).toBe("Probe Game");
    expect(meta.version).toBe("0.1.0");
    expect(meta.identifier).toBe("com.jgengine.probegame");
    expect(meta.windowTitle).toBe("Probe Game");
  });

  test("the product name is defineGame's own name, never a nested object's", () => {
    const source = `const interactables = [{ prompt: { invoke: { name: "relay.start" } } }];
export const game = defineGame({
  scene: { name: "inner", props: [{ name: "crate" }] },
  // name: "commented out"
  hud: "a { brace",
  name: "Scrap Signal",
});`;
    expect(defineGameName(source)).toBe("Scrap Signal");
    expect(defineGameName(`export const game = defineGame({ scene: { name: "inner" } });`)).toBeNull();
    expect(defineGameName(`export const config = { name: "Not A Game" };`)).toBeNull();
  });

  test("url mode defaults name to hostname and version 0.1.0", () => {
    const meta = resolveMetadata({
      mode: "url",
      projectDir: null,
      url: new URL("https://www.example.com/play"),
    });
    expect("error" in meta).toBe(false);
    if ("error" in meta) return;
    expect(meta.productName).toBe("example.com");
    expect(meta.version).toBe("0.1.0");
    expect(meta.identifier).toBe("com.jgengine.examplecom");
  });

  test("explicit flags win over defaults", () => {
    const dir = scaffoldGame();
    const meta = resolveMetadata({
      mode: "project",
      projectDir: dir,
      url: null,
      name: "Custom Title",
      id: "com.acme.custom",
      version: "9.9.9",
    });
    expect(meta).toEqual({
      productName: "Custom Title",
      identifier: "com.acme.custom",
      version: "9.9.9",
      windowTitle: "Custom Title",
    });
  });

  test("rejects bad reverse-DNS ids", () => {
    expect(validateIdentifier("not-dns")).not.toBeNull();
    expect(validateIdentifier("com.jgengine.ok")).toBeNull();
  });
});

describe("buildPlan + writeStaging", () => {
  test("desktop code fingerprint changes with bundled code and ignores models", () => {
    const dir = scratch();
    writeFileSync(join(dir, "index.html"), "<script src='game.js'></script>");
    writeFileSync(join(dir, "game.js"), "first");
    writeFileSync(join(dir, "model.glb"), "one");
    writeFileSync(join(dir, "world.map"), "one");
    const original = desktopCodeHash(dir);
    writeFileSync(join(dir, "model.glb"), "two");
    writeFileSync(join(dir, "world.map"), "two");
    expect(desktopCodeHash(dir)).toBe(original);
    writeFileSync(join(dir, "game.js"), "second");
    expect(desktopCodeHash(dir)).not.toBe(original);
  });
  test("diagnostic desktop build enables local telemetry and inspection only when requested", () => {
    const dir = scaffoldGame();
    const parsed = parseDesktopArgs([dir, "--diagnostics", "--out", join(dir, "diagnostic-stage")]);
    if ("error" in parsed) throw new Error(parsed.error);
    const plan = buildPlan(parsed, dir);
    if ("error" in plan) throw new Error(plan.error);
    const stage = writeStaging(plan);
    const conf = JSON.parse(readFileSync(stage.tauriConfPath, "utf8")) as { app: { windows: { url?: string }[] } };
    expect(conf.app.windows[0]?.url).toBe("index.html?telemetry=local&frameMembers=1");
    expect(readFileSync(join(stage.stagingDir, "src-tauri", "Cargo.toml"), "utf8")).toContain('"devtools"');
    expect(parseDesktopArgs(["--url", "https://jgengine.com", "--diagnostics"])).toEqual({ error: "--diagnostics requires a local project" });
  });
  test("project plan points frontendDist at offline dist and stages under .jgengine/desktop", () => {
    const dir = scaffoldGame();
    const parsed = parseDesktopArgs([dir, "--dry-run"]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const plan = buildPlan(parsed, dir);
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(plan.mode).toBe("project");
    expect(plan.frontendDist).toBe("../dist");
    expect(plan.stagingDir).toBe(join(dir, ".jgengine", "desktop"));
    expect(plan.metadata.productName).toBe("Probe Game");
  });

  test("url plan uses the https URL as frontendDist", () => {
    const cwd = scratch();
    const parsed = parseDesktopArgs(["--url", "https://jgengine.com/games/snake", "--name", "Snake"]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const plan = buildPlan(parsed, cwd);
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(plan.mode).toBe("url");
    expect(plan.frontendDist).toBe("https://jgengine.com/games/snake");
    expect(plan.metadata.productName).toBe("Snake");
    expect(plan.metadata.identifier).toBe("com.jgengine.snake");
  });

  test("writeStaging emits tauri conf, cargo, icons without mutating the source project", () => {
    const dir = scaffoldGame();
    const before = readFileSync(join(dir, "package.json"), "utf8");
    const parsed = parseDesktopArgs([dir, "--dry-run", "--out", join(dir, "stage-out")]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const plan = buildPlan(parsed, dir);
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    const stage = writeStaging(plan);
    expect(existsSync(stage.tauriConfPath)).toBe(true);
    const conf = JSON.parse(readFileSync(stage.tauriConfPath, "utf8")) as {
      productName: string;
      identifier: string;
      version: string;
      build: { frontendDist: string };
      bundle: { targets: string[] };
    };
    expect(conf.productName).toBe("Probe Game");
    expect(conf.identifier).toBe("com.jgengine.probegame");
    expect(conf.version).toBe("0.1.0");
    expect(conf.build.frontendDist).toBe("../dist");
    expect(conf.bundle.targets).toEqual(["nsis"]);
    expect(readFileSync(stage.tauriConfPath, "utf8")).not.toContain("telemetry=local");
    expect(readFileSync(join(stage.stagingDir, "src-tauri", "Cargo.toml"), "utf8")).not.toContain('"devtools"');
    expect(existsSync(join(stage.stagingDir, "src-tauri", "Cargo.toml"))).toBe(true);
    expect(existsSync(join(stage.stagingDir, "src-tauri", "icons", "icon.png"))).toBe(true);
    expect(existsSync(join(stage.stagingDir, "src-tauri", "src", "main.rs"))).toBe(true);
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before);
  });

  test("the staged window is created by lib.rs, which uncaps the frame rate only on --uncapped", () => {
    const dir = scaffoldGame();
    const parsed = parseDesktopArgs([dir, "--dry-run", "--out", join(dir, "uncapped-stage")]);
    if ("error" in parsed) throw new Error(parsed.error);
    const plan = buildPlan(parsed, dir);
    if ("error" in plan) throw new Error(plan.error);
    const stage = writeStaging(plan);
    const conf = JSON.parse(readFileSync(stage.tauriConfPath, "utf8")) as { app: { windows: { label?: string; create?: boolean }[] } };
    expect(conf.app.windows[0]).toMatchObject({ label: "main", create: false });
    const lib = readFileSync(join(stage.stagingDir, "src-tauri", "src", "lib.rs"), "utf8");
    expect(lib).toBe(desktopLibRs());
    expect(lib).toContain('arg == "--uncapped"');
    expect(lib).toContain("--disable-gpu-vsync --disable-frame-rate-limit");
    // Any browser argument replaces wry's defaults, so the uncapped launch must carry them itself.
    expect(lib).toContain("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
  });

  test("a diagnostic build asks for source maps through the project's own build script too", () => {
    expect(frontendBuildCommand("bun", true, true)).toEqual({ command: "bun", args: ["run", "build", "--sourcemap"] });
    expect(frontendBuildCommand("npm", true, true)).toEqual({ command: "npm", args: ["run", "build", "--", "--sourcemap"] });
    expect(frontendBuildCommand("bun", false, true)).toEqual({ command: "bunx", args: ["vite", "build", "--sourcemap"] });
    expect(frontendBuildCommand("bun", true, false)).toEqual({ command: "bun", args: ["run", "build"] });
  });

  test("apps/desktop runs the same Rust entry and window config as a staged game", () => {
    const appRoot = join(import.meta.dirname, "..", "..", "..", "apps", "desktop", "src-tauri");
    expect(readFileSync(join(appRoot, "src", "lib.rs"), "utf8")).toBe(desktopLibRs());
    const conf = JSON.parse(readFileSync(join(appRoot, "tauri.conf.json"), "utf8")) as { app: { windows: { label?: string; create?: boolean }[] } };
    expect(conf.app.windows[0]).toMatchObject({ label: "main", create: false });
  });

  test("rejects non-game directories", () => {
    const empty = scratch();
    writeFileSync(join(empty, "package.json"), JSON.stringify({ name: "nope" }));
    const parsed = parseDesktopArgs([empty]);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const plan = buildPlan(parsed, empty);
    expect("error" in plan).toBe(true);
    if (!("error" in plan)) return;
    expect(plan.error).toContain("not a jgengine game project");
  });
});

describe("CI smoke-build (dry-run)", () => {
  // Each runs a whole staging, which takes seconds on a busy machine (#1504), like the tests below.
  test("normal staging excludes frontend source maps", async () => {
    const dir = scaffoldGame();
    const out = join(dir, "ordinary-output");
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "app.js"), "generated code");
    writeFileSync(join(dir, "dist", "app.js.map"), "private sources");
    expect(await runDesktopAsync([dir, "--dry-run", "--skip-frontend-build", "--out", out], dir)).toBe(0);
    expect(existsSync(join(out, "dist", "app.js.map"))).toBe(false);
    const before = readdirSync(`${out}.private-maps`);
    writeFileSync(join(dir, "dist", "app.js.map"), "new private sources");
    expect(await runDesktopAsync([dir, "--dry-run", "--skip-frontend-build", "--out", out], dir)).toBe(0);
    expect(readdirSync(`${out}.private-maps`)).toEqual(expect.arrayContaining(before));
  }, { timeout: 120_000 });
  test("diagnostic staging records a fingerprint but does not claim a dry run built the source", async () => {
    const dir = scaffoldGame();
    const out = join(dir, "diagnostic-output");
    expect(await runDesktopAsync([dir, "--dry-run", "--diagnostics", "--out", out], dir)).toBe(0);
    const manifest = JSON.parse(readFileSync(join(out, "dist", "jgengine-build.json"), "utf8")) as { sourceStatus: string; codeSha256: string };
    expect(manifest.sourceStatus).toBe("unverified");
    expect(manifest.codeSha256).toHaveLength(64);
    expect(manifest.codeSha256).toBe(desktopCodeHash(join(out, "dist")));
  }, { timeout: 120_000 });
  test(
    "project dry-run stages a single-game installer project",
    async () => {
      const dir = scaffoldGame();
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "dist", "index.html"), "<!doctype html><title>Probe</title>");
      const code = await runDesktopAsync(
        [dir, "--dry-run", "--skip-frontend-build", "--out", join(dir, ".jgengine", "desktop")],
        dir,
      );
      expect(code).toBe(0);
      const confPath = join(dir, ".jgengine", "desktop", "src-tauri", "tauri.conf.json");
      expect(existsSync(confPath)).toBe(true);
      const conf = JSON.parse(readFileSync(confPath, "utf8")) as {
        productName: string;
        build: { frontendDist: string };
        bundle: { targets: string[] };
      };
      expect(conf.productName).toBe("Probe Game");
      expect(conf.build.frontendDist).toBe("../dist");
      expect(conf.bundle.targets).toEqual(["nsis"]);
      expect(existsSync(join(dir, ".jgengine", "desktop", "dist", "index.html"))).toBe(true);
    },
    // Scaffolds a game and stages a Tauri project — real filesystem work whose
    // wall-time scales with load; 30s got SIGTERM'd on slow filesystems under a
    // full test:all run (issue #1504). Give it generous headroom.
    { timeout: 120_000 },
  );

  test(
    "url dry-run stages hosted config without network or rustc",
    async () => {
      const cwd = scratch();
      const out = join(cwd, "hosted-stage");
      const code = await runDesktopAsync(
        [
          "--url",
          "https://example.com/game",
          "--name",
          "Hosted Game",
          "--dry-run",
          "--allow-remote",
          "--out",
          out,
        ],
        cwd,
      );
      expect(code).toBe(0);
      const conf = JSON.parse(readFileSync(join(out, "src-tauri", "tauri.conf.json"), "utf8")) as {
        productName: string;
        build: { frontendDist: string };
        identifier: string;
      };
      expect(conf.productName).toBe("Hosted Game");
      expect(conf.build.frontendDist).toBe("https://example.com/game");
      expect(conf.identifier).toBe("com.jgengine.hostedgame");
    },
    { timeout: 120_000 },
  );
});

describe("checkToolchains", () => {
  test(
    "returns a structured report with install guidance when tools are missing",
    () => {
      const report = checkToolchains();
      expect(typeof report.ok).toBe("boolean");
      expect(Array.isArray(report.missing)).toBe(true);
      if (!report.ok) {
        expect(report.missing.length).toBeGreaterThan(0);
        expect(report.missing.join(" ")).toMatch(/rustc|cargo|npx|npm|rustup|nodejs/);
      }
    },
    { timeout: 120_000 },
  );
});
