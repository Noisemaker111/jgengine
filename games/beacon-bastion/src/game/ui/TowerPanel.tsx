/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useActionBindings } from "@jgengine/core/input/actionBindings.view";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { editorLayers } from "../../editorLayers";
import type { DamageType } from "../combat/damage";
import { towerDef } from "../entities/towers/catalog";
import { TOWER_LADDERS } from "../entities/towers/ladders";
import { keep, MAX_TOWER_LEVEL, sellAction, sellValue, towerOptions, towerStats } from "../keep";
import { session } from "../session";
import type { GlyphName } from "./glyphs";
import { DIM, FIRE, FULL, GOLD, Glyph, Heading, INK, Plank, Row, Tag, Text, usePhone } from "./look";

const AIM_LABEL: Record<string, string> = { first: "First", last: "Last", strongest: "Strongest", nearest: "Nearest" };
const TYPE_GLYPH: Record<DamageType, GlyphName> = { hot: "coffee", water: "hose", shock: "bolt", blunt: "hardhat", pierce: "pitchfork", legal: "gavel", analog: "book" };
const TYPE_LABEL: Record<DamageType, string> = { hot: "Hot", water: "Water", shock: "Shock", blunt: "Blunt", pierce: "Pierce", legal: "Legal", analog: "Analog" };

/**
 * The inspected worker's chalkboard card: rank as chalk pips, the career they took, their numbers
 * beside their glyphs, whether they are on their phone, the aim they hold, and the next promotion —
 * one button for a shared rank, two career cards at the fork. It re-renders only when the worker's
 * rank, career, offer or condition changes.
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
    const condition = ["distracted", "spotted", "overheated"].filter((id) => session.workers.has(tower.id, id)).join("+");
    return `${tower.id}|${tower.ready}|${stats.level}|${stats.branch ?? ""}|${stats.aim}|${offer}|${sellValue(world, tower.id, tower.kind)}|${condition}`;
  });
  if (shape === null) return null;
  const world = keep.of(ctx), id = shape.slice(0, shape.indexOf("|")), tower = world.instance(id);
  if (tower === null) return null;
  const width = phone ? 340 : 300;

  if (!tower.ready) {
    const progress = () => world.orders("build").find((entry) => entry.target === tower.id)?.progress ?? 1;
    return <RuneView variant="stone" width={width} label="Worker" role="dialog">
      <Heading size={20}>{tower.label}</Heading>
      <RuneView height={8} width={FULL} fill="#1b2420" radius={4}><RuneView height={8} fill={FIRE} radius={4} width={bind(() => ({ fraction: progress() }))} /></RuneView>
      <Text size={13} text={bind(() => `Clocking in · ${Math.round(progress() * 100)}%`)} />
      <Plank command={{ name: "beacon.remove", input: { id: tower.id } }}>Cancel the hire</Plank>
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
  lines.push({ glyph: "wing", text: stats.air > 0 ? "Hits air" : "Ground only", dim: stats.air <= 0 });
  if (stats.shots > 1) lines.push({ glyph: "arrow", text: `${stats.shots} targets` });
  if (stats.pen > 0) lines.push({ glyph: "shield", text: `Pierces ${Math.round(stats.pen)}` });
  if (stats.chain > 0) lines.push({ glyph: "lightning", text: `Chains ${stats.chain}` });
  if (stats.burn > 0) lines.push({ glyph: "fire", text: `Scalds ${Math.round(stats.burn * 1.5)}/s` });
  if (stats.shred > 0) lines.push({ glyph: "debuffArrow", text: `Crushes armor ×${stats.shred}` });
  if (stats.slow < 1 && stats.slow_ms > 0) lines.push({ glyph: "hourglass", text: `Slows ${Math.round((1 - stats.slow) * 100)}%` });
  if (stats.wet_ms > 0) lines.push({ glyph: "hose", text: `Soaks ${(stats.wet_ms / 1000).toFixed(1)}s` });
  if (stats.freeze_every > 0) lines.push({ glyph: "frost", text: `Ties up every ${stats.freeze_every}` });
  if (stats.stun_ms > 0) lines.push({ glyph: "star", text: `Stuns ${(stats.stun_ms / 1000).toFixed(1)}s` });
  if (stats.crit_every > 0) lines.push({ glyph: "star", text: `×${stats.crit_mult} every ${stats.crit_every}` });
  if (def.job === "librarian") lines.push({ glyph: "book", text: "Hushes pings" });
  if (def.job === "monk") lines.push({ glyph: "lotus", text: "Offline aura" });
  if (stats.snap > 0) lines.push({ glyph: "eye", text: "Snaps workers back" });
  if (stats.confiscate_s > 0) lines.push({ glyph: "phone", text: `Confiscates /${stats.confiscate_s.toFixed(1)}s` });
  if (stats.switchoff > 0) lines.push({ glyph: "teacup", text: `${Math.round(stats.switchoff * 100)}% switch-off` });
  if (stats.reboot_s > 0) lines.push({ glyph: "laptop", text: `Reboots /${stats.reboot_s.toFixed(0)}s` });
  if (stats.cease_s > 0) lines.push({ glyph: "gavel", text: `C&D /${stats.cease_s.toFixed(0)}s` });
  if (stats.overheat_mult > 0) lines.push({ glyph: "thermometer", text: `×${(1 + stats.overheat_mult).toFixed(1)} vs hot` });
  if (stats.air_mult > 0) lines.push({ glyph: "wing", text: `×${(1 + stats.air_mult).toFixed(1)} vs flyers` });
  if (stats.income > 0) lines.push({ glyph: "envelope", text: def.job === "mail" ? `+$${Math.round(stats.income)}/wave` : `+$${Math.round(stats.income)}/phone` });
  if (stats.power_drain > 0) lines.push({ glyph: "plug", text: `Cuts power ×${stats.power_drain}` });
  const upgradeKey = actionLabel(keys, "upgradeTower"), sellKey = actionLabel(keys, "sellTower"), aimKey = actionLabel(keys, "cycleAim");
  const refund = sellValue(world, tower.id, tower.kind);

  const title = stats.level >= 3 ? def.ranks[1] : stats.level >= 2 ? def.ranks[0] : def.label;
  const distracted = session.workers.has(tower.id, "distracted"), spotted = session.workers.has(tower.id, "spotted"), hot = session.workers.has(tower.id, "overheated");
  return <RuneView variant="stone" width={width} gap={8} label="Worker" role="dialog">
    <Row justify="between"><Heading size={20}>{title}</Heading>
      <Row gap={4} label={`Rank ${stats.level} of ${MAX_TOWER_LEVEL}`}>{Array.from({ length: MAX_TOWER_LEVEL }, (_, index) =>
        <RuneView key={index} width={9} height={9} radius={index >= 3 ? 5 : 2} fill={index < stats.level ? FIRE : "#1b2420"} border={{ width: 1, color: "#f6e7c1" }} />)}</Row>
    </Row>
    <Text size={12} color={DIM}>{`${def.label} · ${def.role}`}</Text>
    {branch === null ? null : <Tag color={FIRE}>{branch.label.toUpperCase()}</Tag>}
    {distracted || spotted || hot ? <Row gap={6}>
      {distracted ? <Row fill="#3a6aff" radius={8} padding={[2, 8, 2, 8]} gap={4}><Glyph name="phone" size={12} /><Text size={12}>On their phone</Text></Row> : null}
      {spotted ? <Row fill="#b0302a" radius={8} padding={[2, 8, 2, 8]} gap={4}><Glyph name="camera" size={12} /><Text size={12}>Spotted</Text></Row> : null}
      {hot ? <Row fill="#c86a1a" radius={8} padding={[2, 8, 2, 8]} gap={4}><Glyph name="thermometer" size={12} /><Text size={12}>Overheated</Text></Row> : null}
    </Row> : null}
    <RuneView layout="grid" columns={2} gap={5}>{lines.map((line) => <Row key={line.text} gap={5}>
      <Glyph name={line.glyph} size={14} color={line.dim === true ? DIM : INK} /><Text size={13} color={line.dim === true ? DIM : INK}>{line.text}</Text>
    </Row>)}</RuneView>
    <Plank minHeight={32} padding={[4, 10, 4, 10]} command={{ name: "cycleAim", input: { instanceId: tower.id } }} label="Aim">
      <Glyph name="eye" size={13} /><Text size={13}>{`Aim: ${AIM_LABEL[stats.aim] ?? stats.aim}`}</Text>{aimKey === null ? null : <Tag size={10}>{aimKey}</Tag>}
    </Plank>
    {fork ? <Tag color={FIRE}>CHOOSE A CAREER — THE OTHER CLOSES</Tag> : null}
    {options.length === 0 ? <Plank disabled>Top of the ladder</Plank> : null}
    <RuneView layout={fork ? "grid" : "stack"} columns={2} gap={6}>{options.map((option) => {
      const ready = option.refusal === null, cost = -((option.cost["keep.gold"] as number | undefined) ?? 0);
      // A refused step still runs, so its "needs N more gold" reaches the notice feed.
      const run = { name: "beacon.act", input: { action: option.action, target: tower.id } };
      return fork
        ? <Plank key={option.action} variant="parchment" layout="stack" command={run} opacity={ready ? 1 : 0.6} gap={3} padding={[8, 10, 8, 10]} items="start" label={option.branchLabel ?? option.label} {...(option.detail == null ? {} : { tooltip: option.detail })}>
          <Text size={14} weight={800} color="#3a2a12">{option.branchLabel ?? option.label}</Text>
          <Text size={12} color="#5a4520">{option.detail ?? option.label}</Text>
          <Text size={12} weight={800} color="#2a6a2a">{`$${cost}`}</Text>
        </Plank>
        : <Plank key={option.action} command={run} opacity={ready ? 1 : 0.6} label={`${option.label} · ${cost}`} {...(option.detail == null ? {} : { tooltip: option.detail })}>
          <Glyph name="arrowUp" size={13} /><Text size={14}>{`Promote: ${option.label} · $${cost}`}</Text>{upgradeKey === null ? null : <Tag size={10}>{upgradeKey}</Tag>}
        </Plank>;
    })}</RuneView>
    <Plank tone="enamel" minHeight={36} command={{ name: "beacon.act", input: { action: sellAction(tower.kind), target: tower.id } }} label={`Let go $${refund}`}>
      <Text size={14} color={GOLD}>$</Text><Text size={14} color="#fff4e0">{`Let go (+$${refund})`}</Text>{sellKey === null ? null : <Tag size={10} color="#f3c9a0">{sellKey}</Tag>}
    </Plank>
  </RuneView>;
}
