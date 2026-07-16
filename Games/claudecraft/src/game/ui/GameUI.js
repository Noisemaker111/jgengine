import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";
import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { useEffect } from "react";
import { bankStore, cinematicStore, classStore, dialogueStore, mailOpenStore, panelStore, shopStore } from "../session/stores";
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
import { CreditLine, DeathOverlay, KillLootToasts, LevelUpOverlay, QuestTracker, ZoneLabel, } from "./components/Overlays";
import { ArenaPanel, FiestaBanner, FiestaHud } from "./components/Arena";
import { DelveHud, MailPanel, ValeCupHud, YumiHud } from "./components/ContentPanels";
import { PlayerFrame, TargetFrame } from "./components/UnitFrames";
function SkipIntro() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const active = useKeyedStore(cinematicStore, userId);
    useEffect(() => {
        if (!active)
            return;
        const onKey = (event) => {
            if (event.key === "Escape")
                commands.run("cinematic.skip", {});
        };
        window.addEventListener("keydown", onKey);
        const timeout = window.setTimeout(() => commands.run("cinematic.skip", {}), 9000);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.clearTimeout(timeout);
        };
    }, [active, commands]);
    if (!active)
        return null;
    return (_jsx("button", { type: "button", onClick: () => commands.run("cinematic.skip", {}), className: "wcc-panel pointer-events-auto absolute bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-md px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#c8a838] transition hover:border-[#ffd100] hover:text-[#ffd100]", style: { fontFamily: "var(--wcc-font-display)" }, children: "Skip Intro (Esc)" }));
}
export function GameUI() {
    const { userId } = usePlayer();
    const layout = useHudLayout({ storageKey: "claudecraft-hud" });
    const classId = useKeyedStore(classStore, userId);
    const panel = useKeyedStore(panelStore, userId);
    const shopOpen = useKeyedStore(shopStore, userId, (id) => id !== null);
    const dialogueOpen = useKeyedStore(dialogueStore, userId, (id) => id !== null);
    const bankOpen = useKeyedStore(bankStore, userId);
    const mailOpen = useKeyedStore(mailOpenStore, userId);
    const lockpickOpen = useGameStore((ctx) => ctx.game.store.get(`lockpick:${userId}`) !== undefined);
    const auctionOpen = useGameStore((ctx) => ctx.game.store.get(`auction:${userId}`) === true);
    if (classId === null)
        return _jsx(ClassSelect, {});
    return (_jsxs(_Fragment, { children: [_jsxs(HudCanvas, { layout: layout, children: [_jsx(HudPanel, { id: "target", anchor: "top-left", inset: { x: 12, y: 12 }, children: _jsx(TargetFrame, {}) }), _jsx(HudPanel, { id: "zone", anchor: "top", inset: { x: 0, y: 12 }, children: _jsx(ZoneLabel, {}) }), _jsx(HudPanel, { id: "fiesta-banner", anchor: "top", inset: { x: 0, y: 56 }, children: _jsx(FiestaBanner, {}) }), _jsx(HudPanel, { id: "settings", anchor: "top-right", inset: { x: 16, y: 14 }, order: -1, children: _jsx(SettingsTrigger, { className: "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-stone-700 bg-stone-950/80 text-amber-300 transition hover:border-amber-500 hover:bg-stone-800" }) }), _jsx(HudPanel, { id: "minimap", anchor: "top-right", inset: { x: 14, y: 60 }, children: _jsx(Minimap, {}) }), _jsx(HudPanel, { id: "quests", anchor: "top-right", inset: { x: 14, y: 60 }, children: _jsx(QuestTracker, {}) }), _jsx(HudPanel, { id: "content-hud", anchor: "top-right", inset: { x: 16, y: 180 }, children: _jsxs("div", { className: "flex flex-col gap-2", children: [_jsx(DelveHud, {}), _jsx(ValeCupHud, {}), _jsx(YumiHud, {}), _jsx(FiestaHud, {})] }) }), _jsx(HudPanel, { id: "chat", anchor: "bottom-left", inset: { x: 16, y: 60 }, children: _jsx(ChatLog, {}) }), _jsx(HudPanel, { id: "feed", anchor: "bottom-left", inset: { x: 16, y: 270 }, children: _jsx(KillLootToasts, {}) }), _jsx(HudPanel, { id: "bottom-bar", anchor: "bottom", inset: { x: 0, y: 10 }, children: _jsxs("div", { className: "flex flex-col items-center gap-1.5", children: [_jsx(CastBar, {}), _jsx(SwingTimer, {}), _jsx(PlayerFrame, {}), _jsx(XpBar, {}), _jsx(ActionBar, {})] }) }), _jsx(HudPanel, { id: "credit", anchor: "bottom-right", inset: { x: 14, y: 10 }, children: _jsx(CreditLine, {}) })] }), (panel === "bags" ||
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
                auctionOpen) && (_jsxs("div", { className: "pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-4", children: [dialogueOpen && _jsx(DialoguePanel, {}), shopOpen && _jsx(VendorPanel, {}), bankOpen && _jsx(BankPanel, {}), mailOpen && _jsx(MailPanel, {}), lockpickOpen && _jsx(LockpickPanel, {}), auctionOpen && _jsx(AuctionPanel, {}), panel === "bags" && _jsx(BagsPanel, {}), panel === "character" && _jsx(CharacterPanel, {}), panel === "quests" && _jsx(QuestLogPanel, {}), panel === "spellbook" && _jsx(SpellbookPanel, {}), panel === "talents" && _jsx(TalentPanel, {}), panel === "crafting" && _jsx(CraftingPanel, {}), panel === "arena" && _jsx(ArenaPanel, {})] })), _jsx(SkipIntro, {}), _jsx(FishingOverlay, {}), _jsx(LevelUpOverlay, {}), _jsx(DeathOverlay, {})] }));
}
