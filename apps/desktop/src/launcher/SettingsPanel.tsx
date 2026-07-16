import { useState } from "react";

import type { GameListEntry } from "../project/client";

export function SettingsPanel(props: {
  game: GameListEntry;
  busy: boolean;
  onSave: (input: {
    displayName: string;
    capturePlay: string[];
    creditText: string;
    creditUrl: string;
    creditHandle: string;
  }) => void;
}) {
  const [displayName, setDisplayName] = useState(props.game.displayName);
  const [capturePlay, setCapturePlay] = useState(props.game.capture.play.join(", "));
  const [creditText, setCreditText] = useState(props.game.credit?.text ?? "");
  const [creditUrl, setCreditUrl] = useState(props.game.credit?.url ?? "");
  const [creditHandle, setCreditHandle] = useState(props.game.credit?.handle ?? "");

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">Settings</h2>
        <span className="text-[11px] text-neutral-500">edits game.config.ts in place</span>
      </div>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave({
            displayName,
            capturePlay: capturePlay
              .split(",")
              .map((part) => part.trim())
              .filter((part) => part.length > 0),
            creditText,
            creditUrl,
            creditHandle,
          });
        }}
      >
        <label className="grid gap-1 text-xs text-neutral-400">
          Display name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-600"
          />
        </label>
        <label className="grid gap-1 text-xs text-neutral-400">
          Capture play commands (comma-separated)
          <input
            value={capturePlay}
            onChange={(event) => setCapturePlay(event.target.value)}
            placeholder="startRun, skipIntro"
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-600"
          />
        </label>
        {props.game.capture.stateNames.length > 0 && (
          <div className="text-[11px] text-neutral-500">
            Declared states: {props.game.capture.stateNames.join(", ")}
            {props.game.capture.settleMs !== undefined
              ? ` · settleMs ${props.game.capture.settleMs}`
              : ""}
          </div>
        )}
        <label className="grid gap-1 text-xs text-neutral-400">
          Credit text
          <input
            value={creditText}
            onChange={(event) => setCreditText(event.target.value)}
            placeholder="Port of X · Author"
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-600"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-neutral-400">
            Credit URL
            <input
              value={creditUrl}
              onChange={(event) => setCreditUrl(event.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-600"
            />
          </label>
          <label className="grid gap-1 text-xs text-neutral-400">
            Credit handle
            <input
              value={creditHandle}
              onChange={(event) => setCreditHandle(event.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-600"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={props.busy || displayName.trim().length === 0}
            className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 enabled:hover:bg-white disabled:opacity-40"
          >
            {props.busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}
