import { spawnSync } from "node:child_process";
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
import { dirname, isAbsolute, join, resolve } from "node:path";

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
}

export interface DesktopPlan {
  mode: DesktopMode;
  projectDir: string | null;
  url: string | null;
  stagingDir: string;
  metadata: DesktopMetadata;
  iconSource: string | null;
  frontendDist: string;
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

const VALUE_FLAGS = new Set(["--url", "--name", "--id", "--version", "--icon", "--out"]);

const DEFAULT_VERSION = "0.1.0";

const DESKTOP_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' ws: wss: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'; frame-ancestors 'none'";

const ALLOWED_REMOTE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "jgengine.com"]);

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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
  --icon <path.png>   window/installer icon (default: public/icon.png or embedded)
  --out <dir>         staging directory (default: <project>/.jgengine/desktop)
  --dry-run           generate staging + config only; skip toolchain + Rust build
  --skip-frontend-build  reuse existing dist/ (local mode; for tests)
  --allow-remote      allow --url to point at a host outside the trusted allowlist
                       (localhost, jgengine.com and its subdomains) — only pass this
                       for a hosted URL you trust; the shipped app loads it live

defaults (deterministic):
  name     package.json name → title case, or URL hostname
  id       com.jgengine.<alphanumeric slug from name>
  version  package.json "version" or ${DEFAULT_VERSION}
  icon     <project>/public/icon.png, else <project>/icon.png, else embedded PNG
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

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("-")) continue;
    if (
      arg === "--dry-run" ||
      arg === "--skip-frontend-build" ||
      arg === "--allow-remote" ||
      arg === "--help" ||
      arg === "-h"
    )
      continue;
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
  const source = readFileSync(configPath, "utf8");
  const match = source.match(/name:\s*["'`]([^"'`]+)["'`]/);
  return match?.[1] ?? null;
}

/** @internal */
export function resolveMetadata(input: {
  mode: DesktopMode;
  projectDir: string | null;
  url: URL | null;
  name?: string;
  id?: string;
  version?: string;
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
  const hasBuild = pkg.scripts?.build !== undefined;
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
  for (const candidate of [join(projectDir, "public", "icon.png"), join(projectDir, "icon.png")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
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
    return {
      mode: "url",
      projectDir: null,
      url: validated.url.toString(),
      stagingDir,
      metadata,
      iconSource,
      frontendDist: validated.url.toString(),
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
  const iconSource = resolveIconSource(projectDir, args.icon);
  if (args.icon !== undefined && iconSource === null) {
    return { error: `icon not found: ${args.icon}` };
  }
  return {
    mode: "project",
    projectDir,
    url: null,
    stagingDir,
    metadata,
    iconSource,
    frontendDist: "../dist",
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
            title: plan.metadata.windowTitle,
            width: 1280,
            height: 800,
            resizable: true,
          },
        ],
        security: {
          csp: DESKTOP_CSP,
        },
      },
      bundle: {
        active: true,
        targets: ["nsis"],
        icon: ["icons/32x32.png", "icons/128x128.png", "icons/icon.png"],
      },
    },
    null,
    2,
  )}\n`;
}

function cargoToml(crate: string, version: string): string {
  return `[package]
name = "${crate}"
version = "${version}"
edition = "2021"

[lib]
name = "${crate}_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`;
}

function libRs(): string {
  return `#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
  const bytes = source !== null ? readFileSync(source) : MINIMAL_PNG;
  for (const name of ["32x32.png", "128x128.png", "icon.png"]) {
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
  writeFileSync(join(srcTauri, "Cargo.toml"), cargoToml(crate, plan.metadata.version));
  writeFileSync(join(srcTauri, "build.rs"), buildRs());
  writeFileSync(join(srcTauri, "src", "lib.rs"), libRs());
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

/** @internal */
export function buildFrontend(projectDir: string): { ok: true; distDir: string } | { ok: false; error: string } {
  const pkg = readPackageJson(join(projectDir, "package.json"));
  const pm = pickPackageManager(projectDir);
  let status: number | null;
  if (pkg?.scripts?.build !== undefined) {
    const result = spawnSync(pm, ["run", "build"], {
      cwd: projectDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    status = result.status;
  } else {
    const result = spawnSync(pm === "bun" ? "bunx" : "npx", ["vite", "build"], {
      cwd: projectDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    status = result.status;
  }
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
export function findNsisArtifact(stagingDir: string): string | null {
  const nsisDir = join(stagingDir, "src-tauri", "target", "release", "bundle", "nsis");
  if (!existsSync(nsisDir)) return null;
  const exes = readdirSync(nsisDir)
    .filter((name) => name.toLowerCase().endsWith(".exe"))
    .map((name) => join(nsisDir, name));
  if (exes.length === 0) return null;
  exes.sort();
  return exes[exes.length - 1]!;
}

/** @internal */
export function runTauriNsisBuild(stagingDir: string): { ok: true; artifact: string } | { ok: false; error: string } {
  const result = spawnSync("npx", ["--yes", "@tauri-apps/cli@2", "build", "--bundles", "nsis"], {
    cwd: stagingDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error:
        "tauri build failed — if the linker is missing on Windows, install Visual Studio Build Tools with the Desktop development with C++ workload",
    };
  }
  const artifact = findNsisArtifact(stagingDir);
  if (artifact === null) {
    return { ok: false, error: `NSIS installer not found under ${join(stagingDir, "src-tauri", "target", "release", "bundle", "nsis")}` };
  }
  return { ok: true, artifact };
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

  if (plan.mode === "project" && plan.projectDir !== null && !parsed.skipFrontendBuild && !parsed.dryRun) {
    console.log(`building web frontend in ${plan.projectDir}…`);
    const built = buildFrontend(plan.projectDir);
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

  console.log("building NSIS installer with Tauri…");
  const built = runTauriNsisBuild(plan.stagingDir);
  if (!built.ok) {
    console.error(`error: ${built.error}`);
    return 1;
  }

  const artifactPath = isAbsolute(built.artifact) ? built.artifact : resolve(built.artifact);
  console.log(`\ninstaller ready:\n  ${artifactPath}`);
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
