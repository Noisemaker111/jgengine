import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MATERIAL_LIBRARY } from "@jgengine/assets/catalogs/materialLibrary";

import { MaterialLibraryBrowser } from "./MaterialLibraryBrowser";

test("the library browser lists real ambientCG surfaces by name", () => {
  const html = renderToStaticMarkup(createElement(MaterialLibraryBrowser, { onAdopt: () => {}, onError: () => {} }));
  expect(html).toContain("Material library");
  expect(html).toContain("Filter material library");
  expect(html).toContain("Wet asphalt");
  expect(html).toContain("asphalt/wet");
  expect(html).toContain("ambientcg-asphalt025c");
  expect(html).toContain(`${MATERIAL_LIBRARY.length} of ${MATERIAL_LIBRARY.length} materials`);
  expect(html).toContain("assets pull library");
  expect(html).toContain('aria-label="Material library"');
});

test("glass and water are labelled as shader surfaces, not as downloads", () => {
  const html = renderToStaticMarkup(createElement(MaterialLibraryBrowser, { onAdopt: () => {}, onError: () => {} }));
  expect(html).toContain("Ocean water");
  expect(html).toContain("Clear glass");
  expect(html).toContain("water/ocean · water · water");
  expect(html).toContain("glass/clear · glass · glass");
});
