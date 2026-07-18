import { useEffect, useMemo, useRef, useState } from "react";

import type { ParentCandidate } from "./parentCandidates";
import { FOCUS_RING, INPUT_CLS, NUMERIC } from "./shell/theme";

/**
 * Searchable parent-target menu for hierarchy / viewport "Parent to…".
 * Parent owns candidate list (cycle-safe) and the set_parent write.
 */
export function ParentPickerMenu({
  x,
  y,
  candidates,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  candidates: readonly ParentCandidate[];
  onPick: (parentId: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return candidates;
    return candidates.filter(
      (entry) => entry.label.toLowerCase().includes(q) || entry.id.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  return (
    <>
      <div
        className="pointer-events-auto fixed inset-0 z-[60]"
        onPointerDown={onClose}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div
        role="menu"
        aria-label="Parent to object"
        className="pointer-events-auto fixed z-[61] flex max-h-72 w-64 flex-col overflow-hidden rounded-md border border-white/15 bg-neutral-900/95 shadow-2xl backdrop-blur-sm"
        style={{ left: x, top: y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
          Parent to…
        </div>
        <div className="border-b border-white/10 p-1.5">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Search objects…"
            aria-label="Filter parent candidates"
            className={`h-7 w-full px-2 text-[12px] ${INPUT_CLS} ${FOCUS_RING}`}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <button
            type="button"
            role="menuitem"
            onPointerDown={(event) => {
              event.stopPropagation();
              onPick(null);
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-[13px] text-white/85 hover:bg-cyan-400/20 hover:text-white"
          >
            — none (root) —
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-white/40">
              {candidates.length === 0 ? "No valid parents (would create a cycle)." : "No matches."}
            </div>
          ) : (
            filtered.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onPick(entry.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-white/85 hover:bg-cyan-400/20 hover:text-white"
              >
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {entry.label !== entry.id ? (
                  <span className={`shrink-0 text-[10px] text-white/35 ${NUMERIC}`}>{entry.id}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
