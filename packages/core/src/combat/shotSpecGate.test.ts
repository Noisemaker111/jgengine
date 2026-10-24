import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The rule this gate enforces: a shot's behaviour is read from its resolved ShotSpec and nothing
 * else. Combat code never branches on which weapon fired, never classifies a shot with its own
 * function, and never lets a damage or splash field decide how the shot travels.
 */
const RULE = "combat code reads a resolved ShotSpec: no weapon-id branches, no second classifier, no delivery inferred from damage or splash";

const COMBAT_DIR = import.meta.dir;
const SPEC_FILE = "shotSpec.ts";
const FIRING_FILES = ["projectiles.ts", "weaponSystem.ts"];

function combatSources(): { name: string; code: string }[] {
  return readdirSync(COMBAT_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({ name, code: readFileSync(join(COMBAT_DIR, name), "utf8") }));
}

const RULES: { name: string; pattern: RegExp; files?: (name: string) => boolean; allow?: (matched: string) => boolean }[] = [
  {
    name: "a second classifier that decides delivery",
    pattern: /\bisBallistic\b|\bclassifyShot\b|\bisLobbed\b/,
  },
  {
    name: "a weapon or item identity compared in a branch",
    pattern: /(?:weaponId|itemId|weapon\.id|item\.id|definition\.id|via\.item)\s*(?:===|!==|==|!=)\s*([A-Za-z_"'`]+)/,
    allow: (matched) => !/(?:undefined|null|void)$/.test(matched),
  },
  {
    name: "a switch over which weapon fired",
    pattern: /switch\s*\(\s*[^)]*(?:weapon|item)[^)]*\)/i,
  },
  {
    name: "travel or contact stat keys read outside the spec resolver",
    pattern: /["'`](?:projectile|explosion)\.[A-Za-z]+["'`]/,
    files: (name) => name !== SPEC_FILE,
  },
  {
    name: "a damage or splash field deciding how a shot travels",
    pattern: /(?:mode|ballistic|delivery)\s*[:=][^;\n]*(?:splash|falloff|explosion)[^;\n]*/,
    files: (name) => name !== SPEC_FILE,
  },
];

describe("shot spec gate", () => {
  const sources = combatSources();

  test("the gate finds the combat sources it guards", () => {
    expect(sources.map((source) => source.name)).toEqual(expect.arrayContaining([SPEC_FILE, ...FIRING_FILES]));
  });

  test(RULE, () => {
    const violations: string[] = [];
    for (const { name, code } of sources) {
      const lines = code.split("\n");
      for (const rule of RULES) {
        if (rule.files !== undefined && !rule.files(name)) continue;
        lines.forEach((line, index) => {
          if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
          const match = line.match(rule.pattern);
          if (match === null) return;
          if (rule.allow !== undefined && !rule.allow(match[0])) return;
          if (/ballistic:\s*(?:true|false)$/.test(match[0].trim())) return;
          violations.push(`${name}:${index + 1} ${rule.name}: ${line.trim()}`);
        });
      }
    }
    expect(violations).toEqual([]);
  });

  test("the firing paths read the resolved spec", () => {
    for (const name of FIRING_FILES) {
      const code = sources.find((source) => source.name === name)?.code ?? "";
      expect(code).toContain("resolveShotSpec(");
    }
  });
});
