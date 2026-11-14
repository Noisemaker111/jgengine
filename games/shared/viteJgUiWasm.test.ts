import { existsSync } from "node:fs";
import { expect, test } from "bun:test";
import { resolveFile } from "./viteJgUiWasm";

test("a /jg-ui/ request with Vite's ?import query serves the file, not the HTML fallback", () => {
  const plain = resolveFile("/jg_ui.js");
  if (plain === null) return; // the wasm bundle is not built in this checkout
  expect(existsSync(plain)).toBe(true);
  expect(resolveFile("/jg_ui.js?import")).toBe(plain);
  expect(resolveFile("/jg_ui.js?import#x")).toBe(plain);
  expect(resolveFile("/../../package.json")).toBeNull();
});
