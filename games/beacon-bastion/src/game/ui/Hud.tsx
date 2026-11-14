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
import { AttentionMug, BLOOD, Caption, DIM, FIRE, GOLD, Glyph, INK, Plank, Row, Tag, Text, usePhone } from "./look";
import type { GlyphName } from "./glyphs";

const num = (ctx: GameContext, stat: string) => keep.of(ctx).num(stat);

/** How many workers are looking at their phones right now. */
function distractedCount(ctx: GameContext): number {
  let count = 0;
  for (const worker of keep.of(ctx).instances()) if (session.workers.has(worker.id, "distracted")) count += 1;
  return count;
}

/**
 * The town's own signage, top-left: the attention mug steams as long as the town is focused, the
 * till hangs beside it, and under them the scrap pay, the interest, the coffee break and any perk.
 */
export function KeepSigns() {
  const ctx = useGameContext(), phone = usePhone();
  const unsaved = useGameStore((c) => keepIsUnsaved(c));
  const relic = useGameStore((c) => carriedRelic(legacy.read(c))?.label ?? null);
  const ratio = () => { const max = num(ctx, "keep.lives_max"); return max > 0 ? num(ctx, "keep.lives") / max : 0; };
  return <RuneView gap={6} maxWidth={phone ? 196 : 320}>
    {unsaved ? <Caption role="status" size={12} color={FIRE}>Unsaved day — save the street before leaving</Caption> : null}
    <Row gap={8}>
      <RuneView variant="sign" layout="row" items="center" gap={4} label="Attention span" tooltip="The town's attention span: every gadget that gets through costs some">
        <AttentionMug size={phone ? 30 : 38} strength={bind(ratio)} />
        <Text family="Lilita One" weight={400} size={phone ? 20 : 24} color={bind(() => (ratio() <= 0.3 ? BLOOD : INK))} text={bind(() => String(num(ctx, "keep.lives")))} />
        <Text size={13} color={DIM} text={bind(() => `/${num(ctx, "keep.lives_max")}`)} />
      </RuneView>
      <RuneView variant="sign" layout="row" items="center" gap={6} label="Cash">
        <Text family="Lilita One" weight={400} size={phone ? 18 : 22} color={GOLD}>$</Text>
        <Text family="Lilita One" weight={400} size={phone ? 18 : 22} text={bind(() => String(num(ctx, "keep.gold")))} />
      </RuneView>
    </Row>
    <Caption size={12} color={DIM} tooltip={`Scrap pay this wave; a clear street pays ${HELD_PAY_RULE.interestRate * 100}% interest on the till, up to ${HELD_PAY_RULE.interestMax}`}
      text={bind(() => `×${bountyScale(Math.min(currentWaveNumber(), TOTAL_WAVES), relicBountyScale(legacy.read(ctx))).toFixed(2)} scrap · +${interestOn(num(ctx, "keep.gold"))} interest`)} />
    <CoffeeBreak />
    {relic === null ? null : <Row gap={4}><Glyph name="star" size={13} color={FIRE} /><Tag color={FIRE}>{relic}</Tag></Row>}
  </RuneView>;
}

/** The coffee break: shown once the town has lost focus; dim while tech is still on the street. */
function CoffeeBreak() {
  const ctx = useGameContext(), keys = useActionBindings();
  const breached = useGameStore((c) => num(c, "keep.breaches") > 0);
  if (!breached) return null;
  const key = actionLabel(keys, "mendWalls");
  const open = () => keep.of(ctx).canAct("mend") === null;
  return <Plank minHeight={30} padding={[4, 10, 4, 10]} command={{ name: "mendWalls" }} label="Coffee break"
    opacity={bind(() => (open() ? 1 : 0.55))} tooltip={`Win back one attention for ${MEND_RULE.gold} cash once the street is clear`}>
    <Glyph name="coffee" size={13} /><Text size={13}>{`Coffee break $${MEND_RULE.gold}`}</Text>{key === null ? null : <Tag size={10}>{key}</Tag>}
  </Plank>;
}

/** The wave count on the diner sign at the top edge, the street's one line, and the boss banner. */
export function WaveBoard() {
  const ctx = useGameContext(), phone = usePhone();
  const boss = useGameStore(() => bossLine(session.boss));
  const status = () => waveStatusLine({
    started: keep.of(ctx).fact("keep.wave_started") === true,
    releasing: keep.of(ctx).fact("keep.wave_ready") !== true && !session.encounter.view().done,
    wave: Math.min(currentWaveNumber(), TOTAL_WAVES),
    alive: activeCreepCount(),
  });
  const distracted = () => distractedCount(ctx);
  return <RuneView items="center" gap={4}>
    <RuneView variant="sign" items="center" gap={0} padding={phone ? [4, 14, 6, 14] : [6, 22, 8, 22]}>
      <Tag size={10}>WAVE</Tag>
      <Text family="Lilita One" weight={400} size={phone ? 22 : 28} text={bind(() => `${Math.min(currentWaveNumber(), TOTAL_WAVES)}/${TOTAL_WAVES}`)} />
    </RuneView>
    <Caption align="center" maxWidth={phone ? 150 : 320} text={bind(status)} />
    <Row fill="#3a6aff" radius={10} padding={[2, 10, 2, 10]} gap={5} opacity={bind(() => (distracted() > 0 ? 1 : 0))} label="Distracted workers">
      <Glyph name="phone" size={13} color="#ffffff" /><Text size={12} color="#ffffff" text={bind(() => `${distracted()} on their phone${distracted() === 1 ? "" : "s"}`)} />
    </Row>
    {boss === null ? null : <Row fill="#b01f52" border={{ width: 2, color: "#ffe08a" }} radius={10} padding={[3, 10, 3, 10]} gap={6}><Glyph name="plug" size={14} /><Text size={13}>{boss}</Text></Row>}
  </RuneView>;
}

const TRAIT_MARK: Record<string, { glyph: GlyphName; label: string }> = {
  flying: { glyph: "wing", label: "Flyers: baristas and jackhammers can't reach them" },
  armored: { glyph: "shield", label: "Heavy armor: crush it, or bring legal and analog" },
  notifies: { glyph: "phone", label: "Notifications: they distract workers. Teachers, Librarians and Monks answer them" },
  spots: { glyph: "camera", label: "Flock camera: it spots a worker for every notification. Kill it first" },
  overheats: { glyph: "thermometer", label: "Runs hot: workers near it slow down. Firefighters hose it" },
  shielded: { glyph: "shield", label: "Frost-free shield that grows back" },
  boosts: { glyph: "wifi", label: "A router boosts and patches the tech around it" },
  splits: { glyph: "swap", label: "Splits or spawns more tech" },
  powered: { glyph: "plug", label: "On mains power: an Electrician has to cut it off" },
};

/**
 * The wave call: what rolls in next and what about it matters, the clock until it rolls in on its
 * own, and the button that calls it early for cash.
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
      <Text size={13} color="#3a2a12">{wavePreviewLine(next, nextIndex + 1).replace(/^Next · /, "")}</Text>
      {traits.length === 0 && !flank ? null : <Row gap={6}>
        {traits.map((trait) => { const mark = TRAIT_MARK[trait]!; return <RuneView key={trait} tooltip={mark.label} label={mark.label}><Glyph name={mark.glyph} size={15} color="#7a2a12" /></RuneView>; })}
        {flank ? <Row gap={3} tooltip="Some come down the side street"><Glyph name="arrowLeft" size={13} color="#7a2a12" /><Text size={12} color="#7a2a12">Side street</Text></Row> : null}
      </Row>}
      <Text size={12} color="#6a4a2a" text={started ? bind(() => `Director ${tierLabel(session.pressure.tier)}`) : "Hire workers on the open plots, then open for business"} />
    </RuneView>
    <Row gap={8}>
      <Plank tone="enamel" layout="row" command={{ name: "wave.send" }} label={started ? `Send wave ${nextIndex + 1}` : "Open for business"} grow={1}>
        <Glyph name="megaphone" size={16} color="#fff4e0" />
        <Text size={15} weight={800} color="#fff4e0">{started ? `Send wave ${nextIndex + 1}` : "Open for business"}</Text>
        <Text size={12} color={GOLD} text={bind(() => { const bonus = waveOverlapBonus(ctx); return bonus > 0 ? `+$${bonus}` : ""; })} />
      </Plank>
      {armed ? <RuneView variant="sign" items="center" gap={2} padding={[4, 8, 4, 8]} label="Rolls in">
        <Glyph name="hourglass" size={12} color={FIRE} />
        <Text family="Lilita One" weight={400} size={15} text={bind(() => String(Math.ceil(session.countdown.view().remaining)))} />
      </RuneView> : null}
    </Row>
  </RuneView>;
}

/** The hiring board along the foot: one button per worker, their trade's glyph, wage and key. */
export function BuildBar() {
  const ctx = useGameContext(), keys = useActionBindings(), phone = usePhone();
  const gold = () => num(ctx, "keep.gold");
  const prompt = () => {
    const building = keep.of(ctx).orders("build").map((order) => `${order.label} ${Math.round(order.progress * 100)}%`).join(" · ");
    const selected = session.selectedTowerId;
    if (building.length > 0) return `Clocking in: ${building}`;
    if (selected !== null) return `${towerDef(selected, editorLayers).label}: ${towerDef(selected, editorLayers).description}`;
    return buildPrompt(false, false);
  };
  const columns = phone ? 5 : 7;
  return <RuneView items="center" gap={6}>
    <Caption align="center" maxWidth={phone ? 360 : 640} text={bind(prompt)} />
    <RuneView layout="grid" columns={columns} gap={phone ? 3 : 5}>
      {TOWER_IDS.map((id, index) => {
        const def = towerDef(id, editorLayers), cost = buildCost(id), key = actionLabel(keys, `buildTower${index + 1}`);
        const affordable = () => gold() >= cost, chosen = () => session.selectedTowerId === id;
        return <Plank key={id} label={`${def.label}, ${cost} cash`} tooltip={`${def.label} — ${def.role}`} width={phone ? 70 : 92} minHeight={phone ? 56 : 64} padding={[4, 3, 4, 3]} gap={1}
          layout="stack" opacity={bind(() => (affordable() ? 1 : 0.55))}
          border={bind(() => (chosen() ? { width: 3, color: "#ffe08a" } : { width: 2, color: "#ffd9b0" }))}
          run={() => { ctx.game.commands.run(`buildTower${index + 1}`, {}); if (!affordable()) ctx.game.audio.play("denied"); }}>
          <Row gap={3}>
            <Glyph name={def.icon} size={phone ? 16 : 20} color={bind(() => (affordable() ? "#fff4e0" : "#e0b8a8"))} />
            {key === null ? null : <Tag size={9} color="#ffe0c8">{key}</Tag>}
          </Row>
          <Text size={phone ? 10 : 11} weight={800} align="center">{def.label}</Text>
          <Text size={11} weight={700} color={bind(() => (affordable() ? GOLD : "#ffd0d0"))}>{`$${cost}`}</Text>
        </Plank>;
      })}
    </RuneView>
  </RuneView>;
}

/** How far a button has recharged: its tile fills back up from the bottom. */
function riteFill(id: string): number {
  const slot = session.abilities.snapshot().find((entry) => entry.id === id);
  return slot === undefined ? 1 : 1 - slot.cooldownFraction;
}

/** The town's two big buttons as rounded tiles: key, name or seconds left, and the recharge fill. */
export function AbilityStones() {
  const keys = useActionBindings(), phone = usePhone();
  const ids = useGameStore(() => session.abilities.snapshot().map((slot) => slot.id).join(","));
  return <RuneView layout={phone ? "row" : "stack"} gap={8}>
    {ids.split(",").filter(Boolean).map((id) => {
      const def = abilityDef(id);
      if (def === null) return null;
      const key = actionLabel(keys, def.action);
      const slot = () => session.abilities.snapshot().find((entry) => entry.id === id);
      return <RuneAction key={id} variant="keystone" command={{ name: `ability.${id}` }} label={def.label} tooltip={def.detail} width={phone ? 78 : 92} height={phone ? 64 : 72}
        border={bind(() => (session.armedAbility === id ? { width: 3, color: FIRE } : { width: 2, color: def.tint }))}>
        <RuneView pin={[0, null, 0, 0]} height={bind(() => ({ fraction: riteFill(id) }))} fill={`${def.tint}cc`} />
        <RuneView items="center" gap={2}>
          <Glyph name={def.icon} size={22} color={bind(() => (slot()?.ready === false ? DIM : INK))} />
          <Text size={11} weight={800} align="center" text={bind(() => { const s = slot(); return s === undefined || s.ready ? def.label : `${Math.ceil(s.cooldownRemainingMs / 1000)}s`; })} />
          {key === null ? null : <Tag size={10}>{key}</Tag>}
        </RuneView>
      </RuneAction>;
    })}
  </RuneView>;
}
