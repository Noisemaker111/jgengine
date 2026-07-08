import { useGameStore } from "@jgengine/react/hooks";

import { dateLabel } from "../../calendar";
import { chronicleEntries } from "../../chronicle";

export function ChroniclePanel() {
  const entries = useGameStore(() => chronicleEntries());
  const newestFirst = [...entries].reverse();

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 top-4 flex w-80 flex-col overflow-hidden rounded-lg border border-amber-200/20 bg-stone-950/70 shadow-lg backdrop-blur-sm">
      <div className="border-b border-amber-200/20 px-3 py-2 text-xs uppercase tracking-widest text-amber-200/80">
        Chronicle
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm leading-snug text-amber-100/85">
        {newestFirst.length === 0 ? (
          <p className="text-amber-100/40">The realm awaits its first tale.</p>
        ) : (
          newestFirst.map((entry) => (
            <p key={entry.id}>
              <span className="text-amber-300/70">{dateLabel(entry.day)} — </span>
              {entry.message}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
