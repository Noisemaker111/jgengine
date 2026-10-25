import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitObjective, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { newGame } from "../flow";
import { idea } from "../idea";
import { holdView } from "../view";
import { Count, Counts, HudFrame, PANEL_WIDTH } from "./HudFrame";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
const useHold = () => useGameStore(holdView, same);
const coin = idea.coin.label.toLowerCase();

function Hold(): ReactNode {
  const hold = useHold();
  const beat = idea.beats.find((entry) => entry.id === hold.mission?.missionId) ?? null;
  return (
    <div style={{ width: PANEL_WIDTH, pointerEvents: "none" }}>
      <KitPanel variant="hud" eyebrow={idea.name} title={idea.core.label}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Counts>
            <Count id="lives" value={hold.lives} label="lives" />
            <Count id="coin" value={hold.coin} label={coin} />
            <Count id="kills" value={hold.kills} label="kills" />
          </Counts>
          <KitMeter size="sm" label="Lives" value={hold.lives} max={idea.core.lives} tone={hold.lives <= idea.core.lives / 4 ? "bad" : "good"} readout />
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

/** The wave readout and the button that sends the next one. */
function Waves(): ReactNode {
  const ctx = useGameContext();
  const hold = useHold();
  const next = Math.min(hold.wave + 1, idea.waves);
  return (
    <div style={{ width: PANEL_WIDTH }}>
      <KitPanel variant="hud" eyebrow={`${idea.wave} ${Math.max(1, hold.wave)} of ${idea.waves}`} title={hold.raiding ? `${hold.marching} ${idea.foe.toLowerCase()} on the field` : `${idea.wave} ${next} in ${hold.calm}s`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hold.raiding ? (
            <KitMeter size="sm" label="Marched" value={hold.progress.emitted} max={Math.max(1, hold.progress.total)} tone="bad" readout />
          ) : (
            <KitButton size="sm" variant="primary" glyph="N" data-call-wave="" onClick={() => ctx.game.commands.run("callWave", {})}>
              Send now <span style={{ opacity: 0.7, marginLeft: 4 }}>+{Math.floor(hold.calm / 2)} {coin}</span>
            </KitButton>
          )}
        </div>
      </KitPanel>
    </div>
  );
}

function Hint(): ReactNode {
  const hold = useHold();
  const tower = idea.towers.find((entry) => entry.id === hold.armed) ?? null;
  return (
    <div style={{ pointerEvents: "none" }}>
      {tower === null ? null : (
        <KitPanel variant="strip" tone="accent">
          <span style={{ fontWeight: 700, letterSpacing: "0.06em", fontSize: 13 }}>Building {tower.label} - click near an empty pad, right click to stop</span>
        </KitPanel>
      )}
      <KitBanner cue={hold.raiding ? hold.wave : null} title={`${idea.wave} ${hold.wave}`} subtitle={`${idea.foe} on the lanes`} tone="bad" />
    </div>
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const hold = useHold();
  return (
    <KitPanel variant="strip">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center", maxWidth: 1000 }}>
        {idea.towers.map((tower, index) => {
          const open = hold.unlocked[index]?.open ?? true;
          const short = hold.coin < tower.cost;
          return (
            <KitButton
              key={tower.id}
              data-build={tower.id}
              size="sm"
              variant={hold.armed === tower.id ? "primary" : short || !open ? "ghost" : "secondary"}
              pressed={hold.armed === tower.id}
              glyph={index < 9 ? String(index + 1) : undefined}
              title={tower.blurb}
              onClick={() => ctx.game.commands.run(`build${index + 1}`, {})}
            >
              {tower.label}
              <span style={{ opacity: 0.65, marginLeft: 4, fontSize: "0.85em" }}>{open ? `${tower.cost} ${coin}` : `${idea.wave.toLowerCase()} ${tower.from}`}</span>
            </KitButton>
          );
        })}
      </div>
    </KitPanel>
  );
}

function Selected(): ReactNode {
  const ctx = useGameContext();
  const hold = useHold();
  const picked = hold.selected;
  if (picked === null) return null;
  return (
    <div style={{ width: PANEL_WIDTH }}>
      <KitPanel variant="hud" eyebrow={picked.ready ? `Level ${picked.level}` : "Being built"} title={picked.label}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          <span style={{ opacity: 0.85 }}>
            {picked.stats.damage} damage, {picked.word.rate} shots/s, {picked.stats.range} m reach
            {picked.word.splash > 0 ? `, hits all within ${picked.word.splash} m` : ""}
            {picked.word.slow < 1 ? `, slows to ${Math.round(picked.word.slow * 100)}%` : ""}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {picked.upgrade === null ? null : (
              <KitButton size="sm" glyph="U" data-upgrade="" onClick={() => ctx.game.commands.run("upgrade", {})}>
                Upgrade <span style={{ opacity: 0.65, marginLeft: 4 }}>{picked.upgrade} {coin}</span>
              </KitButton>
            )}
            <KitButton size="sm" variant="ghost" glyph="X" onClick={() => ctx.game.commands.run("sell", {})}>
              Sell <span style={{ opacity: 0.65, marginLeft: 4 }}>+{picked.refund}</span>
            </KitButton>
          </div>
        </div>
      </KitPanel>
    </div>
  );
}

function Ending(): ReactNode {
  const ctx = useGameContext();
  const hold = useHold();
  return (
    <KitResultScreen
      open={hold.won || hold.lost}
      tone={hold.won ? "good" : "bad"}
      eyebrow={hold.won ? "Victory" : "Defeat"}
      title={hold.won ? `${idea.core.label} holds` : `${idea.core.label} has fallen`}
      summary={hold.won ? `All ${idea.waves} ${idea.wave.toLowerCase()}s held.` : `Overrun on ${idea.wave.toLowerCase()} ${hold.wave}.`}
      stats={[
        { label: `${idea.wave}s held`, value: hold.cleared },
        { label: "Kills", value: hold.kills },
        { label: "Lives left", value: hold.lives },
      ]}
      actions={[{ id: "again", label: hold.won ? "Play again" : "Try again", primary: true }]}
      onAction={() => void newGame(ctx)}
    />
  );
}

/** Everything on screen while playing: a few small panels at the edges, the end card over them. */
export function Hud(): ReactNode {
  return <HudFrame slots={{ topLeft: <Hold />, top: <Hint />, topRight: <Waves />, bottom: <BuildBar />, bottomRight: <Selected /> }} overlay={<Ending />} />;
}
