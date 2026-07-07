import { useEntityStat, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";
import { entityNameById } from "../../content";
import { AnimatedResourceBar } from "./AnimatedResourceBar";

export function TargetFrame() {
  const { userId } = usePlayer();
  const targetId = useTarget(userId);
  const catalogId = useGameStore((ctx) =>
    targetId === null ? null : (ctx.scene.entity.get(targetId)?.name ?? null),
  );
  const health = useEntityStat(targetId ?? "", "health");

  if (targetId === null || catalogId === null) return null;

  return (
    <div className="min-w-[14rem] drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
      <div className="mb-1 truncate text-base font-bold text-red-200">{entityNameById(catalogId)}</div>
      {health !== null ? (
        <AnimatedResourceBar
          instanceId={targetId}
          statId="health"
          mode="health"
          fillClassName="bg-gradient-to-r from-red-800 to-red-500"
          label="Health"
          textClassName="text-red-50"
        />
      ) : null}
    </div>
  );
}