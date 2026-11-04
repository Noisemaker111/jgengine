import { afterEach, expect, test } from "bun:test";

import { setGameAssetFiles } from "@jgengine/core/assets/assetBase";
import { loadGameFonts } from "./fonts.view";

// Put each global back exactly: absent stays absent. Setting it to undefined instead left a `document`
// key behind, and a later file that only stubs `document` when the key is missing then leaked its stub.
const saved = {
  document: Object.getOwnPropertyDescriptor(globalThis, "document"),
  FontFace: Object.getOwnPropertyDescriptor(globalThis, "FontFace"),
};
afterEach(() => {
  setGameAssetFiles(null);
  for (const [name, descriptor] of Object.entries(saved)) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, descriptor);
  }
});

test("a library font is requested from the running game's folder under the host", () => {
  const sources: string[] = [];
  Reflect.set(globalThis, "FontFace", class { constructor(_family: string, source: string) { sources.push(source); } load() { return Promise.resolve(this); } });
  Reflect.set(globalThis, "document", { fonts: { add: () => undefined } });
  setGameAssetFiles("demo", ["/fonts/oswald/oswald.woff2"]);
  loadGameFonts([{ family: "Oswald", src: "/fonts/oswald/oswald.woff2", weight: 400 }]);
  expect(sources).toEqual(['url("/demo/fonts/oswald/oswald.woff2")']);
});
