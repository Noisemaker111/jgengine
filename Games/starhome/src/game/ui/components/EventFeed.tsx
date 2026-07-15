import type { ReactNode } from "react";

import { useStore } from "@jgengine/react/store";

import { householdStore } from "../../session/store";

const TONE_STYLE: Record<string, string> = {
  info: "border-slate-400/40 text-slate-200",
  good: "border-emerald-300/50 text-emerald-100",
  milestone: "border-fuchsia-300/60 text-fuchsia-100",
};

export function EventFeed(): ReactNode {
  const household = useStore(householdStore);
  const events = household.events.slice(-4).reverse();
  if (events.length === 0) return null;

  return (
    <div className="flex w-72 flex-col items-center gap-1">
      {events.map((event) => (
        <div
          key={event.id}
          className={`w-full rounded-lg border-l-2 bg-slate-950/80 px-3 py-1.5 text-[11px] font-medium shadow ring-1 ring-white/10 backdrop-blur ${
            TONE_STYLE[event.tone] ?? TONE_STYLE.info
          }`}
        >
          {event.tone === "milestone" ? "✦ " : ""}
          {event.text}
        </div>
      ))}
    </div>
  );
}
