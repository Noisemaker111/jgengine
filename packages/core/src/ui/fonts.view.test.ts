import { afterEach, expect, test } from "bun:test";

import { setGameAssetFiles } from "@jgengine/core/assets/assetBase";
import { loadGameFonts } from "./fonts.view";

const globals = globalThis as unknown as { document?: unknown; FontFace?: unknown };
const saved = { document: globals.document, FontFace: globals.FontFace };
afterEach(() => {
  setGameAssetFiles(null);
  globals.document = saved.document;
  globals.FontFace = saved.FontFace;
});

test("a library font is requested from the running game's folder under the host", () => {
  const sources: string[] = [];
  globals.FontFace = class { constructor(_family: string, source: string) { sources.push(source); } load() { return Promise.resolve(this); } };
  globals.document = { fonts: { add: () => undefined } };
  setGameAssetFiles("demo", ["/fonts/oswald/oswald.woff2"]);
  loadGameFonts([{ family: "Oswald", src: "/fonts/oswald/oswald.woff2", weight: 400 }]);
  expect(sources).toEqual(['url("/demo/fonts/oswald/oswald.woff2")']);
});
