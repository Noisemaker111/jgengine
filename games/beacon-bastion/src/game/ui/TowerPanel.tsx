/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useActionBindings } from "@jgengine/core/input/actionBindings.view";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { editorLayers } from "../../editorLayers";
import type { DamageType } from "../combat/damage";
import { towerDef } from "../entities/towers/catalog";
import { TOWER_LADDERS } from "../entities/towers/ladders";
import { keep, MAX_TOWER_LEVEL, sellAction, sellValue, towerOptions, towerStats } from "../keep";
import { session } from "../session";
import type { GlyphName } from "./glyphs";
import { DIM, FIRE, FULL, GOLD, Glyph, Heading, INK, Plank, Row, Tag, Text, usePhone } from "./look";

const AIM_LABEL: Record<string, string> = { first: "First", last: "Last", strongest: "Strongest", nearest: "Nearest" };
const TYPE_GLYPH: Record<DamageType, GlyphName> = { pierce: "arrow", blast: "bomb", frost: "frost", arcane: "lightning" };
const TYPE_LABEL: Record<DamageType, string> = { pierce: "Pierce", blast: "Blast", frost: "Frost", arcane: "Arcane" };

/**
 * The inspected tower's mason's tablet: rank as carved pips, the path it took, its numbers beside
 * their glyphs, the aim it holds, and the next step on its ladder — one plank for a shared rank, two
 * branch cards at the fork. It re-renders only when the tower's rank, path or offer changes.
 */
export function TowerPanel() {
  const ctx = useGameContext(), keys = useActionBindings(), phone = usePhone();
  const shape = useGameStore((c) => {
    const id = session.inspectedTowerId;
    if (id === null) return null;
    const world = keep.of(c), tower = world.instance(id);
    if (tower === null) return null;
    const stats = towerStats(world, tower.id);
    const offer = towerOptions(world, tower.id, tower.kind).map((option) => `${option.action}:${option.refusal === null}`).join(",");
    return `${tower.id}|${tower.ready}|${stats.level}|${stats.branch ?? ""}|${stats.aim}|${offer}|${sellValue(world, tower.id, tower.kind)}`;
  });
  if (shape === null) return null;
  const world = keep.of(ctx), id = shape.slice(0, shape.indexOf("|")), tower = world.instance(id);
  if (tower === null) return null;
  const width = phone ? 340 : 300;

  if (!tower.ready) {
    const progress = () => world.orders("build").find((entry) => entry.target === tower.id)?.progress ?? 1;
    return <RuneView variant="stone" width={width} label="Tower" role="dialog">
      <Heading size={20}>{tower.label}</Heading>
      <RuneView height={8} width={FULL} fill="#2a2622" radius={2}><RuneView height={8} fill={FIRE} radius={2} width={bind(() => ({ fraction: progress() }))} /></RuneView>
      <Text size={13} text={bind(() => `Raising · ${Math.round(progress() * 100)}%`)} />
      <Plank command={{ name: "beacon.remove", input: { id: tower.id } }}>Cancel build</Plank>
    </RuneView>;
  }

  const stats = towerStats(world, tower.id), def = towerDef(tower.kind, editorLayers);
  const branch = TOWER_LADDERS[tower.kind]?.branches?.find((entry) => entry.id === stats.branch) ?? null;
  const options = towerOptions(world, tower.id, tower.kind), fork = options.length > 1;
  const lines: { glyph: GlyphName; text: string; dim?: boolean }[] = [
    { glyph: TYPE_GLYPH[def.damageType], text: `${Math.round(stats.damage)} ${TYPE_LABEL[def.damageType]}` },
    { glyph: "crosshair", text: stats.range.toFixed(1) },
    { glyph: "hourglass", text: `${stats.fireRateHz.toFixed(2)}/s` },
  ];
  if (stats.splashRadius > 0) lines.push({ glyph: "bomb", text: stats.splashRadius.toFixed(1) });
  lines.push({ glyph: "wing", text: def.hitsAir ? "Hits air" : "Ground only", dim: !def.hitsAir });
  if (stats.shots > 1) lines.push({ glyph: "arrow", text: `${stats.shots} targets` });
  if (stats.pen > 0) lines.push({ glyph: "shield", text: `Pierces ${Math.round(stats.pen)}` });
  if (stats.chain > 0) lines.push({ glyph: "lightning", text: `Chains ${stats.chain}` });
  if (stats.burn > 0) lines.push({ glyph: "fire", text: `Burns ${Math.round(stats.burn * 1.5)}/s` });
  if (stats.shred > 0) lines.push({ glyph: "debuffArrow", text: `Cracks armor ×${stats.shred}` });
  if (stats.slow < 1 && stats.slow_ms > 0) lines.push({ glyph: "frost", text: `Slows ${Math.round((1 - stats.slow) * 100)}%` });
  if (stats.freeze_every > 0) lines.push({ glyph: "crystal", text: `Freezes every ${stats.freeze_every}` });
  if (stats.stun_ms > 0) lines.push({ glyph: "star", text: `Stuns ${(stats.stun_ms / 1000).toFixed(1)}s` });
  if (stats.crit_every > 0) lines.push({ glyph: "skull", text: `×${stats.crit_mult} every ${stats.crit_every}` });
  const upgradeKey = actionLabel(keys, "upgradeTower"), sellKey = actionLabel(keys, "sellTower"), aimKey = actionLabel(keys, "cycleAim");
  const refund = sellValue(world, tower.id, tower.kind);

  return <RuneView variant="stone" width={width} gap={8} label="Tower" role="dialog">
    <Row justify="between"><Heading size={20}>{tower.label}</Heading>
      <Row gap={4} label={`Rank ${stats.level} of ${MAX_TOWER_LEVEL}`}>{Array.from({ length: MAX_TOWER_LEVEL }, (_, index) =>
        <RuneView key={index} width={9} height={9} radius={index >= 3 ? 5 : 1} fill={index < stats.level ? FIRE : "#2a2622"} border={{ width: 1, color: "#1a1714" }} />)}</Row>
    </Row>
    {branch === null ? null : <Tag color={FIRE}>{branch.label.toUpperCase()}</Tag>}
    <RuneView layout="grid" columns={2} gap={5}>{lines.map((line) => <Row key={line.text} gap={5}>
      <Glyph name={line.glyph} size={14} color={line.dim === true ? DIM : INK} /><Text size={13} color={line.dim === true ? DIM : INK}>{line.text}</Text>
    </Row>)}</RuneView>
    <Plank minHeight={32} padding={[4, 10, 4, 10]} command={{ name: "cycleAim", input: { instanceId: tower.id } }} label="Aim">
      <Glyph name="eye" size={13} /><Text size={13}>{`Aim: ${AIM_LABEL[stats.aim] ?? stats.aim}`}</Text>{aimKey === null ? null : <Tag size={10}>{aimKey}</Tag>}
    </Plank>
    {fork ? <Tag color={FIRE}>CHOOSE A PATH — THE OTHER CLOSES</Tag> : null}
    {options.length === 0 ? <Plank disabled>Mastered</Plank> : null}
    <RuneView layout={fork ? "grid" : "stack"} columns={2} gap={6}>{options.map((option) => {
      const ready = option.refusal === null, cost = -((option.cost["keep.gold"] as number | undefined) ?? 0);
      // A refused step still runs, so its "needs N more gold" reaches the notice feed.
      const run = { name: "beacon.act", input: { action: option.action, target: tower.id } };
      return fork
        ? <Plank key={option.action} variant="parchment" layout="stack" command={run} opacity={ready ? 1 : 0.6} gap={3} padding={[8, 10, 8, 10]} items="start" label={option.branchLabel ?? option.label} {...(option.detail == null ? {} : { tooltip: option.detail })}>
          <Text size={14} weight={700} color="#2e1f12">{option.branchLabel ?? option.label}</Text>
          <Text size={12} color="#4a3520">{option.detail ?? option.label}</Text>
          <Row gap={3}><Glyph name="coin" size={11} color="#8a6418" /><Text size={12} color="#5a3a12">{String(cost)}</Text></Row>
        </Plank>
        : <Plank key={option.action} command={run} opacity={ready ? 1 : 0.6} label={`${option.label} · ${cost}`} {...(option.detail == null ? {} : { tooltip: option.detail })}>
          <Glyph name="arrowUp" size={13} /><Text size={14}>{`${option.label} · ${cost}`}</Text>{upgradeKey === null ? null : <Tag size={10}>{upgradeKey}</Tag>}
        </Plank>;
    })}</RuneView>
    <Plank tone="enamel" minHeight={36} command={{ name: "beacon.act", input: { action: sellAction(tower.kind), target: tower.id } }} label={`Sell ${refund}`}>
      <Glyph name="coin" size={13} color={GOLD} /><Text size={14} color="#fff1d8">{`Sell ${refund}`}</Text>{sellKey === null ? null : <Tag size={10} color="#f3c9a0">{sellKey}</Tag>}
    </Plank>
  </RuneView>;
}
