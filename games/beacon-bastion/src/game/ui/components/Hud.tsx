import { useGame, useGameStore } from "@jgengine/react/hooks";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { summarizeWave } from "@jgengine/core/ai/director/wavePreview";

import { abilityDef } from "../../combat/abilities";
import { creepTraits } from "../../entities/enemies/catalog";
import { keybinds } from "../../keybinds";
import { FLANK_POINT_KEY } from "../../world/path";
import { HudFade } from "@jgengine/react/hudFade";

import { keep } from "../../keep";
import { TOTAL_WAVES } from "../../waves/manifest";
import { activeCreepCount, currentWaveNumber, session } from "../../session";
import { canSendWave, waveOverlapBonus } from "../../waves/director";
import { bountyScale } from "../../waves/bounty";
import { carriedRelic, legacy, relicBountyScale } from "../../waves/legacy";
import { bossLine, tierLabel, wavePreviewLine, waveStatusLine } from "../../waves/status";
import { Brazier } from "../kit/Brazier";

/**
 * The keep's own signage, top-left: the beacon brazier burns as high as the keep has lives, and
 * the purse hangs beside it on a timber sign. Both step back when nothing changes and hold at full
 * strength once the keep is in danger.
 */
export function KeepSigns() {
  const lives = useGameStore((ctx) => keep.of(ctx).num("keep.lives"));
  const livesMax = useGameStore((ctx) => keep.of(ctx).num("keep.lives_max"));
  const gold = useGameStore((ctx) => keep.of(ctx).num("keep.gold"));
  const wave = useGameStore(() => currentWaveNumber());
  const account = useGameStore((ctx) => legacy.read(ctx));
  const relic = carriedRelic(account);
  const pay = bountyScale(Math.min(wave, TOTAL_WAVES), relicBountyScale(account));
  const ratio = livesMax > 0 ? lives / livesMax : 0;
  const danger = ratio <= 0.3;

  return (
    <div className="bb-signs">
      <HudFade watch={[lives]} hold={danger} dimTo={0.45} idleMs={4000}>
        <div className="bb-beacon" data-danger={danger ? "" : undefined} aria-label={`Keep lives ${lives} of ${livesMax}`}>
          <Brazier size={46} strength={0.15 + ratio * 0.85} />
          <GameFrame material="stone" cut="chamfer" depth={8} padding="4px 12px 5px" className="bb-plinth">
            <span className="bb-plinth-num">{lives}</span>
            <span className="bb-plinth-max">/{livesMax}</span>
          </GameFrame>
        </div>
      </HudFade>
      <HudFade watch={[gold, pay]} dimTo={0.45} idleMs={4000}>
        <div className="bb-purse">
          <span className="bb-chains" aria-hidden />
          <GameFrame material="wood" cut="notch" depth={8} padding="5px 14px 6px 10px" className="bb-purse-sign" aria-label={`${gold} gold`}>
            <GameIcon name="coin" size={20} color="#f6cf5a" />
            <span className="bb-purse-num">{gold}</span>
          </GameFrame>
          <span className="bb-pay" title="Kill pay this wave">
            ×{pay.toFixed(2)} bounty
          </span>
          {relic === null ? null : (
            <span className="bb-relic" title={relic.detail}>
              <GameIcon name="amulet" size={13} /> {relic.label}
            </span>
          )}
        </div>
      </HudFade>
    </div>
  );
}

/**
 * The wave count cut into a timber board at the top edge, with one short line under it saying what
 * the road is doing. A boss on the field hangs a red pennant under the board and holds it lit.
 */
export function WaveBoard() {
  const started = useGameStore((ctx) => keep.of(ctx).fact("keep.wave_started") === true);
  const wave = useGameStore(() => currentWaveNumber());
  const remaining = useGameStore(() => activeCreepCount());
  const releasing = useGameStore((ctx) => keep.of(ctx).fact("keep.wave_ready") !== true && !session.encounter.view().done);
  const boss = useGameStore(() => session.boss);
  const shown = Math.min(wave, TOTAL_WAVES);
  const status = waveStatusLine({ started, releasing, wave: shown, alive: remaining });
  const bossText = bossLine(boss);

  return (
    <HudFade watch={[shown, remaining, started, releasing]} hold={bossText !== null} dimTo={0.4} idleMs={5000}>
      <div className="bb-waveboard">
        <GameFrame material="wood" cut="banner" depth={12} padding="6px 22px 16px" className="bb-board">
          <span className="bb-board-label">Wave</span>
          <span className="bb-board-num">
            {shown}
            <small>/{TOTAL_WAVES}</small>
          </span>
        </GameFrame>
        <span className="bb-road">{status}</span>
        {bossText === null ? null : (
          <GameFrame material="enamel" tint="#7d1d12" edge="#2a0804" cut="banner" depth={8} padding="4px 14px 10px" className="bb-pennant">
            <GameIcon name="skull" size={14} /> {bossText}
          </GameFrame>
        )}
      </div>
    </HudFade>
  );
}

const TRAIT_ICON: Record<string, { icon: GameIconName; label: string }> = {
  flying: { icon: "wing", label: "Flyers: cannons can't reach them" },
  armored: { icon: "helmet", label: "Heavy armor: pierce it or crack it" },
  warded: { icon: "eye", label: "Warded: arcane and frost hit soft" },
  bone: { icon: "skull", label: "Bone: blast shatters it, arrows glance" },
  shielded: { icon: "shield", label: "Shield-bearers: their ward regrows" },
  healer: { icon: "heart", label: "Shamans mend the raiders near them" },
  splits: { icon: "swap", label: "Hulks break into bonelings" },
};

/**
 * The war horn: when the director has the next assault ready, who is coming and what about them
 * matters (flyers, armor, shields, healers, a flank), the clock until they march on their own, and
 * the button that calls them early for gold.
 */
export function ReleaseHorn() {
  const { commands } = useGame();
  const done = useGameStore(() => session.encounter.view().done);
  const ready = useGameStore((ctx) => canSendWave(ctx));
  const started = useGameStore((ctx) => keep.of(ctx).fact("keep.wave_started") === true);
  const bonus = useGameStore((ctx) => waveOverlapBonus(ctx));
  const wave = useGameStore(() => currentWaveNumber());
  const tier = useGameStore(() => session.pressure.tier);
  const clock = useGameStore(() => {
    const view = session.countdown.view();
    return view.armed ? { left: Math.ceil(view.remaining), share: 1 - view.elapsed } : null;
  });
  const nextIndex = started ? wave : 0;
  const next = useGameStore(() => session.encounter.waveAt(nextIndex));
  const preview = wavePreviewLine(next, nextIndex + 1);
  if (!ready || done) return null;
  const summary = next === null ? null : summarizeWave(next, { traitsOf: creepTraits });
  const flank = summary?.entries.includes(FLANK_POINT_KEY) === true;
  const traits = summary === null ? [] : Object.keys(summary.traits);

  return (
    <div className="bb-horn">
      <GameFrame material="paper" cut="torn" depth={8} padding="8px 12px 14px" className="bb-orders">
        <span className="bb-orders-line">{preview.replace(/^Next · /, "")}</span>
        {traits.length === 0 && !flank ? null : (
          <span className="bb-traits" data-jg="wave-traits">
            {traits.map((trait) => {
              const mark = TRAIT_ICON[trait];
              return mark === undefined ? null : (
                <span key={trait} className="bb-trait" title={mark.label} aria-label={mark.label}>
                  <GameIcon name={mark.icon} size={14} />
                </span>
              );
            })}
            {flank ? (
              <span className="bb-trait bb-trait-flank" title="Some come by the east flank road">
                <GameIcon name="arrowLeft" size={14} /> Flank
              </span>
            ) : null}
          </span>
        )}
        <span className="bb-orders-sub">
          {started ? `Director ${tierLabel(tier)}` : "Build on the rings, then sound the horn"}
        </span>
      </GameFrame>
      <GameFrame
        as="button"
        material="enamel"
        tint="#8a2414"
        edge="#2a0804"
        cut="hex"
        depth={14}
        padding="11px 26px"
        glow="rgba(255,140,50,0.5)"
        className="bb-sound"
        cue="confirm"
        data-jg="send-wave"
        onClick={() => commands.run("wave.send", {})}
      >
        <GameIcon name="flag" size={18} />
        <span>{started ? `Send wave ${wave + 1}` : "Begin first assault"}</span>
        {bonus > 0 ? <small>+{bonus} gold</small> : null}
      </GameFrame>
      {clock === null ? null : (
        <span className="bb-clock" aria-label={`Marches in ${clock.left} seconds`} style={{ ["--bb-clock" as string]: `${Math.round(clock.share * 360)}deg` }}>
          <GameIcon name="hourglass" size={13} />
          <b>{clock.left}</b>
        </span>
      )}
    </div>
  );
}

/**
 * The beacon's two rites as carved keystones along the right of the build rack: each shows its key,
 * goes dark while it recovers, and fills back up like a rising flame. Beacon Fire arms and waits for
 * a click on the road.
 */
export function AbilityStones() {
  const { commands } = useGame();
  const armed = useGameStore(() => session.armedAbility);
  const slots = useGameStore(() => session.abilities.snapshot().map((slot) => ({ id: slot.id, ready: slot.ready, fraction: slot.cooldownFraction, left: Math.ceil(slot.cooldownRemainingMs / 1000) })));
  return (
    <div className="bb-rites" data-jg="abilities">
      {slots.map((slot) => {
        const def = abilityDef(slot.id);
        if (def === null) return null;
        const key = actionLabel(keybinds, def.action);
        return (
          <GameFrame
            key={slot.id}
            as="button"
            material="stone"
            tint={def.tint}
            cut="hex"
            depth={10}
            padding="8px 10px"
            className="bb-rite"
            data-jg={`ability-${slot.id}`}
            data-armed={armed === slot.id ? "" : undefined}
            data-dim={slot.ready ? undefined : ""}
            title={def.detail}
            cue={slot.ready ? "confirm" : undefined}
            onClick={() => commands.run(`ability.${slot.id}`, {})}
          >
            <span className="bb-rite-fill" style={{ height: `${Math.round((1 - slot.fraction) * 100)}%` }} aria-hidden />
            <GameIcon name={def.icon} size={22} />
            <span className="bb-rite-name">{slot.ready ? def.label : `${slot.left}s`}</span>
            {key === null ? null : <kbd>{key}</kbd>}
          </GameFrame>
        );
      })}
    </div>
  );
}
