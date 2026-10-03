import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createMaterialTemplate } from "@jgengine/core/material/materialAsset";

import { MaterialAssetEditor } from "./MaterialAssetEditor";

describe("material asset editor", () => {
  test("sparse imported values are inherited and preview controls require a real preview", () => {
    const asset = { ...createMaterialTemplate("stone", "stone"), surface: {}, capabilities: [] };
    const html = renderToStaticMarkup(createElement(MaterialAssetEditor, { asset, onChange: () => {} }));
    expect(html).toContain("Imported color");
    expect(html).toContain("Inherited");
    expect(html).toContain("Empty fields inherit the imported surface");
    expect(html).not.toContain("Neutral light");
    expect(html).not.toContain("Game light");
  });

  test("woven controls render only for a supported woven adapter", () => {
    const wool = renderToStaticMarkup(createElement(MaterialAssetEditor, { asset: createMaterialTemplate("wool", "wool"), onChange: () => {} }));
    const silk = renderToStaticMarkup(createElement(MaterialAssetEditor, { asset: createMaterialTemplate("silk", "silk"), onChange: () => {} }));
    expect(wool).not.toContain('aria-label="Thread cycles per UV"');
    expect(silk).toContain('aria-label="Thread cycles per UV"');
    expect(silk).toContain('aria-label="Weave direction (radians)"');
  });

  test("hair backlighting is card-only and remains distinct from transmission", () => {
    const asset = createMaterialTemplate("hair-cards", "hair");
    const cards = renderToStaticMarkup(createElement(MaterialAssetEditor, { asset, onChange: () => {} }));
    const strands = renderToStaticMarkup(createElement(MaterialAssetEditor, { asset: { ...asset, hair: { geometry: "strands" } }, onChange: () => {} }));
    expect(cards).toContain('aria-label="Card backlight strength"');
    expect(strands).not.toContain('aria-label="Card backlight strength"');
    expect(strands).toContain("not a groom");
    expect(cards).toContain('aria-label="Transmission"');
  });

  test("packed numeric map conventions remain visible to authors", () => {
    const asset = createMaterialTemplate("stone", "stone");
    asset.textures = { roughness: { url: "/maps/orm.png", colorSpace: "linear", channel: "g" } };
    const html = renderToStaticMarkup(createElement(MaterialAssetEditor, { asset, onChange: () => {} }));
    expect(html).toContain("roughness · linear · g");
    expect(html).toContain('aria-label="roughness UV set"');
    expect(html).toContain('aria-label="roughness UV scale 1"');
    expect(html).toContain("this editor does not transcode it");
  });
});
