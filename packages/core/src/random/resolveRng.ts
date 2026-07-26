import { isProductionEnvironment } from "../devtools/saveEndpoint";

const warned = new Set<string>();

/** Narrow structural view of the ambient console — core never pulls in the DOM lib. */
function consoleWarn(message: string): void {
  const host = globalThis as { console?: { warn?: (text: string) => void } };
  host.console?.warn?.(message);
}

/**
 * Resolves an optional injected `[0,1)` generator, falling back to `Math.random` — and says so, once
 * per call site.
 *
 * Every primitive that rolls dice takes an `rng`, but the default was silent: a caller who forgot to
 * pass `ctx.rng` got a simulation that cannot replay, lockstep, roll back, or be pinned by a test,
 * with nothing on screen or in the log to say why. The fallback stays (a portable helper called
 * outside a game context is a real use), but it is now loud instead of invisible.
 *
 * @capability resolve-rng resolve an optional injected RNG, warning once per site when it falls back to `Math.random`
 */
export function resolveRng(provided: (() => number) | undefined, site: string): () => number {
  if (provided !== undefined) return provided;
  if (!warned.has(site) && !isProductionEnvironment()) {
    warned.add(site);
    consoleWarn(
      `[jgengine:rng] ${site} fell back to Math.random — this run cannot replay, lockstep, roll back, or be pinned by a test. Pass \`ctx.rng\` (the per-world seeded stream), or \`seededRng(seed)\` outside a game context.`,
    );
  }
  return Math.random;
}

/** Clears the warned-site memo. Tests only — the warning is once-per-site for the life of the process. */
export function resetRngFallbackWarnings(): void {
  warned.clear();
}
