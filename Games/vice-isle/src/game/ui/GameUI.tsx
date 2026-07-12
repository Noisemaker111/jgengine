import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";
import { ToastStack } from "@jgengine/react/components";
import { useActivePrompt, useGameStore } from "@jgengine/react/hooks";
import { ITEM_LABELS } from "../content";
import { prompts as buildPrompts } from "../prompts";
import { CityMinimap } from "./components/CityMinimap";
import { DialoguePanel } from "./components/DialoguePanel";
import { GaragePanel } from "./components/GaragePanel";
import { RaceHud } from "./components/RaceHud";
import { Hotbar } from "./components/Hotbar";
import { MissionTracker } from "./components/MissionTracker";
import { ShopPanel } from "./components/ShopPanel";
import { Speedo } from "./components/Speedo";
import { StatusPanel } from "./components/StatusPanel";
import { WantedStars } from "./components/WantedStars";

function PromptHint() {
  const prompts = useGameStore((ctx) => buildPrompts(ctx));
  const active = useActivePrompt(prompts);
  if (active === null) return null;
  const label = active.id.startsWith("enter:")
    ? "Enter vehicle"
    : active.id.startsWith("shop:")
      ? "Browse Ammu-Isle"
      : active.id.startsWith("garage:")
        ? "Browse Sunset Motors"
        : active.id.startsWith("race:")
          ? "Start the Ocean Loop"
          : "Talk";
  return (
    <div className="-skew-x-6 border-2 border-black bg-[#ffb020] px-3 py-1 text-sm font-black uppercase text-black shadow-[3px_3px_0_#000]">
      [E] {label}
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "vice-isle" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans">
      <HudPanel id="wanted" anchor="top" compact="keep" interactive={false}>
        <div className="flex flex-col items-center gap-2">
          <WantedStars />
          <RaceHud />
        </div>
      </HudPanel>
      <HudPanel id="settings" anchor="top-right" order={-1} compact="keep">
        <SettingsTrigger />
      </HudPanel>
      <HudPanel id="minimap" anchor="bottom-left" compact="keep" interactive={false}>
        <CityMinimap />
      </HudPanel>
      <HudPanel id="status" anchor="top-left" compact="keep" interactive={false}>
        <StatusPanel />
      </HudPanel>
      <HudPanel id="mission" anchor="right" compact="hide" interactive={false}>
        <MissionTracker />
      </HudPanel>
      <HudPanel id="hotbar" anchor="bottom" compact="keep" interactive={false}>
        <div className="flex flex-col items-center gap-2">
          <PromptHint />
          <Hotbar />
        </div>
      </HudPanel>
      <HudPanel id="speedo" anchor="bottom-right" compact="keep" interactive={false}>
        <Speedo />
      </HudPanel>
      <HudPanel id="dialogue" anchor="center" compact="keep">
        <div className="flex flex-col items-center gap-3">
          <DialoguePanel />
          <ShopPanel />
          <GaragePanel />
        </div>
      </HudPanel>
      <HudPanel id="credit" anchor="left" compact="hide" interactive={false}>
        <div className="max-w-40 border-2 border-black bg-[#12141a]/80 px-2 py-1 text-[9px] font-bold uppercase leading-tight text-[#cfd6de]/80 shadow-[2px_2px_0_#000]">
          An homage to Grand Theft Auto (Rockstar Games) in the look of Borderlands (Gearbox)
        </div>
      </HudPanel>
      <HudPanel id="loot-toasts" anchor="top-right" order={1} compact="hide" interactive={false}>
        <ToastStack
          action="loot.granted"
          renderToast={(entry) => {
            const data = entry.data as { drops?: readonly { item?: string; currency?: string; count: number }[] } | undefined;
            const first = data?.drops?.[0];
            if (first === undefined) return null;
            const label = first.item !== undefined ? (ITEM_LABELS[first.item] ?? first.item) : `$${first.count}`;
            return (
              <div className="-skew-x-6 border-2 border-black bg-[#12141a]/90 px-2 py-1 text-xs font-black uppercase text-[#ffb020] shadow-[3px_3px_0_#000]">
                + {label}
              </div>
            );
          }}
        />
      </HudPanel>
    </HudCanvas>
  );
}
