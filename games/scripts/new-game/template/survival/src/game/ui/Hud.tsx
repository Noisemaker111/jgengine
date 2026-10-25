import type { ReactNode } from "react";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitObjective, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitActionPrompt, KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { continueGame, newGame } from "../flow";
import { idea } from "../idea";
import { campView, prompts } from "../prompts";
import { Count, Counts, HudFrame, PANEL_WIDTH } from "./HudFrame";

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
  return (
    <div style={{ width: PANEL_WIDTH, pointerEvents: "none" }}>
      <KitPanel variant="hud" eyebrow={idea.name}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <KitMeter size="sm" label="You" value={hero.current} max={hero.max} tone={hero.current < hero.max * 0.35 ? "bad" : "good"} readout />
          <KitMeter size="sm" label={idea.home.label} value={home.current} max={home.max} tone={home.current < home.max * 0.35 ? "bad" : "accent"} readout />
        </div>
      </KitPanel>
      {beat === null && camp.next === null ? null : (
        <div style={{ marginTop: 8 }}>
          <KitObjective
            eyebrow={idea.guide.name}
            title={beat?.title ?? camp.next?.text ?? ""}
            steps={beat === null ? [] : [{ id: beat.id, label: beat.goal }]}
            progressKey={beat?.id}
          />
        </div>
      )}
    </div>
  );
}

function Stockpile(): ReactNode {
  const camp = useCamp();
  return (
    <KitPanel variant="strip">
      <Counts>
        {camp.resources.map((resource) => (
          <Count key={resource.id} id={resource.id} value={resource.amount} label={resource.label} />
        ))}
        {idea.allies.length > 0 ? <Count id="tamed" value={camp.tamed} label="tamed" /> : null}
      </Counts>
    </KitPanel>
  );
}

function WaveClock(): ReactNode {
  const camp = useCamp();
  const text = camp.raiding ? `${idea.wave} ${camp.wave} - ${camp.alive} left` : `${idea.wave} ${camp.wave + 1} in ${camp.duskIn}s`;
  return (
    <div style={{ pointerEvents: "none" }}>
      <KitPanel variant="strip" tone={camp.raiding ? "bad" : "neutral"}>
        <span data-wave-clock="" style={{ fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 13 }}>
          {text}
        </span>
        <span style={{ marginLeft: 10, opacity: 0.7, fontSize: 11 }}>{camp.raiding ? `held ${camp.held}` : "N - call it early"}</span>
      </KitPanel>
      <KitBanner cue={camp.raiding ? camp.wave : null} title={`${idea.wave} ${camp.wave}`} subtitle={`Hold ${idea.home.label}`} tone="bad" />
    </div>
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const camp = useCamp();
  const have = Object.fromEntries(camp.resources.map((resource) => [resource.id, resource.amount]));
  const active = usePrompt();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {active === null ? null : <KitActionPrompt action="interact" label={active} fallbackGlyph="E" />}
      <KitPanel variant="strip">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {idea.structures.map((structure, index) => {
            const short = Object.entries(structure.cost).some(([id, amount]) => (have[id] ?? 0) < amount);
            const cost = Object.entries(structure.cost)
              .map(([id, amount]) => `${amount} ${idea.resources.find((resource) => resource.id === id)?.label ?? id}`)
              .join(" + ");
            return (
              <KitButton key={structure.id} data-build={structure.id} size="sm" variant={short ? "ghost" : "secondary"} glyph={String(index + 1)} onClick={() => ctx.game.commands.run(`build${index + 1}`, {})}>
                {structure.label} <span style={{ opacity: 0.65, marginLeft: 4, fontSize: "0.85em" }}>{cost}</span>
              </KitButton>
            );
          })}
          {camp.building.map((order) => (
            <KitMeter key={order.id} label={order.label} value={order.progress} max={1} size="sm" style={{ width: 96 }} />
          ))}
        </div>
      </KitPanel>
    </div>
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
        else void newGame(ctx);
      }}
    />
  );
}

/** Everything on screen while playing: four small panels at the edges, the end card over them. */
export function Hud(): ReactNode {
  return <HudFrame slots={{ topLeft: <Vitals />, top: <WaveClock />, topRight: <Stockpile />, bottom: <BuildBar /> }} overlay={<Ending />} />;
}
