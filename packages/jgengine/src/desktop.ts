import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

import { decodePng } from "@jgengine/assets/imageCodec";

import { buildDesktopIcons, DESKTOP_ICON_FILES } from "./desktopIcons";
import { extractDesktopMaps } from "./desktopMaps";
import { findSteamApiDll, resolveSteamConfig, writeSteamDepot, type SteamConfig } from "./desktopSteam";
import { escapeHtml } from "./escapeHtml";
import { flag, hasFlag, readPackageJson } from "./pkg";
import { displayNameFromId, GAME_ID_PATTERN } from "./templates";

export type DesktopMode = "project" | "url";

export interface DesktopMetadata {
  productName: string;
  identifier: string;
  version: string;
  windowTitle: string;
}

export interface DesktopArgs {
  mode: DesktopMode;
  projectDir: string | null;
  url: string | null;
  name: string | undefined;
  id: string | undefined;
  version: string | undefined;
  icon: string | undefined;
  outDir: string | undefined;
  dryRun: boolean;
  skipFrontendBuild: boolean;
  allowRemote: boolean;
  diagnostics: boolean;
  /** Lay out a SteamPipe depot and build scripts beside the app (`--steam`). */
  steam: boolean;
  /** Link the Steamworks API and the overlay surface (`--steamworks`, implies `--steam`). */
  steamworks: boolean;
  /** Build the NSIS installer; `--no-installer` and `--steam` build only the game executable. */
  installer: boolean;
  steamApp: string | undefined;
  steamDepot: string | undefined;
  steamBranch: string | undefined;
}

export interface DesktopPlan {
  mode: DesktopMode;
  projectDir: string | null;
  url: string | null;
  stagingDir: string;
  metadata: DesktopMetadata;
  iconSource: string | null;
  /** Set when a project icon was found but could not be read, so the jgengine mark is used. */
  iconWarning: string | null;
  frontendDist: string;
  diagnostics: boolean;
  /** The game's Steam identity when `--steam` was asked for. */
  steam: SteamConfig | null;
  installer: boolean;
}

export interface ToolchainReport {
  ok: boolean;
  missing: string[];
}

export interface StageResult {
  stagingDir: string;
  tauriConfPath: string;
  metadata: DesktopMetadata;
  frontendDist: string;
  mode: DesktopMode;
}

interface BuildSource { commit: string | null; dirty: boolean | null }

/** Source identity from the project checkout; unavailable git state stays unknown. @internal */
export function desktopBuildSource(projectDir: string): BuildSource {
  const run = (args: string[]) => spawnSync("git", args, { cwd: projectDir, encoding: "utf8", windowsHide: true, timeout: 5_000 });
  const head = run(["rev-parse", "HEAD"]);
  const status = run(["status", "--porcelain"]);
  return { commit: head.status === 0 ? head.stdout.trim() || null : null, dirty: status.status === 0 ? status.stdout.trim().length > 0 : null };
}

/** Fingerprint the staged HTML, JS and CSS, not game assets or private source maps. @internal */
export function desktopCodeHash(dist: string): string {
  const hash = createHash("sha256");
  const visit = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path, name);
      else if (entry.isFile() && /\.(html|js|css)$/i.test(entry.name)) { hash.update(name); hash.update("\0"); hash.update(readFileSync(path)); }
    }
  };
  visit(dist, "");
  return hash.digest("hex");
}

const VALUE_FLAGS = new Set(["--url", "--name", "--id", "--version", "--icon", "--out", "--steam-app", "--steam-depot", "--steam-branch"]);
const SWITCH_FLAGS = new Set(["--dry-run", "--skip-frontend-build", "--allow-remote", "--diagnostics", "--steam", "--steamworks", "--no-installer", "--help", "-h"]);

const DEFAULT_VERSION = "0.1.0";

const DESKTOP_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' data: blob: ws: wss: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'; frame-ancestors 'none'";

const ALLOWED_REMOTE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "jgengine.com"]);

const DESKTOP_USAGE = `usage: jgengine desktop [projectDir] [options]

Ship a Windows NSIS installer for a local jgengine game, or wrap a hosted HTTPS game.

  jgengine desktop                 # local project in cwd (offline-capable)
  jgengine desktop ./my-game
  jgengine desktop --url https://jgengine.com/games/snake

options:
  --url <https-url>   hosted mode: load this HTTPS page in the desktop window
  --name <title>      product / window title (default: package name or host)
  --id <reverse.dns>  bundle identifier (default: com.jgengine.<slug>)
  --version <semver>  app version (default: package.json version or ${DEFAULT_VERSION})
  --icon <path.png>   window/installer icon, any square-ish PNG (default: see below)
  --out <dir>         staging directory (default: <project>/.jgengine/desktop)
  --dry-run           generate staging + config only; skip toolchain + Rust build
  --skip-frontend-build  reuse existing dist/ (local mode; for tests)
  --diagnostics       opt into local frame telemetry and WebView developer tools
  --no-installer      build only the game executable, without the NSIS installer
  --steam             also lay out a SteamPipe build in <staging>/steam (implies --no-installer):
                        content/  the game executable (and steam_api64.dll with --steamworks)
                        scripts/  app_build_<appid>.vdf and depot_build_<depotid>.vdf
                        output/   SteamPipe's build logs
                      ids come from package.json "jgengine": { "steam": { "appId", "depotId",
                      "branch", "steamworks" } }; without an app id the content is still built
  --steam-app <id>    Steam app id (overrides package.json)
  --steam-depot <id>  Windows depot id (default: app id + 1, the depot Steamworks creates first)
  --steam-branch <b>  beta branch to set the build live on after upload
  --steamworks        link the Steamworks API so the Steam overlay (Shift+Tab) works when Steam
                      launches the game; implies --steam
  --allow-remote      allow --url to point at a host outside the trusted allowlist
                       (localhost, jgengine.com and its subdomains) — only pass this
                       for a hosted URL you trust; the shipped app loads it live

defaults (deterministic):
  name     package.json name → title case, or URL hostname
  id       com.jgengine.<alphanumeric slug from name>
  version  package.json "version" or ${DEFAULT_VERSION}
  icon     public/icon.png, icon.png, public/cover.png or cover.png in the project
           (centre-cropped), else the jgengine mark; icon.ico and every size are generated

output:
  <staging>/<Name>.exe              the game itself; runs without installing
  <staging>/<Name>_<ver>_x64-setup.exe  the NSIS installer
  <Name>.exe --uncapped             run without the display's frame-rate cap on Windows
                                    (WebView2) whatever the player saved; otherwise the game
                                    follows its Frame rate setting (default: match display)
  Rust builds share one cargo target dir (CARGO_TARGET_DIR, default
  %LOCALAPPDATA%/jgengine/desktop-target), so only the first game compiles Tauri.
`;

/** @internal */
export function parseDesktopArgs(argv: string[]): DesktopArgs | { error: string } {
  if (hasFlag(argv, "help") || argv.includes("-h")) {
    return { error: "help" };
  }

  const url = flag(argv, "url");
  const name = flag(argv, "name");
  const id = flag(argv, "id");
  const version = flag(argv, "version");
  const icon = flag(argv, "icon");
  const outDir = flag(argv, "out");
  const dryRun = hasFlag(argv, "dry-run");
  const skipFrontendBuild = hasFlag(argv, "skip-frontend-build");
  const allowRemote = hasFlag(argv, "allow-remote");
  const diagnostics = hasFlag(argv, "diagnostics");
  const steamworks = hasFlag(argv, "steamworks");
  const steam = steamworks || hasFlag(argv, "steam");
  const installer = !steam && !hasFlag(argv, "no-installer");
  const steamApp = flag(argv, "steam-app");
  const steamDepot = flag(argv, "steam-depot");
  const steamBranch = flag(argv, "steam-branch");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("-")) continue;
    if (SWITCH_FLAGS.has(arg)) continue;
    if (VALUE_FLAGS.has(arg)) {
      if (argv[index + 1] === undefined || argv[index + 1]!.startsWith("-")) {
        return { error: `${arg} requires a value` };
      }
      index += 1;
      continue;
    }
    return { error: `unknown option: ${arg}` };
  }

  let projectDir: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith("--")) {
      if (VALUE_FLAGS.has(arg)) index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    if (projectDir !== null) return { error: "pass at most one project directory" };
    projectDir = arg;
  }

  if (url !== undefined && projectDir !== null) {
    return { error: "pass either a project directory or --url, not both" };
  }
  if (url !== undefined && diagnostics) return { error: "--diagnostics requires a local project" };
  if (url !== undefined && steam) return { error: "--steam requires a local project" };
  if (!steam && (steamApp !== undefined || steamDepot !== undefined || steamBranch !== undefined)) {
    return { error: "--steam-app, --steam-depot and --steam-branch need --steam" };
  }

  if (url !== undefined) {
    return {
      mode: "url",
      projectDir: null,
      url,
      name,
      id,
      version,
      icon,
      outDir,
      dryRun,
      skipFrontendBuild,
      allowRemote,
      diagnostics,
      steam,
      steamworks,
      installer,
      steamApp,
      steamDepot,
      steamBranch,
    };
  }

  return {
    mode: "project",
    projectDir: projectDir ?? ".",
    url: null,
    name,
    id,
    version,
    icon,
    outDir,
    dryRun,
    skipFrontendBuild,
    allowRemote,
    diagnostics,
    steam,
    steamworks,
    installer,
    steamApp,
    steamDepot,
    steamBranch,
  };
}

/** @internal */
export function validateHttpsUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: `invalid URL: ${raw}` };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: `--url must be https (got ${parsed.protocol}//)` };
  }
  if (parsed.hostname.length === 0) {
    return { ok: false, error: `--url is missing a host` };
  }
  return { ok: true, url: parsed };
}

/** @internal */
export function isAllowedDesktopOrigin(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_REMOTE_HOSTS.has(host) || host.endsWith(".jgengine.com");
}

/** @internal */
export function slugFromProductName(name: string): string {
  let slug = name
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/.*\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) return "game";
  if (!/^[a-z]/.test(slug)) slug = `game-${slug}`.replace(/-+$/g, "");
  if (!GAME_ID_PATTERN.test(slug)) {
    slug = slug.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    if (!/^[a-z]/.test(slug)) slug = `game-${slug || "app"}`;
  }
  return slug.length > 0 ? slug : "game";
}

/** @internal */
export function defaultIdentifier(productName: string): string {
  const segment = slugFromProductName(productName).replace(/-/g, "");
  return `com.jgengine.${segment.length > 0 ? segment : "game"}`;
}

/** @internal */
export function validateIdentifier(id: string): string | null {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(id)) {
    return `identifier must be reverse-DNS (e.g. com.jgengine.mygame), got "${id}"`;
  }
  return null;
}

/** @internal */
export function validateVersion(version: string): string | null {
  if (!/^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/.test(version)) {
    return `version must look like semver (e.g. 1.0.0), got "${version}"`;
  }
  return null;
}

/** @internal */
export function packageDisplayName(pkgName: string | undefined): string | null {
  if (pkgName === undefined || pkgName.length === 0) return null;
  const bare = pkgName.includes("/") ? pkgName.slice(pkgName.lastIndexOf("/") + 1) : pkgName;
  if (bare.includes("-") || bare === bare.toLowerCase()) return displayNameFromId(bare.toLowerCase());
  return bare;
}

/** @internal */
export function readGameConfigName(projectDir: string): string | null {
  const configPath = join(projectDir, "src", "game.config.ts");
  if (!existsSync(configPath)) return null;
  return defineGameName(readFileSync(configPath, "utf8"));
}

/**
 * The top-level `name` of the object passed to `defineGame(...)`, skipping every nested object's
 * `name` (a command's `invoke: { name: "relay.start" }` once named a whole desktop app). Strings
 * and comments are stepped over so a brace inside one does not change the depth.
 * @internal
 */
export function defineGameName(source: string): string | null {
  const call = /\bdefineGame\s*\(\s*\{/.exec(source);
  if (call === null) return null;
  let depth = 1;
  for (let index = call.index + call[0].length; index < source.length && depth > 0; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      const end = source.indexOf(char, index + 1);
      if (end < 0) return null;
      index = end;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index);
      index = end < 0 ? source.length : end;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") depth += 1;
    else if (char === "}" || char === "]" || char === ")") depth -= 1;
    else if (depth === 1) {
      const match = /^name\s*:\s*(["'`])([^"'`]+)\1/.exec(source.slice(index, index + 200));
      if (match !== null && !/[\w$]/.test(source[index - 1] ?? "")) return match[2] ?? null;
    }
  }
  return null;
}

/** @internal */
export function resolveMetadata(input: {
  mode: DesktopMode;
  projectDir: string | null;
  url: URL | null;
  name?: string | undefined;
  id?: string | undefined;
  version?: string | undefined;
}): DesktopMetadata | { error: string } {
  let productName = input.name?.trim();
  let version = input.version?.trim();

  if (input.mode === "project" && input.projectDir !== null) {
    const pkg = readPackageJson(join(input.projectDir, "package.json"));
    if (productName === undefined || productName.length === 0) {
      productName =
        readGameConfigName(input.projectDir) ?? packageDisplayName(pkg?.name) ?? "JGengine Game";
    }
    if (version === undefined || version.length === 0) {
      version = pkg?.version ?? DEFAULT_VERSION;
    }
  } else if (input.mode === "url" && input.url !== null) {
    if (productName === undefined || productName.length === 0) {
      const host = input.url.hostname.replace(/^www\./, "");
      productName = host.length > 0 ? host : "JGengine Game";
    }
    if (version === undefined || version.length === 0) {
      version = DEFAULT_VERSION;
    }
  } else {
    productName = productName && productName.length > 0 ? productName : "JGengine Game";
    version = version && version.length > 0 ? version : DEFAULT_VERSION;
  }

  if (productName.length === 0) return { error: "product name must not be empty" };

  const identifier = input.id?.trim() || defaultIdentifier(productName);
  const idError = validateIdentifier(identifier);
  if (idError !== null) return { error: idError };
  const versionError = validateVersion(version);
  if (versionError !== null) return { error: versionError };

  return {
    productName,
    identifier,
    version,
    windowTitle: productName,
  };
}

/** @internal */
export function isGameProject(dir: string): { ok: true } | { ok: false; error: string } {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    return { ok: false, error: `not a project: missing package.json in ${dir}` };
  }
  const pkg = readPackageJson(pkgPath);
  if (pkg === null) {
    return { ok: false, error: `unreadable package.json in ${dir}` };
  }
  const hasIndex = existsSync(join(dir, "index.html"));
  const hasVite = existsSync(join(dir, "vite.config.ts")) || existsSync(join(dir, "vite.config.js"));
  const hasGameConfig = existsSync(join(dir, "src", "game.config.ts"));
  const hasBuild = pkg.scripts?.["build"] !== undefined;
  if (!hasIndex && !hasGameConfig) {
    return {
      ok: false,
      error: `not a jgengine game project: expected index.html or src/game.config.ts in ${dir}`,
    };
  }
  if (!hasVite && !hasBuild) {
    return {
      ok: false,
      error: `not a buildable project: expected vite.config.ts or a "build" script in ${dir}`,
    };
  }
  return { ok: true };
}

/** @internal */
export function resolveIconSource(projectDir: string | null, explicit: string | undefined): string | null {
  if (explicit !== undefined) {
    const path = resolve(explicit);
    if (!existsSync(path)) return null;
    return path;
  }
  if (projectDir === null) return null;
  for (const candidate of [
    join(projectDir, "public", "icon.png"),
    join(projectDir, "icon.png"),
    join(projectDir, "public", "cover.png"),
    join(projectDir, "cover.png"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function iconError(path: string): string | null {
  if (extname(path).toLowerCase() !== ".png") return `icon must be a PNG: ${path}`;
  try {
    decodePng(readFileSync(path));
    return null;
  } catch (error) {
    return `unreadable icon ${path}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** @internal */
export function defaultStagingDir(mode: DesktopMode, projectDir: string | null, cwd: string): string {
  if (mode === "project" && projectDir !== null) return join(projectDir, ".jgengine", "desktop");
  return join(cwd, ".jgengine", "desktop");
}

/** @internal */
export function buildPlan(args: DesktopArgs, cwd: string = process.cwd()): DesktopPlan | { error: string } {
  if (args.mode === "url") {
    if (args.url === null) return { error: "--url requires an https URL" };
    const validated = validateHttpsUrl(args.url);
    if (!validated.ok) return { error: validated.error };
    if (!args.allowRemote && !isAllowedDesktopOrigin(validated.url.hostname)) {
      return {
        error: `--url host "${validated.url.hostname}" is outside the trusted allowlist (localhost, jgengine.com and its subdomains) — the shipped app loads this URL live on every launch. Pass --allow-remote to build an installer for a URL you trust.`,
      };
    }
    const metadata = resolveMetadata({
      mode: "url",
      projectDir: null,
      url: validated.url,
      name: args.name,
      id: args.id,
      version: args.version,
    });
    if ("error" in metadata) return metadata;
    const stagingDir = resolve(args.outDir ?? defaultStagingDir("url", null, cwd));
    const iconSource = resolveIconSource(null, args.icon);
    if (args.icon !== undefined && iconSource === null) {
      return { error: `icon not found: ${args.icon}` };
    }
    const urlIconError = iconSource === null ? null : iconError(iconSource);
    if (urlIconError !== null) return { error: urlIconError };
    return {
      mode: "url",
      projectDir: null,
      url: validated.url.toString(),
      stagingDir,
      metadata,
      iconSource,
      iconWarning: null,
      frontendDist: validated.url.toString(),
      diagnostics: false,
      steam: null,
      installer: args.installer,
    };
  }

  const projectDir = resolve(args.projectDir ?? cwd);
  const shape = isGameProject(projectDir);
  if (!shape.ok) return { error: shape.error };
  const metadata = resolveMetadata({
    mode: "project",
    projectDir,
    url: null,
    name: args.name,
    id: args.id,
    version: args.version,
  });
  if ("error" in metadata) return metadata;
  const stagingDir = resolve(args.outDir ?? defaultStagingDir("project", projectDir, cwd));
  const found = resolveIconSource(projectDir, args.icon);
  if (args.icon !== undefined && found === null) {
    return { error: `icon not found: ${args.icon}` };
  }
  const projectIconError = found === null ? null : iconError(found);
  if (projectIconError !== null && args.icon !== undefined) return { error: projectIconError };
  const iconSource = projectIconError === null ? found : null;
  const steam = args.steam
    ? resolveSteamConfig(readPackageJson(join(projectDir, "package.json")), { appId: args.steamApp, depotId: args.steamDepot, branch: args.steamBranch, steamworks: args.steamworks })
    : null;
  if (steam !== null && "error" in steam) return steam;
  return {
    mode: "project",
    projectDir,
    url: null,
    stagingDir,
    metadata,
    iconSource,
    iconWarning: projectIconError,
    frontendDist: "../dist",
    diagnostics: args.diagnostics,
    steam,
    installer: args.installer,
  };
}

function crateNameFromIdentifier(identifier: string): string {
  const last = identifier.split(".").pop() ?? "game";
  const cleaned = last.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  return cleaned.length > 0 ? `jgengine_${cleaned}` : "jgengine_game";
}

function tauriConf(plan: DesktopPlan): string {
  return `${JSON.stringify(
    {
      $schema: "https://schema.tauri.app/config/2",
      productName: plan.metadata.productName,
      version: plan.metadata.version,
      identifier: plan.metadata.identifier,
      build: {
        frontendDist: plan.frontendDist,
      },
      app: {
        windows: [
          {
            // Created by lib.rs, which adds the browser flags `--uncapped` asks for.
            label: "main",
            create: false,
            title: plan.metadata.windowTitle,
            width: 1280,
            height: 800,
            resizable: true,
            ...(plan.diagnostics ? { url: "index.html?telemetry=local&frameMembers=1" } : {}),
          },
        ],
        security: {
          csp: DESKTOP_CSP,
        },
      },
      bundle: {
        active: true,
        targets: ["nsis"],
        icon: DESKTOP_ICON_FILES.map((name) => `icons/${name}`),
      },
    },
    null,
    2,
  )}\n`;
}

/** Exact versions: a Steam build links Valve's binaries and a third-party overlay surface. */
const STEAMWORKS_CRATE = "=0.13.1";
const STEAM_OVERLAY_SURFACE_CRATE = "=0.1.3";

/** @internal */
export function cargoToml(crate: string, version: string, diagnostics: boolean, steamworks: boolean): string {
  return `[package]
name = "${crate}"
version = "${version}"
edition = "2021"

[lib]
name = "${crate}_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[features]
${steamworks
    ? `default = ["steam"]
# The Steamworks API and a transparent window Steam's overlay can draw into: WebView2 renders in its
# own processes, so Steam's in-process hook finds no swapchain of the game's to draw on.
steam = ["dep:steamworks", "dep:tauri-plugin-steam-overlay-surface", "tauri/unstable"]`
    : `steam = []`}

[dependencies]
# Without "compression": game assets are mostly already-compressed models and textures, and brotli over
# them at build time costs minutes per game. The NSIS installer compresses the whole app anyway.
tauri = { version = "2", default-features = false, features = ["wry", "common-controls-v6", "dynamic-acl", "x11", "dbus"${diagnostics ? ', "devtools"' : ""}] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
${steamworks
    ? `steamworks = { version = "${STEAMWORKS_CRATE}", optional = true }
tauri-plugin-steam-overlay-surface = { version = "${STEAM_OVERLAY_SURFACE_CRATE}", optional = true }
`
    : ""}`;
}

/**
 * The desktop app's Rust entry, shared by every staged game and `apps/desktop` (a test keeps that
 * copy identical). The window is created here rather than from `tauri.conf.json` so the frame-rate
 * choice can reach WebView2, which takes browser flags only when it starts: the player's saved
 * "Frame rate" setting (`frame-rate.txt` in the app's config folder, written by `set_frame_rate`),
 * or `--uncapped` on the command line, adds the flags that stop it pacing to the display's vsync.
 * The default keeps vsync, which laptops and batteries want; macOS and Linux webviews ignore the
 * flags. The player's Display mode (`fullscreen.txt`, written by `set_fullscreen`) switches the
 * window to borderless fullscreen at once and opens it that way next time; unlike the page's HTML
 * fullscreen, it survives alt-tab. The page learns both from `window.__JG_DESKTOP__`. The `steam`
 * feature (`jgengine desktop --steamworks`) starts Steamworks before any window, gives Steam's
 * overlay a surface it can hook, and forwards Shift+Tab, which lands in WebView2's process.
 * @internal
 */
export function desktopLibRs(): string {
  return `// Generated by \`jgengine desktop\` (packages/jgengine/src/desktop.ts desktopLibRs); apps/desktop keeps an identical copy.

use tauri::Manager;

/// What wry passes when no browser arguments are given; setting any replaces these, so they are kept.
const DEFAULT_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
/// WebView2 (Chromium) flags that stop it pacing frames to the display's vsync.
const UNCAPPED_BROWSER_ARGS: &str = "--disable-gpu-vsync --disable-frame-rate-limit";
/// The player's display choices, one small file each in the app's config folder: the frame rate
/// ("vsync" or "uncapped") and whether the window is borderless fullscreen ("1" or "0").
const FRAME_RATE_FILE: &str = "frame-rate.txt";
const FULLSCREEN_FILE: &str = "fullscreen.txt";

/// \`<game>.exe --uncapped\` renders as fast as the game can, whatever the player saved.
fn uncapped_flag() -> bool {
    std::env::args().skip(1).any(|arg| arg == "--uncapped")
}

fn saved_choice(app: &tauri::AppHandle, file: &str) -> Option<String> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::read_to_string(dir.join(file)).ok().map(|value| value.trim().to_string())
}

fn save_choice(app: &tauri::AppHandle, file: &str, value: &str) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    std::fs::write(dir.join(file), value).map_err(|error| error.to_string())
}

fn saved_frame_rate(app: &tauri::AppHandle) -> &'static str {
    if saved_choice(app, FRAME_RATE_FILE).as_deref() == Some("uncapped") {
        "uncapped"
    } else {
        "vsync"
    }
}

/// Saves the player's frame-rate choice; WebView2 applies it on the next launch.
#[tauri::command]
fn set_frame_rate(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    if mode != "vsync" && mode != "uncapped" {
        return Err(format!("unknown frame rate {mode:?}; expected vsync or uncapped"));
    }
    save_choice(&app, FRAME_RATE_FILE, &mode)
}

/// Switches between a window and borderless fullscreen now, and opens the game that way next time.
#[tauri::command]
fn set_fullscreen(window: tauri::WebviewWindow, fullscreen: bool) -> Result<(), String> {
    window.set_fullscreen(fullscreen).map_err(|error| error.to_string())?;
    save_choice(window.app_handle(), FULLSCREEN_FILE, if fullscreen { "1" } else { "0" })
}

/// Opens the Steam overlay. The page forwards Shift+Tab here: keys land in WebView2's process,
/// where Steam's input hook never sees them.
#[tauri::command]
fn steam_overlay(app: tauri::AppHandle) -> bool {
    #[cfg(feature = "steam")]
    return app.try_state::<steam::Steam>().map(|steam| steam.open_overlay()).unwrap_or(false);
    #[cfg(not(feature = "steam"))]
    {
        let _ = app;
        false
    }
}

/// What the page reads as \`window.__JG_DESKTOP__\`, plus the Shift+Tab forward when Steam's overlay is live.
fn desktop_script(running: &str, saved: &str, forced: bool, fullscreen: bool, steam_overlay: bool) -> String {
    let shell = format!(
        r#"Object.defineProperty(window, "__JG_DESKTOP__", {{ value: Object.freeze({{ frameRate: Object.freeze({{ running: "{running}", saved: "{saved}", forced: {forced} }}), fullscreen: {fullscreen}, steamOverlay: {steam_overlay} }}) }});"#
    );
    if !steam_overlay {
        return shell;
    }
    shell
        + r#"addEventListener("keydown", (event) => { if (event.key === "Tab" && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); event.stopImmediatePropagation(); window.__TAURI_INTERNALS__.invoke("steam_overlay"); } }, true);"#
}

#[cfg(feature = "steam")]
mod steam {
    pub struct Steam(steamworks::Client);

    impl Steam {
        /// Before any window: Steam's overlay hooks only swapchains created after it is up.
        /// Fails, and the game runs without Steam, unless Steam launched it or steam_appid.txt names an app.
        pub fn init() -> Option<Steam> {
            let client = steamworks::Client::init().ok()?;
            let pump = client.clone();
            std::thread::spawn(move || loop {
                pump.run_callbacks();
                std::thread::sleep(std::time::Duration::from_millis(50));
            });
            Some(Steam(client))
        }

        pub fn open_overlay(&self) -> bool {
            self.0.friends().activate_game_overlay("");
            true
        }

        /// Hands input to the overlay surface while Steam's overlay is open, and back after.
        pub fn forward_overlay_events(&self, app: &tauri::AppHandle) {
            let handle = app.clone();
            std::mem::forget(self.0.register_callback(move |event: steamworks::GameOverlayActivated| {
                tauri_plugin_steam_overlay_surface::on_overlay_activated(&handle, event.active);
            }));
        }
    }

    /// Steam launched this process and injected its overlay renderer.
    pub fn overlay_injected() -> bool {
        #[link(name = "kernel32")]
        extern "system" {
            fn GetModuleHandleW(name: *const u16) -> isize;
        }
        let name: Vec<u16> = "GameOverlayRenderer64.dll".encode_utf16().chain(std::iter::once(0)).collect();
        unsafe { GetModuleHandleW(name.as_ptr()) != 0 }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let forced = uncapped_flag();
    #[cfg(feature = "steam")]
    let steam = steam::Steam::init();
    #[cfg(feature = "steam")]
    let overlay_surface = steam.is_some() || steam::overlay_injected();
    #[cfg(not(feature = "steam"))]
    let overlay_surface = false;
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default().invoke_handler(tauri::generate_handler![set_frame_rate, set_fullscreen, steam_overlay]);
    #[cfg(feature = "steam")]
    if overlay_surface {
        builder = builder.plugin(tauri_plugin_steam_overlay_surface::init());
    }
    builder
        .setup(move |app| {
            #[cfg(feature = "steam")]
            if let Some(steam) = steam {
                steam.forward_overlay_events(app.handle());
                app.manage(steam);
            }
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or("tauri.conf.json declares no window")?;
            let saved = saved_frame_rate(app.handle());
            let uncapped = forced || saved == "uncapped";
            let fullscreen = saved_choice(app.handle(), FULLSCREEN_FILE).as_deref() == Some("1");
            let mut window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.fullscreen(fullscreen);
            if uncapped {
                window = window.additional_browser_args(&format!("{DEFAULT_BROWSER_ARGS} {UNCAPPED_BROWSER_ARGS}"));
            }
            // A hosted page (--url) cannot call the app's commands, so it is not told about them.
            if matches!(config.url, tauri::WebviewUrl::App(_)) {
                let running = if uncapped { "uncapped" } else { "vsync" };
                window = window.initialization_script(&desktop_script(running, saved, forced, fullscreen, overlay_surface));
            }
            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`;
}

function mainRs(crate: string): string {
  return `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ${crate}_lib::run()
}
`;
}

function buildRs(): string {
  return `fn main() {
    tauri_build::build()
}
`;
}

function capabilitiesJson(): string {
  return `${JSON.stringify(
    {
      $schema: "../gen/schemas/desktop-schema.json",
      identifier: "default",
      description: "Default desktop capabilities",
      windows: ["main"],
      permissions: ["core:default"],
    },
    null,
    2,
  )}\n`;
}

function stagingPackageJson(productName: string): string {
  return `${JSON.stringify(
    {
      name: slugFromProductName(productName),
      private: true,
      type: "module",
      scripts: {
        tauri: "tauri",
      },
      devDependencies: {
        "@tauri-apps/cli": "^2",
      },
    },
    null,
    2,
  )}\n`;
}

function writeIconSet(iconsDir: string, source: string | null): void {
  mkdirSync(iconsDir, { recursive: true });
  const files = buildDesktopIcons(source === null ? null : readFileSync(source));
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(iconsDir, name), bytes);
  }
}

/** @internal */
export function writeStaging(plan: DesktopPlan): StageResult {
  const stagingDir = plan.stagingDir;
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  const srcTauri = join(stagingDir, "src-tauri");
  const iconsDir = join(srcTauri, "icons");
  const crate = crateNameFromIdentifier(plan.metadata.identifier);

  mkdirSync(join(srcTauri, "src"), { recursive: true });
  mkdirSync(join(srcTauri, "capabilities"), { recursive: true });
  mkdirSync(join(stagingDir, "dist"), { recursive: true });

  writeFileSync(join(stagingDir, "package.json"), stagingPackageJson(plan.metadata.productName));
  writeFileSync(join(srcTauri, "tauri.conf.json"), tauriConf(plan));
  writeFileSync(join(srcTauri, "Cargo.toml"), cargoToml(crate, plan.metadata.version, plan.diagnostics, plan.steam?.steamworks === true));
  writeFileSync(join(srcTauri, "build.rs"), buildRs());
  writeFileSync(join(srcTauri, "src", "lib.rs"), desktopLibRs());
  writeFileSync(join(srcTauri, "src", "main.rs"), mainRs(crate));
  writeFileSync(join(srcTauri, "capabilities", "default.json"), capabilitiesJson());
  writeIconSet(iconsDir, plan.iconSource);

  if (plan.mode === "url") {
    writeFileSync(
      join(stagingDir, "dist", "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>${escapeHtml(
        plan.metadata.windowTitle,
      )}</title></head><body></body></html>\n`,
    );
  }

  return {
    stagingDir,
    tauriConfPath: join(srcTauri, "tauri.conf.json"),
    metadata: plan.metadata,
    frontendDist: plan.frontendDist,
    mode: plan.mode,
  };
}

/** @internal */
export function commandAvailable(command: string, args: string[] = ["--version"]): boolean {
  const direct = spawnSync(command, args, {
    stdio: "ignore",
    windowsHide: true,
    timeout: 3_000,
  });
  if (direct.status === 0) return true;
  if (process.platform !== "win32") return false;
  const viaShell = spawnSync(command, args, {
    stdio: "ignore",
    shell: true,
    windowsHide: true,
    timeout: 3_000,
  });
  return viaShell.status === 0;
}

/** @internal */
export function checkToolchains(): ToolchainReport {
  const missing: string[] = [];
  if (!commandAvailable("rustc")) {
    missing.push("rustc — install from https://rustup.rs/ then run: rustup default stable");
  }
  if (!commandAvailable("cargo")) {
    missing.push("cargo — ships with rustup (https://rustup.rs/)");
  }
  if (!commandAvailable("npx", ["--version"]) && !commandAvailable("npm", ["--version"])) {
    missing.push("npx/npm — install Node.js from https://nodejs.org/ (needed to run @tauri-apps/cli)");
  }
  return { ok: missing.length === 0, missing };
}

type HttpProbe = { ok: boolean; status: number };

async function probeUrl(url: string, method: "HEAD" | "GET"): Promise<HttpProbe> {
  const response = (await fetch(url, { method, redirect: "follow" })) as unknown as HttpProbe;
  return { ok: response.ok, status: response.status };
}

/** @internal */
export async function assertUrlReachable(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const head = await probeUrl(url, "HEAD");
    if (head.ok || (head.status >= 300 && head.status < 400)) return { ok: true };
    if (head.status === 405 || head.status === 501 || head.status === 403) {
      const get = await probeUrl(url, "GET");
      if (get.ok) return { ok: true };
      return { ok: false, error: `hosted page not reachable (${get.status}): ${url}` };
    }
    const get = await probeUrl(url, "GET");
    if (get.ok) return { ok: true };
    return { ok: false, error: `hosted page not reachable (${head.status}): ${url}` };
  } catch (error) {
    return {
      ok: false,
      error: `hosted page not reachable: ${url} (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

function pickPackageManager(projectDir: string): string {
  if (existsSync(join(projectDir, "bun.lock")) || existsSync(join(projectDir, "bun.lockb"))) {
    if (commandAvailable("bun")) return "bun";
  }
  if (commandAvailable("bun")) return "bun";
  return "npm";
}

/**
 * The command that builds a project's web frontend: its own `build` script when it has one, else
 * `vite build`. A diagnostic build passes `--sourcemap` either way, through the script too, since a
 * diagnostic app without source maps cannot name the code a frame spent its time in.
 * @internal
 */
export function frontendBuildCommand(pm: string, hasBuildScript: boolean, diagnostics: boolean): { command: string; args: string[] } {
  const sourcemap = diagnostics ? ["--sourcemap"] : [];
  if (hasBuildScript) return { command: pm, args: ["run", "build", ...(sourcemap.length > 0 && pm !== "bun" ? ["--"] : []), ...sourcemap] };
  return { command: pm === "bun" ? "bunx" : "npx", args: ["vite", "build", ...sourcemap] };
}

/** @internal */
export function buildFrontend(projectDir: string, diagnostics = false): { ok: true; distDir: string } | { ok: false; error: string } {
  const pkg = readPackageJson(join(projectDir, "package.json"));
  const { command, args } = frontendBuildCommand(pickPackageManager(projectDir), pkg?.scripts?.["build"] !== undefined, diagnostics);
  const status = spawnSync(command, args, {
    cwd: projectDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  }).status;
  if (status !== 0) {
    return { ok: false, error: `frontend build failed in ${projectDir}` };
  }
  const distDir = join(projectDir, "dist");
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    return { ok: false, error: `frontend build produced no dist/ in ${projectDir}` };
  }
  return { ok: true, distDir };
}

/** @internal */
export function copyFrontendDist(distDir: string, stagingDir: string): void {
  const target = join(stagingDir, "dist");
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(distDir, target, { recursive: true });
}

/** @internal */
export function desktopTargetDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env["CARGO_TARGET_DIR"];
  if (explicit !== undefined && explicit.length > 0) return resolve(explicit);
  const base = env["LOCALAPPDATA"] ?? join(homedir(), ".cache");
  return join(base, "jgengine", "desktop-target");
}

/** @internal */
export function artifactFileName(productName: string): string {
  const cleaned = productName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim();
  return cleaned.length > 0 ? cleaned : "game";
}

/** @internal */
export function findNsisArtifact(targetDir: string, metadata: DesktopMetadata): string | null {
  const nsisDir = join(targetDir, "release", "bundle", "nsis");
  if (!existsSync(nsisDir)) return null;
  const prefix = `${metadata.productName}_${metadata.version}_`.toLowerCase();
  const exe = readdirSync(nsisDir).find(
    (name) => name.toLowerCase().startsWith(prefix) && name.toLowerCase().endsWith("-setup.exe"),
  );
  return exe === undefined ? null : join(nsisDir, exe);
}

/** @internal */
export interface DesktopArtifacts {
  app: string;
  /** The NSIS installer, or null for an executable-only build (`--no-installer`, `--steam`). */
  installer: string | null;
}

/** Build the game executable, and its NSIS installer when `installer` is set. @internal */
export function runTauriBuild(
  stagingDir: string,
  metadata: DesktopMetadata,
  installer: boolean,
): { ok: true; artifacts: DesktopArtifacts } | { ok: false; error: string } {
  const targetDir = desktopTargetDir();
  console.log(`  cargo target ${targetDir} (shared; later games reuse the compiled Tauri)`);
  const result = spawnSync("npx", ["--yes", "@tauri-apps/cli@2", "build", ...(installer ? ["--bundles", "nsis"] : ["--no-bundle"])], {
    cwd: stagingDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error:
        "tauri build failed — if the linker is missing on Windows, install Visual Studio Build Tools with the Desktop development with C++ workload",
    };
  }
  const crate = crateNameFromIdentifier(metadata.identifier);
  const builtApp = join(targetDir, "release", `${crate}.exe`);
  if (!existsSync(builtApp)) return { ok: false, error: `game executable not found: ${builtApp}` };
  const app = join(stagingDir, `${artifactFileName(metadata.productName)}.exe`);
  cpSync(builtApp, app);
  if (!installer) return { ok: true, artifacts: { app, installer: null } };
  const builtInstaller = findNsisArtifact(targetDir, metadata);
  if (builtInstaller === null) {
    return { ok: false, error: `NSIS installer not found under ${join(targetDir, "release", "bundle", "nsis")}` };
  }
  const installerCopy = join(stagingDir, builtInstaller.slice(dirname(builtInstaller).length + 1));
  cpSync(builtInstaller, installerCopy);
  return { ok: true, artifacts: { app, installer: installerCopy } };
}

/** @internal */
export async function runDesktopAsync(argv: string[], cwd: string = process.cwd()): Promise<number> {
  const parsed = parseDesktopArgs(argv);
  if ("error" in parsed) {
    if (parsed.error === "help") {
      console.log(DESKTOP_USAGE);
      return 0;
    }
    console.error(`error: ${parsed.error}`);
    console.error(DESKTOP_USAGE);
    return 1;
  }

  const plan = buildPlan(parsed, cwd);
  if ("error" in plan) {
    console.error(`error: ${plan.error}`);
    return 1;
  }

  if (plan.mode === "url" && plan.url !== null && !parsed.dryRun) {
    console.log(`checking hosted page ${plan.url}…`);
    const reachable = await assertUrlReachable(plan.url);
    if (!reachable.ok) {
      console.error(`error: ${reachable.error}`);
      return 1;
    }
  }

  if (!parsed.dryRun) {
    if (process.platform !== "win32") {
      console.error("error: NSIS Windows installers must be built on Windows");
      console.error("  re-run on Windows, or pass --dry-run to stage the Tauri project only");
      return 1;
    }
    const tools = checkToolchains();
    if (!tools.ok) {
      console.error("error: missing toolchains (failing before Rust compile)");
      for (const item of tools.missing) {
        console.error(`  • ${item}`);
      }
      return 1;
    }
  }

  const sourceBefore = plan.diagnostics && plan.projectDir !== null ? desktopBuildSource(plan.projectDir) : null;
  if (plan.mode === "project" && plan.projectDir !== null && !parsed.skipFrontendBuild && !parsed.dryRun) {
    console.log(`building web frontend in ${plan.projectDir}…`);
    const built = buildFrontend(plan.projectDir, plan.diagnostics);
    if (!built.ok) {
      console.error(`error: ${built.error}`);
      return 1;
    }
  }

  if (plan.mode === "project" && plan.projectDir !== null && parsed.skipFrontendBuild) {
    const distDir = join(plan.projectDir, "dist");
    if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
      console.error(`error: --skip-frontend-build requires an existing dist/ in ${plan.projectDir}`);
      return 1;
    }
  }

  if (plan.iconWarning !== null) console.warn(`warning: ${plan.iconWarning}; using the jgengine mark`);
  console.log(`staging Tauri project → ${plan.stagingDir}`);
  const stage = writeStaging(plan);

  if (plan.mode === "project" && plan.projectDir !== null) {
    const distDir = join(plan.projectDir, "dist");
    if (existsSync(distDir) && statSync(distDir).isDirectory()) {
      copyFrontendDist(distDir, plan.stagingDir);
    } else if (!parsed.dryRun) {
      console.error(`error: missing dist/ after frontend build in ${plan.projectDir}`);
      return 1;
    } else {
      writeFileSync(
        join(plan.stagingDir, "dist", "index.html"),
        `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>${escapeHtml(
          plan.metadata.windowTitle,
        )}</title></head><body><p>dry-run placeholder</p></body></html>\n`,
      );
    }
  }

  const maps = plan.mode === "project" ? extractDesktopMaps(join(stage.stagingDir, "dist"), `${stage.stagingDir}.private-maps`) : null;
  if (plan.diagnostics && plan.projectDir !== null && sourceBefore !== null && maps !== null) {
    const sourceAfter = desktopBuildSource(plan.projectDir);
    const stable = sourceBefore.commit !== null && sourceBefore.commit === sourceAfter.commit && sourceBefore.dirty === false && sourceAfter.dirty === false && !parsed.skipFrontendBuild && !parsed.dryRun;
    const changed = sourceBefore.commit !== null && sourceAfter.commit !== null && (sourceBefore.commit !== sourceAfter.commit || (sourceBefore.dirty === false && sourceAfter.dirty === true));
    if (maps.count === 0 && !parsed.dryRun) {
      console.error("error: diagnostic frontend has no JavaScript source maps; configure the project build to emit them");
      return 1;
    }
    const manifest = { sourceBefore, sourceAfter, sourceStatus: stable ? "unchanged-clean" : changed ? "changed" : "unverified", codeSha256: desktopCodeHash(join(stage.stagingDir, "dist")), privateMapsSha256: maps.digest, privateMapCount: maps.count, includes: "staged HTML, JS and CSS; excludes assets and private maps" };
    writeFileSync(join(stage.stagingDir, "dist", "jgengine-build.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`  diagnostics source ${manifest.sourceStatus}; code SHA-256 ${manifest.codeSha256}`);
    console.log(`  private maps ${maps.count} in ${maps.directory}`);
  }

  console.log(`  product  ${stage.metadata.productName}`);
  console.log(`  id       ${stage.metadata.identifier}`);
  console.log(`  version  ${stage.metadata.version}`);
  console.log(`  mode     ${stage.mode}${stage.mode === "url" ? ` (${plan.url})` : " (offline dist)"}`);
  console.log(`  conf     ${stage.tauriConfPath}`);

  if (parsed.dryRun) {
    console.log("\ndry-run: staging ready (skipped toolchain check and Rust/NSIS build)");
    console.log(`  staging ${stage.stagingDir}`);
    return 0;
  }

  console.log(`building the game .exe${plan.installer ? " and NSIS installer" : ""} with Tauri${plan.steam?.steamworks === true ? " and Steamworks" : ""}…`);
  const built = runTauriBuild(plan.stagingDir, plan.metadata, plan.installer);
  if (!built.ok) {
    console.error(`error: ${built.error}`);
    return 1;
  }

  console.log(`\ngame ready (runs without installing):\n  ${built.artifacts.app}`);
  if (built.artifacts.installer !== null) console.log(`installer:\n  ${built.artifacts.installer}`);
  if (plan.steam !== null) return reportSteamDepot(plan, plan.steam, built.artifacts.app);
  return 0;
}

function reportSteamDepot(plan: DesktopPlan, steam: SteamConfig, app: string): number {
  const dll = steam.steamworks ? findSteamApiDll(desktopTargetDir()) : null;
  if (steam.steamworks && dll === null) {
    console.error(`error: steam_api64.dll not found under ${join(desktopTargetDir(), "release", "build")} after a Steamworks build`);
    return 1;
  }
  const source = plan.projectDir === null ? null : desktopBuildSource(plan.projectDir);
  const commit = source === null || source.commit === null ? "" : ` ${source.commit.slice(0, 9)}${source.dirty === true ? "+dirty" : ""}`;
  const depot = writeSteamDepot(plan.stagingDir, app, dll, steam, `${plan.metadata.productName} ${plan.metadata.version}${commit}`);
  console.log(`\nSteam depot (SteamPipe layout):\n  ${depot.root}`);
  console.log(`  content  ${depot.content}${steam.steamworks ? " (with steam_api64.dll)" : ""}`);
  console.log(`  launch   ${artifactFileName(plan.metadata.productName)}.exe (set it as the Windows launch option in Steamworks)`);
  if (depot.appBuild === null) {
    console.log(`  scripts  not written: the Steam app id is missing. Add it to ${join(plan.projectDir ?? ".", "package.json")}:`);
    console.log(`           "jgengine": { "steam": { "appId": <app id>, "depotId": <depot id> } }  (or pass --steam-app <id>)`);
    return 0;
  }
  console.log(`  scripts  ${depot.appBuild} (app ${steam.appId}, depot ${steam.depotId}${steam.branch === null ? "" : `, sets branch ${steam.branch} live`})`);
  console.log(`  upload   ${depot.upload}`);
  return 0;
}

/** @internal */
export function runDesktop(argv: string[]): void {
  void runDesktopAsync(argv)
    .then((code) => {
      process.exit(code);
    })
    .catch((error: unknown) => {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
