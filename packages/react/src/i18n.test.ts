import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider, Trans, useLocale, useT } from "./i18n";
import { createI18n, type Catalog } from "@jgengine/core/i18n/i18n";

const CATALOG: Catalog = {
  en: { "hud.score": "Score: {value}", play: "Play" },
  fr: { "hud.score": "Score : {value}", play: "Jouer" },
};

function Scoreboard() {
  const t = useT();
  const locale = useLocale();
  return createElement("div", { "data-locale": locale }, t("hud.score", { value: 42 }), " · ", createElement(Trans, { k: "play" }));
}

function render(locale: string): string {
  const i18n = createI18n({ catalog: CATALOG, locale });
  return renderToStaticMarkup(createElement(I18nProvider, { i18n, children: createElement(Scoreboard) }));
}

describe("i18n react", () => {
  test("translates HUD strings in the active locale (English)", () => {
    const html = render("en");
    expect(html).toContain('data-locale="en"');
    expect(html).toContain("Score: 42");
    expect(html).toContain("Play");
  });

  test("switches all bound strings when the locale differs (French)", () => {
    const html = render("fr");
    expect(html).toContain('data-locale="fr"');
    expect(html).toContain("Score : 42");
    expect(html).toContain("Jouer");
    expect(html).not.toContain("Play");
  });

  test("useT throws without a provider", () => {
    expect(() => renderToStaticMarkup(createElement(Scoreboard))).toThrow(/I18nProvider/);
  });
});
