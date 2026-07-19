import type { CSSProperties, ReactNode } from "react";

import type { TrackedQuestView } from "@jgengine/core/game/quest";

/** Props for {@link QuestTracker}. */
export interface QuestTrackerProps {
  /** Quests to show, e.g. `journal.list(userId).map((q) => describeTrackedQuest(defs[q.questId], q))`. */
  quests: readonly TrackedQuestView[];
  title?: string;
  emptyLabel?: string;
  /** Max objectives shown per quest before a "+N more" line. Default: all. */
  maxObjectives?: number;
  /** Accent color for the completion tick / progress fill. Reads a HudTheme token by default. */
  accent?: string;
  className?: string;
  style?: CSSProperties;
}

function ObjectiveRow({ label, progress, count, complete, accent }: {
  label: string;
  progress: number;
  count: number;
  complete: boolean;
  accent: string;
}): ReactNode {
  const fraction = count > 0 ? Math.min(1, progress / count) : complete ? 1 : 0;
  return (
    <li data-quest-objective data-complete={complete} style={{ display: "flex", flexDirection: "column", gap: 3, listStyle: "none" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6, opacity: complete ? 0.65 : 1 }}>
          <span aria-hidden style={{ color: complete ? accent : "rgba(148,163,184,0.7)" }}>{complete ? "✓" : "○"}</span>
          <span style={{ textDecoration: complete ? "line-through" : "none" }}>{label}</span>
        </span>
        {count > 1 ? (
          <span style={{ fontVariantNumeric: "tabular-nums", color: "rgba(203,213,225,0.7)", fontSize: "0.9em" }}>
            {Math.min(progress, count)}/{count}
          </span>
        ) : null}
      </div>
      {count > 1 && !complete ? (
        <div style={{ height: 3, borderRadius: 9999, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
          <div style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", background: accent }} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Quest / objective tracker HUD — a compact panel of active quests with a title
 * and labelled, progress-barred objectives (checked + struck when complete).
 * Presentation-only over `describeTrackedQuest(def, instance)` views, so it stays
 * decoupled from the `QuestJournal` runtime.
 *
 * @capability quest-tracker compact quest/objective HUD tracker — titles + labelled objective progress from describeTrackedQuest views
 */
export function QuestTracker({
  quests,
  title = "Quests",
  emptyLabel = "No active quests.",
  maxObjectives,
  accent = "var(--jg-accent, #facc15)",
  className,
  style,
}: QuestTrackerProps): ReactNode {
  return (
    <div
      className={className}
      data-quest-tracker
      style={{
        width: 260,
        borderRadius: 12,
        padding: 12,
        background: "linear-gradient(160deg, rgba(20,24,32,0.92), rgba(11,14,19,0.92))",
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.28))",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 12,
        ...style,
      }}
    >
      {title !== "" ? (
        <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(203,213,225,0.7)", marginBottom: 8 }}>
          {title}
        </div>
      ) : null}
      {quests.length === 0 ? (
        <p style={{ margin: 0, color: "rgba(148,163,184,0.8)" }}>{emptyLabel}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {quests.map((quest) => {
            const shown = maxObjectives === undefined ? quest.objectives : quest.objectives.slice(0, maxObjectives);
            const hidden = quest.objectives.length - shown.length;
            const done = quest.status === "completed";
            return (
              <li key={quest.id} data-quest={quest.id} data-status={quest.status} style={{ listStyle: "none" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: done ? accent : "#f8fafc" }}>{quest.title}</span>
                  {done ? <span style={{ fontSize: 10, color: accent }}>DONE</span> : null}
                </div>
                <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  {shown.map((objective) => (
                    <ObjectiveRow
                      key={objective.id}
                      label={objective.label}
                      progress={objective.progress}
                      count={objective.count}
                      complete={objective.complete}
                      accent={accent}
                    />
                  ))}
                </ul>
                {hidden > 0 ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: "rgba(148,163,184,0.75)" }}>+{hidden} more</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
