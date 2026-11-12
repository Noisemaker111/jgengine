/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useActionBindings } from "@jgengine/core/input/actionBindings.view";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { summarizeWave } from "@jgengine/core/waves/wavePreview";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { abilityDef } from "../combat/abilities";
import { creepTraits } from "../entities/enemies/catalog";
import { TOWER_IDS, towerDef } from "../entities/towers/catalog";
import { editorLayers } from "../../editorLayers";
import { buildPrompt } from "../build/prompt";
import { buildCost, keep, MEND_RULE } from "../keep";
import { keepIsUnsaved } from "../save";
import { activeCreepCount, currentWaveNumber, session } from "../session";
import { bountyScale } from "../waves/bounty";
import { canSendWave, waveOverlapBonus } from "../waves/director";
import { HELD_PAY_RULE, interestOn } from "../waves/heldWavePay";
import { carriedRelic, legacy, relicBountyScale } from "../waves/legacy";
import { TOTAL_WAVES } from "../waves/manifest";
import { bossLine, tierLabel, wavePreviewLine, waveStatusLine } from "../waves/status";
import { FLANK_POINT_KEY } from "../world/path";
import { BLOOD, Brazier, Caption, DIM, FIRE, GOLD, Glyph, INK, Plank, Row, Tag, Text, usePhone } from "./look";
import type { GlyphName } from "./glyphs";

const num = (ctx: GameContext, stat: string) => keep.of(ctx).num(stat);

/**
 * The keep's own signage, top-left: the brazier burns as high as the keep has lives, the purse hangs
 * beside it, and under them the kill pay, the held-wave interest, the masons' call and any relic.
 */
export function KeepSigns() {
  const ctx = useGameContext(), phone = usePhone();
  const unsaved = useGameStore((c) => keepIsUnsaved(c));
  const relic = useGameStore((c) => carriedRelic(legacy.read(c))?.label ?? null);
  const ratio = () => { const max = num(ctx, "keep.lives_max"); return max > 0 ? num(ctx, "keep.lives") / max : 0; };
  return <RuneView gap={6} maxWidth={phone ? 196 : 320}>
    {unsaved ? <Caption role="status" size={12} color={FIRE}>Unsaved defense — save to a keep before leaving</Caption> : null}
    <Row gap={8}>
      <RuneView variant="sign" layout="row" items="center" gap={4} label="Keep lives">
        <Brazier size={phone ? 30 : 38} strength={bind(ratio)} />
        <Text family="Cinzel" weight={700} size={phone ? 20 : 24} color={bind(() => (ratio() <= 0.3 ? BLOOD : INK))} text={bind(() => String(num(ctx, "keep.lives")))} />
        <Text size={13} color={DIM} text={bind(() => `/${num(ctx, "keep.lives_max")}`)} />
      </RuneView>
      <RuneView variant="sign" layout="row" items="center" gap={6} label="Gold">
        <Glyph name="coin" size={phone ? 16 : 20} color={GOLD} />
        <Text family="Cinzel" weight={700} size={phone ? 18 : 22} text={bind(() => String(num(ctx, "keep.gold")))} />
      </RuneView>
    </Row>
    <Caption size={12} color={DIM} tooltip={`Kill pay this wave; a held wave pays ${HELD_PAY_RULE.interestRate * 100}% interest on the purse, up to ${HELD_PAY_RULE.interestMax}`}
      text={bind(() => `×${bountyScale(Math.min(currentWaveNumber(), TOTAL_WAVES), relicBountyScale(legacy.read(ctx))).toFixed(2)} bounty · +${interestOn(num(ctx, "keep.gold"))} interest`)} />
    <MendButton />
    {relic === null ? null : <Row gap={4}><Glyph name="amulet" size={13} color={FIRE} /><Tag color={FIRE}>{relic}</Tag></Row>}
  </RuneView>;
}

/** The masons' call: shown once a raider has broken through; dim while raiders are still on the road. */
function MendButton() {
  const ctx = useGameContext(), keys = useActionBindings();
  const breached = useGameStore((c) => num(c, "keep.breaches") > 0);
  if (!breached) return null;
  const key = actionLabel(keys, "mendWalls");
  const open = () => keep.of(ctx).canAct("mend") === null;
  return <Plank minHeight={30} padding={[4, 10, 4, 10]} command={{ name: "mendWalls" }} label="Mend the walls"
    opacity={bind(() => (open() ? 1 : 0.55))} tooltip={`Mend one breach for ${MEND_RULE.gold} gold once the road is clear`}>
    <Glyph name="hammer" size={13} /><Text size={13}>{`Mend ${MEND_RULE.gold}g`}</Text>{key === null ? null : <Tag size={10}>{key}</Tag>}
  </Plank>;
}

/** The wave count cut into a timber board at the top edge, the road's one line, and the boss pennant. */
export function WaveBoard() {
  const ctx = useGameContext(), phone = usePhone();
  const boss = useGameStore(() => bossLine(session.boss));
  const status = () => waveStatusLine({
    started: keep.of(ctx).fact("keep.wave_started") === true,
    releasing: keep.of(ctx).fact("keep.wave_ready") !== true && !session.encounter.view().done,
    wave: Math.min(currentWaveNumber(), TOTAL_WAVES),
    alive: activeCreepCount(),
  });
  return <RuneView items="center" gap={4}>
    <RuneView variant="sign" items="center" gap={0} padding={phone ? [4, 14, 6, 14] : [6, 22, 8, 22]}>
      <Tag size={10}>WAVE</Tag>
      <Text family="Cinzel" weight={700} size={phone ? 22 : 28} text={bind(() => `${Math.min(currentWaveNumber(), TOTAL_WAVES)}/${TOTAL_WAVES}`)} />
    </RuneView>
    <Caption align="center" maxWidth={phone ? 150 : 320} text={bind(status)} />
    {boss === null ? null : <Row fill="#7d1d12" border={{ width: 1, color: "#2a0804" }} radius={2} padding={[3, 10, 3, 10]} gap={6}><Glyph name="skull" size={14} /><Text size={13}>{boss}</Text></Row>}
  </RuneView>;
}

const TRAIT_MARK: Record<string, { glyph: GlyphName; label: string }> = {
  flying: { glyph: "wing", label: "Flyers: cannons can't reach them" },
  armored: { glyph: "helmet", label: "Heavy armor: pierce it or crack it" },
  warded: { glyph: "eye", label: "Warded: arcane and frost hit soft" },
  bone: { glyph: "skull", label: "Bone: blast shatters it, arrows glance" },
  shielded: { glyph: "shield", label: "Shield-bearers: their ward regrows" },
  healer: { glyph: "heart", label: "Shamans mend the raiders near them" },
  splits: { glyph: "swap", label: "Hulks break into bonelings" },
};

/**
 * The war horn: who comes next and what about them matters, the clock until they march on their own,
 * and the button that calls them early for gold.
 */
export function ReleaseHorn() {
  const ctx = useGameContext(), phone = usePhone();
  const shown = useGameStore((c) => canSendWave(c) && !session.encounter.view().done);
  const started = useGameStore((c) => keep.of(c).fact("keep.wave_started") === true);
  const nextIndex = useGameStore((c) => (keep.of(c).fact("keep.wave_started") === true ? currentWaveNumber() : 0));
  const armed = useGameStore(() => session.countdown.view().armed);
  if (!shown) return null;
  const next = session.encounter.waveAt(nextIndex);
  const summary = next === null ? null : summarizeWave(next, { traitsOf: creepTraits });
  const flank = summary?.entries.includes(FLANK_POINT_KEY) === true;
  const traits = summary === null ? [] : Object.keys(summary.traits).filter((trait) => TRAIT_MARK[trait] !== undefined);
  return <RuneView gap={6} maxWidth={phone ? 196 : 300}>
    <RuneView variant="parchment" padding={[8, 12, 10, 12]} gap={4}>
      <Text size={13} color="#2e1f12">{wavePreviewLine(next, nextIndex + 1).replace(/^Next · /, "")}</Text>
      {traits.length === 0 && !flank ? null : <Row gap={6}>
        {traits.map((trait) => { const mark = TRAIT_MARK[trait]!; return <RuneView key={trait} tooltip={mark.label} label={mark.label}><Glyph name={mark.glyph} size={15} color="#5a2a12" /></RuneView>; })}
        {flank ? <Row gap={3} tooltip="Some come by the east flank road"><Glyph name="arrowLeft" size={13} color="#5a2a12" /><Text size={12} color="#5a2a12">Flank</Text></Row> : null}
      </Row>}
      <Text size={12} color="#6a4a2a" text={started ? bind(() => `Director ${tierLabel(session.pressure.tier)}`) : "Build on the rings, then sound the horn"} />
    </RuneView>
    <Row gap={8}>
      <Plank tone="enamel" layout="row" command={{ name: "wave.send" }} label={started ? `Send wave ${nextIndex + 1}` : "Begin first assault"} grow={1}>
        <Glyph name="flag" size={16} color="#fff1d8" />
        <Text size={15} weight={700} color="#fff1d8">{started ? `Send wave ${nextIndex + 1}` : "Begin first assault"}</Text>
        <Text size={12} color={GOLD} text={bind(() => { const bonus = waveOverlapBonus(ctx); return bonus > 0 ? `+${bonus} gold` : ""; })} />
      </Plank>
      {armed ? <RuneView variant="sign" items="center" gap={2} padding={[4, 8, 4, 8]} label="Marches in">
        <Glyph name="hourglass" size={12} color={FIRE} />
        <Text family="Cinzel" weight={700} size={15} text={bind(() => String(Math.ceil(session.countdown.view().remaining)))} />
      </RuneView> : null}
    </Row>
  </RuneView>;
}

/** The builder's rack along the foot: one timber plaque per tower, its glyph, price and key. */
export function BuildBar() {
  const ctx = useGameContext(), keys = useActionBindings(), phone = usePhone();
  const gold = () => num(ctx, "keep.gold");
  const prompt = () => {
    const building = keep.of(ctx).orders("build").map((order) => `${order.label} ${Math.round(order.progress * 100)}%`).join(" · ");
    const selected = session.selectedTowerId;
    return building.length > 0 ? `Raising ${building}` : buildPrompt(selected !== null, selected !== null && gold() >= buildCost(selected));
  };
  return <RuneView items="center" gap={6}>
    <Caption align="center" maxWidth={phone ? 360 : 560} text={bind(prompt)} />
    <Row gap={phone ? 4 : 8} justify="center" items="stretch">
      {TOWER_IDS.map((id, index) => {
        const def = towerDef(id, editorLayers), cost = buildCost(id), key = actionLabel(keys, `buildTower${index + 1}`);
        const affordable = () => gold() >= cost, chosen = () => session.selectedTowerId === id;
        return <Plank key={id} label={`${def.label}, ${cost} gold`} width={phone ? 84 : 104} padding={[6, 4, 6, 4]} gap={2}
          layout="stack" opacity={bind(() => (affordable() ? 1 : 0.62))}
          border={bind(() => (chosen() ? { width: 2, color: FIRE } : { width: 1, color: "#a8814a" }))}
          run={() => { ctx.game.commands.run(`buildTower${index + 1}`, {}); if (!affordable()) ctx.game.audio.play("denied"); }}>
          {key === null ? null : <Tag size={10}>{key}</Tag>}
          <Glyph name={def.icon} size={phone ? 22 : 28} color={bind(() => (affordable() ? "#fff3df" : "#a8927a"))} />
          <Text size={phone ? 12 : 13} weight={600} align="center">{def.label}</Text>
          <Row gap={3}><Glyph name="coin" size={11} color={bind(() => (affordable() ? GOLD : BLOOD))} /><Text size={12} color={bind(() => (affordable() ? GOLD : BLOOD))}>{String(cost)}</Text></Row>
        </Plank>;
      })}
    </Row>
  </RuneView>;
}

/** How far a rite has recharged: its stone fills back up like a rising flame. */
function riteFill(id: string): number {
  const slot = session.abilities.snapshot().find((entry) => entry.id === id);
  return slot === undefined ? 1 : 1 - slot.cooldownFraction;
}

/** The beacon's two rites as carved keystones: key, name or seconds left, and the recharge fill. */
export function AbilityStones() {
  const keys = useActionBindings(), phone = usePhone();
  const ids = useGameStore(() => session.abilities.snapshot().map((slot) => slot.id).join(","));
  return <RuneView layout={phone ? "row" : "stack"} gap={8}>
    {ids.split(",").filter(Boolean).map((id) => {
      const def = abilityDef(id);
      if (def === null) return null;
      const key = actionLabel(keys, def.action);
      const slot = () => session.abilities.snapshot().find((entry) => entry.id === id);
      return <RuneAction key={id} variant="keystone" command={{ name: `ability.${id}` }} label={def.label} tooltip={def.detail} width={phone ? 74 : 84} height={phone ? 64 : 72}
        border={bind(() => (session.armedAbility === id ? { width: 2, color: FIRE } : { width: 1, color: def.tint }))}>
        <RuneView pin={[0, null, 0, 0]} height={bind(() => ({ fraction: riteFill(id) }))} fill={`${def.tint}88`} />
        <RuneView items="center" gap={2}>
          <Glyph name={def.icon} size={22} color={bind(() => (slot()?.ready === false ? DIM : INK))} />
          <Text size={12} weight={600} text={bind(() => { const s = slot(); return s === undefined || s.ready ? def.label : `${Math.ceil(s.cooldownRemainingMs / 1000)}s`; })} />
          {key === null ? null : <Tag size={10}>{key}</Tag>}
        </RuneView>
      </RuneAction>;
    })}
  </RuneView>;
}
