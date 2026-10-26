/**
 * The adoption ledger: what the installed `@jgengine/*` packages publish, and
 * which of those capabilities each game says it runs.
 *
 * An engine capability is game-facing when the engine package that declares
 * it also ships a live probe - a devtools probe name or a `window.__jgengine*`
 * readout. Those are the systems whose absence can be proven at boot, so they
 * are the ones a game must adopt or decline. Everything else stays in the
 * engine's own inventory and is out of the gate's scope.
 *
 * `capabilities.json` is generated from the engine source in `packages/` by
 * `bun run gen games-ledger`; each game's `capabilities.json` is generated once
 * by `bun run games:capabilities declare` and then owned by that game.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const DECLINE_MIN = 20;
export const LEDGER_FILE = "capabilities.json";
export const DECLARATION_FILE = "capabilities.json";

/**
 * Which of the two real answers a game gave. `not-applicable` means the capability
 * has no counterpart in this game at all; `debt` means the game has the domain and
 * has not adopted the shared system yet, so it must name the issue that tracks it.
 */
export const DECLINE_KINDS = ["not-applicable", "debt"] as const;
export type DeclineKind = (typeof DECLINE_KINDS)[number];

export interface Decline {
  kind: DeclineKind;
  /** Names the capability's domain (or the gap) in this game's own words. */
  reason: string;
  /** Debt only: the open issue in this repo that tracks adoption. */
  issue?: number;
}

/** The domain a capability belongs to; a decline reason must name it. */
export const CAPABILITY_DOMAINS: Record<string, string> = {
  agents: "agent loop",
  "near-agents": "agent loop",
  "utility-brain": "agent loop",
  "perception-service": "perception",
  "nav-crowd": "navigation",
  "nav-runtime": "navigation",
  "navmesh-from-scene": "navigation",
  "rvo-avoidance": "crowd steering",
  traffic: "traffic",
  "police-response": "police heat",
  "police-roads": "police heat",
  "cover-field": "cover",
  "cover-points-from-solids": "cover",
  "cover-points-near": "cover",
  "cover-score": "cover",
  "cover-select": "cover",
  "damage-runtime": "damage table",
  "damage-target-unknown": "damage table",
  "weapon-system": "weapon runtime",
  "status-runtime": "status effects",
  "status-unknown": "status effects",
  "squad-combat": "squad combat",
  "equipment-slot-inventory": "equipment slots",
  "game-save": "save document",
  "game-save-digest": "save document",
  loans: "loans",
  "loan-schedule": "loans",
  "supply-demand-pricing": "market pricing",
  "transaction-ledger": "transaction ledger",
  "loot-generation": "loot rolling",
  "loot-roller": "loot rolling",
  "loot-score": "loot rolling",
  "loot-validation": "loot rolling",
  "loot-comparison": "loot rolling",
  "mission-events": "mission runtime",
  "mission-rewards": "mission runtime",
  "mission-runtime": "mission runtime",
  "mission-validation": "mission runtime",
  "skill-tree": "skill tree",
  "ride-appeal": "ride simulation",
  "ride-choice": "ride simulation",
  "ride-sim": "ride simulation",
  "visitor-population": "park population",
  "wait-queue": "queue",
  "offscreen-world": "offscreen simulation",
  "vehicle-damage": "vehicle damage",
  "audio-probe": "audio mix",
  "mount-game": "game host",
  "turf-war": "turf war",
};

/** A capability whose id is new still needs a domain; its module path supplies one. */
export function domainOf(id: string, module: string): string {
  const known = CAPABILITY_DOMAINS[id];
  if (known !== undefined) return known;
  const parts = module.replace(/^@jgengine\/[^/]+\//, "").split("/");
  return parts.length > 1 && parts[0] !== undefined && parts[0] !== "" ? parts[0] : id;
}

/**
 * Sentences that fit every game at once, so they say nothing. The first two are the
 * template this ledger replaced; a decline has to name its domain instead.
 */
const BANNED_REASONS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /^\s*not adopted\b/i, why: 'the old "Not adopted: this game does not run..." template' },
  { pattern: /does not (?:run|use) the engine\b/i, why: "the engine-boilerplate sentence" },
  { pattern: /\bTODO\b/i, why: "a TODO placeholder" },
  { pattern: /(?:^|[.\s])(?:n\/a|not applicable)\.?$/i, why: "a bare not-applicable label" },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

/** True when the reason names the domain (plural and possessive forms included). */
export function namesDomain(reason: string, domain: string): boolean {
  return new RegExp(`\\b${escapeRegExp(domain)}`, "i").test(reason);
}

export interface IssueState {
  state: "open" | "closed" | "missing";
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
  /** The subsystem a decline has to name, such as `damage table` or `save document`. */
  domain: string;
  /** True when the owning package ships a live probe; only these need a game decision. */
  gameFacing: boolean;
  probe: CapabilityProbe | null;
  intent: string;
}

export interface Ledger {
  generatedBy: string;
  gameFacingRule: string;
  capabilities: CapabilityEntry[];
}

export interface Declaration {
  adopts: string[];
  /** Boot probe names keyed by the module that can prove the system live. */
  probes?: Record<string, string[]>;
  declines: Record<string, Decline>;
}

export interface GameDeclaration {
  game: string;
  declaration: Declaration | null;
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
      domain: domainOf(id, entry.module),
      gameFacing: entry.probe !== null,
      probe: entry.probe,
      intent: entry.intent,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    generatedBy: "bun run gen games-ledger",
    gameFacingRule:
      "Game-facing means the engine package ships a live probe with the capability: a devtools probe name or a window.__jgengine* readout. Every game declares each one: adopt it, or decline it as not-applicable (its domain does not exist here) or debt (this game has the domain and has not adopted the shared system, so an open issue tracks it).",
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
  return JSON.parse(readFileSync(path, "utf8")) as Declaration;
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
 * The declaration a game's own source supports.
 *
 * An import of a capability's module is adoption whether or not that capability ships a probe: a
 * probe proves a claim, it is not a condition for making one (#2267). A capability the game does
 * not import and the engine cannot probe needs no answer at all, so this leaves it out.
 */
export function seedFromEvidence(
  ledger: Ledger,
  evidence: ImportEvidence,
  apiNames: (entry: CapabilityEntry) => string[],
  hasAudioConfig: boolean,
): Declaration {
  const adopts: string[] = [];
  const probeModules = new Map<string, Set<string>>();
  const declines: Record<string, Decline> = {};

  for (const entry of ledger.capabilities) {
    const byModule = evidence.specifiers.has(entry.module);
    const byName = apiNames(entry).some((name) => evidence.names.has(name));
    const byConfig = entry.id === "audio-probe" && hasAudioConfig;
    if (byModule || byName || byConfig) {
      adopts.push(entry.id);
      const found = evidence.probeNames.get(entry.module) ?? new Set<string>();
      if (byConfig && entry.probe?.kind === "window" && entry.probe.global !== undefined) {
        found.add(`window:${entry.probe.global}`);
      }
      if (found.size > 0) probeModules.set(entry.module, found);
      continue;
    }
    if (!entry.gameFacing) continue;
    // A placeholder that fails the gate: only the game's owner knows whether this
    // game has no such domain or has not adopted it yet.
    declines[entry.id] = {
      kind: "not-applicable",
      reason: `TODO: say why this game needs no ${entry.domain}, or record it as debt with its issue.`,
    };
  }

  return {
    adopts: adopts.sort(),
    probes: Object.fromEntries([...probeModules].map(([module, names]) => [module, [...names].sort()])),
    declines,
  };
}

/** Seed a declaration from source evidence; every decline starts unclassified. */
export function seedDeclaration(root: string, game: string, ledger: Ledger): Declaration {
  const evidence = collectEvidence(root, game, ledger);
  let hasAudioConfig = false;
  for (const file of sourceFiles(root, game)) {
    if (/audio\s*:\s*\{/.test(readFileSync(file, "utf8"))) hasAudioConfig = true;
  }
  return seedFromEvidence(ledger, evidence, (entry) => moduleApiNames(root, entry), hasAudioConfig);
}

export function renderDeclaration(declaration: Declaration): string {
  const ordered: Declaration = {
    adopts: [...declaration.adopts].sort(),
    ...(declaration.probes === undefined
      ? {}
      : {
          probes: Object.fromEntries(
            Object.entries(declaration.probes)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([module, probes]) => [module, [...probes].sort()]),
          ),
        }),
    declines: Object.fromEntries(Object.entries(declaration.declines).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
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
  notApplicable: number;
  debt: number;
}

export interface DebtEntry {
  game: string;
  capability: string;
  issue: number;
}

export interface DeclarationReport {
  problems: DeclarationProblem[];
  /** Adopted capabilities with no boot probe named: a real adoption the gate cannot verify by reading a page. */
  declarationLevel: Array<{ game: string; capability: string; module: string }>;
  adopted: number;
  /** Adopted with a boot probe named for a capability that ships one. */
  verified: number;
  /** Adopted without one: a capability with no probe, or a probe the game has not named. */
  declared: number;
  notApplicable: number;
  debt: number;
  tallies: GameTally[];
  debtEntries: DebtEntry[];
}

/**
 * The adoption gate: every game-facing capability is adopted, or declined as
 * `not-applicable` (the domain is absent here) or `debt` (the game has the domain
 * and has not adopted the shared system, with an open issue that tracks adoption).
 *
 * `issues` maps the debt issue numbers to their state in this repo; pass it to
 * enforce ownership. Without it the entries are only checked for the number.
 */
export function checkDeclarations(
  ledger: Ledger,
  games: GameDeclaration[],
  issues?: Map<number, IssueState>,
): DeclarationReport {
  // Any capability in the ledger can be adopted: a probe is how a claim is verified, not a
  // precondition for making it. Only game-facing capabilities are required from every game.
  const known = new Map(ledger.capabilities.map((entry) => [entry.id, entry]));
  const required = ledger.capabilities.filter((entry) => entry.gameFacing);
  const problems: DeclarationProblem[] = [];
  const declarationLevel: DeclarationReport["declarationLevel"] = [];
  const tallies: GameTally[] = [];
  const debtEntries: DebtEntry[] = [];
  const reasons = new Map<string, Array<{ game: string; capability: string; module: string }>>();
  let adopted = 0;
  let verified = 0;

  for (const { game, declaration } of games) {
    const tally: GameTally = { game, adopted: 0, verified: 0, declared: 0, notApplicable: 0, debt: 0 };
    tallies.push(tally);
    if (declaration === null) {
      problems.push({
        game,
        capability: "*",
        module: "*",
        message: `${game}/capabilities.json is missing - run bun run games:capabilities declare ${game}`,
      });
      continue;
    }
    const adoptSet = new Set(declaration.adopts);
    const declineSet = new Set(Object.keys(declaration.declines));
    const probedModules = new Set(Object.keys(declaration.probes ?? {}));

    for (const id of adoptSet) {
      const entry = known.get(id);
      if (entry === undefined) {
        problems.push({
          game,
          capability: id,
          module: "unknown",
          message: `${game} adopts "${id}", which is not a capability in capabilities.json - remove it or run bun run gen games-ledger`,
        });
        continue;
      }
      if (declineSet.has(id)) {
        problems.push({
          game,
          capability: id,
          module: entry.module,
          message: `${game} both adopts and declines "${id}" (${entry.module}) - keep exactly one`,
        });
      }
      adopted += 1;
      tally.adopted += 1;
      const proved = entry.probe !== null && probedModules.has(entry.module);
      if (proved) {
        verified += 1;
        tally.verified += 1;
      } else {
        tally.declared += 1;
        declarationLevel.push({ game, capability: id, module: entry.module });
      }
    }

    for (const [id, decline] of Object.entries(declaration.declines)) {
      const entry = known.get(id);
      if (entry === undefined) {
        problems.push({
          game,
          capability: id,
          module: "unknown",
          message: `${game} declines "${id}", which is not a capability in capabilities.json - remove it or run bun run gen games-ledger`,
        });
        continue;
      }
      if (adoptSet.has(id)) continue;

      if (typeof decline !== "object" || decline === null || typeof decline.reason !== "string") {
        problems.push({
          game,
          capability: id,
          module: entry.module,
          message: `${game} declines "${id}" (${entry.module}) with a bare string - every decline is {"kind": "not-applicable" | "debt", "reason": "..."} so "we do not need it" and "we have not got to it" stay apart`,
        });
        continue;
      }

      const reason = decline.reason.trim();
      if (!DECLINE_KINDS.includes(decline.kind)) {
        problems.push({
          game,
          capability: id,
          module: entry.module,
          message: `${game} declines "${id}" (${entry.module}) as kind "${String(decline.kind)}" - say "not-applicable" (this game has no ${entry.domain}) or "debt" (it has the ${entry.domain} and has not adopted the shared system)`,
        });
      }
      if (reason.length < DECLINE_MIN) {
        problems.push({
          game,
          capability: id,
          module: entry.module,
          message: `${game} declines "${id}" (${entry.module}) with a ${reason.length}-character reason; write ${DECLINE_MIN}+ characters that name the ${entry.domain} or the gap`,
        });
      } else {
        const banned = BANNED_REASONS.find((item) => item.pattern.test(reason));
        if (banned !== undefined) {
          problems.push({
            game,
            capability: id,
            module: entry.module,
            message: `${game} declines "${id}" (${entry.module}) with ${banned.why} - say what this game does in the ${entry.domain} domain instead`,
          });
        } else if (!namesDomain(reason, entry.domain)) {
          problems.push({
            game,
            capability: id,
            module: entry.module,
            message: `${game} declines "${id}" (${entry.module}) without naming the ${entry.domain} domain - write what this game has (or lacks) there, in words that include "${entry.domain}"`,
          });
        }
      }

      if (decline.kind === "debt") {
        tally.debt += 1;
        const issue = decline.issue;
        if (typeof issue !== "number" || !Number.isSafeInteger(issue) || issue <= 0) {
          problems.push({
            game,
            capability: id,
            module: entry.module,
            message: `${game} records debt on "${id}" (${entry.module}) with no owner - a debt entry needs the number of the open issue that tracks adopting it`,
          });
        } else {
          debtEntries.push({ game, capability: id, issue });
          if (issues !== undefined) {
            const state = issues.get(issue);
            if (state === undefined) {
              problems.push({
                game,
                capability: id,
                module: entry.module,
                message: `${game} records debt on "${id}" (${entry.module}) against issue #${issue}, which this run did not find in the repo - it may have been transferred or deleted`,
              });
            } else if (state.state === "missing") {
              problems.push({
                game,
                capability: id,
                module: entry.module,
                message: `${game} records debt on "${id}" (${entry.module}) against issue #${issue}, which this repo does not have - point it at the issue that tracks the ${entry.domain} work`,
              });
            } else if (state.state === "closed") {
              problems.push({
                game,
                capability: id,
                module: entry.module,
                message: `${game} records debt on "${id}" (${entry.module}) against issue #${issue}, which is closed - adopt it, or replace the debt with not-applicable naming the ${entry.domain}`,
              });
            }
          }
        }
      } else if (decline.kind === "not-applicable") {
        tally.notApplicable += 1;
        if (decline.issue !== undefined) {
          problems.push({
            game,
            capability: id,
            module: entry.module,
            message: `${game} declines "${id}" (${entry.module}) as not-applicable but names issue #${String(decline.issue)} - a missing ${entry.domain} needs no owner; record it as debt if the game has the domain`,
          });
        }
      }

      const key = reason.toLowerCase().replace(/\s+/g, " ");
      if (key !== "") {
        const seen = reasons.get(key) ?? [];
        seen.push({ game, capability: id, module: entry.module });
        reasons.set(key, seen);
      }
    }

    for (const entry of required) {
      if (adoptSet.has(entry.id) || declineSet.has(entry.id)) continue;
      problems.push({
        game,
        capability: entry.id,
        module: entry.module,
        message: `${game} does not declare game-facing capability "${entry.id}" (${entry.module}) - adopt it, or decline it as not-applicable or debt with a ${DECLINE_MIN}+ character reason`,
      });
    }

    const knownModules = new Set(ledger.capabilities.map((entry) => entry.module));
    for (const module of probedModules) {
      if (!knownModules.has(module)) {
        problems.push({
          game,
          capability: "*",
          module,
          message: `${game} names a boot probe for unknown module "${module}" - remove it or run bun run gen games-ledger`,
        });
        continue;
      }
      const adoptedHere = ledger.capabilities.some((entry) => entry.module === module && adoptSet.has(entry.id));
      if (!adoptedHere) {
        problems.push({
          game,
          capability: "*",
          module,
          message: `${game} names a boot probe for "${module}" but adopts none of its capabilities - adopt one or remove the probe`,
        });
      }
    }
  }

  for (const [reason, entries] of reasons) {
    const shared = [...new Set(entries.map((entry) => entry.game))];
    if (shared.length < 2) continue;
    for (const entry of entries) {
      problems.push({
        game: entry.game,
        capability: entry.capability,
        module: entry.module,
        message: `${entry.game} gives the same decline reason as ${shared.filter((name) => name !== entry.game).join(", ")} for "${entry.capability}" ("${reason.slice(0, 60)}...") - a reason shared between games is a template; say what happens in this game`,
      });
    }
  }

  return {
    problems,
    declarationLevel,
    adopted,
    verified,
    declared: adopted - verified,
    notApplicable: tallies.reduce((sum, tally) => sum + tally.notApplicable, 0),
    debt: tallies.reduce((sum, tally) => sum + tally.debt, 0),
    tallies,
    debtEntries,
  };
}

/** The per-game table: adopted-verified / adopted-declared / not-applicable / debt, with the debt total last. */
export function renderSummary(report: DeclarationReport, ledger: Ledger): string {
  const gameFacing = ledger.capabilities.filter((entry) => entry.gameFacing).length;
  const name = Math.max(4, ...report.tallies.map((tally) => tally.game.length));
  const row = (label: string, verified: number, declared: number, notApplicable: number, debt: number): string =>
    [
      label.padEnd(name),
      String(verified).padStart(15),
      String(declared).padStart(16),
      String(notApplicable).padStart(15),
      String(debt).padStart(5),
    ].join("  ");
  const lines = [
    `capability adoption - ${gameFacing} game-facing capabilities`,
    `${"game".padEnd(name)}  adopt (verified)  adopt (declared)            n/a   debt`,
    ...report.tallies.map((tally) =>
      row(tally.game, tally.verified, tally.declared, tally.notApplicable, tally.debt),
    ),
    row("TOTAL", report.verified, report.declared, report.notApplicable, report.debt),
    `debt is the number that has to come down: ${report.debt} entr${report.debt === 1 ? "y" : "ies"} across ${new Set(report.debtEntries.map((entry) => entry.game)).size} game(s)`,
  ];
  return lines.join("\n");
}

/** Is the checked-in ledger behind the installed packages? */
export function ledgerDrift(committed: Ledger, installed: Ledger): string[] {
  const problems: string[] = [];
  const old = new Map(committed.capabilities.map((entry) => [entry.id, entry]));
  const next = new Map(installed.capabilities.map((entry) => [entry.id, entry]));

  for (const [id, entry] of next) {
    const before = old.get(id);
    if (before === undefined) {
      problems.push(`added "${id}" (${entry.module}) - no game declares it yet`);
      continue;
    }
    if (before.module !== entry.module) problems.push(`"${id}" moved from ${before.module} to ${entry.module}`);
    if (before.gameFacing !== entry.gameFacing) {
      problems.push(
        before.gameFacing
          ? `"${id}" lost its live probe (${describeProbe(before.probe)} -> none)`
          : `"${id}" became game-facing (${describeProbe(entry.probe)}) - every game must declare it`,
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
/** Frames the game draws after it mounts before a readout it has not published counts as absent. */
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
