import { useState } from "react";

import type { EditorCollection, EditorSession } from "@jgengine/core/editor/index";

import { shallowArrayEqual, useStoreSelector } from "./useStoreSelector";

const INPUT =
  "rounded-md border border-white/10 bg-black/40 px-2 py-1 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400/60 focus:bg-black/60";
const BTN =
  "rounded-md bg-white/[0.04] px-2 py-1 text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10 hover:text-neutral-100";
const CHIP_BTN =
  "rounded-md px-1.5 py-0.5 text-[10px] ring-1 ring-inset transition-colors";

function newCollectionId(): string {
  return `col_${Date.now().toString(36)}_${Math.floor(Math.random() * 1296).toString(36)}`;
}

/**
 * Named selection sets / production groups: bookmark the current selection, restore it later,
 * add-to / remove-from membership, and toggle a collection's color/lock/visibility. Locking a
 * collection blocks move and delete on its members at the session level (see `isEditorObjectLocked`).
 * @internal — mounted by `EditorChrome` as a left-aside tab.
 */
export function CollectionsPanel({ session }: { session: EditorSession }) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const [name, setName] = useState("");
  const collections = document.collections;

  const createFromSelection = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || selection.length === 0) return;
    session.dispatch({ type: "createCollection", id: newCollectionId(), name: trimmed, memberIds: selection });
    setName("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="flex gap-1">
        <input
          className={`min-w-0 flex-1 ${INPUT}`}
          placeholder="New collection name…"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") createFromSelection();
          }}
        />
        <button type="button" className={BTN} disabled={selection.length === 0 || name.trim().length === 0} onClick={createFromSelection}>
          From selection
        </button>
      </div>
      {selection.length === 0 ? (
        <div className="text-[10px] text-neutral-500">Select objects first, then name and save a set.</div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
        {collections.length === 0 ? (
          <div className="text-neutral-600">No collections yet.</div>
        ) : (
          collections.map((collection) => (
            <CollectionRow key={collection.id} session={session} collection={collection} selection={selection} />
          ))
        )}
      </div>
    </div>
  );
}

function CollectionRow({
  session,
  collection,
  selection,
}: {
  session: EditorSession;
  collection: EditorCollection;
  selection: readonly string[];
}) {
  return (
    <div className="space-y-1 rounded-md bg-white/[0.03] p-1.5 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-white/20"
          style={{ backgroundColor: collection.color ?? "#64748b" }}
        />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-neutral-200 hover:text-cyan-200"
          title="Restore selection"
          onClick={() => session.dispatch({ type: "selectCollection", id: collection.id })}
        >
          {collection.name}
        </button>
        <span className="text-neutral-500">{collection.memberIds.length}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={`${CHIP_BTN} ${collection.locked === true ? "bg-amber-500/20 text-amber-200 ring-amber-400/30" : "bg-black/30 text-neutral-400 ring-white/[0.06] hover:text-neutral-200"}`}
          onClick={() => session.dispatch({ type: "setCollectionFlags", id: collection.id, patch: { locked: collection.locked !== true } })}
        >
          {collection.locked === true ? "🔒 locked" : "🔓 lock"}
        </button>
        <button
          type="button"
          className={`${CHIP_BTN} ${collection.visible === false ? "bg-black/30 text-neutral-500 ring-white/[0.06]" : "bg-cyan-500/15 text-cyan-200 ring-cyan-400/25"}`}
          onClick={() => session.dispatch({ type: "setCollectionFlags", id: collection.id, patch: { visible: collection.visible === false } })}
        >
          {collection.visible === false ? "hidden" : "visible"}
        </button>
        <label className="flex items-center gap-1 rounded-md bg-black/30 px-1.5 py-0.5 ring-1 ring-inset ring-white/[0.06]">
          <input
            type="color"
            className="h-3 w-4 cursor-pointer border-none bg-transparent p-0"
            value={collection.color ?? "#64748b"}
            onChange={(event) => session.dispatch({ type: "setCollectionFlags", id: collection.id, patch: { color: event.target.value } })}
          />
        </label>
        <button
          type="button"
          className={`${CHIP_BTN} bg-black/30 text-neutral-400 ring-white/[0.06] hover:text-neutral-200 disabled:opacity-30`}
          disabled={selection.length === 0}
          onClick={() => session.dispatch({ type: "addToCollection", id: collection.id, ids: selection })}
        >
          + add selected
        </button>
        <button
          type="button"
          className={`${CHIP_BTN} bg-black/30 text-neutral-400 ring-white/[0.06] hover:text-neutral-200 disabled:opacity-30`}
          disabled={selection.length === 0}
          onClick={() => session.dispatch({ type: "removeFromCollection", id: collection.id, ids: selection })}
        >
          − remove selected
        </button>
        <button
          type="button"
          className={`${CHIP_BTN} ml-auto bg-rose-500/15 text-rose-200 ring-rose-400/25 hover:bg-rose-500/25`}
          onClick={() => session.dispatch({ type: "deleteCollection", id: collection.id })}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
