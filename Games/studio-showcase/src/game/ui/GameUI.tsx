import { useSyncExternalStore } from "react";

import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useEntityStat, usePlayer } from "@jgengine/react/hooks";

import { currentAnnouncement, subscribeAnnouncement } from "../triggers";

function HealthPill() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  return (
    <div className="rounded-sm bg-black/70 px-3 py-1 text-sm font-bold text-emerald-300">
      {Math.round(health?.current ?? 0)} / {Math.round(health?.max ?? 0)} HP
    </div>
  );
}

function TriggerBanner() {
  const announcement = useSyncExternalStore(subscribeAnnouncement, currentAnnouncement, () => null);
  if (announcement === null) return null;
  const tone =
    announcement.tone === "warn"
      ? "text-amber-300"
      : announcement.tone === "good"
        ? "text-emerald-300"
        : "text-cyan-200";
  return (
    <div className={`rounded-sm bg-black/75 px-3 py-1.5 text-sm font-semibold ${tone}`}>
      {announcement.message}
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
      <HudPanel id="trigger-banner" anchor="top" compact="keep" interactive={false}>
        <TriggerBanner />
      </HudPanel>
    </HudCanvas>
  );
}
