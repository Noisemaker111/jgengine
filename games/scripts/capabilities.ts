/**
 * The adoption ledger: what the engine source in `packages/` publishes, and which of those
 * capabilities each game runs.
 *
 * An engine capability is game-facing when the engine package that declares it also ships a live
 * probe - a devtools probe name or a `window.__jgengine*` readout. `capabilities.json` is generated
 * from the engine source by `bun run gen games-ledger`.
 *
 * Nobody writes what a game adopts: a game adopts a capability by importing it, read from its own
 * source. A capability a game does not import needs no answer either. What a game writes, in the
 * `capabilities` section of its `jgengine.json`, is `debt`: a game-facing capability whose domain
 * the game has while it runs its own version instead, with the open issue that tracks adopting the
 * shared one; and `probes`, the boot probes that prove an adopted system live. The check reads the
 * issue number and the ids; it never judges the prose.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const LEDGER_FILE = "capabilities.json";
export const DECLARATION_FILE = "jgengine.json";

/** A game-facing capability a game has the domain of but has not adopted, and the issue that tracks adopting it. */
export interface DebtAnswer {
  /** What the game does there today, for the reader; no check reads it. */
  reason?: string;
  issue: number;
}

export interface CapabilityProbe {
  kind: "devtools" | "window";
  /** The global to read for a `window` probe, such as `__jgengineAudio`. */
  global?: string;
}

export interface CapabilityEntry {
  /** The `@capability` slug, such as `mission-runtime` or `agents`. */
  id: string;
  packages: string[];
  /** `@jgengine/<pkg>/<module>` that publishes this capability. */
  module: string;
  /** True when the owning package ships a live probe, so a game can prove it live at boot. */
  gameFacing: boolean;
  probe: CapabilityProbe | null;
  intent: string;
}

export interface Ledger {
  generatedBy: string;
  gameFacingRule: string;
  capabilities: CapabilityEntry[];
}

/** The `capabilities` section of a game's `jgengine.json`: only what source cannot say. */
export interface Declaration {
  /** Boot probe names keyed by the module that can prove the system live. */
  probes?: Record<string, string[]>;
  /** Game-facing capabilities this game has the domain of and runs its own version of, keyed by id. */
  debt?: Record<string, DebtAnswer>;
}

export interface GameDeclaration {
  game: string;
  declaration: Declaration | null;
  /** Capability ids the game's source imports. */
  adopts: string[];
}

export interface ModuleInfo {
  specifier: string;
  packageName: string;
  slugs: string[];
  intents: Map<string, string>;
  api: Set<string>;
  probe: CapabilityProbe | null;
}

interface Installed {
  modules: ModuleInfo[];
}

const CAPABILITY = /@capability\s+([A-Za-z][\w.-]*)\s*([^\r\n*]*)/g;
const DECLARED_EXPORT =
  /export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
const WINDOW_GLOBAL = /window\.(__jgengine[A-Za-z0-9_]*)/g;
const DEVTOOLS = /\bdevtoolsName\b/;

/** Engine source files, without tests. */
function engineSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        out.push(path);
      }
    }
  };
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  return out;
}

let installedCache: { root: string; installed: Installed } | null = null;

/** The engine packages beside the games: `<repo>/packages`. */
export function enginePackagesRoot(root: string): string {
  return join(root, "..", "packages");
}

/** Read every engine source module that carries a `@capability` tag. */
export function readInstalled(root: string): Installed {
  if (installedCache !== null && installedCache.root === root) return installedCache.installed;
  const packagesRoot = enginePackagesRoot(root);
  if (!existsSync(packagesRoot)) throw new Error(`no engine packages at ${packagesRoot}`);
  const modules: ModuleInfo[] = [];

  for (const pkg of readdirSync(packagesRoot).sort()) {
    const packageDir = join(packagesRoot, pkg);
    const manifest = join(packageDir, "package.json");
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string };
    if (parsed.name !== `@jgengine/${pkg}`) continue;

    for (const file of engineSourceFiles(join(packageDir, "src"))) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("@capability")) continue;
      const relativePath = relative(packageDir, file)
        .replace(/^src[\\/]/, "")
        .replace(/\.tsx?$/, "")
        .replace(/\\/g, "/");
      const specifier = `@jgengine/${pkg}/${relativePath.replace(/[\\/]index$/, "")}`;
      const tagged = [...source.matchAll(CAPABILITY)].map((match) => ({
        slug: match[1] as string,
        intent: (match[2] ?? "").trim(),
      }));
      if (tagged.length === 0) continue;
      const slugs = [...new Set(tagged.map((entry) => entry.slug))];
      const intents = new Map<string, string>();
      for (const entry of tagged) if (!intents.has(entry.slug)) intents.set(entry.slug, entry.intent);
      const globals = [...source.matchAll(WINDOW_GLOBAL)].map((match) => match[1] as string);
      const probe: CapabilityProbe | null =
        globals.length > 0
          ? { kind: "window", global: [...globals].sort()[0] }
          : DEVTOOLS.test(source)
            ? { kind: "devtools" }
            : null;
      modules.push({
        specifier,
        packageName: `@jgengine/${pkg}`,
        slugs,
        intents,
        api: new Set([...source.matchAll(DECLARED_EXPORT)].map((match) => match[1] as string)),
        probe,
      });
    }
  }

  installedCache = { root, installed: { modules } };
  return installedCache.installed;
}

/** Derive the checked-in inventory from the engine source, not from memory. */
export function deriveLedger(root: string): Ledger {
  const installed = readInstalled(root);
  const bySlug = new Map<
    string,
    { intent: string; packages: Set<string>; module: string; probe: CapabilityProbe | null }
  >();

  for (const module of installed.modules) {
    for (const slug of module.slugs) {
      const existing = bySlug.get(slug);
      const candidate = {
        intent: module.intents.get(slug) ?? "",
        packages: new Set([...(existing?.packages ?? []), module.packageName]),
        module: module.specifier,
        probe: module.probe,
      };
      // A probed module wins; between otherwise equal modules keep the shortest specifier.
      const preferNew =
        existing === undefined ||
        (module.probe !== null && existing.probe === null) ||
        (module.probe === existing.probe &&
          (module.specifier.length < existing.module.length ||
            (module.specifier.length === existing.module.length && module.specifier < existing.module)));
      if (preferNew) {
        bySlug.set(slug, candidate);
      } else {
        existing.packages.add(module.packageName);
      }
    }
  }

  const capabilities: CapabilityEntry[] = [...bySlug.entries()]
    .map(([id, entry]) => ({
      id,
      packages: [...entry.packages].sort(),
      module: entry.module,
      gameFacing: entry.probe !== null,
      probe: entry.probe,
      intent: entry.intent,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    generatedBy: "bun run gen games-ledger",
    gameFacingRule:
      "Game-facing means the engine package ships a live probe with the capability: a devtools probe name or a window.__jgengine* readout. A game adopts a capability by importing it (read from its source). A game that has a game-facing capability's domain but runs its own version records it as debt, with the open issue that tracks adopting the shared one, in its jgengine.json.",
    capabilities,
  };
}

/** Game directories: a package named `@games/*` with a config module. */
export function gameDirs(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const manifestPath = join(root, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: string };
    if (manifest.name?.startsWith("@games/") !== true) continue;
    const hasConfig =
      existsSync(join(root, entry.name, "src", "game.config.ts")) ||
      existsSync(join(root, entry.name, "src", "game.config.tsx"));
    if (hasConfig) out.push(entry.name);
  }
  return out.sort();
}

export function readDeclaration(root: string, game: string): Declaration | null {
  const path = join(root, game, DECLARATION_FILE);
  if (!existsSync(path)) return null;
  const config = JSON.parse(readFileSync(path, "utf8")) as { capabilities?: Declaration };
  return config.capabilities ?? null;
}

export function declarationPath(root: string, game: string): string {
  return join(root, game, DECLARATION_FILE);
}

/** Source files a declaration is seeded from. */
export function sourceFiles(root: string, game: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        out.push(path);
      }
    }
  };
  walk(join(root, game, "src"));
  return out;
}

export interface ImportEvidence {
  specifiers: Set<string>;
  names: Set<string>;
  /** `devtoolsName` values keyed by the module whose API call owns them. */
  probeNames: Map<string, Set<string>>;
}

/** Module specifier -> API names, cached for one checkout. */
export function moduleIndex(root: string): Map<string, ModuleInfo> {
  return new Map(readInstalled(root).modules.map((module) => [module.specifier, module]));
}

/** Read imports and `devtoolsName` probes from one game's source. */
export function collectEvidence(root: string, game: string, ledger: Ledger): ImportEvidence {
  const modules = moduleIndex(root);
  const evidence: ImportEvidence = { specifiers: new Set(), names: new Set(), probeNames: new Map() };
  for (const entry of ledger.capabilities) {
    const set = evidence.probeNames.get(entry.module) ?? new Set<string>();
    evidence.probeNames.set(entry.module, set);
  }

  for (const file of sourceFiles(root, game)) {
    const source = readFileSync(file, "utf8");
    const importedModules = new Set<string>();
    const importedNames = new Set<string>();
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1] as string;
      importedModules.add(specifier);
      evidence.specifiers.add(specifier);
    }
    for (const match of source.matchAll(/\{([^}]*)\}\s*from\s+["'][^"']+["']/g)) {
      for (const part of (match[1] as string).split(",")) {
        const name = part.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0]?.trim();
        if (name !== undefined && name !== "") {
          evidence.names.add(name);
          importedNames.add(name);
        }
      }
    }

    const modulesHere = [...modules.values()].filter(
      (module) =>
        importedModules.has(module.specifier) ||
        [...module.api].some((name) => importedNames.has(name)),
    );

    for (const match of source.matchAll(/devtoolsName\s*:\s*(["'`])(.*?)\1/gs)) {
      const probe = (match[2] as string).replace(/\$\{[^}]*\}/g, "*");
      const before = source.slice(0, match.index ?? 0);
      let owner: ModuleInfo | undefined;
      let lastAt = -1;
      for (const module of modulesHere) {
        for (const name of module.api) {
          const at = before.lastIndexOf(name);
          if (at > lastAt) {
            lastAt = at;
            owner = module;
          }
        }
      }
      if (owner === undefined && modulesHere.length === 1) owner = modulesHere[0];
      if (owner === undefined || owner.probe === null) continue;
      const set = evidence.probeNames.get(owner.specifier) ?? new Set<string>();
      set.add(probe);
      evidence.probeNames.set(owner.specifier, set);
    }
  }
  return evidence;
}

/** API names of the module that owns a capability, for barrel imports. */
export function moduleApiNames(root: string, entry: CapabilityEntry): string[] {
  return [...(moduleIndex(root).get(entry.module)?.api ?? [])];
}

/**
 * The capabilities a game's source adopts. An import of a capability's module (or of one of its API
 * names through a barrel) is adoption whether or not that capability ships a probe: a probe proves a
 * claim, it is not a condition for making one (#2267).
 */
export function adoptedFromEvidence(
  ledger: Ledger,
  evidence: ImportEvidence,
  apiNames: (entry: CapabilityEntry) => string[],
  hasAudioConfig: boolean,
): string[] {
  const adopts: string[] = [];
  for (const entry of ledger.capabilities) {
    const byModule = evidence.specifiers.has(entry.module);
    const byName = apiNames(entry).some((name) => evidence.names.has(name));
    const byConfig = entry.id === "audio-probe" && hasAudioConfig;
    if (byModule || byName || byConfig) adopts.push(entry.id);
  }
  return adopts.sort();
}

/**
 * A game config that mounts the engine's audio: `audio: { ... }`, `audio: sounds`, or the shorthand
 * `audio,` inside `defineGame({ ... })`. Any of them runs the mixer that publishes the audio probe.
 */
const AUDIO_CONFIG = /\baudio\s*:\s*(?:\{|(?!(?:false|null|undefined)\b)[A-Za-z_$])|[{,]\s*audio\s*[,}]/;

/** What one game adopts, read from its source. */
export function gameAdoption(root: string, game: string, ledger: Ledger): string[] {
  const evidence = collectEvidence(root, game, ledger);
  let hasAudioConfig = false;
  for (const file of sourceFiles(root, game)) {
    if (AUDIO_CONFIG.test(readFileSync(file, "utf8"))) hasAudioConfig = true;
  }
  return adoptedFromEvidence(ledger, evidence, (entry) => moduleApiNames(root, entry), hasAudioConfig);
}

/** Every game with its declaration and the adoption its source shows. */
export function readGames(root: string, ledger: Ledger): GameDeclaration[] {
  return gameDirs(root).map((game) => ({
    game,
    declaration: existsSync(declarationPath(root, game)) ? readDeclaration(root, game) : null,
    adopts: gameAdoption(root, game, ledger),
  }));
}

export function renderLedger(ledger: Ledger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

export interface DeclarationProblem {
  game: string;
  capability: string;
  module: string;
  message: string;
}

export interface GameTally {
  game: string;
  /** Every adopted capability. */
  adopted: number;
  /** Adopted and named with a boot probe, so the running page can prove it. */
  verified: number;
  /** Adopted with no probe to name: the capability ships none, or the game has not named its probe. */
  declared: number;
  debt: number;
}

export interface DebtEntry {
  game: string;
  capability: string;
  issue: number;
}

export interface DeclarationReport {
  problems: DeclarationProblem[];
  /** Adopted game-facing capabilities with no boot probe named: the capability ships a probe the game could name. */
  declarationLevel: Array<{ game: string; capability: string; module: string }>;
  adopted: number;
  /** Adopted with a boot probe named for a capability that ships one. */
  verified: number;
  /** Adopted without one: a capability with no probe, or a probe the game has not named. */
  declared: number;
  debt: number;
  tallies: GameTally[];
  debtEntries: DebtEntry[];
}

/**
 * The adoption check. Adoption is read from source, so what is left to check is what a game wrote:
 * each debt entry names a game-facing capability the game does not import and points at an issue
 * by number; each boot probe belongs to a module the game adopts. Every failure is a fact about ids
 * and numbers, never a judgement of the words.
 */
export function checkDeclarations(ledger: Ledger, games: GameDeclaration[]): DeclarationReport {
  const known = new Map(ledger.capabilities.map((entry) => [entry.id, entry]));
  const knownModules = new Set(ledger.capabilities.map((entry) => entry.module));
  const problems: DeclarationProblem[] = [];
  const declarationLevel: DeclarationReport["declarationLevel"] = [];
  const tallies: GameTally[] = [];
  const debtEntries: DebtEntry[] = [];
  let adopted = 0;
  let verified = 0;

  for (const { game, declaration, adopts } of games) {
    const tally: GameTally = { game, adopted: 0, verified: 0, declared: 0, debt: 0 };
    tallies.push(tally);
    const adoptSet = new Set(adopts);
    const probedModules = new Set(Object.keys(declaration?.probes ?? {}));
    const problem = (capability: string, module: string, message: string): void => {
      problems.push({ game, capability, module, message: `${game} ${message}` });
    };

    for (const id of adoptSet) {
      const entry = known.get(id);
      if (entry === undefined) continue;
      adopted += 1;
      tally.adopted += 1;
      if (entry.probe !== null && probedModules.has(entry.module)) {
        verified += 1;
        tally.verified += 1;
      } else {
        tally.declared += 1;
        if (entry.probe !== null) declarationLevel.push({ game, capability: id, module: entry.module });
      }
    }

    for (const [id, debt] of Object.entries(declaration?.debt ?? {})) {
      const entry = known.get(id);
      if (entry === undefined) {
        problem(id, "unknown", `records debt on "${id}", which is not a capability in capabilities.json - remove it or run bun run gen games-ledger`);
        continue;
      }
      const where = `"${id}" (${entry.module})`;
      if (adoptSet.has(id)) {
        problem(id, entry.module, `records debt on ${where} but its source imports it - the debt is paid; remove the entry`);
        continue;
      }
      if (!entry.gameFacing) {
        problem(id, entry.module, `records debt on ${where}, which ships no live probe - debt is kept for game-facing capabilities only; remove the entry`);
        continue;
      }
      tally.debt += 1;
      const issue = debt?.issue;
      if (typeof issue !== "number" || !Number.isSafeInteger(issue) || issue <= 0) {
        problem(id, entry.module, `records debt on ${where} with no issue number - a debt entry names the issue that tracks adopting it`);
      } else {
        debtEntries.push({ game, capability: id, issue });
      }
    }

    for (const module of probedModules) {
      if (!knownModules.has(module)) {
        problem("*", module, `names a boot probe for unknown module "${module}" - remove it or run bun run gen games-ledger`);
      } else if (!ledger.capabilities.some((entry) => entry.module === module && adoptSet.has(entry.id))) {
        problem("*", module, `names a boot probe for "${module}" but its source imports none of that module's capabilities - import it or remove the probe`);
      }
    }
  }

  return {
    problems,
    declarationLevel,
    adopted,
    verified,
    declared: adopted - verified,
    debt: tallies.reduce((sum, tally) => sum + tally.debt, 0),
    tallies,
    debtEntries,
  };
}

/** The per-game table: adopted-verified / adopted-declared / debt, with the debt total last. */
export function renderSummary(report: DeclarationReport, ledger: Ledger): string {
  const gameFacing = ledger.capabilities.filter((entry) => entry.gameFacing).length;
  const name = Math.max(4, ...report.tallies.map((tally) => tally.game.length));
  const row = (label: string, verified: number, declared: number, debt: number): string =>
    [label.padEnd(name), String(verified).padStart(16), String(declared).padStart(16), String(debt).padStart(5)].join("  ");
  const lines = [
    `capability adoption - ${ledger.capabilities.length} capabilities, ${gameFacing} game-facing; adoption is read from each game's imports`,
    `${"game".padEnd(name)}  adopt (verified)  adopt (declared)   debt`,
    ...report.tallies.map((tally) => row(tally.game, tally.verified, tally.declared, tally.debt)),
    row("TOTAL", report.verified, report.declared, report.debt),
    `debt: ${report.debt} entr${report.debt === 1 ? "y" : "ies"} across ${new Set(report.debtEntries.map((entry) => entry.game)).size} game(s), each tracked by an issue`,
  ];
  return lines.join("\n");
}

/** Is the checked-in ledger behind the engine source? */
export function ledgerDrift(committed: Ledger, installed: Ledger): string[] {
  const problems: string[] = [];
  const old = new Map(committed.capabilities.map((entry) => [entry.id, entry]));
  const next = new Map(installed.capabilities.map((entry) => [entry.id, entry]));

  for (const [id, entry] of next) {
    const before = old.get(id);
    if (before === undefined) {
      problems.push(`added "${id}" (${entry.module})`);
      continue;
    }
    if (before.module !== entry.module) problems.push(`"${id}" moved from ${before.module} to ${entry.module}`);
    if (before.gameFacing !== entry.gameFacing) {
      problems.push(
        before.gameFacing
          ? `"${id}" lost its live probe (${describeProbe(before.probe)} -> none)`
          : `"${id}" became game-facing (${describeProbe(entry.probe)})`,
      );
    } else if (describeProbe(before.probe) !== describeProbe(entry.probe)) {
      problems.push(`"${id}" probe changed from ${describeProbe(before.probe)} to ${describeProbe(entry.probe)}`);
    }
  }
  for (const [id, entry] of old) {
    if (!next.has(id)) problems.push(`removed "${id}" (${entry.module})`);
  }
  return problems;
}

function describeProbe(probe: CapabilityProbe | null): string {
  return probe === null ? "none" : probe.kind === "window" ? `window:${probe.global}` : "devtools";
}

/** A probe name with `*` wildcards, matched against the live devtools probe keys. */
export function probeMatches(pattern: string, keys: string[]): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`);
  return keys.some((key) => regex.test(key));
}

/**
 * Why a declared `window.__jgengine*` probe is not proven, or `null` when it reports live counters.
 *
 * A declaration naming a probe is a claim about a running page: the global must exist and answer with
 * at least one finite number, such as the audio master level or a run's banked total. Absent or empty
 * counters fail the claim rather than passing it as "imported".
 */
/** Frames the game draws after the player starts play (its `capture.play`, or mount when it has none) before a readout it has not published counts as absent. */
export const PROBE_SETTLE_FRAMES = 300;
/** The most a boot may take to mount at all, however busy the machine; past it the game never mounted. */
export const PROBE_MOUNT_MS = 300_000;

/**
 * Whether the boot probe stops waiting for a page's readouts. The wait counts frames drawn since the
 * shell mounted the game (`data-jg-phase`), never wall time: a loaded machine draws those frames
 * later, so a late-mounting readout (harbor-heat's audio) is slower to read, never absent. A page
 * that threw an uncaught error before it mounted will not mount, so it stops at once; only a page
 * that neither mounts nor throws is cut off by the clock.
 */
export function probeGivesUp(
  clock: { now: number; startedAt: number; framesSinceMount: number | null; crashedBeforeMount?: boolean },
  limits: { settleFrames: number; mountMs: number } = { settleFrames: PROBE_SETTLE_FRAMES, mountMs: PROBE_MOUNT_MS },
): boolean {
  if (clock.framesSinceMount !== null) return clock.framesSinceMount >= limits.settleFrames;
  if (clock.crashedBeforeMount === true) return true;
  return clock.now - clock.startedAt >= limits.mountMs;
}

export function windowProbeVerdict(global: string, readout: unknown): string | null {
  if (readout === undefined || readout === null) return `window.${global} is absent on the running page`;
  if (typeof readout !== "object") return `window.${global} reports no counters`;
  const fields = readout as Record<string, unknown>;
  if (fields.error !== undefined) return `window.${global} threw ${String(fields.error)}`;
  const counters = Object.entries(fields).filter(([, value]) => typeof value === "number" && Number.isFinite(value));
  if (counters.length === 0) return `window.${global} exists but reports no live counters`;
  return null;
}
