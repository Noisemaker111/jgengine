import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Codex } from "./codex";
import { createCodex, type CodexEntryDef } from "@jgengine/core/game/codex";

const ENTRIES: readonly CodexEntryDef[] = [
  { id: "wolf", name: "Gray Wolf", category: "Beasts", description: "A pack hunter.", icon: "🐺" },
  { id: "wisp", name: "Marsh Wisp", category: "Spirits", secret: true },
  { id: "golem", name: "Stone Golem", category: "Beasts" },
];

function views() {
  const codex = createCodex({ entries: ENTRIES, now: () => 1 });
  codex.discover("wolf");
  return codex.list();
}

describe("Codex", () => {
  test("renders category tabs, a completion header, and discovered/locked cards", () => {
    const html = renderToStaticMarkup(createElement(Codex, { entries: views() }));
    expect(html).toContain("data-codex");
    expect(html).toContain('data-codex-tab="Beasts"');
    expect(html).toContain("1/3 discovered");
    expect(html).toContain('data-codex-entry="wolf"');
    expect(html).toContain('data-discovered="true"');
    expect(html).toContain("Gray Wolf");
    expect(html).toContain("A pack hunter."); // discovered shows description
  });

  test("masks a secret, still-undiscovered entry", () => {
    const html = renderToStaticMarkup(createElement(Codex, { entries: views() }));
    expect(html).toContain("???");
    expect(html).not.toContain("Marsh Wisp");
  });

  test("maskSecrets=false reveals the secret name", () => {
    const html = renderToStaticMarkup(createElement(Codex, { entries: views(), maskSecrets: false }));
    expect(html).toContain("Marsh Wisp");
  });

  test("empty entries render the empty label", () => {
    const html = renderToStaticMarkup(createElement(Codex, { entries: [], emptyLabel: "Nothing here" }));
    expect(html).toContain("Nothing here");
    expect(html).toContain("0/0 discovered");
  });
});
