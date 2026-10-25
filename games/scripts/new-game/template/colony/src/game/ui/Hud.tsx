import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitObjective, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { newGame } from "../flow";
import { idea } from "../idea";
import { colonyView } from "../view";
import { Count, Counts, HudFrame, PANEL_WIDTH } from "./HudFrame";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
const useColony = () => useGameStore(colonyView, same);
const people = idea.colonists.label.toLowerCase();
const costText = (cost: Readonly<Record<string, number>>) =>
  Object.entries(cost)
    .map(([id, amount]) => `${amount} ${idea.resources.find((resource) => resource.id === id)?.label.toLowerCase() ?? id}`)
    .join(" ");

function Stores(): ReactNode {
  const colony = useColony();
  const beat = idea.beats.find((entry) => entry.id === colony.mission?.missionId) ?? null;
  const [food] = colony.resources;
  return (
    <div style={{ width: PANEL_WIDTH, pointerEvents: "none" }}>
      <KitPanel variant="hud" eyebrow={idea.name} title={idea.hq.label}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Counts>
            {colony.resources.map((resource) => (
              <Count key={resource.id} id={resource.id} value={resource.value} label={resource.label.toLowerCase()} />
            ))}
          </Counts>
          <Counts>
            <Count id="people" value={`${colony.people}/${colony.beds}`} label={people} />
            <Count id="raids" value={colony.raids} label="raids held" />
          </Counts>
          {food === undefined || food.value > 20 ? null : <KitMeter size="sm" label={`${food.label} low`} value={food.value} max={20} tone="bad" readout />}
        </div>
      </KitPanel>
      {beat === null ? null : (
        <div style={{ marginTop: 8 }}>
          <KitObjective eyebrow={idea.guide.name} title={beat.title} steps={[{ id: beat.id, label: beat.goal }]} progressKey={beat.id} />
        </div>
      )}
    </div>
  );
}

/** The raid readout, and what the colonists are doing. */
function Watch(): ReactNode {
  const ctx = useGameContext();
  const colony = useColony();
  return (
    <div style={{ width: PANEL_WIDTH }}>
      <KitPanel
        variant="hud"
        tone={colony.raiding ? "bad" : undefined}
        eyebrow={`Raid ${colony.raids + 1}`}
        title={colony.raiding ? `${colony.raiders} ${idea.raiders.label.toLowerCase()} in the colony` : `${idea.raiders.label} in ${colony.raidIn}s`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          <span style={{ opacity: 0.85 }}>
            {colony.gathering} gathering, {colony.fighting} fighting, {colony.idle} idle
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <KitButton size="sm" glyph="F" data-select-all="" onClick={() => ctx.game.commands.run("selectAll", {})}>
              Select all
            </KitButton>
            <KitButton size="sm" variant={colony.idle > 0 ? "primary" : "secondary"} glyph="G" data-gather="" onClick={() => ctx.game.commands.run("gather", {})}>
              Gather
            </KitButton>
          </div>
        </div>
      </KitPanel>
    </div>
  );
}

function Hint(): ReactNode {
  const colony = useColony();
  const structure = idea.structures.find((entry) => entry.id === colony.armed) ?? null;
  const text =
    structure !== null
      ? `Placing ${structure.label} - right click inside the colony, press its key again to stop`
      : colony.selected > 0
        ? `${colony.selected} selected - right click a node to gather, a raider to fight, ground to walk`
        : null;
  return (
    <div style={{ pointerEvents: "none" }}>
      {text === null ? null : (
        <KitPanel variant="strip" tone="accent">
          <span style={{ fontWeight: 700, letterSpacing: "0.06em", fontSize: 13 }}>{text}</span>
        </KitPanel>
      )}
      <KitBanner cue={colony.raiding ? colony.raids + 1 : null} title={`Raid ${colony.raids + 1}`} subtitle={`${idea.raiders.label} are coming`} tone="bad" />
    </div>
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const colony = useColony();
  return (
    <KitPanel variant="strip">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center", maxWidth: 1040 }}>
        {idea.structures.map((structure, index) => {
          const short = colony.afford[index] !== true;
          return (
            <KitButton
              key={structure.id}
              data-build={structure.id}
              size="sm"
              variant={colony.armed === structure.id ? "primary" : short ? "ghost" : "secondary"}
              pressed={colony.armed === structure.id}
              glyph={index < 9 ? String(index + 1) : undefined}
              title={structure.blurb}
              onClick={() => ctx.game.commands.run(`build${index + 1}`, {})}
            >
              {structure.label}
              <span style={{ opacity: 0.65, marginLeft: 4, fontSize: "0.85em" }}>{costText(structure.cost)}</span>
            </KitButton>
          );
        })}
      </div>
    </KitPanel>
  );
}

function Ending(): ReactNode {
  const ctx = useGameContext();
  const colony = useColony();
  return (
    <KitResultScreen
      open={colony.lost || (colony.won && !colony.dismissed)}
      tone={colony.won ? "good" : "bad"}
      eyebrow={colony.won ? "Victory" : "Defeat"}
      title={colony.won ? `${idea.name} will last` : `${idea.name} is lost`}
      summary={colony.won ? `The ${idea.structures.find((entry) => entry.role === "crown")?.label ?? "last building"} stands.` : `The last of the ${people} fell.`}
      stats={[
        { label: "Raids held", value: colony.raids },
        { label: "Gathered", value: colony.gathered },
        { label: idea.colonists.label, value: colony.people },
      ]}
      actions={colony.won ? [{ id: "keep", label: "Keep building", primary: true }, { id: "again", label: "New colony" }] : [{ id: "again", label: "Try again", primary: true }]}
      onAction={(id) => (id === "keep" ? ctx.game.commands.run("dismiss", {}) : void newGame(ctx))}
    />
  );
}

/** Everything on screen while playing: a few small panels at the edges, the end card over them. */
export function Hud(): ReactNode {
  return <HudFrame slots={{ topLeft: <Stores />, top: <Hint />, topRight: <Watch />, bottom: <BuildBar /> }} overlay={<Ending />} />;
}
