import { isProductionEnvironment } from "./saveEndpoint";

const warned = new Set<string>();

/**
 * Logs a dev-mode `console.warn` once per `site`, and never in a production build. Reach for it
 * where a permissive config would otherwise fail silently — a clipped sky dome, an ignored tint.
 * @capability warn-once emit a dev-only warning a single time per call site
 */
export function warnOnce(site: string, message: string): void {
  if (warned.has(site) || isProductionEnvironment()) return;
  warned.add(site);
  const host = globalThis as { console?: { warn?: (text: string) => void } };
  host.console?.warn?.(message);
}

/** Clears the once-per-site record so a test can observe the warning again. @internal */
export function resetWarnOnce(): void {
  warned.clear();
}
