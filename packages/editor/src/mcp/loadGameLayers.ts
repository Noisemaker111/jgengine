import {
  createEmptyEditorDocument,
  decodeEditorDocument,
  type EditorDocument,
  type EditorDocumentDiagnostic,
} from "@jgengine/core/editor/index";

/** Result of {@link loadGameLayers}: a validated document, or every diagnostic collected while decoding it. */
export type LoadGameLayersResult =
  | { ok: true; document: EditorDocument }
  | { ok: false; errors: EditorDocumentDiagnostic[] };

/** Imports a game's `editorLayers.ts`, or undefined when the game authors none — a missing module
 * is expected, not an error.
 */
async function importOptionalEditorLayersModule(gameId: string): Promise<{ editorLayers?: unknown } | undefined> {
  try {
    const path = new URL(`../../../../Games/${gameId}/src/editorLayers.ts`, import.meta.url);
    return (await import(path.href)) as { editorLayers?: unknown };
  } catch {
    return undefined;
  }
}

/** Validates an already-resolved `editorLayers` export value (post module-load, post factory-call)
 * against the editor document schema — the exact check {@link loadGameLayers} applies at the
 * untrusted-input boundary between game-authored code and a live editor session.
 */
export function decodeGameLayers(resolved: unknown): LoadGameLayersResult {
  if (resolved === undefined) return { ok: true, document: createEmptyEditorDocument() };
  return decodeEditorDocument(resolved);
}

/** Node-only: resolves a game's `editorLayers` export straight from Games/<id>/src and validates
 * its shape before it reaches a live editor session — the untrusted-input boundary between
 * game-authored code and the engine.
 */
export async function loadGameLayers(gameId: string): Promise<LoadGameLayersResult> {
  const mod = await importOptionalEditorLayersModule(gameId);
  if (mod?.editorLayers === undefined) return { ok: true, document: createEmptyEditorDocument() };

  let resolved: unknown;
  try {
    resolved = typeof mod.editorLayers === "function" ? (mod.editorLayers as () => unknown)() : mod.editorLayers;
  } catch (error) {
    return { ok: false, errors: [{ path: "$", message: error instanceof Error ? error.message : String(error) }] };
  }
  return decodeGameLayers(resolved);
}
