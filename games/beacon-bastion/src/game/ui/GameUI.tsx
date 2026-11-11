/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { useOptionalGamePhase } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { GAME_FONTS } from "../../art/fonts/fonts";
import { pauseRun } from "../menu";
import { AbilityStones, BuildBar, KeepSigns, ReleaseHorn, WaveBoard } from "./Hud";
import { BLOOD, FIRE, Glyph, beaconTheme, Text, usePhone } from "./look";
import { Memorial } from "./Memorial";
import { BeaconMenu } from "./menu/BeaconMenu";
import { TowerPanel } from "./TowerPanel";

for (const face of [GAME_FONTS.display, GAME_FONTS.body]) if (face !== undefined) registerNativeRuneFont(resolveAssetBaseUrl(face.src));

/**
 * Beacon's HUD is the keep's own signage at the screen edges - the brazier and purse sign top-left,
 * the wave board top-centre, the builder's rack along the foot - and the front end is carved stone,
 * timber and a war banner. Live-play signage shows only in play, so a title or pause owns the frame.
 */
export function GameUI() {
  const ctx = useGameContext(), phase = useOptionalGamePhase();
  const notices = useMemo(() => ({ read: ctx.game.notices.list, subscribe: ctx.game.notices.subscribe }), [ctx]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || event.repeat || gamePhase(ctx) !== "playing") return;
      event.preventDefault(); event.stopImmediatePropagation();
      pauseRun(ctx);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [ctx]);
  const live = phase === "playing" || phase === "ended";
  return <RuneRoot context={ctx} theme={beaconTheme}>
    {live ? <PlayHud notices={<RuneView anchor="top" safe inset={96} gap={6} items="center">
      <RuneTransient source={notices} expire={ctx.game.notices.prune}>{(notice) =>
        <RuneView variant="sign" padding={[6, 14, 6, 14]}><Text size={14} color={notice.tone === "deny" ? BLOOD : FIRE}>{notice.text}</Text></RuneView>}
      </RuneTransient>
    </RuneView>} /> : null}
    <BeaconMenu />
  </RuneRoot>;
}

/** Live-play signage; the notices sit under the memorial, so its stone is never written over. */
function PlayHud({ notices }: { notices: ReactNode }) {
  const ctx = useGameContext(), phone = usePhone();
  return <>
    <RuneView anchor="top-left" safe inset={phone ? 10 : 16} gap={10}><KeepSigns /><ReleaseHorn /></RuneView>
    <RuneView anchor={phone ? "top-right" : "top"} safe inset={phone ? 10 : 0} padding={phone ? [56, 0, 0, 0] : 0}><WaveBoard /></RuneView>
    <RuneView anchor="top-right" safe inset={phone ? 10 : 16}>
      <RuneAction variant="sign" width={44} height={44} padding={0} items="center" justify="center" label="Pause the defense" run={() => pauseRun(ctx)} hover="#ffffff22"><Glyph name="pause" size={20} /></RuneAction>
    </RuneView>
    <RuneView anchor="bottom" safe inset={phone ? 10 : 14}><BuildBar /></RuneView>
    <RuneView anchor="bottom-right" safe inset={phone ? 10 : 16} padding={phone ? [0, 0, 150, 0] : 0}><AbilityStones /></RuneView>
    <RuneView anchor={phone ? "bottom" : "right"} safe inset={16} padding={phone ? [0, 0, 150, 0] : 0}><TowerPanel /></RuneView>
    {notices}
    <Memorial />
  </>;
}
