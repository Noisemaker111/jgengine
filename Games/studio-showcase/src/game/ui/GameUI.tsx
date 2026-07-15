import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useEntityStat, usePlayer } from "@jgengine/react/hooks";

function HealthPill() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  return (
    <div className="rounded-sm bg-black/70 px-3 py-1 text-sm font-bold text-emerald-300">
      {Math.round(health?.current ?? 0)} / {Math.round(health?.max ?? 0)} HP
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "studio-showcase" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      <HudPanel id="health" anchor="bottom-left" compact="keep" interactive={false}>
        <HealthPill />
      </HudPanel>
    </HudCanvas>
  );
}
