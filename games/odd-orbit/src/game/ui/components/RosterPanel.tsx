/** @jsxImportSource @jgengine/core/ui/jsx */
import { GameIcon } from "@jgengine/core/ui/icons/gameIcons.view";
import { HudFade } from "@jgengine/core/hud/hudLayout.view";
import { useGame } from "@jgengine/ui/hooks";
import { useStore } from "@jgengine/ui/store";
import { useGameContext } from "@jgengine/ui/provider";
import { LiveText } from "@jgengine/core/ui/liveBind.view";
import type { HouseholdState } from "../../session/types";
import { bodyColor } from "../../creatures/bodyPlan";
import { householdStore } from "../../session/store";
import { activeGoalLabel } from "../../sim/simulate";
import { Enamel, NeedRing, ringNeeds } from "../fiction/kit";
import { AlienSwatch } from "./bits";

/**
 * The household on the fridge: one enamel magnet per being, in their own colour, with a ring of
 * their four needs around the portrait and what they are doing underneath. A worry hangs off the
 * magnet as a paper tag. Tap a magnet to open that being's card.
 */
/** What each being is doing, as the roster prints it; a Yield shift counts its seconds up while it runs. */
function rosterLabels(household: HouseholdState): string[] {
  return household.order.map((id) => {
    const member = household.members[id];
    if (member === undefined) return "";
    const company = member.action.kind === "wander" && member.action.company !== undefined ? household.members[member.action.company]?.name : undefined;
    return activeGoalLabel(member, company);
  });
}

export function RosterPanel({ compact = false }: { compact?: boolean }) {
  const ctx = useGameContext();
  const { commands } = useGame();
  const roster = useStore(householdStore, (household) => ({
    selectedMemberId: household.selectedMemberId,
    members: household.order.flatMap((id) => {
      const member = household.members[id];
      if (member === undefined) return [];
      const company = member.action.kind === "wander" && member.action.company !== undefined ? household.members[member.action.company]?.name : undefined;
      return [{
        id,
        name: member.name,
        plan: member.bodyPlan,
        // A running shift's seconds tick in their own text node; the magnet redraws when the activity changes.
        label: member.action.kind === "use" && member.action.goal === "work" ? null : activeGoalLabel(member, company),
        needs: ringNeeds(member.needs),
        low: Math.min(...Object.values(member.needs)) < 25,
        recovering: member.recovering,
        concern: member.concern,
      }];
    }),
  }));
  const worried = roster.members.some((member) => member.concern || member.recovering);
  return (
    <HudFade watch={() => [rosterLabels(householdStore.read(ctx)).join("|"), roster.selectedMemberId]} hold={() => worried || roster.selectedMemberId !== null} dimTo={0.55} idleMs={7000}>
      <section className={`orbit-roster ${compact ? "compact" : ""}`} aria-label="Household">
        {roster.members.map((member, index) => {
          const id = member.id;
          const selected = roster.selectedMemberId === id;
          const low = member.low;
          return (
            <div key={id} className="orbit-member-slot">
              <Enamel
                as="button"
                tint={bodyColor(member.plan, 82)}
                radius={22}
                padding="0"
                glow={selected ? "#ffd98a" : undefined}
                className={`orbit-member ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                style={{ rotate: `${[-1.5, 1, -0.6, 1.4][index % 4]}deg` }}
                onClick={() => commands.run("member.select", { id: selected ? null : id })}
              >
                <span className="orbit-member-row">
                  <NeedRing needs={member.needs} size={compact ? 42 : 50}><AlienSwatch plan={member.plan} size={compact ? 30 : 36} /></NeedRing>
                  <span className="orbit-member-text">
                    <strong>{member.name}</strong>
                    {member.label === null ? <LiveText as="small" get={() => { const household = householdStore.read(ctx); return rosterLabels(household)[household.order.indexOf(id)] ?? ""; }} /> : <small>{member.label}</small>}
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
