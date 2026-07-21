// API adoption evidence (searched as "api-adoption") — COMPUTED, not a data file.
// There is NO scripts/api-adoption.json: adoption is derived live by scanning consumer
// imports of @jgengine/* exports (collectAdoption below). To clear an orphan for a new
// export, add a real consumer import, tag its @capability, or mark it @internal — never
// edit a JSON. Consumers/owners: generator scripts/gen-skill-api.ts; domain routing
// scripts/skillRouting.ts; persisted shrink-only allowlist scripts/api-orphan-baseline.json
// (enforced by scripts/orphanRatchet.ts).
import { readFileSync } from "node:fs";
import { Glob } from "bun";

export interface Adoption {
  bindings: Set<string>;
}

const CONSUMER_GLOBS = [
  "Games/**/*.ts",
  "Games/**/*.tsx",
  "examples/**/*.ts",
  "examples/**/*.tsx",
  "apps/**/*.ts",
  "apps/**/*.tsx",
  "packages/*/src/**/*.ts",
  "packages/*/src/**/*.tsx",
] as const;

const NAMED_IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'](@jgengine\/[^"']+)["']/g;
const NAMESPACE_IMPORT = /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*["'](@jgengine\/[^"']+)["']/g;

export function adoptionKey(importPath: string, name: string): string {
  return `${importPath.replace(/\/index$/, "")}#${name}`;
}

function symbolFromClause(raw: string): string | null {
  const trimmed = raw.trim().replace(/^type\s+/, "");
  if (trimmed === "") return null;
  const [source] = trimmed.split(/\s+as\s+/);
  const name = (source ?? "").trim();
  return name === "" ? null : name;
}

export function collectSourceAdoption(text: string): Adoption {
  const bindings = new Set<string>();
  for (const match of text.matchAll(NAMED_IMPORT)) {
    const importPath = match[2] ?? "";
    for (const clause of (match[1] ?? "").split(",")) {
      const name = symbolFromClause(clause);
      if (name !== null) bindings.add(adoptionKey(importPath, name));
    }
  }
  for (const match of text.matchAll(NAMESPACE_IMPORT)) {
    const alias = match[1] ?? "";
    const importPath = match[2] ?? "";
    const access = new RegExp(`\\b${alias.replace(/[$]/g, "\\$")}\\.([A-Za-z_$][\\w$]*)`, "g");
    for (const member of text.matchAll(access)) {
      const name = member[1];
      if (name !== undefined) bindings.add(adoptionKey(importPath, name));
    }
  }
  return { bindings };
}

function isConsumerSource(file: string): boolean {
  if (file.includes(".test.")) return false;
  const normalized = file.replaceAll("\\", "/");
  return !normalized.includes("/dist/") && !normalized.includes("/node_modules/");
}

export function collectAdoption(root: string): Adoption {
  const bindings = new Set<string>();
  for (const pattern of CONSUMER_GLOBS) {
    for (const file of new Glob(pattern).scanSync({ cwd: root, absolute: true })) {
      if (!isConsumerSource(file)) continue;
      for (const binding of collectSourceAdoption(readFileSync(file, "utf8")).bindings) bindings.add(binding);
    }
  }
  return { bindings };
}

export function isExportAdopted(
  adoption: Adoption,
  skill: string,
  importPath: string,
  name: string,
): boolean {
  if (adoption.bindings.has(adoptionKey(importPath, name))) return true;
  const packageRoot = importPath.match(/^(@jgengine\/[^/]+)/)?.[1];
  if (packageRoot !== undefined && adoption.bindings.has(adoptionKey(packageRoot, name))) return true;
  const coreBarrel = skill.startsWith("jgengine-") ? `@jgengine/core/${skill.slice("jgengine-".length)}` : undefined;
  return coreBarrel !== undefined && adoption.bindings.has(adoptionKey(coreBarrel, name));
}

export function hasPublicIntentEvidence(
  adoption: Adoption,
  skill: string,
  importPath: string,
  name: string,
  capabilityCount: number,
): boolean {
  return capabilityCount > 0 || isExportAdopted(adoption, skill, importPath, name);
}
