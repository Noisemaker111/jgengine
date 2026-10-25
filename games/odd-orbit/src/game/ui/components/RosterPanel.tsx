import { GameIcon } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";
import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { bodyColor } from "../../creatures/bodyPlan";
import { householdStore } from "../../session/store";
import { activeGoalLabel } from "../../sim/simulate";
import { Enamel, NeedRing } from "../fiction/kit";
import { AlienSwatch } from "./bits";

/**
 * The household on the fridge: one enamel magnet per being, in their own colour, with a ring of
 * their four needs around the portrait and what they are doing underneath. A worry hangs off the
 * magnet as a paper tag. Tap a magnet to open that being's card.
 */
export function RosterPanel({ compact = false }: { compact?: boolean }) {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const labels = household.order.map((id) => {
    const member = household.members[id];
    if (member === undefined) return "";
    const company = member.action.kind === "wander" && member.action.company !== undefined ? household.members[member.action.company]?.name : undefined;
    return activeGoalLabel(member, company);
  });
  const worried = household.order.some((id) => household.members[id]?.concern || household.members[id]?.recovering);
  return (
    <HudFade watch={[labels.join("|"), household.selectedMemberId]} hold={worried || household.selectedMemberId !== null} dimTo={0.55} idleMs={7000}>
      <section className={`orbit-roster ${compact ? "compact" : ""}`} aria-label="Household">
        {household.order.map((id, index) => {
          const member = household.members[id];
          if (!member) return null;
          const selected = household.selectedMemberId === id;
          const low = Math.min(...Object.values(member.needs)) < 25;
          return (
            <div key={id} className="orbit-member-slot">
              <Enamel
                as="button"
                tint={bodyColor(member.bodyPlan, 82)}
                radius={22}
                padding="0"
                glow={selected ? "#ffd98a" : undefined}
                className={`orbit-member ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                style={{ rotate: `${[-1.5, 1, -0.6, 1.4][index % 4]}deg` }}
                onClick={() => commands.run("member.select", { id: selected ? null : id })}
              >
                <span className="orbit-member-row">
                  <NeedRing needs={member.needs} size={compact ? 42 : 50}><AlienSwatch plan={member.bodyPlan} size={compact ? 30 : 36} /></NeedRing>
                  <span className="orbit-member-text">
                    <strong>{member.name}</strong>
                    <small>{labels[index]}</small>
                  </span>
                  {(low || member.recovering) && <span className="orbit-member-alert" aria-label="Needs care"><GameIcon name="heart" size={14} /></span>}
                </span>
              </Enamel>
              {member.concern && !compact && <span className="orbit-tag">{member.concern}</span>}
            </div>
          );
        })}
      </section>
    </HudFade>
  );
}
