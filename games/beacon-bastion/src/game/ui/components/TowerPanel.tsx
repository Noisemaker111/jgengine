import { useGame, useGameStore } from "@jgengine/react/hooks";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";

import { editorLayers } from "../../../editorLayers";
import type { DamageType } from "../../combat/damage";
import { towerDef } from "../../entities/towers/catalog";
import { TOWER_LADDERS } from "../../entities/towers/ladders";
import { keep, MAX_TOWER_LEVEL, sellAction, sellValue, towerOptions, towerStats } from "../../keep";
import { keybinds } from "../../keybinds";
import { session } from "../../session";

const AIM_LABEL: Record<string, string> = { first: "First", last: "Last", strongest: "Strongest", nearest: "Nearest" };
const TYPE_ICON: Record<DamageType, GameIconName> = { pierce: "arrow", blast: "bomb", frost: "frost", arcane: "lightning" };
const TYPE_LABEL: Record<DamageType, string> = { pierce: "Pierce", blast: "Blast", frost: "Frost", arcane: "Arcane" };

/**
 * The inspected tower's mason's tablet, read from the keep's world: its rank as carved pips, the path
 * it took, its numbers beside their glyphs, the aim it holds, and the next step on its ladder — one
 * plank for a shared rank, two branch cards at the fork.
 */
export function TowerPanel() {
  const { commands } = useGame();
  const inspectedId = useGameStore(() => session.inspectedTowerId);
  const view = useGameStore((ctx) => {
    if (inspectedId === null) return null;
    const world = keep.of(ctx);
    const tower = world.instance(inspectedId);
    if (tower === null) return null;
    const order = world.orders("build").find((entry) => entry.target === tower.id);
    const stats = towerStats(world, tower.id);
    const branch = TOWER_LADDERS[tower.kind]?.branches?.find((entry) => entry.id === stats.branch) ?? null;
    return {
      tower,
      def: towerDef(tower.kind, editorLayers),
      stats,
      branchLabel: branch?.label ?? null,
      progress: order?.progress ?? 1,
      options: towerOptions(world, tower.id, tower.kind),
      refund: sellValue(world, tower.id, tower.kind),
    };
  });
  if (inspectedId === null || view === null) return null;
  const { tower, stats, def } = view;

  if (!tower.ready) {
    return (
      <GameFrame material="stone" tint="#57524a" cut="chamfer" depth={12} padding="12px 16px" className="bb-mason" data-jg="tower-panel">
        <h3 className="bb-mason-name">{tower.label}</h3>
        <span className="bb-mason-rising">
          <span style={{ width: `${Math.round(view.progress * 100)}%` }} />
        </span>
        <span className="bb-mason-stat">{`Raising · ${Math.round(view.progress * 100)}%`}</span>
        <GameFrame as="button" material="wood" cut="notch" depth={8} padding="6px 14px" className="bb-small-plank" onClick={() => commands.run("beacon.remove", { id: tower.id })}>
          Cancel build
        </GameFrame>
      </GameFrame>
    );
  }

  const upgradeKey = actionLabel(keybinds, "upgradeTower");
  const sellKey = actionLabel(keybinds, "sellTower");
  const aimKey = actionLabel(keybinds, "cycleAim");
  const fork = view.options.length > 1;
  const extras: { icon: GameIconName; text: string }[] = [];
  if (stats.shots > 1) extras.push({ icon: "arrow", text: `${stats.shots} targets` });
  if (stats.pen > 0) extras.push({ icon: "shield", text: `Pierces ${Math.round(stats.pen)}` });
  if (stats.chain > 0) extras.push({ icon: "lightning", text: `Chains ${stats.chain}` });
  if (stats.burn > 0) extras.push({ icon: "fire", text: `Burns ${Math.round(stats.burn * 1.5)}/s` });
  if (stats.shred > 0) extras.push({ icon: "debuffArrow", text: `Cracks armor ×${stats.shred}` });
  if (stats.slow < 1 && stats.slow_ms > 0) extras.push({ icon: "frost", text: `Slows ${Math.round((1 - stats.slow) * 100)}%` });
  if (stats.freeze_every > 0) extras.push({ icon: "crystal", text: `Freezes every ${stats.freeze_every}` });
  if (stats.stun_ms > 0) extras.push({ icon: "star", text: `Stuns ${(stats.stun_ms / 1000).toFixed(1)}s` });
  if (stats.crit_every > 0) extras.push({ icon: "skull", text: `×${stats.crit_mult} every ${stats.crit_every}` });

  return (
    <GameFrame material="stone" tint="#57524a" cut="chamfer" depth={12} padding="12px 16px 14px" className="bb-mason" data-jg="tower-panel">
      <h3 className="bb-mason-name">{tower.label}</h3>
      {view.branchLabel === null ? null : <span className="bb-mason-path">{view.branchLabel}</span>}
      <span className="bb-pips" aria-label={`Rank ${stats.level} of ${MAX_TOWER_LEVEL}`}>
        {Array.from({ length: MAX_TOWER_LEVEL }, (_, index) => (
          <i key={index} data-lit={index < stats.level ? "" : undefined} data-path={index >= 3 ? "" : undefined} />
        ))}
      </span>
      <div className="bb-mason-stats">
        <span className="bb-mason-stat">
          <GameIcon name={TYPE_ICON[def.damageType]} size={14} /> {`${Math.round(stats.damage)} ${TYPE_LABEL[def.damageType]}`}
        </span>
        <span className="bb-mason-stat">
          <GameIcon name="crosshairIcon" size={14} /> {stats.range.toFixed(1)}
        </span>
        <span className="bb-mason-stat">
          <GameIcon name="hourglass" size={14} /> {stats.fireRateHz.toFixed(2)}/s
        </span>
        {stats.splashRadius > 0 ? (
          <span className="bb-mason-stat">
            <GameIcon name="bomb" size={14} /> {stats.splashRadius.toFixed(1)}
          </span>
        ) : null}
        <span className="bb-mason-stat" data-dim={def.hitsAir ? undefined : ""}>
          <GameIcon name="wing" size={14} /> {def.hitsAir ? "Hits air" : "Ground only"}
        </span>
        {extras.map((extra) => (
          <span key={extra.text} className="bb-mason-stat">
            <GameIcon name={extra.icon} size={14} /> {extra.text}
          </span>
        ))}
      </div>
      <GameFrame
        as="button"
        material="wood"
        cut="notch"
        depth={6}
        padding="4px 10px"
        className="bb-small-plank bb-aim"
        data-jg="tower-aim"
        onClick={() => commands.run("cycleAim", { instanceId: tower.id })}
      >
        <GameIcon name="eye" size={13} /> {`Aim: ${AIM_LABEL[stats.aim] ?? stats.aim}`}
        {aimKey === null ? null : <kbd>{aimKey}</kbd>}
      </GameFrame>
      {fork ? <span className="bb-mason-fork">Choose a path — the other closes</span> : null}
      <div className={fork ? "bb-mason-branches" : "bb-mason-acts"}>
        {view.options.length === 0 ? (
          <GameFrame as="button" material="wood" cut="notch" depth={8} padding="6px 12px" className="bb-small-plank" data-dim="" aria-disabled>
            Mastered
          </GameFrame>
        ) : null}
        {view.options.map((option) => {
          const ready = option.refusal === null;
          const cost = -((option.cost["keep.gold"] as number | undefined) ?? 0);
          return (
            <GameFrame
              key={option.action}
              as="button"
              material={fork ? "paper" : "wood"}
              cut="notch"
              depth={8}
              padding={fork ? "8px 10px" : "6px 12px"}
              className={fork ? "bb-branch-card" : "bb-small-plank"}
              data-jg={`upgrade-${option.branch ?? "trunk"}`}
              aria-disabled={!ready}
              data-dim={ready ? undefined : ""}
              cue={ready ? "confirm" : undefined}
              title={option.detail ?? undefined}
              // A refused step still runs, so its "needs N more gold" reaches the notice feed.
              onClick={() => commands.run("beacon.act", { action: option.action, target: tower.id })}
            >
              {fork ? (
                <>
                  <strong>{option.branchLabel}</strong>
                  <span>{option.detail ?? option.label}</span>
                  <em>
                    <GameIcon name="coin" size={12} /> {cost}
                  </em>
                </>
              ) : (
                <>
                  <GameIcon name="arrowUp" size={13} /> {`${option.label} · ${cost}`}
                  {upgradeKey === null ? null : <kbd>{upgradeKey}</kbd>}
                </>
              )}
            </GameFrame>
          );
        })}
      </div>
      <div className="bb-mason-acts">
        <GameFrame
          as="button"
          material="enamel"
          tint="#6e1f14"
          edge="#250804"
          cut="notch"
          depth={8}
          padding="6px 12px"
          className="bb-small-plank"
          onClick={() => commands.run("beacon.act", { action: sellAction(tower.kind), target: tower.id })}
        >
          {`Sell ${view.refund}`}
          {sellKey === null ? null : <kbd>{sellKey}</kbd>}
        </GameFrame>
      </div>
    </GameFrame>
  );
}
