import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Project, SyntaxKind } from "ts-morph";

/**
 * One slider set, no drift. `StreetNetworkRules` is the single dial set the unified street/track
 * generator answers to — a city street net and a closed race circuit are that same generator at
 * opposite slider extremes. Two consumers hand-copy the set: the `city` volume kind builds a
 * `netRules` literal, and the `generate_streets` RPC verb lists overridable keys in `RULE_KEYS`.
 * Both quietly fell behind the interface, and the dials they dropped (road elevation, circuit
 * compactness, organic outline) became unreachable to an editor author.
 *
 * The member list is read from `streetGenerator.ts` source rather than hardcoded, so adding a dial
 * to the interface fails this gate until every consumer carries it.
 */

const GENERATOR = "packages/core/src/world/streetGenerator.ts";
const CITY_KIND = "packages/core/src/world/cityKind.ts";
const STREETS_HANDLER = "packages/editor/src/handlers/streets.ts";

/** The dial the generator derives rather than accepts as a slider — never forwarded by a consumer. */
const EXEMPT = new Set(["seed"]);

const project = new Project({ useInMemoryFileSystem: true });
let parsed = 0;

function parse(source: string) {
  parsed += 1;
  return project.createSourceFile(`parity-${parsed}.ts`, source, { overwrite: true });
}

/** Initializer of a `const` binding at any depth — `netRules` lives inside the resolver function. */
function declaredValue(source: string, name: string) {
  return parse(source)
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((declaration) => declaration.getName() === name)
    ?.getInitializer();
}

/** Members of the `StreetNetworkRules` interface, in declaration order. */
export function streetRuleMembers(source: string): string[] {
  const declaration = parse(source).getInterface("StreetNetworkRules");
  if (declaration === undefined) return [];
  return declaration.getProperties().map((property) => property.getName());
}

/** Keys assigned in the `netRules` object literal the `city` volume kind hands to the generator. */
export function netRulesKeys(source: string): string[] {
  const initializer = declaredValue(source, "netRules");
  if (initializer === undefined || !initializer.isKind(SyntaxKind.ObjectLiteralExpression)) return [];
  return initializer
    .getProperties()
    .map((property) =>
      property.isKind(SyntaxKind.PropertyAssignment) || property.isKind(SyntaxKind.ShorthandPropertyAssignment)
        ? property.getName()
        : "",
    )
    .filter((name) => name !== "");
}

/** Keys listed in the `RULE_KEYS` array the `generate_streets` verb accepts as overrides. */
export function ruleKeyList(source: string): string[] {
  const initializer = declaredValue(source, "RULE_KEYS");
  const array = initializer?.isKind(SyntaxKind.AsExpression)
    ? initializer.getExpression()
    : initializer;
  if (array === undefined || !array.isKind(SyntaxKind.ArrayLiteralExpression)) return [];
  return array
    .getElements()
    .filter((element) => element.isKind(SyntaxKind.StringLiteral))
    .map((element) => element.getLiteralValue());
}

/** One consumer that fell behind the interface, and the dials it never forwards. */
export interface RuleParityGap {
  file: string;
  /** The literal in that file the dial belongs in. */
  site: string;
  missing: string[];
}

export interface RuleParityResult {
  /** Dials every consumer must carry (the interface minus `seed`). */
  dials: string[];
  gaps: RuleParityGap[];
  ok: boolean;
}

/** Compare the generator's dial set against what each consumer forwards. */
export function checkStreetRuleParity(sources: {
  generator: string;
  cityKind: string;
  streetsHandler: string;
}): RuleParityResult {
  const dials = streetRuleMembers(sources.generator).filter((name) => !EXEMPT.has(name));
  const consumers: { file: string; site: string; keys: string[] }[] = [
    { file: CITY_KIND, site: "netRules", keys: netRulesKeys(sources.cityKind) },
    { file: STREETS_HANDLER, site: "RULE_KEYS", keys: ruleKeyList(sources.streetsHandler) },
  ];
  const gaps: RuleParityGap[] = [];
  for (const consumer of consumers) {
    const carried = new Set(consumer.keys);
    const missing = dials.filter((dial) => !carried.has(dial));
    if (missing.length > 0) gaps.push({ file: consumer.file, site: consumer.site, missing });
  }
  // An empty dial set means the interface moved or was renamed — silence there would be worse than
  // a false failure, so report it as a gap against every consumer.
  if (dials.length === 0) {
    gaps.push({ file: GENERATOR, site: "StreetNetworkRules", missing: ["<interface not found>"] });
  }
  return { dials, gaps, ok: gaps.length === 0 };
}

if (import.meta.main) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const read = (rel: string): string => readFileSync(join(root, rel), "utf8");
  const result = checkStreetRuleParity({
    generator: read(GENERATOR),
    cityKind: read(CITY_KIND),
    streetsHandler: read(STREETS_HANDLER),
  });

  if (!result.ok) {
    const total = result.gaps.reduce((sum, gap) => sum + gap.missing.length, 0);
    console.error(`check-street-rule-parity: ${total} StreetNetworkRules dial(s) never reach a consumer\n`);
    for (const gap of result.gaps) {
      console.error(`  ${gap.file} — \`${gap.site}\` drops: ${gap.missing.join(", ")}`);
    }
    console.error(
      `\nEvery member of StreetNetworkRules except \`seed\` is a dial an author must be able to reach.\n` +
        `In ${CITY_KIND}: add a CityRules field, a CITY_DEFAULTS entry that preserves today's output,\n` +
        `a CITY_SCHEMA range, and forward the key in the \`netRules\` literal.\n` +
        `In ${STREETS_HANDLER}: add the key to \`RULE_KEYS\`.\n` +
        `Rerun: bun run check-street-rule-parity`,
    );
    process.exit(1);
  }

  console.log(
    `check-street-rule-parity: ok (${result.dials.length} dials reach both the city volume kind and generate_streets)`,
  );
}
