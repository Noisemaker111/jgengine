import type { GameFontPairing } from "@jgengine/core/ui/fonts.view";

export const GAME_FONTS: GameFontPairing = {
  display: { family: "Comfortaa", src: new URL("./Comfortaa-VF.ttf", import.meta.url).href },
  body: { family: "Quicksand", src: new URL("./Quicksand-VF.ttf", import.meta.url).href },
};
