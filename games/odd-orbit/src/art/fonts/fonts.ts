import type { GameFontPairing } from "@jgengine/react/gameFonts";

/** This game's bundled fonts (OFL 1.1; see OFL.txt and SOURCE.md beside them). Load with `useGameFonts(GAME_FONTS)`, style with `gameFontStacks(GAME_FONTS)`. */
export const GAME_FONTS: GameFontPairing = {
  display: { family: "Comfortaa", src: new URL("./Comfortaa-VF.ttf", import.meta.url).href },
  body: { family: "Quicksand", src: new URL("./Quicksand-VF.ttf", import.meta.url).href },
};
