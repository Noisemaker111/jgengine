/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneRoot } from "@jgengine/core/ui/rune/primitives.view";
import { useGamePhase, useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { openScreen } from "../screens";
import { Hud, playFocus } from "./Hud";
import { fernTheme } from "./kit";
import { PauseMenu, TitleMenu } from "./Menu";
import { InventoryScreen } from "./Screens";

/** Title over the standing island, the survivor HUD while playing, the survivor screens and the pause menu over it. */
export function GameUI(): ReactNode {
  const ctx = useGameContext();
  const { phase } = useGamePhase();
  const screen = useGameStore(openScreen);
  const notices = useMemo(() => ({ read: ctx.game.notices.list, subscribe: ctx.game.notices.subscribe, expire: ctx.game.notices.prune }), [ctx]);
  // The native canvas takes focus when it mounts; play reads keys from the play surface, so entering play hands it back.
  useEffect(() => {
    if (phase === "playing") playFocus();
  }, [phase]);
  return (
    <RuneRoot context={ctx} theme={fernTheme}>
      {phase === "menu" ? <TitleMenu /> : <Hud notices={notices} />}
      {phase !== "menu" && screen !== null ? <InventoryScreen tab={screen} /> : null}
      {phase === "paused" ? <PauseMenu /> : null}
    </RuneRoot>
  );
}
