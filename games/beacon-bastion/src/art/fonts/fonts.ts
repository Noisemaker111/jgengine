import type { GameFontPairing } from "@jgengine/core/ui/fonts.view";

export const GAME_FONTS: GameFontPairing = {
  display: { family: "Cinzel", src: new URL("./Cinzel-VF.ttf", import.meta.url).href },
  body: { family: "Alegreya Sans", src: new URL("./AlegreyaSans-Medium.ttf", import.meta.url).href },
};
