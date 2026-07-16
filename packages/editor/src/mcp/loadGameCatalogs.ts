import type { EditorCatalogDefinition, EditorCatalogsInput } from "@jgengine/core/editor/index";
import type { ParamSchema } from "@jgengine/core/scene/sceneKinds";

/** Result of {@link loadGameCatalogs}: validated definitions, or diagnostics when the export is malformed. */
export type LoadGameCatalogsResult =
  | { ok: true; catalogs: readonly EditorCatalogDefinition[] }
  | { ok: false; errors: { path: string; message: string }[] };

async function importOptionalEditorCatalogsModule(
  gameId: string,
): Promise<{ editorCatalogs?: unknown } | undefined> {
  try {
    const path = new URL(`../../../../Games/${gameId}/src/editorCatalogs.ts`, import.meta.url);
    return (await import(path.href)) as { editorCatalogs?: unknown };
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSchema(value: unknown, path: string, errors: { path: string; message: string }[]): ParamSchema | null {
  if (!isPlainObject(value) || !Array.isArray(value.fields)) {
    errors.push({ path, message: "expected { fields: ParamField[] }" });
    return null;
  }
  return value as unknown as ParamSchema;
}

/**
 * Validates an already-resolved `editorCatalogs` export (post module-load, post factory-call).
 * Missing/undefined yields an empty list — games without catalogs are valid.
 * @internal
 */
export function decodeGameCatalogs(resolved: unknown): LoadGameCatalogsResult {
  if (resolved === undefined || resolved === null) return { ok: true, catalogs: [] };
  if (!Array.isArray(resolved)) {
    return { ok: false, errors: [{ path: "$", message: "editorCatalogs must be an array" }] };
  }
  const errors: { path: string; message: string }[] = [];
  const catalogs: EditorCatalogDefinition[] = [];
  resolved.forEach((item, index) => {
    const path = `$[${index}]`;
    if (!isPlainObject(item)) {
      errors.push({ path, message: "expected an object" });
      return;
    }
    if (typeof item.id !== "string") errors.push({ path: `${path}.id`, message: "expected a string" });
    if (typeof item.label !== "string") errors.push({ path: `${path}.label`, message: "expected a string" });
    const schema = decodeSchema(item.schema, `${path}.schema`, errors);
    if (!Array.isArray(item.entries)) {
      errors.push({ path: `${path}.entries`, message: "expected an array" });
      return;
    }
    if (typeof item.id !== "string" || typeof item.label !== "string" || schema === null) return;
    const entries: EditorCatalogDefinition["entries"] = [];
    item.entries.forEach((entry, entryIndex) => {
      const entryPath = `${path}.entries[${entryIndex}]`;
      if (!isPlainObject(entry) || typeof entry.id !== "string") {
        errors.push({ path: entryPath, message: "expected { id: string, label?, meta? }" });
        return;
      }
      entries.push({
        id: entry.id,
        ...(typeof entry.label === "string" ? { label: entry.label } : {}),
        ...(isPlainObject(entry.meta) ? { meta: entry.meta } : {}),
      });
    });
    catalogs.push({ id: item.id, label: item.label, schema, entries });
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, catalogs };
}

/**
 * Node-only: resolves a game's `editorCatalogs` export from Games/<id>/src and validates its shape
 * before it reaches a live editor session.
 * @internal
 */
export async function loadGameCatalogs(gameId: string): Promise<LoadGameCatalogsResult> {
  const mod = await importOptionalEditorCatalogsModule(gameId);
  if (mod?.editorCatalogs === undefined) return { ok: true, catalogs: [] };

  let resolved: unknown;
  try {
    const value = mod.editorCatalogs as EditorCatalogsInput;
    resolved = typeof value === "function" ? value() : value;
  } catch (error) {
    return { ok: false, errors: [{ path: "$", message: error instanceof Error ? error.message : String(error) }] };
  }
  return decodeGameCatalogs(resolved);
}
