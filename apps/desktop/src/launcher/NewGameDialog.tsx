import { useState } from "react";

import { validateNewGameId } from "../project/gameMeta";

export function NewGameDialog(props: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (id: string, name: string) => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const idError = id.length > 0 ? validateNewGameId(id) : "id required";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-950 p-4 shadow-2xl">
        <h2 className="text-sm font-semibold text-white">New Game</h2>
        <p className="mt-1 text-[11px] text-neutral-500">
          Runs <code className="text-neutral-300">jgengine create</code> and scaffolds Games/&lt;id&gt;
        </p>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (idError !== null) return;
            props.onCreate(id, name.trim().length > 0 ? name.trim() : id);
          }}
        >
          <label className="grid gap-1 text-xs text-neutral-400">
            Id (kebab-case)
            <input
              autoFocus
              value={id}
              onChange={(event) => setId(event.target.value.toLowerCase())}
              placeholder="my-game"
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-600"
            />
          </label>
          <label className="grid gap-1 text-xs text-neutral-400">
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My Game"
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-600"
            />
          </label>
          {id.length > 0 && idError !== null && (
            <div className="text-[11px] text-red-400">{idError}</div>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
              onClick={props.onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={props.busy || idError !== null}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white enabled:hover:bg-sky-500 disabled:opacity-40"
            >
              {props.busy ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
