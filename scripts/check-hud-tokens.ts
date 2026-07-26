/**
 * #1573: one `--jg-*` vocabulary. Every theme token a shipped component reads must be emitted by
 * `hudThemeVars`, so authoring a `HudTheme` skins the `packages/react` primitives and the
 * `registry/jgengine` blocks together instead of half of each.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { defaultHudTheme, hudThemeVars } from "../packages/react/src/hudTheme";

/** Tokens that are deliberately not theme values. */
const NON_THEME = [
  // layout metrics the shell measures at runtime
  "--jg-hud-pad-",
  "--jg-hud-dock-clearance",
  "--jg-visual-viewport-",
  // component-scoped opt-in tokens; each read carries a theme-token fallback
  "--jg-card-",
  "--jg-font-card",
];

const ROOTS = ["packages/react/src", "registry/jgengine"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

const emitted = new Set(Object.keys(hudThemeVars(defaultHudTheme)));
const failures: string[] = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      for (const match of line.matchAll(/var\((--jg-[a-z0-9-]+)/g)) {
        const token = match[1]!;
        // `var(--jg-rarity-${tier})` — the name is completed by a template expression, so the
        // literal prefix is what we can check.
        const interpolated = line[match.index + match[0].length] === "$";
        if (interpolated ? [...emitted].some((name) => name.startsWith(token)) : emitted.has(token)) continue;
        if (NON_THEME.some((prefix) => token.startsWith(prefix))) continue;
        failures.push(`${file}:${index + 1} reads ${token}, which no theme emits`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("check-hud-tokens: unthemed --jg-* tokens\n");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    `\nAdd the token to HudTheme + hudThemeVars (packages/react/src/hudTheme.ts), or list it in NON_THEME` +
      ` with a theme-token fallback at the read site.\nFix: bun scripts/check-hud-tokens.ts`,
  );
  process.exit(1);
}

console.log(`check-hud-tokens: ok (${emitted.size} theme tokens)`);
