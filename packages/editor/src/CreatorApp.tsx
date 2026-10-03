import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importCreatorDocument, validateCreatorDocument, type CreatorDocument, type CreatorConfig as CoreCreatorConfig } from "@jgengine/core/editor/creatorStorage";
import type { EditorDocument } from "@jgengine/core/editor/types";
import type { PlayableGame } from "@jgengine/shell/registry";
import { EditorApp, type EditorSaveFn } from "./EditorApp";

/** Game-owned creator policy, durable storage and document-to-runtime composition. */
export type CreatorConfig = CoreCreatorConfig<PlayableGame>;

/** Production creator catalog and embedded editor, reached through the game's menu.
 * @capability player-creator create, edit, save, playtest and reopen bounded player scenes through the production editor
 */
export function CreatorApp({ gameId, config, onExit }: { gameId: string; config: CreatorConfig; onExit: () => void }) {
  const [documents, setDocuments] = useState<readonly Omit<CreatorDocument, "document">[]>([]);
  const [selected, setSelected] = useState<CreatorDocument | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef<number | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const values = await config.storage.list();
      if (values.length > config.policy.maxDocuments) throw new Error("Creator catalog exceeds document budget");
      setDocuments(values);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }, [config]);
  useEffect(() => { void refresh(); return () => { generation.current += 1; }; }, [refresh]);
  const validate = useCallback((document: EditorDocument) => { validateCreatorDocument(document, config.policy); }, [config]);
  const playable = useMemo(() => selected === null ? null : config.createPlayable(selected.document), [selected, config]);
  const save = useCallback<EditorSaveFn>(async (json) => {
    if (selected === null || pending.current) return { ok: false, error: "A save is already in progress" };
    pending.current = true;
    const currentGeneration = generation.current;
    try {
      const document = importCreatorDocument(json, config.policy);
      const next = await config.storage.save({ ...selected, document }, revision.current);
      if (generation.current === currentGeneration) {
        revision.current = next.revision;
        setError(null);
      }
      return { ok: true, path: next.name };
    } catch (failure) {
      return { ok: false, error: failure instanceof Error ? failure.message : String(failure) };
    } finally { pending.current = false; }
  }, [selected, config]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };
  const create = () => run(async () => {
    if (documents.length >= config.policy.maxDocuments) throw new Error("Creator catalog is full");
    const document = validateCreatorDocument(config.initialDocument(), config.policy);
    const value = await config.storage.save({ version: 1, id: config.createId?.() ?? crypto.randomUUID(), name: name.trim(), revision: 0, document }, null);
    revision.current = value.revision;
    setSelected(value);
  });
  const importFile = (file: File) => run(async () => {
    if (documents.length >= config.policy.maxDocuments) throw new Error("Creator catalog is full");
    if (file.size > config.policy.maxBytes) throw new Error("Scene exceeds byte budget");
    const document = importCreatorDocument(await file.text(), config.policy);
    const value = await config.storage.save({ version: 1, id: config.createId?.() ?? crypto.randomUUID(), name: name.trim(), revision: 0, document }, null);
    revision.current = value.revision;
    setSelected(value);
  });
  const reopen = (id: string) => run(async () => {
    const value = await config.storage.load(id);
    if (value === null) throw new Error("Scene no longer exists");
    validate(value.document);
    revision.current = value.revision;
    setSelected(value);
  });
  const returnToCatalog = () => {
    generation.current += 1;
    setSelected(null);
    void refresh();
  };
  if (selected !== null && playable !== null) {
    return <EditorApp
      gameId={`${gameId}:${selected.id}`} playable={playable} layers={selected.document}
      catalogs={playable.editorCatalogs} save={save} createPlaytest={config.createPlayable}
      validateDocument={validate} playerCreator allowedAssets={config.policy.allowedAssets}
      allowedKinds={config.policy.allowedKinds} maxImportBytes={config.policy.maxBytes}
      creatorPolicy={config.policy} onExitEditor={returnToCatalog}
    />;
  }
  return (
    <section aria-label="Scene creator" style={{ padding: 24, color: "#eef2ff", background: "#111827", minHeight: "100%", fontFamily: "sans-serif" }}>
      <h1>Create and edit</h1>
      <button type="button" onClick={onExit}>Return to game</button>
      <form onSubmit={(event) => { event.preventDefault(); void create(); }} style={{ marginBlock: 24 }}>
        <label>Scene name <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>{" "}
        <button type="submit" disabled={busy || name.trim().length === 0 || documents.length >= config.policy.maxDocuments}>Create scene</button>
      </form>
      <label>Import scene JSON <input type="file" accept="application/json,.json" aria-label="Import scene JSON" disabled={busy || name.trim().length === 0 || documents.length >= config.policy.maxDocuments} onChange={(event) => {
        const file = event.target.files?.[0];
        if (file !== undefined) void importFile(file);
        event.target.value = "";
      }} /></label>
      <p>{documents.length} / {config.policy.maxDocuments} saved scenes</p>
      {error === null ? null : <p role="alert">{error}</p>}
      <ul>{documents.map((value) => <li key={value.id}>{value.name}{" "}<button type="button" disabled={busy} onClick={() => void reopen(value.id)}>Edit {value.name}</button></li>)}</ul>
    </section>
  );
}
