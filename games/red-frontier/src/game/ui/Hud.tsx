import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { HUD_CORNER_WIDTH } from "@jgengine/core/hud/hudLayout.view";
import { ActionBar } from "@jgengine/core/hud/actionHud.view";
import { KitResultScreen } from "@jgengine/react/kitFlow";
import { KitCount, KitCounts, KitHint, KitVitals } from "@jgengine/core/hud/kitHud.view";
import { KitButton, KitPanel } from "@jgengine/react/uiKitRoot";
import { HudSlots } from "@jgengine/shell/gameKit";

import { startNewGame } from "@jgengine/core/menu/gameFlowMenus.view";
import { idea } from "../idea";
import { colonyView } from "../view";

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
    <KitVitals
      eyebrow={idea.name}
      title={idea.hq.label}
      vitals={food === undefined || food.value > 20 ? [] : [{ label: `${food.label} low`, value: food.value, max: 20, tone: "bad" }]}
      objective={beat === null ? null : { id: beat.id, label: idea.guide.name, title: beat.title, goal: beat.goal }}
    >
      <KitCounts>
        {colony.resources.map((resource) => (
          <KitCount key={resource.id} id={resource.id} value={resource.value} label={resource.label.toLowerCase()} />
        ))}
      </KitCounts>
      <KitCounts>
        <KitCount id="people" value={`${colony.people}/${colony.beds}`} label={people} />
        <KitCount id="raids" value={colony.raids} label="raids held" />
      </KitCounts>
    </KitVitals>
  );
}

/** The raid readout, and what the colonists are doing. */
function Watch(): ReactNode {
  const ctx = useGameContext();
  const colony = useColony();
  return (
    <div style={{ width: HUD_CORNER_WIDTH }}>
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
    <KitHint
      text={text}
      banner={{ cue: colony.raiding ? colony.raids + 1 : null, title: `Raid ${colony.raids + 1}`, subtitle: `${idea.raiders.label} are coming`, tone: "bad" }}
    />
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const colony = useColony();
  return (
    <ActionBar
      look="kit"
      hotkeys={false}
      wrapAt={1040}
      defs={idea.structures.map((structure, index) => ({
        id: structure.id,
        label: structure.label,
        detail: costText(structure.cost),
        ...(index < 9 ? { hotkey: String(index + 1) } : {}),
        active: colony.armed === structure.id,
          disabled: colony.afford[index] !== true,
        description: structure.blurb,
      }))}
      onActivate={(id) => ctx.game.commands.run(`build${idea.structures.findIndex((structure) => structure.id === id) + 1}`, {})}
    />
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
      onAction={(id) => (id === "keep" ? ctx.game.commands.run("dismiss", {}) : void startNewGame(ctx))}
    />
  );
}

/** Everything on screen while playing: a few small panels at the edges, the end card over them. */
export function Hud(): ReactNode {
  return <HudSlots storageKey={idea.id} slots={{ topLeft: <Stores />, top: <Hint />, topRight: <Watch />, bottom: <BuildBar /> }} overlay={<Ending />} />;
}
