import type { ReactNode } from "react";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitResultScreen } from "@jgengine/react/kitFlow";
import { KitActionBar, KitCount, KitCounts, KitVitals, KitWaveClock } from "@jgengine/react/hud/kitHud";
import { KitActionPrompt, KitPanel } from "@jgengine/react/uiKitRoot";
import { HudSlots } from "@jgengine/shell/gameKit";

import { continueGame } from "@jgengine/core/game/gameFlow";
import { startNewGame } from "@jgengine/react/menu/gameFlowMenus";
import { idea } from "../idea";
import { campView, prompts } from "../prompts";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

function useCamp() {
  return useGameStore(campView, same);
}

function useHealth(id: string): { current: number; max: number } {
  return useGameStore((ctx) => {
    const stat = ctx.scene.entity.stats.get(id, "health");
    return stat === null ? { current: 0, max: 1 } : { current: Math.round(stat.current), max: stat.max };
  }, same);
}

function Vitals(): ReactNode {
  const ctx = useGameContext();
  const camp = useCamp();
  const hero = useHealth(ctx.player.userId);
  const home = useHealth("home");
  const beat = idea.beats.find((entry) => entry.id === camp.mission?.missionId) ?? null;
  const title = beat?.title ?? camp.next?.text ?? "";
  return (
    <KitVitals
      eyebrow={idea.name}
      vitals={[
        { label: "You", value: hero.current, max: hero.max, lowAt: 0.35 },
        { label: idea.home.label, value: home.current, max: home.max, tone: "accent", lowAt: 0.35 },
      ]}
      objective={beat === null && camp.next === null ? null : { id: beat?.id, label: idea.guide.name, title, goal: beat?.goal }}
    />
  );
}

function Stockpile(): ReactNode {
  const camp = useCamp();
  return (
    <KitPanel variant="strip">
      <KitCounts>
        {camp.resources.map((resource) => (
          <KitCount key={resource.id} id={resource.id} value={resource.amount} label={resource.label} />
        ))}
        {idea.allies.length > 0 ? <KitCount id="tamed" value={camp.tamed} label="tamed" /> : null}
      </KitCounts>
    </KitPanel>
  );
}

function WaveClock(): ReactNode {
  const camp = useCamp();
  return (
    <KitWaveClock
      alarm={camp.raiding}
      text={camp.raiding ? `${idea.wave} ${camp.wave} - ${camp.alive} left` : `${idea.wave} ${camp.wave + 1} in ${camp.duskIn}s`}
      detail={camp.raiding ? `held ${camp.held}` : "N - call it early"}
      banner={{ cue: camp.raiding ? camp.wave : null, title: `${idea.wave} ${camp.wave}`, subtitle: `Hold ${idea.home.label}`, tone: "bad" }}
    />
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const camp = useCamp();
  const have = Object.fromEntries(camp.resources.map((resource) => [resource.id, resource.amount]));
  const active = usePrompt();
  return (
    <KitActionBar
      kind="build"
      prompt={active === null ? null : <KitActionPrompt action="interact" label={active} fallbackGlyph="E" />}
      actions={idea.structures.map((structure, index) => ({
        id: structure.id,
        label: `${structure.label} `,
        detail: Object.entries(structure.cost)
          .map(([id, amount]) => `${amount} ${idea.resources.find((resource) => resource.id === id)?.label ?? id}`)
          .join(" + "),
        glyph: String(index + 1),
        variant: Object.entries(structure.cost).some(([id, amount]) => (have[id] ?? 0) < amount) ? "ghost" : "secondary",
        onActivate: () => ctx.game.commands.run(`build${index + 1}`, {}),
      }))}
      progress={camp.building.map((order) => ({ id: order.id, label: order.label, value: order.progress }))}
    />
  );
}

function usePrompt(): string | null {
  return useGameStore((ctx) => {
    const me = ctx.scene.entity.get(ctx.player.userId);
    if (me === null) return null;
    const hit = resolveActivePrompt({ x: me.position[0], z: me.position[2] }, prompts(ctx));
    return hit === null || hit.prompt.display.kind !== "keybind" ? null : (hit.prompt.display.label ?? null);
  });
}

function Ending(): ReactNode {
  const ctx = useGameContext();
  const camp = useCamp();
  return (
    <KitResultScreen
      open={camp.fallen}
      tone="bad"
      eyebrow={`${idea.wave} ${camp.wave}`}
      title={`${idea.home.label} has fallen`}
      summary={`You held ${camp.held} ${idea.wave.toLowerCase()}${camp.held === 1 ? "" : "s"}.`}
      stats={[
        { label: `${idea.wave}s held`, value: camp.held },
        { label: "Tamed", value: camp.tamed },
      ]}
      actions={[
        { id: "retry", label: "Back to the last save", primary: true },
        { id: "new", label: "New game" },
      ]}
      onAction={(id) => {
        if (id === "retry") void continueGame(ctx);
        else void startNewGame(ctx);
      }}
    />
  );
}

/** Everything on screen while playing: four small panels at the edges, the end card over them. */
export function Hud(): ReactNode {
  return <HudSlots storageKey={idea.id} slots={{ topLeft: <Vitals />, top: <WaveClock />, topRight: <Stockpile />, bottom: <BuildBar /> }} overlay={<Ending />} />;
}
