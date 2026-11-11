/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, type ReactNode } from "@jgengine/core/ui/jsx";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { scrapHudPanels, type HudPanelId } from "./hudPanels";
import { RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useGamePhase } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { GAME_FONTS } from "../../art/fonts/fonts";
import { riftStore } from "../rift/rift";
import { relayStore } from "../relay";
import { speechStore } from "../stores";
import { hostilesNear } from "./hostiles";
import { AmmoPlate, cashOf, coresOf, Counter, DamageVignette, EchoBox, FieldNotes, HitMarker, ItemCard, LevelUpBurst, LootToasts, MissionTracker, ReactorEnding, ReserveOverlay, SpreadReticle, VitalsPlate, WeaponHotbar, ZoneBanner } from "./Hud";
import { C, Plate, Sheet, Text, scrapTheme, useCompact } from "./kit";
import { ScrapMenu } from "./Menu";
import { BlackMarketPanel, NpcDialog, OverdriveCard, OverdriveTerminal, TalentsPanel, TravelPanel, VaultPanel, VendorPanel } from "./Panels";
import { ContractCard, Operations, TerminalSettings } from "./Terminal";

for (const face of [GAME_FONTS.display, GAME_FONTS.body]) if (face !== undefined) registerNativeRuneFont(resolveAssetBaseUrl(face.src));

/**
 * The reclaimer's rig: everything the HUD shows is a piece of salvaged kit at the edge of the view.
 * The wrist unit, the magazine counter and the weapon cartridges sit along the foot; the contract
 * and mission log hang top-left; the wallet counters and the pause key top-right. Each piece dims
 * when nothing on it is changing and comes back the moment it does.
 */
export function GameUI() {
  const ctx = useGameContext();
  const { phase } = useGamePhase();
  const settings = useSettings();
  const notices = useMemo(() => ({ read: ctx.game.notices.list, subscribe: ctx.game.notices.subscribe }), [ctx]);
  return <RuneRoot context={ctx} theme={scrapTheme}>
    {phase === "menu" ? <ScrapMenu /> : <Field />}
    {settings.isOpen ? <Sheet title="Settings" close={settings.close}><TerminalSettings /></Sheet> : null}
    <RuneView anchor="top" safe inset={64} gap={6}><RuneTransient source={notices} expire={ctx.game.notices.prune}>{notice =>
      <Plate padding={[6, 12, 6, 12]} border={{ width: 2, color: notice.tone === "deny" ? C.red : C.amber }}><Text size={14} color={notice.tone === "deny" ? C.red : notice.tone === "success" ? C.xp : C.ink}>{notice.count > 1 ? `${notice.text} ×${notice.count}` : notice.text}</Text></Plate>}
    </RuneTransient></RuneView>
  </RuneRoot>;
}

/** A rig panel the player can hide from the terminal's HUD chips; hiding is a bound native patch. */
function Hideable({ id, end = false, start = false, when = true, children }: { id: HudPanelId; end?: boolean; start?: boolean; when?: boolean; children: ReactNode }) {
  const panels = scrapHudPanels();
  // An empty panel mounts no wrapper, so it leaves no gap in its column.
  if (!when) return null;
  return <RuneView hidden={bind(() => !panels.visible(id))} items={end ? "end" : start ? "start" : "center"}>{children}</RuneView>;
}

function Field() {
  const ctx = useGameContext();
  const combat = useMemo(() => () => hostilesNear(ctx), [ctx]);
  const { compact, portrait } = useCompact();
  const inRun = useStore(riftStore, s => s.run !== null && (s.run.phase === "running" || s.run.phase === "intermission"));
  const runShown = useStore(riftStore, s => s.run !== null);
  const contractLive = useStore(relayStore, s => s.phase === "defend" || s.phase === "upload");
  const speaking = useStore(speechStore, s => s !== null);
  // A short landscape phone folds the field notes under the wallet; a portrait phone stacks the foot.
  const notesRight = compact && !portrait;
  return <>
    <DamageVignette />
    <SpreadReticle />
    <HitMarker />
    <RuneView anchor="top-left" safe inset={compact ? 8 : 12} gap={compact ? 6 : 8} maxWidth={compact ? 210 : 270}>
      <Hideable id="dead-air" start when={!(inRun && !contractLive)}><ContractCard /></Hideable>
      <Hideable id="overdrive" start when={runShown}><OverdriveCard /></Hideable>
      {inRun ? null : <Hideable id="missions" start><MissionTracker /></Hideable>}
      {notesRight ? null : <Hideable id="field-notes" start><FieldNotes /></Hideable>}
    </RuneView>
    <RuneView anchor="top-right" safe inset={compact ? 8 : 12} gap={compact ? 4 : 6} items="end" padding={[compact ? 38 : 44, 0, 0, 0]} maxWidth={210}>
      <Counter icon="coin" color={C.xp} label="Cash" read={cashOf} />
      <Counter icon="gem" color={C.cores} label="Cores" read={coresOf} />
      {notesRight ? <Hideable id="field-notes" end><FieldNotes /></Hideable> : null}
      <Hideable id="loot-toasts" end><LootToasts /></Hideable>
    </RuneView>
    <RuneView anchor={portrait ? "center" : "top"} safe inset={16}><ZoneBanner /></RuneView>
    {compact ? null : <RuneView anchor="right" safe inset={12}><Hideable id="item-card"><ItemCard /></Hideable></RuneView>}
    <RuneView anchor="bottom" safe inset={compact ? 8 : 12} gap={compact ? 4 : 8} items="center" padding={[0, 0, portrait ? 220 : 0, 0]}><Hideable id="echo" when={speaking}><EchoBox /></Hideable><WeaponHotbar combat={combat} /></RuneView>
    <RuneView anchor="bottom-left" safe inset={compact ? 8 : 12}><VitalsPlate combat={combat} /></RuneView>
    <RuneView anchor="bottom-right" safe inset={compact ? 8 : 12} padding={[0, 0, portrait ? 112 : 0, 0]}><AmmoPlate combat={combat} /></RuneView>
    <Operations />
    <ReserveOverlay />
    <LevelUpBurst />
    <ReactorEnding />
    <VendorPanel />
    <NpcDialog />
    <VaultPanel />
    <TalentsPanel />
    <TravelPanel />
    <BlackMarketPanel />
    <OverdriveTerminal />
  </>;
}
