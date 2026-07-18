import { useEffect, useRef, useState } from "react";

import { formatSavedRelative } from "./formatSavedRelative";
import { Icon } from "./icons";
import { BORDER, FOCUS_RING } from "./theme";
import { IconButton, Kbd, ToolbarDivider } from "./ui";

/** @internal Re-export for historical TopAppBar importers. */
export { formatSavedRelative } from "./formatSavedRelative";

/** Document save lifecycle mirrored from `useDocumentSave`. */
export type TopBarSaveState = "idle" | "saving" | "saved" | "error";

function SaveStatus({
  dirty,
  saveState,
  lastSavedAt,
}: {
  dirty: boolean;
  saveState: TopBarSaveState;
  /** Epoch ms of the last successful save this session; null when never saved this session. */
  lastSavedAt: number | null;
}) {
  // Tick once a minute so "Saved 2m ago" advances without a save/dirty transition.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (dirty || lastSavedAt === null) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(id);
  }, [dirty, lastSavedAt]);

  if (saveState === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-neutral-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
        Saving…
      </span>
    );
  }
  if (saveState === "error") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        Save failed
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-amber-300/90" title="Unsaved edits">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Unsaved changes
      </span>
    );
  }
  const relative = lastSavedAt === null ? null : formatSavedRelative(lastSavedAt);
  const label = relative === null ? "Saved" : relative === "just now" ? "Saved just now" : `Saved ${relative}`;
  return (
    <span
      className="flex items-center gap-1.5 text-[11px] text-neutral-500"
      title={lastSavedAt === null ? "All edits saved" : `Last saved ${new Date(lastSavedAt).toLocaleString()}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
      {label}
    </span>
  );
}

/**
 * Global application bar: identity + save state on the left, command palette in the center,
 * history / run controls / document actions on the right. Pause and Step stay disabled in
 * edit mode; Play mode mounts {@link PlayModeBar}, which wires the same controls to the
 * runtime pause/step RPCs so mode switches keep shell chrome.
 */
export function TopAppBar({
  gameId,
  dirty,
  saveState,
  lastSavedAt = null,
  saveAvailable,
  saveError,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onPlay,
  onWalk,
  onHud,
  onImport,
  onExport,
  onCopyJson,
  onOpenPalette,
  onToggleHelp,
  onResetLayout,
}: {
  gameId: string;
  dirty: boolean;
  saveState: TopBarSaveState;
  /** Epoch ms of the last successful save this session; omit/null when never saved. */
  lastSavedAt?: number | null;
  saveAvailable: boolean;
  saveError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPlay: () => void;
  onWalk: () => void;
  onHud: () => void;
  onImport: () => void;
  onExport: () => void;
  onCopyJson: () => void;
  onOpenPalette: () => void;
  onToggleHelp: () => void;
  onResetLayout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const menuItem =
    `flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-[12px] text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100 ${FOCUS_RING}`;

  return (
    <header
      className={`pointer-events-auto relative z-[60] flex h-12 shrink-0 items-center gap-2 border-b ${BORDER} bg-[#111318] px-2.5`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br from-cyan-500/30 to-indigo-500/25 text-[11px] font-bold tracking-wide text-cyan-200 ring-1 ring-inset ring-cyan-400/30"
          aria-hidden="true"
        >
          JG
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-semibold text-neutral-100">{gameId}</div>
          <div className="text-[10px] text-neutral-500">Scene Editor</div>
        </div>
        <div className="ml-1 hidden md:block">
          <SaveStatus dirty={dirty} saveState={saveState} lastSavedAt={lastSavedAt} />
        </div>
      </div>

      <div className="flex flex-1 justify-center px-2">
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette"
          className={`flex h-8 w-full max-w-[420px] items-center gap-2 rounded-[6px] border border-white/[0.08] bg-black/30 px-3 text-[12px] text-neutral-500 transition-colors hover:border-white/[0.14] hover:text-neutral-400 ${FOCUS_RING}`}
        >
          <Icon name="search" size={13} />
          <span className="min-w-0 flex-1 truncate text-left">Search or run a command…</span>
          <span className="hidden items-center gap-0.5 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} tone="ghost" />
        <IconButton icon="redo" label="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo} tone="ghost" />
        <ToolbarDivider />
        <button
          type="button"
          onClick={onPlay}
          className={`flex h-8 items-center gap-1.5 rounded-[6px] bg-emerald-600 px-3.5 text-[12px] font-semibold text-white shadow-sm shadow-emerald-950/40 transition-colors hover:bg-emerald-500 ${FOCUS_RING}`}
          title="Enter Play mode (F2+E toggles back)"
        >
          <Icon name="play" size={12} />
          Play
        </button>
        <IconButton icon="pause" label="Pause — available in Play mode" disabled />
        <IconButton icon="step" label="Step one frame — available in Play mode" disabled />
        <ToolbarDivider />
        <IconButton icon="walk" label="Walk the world" onClick={onWalk} tone="ghost" />
        <IconButton icon="panel" label="Lay out HUD panels" onClick={onHud} tone="ghost" />
        <ToolbarDivider />
        {saveAvailable ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saveState === "saving"}
            title={saveError ?? "Write the scene to the game's editor.scene.json (Ctrl+S)"}
            className={`flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[12px] font-medium transition-colors ${FOCUS_RING} ${
              saveState === "error"
                ? "bg-rose-600/90 text-white hover:bg-rose-500"
                : dirty
                  ? "bg-cyan-600 text-white shadow-sm shadow-cyan-950/40 hover:bg-cyan-500"
                  : "border border-white/[0.07] bg-[#191d24] text-neutral-400 hover:bg-[#1f242d]"
            }`}
          >
            <Icon name="save" size={12} />
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Retry save" : "Save"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onExport}
            title="Download the scene document JSON"
            className={`flex h-8 items-center gap-1.5 rounded-[6px] border border-cyan-400/30 bg-cyan-500/15 px-3 text-[12px] font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 ${FOCUS_RING}`}
          >
            <Icon name="export" size={12} />
            Export
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <IconButton
            icon="settings"
            label="Editor menu"
            onClick={() => setMenuOpen((value) => !value)}
            active={menuOpen}
            tone="ghost"
          />
          {menuOpen ? (
            <div className="absolute right-0 top-9 z-[70] w-56 rounded-[8px] border border-white/10 bg-[#14171d] p-1.5 shadow-2xl shadow-black/60">
              <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); onImport(); }}>
                <Icon name="import" size={13} /> Import scene JSON…
              </button>
              <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); onExport(); }}>
                <Icon name="export" size={13} /> Export scene JSON
              </button>
              <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); onCopyJson(); }}>
                <Icon name="copy" size={13} /> Copy JSON to clipboard
              </button>
              <div className="my-1 h-px bg-white/[0.07]" />
              <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); onResetLayout(); }}>
                <Icon name="panel" size={13} /> Reset panel layout
              </button>
              <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); onToggleHelp(); }}>
                <Icon name="help" size={13} /> Keyboard shortcuts
              </button>
            </div>
          ) : null}
        </div>
        <IconButton icon="help" label="Keyboard shortcuts (?)" onClick={onToggleHelp} tone="ghost" />
      </div>
    </header>
  );
}
