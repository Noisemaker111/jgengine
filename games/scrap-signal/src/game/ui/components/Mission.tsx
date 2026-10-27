import { GameIcon, type GameIconName } from "@jgengine/core/ui/icons/gameIcons.view";
import { HudFade } from "@jgengine/core/hud/hudLayout.view";
import { useCurrency, useGame, useQuestJournal } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { NPCS, objectiveLabel, scrapQuestById } from "../../quests/catalog";
import { FERRALON } from "../../palette";
import { mastReadoutStore } from "../../mast";
import { Plate, Stamp } from "../fiction/kit";

/** The Mast Watch contract’s live objective, timer and outcome, as the first entry on the log. */
function MastCard() {
  const mast = useStore(mastReadoutStore, (value) => value);
  const { commands } = useGame();
  if (mast === null) return null;
  const active = mast.status === "active";
  return (
    <div className="ss-log-entry mast">
      <div className="ss-log-title"><span>{mast.title}</span><em>{mast.step}/{mast.steps}</em></div>
      <p>{active ? mast.label : mast.outcome === "done" ? "Mast held. $450 + 2 cores paid." : (mast.reason ?? "Contract failed.")}</p>
      {active ? (
        <div className="ss-log-goal"><span>{mast.count > 0 ? `${mast.counted} / ${mast.count}` : "signal"}</span><em>{mast.remaining === null ? "" : `${Math.ceil(mast.remaining)}s`}</em></div>
      ) : (
        <button type="button" className="ss-log-dismiss" onClick={() => commands.run("mast.dismiss", {})}>Dismiss contract</button>
      )}
    </div>
  );
}

/**
 * The tracker's space is the left HUD column, shared with the contract card and Echo. One full card
 * carries the current objective; any other active quest collapses to a title line so the column does
 * not cover the crash-site set dressing.
 */
export function splitTrackedQuests<T>(active: readonly T[]): { primary: T | undefined; others: readonly T[] } {
  return { primary: active[0], others: active.slice(1) };
}

export function MissionTracker() {
  const journal = useQuestJournal();
  const active = journal.filter((entry) => entry.status === "active");
  const progress = active.map((entry) => `${entry.questId}:${entry.objectives.map((o) => o.progress).join(",")}`);
  const { primary, others } = splitTrackedQuests(active);
  const primaryDef = primary === undefined ? undefined : scrapQuestById(primary.questId);
  const finished = primary !== undefined && primary.objectives.every((objective) => objective.progress >= objective.count);
  const returnTo = primaryDef === undefined || primaryDef.turnIn === "radio" ? null : NPCS[primaryDef.turnIn].name;
  return (
    <HudFade watch={progress} dimTo={0.5} idleMs={9000}>
      <div className="ss-log">
        <div className="ss-log-head"><Stamp tone="amber">Mission log</Stamp></div>
        <MastCard />
        {active.length === 0 ? (
          <div className="ss-log-entry"><p>No mission · find someone with a "Talk" prompt [E]</p></div>
        ) : null}
        {primary !== undefined && primaryDef !== undefined ? (
          <div key={primary.questId} className="ss-log-entry">
            <div className="ss-log-title"><span>{primaryDef.title}</span></div>
            {primary.objectives.map((objective) => {
              const done = objective.progress >= objective.count;
              const goal = primaryDef.objectives.find((candidate) => candidate.id === objective.id);
              return (
                <div key={objective.id} className={`ss-log-goal ${done ? "done" : ""}`}>
                  <span>{done ? "✓" : "▸"} {goal === undefined ? objective.id : objectiveLabel(goal)}</span>
                  <em>{Math.min(objective.progress, objective.count)} / {objective.count}</em>
                </div>
              );
            })}
            {finished && returnTo !== null ? (
              <div className="ss-log-goal"><span>▸ Return to {returnTo}</span></div>
            ) : null}
          </div>
        ) : null}
        {others.length > 0 ? (
          <div className="ss-log-others">
            {others.map((entry) => {
              const def = scrapQuestById(entry.questId);
              return def === undefined ? null : <span key={entry.questId}>+ {def.title}</span>;
            })}
          </div>
        ) : null}
      </div>
    </HudFade>
  );
}

/** The wallet counter: a coin stamp and a mechanical digit window on the rig’s shoulder. */
export function CashPlate() {
  const cash = useCurrency("cash");
  return <Counter icon="coin" value={cash} color={FERRALON.hudXp} label="Cash" />;
}

/** A small carbon counter with an odometer window, shared by the cash and cores readouts. */
export function Counter({ icon, value, color, label }: { icon: GameIconName; value: number; color: string; label: string }) {
  return (
    <HudFade watch={[value]} dimTo={0.5} idleMs={6000}>
      <Plate material="carbon" cut="notch" depth={7} rim="#4a3b29" padding="0" className="ss-counter" title={label} aria-label={`${label} ${value}`}>
        <span className="ss-counter-icon" style={{ color }}><GameIcon name={icon} size={15} /></span>
        <span className="ss-counter-digits">{String(value).padStart(4, "0")}</span>
      </Plate>
    </HudFade>
  );
}

export function CreditBadge() {
  return <span className="ss-credit">Scrap Signal</span>;
}
