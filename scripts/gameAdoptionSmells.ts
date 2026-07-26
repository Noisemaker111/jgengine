/**
 * Pure detection for the Phase 1.2 adoption ratchet, kept out of `check-game-shape.ts` so tests can
 * import it without executing that script — its module body runs the whole gate and calls
 * `process.exit(1)`, which would abort an unrelated test run whenever the tree is red.
 */

/**
 * The shipped module each flagged widget name shadows. A local component that already imports its
 * owning module is a thin wrapper over the engine building block — a game applying its own tokens
 * and defaults, which is adoption working as intended — not a re-derivation. Keying the smell on the
 * name alone flagged those wrappers (claudecraft's `Bar` delegates to `HealthBar`/`ManaBar` and was
 * still listed as debt) while a plain rename would have silently cleared a genuine offender.
 */
export const WIDGET_OWNERS: Readonly<Record<string, string>> = {
  Bar: "@jgengine/react/bars",
  Window: "@jgengine/react/panels",
  Slot: "@jgengine/react/actionHud",
  Chip: "@jgengine/react/components",
};

/** True when `source` imports anything from exactly `module` (not a longer path sharing its prefix). */
export function importsModule(source: string, module: string): boolean {
  const escaped = module.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
  return new RegExp(`from\\s*["']${escaped}["']`).test(source);
}

/**
 * Mechanical adoption smells the ratchet freezes: module-global `export let` (use
 * `perContext` / `defineStore`) and local Window/Bar/Chip/Slot components that shadow — rather than
 * wrap — the shipped `@jgengine/react` building blocks.
 */
export function adoptionSmellsIn(fileRel: string, source: string): string[] {
  const found: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*export\s+let\s+/.test(line)) found.push(`${fileRel}:export-let`);
    const widget = line.match(/^\s*(?:export\s+)?function\s+(Window|Bar|Chip|Slot)\s*\(/);
    if (widget === null) continue;
    const name = widget[1] as string;
    const owner = WIDGET_OWNERS[name];
    // Delegating to the shipped module is adoption, not debt.
    if (owner !== undefined && importsModule(source, owner)) continue;
    found.push(`${fileRel}:local-widget-${name}`);
  }
  return found;
}
