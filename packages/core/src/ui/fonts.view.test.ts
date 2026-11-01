import { afterEach, expect, test } from "bun:test";

import { setGameAssetFiles } from "@jgengine/core/assets/assetBase";
import { loadGameFonts } from "./fonts.view";

const saved = { document: Reflect.get(globalThis, "document"), FontFace: Reflect.get(globalThis, "FontFace") };
afterEach(() => {
  setGameAssetFiles(null);
  Reflect.set(globalThis, "document", saved.document);
  Reflect.set(globalThis, "FontFace", saved.FontFace);
});

test("a library font is requested from the running game's folder under the host", () => {
  const sources: string[] = [];
  Reflect.set(globalThis, "FontFace", class { constructor(_family: string, source: string) { sources.push(source); } load() { return Promise.resolve(this); } });
  Reflect.set(globalThis, "document", { fonts: { add: () => undefined } });
  setGameAssetFiles("demo", ["/fonts/oswald/oswald.woff2"]);
  loadGameFonts([{ family: "Oswald", src: "/fonts/oswald/oswald.woff2", weight: 400 }]);
  expect(sources).toEqual(['url("/demo/fonts/oswald/oswald.woff2")']);
});
