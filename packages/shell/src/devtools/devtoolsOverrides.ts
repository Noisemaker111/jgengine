import { devtools, parseOverridesPayload, type DevtoolsOverrides } from "@jgengine/core/devtools/devtools";

function overridesStorageKey(gameName: string): string {
  return `jg-devtools:${gameName}`;
}

export function readStoredOverrides(gameName: string): DevtoolsOverrides | null {
  try {
    const raw = localStorage.getItem(overridesStorageKey(gameName));
    if (raw === null) return null;
    const parsed = parseOverridesPayload(JSON.parse(raw) as unknown);
    if (parsed.overrides === null) {
      for (const message of parsed.diagnostics) console.warn(`[jgengine:devtools] ${message}`);
      return null;
    }
    for (const message of parsed.diagnostics) console.info(`[jgengine:devtools] ${message}`);
    return parsed.overrides;
  } catch {
    return null;
  }
}

/** @internal */
export function persistDevtoolsOverrides(gameName: string): DevtoolsOverrides {
  const overrides = devtools.overrides.export();
  try {
    localStorage.setItem(overridesStorageKey(gameName), JSON.stringify(overrides));
  } catch {
    return overrides;
  }
  return overrides;
}

/** @internal */
export function applyStoredDevtoolsOverrides(gameName: string): void {
  const stored = readStoredOverrides(gameName);
  if (stored === null) return;
  const result = devtools.overrides.apply(stored);
  if (result.applied === 0 && result.skipped.length === 0) return;
  console.info(
    `[jgengine:devtools] applied ${result.applied} stored override(s) for ${gameName}` +
      (result.skipped.length > 0 ? ` · skipped ${result.skipped.length}` : ""),
  );
  for (const entry of result.skipped) {
    console.warn(`[jgengine:devtools] skipped override ${entry.id}: ${entry.reason}`);
  }
}
