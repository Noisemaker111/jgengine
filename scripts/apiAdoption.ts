import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

export interface Adoption {
  names: Set<string>;
  namespaceModules: Set<string>;
}

const CONSUMER_GLOBS = [
  "Games/**/*.ts",
  "Games/**/*.tsx",
  "examples/**/*.ts",
  "examples/**/*.tsx",
  "apps/**/*.ts",
  "apps/**/*.tsx",
  // Cross-package adopters (ws/shell/node importing @jgengine/*). Same-package relative
  // imports do not match — pure helpers still need @internal or a skill example.
  "packages/*/src/**/*.ts",
  "packages/*/src/**/*.tsx",
] as const;

const NAMED_IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'](@jgengine\/[^"']+)["']/g;
const NAMESPACE_IMPORT = /import\s+\*\s+as\s+\w+\s+from\s*["'](@jgengine\/[^"']+)["']/g;

function symbolFromClause(raw: string): string | null {
  const trimmed = raw.trim().replace(/^type\s+/, "");
  if (trimmed === "") return null;
  const [source] = trimmed.split(/\s+as\s+/);
  const name = (source ?? "").trim();
  return name === "" ? null : name;
}

function isConsumerSource(file: string): boolean {
  if (file.includes(".test.")) return false;
  const normalized = file.replaceAll("\\", "/");
  if (normalized.includes("/dist/")) return false;
  if (normalized.includes("/node_modules/")) return false;
  return true;
}

export function collectAdoption(root: string): Adoption {
  const names = new Set<string>();
  const namespaceModules = new Set<string>();
  for (const pattern of CONSUMER_GLOBS) {
    for (const file of new Glob(pattern).scanSync({ cwd: root, absolute: true })) {
      if (!isConsumerSource(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(NAMED_IMPORT)) {
        for (const clause of (match[1] ?? "").split(",")) {
          const name = symbolFromClause(clause);
          if (name !== null) names.add(name);
        }
      }
      for (const match of text.matchAll(NAMESPACE_IMPORT)) {
        namespaceModules.add((match[1] ?? "").replace(/\/index$/, ""));
      }
    }
  }
  return { names, namespaceModules };
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

export function collectSkillTokens(root: string, skill: string): Set<string> {
  const dir = join(root, ".claude", "skills", skill);
  const tokens = new Set<string>();
  try {
    for (const file of new Glob("*.md").scanSync({ cwd: dir, absolute: true })) {
      if (file.endsWith("api.md")) continue;
      for (const token of readFileSync(file, "utf8").match(IDENTIFIER) ?? []) tokens.add(token);
    }
  } catch {
    // Missing skill dir (e.g. barrel-only domains) — no tokens.
  }
  return tokens;
}
