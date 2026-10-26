import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ReactNode } from "react";

import { findHudOverlayHost, HUD_OVERLAY_HOST_ATTRIBUTE } from "@jgengine/core/hud/hudThemeRoot.view";

import { ShellUiKit } from "../ShellChrome";
import type { PlayableGame } from "../registry";
import { SettingsChrome } from "./SettingsChrome";
import { SettingsMenu } from "./SettingsMenu";
import type { SettingsController } from "./settingsController";

// The shell ships no renderer; borrow the react package's, resolved exactly as its own tests resolve it, so one
// renderer draws the shared contexts when test files run in one process.
const { renderToStaticMarkup } = (await import(Bun.resolveSync("react-dom/server", join(import.meta.dir, "../../../react/src")))) as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

function playable(uiKit?: string): PlayableGame {
  return { game: { name: "settings-host-test", input: {} }, ...(uiKit === undefined ? {} : { uiKit }) } as unknown as PlayableGame;
}

describe("shell settings dialog", () => {
  test("the shell mounts an overlay host inside the kit, carrying the kit's colours for the dialog", () => {
    const kitted = renderToStaticMarkup(<ShellUiKit playable={playable("paper")}><p>hud</p></ShellUiKit>);
    const host = kitted.match(new RegExp(`<div ${HUD_OVERLAY_HOST_ATTRIBUTE}=""[^>]*>`))?.[0] ?? "";
    expect(host).toContain("display:contents");
    expect(host).toContain("--jg-surface:var(--kit-surface)");
    expect(kitted.indexOf("data-jg-kit=")).toBeLessThan(kitted.indexOf(HUD_OVERLAY_HOST_ATTRIBUTE));

    const plain = renderToStaticMarkup(<ShellUiKit playable={playable()}><p>hud</p></ShellUiKit>);
    expect(plain).toContain(`<div ${HUD_OVERLAY_HOST_ATTRIBUTE}="" style="display:contents"></div>`);
  });

  test("the dialog finds the host beside its anchor, and renders in place without one", () => {
    const host = { id: "host" } as unknown as HTMLElement;
    const anchor = (found: HTMLElement | null) =>
      ({ parentElement: { querySelector: (selector: string) => (selector === `[${HUD_OVERLAY_HOST_ATTRIBUTE}]` ? found : null) } }) as unknown as Element;
    expect(findHudOverlayHost(anchor(host))).toBe(host);
    expect(findHudOverlayHost(anchor(null))).toBeNull();
    expect(findHudOverlayHost(null)).toBeNull();
    // Before its anchor mounts (server render, first paint) the chrome draws nothing it cannot place.
    expect(renderToStaticMarkup(<SettingsChrome />)).toBe("");
  });

  test("the dialog sits above notices and the result screen, and its selected tab reads on any accent", () => {
    const controller = {
      variant: "panel",
      actions: [],
      categories: [{ id: "sound", label: "Sound", rows: [], keybinds: [] }],
    } as unknown as SettingsController;
    const html = renderToStaticMarkup(<SettingsMenu controller={controller} onClose={() => undefined} />);
    expect(html).toContain("z-index:88");
    expect(html).toContain("var(--jg-on-accent, var(--jg-surface-deep, #0b0b0f))");
    // Hairlines come from the theme's edge colour, so they show on a light (kit) dialog too.
    expect(html).not.toContain("border:1px solid rgba(255,255,255,0.1)");
    expect(html).toContain("border:1px solid var(--jg-edge, rgba(255,255,255,0.1))");
  });
});
