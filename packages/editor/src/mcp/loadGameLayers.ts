import {
  createEmptyEditorDocument,
  decodeEditorDocument,
  type EditorDocument,
  type EditorDocumentDiagnostic,
} from "@jgengine/core/editor/index";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { importOptionalGameModule } from "./importOptionalGameModule";

export type LoadGameLayersResult =
  | { ok: true; document: EditorDocument }
  | { ok: false; errors: EditorDocumentDiagnostic[] };

export function decodeGameLayers(resolved: unknown): LoadGameLayersResult {
  if (resolved === undefined) return { ok: true, document: createEmptyEditorDocument() };
  return decodeEditorDocument(resolved);
}

export async function loadGameLayers(gameId: string): Promise<LoadGameLayersResult> {
  let resolved: unknown;
  try {
    const path = new URL(`../../../../games/${gameId}/src/editorLayers.ts`, import.meta.url);
    const mod = await importOptionalGameModule(path);
    if (mod?.editorLayers === undefined) {
      // A game that reads its scene straight from editor.scene.json (no editorLayers module) still
      // has an authored scene: loading it empty would let `--save` overwrite that scene with nothing.
      const scene = new URL(`../../../../games/${gameId}/src/editor.scene.json`, import.meta.url);
      if (!existsSync(scene)) return { ok: true, document: createEmptyEditorDocument() };
      return decodeGameLayers(JSON.parse(await readFile(scene, "utf8")) as unknown);
    }
    resolved = typeof mod.editorLayers === "function" ? (mod.editorLayers as () => unknown)() : mod.editorLayers;
  } catch (error) {
    return { ok: false, errors: [{ path: "$", message: error instanceof Error ? error.message : String(error) }] };
  }
  return decodeGameLayers(resolved);
}
