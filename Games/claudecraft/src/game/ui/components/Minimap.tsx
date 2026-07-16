import { useEffect, useMemo } from "react";
import { MinimapPanel } from "@jgengine/react/map";
import { useGameClock } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { createMarkerSet } from "@jgengine/core/world/markers";
import { padNumber } from "@jgengine/core/format/duration";

import { isMobInstance } from "../../ai/mobs";
import { NPCS } from "../../entities/npcs/catalog";
import { useZoneName } from "./Overlays";
import { useHudTick } from "../useHudTick";

function ClockReadout() {
  const { calendar } = useGameClock();
  return (
    <span>
      {padNumber(calendar.hour, 2)}:{padNumber(calendar.minute, 2)}
    </span>
  );
}

const QUESTGIVER_IDS = new Set(
  NPCS.filter((npc) => npc.kind === "questgiver").map((npc) => `npc:${npc.id}`),
);

export function Minimap() {
  const tick = useHudTick();
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
  const zoneName = useZoneName();
  if (player === null) return null;

  return (
    <MinimapPanel
      markers={markers}
      center={[player.position[0], player.position[2]]}
      worldRadius={46}
      size={168}
      facingYaw={player.rotationY}
      rotate
      title={zoneName ?? "Map"}
      clock={<ClockReadout />}
      compassProps={{ width: 168 }}
    />
  );
}
