import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { HUD_CORNER_WIDTH } from "@jgengine/react/hudLayout";
import { KitResultScreen } from "@jgengine/react/kitFlow";
import { KitActionBar, KitCount, KitCounts, KitHint, KitVitals } from "@jgengine/react/kitHud";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";
import { HudSlots } from "@jgengine/shell/gameKit";

import { newGame } from "../flow";
import { idea } from "../idea";
import { holdView } from "../view";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
const useHold = () => useGameStore(holdView, same);
const coin = idea.coin.label.toLowerCase();

function Hold(): ReactNode {
  const hold = useHold();
  const beat = idea.beats.find((entry) => entry.id === hold.mission?.missionId) ?? null;
  return (
    <KitVitals
      eyebrow={idea.name}
      title={idea.core.label}
      vitals={[{ label: "Lives", value: hold.lives, max: idea.core.lives, tone: hold.lives <= idea.core.lives / 4 ? "bad" : "good" }]}
      objective={beat === null ? null : { id: beat.id, label: idea.guide.name, title: beat.title, goal: beat.goal }}
    >
      <KitCounts>
        <KitCount id="lives" value={hold.lives} label="lives" />
        <KitCount id="coin" value={hold.coin} label={coin} />
        <KitCount id="kills" value={hold.kills} label="kills" />
      </KitCounts>
    </KitVitals>
  );
}

/** The wave readout and the button that sends the next one. */
function Waves(): ReactNode {
  const ctx = useGameContext();
  const hold = useHold();
  const next = Math.min(hold.wave + 1, idea.waves);
  return (
    <div style={{ width: HUD_CORNER_WIDTH }}>
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
    <KitHint
      text={tower === null ? null : `Building ${tower.label} - click near an empty pad, right click to stop`}
      banner={{ cue: hold.raiding ? hold.wave : null, title: `${idea.wave} ${hold.wave}`, subtitle: `${idea.foe} on the lanes`, tone: "bad" }}
    />
  );
}

function BuildBar(): ReactNode {
  const ctx = useGameContext();
  const hold = useHold();
  return (
    <KitActionBar
      kind="build"
      wrapAt={1000}
      actions={idea.towers.map((tower, index) => {
        const open = hold.unlocked[index]?.open ?? true;
        const short = hold.coin < tower.cost;
        return {
          id: tower.id,
          label: tower.label,
          detail: open ? `${tower.cost} ${coin}` : `${idea.wave.toLowerCase()} ${tower.from}`,
          glyph: index < 9 ? String(index + 1) : undefined,
          variant: hold.armed === tower.id ? "primary" : short || !open ? "ghost" : "secondary",
          pressed: hold.armed === tower.id,
          title: tower.blurb,
          onActivate: () => ctx.game.commands.run(`build${index + 1}`, {}),
        };
      })}
    />
  );
}

function Selected(): ReactNode {
  const ctx = useGameContext();
  const hold = useHold();
  const picked = hold.selected;
  if (picked === null) return null;
  return (
    <div style={{ width: HUD_CORNER_WIDTH }}>
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
  return <HudSlots storageKey={idea.id} slots={{ topLeft: <Hold />, top: <Hint />, topRight: <Waves />, bottom: <BuildBar />, bottomRight: <Selected /> }} overlay={<Ending />} />;
}
