import type { GameFontPairing } from "@jgengine/core/ui/fonts.view";

export const GAME_FONTS: GameFontPairing = {
  display: { family: "Russo One", src: new URL("./RussoOne-Regular.ttf", import.meta.url).href },
  body: { family: "Chakra Petch", src: new URL("./ChakraPetch-Medium.ttf", import.meta.url).href },
};
