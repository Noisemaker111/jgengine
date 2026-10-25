import type { GameFontPairing } from "@jgengine/react/gameFonts";

/** This game's bundled fonts (OFL 1.1; see OFL.txt and SOURCE.md beside them). Load with `useGameFonts(GAME_FONTS)`, style with `gameFontStacks(GAME_FONTS)`. */
export const GAME_FONTS: GameFontPairing = {
  display: { family: "Lilita One", src: new URL("./LilitaOne-Regular.ttf", import.meta.url).href },
  body: { family: "Nunito", src: new URL("./Nunito-VF.ttf", import.meta.url).href },
};
