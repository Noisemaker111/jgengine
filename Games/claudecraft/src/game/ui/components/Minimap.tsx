import { useEffect, useMemo, useState } from "react";
import { Minimap as EngineMinimap } from "@jgengine/react/map";
import { useGameContext } from "@jgengine/react/provider";
import { createMarkerSet } from "@jgengine/core/world/markers";

import { isMobInstance } from "../../ai/mobs";
import { NPCS } from "../../entities/npcs/catalog";

function useHudTicker(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, []);
  return tick;
}

const QUESTGIVER_IDS = new Set(
  NPCS.filter((npc) => npc.kind === "questgiver").map((npc) => `npc:${npc.id}`),
);

export function Minimap() {
  const tick = useHudTicker();
  const ctx = useGameContext();
  const markers = useMemo(() => createMarkerSet(() => ctx.time.now()), [ctx]);

  useEffect(() => {
    markers.clear();
    for (const entity of ctx.scene.entity.list()) {
      if (entity.id === ctx.player.userId) continue;
      if (isMobInstance(ctx, entity.id)) {
        markers.add({ kind: "enemy", position: entity.position });
      } else if (entity.role === "npc") {
        markers.add({
          kind: QUESTGIVER_IDS.has(entity.id) ? "objective" : "location",
          position: entity.position,
        });
      }
    }
    for (const item of ctx.scene.worldItem.list()) {
      const position = ctx.scene.entity.get(item.instanceId)?.position;
      if (position !== undefined) markers.add({ kind: "loot", position });
    }
  }, [tick, ctx, markers]);

  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return null;

  return (
    <EngineMinimap
      markers={markers}
      center={[player.position[0], player.position[2]]}
      worldRadius={46}
      size={168}
      facingYaw={player.rotationY}
      rotate
      title="Map"
    />
  );
}
