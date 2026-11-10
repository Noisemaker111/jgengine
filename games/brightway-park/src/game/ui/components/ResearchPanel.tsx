/** @jsxImportSource @jgengine/core/ui/jsx */
import { useGame, useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { live } from "@jgengine/core/ui/liveValue";
import { KitButton, KitMeter, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";

import { BUILDABLES, RIDE_GROUPS, RIDE_GROUP_LABEL, type BuildableDef } from "../../objects/catalog";
import { parkDuration } from "../../books";
import { park, RESEARCH_PACE, researched } from "../../park";

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

/**
 * The research lab. Each topic is the world's `research_<kind>` action: its fee up front, its time
 * in the `lab` queue. The panel reads the queue and every topic's refusal from the world.
 */
export function ResearchPanel({ onClose }: { onClose: () => void }) {
  const { commands } = useGame();
  const ctx = useGameContext();
  // The lab as plain values: the queue's progress bars and each topic's state, compared by value.
  const v = useGameStore((c) => {
    const w = park.of(c);
    const orders = w.orders("lab").map((order) => ({ id: order.id, label: order.label, readout: order.active ? parkDuration(order.remaining) : "waiting" }));
    const queued = new Set(orders.map((order) => order.label));
    const topics = Object.fromEntries(families().flatMap((family) => family.topics.map((def) => {
      const done = w.fact(researched(def.id)) === true, inLab = queued.has(`Research ${def.label}`);
      return [def.id, { done, inLab, refusal: done || inLab ? null : w.canAct(`research_${def.id}`)?.message ?? null }];
    })));
    return { orders, topics };
  });
  const orders = v.orders;
  return (
    <KitPanel variant="card" aria-label="Research lab" eyebrow="🔬 The lab" title="Research"
      aside={<KitButton variant="ghost" size="sm" cue="close" aria-label="Close research lab" onClick={onClose}>✕</KitButton>}>
      <p className="bw-blurb">{orders.length === 0 ? "Idle: pick a topic. Each opens after the one before it in its family." : `${orders.length} in the lab`}</p>
      {orders.map((order) => (
        <KitMeter key={order.id} size="sm" label={order.label.replace(/^Research /, "")} value={live(() => park.of(ctx).orders("lab").find((entry) => entry.id === order.id)?.progress ?? 1)} max={1}
          readout={order.readout} tone="warn" />
      ))}
      {families().map((family) => (
        <section key={family.id} className="bw-lab" aria-label={family.label}>
          <h3>{family.label}</h3>
          {family.topics.map((def) => {
            const action = `research_${def.id}`;
            const { done, inLab, refusal } = v.topics[def.id] ?? { done: false, inLab: false, refusal: null };
            return (
              <KitButton key={def.id} data-research={def.id} size="sm" variant={done || refusal !== null ? "ghost" : "secondary"} disabled={done || inLab || refusal !== null}
                icon={done ? "✓" : inLab ? "⏳" : refusal !== null ? "🔒" : def.icon} title={refusal ?? def.blurb}
                onClick={() => commands.run("brightway.act", { action })}
                glyph={done ? "ready" : inLab ? "in lab" : `$${(def.research?.cost ?? 0).toLocaleString()} · ${parkDuration((def.research?.seconds ?? 0) * RESEARCH_PACE)}`}>
                {def.label}
              </KitButton>
            );
          })}
        </section>
      ))}
    </KitPanel>
  );
}
