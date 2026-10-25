import { useGame } from "@jgengine/react/hooks";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { BUILDABLES, RIDE_GROUPS, RIDE_GROUP_LABEL, type BuildableDef } from "../../objects/catalog";
import { researched } from "../../park";
import { usePark } from "../usePark";

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
  const w = usePark();
  const orders = w.orders("lab");
  const queued = new Set(orders.map((order) => order.label));
  return (
    <KitPanel variant="card" aria-label="Research lab" eyebrow="🔬 The lab" title="Research"
      aside={<KitButton variant="ghost" size="sm" cue="close" aria-label="Close research lab" onClick={onClose}>✕</KitButton>}>
      <p className="bw-blurb">{orders.length === 0 ? "Idle: pick a topic. Each opens after the one before it in its family." : `${orders.length} in the lab`}</p>
      {orders.map((order) => (
        <KitMeter key={order.id} size="sm" label={order.label.replace(/^Research /, "")} value={order.progress} max={1}
          readout={order.active ? `${Math.ceil(order.remaining)}s` : "waiting"} tone="warn" />
      ))}
      {families().map((family) => (
        <section key={family.id} className="bw-lab" aria-label={family.label}>
          <h3>{family.label}</h3>
          {family.topics.map((def) => {
            const action = `research_${def.id}`;
            const done = w.fact(researched(def.id)) === true;
            const inLab = queued.has(`Research ${def.label}`);
            const refusal = done || inLab ? null : w.canAct(action);
            return (
              <KitButton key={def.id} size="sm" variant={done || refusal !== null ? "ghost" : "secondary"} disabled={done || inLab || refusal !== null}
                icon={done ? "✓" : inLab ? "⏳" : refusal !== null ? "🔒" : def.icon} title={refusal?.message ?? def.blurb}
                onClick={() => commands.run("brightway.act", { action })}
                glyph={done ? "ready" : inLab ? "in lab" : `$${def.research!.cost.toLocaleString()} · ${def.research!.seconds}s`}>
                {def.label}
              </KitButton>
            );
          })}
        </section>
      ))}
    </KitPanel>
  );
}
