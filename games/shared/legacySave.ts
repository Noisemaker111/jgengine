/** Translate historical persisted identifiers without mutating the saved source record. */
export function migrateLegacySnapshot<T>(snapshot: T, ids: Readonly<Record<string, string>>): T {
  const rename = (value: string): string => ids[value] ?? value;
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") return rename(value);
    if (Array.isArray(value)) return value.map(visit);
    if (value !== null && typeof value === "object") {
      // Explicit modern keys win when a transitional save contains both spellings.
      const entries = Object.entries(value).sort(([a], [b]) => Number(a === rename(a)) - Number(b === rename(b)));
      return Object.fromEntries(entries.map(([key, item]) => [rename(key), visit(item)]));
    }
    return value;
  };
  return visit(snapshot) as T;
}

interface SaveController {
  hasSave(): Promise<boolean>;
  load(): Promise<boolean>;
  save(): Promise<void>;
  slot(): string;
}

interface SaveStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
}

/** Import through the current whole-world save controller, including private save-only modules. */
export async function loadLegacySave(
  current: SaveController | undefined,
  backend: SaveStorage,
  legacyKey: string,
  currentKey: string,
  ids: Readonly<Record<string, string>>,
): Promise<boolean> {
  if (current === undefined) return false;
  if (await current.hasSave()) return current.load();
  const raw = await backend.read(`${legacyKey}:${current.slot()}`);
  if (raw === null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const envelope = parsed as Record<string, unknown>;
  const snapshot = "value" in envelope ? envelope.value : parsed;
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  // Module keys (e.g. motion) are public engine protocols; translate only their payloads.
  const translated = Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, migrateLegacySnapshot(value, ids)]));
  if (Object.keys(translated).length === 0) return false;
  const migrated = "value" in envelope ? { ...envelope, value: translated } : translated;
  await backend.write(`${currentKey}:${current.slot()}`, JSON.stringify(migrated));
  if (!(await current.load())) return false;
  await current.save();
  return true;
}
