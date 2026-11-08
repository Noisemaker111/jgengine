import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * A game's Steam identity, from `package.json` `"jgengine": { "steam": { ... } }` with the
 * `--steam-app`, `--steam-depot` and `--steam-branch` flags winning. Nothing here is hardcoded:
 * a game with no app id still builds its depot content and is told the id is missing.
 */
export interface SteamConfig {
  appId: number | null;
  /** The Windows depot; Steamworks creates the first depot as app id + 1, so that is the default. */
  depotId: number | null;
  /** A branch to set the build live on after upload (never the default branch, which SteamPipe refuses). */
  branch: string | null;
  /** Link the Steamworks API and the overlay surface (`--steamworks`, or `"steamworks": true`). */
  steamworks: boolean;
}

/** The flags `jgengine desktop` passes on. @internal */
export interface SteamFlags {
  appId: string | undefined;
  depotId: string | undefined;
  branch: string | undefined;
  steamworks: boolean;
}

function steamId(raw: unknown, what: string): number | null | { error: string } {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (!Number.isSafeInteger(value) || value <= 0) return { error: `Steam ${what} must be a positive whole number, got ${JSON.stringify(raw)}` };
  return value;
}

/** Merge the game's `jgengine.steam` block with the command-line flags. @internal */
export function resolveSteamConfig(packageJson: unknown, flags: SteamFlags): SteamConfig | { error: string } {
  const block = typeof packageJson === "object" && packageJson !== null ? Reflect.get(packageJson, "jgengine") : undefined;
  const saved = typeof block === "object" && block !== null ? Reflect.get(block, "steam") : undefined;
  const field = (name: string): unknown => (typeof saved === "object" && saved !== null ? Reflect.get(saved, name) : undefined);
  const appId = steamId(flags.appId ?? field("appId"), "app id");
  if (typeof appId === "object" && appId !== null) return appId;
  const depotId = steamId(flags.depotId ?? field("depotId"), "depot id");
  if (typeof depotId === "object" && depotId !== null) return depotId;
  const rawBranch = flags.branch ?? field("branch");
  if (rawBranch !== undefined && typeof rawBranch !== "string") return { error: `Steam branch must be a string, got ${JSON.stringify(rawBranch)}` };
  const branch = rawBranch === undefined || rawBranch.trim() === "" ? null : rawBranch.trim();
  if (branch !== null && !/^[A-Za-z0-9_.-]+$/.test(branch)) return { error: `Steam branch must be letters, digits, '.', '_' or '-', got "${branch}"` };
  if (branch === "default" || branch === "public") return { error: `SteamPipe cannot set the ${branch} branch live from a build script; set it live in Steamworks or name a beta branch` };
  return {
    appId,
    depotId: depotId ?? (appId === null ? null : appId + 1),
    branch,
    steamworks: flags.steamworks || field("steamworks") === true,
  };
}

/** SteamPipe's app build script, relative to the `scripts/` folder it is written into. @internal */
export function steamAppBuildVdf(appId: number, depotId: number, branch: string | null, description: string): string {
  return [
    `"AppBuild"`,
    `{`,
    `\t"AppID"\t"${appId}"`,
    `\t"Desc"\t"${description.replace(/["\\]/g, "")}"`,
    `\t"ContentRoot"\t"..\\content\\"`,
    `\t"BuildOutput"\t"..\\output\\"`,
    ...(branch === null ? [] : [`\t"SetLive"\t"${branch}"`]),
    `\t"Depots"`,
    `\t{`,
    `\t\t"${depotId}"\t"depot_build_${depotId}.vdf"`,
    `\t}`,
    `}`,
    ``,
  ].join("\n");
}

/** SteamPipe's depot build script: everything in `content/` at the depot root. @internal */
export function steamDepotBuildVdf(depotId: number): string {
  return [
    `"DepotBuild"`,
    `{`,
    `\t"DepotID"\t"${depotId}"`,
    `\t"FileMapping"`,
    `\t{`,
    `\t\t"LocalPath"\t"*"`,
    `\t\t"DepotPath"\t"."`,
    `\t\t"Recursive"\t"1"`,
    `\t}`,
    `}`,
    ``,
  ].join("\n");
}

/**
 * Where steamworks-sys copied Valve's `steam_api64.dll` in the shared cargo target: the newest
 * one, since every build of the crate writes its own `build/steamworks-sys-*` folder.
 * @internal
 */
export function findSteamApiDll(targetDir: string): string | null {
  const build = join(targetDir, "release", "build");
  if (!existsSync(build)) return null;
  let best: { path: string; mtime: number } | null = null;
  for (const entry of readdirSync(build)) {
    if (!entry.startsWith("steamworks-sys-")) continue;
    const dll = join(build, entry, "out", "steam_api64.dll");
    if (!existsSync(dll)) continue;
    const mtime = statSync(dll).mtimeMs;
    if (best === null || mtime > best.mtime) best = { path: dll, mtime };
  }
  return best?.path ?? null;
}

/** What `writeSteamDepot` laid out. @internal */
export interface SteamDepot {
  root: string;
  content: string;
  /** The app build script, or null when the game has no app id yet. */
  appBuild: string | null;
  upload: string | null;
}

/**
 * Lay out a SteamPipe build beside the app: `steam/content/` (the game executable, plus
 * `steam_api64.dll` for a Steamworks build), `steam/scripts/` (app and depot build scripts) and
 * an empty `steam/output/` for SteamPipe's logs. The scripts are written only with an app id.
 * @internal
 */
export function writeSteamDepot(stagingDir: string, app: string, steamApiDll: string | null, config: SteamConfig, description: string): SteamDepot {
  const root = join(stagingDir, "steam");
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  const content = join(root, "content");
  const scripts = join(root, "scripts");
  mkdirSync(content, { recursive: true });
  mkdirSync(scripts, { recursive: true });
  mkdirSync(join(root, "output"), { recursive: true });
  cpSync(app, join(content, app.slice(app.replace(/\\/g, "/").lastIndexOf("/") + 1)));
  if (steamApiDll !== null) cpSync(steamApiDll, join(content, "steam_api64.dll"));
  if (config.appId === null || config.depotId === null) return { root, content, appBuild: null, upload: null };
  const appBuild = resolve(scripts, `app_build_${config.appId}.vdf`);
  writeFileSync(appBuild, steamAppBuildVdf(config.appId, config.depotId, config.branch, description));
  writeFileSync(join(scripts, `depot_build_${config.depotId}.vdf`), steamDepotBuildVdf(config.depotId));
  return { root, content, appBuild, upload: `steamcmd +login <steamworks-build-account> +run_app_build "${appBuild}" +quit` };
}
