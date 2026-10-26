import { devtools } from "@jgengine/core/devtools/devtools";

import type { ShellMultiplayer } from "../multiplayer";
import { ms, PanelStatRow } from "./panelAtoms";

export function NetPanel({ multiplayer }: { multiplayer: ShellMultiplayer | null }) {
  const stats = devtools.latency.stats();
  if (multiplayer === null) {
    return <div className="text-neutral-400">Offline — no multiplayer backend attached.</div>;
  }
  return (
    <div className="space-y-2">
      <PanelStatRow name="game / user" value={`${multiplayer.gameId} / ${multiplayer.userId}`} />
      {stats === null ? (
        <div className="text-neutral-400">No round trips observed yet — latency is sampled from real backend calls.</div>
      ) : (
        <>
          <PanelStatRow name="last round trip" value={ms(stats.lastMs)} alert={stats.lastMs > 250} />
          <PanelStatRow name="avg / min / max" value={`${ms(stats.avgMs)} / ${ms(stats.minMs)} / ${ms(stats.maxMs)}`} />
          <PanelStatRow name="samples" value={String(stats.samples)} />
        </>
      )}
    </div>
  );
}
