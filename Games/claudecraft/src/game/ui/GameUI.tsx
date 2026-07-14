import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";
import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { useEffect } from "react";

import { ActionBar, CastBar, XpBar } from "./components/ActionBar";
import { ChatLog } from "./components/ChatLog";
import { AuctionPanel } from "./components/Auction";
import { ClassSelect } from "./components/ClassSelect";
import { DialoguePanel } from "./components/Dialogue";
import { BankPanel } from "./components/Bank";
import { CraftingPanel, FishingOverlay } from "./components/Crafting";
import { Minimap } from "./components/Minimap";
import { BagsPanel, CharacterPanel, LockpickPanel, QuestLogPanel, VendorPanel } from "./components/Panels";
import { SpellbookPanel } from "./components/Spellbook";
import { SwingTimer } from "./components/SwingTimer";
import { TalentPanel } from "./components/Talents";
import {
  CreditLine,
  DeathOverlay,
  KillLootToasts,
  LevelUpOverlay,
  QuestTracker,
  ZoneLabel,
} from "./components/Overlays";
import { ArenaPanel, FiestaBanner, FiestaHud } from "./components/Arena";
import { DelveHud, MailPanel, ValeCupHud, YumiHud } from "./components/ContentPanels";
import { PlayerFrame, TargetFrame } from "./components/UnitFrames";

function SkipIntro() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const active = useGameStore((ctx) => ctx.game.store.get(`cinematic:${userId}`) === true);
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") commands.run("cinematic.skip", {});
    };
    window.addEventListener("keydown", onKey);
    const timeout = window.setTimeout(() => commands.run("cinematic.skip", {}), 9000);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timeout);
    };
  }, [active, commands]);
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={() => commands.run("cinematic.skip", {})}
      className="wcc-panel pointer-events-auto absolute bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-md px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#c8a838] transition hover:border-[#ffd100] hover:text-[#ffd100]"
      style={{ fontFamily: "var(--wcc-font-display)" }}
    >
      Skip Intro (Esc)
    </button>
  );
}

export function GameUI() {
  const { userId } = usePlayer();
  const layout = useHudLayout({ storageKey: "claudecraft-hud" });
  const classId = useGameStore((ctx) => ctx.game.store.get(`class:${userId}`)) as string | undefined;
  const panel = useGameStore((ctx) => ctx.game.store.get(`panel:${userId}`)) as string | undefined | null;
  const shopOpen = useGameStore((ctx) => typeof ctx.game.store.get(`shop:${userId}`) === "string");
  const dialogueOpen = useGameStore((ctx) => typeof ctx.game.store.get(`dialogue:${userId}`) === "string");
  const bankOpen = useGameStore((ctx) => ctx.game.store.get(`bank:${userId}`) === true);
  const mailOpen = useGameStore((ctx) => ctx.game.store.get(`mail:${userId}`) === true);
  const lockpickOpen = useGameStore((ctx) => ctx.game.store.get(`lockpick:${userId}`) !== undefined);
  const auctionOpen = useGameStore((ctx) => ctx.game.store.get(`auction:${userId}`) === true);
  if (classId === undefined) return <ClassSelect />;
  return (
    <>
      <HudCanvas layout={layout}>
        <HudPanel id="target" anchor="top-left" inset={{ x: 12, y: 12 }}>
          <TargetFrame />
        </HudPanel>
        <HudPanel id="zone" anchor="top" inset={{ x: 0, y: 12 }}>
          <ZoneLabel />
        </HudPanel>
        <HudPanel id="fiesta-banner" anchor="top" inset={{ x: 0, y: 56 }}>
          <FiestaBanner />
        </HudPanel>
        <HudPanel id="settings" anchor="top-right" inset={{ x: 16, y: 14 }} order={-1}>
          <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-stone-700 bg-stone-950/80 text-amber-300 transition hover:border-amber-500 hover:bg-stone-800" />
        </HudPanel>
        <HudPanel id="minimap" anchor="top-right" inset={{ x: 14, y: 60 }}>
          <Minimap />
        </HudPanel>
        <HudPanel id="quests" anchor="top-right" inset={{ x: 14, y: 60 }}>
          <QuestTracker />
        </HudPanel>
        <HudPanel id="content-hud" anchor="top-right" inset={{ x: 16, y: 180 }}>
          <div className="flex flex-col gap-2">
            <DelveHud />
            <ValeCupHud />
            <YumiHud />
            <FiestaHud />
          </div>
        </HudPanel>
        <HudPanel id="chat" anchor="bottom-left" inset={{ x: 16, y: 60 }}>
          <ChatLog />
        </HudPanel>
        <HudPanel id="feed" anchor="bottom-left" inset={{ x: 16, y: 270 }}>
          <KillLootToasts />
        </HudPanel>
        <HudPanel id="bottom-bar" anchor="bottom" inset={{ x: 0, y: 10 }}>
          <div className="flex flex-col items-center gap-1.5">
            <CastBar />
            <SwingTimer />
            <PlayerFrame />
            <XpBar />
            <ActionBar />
          </div>
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
        panel === "arena" ||
        shopOpen ||
        dialogueOpen ||
        bankOpen ||
        mailOpen ||
        lockpickOpen ||
        auctionOpen) && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-4">
          {dialogueOpen && <DialoguePanel />}
          {shopOpen && <VendorPanel />}
          {bankOpen && <BankPanel />}
          {mailOpen && <MailPanel />}
          {lockpickOpen && <LockpickPanel />}
          {auctionOpen && <AuctionPanel />}
          {panel === "bags" && <BagsPanel />}
          {panel === "character" && <CharacterPanel />}
          {panel === "quests" && <QuestLogPanel />}
          {panel === "spellbook" && <SpellbookPanel />}
          {panel === "talents" && <TalentPanel />}
          {panel === "crafting" && <CraftingPanel />}
          {panel === "arena" && <ArenaPanel />}
        </div>
      )}
      <SkipIntro />
      <FishingOverlay />
      <LevelUpOverlay />
      <DeathOverlay />
    </>
  );
}
