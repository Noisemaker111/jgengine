import type { ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { roomAt } from "../../mansion/floorPlan";

export function RoomLabel(): ReactNode {
  const roomName = useGameStore((ctx) => {
    const player = ctx.scene.entity.get(ctx.player.userId);
    if (player === null) return null;
    return roomAt(player.position[0], player.position[2])?.name ?? null;
  });
  if (roomName === null) return null;
  return (
    <div className="pointer-events-none rounded border border-[#c9a227]/50 bg-[#0b0f1c]/80 px-3 py-1.5">
      <p
        className="font-serif text-sm uppercase tracking-[0.2em] text-[#c9a227]"
        style={{ textShadow: "0 1px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.08)" }}
      >
        {roomName}
      </p>
    </div>
  );
}
