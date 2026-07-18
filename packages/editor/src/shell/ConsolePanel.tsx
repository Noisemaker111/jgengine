import { useMemo, useState, useSyncExternalStore } from "react";

import type { ConsoleSeverity, EditorConsoleStore } from "./consoleStore";
import { Icon, type IconName } from "./icons";
import { FOCUS_RING, INPUT_CLS, NUMERIC } from "./theme";
import { EmptyState, IconButton } from "./ui";

const SEVERITY_META: Record<ConsoleSeverity, { icon: IconName; row: string; chip: string }> = {
  info: { icon: "info", row: "text-neutral-300", chip: "text-neutral-300" },
  warning: { icon: "warning", row: "text-amber-200", chip: "text-amber-300" },
  error: { icon: "error", row: "text-rose-200", chip: "text-rose-300" },
};

function formatTime(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Console dock tab over the real editor event log — notifications, save/import results, RPC and
 * agent errors. Severity filters, counts, search, timestamps, and clear; no fabricated entries.
 */
export function ConsolePanel({ store }: { store: EditorConsoleStore }) {
  const entries = useSyncExternalStore(store.subscribe, store.getEntries, store.getEntries);
  const [enabled, setEnabled] = useState<Record<ConsoleSeverity, boolean>>({ info: true, warning: true, error: true });
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const totals: Record<ConsoleSeverity, number> = { info: 0, warning: 0, error: 0 };
    for (const entry of entries) totals[entry.severity] += 1;
    return totals;
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(
      (entry) =>
        enabled[entry.severity] &&
        (needle.length === 0 || entry.message.toLowerCase().includes(needle) || entry.source.toLowerCase().includes(needle)),
    );
  }, [entries, enabled, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-2">
        {(Object.keys(SEVERITY_META) as ConsoleSeverity[]).map((severity) => {
          const meta = SEVERITY_META[severity];
          const active = enabled[severity];
          return (
            <button
              key={severity}
              type="button"
              aria-pressed={active}
              aria-label={`${active ? "Hide" : "Show"} ${severity} entries`}
              onClick={() => setEnabled((previous) => ({ ...previous, [severity]: !previous[severity] }))}
              className={`flex h-6 items-center gap-1 rounded-[5px] border px-1.5 text-[10px] transition-colors ${FOCUS_RING} ${
                active ? `border-white/[0.1] bg-white/[0.05] ${meta.chip}` : "border-transparent text-neutral-600 hover:text-neutral-400"
              }`}
            >
              <Icon name={meta.icon} size={11} />
              <span className={NUMERIC}>{counts[severity]}</span>
            </button>
          );
        })}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter messages…"
          aria-label="Filter console messages"
          className={`ml-2 h-6 w-56 px-2 ${INPUT_CLS}`}
        />
        <div className="ml-auto">
          <IconButton icon="trash" label="Clear console" size={12} onClick={() => store.clear()} disabled={entries.length === 0} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1 font-mono text-[10.5px] leading-relaxed">
        {visible.length === 0 ? (
          <EmptyState
            icon="terminal"
            title={entries.length === 0 ? "No editor events yet" : "No entries match the filter"}
            description={
              entries.length === 0
                ? "Editor actions, save results, and agent activity will appear here as they happen."
                : "Adjust the severity filters or search to see more."
            }
          />
        ) : (
          visible.map((entry) => {
            const meta = SEVERITY_META[entry.severity];
            return (
              <div key={entry.id} className={`flex items-start gap-2 rounded-[4px] px-1.5 py-0.5 hover:bg-white/[0.03] ${meta.row}`}>
                <span className={`shrink-0 text-neutral-600 ${NUMERIC}`}>[{formatTime(entry.at)}]</span>
                <Icon name={meta.icon} size={11} className="mt-0.5 shrink-0 opacity-70" />
                <span className="shrink-0 rounded-[3px] bg-white/[0.05] px-1 text-[9px] uppercase tracking-wider text-neutral-500">
                  {entry.source}
                </span>
                <span className="min-w-0 flex-1 break-words">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
