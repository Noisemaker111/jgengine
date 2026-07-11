import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { useGameStore, usePlayer } from "@jgengine/react/hooks";
import { SettingsTrigger } from "@jgengine/react";

import { ActionBar, CastBar, XpBar } from "./components/ActionBar";
import { ClassSelect } from "./components/ClassSelect";
import { DialoguePanel } from "./components/Dialogue";
import { BankPanel } from "./components/Bank";
import { CraftingPanel, FishingOverlay } from "./components/Crafting";
import { BagsPanel, CharacterPanel, QuestLogPanel, VendorPanel } from "./components/Panels";
import { SpellbookPanel } from "./components/Spellbook";
import { TalentPanel } from "./components/Talents";
import {
  CreditLine,
  DeathOverlay,
  KillLootToasts,
  LevelUpOverlay,
  QuestTracker,
  ZoneLabel,
} from "./components/Overlays";
import { DelveHud, MailPanel, ValeCupHud, YumiHud } from "./components/ContentPanels";
import { PlayerFrame, TargetFrame } from "./components/UnitFrames";

export function GameUI() {
  const { userId } = usePlayer();
  const layout = useHudLayout({ storageKey: "claudecraft-hud" });
  const classId = useGameStore((ctx) => ctx.game.store.get(`class:${userId}`)) as string | undefined;
  const panel = useGameStore((ctx) => ctx.game.store.get(`panel:${userId}`)) as string | undefined | null;
  const shopOpen = useGameStore((ctx) => typeof ctx.game.store.get(`shop:${userId}`) === "string");
  const dialogueOpen = useGameStore((ctx) => typeof ctx.game.store.get(`dialogue:${userId}`) === "string");
  const bankOpen = useGameStore((ctx) => ctx.game.store.get(`bank:${userId}`) === true);
  const mailOpen = useGameStore((ctx) => ctx.game.store.get(`mail:${userId}`) === true);
  if (classId === undefined) return <ClassSelect />;
  return (
    <>
      <HudCanvas layout={layout}>
        <HudPanel id="player" anchor="top-left" inset={{ x: 16, y: 14 }}>
          <PlayerFrame />
        </HudPanel>
        <HudPanel id="target" anchor="top-left" inset={{ x: 16, y: 118 }}>
          <TargetFrame />
        </HudPanel>
        <HudPanel id="zone" anchor="top" inset={{ x: 0, y: 12 }}>
          <ZoneLabel />
        </HudPanel>
        <HudPanel id="settings" anchor="top-right" inset={{ x: 16, y: 14 }} order={-1}>
          <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-stone-700 bg-stone-950/80 text-amber-300 transition hover:border-amber-500 hover:bg-stone-800" />
        </HudPanel>
        <HudPanel id="quests" anchor="top-right" inset={{ x: 16, y: 14 }}>
          <QuestTracker />
        </HudPanel>
        <HudPanel id="content-hud" anchor="top-right" inset={{ x: 16, y: 180 }}>
          <div className="flex flex-col gap-2">
            <DelveHud />
            <ValeCupHud />
            <YumiHud />
          </div>
        </HudPanel>
        <HudPanel id="feed" anchor="bottom-left" inset={{ x: 16, y: 60 }}>
          <KillLootToasts />
        </HudPanel>
        <HudPanel id="cast" anchor="bottom" inset={{ x: 0, y: 132 }}>
          <CastBar />
        </HudPanel>
        <HudPanel id="actionbar" anchor="bottom" inset={{ x: 0, y: 64 }}>
          <ActionBar />
        </HudPanel>
        <HudPanel id="xp" anchor="bottom" inset={{ x: 0, y: 26 }}>
          <XpBar />
        </HudPanel>
        <HudPanel id="credit" anchor="bottom-right" inset={{ x: 14, y: 10 }}>
          <CreditLine />
        </HudPanel>
      </HudCanvas>
      {(panel === "bags" ||
        panel === "character" ||
        panel === "quests" ||
        panel === "spellbook" ||
        panel === "talents" ||
        panel === "crafting" ||
        shopOpen ||
        dialogueOpen ||
        bankOpen ||
        mailOpen) && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-4">
          {dialogueOpen && <DialoguePanel />}
          {shopOpen && <VendorPanel />}
          {bankOpen && <BankPanel />}
          {mailOpen && <MailPanel />}
          {panel === "bags" && <BagsPanel />}
          {panel === "character" && <CharacterPanel />}
          {panel === "quests" && <QuestLogPanel />}
          {panel === "spellbook" && <SpellbookPanel />}
          {panel === "talents" && <TalentPanel />}
          {panel === "crafting" && <CraftingPanel />}
        </div>
      )}
      <FishingOverlay />
      <LevelUpOverlay />
      <DeathOverlay />
    </>
  );
}
