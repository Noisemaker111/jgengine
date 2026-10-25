import type { ReactNode } from "react";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { SkillCheckBar } from "@jgengine/react/components";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitObjective } from "@jgengine/react/kitFlow";
import { KitActionPrompt, KitButton, KitPanel } from "@jgengine/react/uiKitRoot";

import { idea } from "../idea";
import { farmView, prompts } from "../prompts";
import { Count, Counts, HudFrame, PANEL_WIDTH } from "./HudFrame";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

function useFarm() {
  return useGameStore(farmView, same);
}

const pad = (value: number) => String(value).padStart(2, "0");

function Day(): ReactNode {
  const farm = useFarm();
  const beatIndex = idea.beats.findIndex((entry) => entry.id === farm.mission?.missionId);
  const beat = beatIndex < 0 ? null : idea.beats[beatIndex]!;
  const giver = beatIndex < 0 ? null : idea.villagers[beatIndex % idea.villagers.length]!;
  const night = farm.hour >= 19 || farm.hour < 6;
  return (
    <div style={{ width: PANEL_WIDTH, pointerEvents: "none" }}>
      <KitPanel variant="hud" eyebrow={idea.name}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span data-clock="" style={{ fontWeight: 800, fontSize: 15, letterSpacing: "0.04em" }}>
            Day {farm.day} - {pad(farm.hour)}:{pad(farm.minute)}
          </span>
          <Count id="coins" value={farm.coins} label={idea.currency.label} />
        </div>
        {night ? <div style={{ marginTop: 4, fontSize: 11, opacity: 0.75 }}>Late - sleep at the {idea.home.label.toLowerCase()} to wake at dawn</div> : null}
      </KitPanel>
      {beat === null ? null : (
        <div style={{ marginTop: 8 }}>
          <KitObjective eyebrow={giver === null ? idea.guide.name : `${giver.name} asks`} title={beat.title} steps={[{ id: beat.id, label: beat.goal }]} progressKey={beat.id} />
        </div>
      )}
    </div>
  );
}

function Basket(): ReactNode {
  const farm = useFarm();
  return (
    <div style={{ pointerEvents: "none" }}>
      <KitPanel variant="strip">
        {farm.bag.count === 0 ? (
          <span style={{ opacity: 0.7, fontSize: 12 }}>Basket empty</span>
        ) : (
          <Counts>
            {farm.bag.held.map((entry) => (
              <Count key={entry.id} id={entry.id} value={entry.count} label={entry.label} />
            ))}
          </Counts>
        )}
      </KitPanel>
    </div>
  );
}

function usePrompt(): { text: string; key: boolean } | null {
  return useGameStore((ctx) => {
    const me = ctx.scene.entity.get(ctx.player.userId);
    if (me === null) return null;
    const hit = resolveActivePrompt({ x: me.position[0], z: me.position[2] }, prompts(ctx));
    if (hit === null) return null;
    const display = hit.prompt.display;
    if (display.kind === "keybind") return { text: display.label ?? "", key: true };
    if (display.kind === "label") return { text: display.text, key: false };
    return null;
  }, same);
}

function SeedBar(): ReactNode {
  const ctx = useGameContext();
  const farm = useFarm();
  const active = usePrompt();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {active === null ? null : active.key ? (
        <KitActionPrompt action="interact" label={active.text} fallbackGlyph="E" />
      ) : (
        <KitPanel variant="strip">
          <span style={{ fontSize: 12, opacity: 0.85 }}>{active.text}</span>
        </KitPanel>
      )}
      {farm.atMarket ? null : (
        <KitPanel variant="strip">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {idea.crops.slice(0, 6).map((crop, index) =>
              farm.owned[index] ? (
                <KitButton key={crop.id} data-seed={crop.id} size="sm" variant={farm.seed === crop.id ? "primary" : "ghost"} glyph={String(index + 1)} onClick={() => ctx.game.commands.run(`digit${index + 1}`, {})}>
                  {crop.label} <span style={{ opacity: 0.65, marginLeft: 4, fontSize: "0.85em" }}>{crop.seed}</span>
                </KitButton>
              ) : null,
            )}
            <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 4 }}>
              {farm.planted}/{farm.plots} planted
            </span>
          </div>
        </KitPanel>
      )}
    </div>
  );
}

function Store(): ReactNode {
  const ctx = useGameContext();
  const farm = useFarm();
  if (!farm.atMarket) return null;
  return (
    <div style={{ width: PANEL_WIDTH }}>
      <KitPanel variant="hud" eyebrow={`${idea.market.label} - ${farm.marketOpen ? "open" : `opens ${idea.market.opens}:00`}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {farm.offers.slice(0, 6).map((offer, index) => (
            <div key={offer.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <KitButton data-offer={offer.id} size="sm" variant={farm.coins >= offer.price && farm.marketOpen ? "secondary" : "ghost"} glyph={String(index + 1)} onClick={() => ctx.game.commands.run(`digit${index + 1}`, {})}>
                {offer.label} - {offer.price}
              </KitButton>
              <span style={{ opacity: 0.65, fontSize: 11, paddingLeft: 4 }}>{offer.does}</span>
            </div>
          ))}
        </div>
      </KitPanel>
    </div>
  );
}

function Fishing(): ReactNode {
  const farm = useFarm();
  const fishing = farm.fishing;
  if (fishing.landed !== null) {
    return (
      <div style={{ position: "absolute", left: "50%", top: "30%", transform: "translateX(-50%)", pointerEvents: "none" }}>
        <KitPanel variant="strip" tone="good">
          <span style={{ fontWeight: 800, fontSize: 15 }}>{fishing.landed}!</span>
        </KitPanel>
      </div>
    );
  }
  if (fishing.phase === "idle") return null;
  return (
    <div style={{ position: "absolute", left: "50%", top: "30%", transform: "translateX(-50%)", pointerEvents: "none", width: 300 }}>
      <KitPanel variant="strip" tone={fishing.phase === "bite" ? "accent" : "neutral"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
          <span style={{ fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 12, textAlign: "center" }}>{fishing.phase === "bite" ? "Bite! E in the green" : "Waiting for a bite..."}</span>
          {fishing.check === null ? null : (
            <SkillCheckBar
              config={fishing.check}
              startedAt={fishing.biteAt}
              trackClassName="h-3 w-full overflow-hidden rounded-full bg-black/55"
              zoneClassName="bg-emerald-400/90"
              markerClassName="w-1 rounded bg-white"
            />
          )}
        </div>
      </KitPanel>
    </div>
  );
}

function Festival(): ReactNode {
  const farm = useFarm();
  return <KitBanner cue={farm.festival ? 1 : null} title={`The ${idea.name} festival`} subtitle="The village thanks you. Keep growing." tone="good" />;
}

/** Everything on screen while playing: the day and request, the basket, the seed bar, the store at the market. */
export function Hud(): ReactNode {
  return (
    <HudFrame
      slots={{ topLeft: <Day />, topRight: <Basket />, right: <Store />, bottom: <SeedBar /> }}
      overlay={
        <>
          <Fishing />
          <Festival />
        </>
      }
    />
  );
}
