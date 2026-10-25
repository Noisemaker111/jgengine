import { useState, type ReactNode } from "react";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { useGameStore } from "@jgengine/react/hooks";
import { Compass } from "@jgengine/react/map";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitObjective, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitActionPrompt, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { newGame, openTitle } from "../flow";
import { idea } from "../idea";
import { journeyView } from "../journey";
import { prompts } from "../prompts";
import { Count, Counts, HudFrame, PANEL_WIDTH } from "./HudFrame";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

const ABILITY_NAMES: Record<string, string> = { glide: "Glide", doubleJump: "Double jump", stamina: "Deep stamina" };

function useJourney() {
  return useGameStore(journeyView, same);
}

function useHealth(id: string): { current: number; max: number } {
  return useGameStore((ctx) => {
    const stat = ctx.scene.entity.stats.get(id, "health");
    return stat === null ? { current: 0, max: 1 } : { current: Math.round(stat.current), max: stat.max };
  }, same);
}

function Vitals(): ReactNode {
  const ctx = useGameContext();
  const view = useJourney();
  const hero = useHealth(ctx.player.userId);
  const beat = idea.beats.find((entry) => entry.id === view.mission?.missionId) ?? null;
  return (
    <div style={{ width: PANEL_WIDTH, pointerEvents: "none" }}>
      <KitPanel variant="hud" eyebrow={idea.name}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <KitMeter size="sm" label={idea.hero.label} value={hero.current} max={hero.max} tone={hero.current < hero.max * 0.35 ? "bad" : "good"} readout />
          <KitMeter size="sm" label={view.winded ? "Winded" : "Stamina"} value={view.stamina} max={view.staminaMax} tone={view.winded ? "bad" : "accent"} readout />
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

function Heading(): ReactNode {
  const view = useJourney();
  const markers = [
    ...view.discovered.filter((place) => place.id !== view.next?.id).map((place) => ({ id: place.id, position: [place.x, 0, place.z] as const, kind: "location", label: place.label })),
    ...(view.next === null ? [] : [{ id: `next-${view.next.id}`, position: [view.next.x, 0, view.next.z] as const, kind: "objective", label: view.next.label }]),
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, pointerEvents: "none" }}>
      <Compass facingYaw={view.facing} center={view.at ?? undefined} markers={markers} width={420} />
      {view.next === null ? null : (
        <KitPanel variant="strip">
          <span data-next="" style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>
            {view.next.label}
          </span>
          {view.distance === null ? null : <span style={{ marginLeft: 8, opacity: 0.75, fontSize: 12 }}>{view.distance} m</span>}
        </KitPanel>
      )}
      <KitBanner cue={view.found > 0 ? view.found : null} title={view.discovered.at(-1)?.label ?? ""} subtitle="Discovered - open for fast travel" tone="good" />
    </div>
  );
}

function Satchel(): ReactNode {
  const view = useJourney();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, pointerEvents: "none" }}>
      <KitPanel variant="strip">
        <Counts>
          <Count id="relics" value={`${view.relics}/${view.needed}`} label="relics" />
          <Count id="found" value={`${view.found}/${view.total}`} label="places" />
        </Counts>
      </KitPanel>
      {view.abilities.length === 0 ? null : (
        <KitPanel variant="strip">
          <span style={{ fontSize: 12, opacity: 0.85 }}>{view.abilities.map((ability) => ABILITY_NAMES[ability] ?? ability).join(" · ")}</span>
          {view.gliding ? <span style={{ marginLeft: 8, fontWeight: 800, fontSize: 12 }}>GLIDING</span> : null}
        </KitPanel>
      )}
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

function Actions(): ReactNode {
  const view = useJourney();
  const active = usePrompt();
  const travel = view.travelTo.length > 1 ? `T - fast travel (${view.travelTo.length} places)` : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
      {active === null ? null : <KitActionPrompt action="interact" label={active} fallbackGlyph="E" />}
      {travel === null ? null : (
        <KitPanel variant="strip">
          <span style={{ fontSize: 12, opacity: 0.8 }}>{travel}</span>
        </KitPanel>
      )}
    </div>
  );
}

function Ending(): ReactNode {
  const ctx = useGameContext();
  const view = useJourney();
  const [walking, setWalking] = useState(false);
  return (
    <KitResultScreen
      open={view.won && !walking}
      tone="good"
      eyebrow={idea.name}
      title={idea.goal.done}
      summary={`You found ${view.found} of ${view.total} places and carried every relic home.`}
      stats={[
        { label: "Places found", value: `${view.found}/${view.total}` },
        { label: "Relics", value: `${view.relics}/${view.needed}` },
      ]}
      actions={[
        { id: "walk", label: "Keep walking", primary: true },
        { id: "new", label: "New journey" },
        { id: "title", label: "Title screen" },
      ]}
      onAction={(id) => {
        if (id === "walk") setWalking(true);
        else if (id === "new") void newGame(ctx);
        else if (id === "title") openTitle(ctx);
      }}
    />
  );
}

/** Everything on screen while walking: vitals, the compass and the next place, what you carry, what E does. */
export function Hud(): ReactNode {
  return <HudFrame slots={{ topLeft: <Vitals />, top: <Heading />, topRight: <Satchel />, bottom: <Actions /> }} overlay={<Ending />} />;
}
