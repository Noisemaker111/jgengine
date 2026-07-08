export interface TrackedObjective {
  id: string;
  label: string;
  count?: number;
  target?: number;
  complete?: boolean;
}

export interface TrackedQuest {
  id: string;
  title: string;
  objectives: readonly TrackedObjective[];
}

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function ObjectiveRow({ objective }: { objective: TrackedObjective }) {
  const complete = objective.complete ?? false;
  return (
    <div data-jg="objective-row" className="flex items-center gap-1.5 pl-3">
      <span
        aria-hidden
        className="h-[7px] w-[7px] shrink-0 rotate-45"
        style={{
          background: complete ? "var(--jg-success)" : "transparent",
          border: complete ? "none" : "1px solid var(--jg-edge-bright)",
          boxShadow: complete ? "0 0 4px color-mix(in srgb, var(--jg-success) 67%, transparent)" : "none",
        }}
      />
      <span
        className={`min-w-0 flex-1 text-[11.5px] ${complete ? "line-through" : ""}`}
        style={{ color: complete ? "var(--jg-text-dim)" : "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
      >
        {objective.label}
      </span>
      {objective.target !== undefined && (
        <span className="shrink-0 font-mono text-[10.5px]" style={{ color: "var(--jg-text-dim)" }}>
          {objective.count ?? 0}/{objective.target}
        </span>
      )}
    </div>
  );
}

export function ObjectiveList({ quest, className }: { quest: TrackedQuest; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`} data-jg="objective-list">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-3 w-[3px]"
          style={{
            transform: "skewX(-14deg)",
            background: "var(--jg-accent)",
            boxShadow: "0 0 6px var(--jg-accent-glow)",
          }}
        />
        <span
          className="text-xs font-bold"
          style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-accent)", textShadow: HUD_TEXT_SHADOW }}
        >
          {quest.title}
        </span>
      </div>
      <div className="flex flex-col gap-[3px]">
        {quest.objectives.map((objective) => (
          <ObjectiveRow key={objective.id} objective={objective} />
        ))}
      </div>
    </div>
  );
}

export function QuestTracker({
  quests,
  width = 240,
  className,
}: {
  quests: readonly TrackedQuest[];
  width?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2.5 ${className ?? ""}`} data-jg="quest-tracker" style={{ width }}>
      {quests.map((quest) => (
        <ObjectiveList key={quest.id} quest={quest} />
      ))}
    </div>
  );
}
