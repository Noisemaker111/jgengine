import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CreditsScreen } from "./creditsScreen";

const DOCUMENT = {
  title: "Credits",
  sections: [
    {
      heading: "CC0-1.0",
      entries: [
        { label: "Stylized Nature", detail: "Quaternius", href: "https://quaternius.com" },
        { label: "Dungeon Pack", detail: "KayKit" },
      ],
    },
  ],
  notice: "All assets used under their stated licenses.",
};

describe("CreditsScreen", () => {
  test("renders the title, headings, labels, and details", () => {
    const html = renderToStaticMarkup(createElement(CreditsScreen, { document: DOCUMENT }));
    expect(html).toContain("Credits");
    expect(html).toContain("CC0-1.0");
    expect(html).toContain("Stylized Nature");
    expect(html).toContain("Quaternius");
    expect(html).toContain("All assets used under their stated licenses.");
  });

  test("links only the entries carrying an href, and never leaks a referrer", () => {
    const html = renderToStaticMarkup(createElement(CreditsScreen, { document: DOCUMENT }));
    expect(html).toContain('href="https://quaternius.com"');
    expect(html).toContain('rel="noreferrer"');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  test("reads the HudTheme tokens so a theme block reskins it", () => {
    const html = renderToStaticMarkup(createElement(CreditsScreen, { document: DOCUMENT }));
    expect(html).toContain("var(--jg-text");
    expect(html).toContain("var(--jg-accent");
    expect(html).toContain("var(--jg-font-display");
  });

  test("renderEntry replaces the default line", () => {
    const html = renderToStaticMarkup(
      createElement(CreditsScreen, {
        document: DOCUMENT,
        renderEntry: (entry) => createElement("b", null, `→ ${entry.label}`),
      }),
    );
    expect(html).toContain("→ Stylized Nature");
    expect(html).not.toContain("<a ");
  });

  test("a document with no title, sections, or notice renders an empty shell", () => {
    const html = renderToStaticMarkup(createElement(CreditsScreen, { document: { sections: [] } }));
    expect(html).toContain('data-jg="credits-screen"');
    expect(html).not.toContain("credits-section");
  });
});
