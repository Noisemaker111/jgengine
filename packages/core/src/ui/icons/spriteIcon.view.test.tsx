import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SpriteIcon, spriteIconMask } from "./spriteIcon.view";

describe("SpriteIcon", () => {
  test("masks a tinted square to the served icon's light pixels", () => {
    const html = renderToStaticMarkup(<SpriteIcon src="/sprites/gameicons-icons/lorc/wheat.svg" size={32} color="#fc0" />);
    expect(html).toContain('data-sprite-icon="/sprites/gameicons-icons/lorc/wheat.svg"');
    expect(html).toContain("mask-mode:luminance");
    expect(html).toContain("background-color:#fc0");
    expect(html).toContain('aria-hidden="true"');
  });

  test("a title makes it a named image, and alpha mode keeps opaque pixels", () => {
    expect(renderToStaticMarkup(<SpriteIcon src="/a.png" title="Wheat" mode="alpha" />)).toContain('role="img" aria-label="Wheat"');
    expect(spriteIconMask('/a"b.svg', "alpha")).toMatchObject({ maskMode: "alpha", maskImage: 'url("/a%22b.svg")' });
  });
});
