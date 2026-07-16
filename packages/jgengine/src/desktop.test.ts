import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeGame } from "./create";
import {
  buildPlan,
  checkToolchains,
  defaultIdentifier,
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
    expect(existsSync(join(stage.stagingDir, "src-tauri", "Cargo.toml"))).toBe(true);
    expect(existsSync(join(stage.stagingDir, "src-tauri", "icons", "icon.png"))).toBe(true);
    expect(existsSync(join(stage.stagingDir, "src-tauri", "src", "main.rs"))).toBe(true);
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before);
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
    { timeout: 30_000 },
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
    { timeout: 30_000 },
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
    { timeout: 30_000 },
  );
});
