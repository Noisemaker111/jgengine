import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitCount, KitCounts, KitVitals } from "@jgengine/core/hud/kitHud.view";
import { HudSlots } from "@jgengine/shell/gameKit";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { continueGame } from "@jgengine/core/game/gameFlow";
import { startNewGame } from "@jgengine/react/menu/gameFlowMenus";
import { gunView } from "../guns";
import { idea } from "../idea";
import { opsView } from "../play";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

function useOps() {
  return useGameStore(opsView, same);
}

function useGun() {
  return useGameStore(gunView, same);
}

function useHealth(): { current: number; max: number } {
  return useGameStore((ctx) => {
    const stat = ctx.scene.entity.stats.get(ctx.player.userId, "health");
    return stat === null ? { current: 0, max: 1 } : { current: Math.round(stat.current), max: stat.max };
  }, same);
}

function Vitals(): ReactNode {
  const ops = useOps();
  const health = useHealth();
  const beat = idea.beats.find((entry) => entry.id === ops.mission?.missionId) ?? null;
  return (
    <KitVitals
      eyebrow={idea.name}
      vitals={[{ label: idea.hero.label, value: health.current, max: health.max, lowAt: 0.35 }]}
      objective={beat === null ? null : { id: beat.id, label: idea.guide.name, title: beat.title, goal: beat.goal }}
    />
  );
}

function Wallet(): ReactNode {
  const ops = useOps();
  return (
    <KitPanel variant="strip">
      <KitCounts>
        <KitCount id="cash" value={ops.cash} label={idea.currency.label} />
        <KitCount id="kills" value={ops.kills} label="kills" />
      </KitCounts>
    </KitPanel>
  );
}

/** Which outposts still stand, and how many guards hold the one you are fighting. */
function Front(): ReactNode {
  const ops = useOps();
  const fighting = ops.outposts.find((outpost) => !outpost.clear && outpost.left < outpost.of) ?? null;
  return (
    <div style={{ pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <KitPanel variant="strip" tone={fighting === null ? "neutral" : "bad"}>
        <span data-front="" style={{ fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 13 }}>
          {ops.cleared}/{ops.outposts.length} outposts cleared
        </span>
        {fighting === null ? null : <span style={{ marginLeft: 10, opacity: 0.8, fontSize: 11 }}>{fighting.label}: {fighting.left} left</span>}
      </KitPanel>
      <KitBanner cue={ops.cleared > 0 ? ops.cleared : null} title="Outpost cleared" subtitle={`${idea.outposts.length - ops.cleared} to go`} tone="good" />
    </div>
  );
}

function Loadout(): ReactNode {
  const ctx = useGameContext();
  const gun = useGun();
  const ops = useOps();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <KitPanel variant="hud" eyebrow={gun.label}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
          <span data-ammo="" style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{gun.loaded}</span>
          <span style={{ opacity: 0.6 }}>/ {gun.capacity}</span>
        </div>
        {gun.reloading ? <KitMeter size="sm" label="Reloading" value={gun.reload} max={1} /> : null}
      </KitPanel>
      <KitPanel variant="strip">
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {gun.guns.map((entry, index) => (
            <KitButton
              key={entry.id}
              data-gun={entry.id}
              size="sm"
              variant={entry.held ? "primary" : entry.owned || ops.cash >= entry.price ? "secondary" : "ghost"}
              glyph={String(index + 1)}
              onClick={() => ctx.game.commands.run(`gun${index + 1}`, {})}
            >
              {entry.label}
              {entry.owned ? null : <span style={{ opacity: 0.65, marginLeft: 4, fontSize: "0.85em" }}>{entry.price}</span>}
            </KitButton>
          ))}
          {ops.upgrades.map((upgrade, index) => {
            const top = upgrade.stage > upgrade.stages;
            return (
              <KitButton
                key={upgrade.id}
                data-upgrade={upgrade.id}
                size="sm"
                variant={top || ops.cash < upgrade.price * upgrade.stage ? "ghost" : "secondary"}
                glyph={String(idea.guns.length + index + 1)}
                onClick={() => ctx.game.commands.run(`upgrade${index + 1}`, {})}
              >
                {upgrade.label} {upgrade.stage}
                {top ? null : <span style={{ opacity: 0.65, marginLeft: 4, fontSize: "0.85em" }}>{upgrade.price * upgrade.stage}</span>}
              </KitButton>
            );
          })}
        </div>
      </KitPanel>
    </div>
  );
}

function Ending(): ReactNode {
  const ctx = useGameContext();
  const ops = useOps();
  return (
    <KitResultScreen
      open={ops.down}
      tone="bad"
      eyebrow={idea.foe}
      title="You went down"
      summary={`${ops.cleared} of ${idea.outposts.length} outposts cleared.`}
      stats={[
        { label: "Kills", value: ops.kills },
        { label: idea.currency.label, value: ops.cash },
      ]}
      actions={[
        { id: "retry", label: "Back to the last save", primary: true },
        { id: "new", label: "New game" },
      ]}
      onAction={(id) => {
        if (id === "retry") void continueGame(ctx).then((loaded) => (loaded ? undefined : startNewGame(ctx)));
        else void startNewGame(ctx);
      }}
    />
  );
}

/** Everything on screen while playing: small panels at the edges, the crosshair alone in the middle. */
export function Hud(): ReactNode {
  return <HudSlots storageKey={idea.id} slots={{ topLeft: <Vitals />, top: <Front />, topRight: <Wallet />, bottomRight: <Loadout /> }} overlay={<Ending />} />;
}
