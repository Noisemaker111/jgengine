import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SettingsCategoryView, SettingsRow } from "./settings.view";
import { SettingsRowControl, SettingsSection, SettingsTabs } from "./settingsBlocks.view";

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
  test("a slider row keeps its readout whole on a narrow row and takes a kit's control shape", () => {
    const html = renderToStaticMarkup(createElement(SettingsRowControl, { row: { ...CATEGORY.rows[2]!, format: (value: number | boolean | string) => `${Math.round(Number(value) * 100)}%` } }));
    // The readout never shrinks or wraps; the slider gives way first ("100%" ran off a phone row).
    expect(html).toMatch(/<span style="[^"]*flex-shrink:0;white-space:nowrap[^"]*">40%<\/span>/);
    expect(html).toContain("min-width:64px");
    expect(html).toContain("border-radius:var(--jg-control-radius, 10px)");
  });

  test("tabs take a kit's display type and control corners", () => {
    const html = renderToStaticMarkup(createElement(SettingsTabs, { categories: [CATEGORY], activeId: "accessibility", onSelect: () => undefined }));
    expect(html).toContain("font-family:var(--jg-control-font, inherit)");
    expect(html).toContain("border-radius:var(--jg-control-radius, 8px)");
  });

  test("renders a slider with its readout and a drawn game slider, never a browser range input", () => {
    const html = renderToStaticMarkup(createElement(SettingsRowControl, { row: CATEGORY.rows[2]! }));
    expect(html).not.toContain('type="range"');
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuenow="0.4"');
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
