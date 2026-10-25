import type { CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import { useGameFonts } from "@jgengine/react/gameFonts";
import { GAME_MATERIALS } from "@jgengine/react/gameFrame";
import { useGameContext } from "@jgengine/react/provider";

import { GAME_FONTS } from "../../art/fonts/fonts";
import { hudStore } from "../hudStore";
import { preferences } from "../preferences";
import { CommandMenu } from "./CommandMenu";
import { RtsHud } from "./components/Hud";
import { WaxSeal } from "./kit/WaxSeal";
import { EMBER_FONTS } from "./theme";

/** The faces, plus the engine's stone look as a plain background, so the many small tokens
 * on the command board share the frames' material without a frame each. */
const ROOT_VARS = {
  "--ec-font-display": EMBER_FONTS.fontDisplay,
  "--ec-font-body": EMBER_FONTS.fontBody,
  "--ec-font-numeric": EMBER_FONTS.fontNumeric,
  "--ec-stone": `${GAME_MATERIALS.stone.layers}, ${GAME_MATERIALS.stone.base}`,
  "--ec-stone-blend": `${GAME_MATERIALS.stone.blend}, normal`,
} as CSSProperties;

/** Ember Command's war table: the ledger strip and pinned orders along the top, the survey map, Bram's
 * card and the command board along the bottom, and a wax seal to call a halt. Unit selection rings
 * and the marquee are drawn by the shell. */
export function GameUI() {
  useGameFonts(GAME_FONTS);
  const ctx = useGameContext();
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
  const commands = ctx.game.commands;
  const field = hud.phase === "playing" || hud.phase === "paused";
  return (
    <div
      className={`ec-root ${prefs.largeText ? "ec-large" : ""} ${prefs.highContrast ? "ec-contrast" : ""} ${prefs.reducedMotion ? "ec-still" : ""}`}
      style={ROOT_VARS}
    >
      {hud.phase !== "ready" && <RtsHud />}
      {field ? (
        <button
          type="button"
          className="ec-pause"
          aria-label={hud.phase === "playing" ? "Pause battle" : "Resume battle"}
          onClick={() => commands.run(hud.phase === "playing" ? "match.pause" : "match.resume", {})}
        >
          <WaxSeal size={58} emblem="pause" />
        </button>
      ) : null}
      <CommandMenu />
    </div>
  );
}
