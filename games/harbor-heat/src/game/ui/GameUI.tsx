/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo } from "@jgengine/core/ui/jsx";
import { RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { ITEM_LABELS } from "../content";
import { sessionStore } from "../session";
import { phoneStore } from "../cityRuntime";
import { CityMinimap } from "./Chart";
import { CityPhone } from "./CityPhone";
import { Counters } from "./Counters";
import { HarborMenu, SettingsPhone, useGameStarted } from "./HarborMenu";
import { BeltHotbar, HitTick, HudKeys, Objective, RadioReadout, Speedo, StatusPanel, WantedStars } from "./Hud";
import { Text, useRoom } from "./kit";
import { SessionUI } from "./SessionUI";
import { harborTheme, HH, registerHarborFonts } from "./theme";

registerHarborFonts();

/** Pickups speak through the notice feed, like every other notice. */
function useLootNotices() {
  const ctx = useGameContext();
  useEffect(() => ctx.game.events.on("loot.granted", ({ userId, drops }) => {
    if (userId !== ctx.player.userId) return;
    for (const drop of drops) ctx.game.notices.push({ text: `+ ${drop.item === undefined ? `$${drop.count}` : (ITEM_LABELS[drop.item] ?? drop.item)}`, tone: "success" });
  }), [ctx]);
}

/**
 * The street HUD, anchored to the screen's edges: pager top-left, scanner top-centre, keys and wallet
 * top-right, the city phone on the right, the chart bottom-left, the belt bottom-centre and the dash
 * bottom-right. On a phone the touch stick and verbs own the bottom corners, so the chart and dash rise.
 */
function Hud() {
  const room = useRoom();
  // The burner comes out over the right edge: the wallet steps aside, and on a phone so does the dash.
  const phone = useStore(phoneStore, (open) => open === true);
  const wide = room === "wide";
  const stacked = room === "stacked";
  const edge = wide ? 18 : 10;
  return (
    <RuneView anchor="fill">
      <HitTick />
      <RuneView anchor="top-left" safe inset={edge} gap={8}>
        <Objective />
        {stacked && !phone ? <StatusPanel /> : null}
      </RuneView>
      {stacked ? null : <RuneView anchor="top" safe inset={edge} padding={wide ? 0 : [56, 0, 0, 0]}><WantedStars /></RuneView>}
      <RuneView anchor="top-right" safe inset={edge} items="end" gap={8}>
        <HudKeys />
        {stacked || phone ? null : <StatusPanel />}
        {wide || phone ? null : <CityMinimap />}
        {stacked && !phone ? <WantedStars /> : null}
      </RuneView>
      <RuneView anchor="right" safe inset={edge}><CityPhone /></RuneView>
      {wide ? <RuneView anchor="bottom-left" safe inset={edge}><CityMinimap /></RuneView> : null}
      {phone && !wide ? null : <RuneView anchor="bottom" safe inset={edge} padding={wide ? 0 : [0, 0, stacked ? 150 : 8, 0]}><BeltHotbar /></RuneView>}
      {phone ? null : <RuneView anchor={wide ? "bottom-right" : stacked ? "bottom" : "right"} safe inset={edge} items={stacked ? "center" : "end"} gap={8} padding={wide ? 0 : stacked ? [0, 0, 236, 0] : [140, 0, 0, 0]}>
        <RadioReadout />
        <Speedo />
      </RuneView>}
    </RuneView>
  );
}

/** Notices from the feed: loot, refusals, saves. Each expires on its own. */
function Notices() {
  const ctx = useGameContext();
  const source = useMemo(() => ({ read: ctx.game.notices.list, subscribe: ctx.game.notices.subscribe }), [ctx]);
  const room = useRoom();
  const { width } = useRuneViewport();
  return (
    <RuneView anchor="top" safe inset={10} padding={[room === "wide" ? 110 : room === "stacked" ? 318 : 140, 0, 0, 0]} gap={6} items="center">
      <RuneTransient source={source} expire={ctx.game.notices.prune}>
        {(notice) => (
          <RuneView maxWidth={Math.min(560, width - 40)} padding={[6, 14, 5, 14]} fill={notice.tone === "deny" ? HH.coral : notice.tone === "success" ? HH.amber : HH.cream} border={{ width: 2, color: HH.night }} radius={3}
            shadow={{ x: 3, y: 3, blur: 0, color: "#071d25cc" }}>
            <Text family={harborTheme.text.heading.family} size={18} tracking={0.6} color={HH.night} text={notice.text} />
          </RuneView>
        )}
      </RuneTransient>
    </RuneView>
  );
}

export function GameUI() {
  const ctx = useGameContext();
  const started = useGameStarted();
  const paused = useStore(sessionStore, (session) => session.paused);
  const settings = useSettings();
  useLootNotices();
  const playing = started && !paused;
  return (
    <RuneRoot context={ctx} theme={harborTheme}>
      {playing && !settings.isOpen ? <Hud /> : null}
      {/* Counters, talk and receipts are full-screen moments over the HUD. */}
      {playing ? <Counters /> : null}
      <SessionUI />
      <HarborMenu />
      {settings.isOpen ? <SettingsPhone close={settings.close} /> : null}
      <Notices />
    </RuneRoot>
  );
}
