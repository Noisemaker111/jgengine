import { useDisplayProfile } from "@jgengine/react/display";
import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";

import { Hotbar } from "./Hotbar";
import { Objectives } from "./Objectives";
import { PickupToast } from "./PickupToast";
import { ResourceTally } from "./ResourceTally";

export function GameUI() {
  const { coarsePointer } = useDisplayProfile();
  const layout = useHudLayout({ storageKey: "voxel-mine" });
  return (
    <HudCanvas layout={layout}>
      <HudPanel id="objectives" anchor="top-left" inset={{ x: 16, y: 16 }}>
        <Objectives />
      </HudPanel>
      <HudPanel id="resource-tally" anchor="top-right" inset={{ x: 16, y: 16 }} className="flex flex-col items-end gap-2">
        <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md bg-black/45 text-white/70 ring-1 ring-white/10 transition hover:bg-black/60 hover:text-white" />
        <ResourceTally />
      </HudPanel>
      <div className={`absolute inset-x-0 flex justify-center ${coarsePointer ? "bottom-72" : "bottom-28"}`}>
        <PickupToast />
      </div>
      <HudPanel id="hotbar" anchor="bottom" inset={{ x: 0, y: coarsePointer ? 208 : 24 }}>
        <Hotbar />
      </HudPanel>
    </HudCanvas>
  );
}
