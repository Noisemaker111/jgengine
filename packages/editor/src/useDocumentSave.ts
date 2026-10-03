import { createContext, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { EditorSession } from "@jgengine/core/editor/commands";
import type { EditorDocument } from "@jgengine/core/editor/types";

/** Document save lifecycle owned by the mounted authoring session, across viewport modes. */
export interface EditorDocumentSave {
  available: boolean;
  dirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  lastSavedAt: number | null;
  doSave(): void;
}

/** Save status shared with editor chrome without changing the viewport component identity. @internal */
export const EditorDocumentSaveContext = createContext<EditorDocumentSave | undefined>(undefined);

type SaveFn = (json: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
interface SaveStatus {
  document: EditorDocument;
  state: EditorDocumentSave["saveState"];
  error: string | null;
  at: number | null;
}

/** Keep the acknowledged document and pending/error status alive while editor chrome unmounts. @internal */
export function useDocumentSave(session: EditorSession, save: SaveFn | undefined, onResult?: (ok: boolean, detail: string) => void): EditorDocumentSave {
  const store = useMemo(() => ({ subscribe: (listener: () => void) => session.subscribe(listener), getSnapshot: () => session.getState().document }), [session]);
  const document = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [status, setStatus] = useState<SaveStatus>(() => ({ document, state: "idle", error: null, at: null }));
  const currentJson = useMemo(() => JSON.stringify(document), [document]);
  const savedJson = useMemo(() => JSON.stringify(status.document), [status.document]);
  const pending = useRef(false);
  const result = useRef(onResult);
  result.current = onResult;
  const doSave = useCallback(() => {
    if (save === undefined || pending.current) return;
    const savedDocument = session.getState().document;
    const json = session.exportJson(true);
    pending.current = true;
    setStatus((previous) => ({ ...previous, state: "saving" }));
    void Promise.resolve().then(() => save(json)).then((value) => {
      if (!value.ok) throw new Error(value.error ?? "save failed");
      setStatus({ document: savedDocument, state: "saved", error: null, at: Date.now() });
      result.current?.(true, value.path === undefined ? "Scene saved" : `Scene saved to ${value.path}`);
    }).catch((failure) => {
      const message = failure instanceof Error ? failure.message : String(failure);
      setStatus((previous) => ({ ...previous, state: "error", error: message }));
      result.current?.(false, `Save failed: ${message}`);
    }).finally(() => { pending.current = false; });
  }, [session, save]);
  return { available: save !== undefined, dirty: currentJson !== savedJson, saveState: status.state, saveError: status.error, lastSavedAt: status.at, doSave };
}
