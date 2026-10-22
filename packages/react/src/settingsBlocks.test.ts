import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SettingsCategoryView, SettingsRow } from "./settings";
import { SettingsRowControl, SettingsSection, SettingsTabs } from "./settingsBlocks";

const row = (overrides: Partial<SettingsRow> & Pick<SettingsRow, "id" | "label" | "kind">): SettingsRow => ({
  value: 0.5,
  set: () => undefined,
  ...overrides,
});

const CATEGORY: SettingsCategoryView = {
  id: "accessibility",
  label: "Accessibility",
  rows: [
    row({ id: "accessibility.textScale", label: "Text size", kind: "select", value: "1.5", options: [{ value: "1", label: "100%" }, { value: "1.5", label: "150%" }] }),
    row({ id: "accessibility.reducedMotion", label: "Reduce motion", kind: "toggle", value: true }),
    row({ id: "sound.master", label: "Master volume", kind: "slider", value: 0.4, min: 0, max: 1, step: 0.01 }),
  ],
  keybinds: [
    { action: "jump", label: "Jump", bindingLabel: "Space", isDefault: true, rebind: () => undefined, reset: () => undefined },
  ],
};

describe("SettingsRowControl", () => {
  test("renders a slider with its readout and a labelled range input", () => {
    const html = renderToStaticMarkup(createElement(SettingsRowControl, { row: CATEGORY.rows[2]! }));
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-label="Master volume"');
    expect(html).toContain("0.4");
  });

  test("renders a toggle as switch with its state", () => {
    const html = renderToStaticMarkup(createElement(SettingsRowControl, { row: CATEGORY.rows[1]! }));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
  });

  test("renders select options with the chosen one pressed", () => {
    const html = renderToStaticMarkup(createElement(SettingsRowControl, { row: CATEGORY.rows[0]! }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("150%");
    expect(html).toContain('aria-pressed="false"');
  });
});

describe("SettingsSection", () => {
  test("renders the heading, every row and every rebindable action", () => {
    const html = renderToStaticMarkup(createElement(SettingsSection, { category: CATEGORY }));
    expect(html).toContain('data-settings-section="accessibility"');
    expect(html).toContain("Accessibility");
    expect(html).toContain("Text size");
    expect(html).toContain("Reduce motion");
    expect(html).toContain("Master volume");
    expect(html).toContain('data-settings-keybind="jump"');
    expect(html).toContain("Space");
    expect(html).toContain('data-settings-capture=""');
  });

  test("heading can be dropped when the game titles the section itself", () => {
    const html = renderToStaticMarkup(createElement(SettingsSection, { category: CATEGORY, heading: false }));
    expect(html).not.toContain(">Accessibility<");
    expect(html).toContain("Text size");
  });
});

describe("SettingsTabs", () => {
  test("marks the active category and keeps every category reachable", () => {
    const html = renderToStaticMarkup(
      createElement(SettingsTabs, {
        categories: [CATEGORY, { id: "graphics", label: "Graphics", rows: [], keybinds: [] }],
        activeId: "accessibility",
        onSelect: () => undefined,
      }),
    );
    expect(html).toContain('data-settings-tab="accessibility"');
    expect(html).toContain('data-settings-tab="graphics"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });
});
