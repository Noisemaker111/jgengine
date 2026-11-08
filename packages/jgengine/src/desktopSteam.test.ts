import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeGame } from "./create";
import { buildPlan, cargoToml, parseDesktopArgs, writeStaging } from "./desktop";
import { findSteamApiDll, resolveSteamConfig, steamAppBuildVdf, steamDepotBuildVdf, writeSteamDepot } from "./desktopSteam";

const noFlags = { appId: undefined, depotId: undefined, branch: undefined, steamworks: false };

describe("resolveSteamConfig", () => {
  test("reads the game's jgengine.steam block and defaults the depot to the app's first", () => {
    expect(resolveSteamConfig({ jgengine: { steam: { appId: 3141590, branch: "beta" } } }, noFlags)).toEqual({ appId: 3141590, depotId: 3141591, branch: "beta", steamworks: false });
    expect(resolveSteamConfig({ jgengine: { steam: { appId: 10, depotId: 77, steamworks: true } } }, noFlags)).toEqual({ appId: 10, depotId: 77, branch: null, steamworks: true });
  });

  test("a game with no app id still resolves, with no ids", () => {
    expect(resolveSteamConfig({ name: "@games/x" }, noFlags)).toEqual({ appId: null, depotId: null, branch: null, steamworks: false });
  });

  test("flags win over package.json", () => {
    expect(resolveSteamConfig({ jgengine: { steam: { appId: 10, branch: "beta" } } }, { appId: "20", depotId: "25", branch: "qa", steamworks: true })).toEqual({ appId: 20, depotId: 25, branch: "qa", steamworks: true });
  });

  test("rejects ids that are not positive whole numbers and branches SteamPipe cannot set live", () => {
    expect(resolveSteamConfig({ jgengine: { steam: { appId: "abc" } } }, noFlags)).toEqual({ error: 'Steam app id must be a positive whole number, got "abc"' });
    expect("error" in resolveSteamConfig({}, { ...noFlags, appId: "10", depotId: "-1" })).toBe(true);
    expect("error" in resolveSteamConfig({}, { ...noFlags, appId: "10", branch: "default" })).toBe(true);
    expect("error" in resolveSteamConfig({}, { ...noFlags, appId: "10", branch: "two words" })).toBe(true);
  });
});

describe("SteamPipe scripts", () => {
  test("the app build points at content/ and output/ beside scripts/ and names its depot script", () => {
    const vdf = steamAppBuildVdf(3141590, 3141591, "beta", 'Deepward 0.1.0 "abc"');
    expect(vdf).toContain('"AppID"\t"3141590"');
    expect(vdf).toContain('"ContentRoot"\t"..\\content\\"');
    expect(vdf).toContain('"BuildOutput"\t"..\\output\\"');
    expect(vdf).toContain('"SetLive"\t"beta"');
    expect(vdf).toContain('"3141591"\t"depot_build_3141591.vdf"');
    expect(vdf).toContain('"Desc"\t"Deepward 0.1.0 abc"');
    expect(steamAppBuildVdf(1, 2, null, "x")).not.toContain("SetLive");
    expect(steamDepotBuildVdf(3141591)).toContain('"DepotID"\t"3141591"');
    expect(steamDepotBuildVdf(3141591)).toContain('"LocalPath"\t"*"');
  });

  test("writeSteamDepot lays out content, scripts and output, and writes scripts only with an app id", () => {
    const dir = mkdtempSync(join(tmpdir(), "jgengine-steam-"));
    const app = join(dir, "Deepward.exe");
    writeFileSync(app, "exe");
    const dll = join(dir, "steam_api64.dll");
    writeFileSync(dll, "dll");
    const withId = writeSteamDepot(dir, app, dll, { appId: 10, depotId: 11, branch: null, steamworks: true }, "Deepward");
    expect(readFileSync(join(withId.content, "Deepward.exe"), "utf8")).toBe("exe");
    expect(readFileSync(join(withId.content, "steam_api64.dll"), "utf8")).toBe("dll");
    expect(existsSync(join(withId.root, "output"))).toBe(true);
    expect(existsSync(join(withId.root, "scripts", "depot_build_11.vdf"))).toBe(true);
    expect(withId.upload).toContain(`+run_app_build "${withId.appBuild}"`);
    const withoutId = writeSteamDepot(dir, app, null, { appId: null, depotId: null, branch: null, steamworks: false }, "Deepward");
    expect(withoutId.appBuild).toBeNull();
    expect(existsSync(join(withoutId.content, "Deepward.exe"))).toBe(true);
    expect(existsSync(join(withoutId.content, "steam_api64.dll"))).toBe(false);
    expect(existsSync(join(withoutId.root, "scripts", "depot_build_11.vdf"))).toBe(false);
  });

  test("findSteamApiDll picks the newest steamworks-sys copy in the shared target", () => {
    const target = mkdtempSync(join(tmpdir(), "jgengine-target-"));
    expect(findSteamApiDll(target)).toBeNull();
    for (const name of ["steamworks-sys-aaa", "steamworks-sys-bbb"]) {
      mkdirSync(join(target, "release", "build", name, "out"), { recursive: true });
      writeFileSync(join(target, "release", "build", name, "out", "steam_api64.dll"), name);
    }
    expect(findSteamApiDll(target)).toContain("steamworks-sys-");
  });
});

describe("jgengine desktop --steam", () => {
  test("--steamworks implies --steam, which builds no installer; Steam flags need --steam; hosted pages cannot", () => {
    const steamworks = parseDesktopArgs(["./g", "--steamworks"]);
    if ("error" in steamworks) throw new Error(steamworks.error);
    expect(steamworks).toMatchObject({ steam: true, steamworks: true, installer: false });
    const plain = parseDesktopArgs(["./g", "--no-installer"]);
    if ("error" in plain) throw new Error(plain.error);
    expect(plain).toMatchObject({ steam: false, installer: false });
    expect(parseDesktopArgs(["./g", "--steam-app", "10"])).toEqual({ error: "--steam-app, --steam-depot and --steam-branch need --steam" });
    expect(parseDesktopArgs(["--url", "https://jgengine.com/x", "--steam"])).toEqual({ error: "--steam requires a local project" });
  });

  test("a Steamworks build adds the steam feature and its pinned crates; a plain build only declares it", () => {
    const steam = cargoToml("jgengine_x", "0.1.0", false, true);
    expect(steam).toContain('default = ["steam"]');
    expect(steam).toContain('steamworks = { version = "=0.13.1", optional = true }');
    expect(steam).toContain('"tauri/unstable"');
    const plain = cargoToml("jgengine_x", "0.1.0", false, false);
    expect(plain).toContain("steam = []");
    expect(plain).not.toContain("steamworks");
  });

  test("the plan reads the game's Steam ids from package.json", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "jgengine-desktop-")), "probe-game");
    writeGame(dir, "probe-game", "Probe Game", "standalone");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(dir, "package.json"), JSON.stringify({ ...pkg, jgengine: { steam: { appId: 480000, steamworks: true } } }));
    const parsed = parseDesktopArgs([dir, "--steam", "--dry-run", "--out", join(dir, "stage")]);
    if ("error" in parsed) throw new Error(parsed.error);
    const plan = buildPlan(parsed, dir);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.steam).toEqual({ appId: 480000, depotId: 480001, branch: null, steamworks: true });
    expect(plan.installer).toBe(false);
    writeStaging(plan);
    expect(readFileSync(join(dir, "stage", "src-tauri", "Cargo.toml"), "utf8")).toContain('default = ["steam"]');
  });
});
