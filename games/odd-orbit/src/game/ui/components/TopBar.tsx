import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";
import { useGame, useGameClock, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { householdStore } from "../../session/store";
import { nextBill } from "../../sim/economy";
import { dayGoal } from "../../sim/goal";
import { householdPhase } from "../../sim/schedule";
import { Enamel, WallClock } from "../fiction/kit";
import { creditsText } from "./bits";

const PHASE_WORD: Record<string, string> = { torpor: "Torpor", yield: "Yield hours", bloom: "Bloom hours", bond: "Bonding hours" };

/** The kitchen wall: a 24-hour clock with the shift hours painted on, a tear-off calendar and the speed knobs. */
export function HouseClock({ compact = false }: { compact?: boolean }) {
  const clock = useGameClock();
  const { commands } = useGame();
  const cal = clock.calendar;
  const hour = Math.floor(cal.hour);
  const minute = cal.minute;
  const phase = householdPhase(clock.now);
  return (
    <section className="orbit-wall" aria-label="Household time">
      <WallClock hour={hour} minute={minute} size={compact ? 62 : 84} />
      <GameFrame material="paper" cut="torn" depth={6} padding="0" edgeWidth={0} shadow={false} className="orbit-calendar">
        <span className="orbit-calendar-band">Day {cal.day + 1}</span>
        <strong>{String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}</strong>
        <small>{PHASE_WORD[phase] ?? phase}</small>
      </GameFrame>
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
  const household = useStore(householdStore);
  const objects = useSceneObjects();
  const bill = nextBill(household, objects);
  const lowFood = household.pantry < 4;
  const short = household.credits < bill;
  const goal = dayGoal(household, objects).replace(/^Next:\s*/, "");
  return (
    <HudFade watch={[Math.floor(household.credits), household.pantry, Math.round(bill), household.debt, goal]} hold={lowFood || short || household.debt > 0} dimTo={0.42} idleMs={6000} className="orbit-fridge-fade">
      <section className="orbit-fridge" aria-label="Household time and resources">
        <div className="orbit-magnets">
          <Enamel tone={short ? "coral" : "butter"} radius={16} padding="6px 12px 6px 8px" className="orbit-magnet" title="Credits">
            <GameIcon name="coin" size={20} /><b>{creditsText(Math.floor(household.credits))}</b><small>credits</small>
          </Enamel>
          <Enamel tone={lowFood ? "coral" : "mint"} radius={16} padding="6px 12px 6px 8px" className="orbit-magnet" title="Rations">
            <GameIcon name="bread" size={20} /><b>{household.pantry}</b><small>rations</small>
          </Enamel>
          <GameFrame material="paper" cut="ticket" depth={10} padding="5px 14px" edgeWidth={0} shadow={false} className={`orbit-bill ${short ? "warning" : ""}`} title="Due at midnight">
            <GameIcon name="hourglass" size={17} /><b>{Math.round(bill)}</b><small>midnight bill</small>
          </GameFrame>
          {household.debt > 0 && (
            <Enamel tone="coral" radius={16} padding="6px 12px 6px 8px" className="orbit-magnet" title="Debt">
              <GameIcon name="debuffArrow" size={18} /><b>{creditsText(household.debt)}</b><small>debt</small>
            </Enamel>
          )}
        </div>
        {!compact && (
          <GameFrame material="paper" cut="box" padding="8px 12px 9px" edgeWidth={0} shadow={false} tint="#fff3b8" className="orbit-sticky" role="status">
            {goal}
          </GameFrame>
        )}
      </section>
    </HudFade>
  );
}
