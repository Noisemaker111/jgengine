/** @jsxImportSource @jgengine/core/ui/jsx */
import { useGame, useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { BUILDABLES, RIDE_GROUPS, RIDE_GROUP_LABEL, type BuildableDef } from "../objects/catalog";
import { parkDuration } from "../books";
import { park, RESEARCH_PACE, researched } from "../park";
import { Button, GOOD, Meter, PENCIL, Row, Tag, Text, WARN, Window } from "./look";

/** The lab's families: every ride group, then shops, theming and staff. */
function families(): { id: string; label: string; topics: BuildableDef[] }[] {
  const all = Object.values(BUILDABLES);
  const researchable = (list: BuildableDef[]) => list.filter((def) => def.research !== undefined);
  return [
    ...RIDE_GROUPS.map((group) => ({ id: group, label: RIDE_GROUP_LABEL[group], topics: researchable(all.filter((def) => def.ride?.group === group)) })),
    { id: "stall", label: "Shops", topics: researchable(all.filter((def) => def.category === "stall")) },
    { id: "scenery", label: "Theming", topics: researchable(all.filter((def) => def.category === "scenery")) },
    { id: "staff", label: "Staff", topics: researchable(all.filter((def) => def.category === "staff")) },
  ].filter((family) => family.topics.length > 0);
}
const FAMILIES = families();

/**
 * The research lab. Each topic is the world's `research_<kind>` action: its fee up front, its time
 * in the `lab` queue. The panel reads the queue and every topic's refusal from the world.
 */
export function ResearchPanel({ onClose }: { onClose: () => void }) {
  const { commands } = useGame();
  const ctx = useGameContext();
  // The lab as plain values: the queue and each topic's state, compared by value. Progress binds at the bar.
  const v = useGameStore((c) => {
    const w = park.of(c);
    const orders = w.orders("lab").map((order) => ({ id: order.id, label: order.label, readout: order.active ? parkDuration(order.remaining) : "waiting" }));
    const queued = new Set(orders.map((order) => order.label));
    const topics = Object.fromEntries(FAMILIES.flatMap((family) => family.topics.map((def) => {
      const done = w.fact(researched(def.id)) === true, inLab = queued.has(`Research ${def.label}`);
      return [def.id, { done, inLab, refusal: done || inLab ? null : w.canAct(`research_${def.id}`)?.message ?? null }];
    })));
    return { orders, topics };
  });
  return <Window eyebrow="The lab" title="Research" close={onClose} closeLabel="Close research lab">
    <Text size={13} color={PENCIL}>{v.orders.length === 0 ? "Idle: pick a topic. Each opens after the one before it in its family." : `${v.orders.length} in the lab`}</Text>
    {v.orders.map((order) => <Meter key={order.id} label={order.label.replace(/^Research /, "").toUpperCase()} read={() => park.of(ctx).orders("lab").find((entry) => entry.id === order.id)?.progress ?? 1} max={() => 1} readout={() => order.readout} color={WARN} />)}
    {FAMILIES.map((family) => <RuneView key={family.id} gap={4} label={family.label}>
      <Tag>{family.label.toUpperCase()}</Tag>
      {family.topics.map((def) => {
        const { done, inLab, refusal } = v.topics[def.id] ?? { done: false, inLab: false, refusal: null };
        const state = done ? "ready" : inLab ? "in lab" : `$${(def.research?.cost ?? 0).toLocaleString()} · ${parkDuration((def.research?.seconds ?? 0) * RESEARCH_PACE)}`;
        return <Button key={def.id} hint={`research:${def.id}`} tone={done || refusal !== null ? "ghost" : "ticket"} disabled={done || inLab || refusal !== null} tooltip={refusal ?? def.blurb}
          onPress={() => commands.run("brightway.act", { action: `research_${def.id}` })}>
          <Row justify="between" width={{ fraction: 1 }}><Text weight={800} grow={1} shrink>{`${done ? "✓ " : refusal !== null ? "Locked · " : ""}${def.label}`}</Text><Text size={12} color={done ? GOOD : PENCIL}>{state}</Text></Row>
        </Button>;
      })}
    </RuneView>)}
  </Window>;
}
