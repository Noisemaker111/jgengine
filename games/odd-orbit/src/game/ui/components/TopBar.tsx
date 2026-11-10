/** @jsxImportSource @jgengine/core/ui/jsx */
import { GameIcon } from "@jgengine/core/ui/icons/gameIcons.view";
import { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { HudFade } from "@jgengine/core/hud/hudLayout.view";
import { useGame, useGameCalendar, useGameClock, useGameStore, useSceneObjects } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { LiveText } from "@jgengine/core/ui/liveBind.view";
import { useStore } from "@jgengine/react/store";
import { householdStore } from "../../session/store";
import { nextBill } from "../../sim/economy";
import { dayGoal } from "../../sim/goal";
import { householdPhase } from "../../sim/schedule";
import { Enamel, WallClock, type WallTime } from "../fiction/kit";
import { creditsText } from "./bits";

const PHASE_WORD: Record<string, string> = { torpor: "Torpor", yield: "Yield hours", bloom: "Bloom hours", bond: "Bonding hours" };

/** The kitchen wall: a 24-hour clock with the shift hours painted on, a tear-off calendar and the speed knobs. */
export function HouseClock({ compact = false }: { compact?: boolean }) {
  const ctx = useGameContext();
  const clock = useGameClock();
  const { commands } = useGame();
  const day = useGameCalendar((calendar) => calendar.day);
  const phase = useGameStore((c) => householdPhase(c.time.now()));
  const time = (): WallTime => {
    const calendar = ctx.time.calendar();
    return { hour: Math.floor(calendar.hour), minute: calendar.minute };
  };
  return (
    <section className="orbit-wall" aria-label="Household time">
      <WallClock time={time} size={compact ? 62 : 84} />
      <KitPanel material="paper" cut="torn" depth={6} padding="0" edgeWidth={0} shadow={false} className="orbit-calendar">
        <span className="orbit-calendar-band">Day {day + 1}</span>
        <LiveText as="strong" get={() => { const { hour, minute } = time(); return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; }} />
        <small>{PHASE_WORD[phase] ?? phase}</small>
      </KitPanel>
      <div className="orbit-knobs" role="group" aria-label="Simulation speed">
        <Enamel as="button" tone={clock.paused ? "butter" : "cream"} radius={99} padding="0" className="orbit-knob" aria-label={clock.paused ? "Resume time" : "Pause time"} aria-pressed={clock.paused} onClick={() => commands.run("pauseToggle", {})}>
          <GameIcon name={clock.paused ? "arrowRight" : "pause"} size={16} />
        </Enamel>
        {clock.speeds.map((mult) => (
          <Enamel key={mult} as="button" tone={!clock.paused && clock.speed === mult ? "pink" : "cream"} radius={99} padding="0" className="orbit-knob" aria-pressed={!clock.paused && clock.speed === mult} onClick={() => commands.run("time.speed", { mult })}>
            {mult}×
          </Enamel>
        ))}
      </div>
    </section>
  );
}

/** The fridge door: credits, rations and the midnight bill as magnets, with the day's note pinned under them. */
export function FridgeMagnets({ compact = false }: { compact?: boolean }) {
  const ctx = useGameContext();
  const objects = useSceneObjects();
  // Credits climb every tick of a shift; the jar and the note write their own text, and the door redraws when a tone or count changes.
  const household = useStore(householdStore, (state) => {
    const due = nextBill(state, objects);
    return { pantry: state.pantry, debt: state.debt, bill: Math.round(due), short: state.credits < due };
  });
  const { bill, short } = household;
  const lowFood = household.pantry < 4;
  const credits = () => creditsText(Math.floor(householdStore.read(ctx).credits));
  const goal = () => dayGoal(householdStore.read(ctx), objects).replace(/^Next:\s*/, "");
  return (
    <HudFade watch={() => [credits(), household.pantry, bill, household.debt, goal()]} hold={() => lowFood || short || household.debt > 0} dimTo={0.42} idleMs={6000} className="orbit-fridge-fade">
      <section className="orbit-fridge" aria-label="Household time and resources">
        <div className="orbit-magnets">
          <Enamel tone={short ? "coral" : "butter"} radius={16} padding="6px 12px 6px 8px" className="orbit-magnet" title="Credits">
            <GameIcon name="coin" size={20} /><LiveText as="b" get={credits} /><small>credits</small>
          </Enamel>
          <Enamel tone={lowFood ? "coral" : "mint"} radius={16} padding="6px 12px 6px 8px" className="orbit-magnet" title="Rations">
            <GameIcon name="bread" size={20} /><b>{household.pantry}</b><small>rations</small>
          </Enamel>
          <KitPanel material="paper" cut="ticket" depth={10} padding="5px 14px" edgeWidth={0} shadow={false} className={`orbit-bill ${short ? "warning" : ""}`} title="Due at midnight">
            <GameIcon name="hourglass" size={17} /><b>{bill}</b><small>midnight bill</small>
          </KitPanel>
          {household.debt > 0 && (
            <Enamel tone="coral" radius={16} padding="6px 12px 6px 8px" className="orbit-magnet" title="Debt">
              <GameIcon name="debuffArrow" size={18} /><b>{creditsText(household.debt)}</b><small>debt</small>
            </Enamel>
          )}
        </div>
        {!compact && (
          <KitPanel material="paper" cut="box" padding="8px 12px 9px" edgeWidth={0} shadow={false} tint="#fff3b8" className="orbit-sticky" role="status">
            <LiveText get={goal} />
          </KitPanel>
        )}
      </section>
    </HudFade>
  );
}
