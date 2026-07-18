import { WorldNameplates, type NameplateSample } from "@jgengine/shell/world/WorldHud";

import { session } from "../session";

const FRIENDLY = "#46c85a";
const HOSTILE = "#e0553b";

/** WC3-style floating health bars: green over your Vanguard, red over the Marauders, wider for
 * keeps. Replaces the shell's always-red world bars so friend/foe reads at a glance. */
function renderBar(sample: NameplateSample) {
  if (sample.percent === null) return null; // decor / statless entities
  const unit = session.units.get(sample.id);
  const hostile = unit?.faction === "enemy";
  const building = unit?.kind === "building";
  const width = building ? 66 : unit?.catalogId === "hero" ? 44 : 32;
  return (
    <div style={{ transform: "translate(-50%, -100%)" }}>
      <div
        style={{
          width,
          height: building ? 7 : 5,
          borderRadius: 2,
          background: "rgba(0,0,0,0.6)",
          border: "1px solid rgba(0,0,0,0.75)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${sample.percent * 100}%`, height: "100%", background: hostile ? HOSTILE : FRIENDLY }} />
      </div>
    </div>
  );
}

/** VFX-only overlay: the faction health bars. The authored map dressing (dirt war-road ribbon +
 * instanced forest ring) is auto-mounted by `defineGame({ editorLayers })`; units/keeps/props are
 * spawned as entities elsewhere, so `scenePlacement` stays off — no double render. */
export function IronholdWorldOverlay() {
  return <WorldNameplates statId="health" maxDistance={999} tickMs={100} renderNameplate={renderBar} />;
}
