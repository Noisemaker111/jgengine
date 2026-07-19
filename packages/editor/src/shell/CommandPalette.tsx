import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "./icons";
import {
  filterPaletteCommands,
  loadRecentCommandIds,
  pushRecentCommandId,
  type PaletteCommand,
} from "./commandRegistry";
import { FOCUS_RING } from "./theme";
import { Kbd } from "./ui";

/**
 * Modal command palette (Ctrl/Cmd+K): fuzzy-filters every executable editor command (plus scene
 * object jump rows), surfaces recent commands when the query is empty, and runs the highlighted
 * entry on Enter. Esc or backdrop click cancels without side effects.
 */
export function CommandPalette({
  commands,
  onClose,
  initialQuery = "",
}: {
  commands: readonly PaletteCommand[];
  onClose: () => void;
  /** Pre-filled filter (e.g. "add " to open straight into placement commands). */
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [cursor, setCursor] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentCommandIds());
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => filterPaletteCommands(commands, query, recentIds).slice(0, 40),
    [commands, query, recentIds],
  );
  const clampedCursor = Math.min(cursor, Math.max(0, filtered.length - 1));

  useEffect(() => {
    const row = listRef.current?.children[clampedCursor];
    if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
  }, [clampedCursor]);

  const run = (command: PaletteCommand | undefined) => {
    if (command === undefined) return;
    setRecentIds(pushRecentCommandId(command.id));
    onClose();
    command.run();
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[70] flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-[520px] max-w-[92vw] overflow-hidden rounded-[8px] border border-white/10 bg-[#14171d] shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-3">
          <Icon name="search" size={14} className="shrink-0 text-neutral-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((value) => Math.min(filtered.length - 1, value + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((value) => Math.max(0, value - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(filtered[clampedCursor]);
              }
            }}
            placeholder="Search commands, tools, or objects…"
            aria-label="Search commands and objects"
            className="h-10 w-full bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} role="listbox" aria-label="Commands" className="max-h-[46vh] overflow-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-[12px] text-neutral-500">No commands match “{query}”.</div>
          ) : (
            filtered.map((command, index) => (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === clampedCursor}
                onMouseEnter={() => setCursor(index)}
                onClick={() => run(command)}
                className={`flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-left text-[12px] transition-colors ${FOCUS_RING} ${
                  index === clampedCursor ? "bg-cyan-500/15 text-cyan-100" : "text-neutral-300 hover:bg-white/[0.05]"
                }`}
              >
                <span className="w-16 shrink-0 truncate text-[10px] uppercase tracking-wider text-neutral-600">
                  {command.group}
                </span>
                <span className="min-w-0 flex-1 truncate">{command.title}</span>
                {command.kbd !== undefined ? <Kbd>{command.kbd}</Kbd> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
