import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createPanelState, openPanel, type PanelDef } from "@jgengine/core/ui/panelModel";

import { PanelHost, Window, panelKeyAction, type PanelsManager } from "./panels";

const DEFS: PanelDef[] = [
  { id: "bag", title: "Bags", hotkey: "KeyB" },
  { id: "char", title: "Character", hotkey: "KeyC", group: "center" },
  { id: "hud", title: "Unit Frames", initial: true, closable: false },
];

describe("panelKeyAction", () => {
  test("a hotkey resolves to a toggle intent (code or key)", () => {
    const state = createPanelState(DEFS);
    expect(panelKeyAction(DEFS, state, { code: "KeyB", key: "b" })).toEqual({
      handled: true,
      type: "toggle",
      id: "bag",
    });
    expect(panelKeyAction(DEFS, state, { code: "KeyC" })).toEqual({
      handled: true,
      type: "toggle",
      id: "char",
    });
  });

  test("ESC resolves to closeTop only when a closable window is open", () => {
    const base = createPanelState(DEFS); // only pinned "hud" open
    expect(panelKeyAction(DEFS, base, { key: "Escape", code: "Escape" })).toEqual({ handled: false });
    const withBag = openPanel(base, "bag");
    expect(panelKeyAction(DEFS, withBag, { key: "Escape", code: "Escape" })).toEqual({
      handled: true,
      type: "closeTop",
    });
  });

  test("an unbound key is not handled", () => {
    const state = createPanelState(DEFS);
    expect(panelKeyAction(DEFS, state, { code: "KeyZ", key: "z" })).toEqual({ handled: false });
  });
});

/** A static manager built from a plain core state — enough to render PanelHost in SSR. */
function staticManager(state = openPanel(createPanelState(DEFS), "bag")): PanelsManager {
  return {
    state,
    defs: DEFS,
    isOpen: (id) => state.open[id] === true,
    open: () => undefined,
    close: () => undefined,
    toggle: () => undefined,
    focus: () => undefined,
    move: () => undefined,
    byHotkey: () => null,
  };
}

describe("PanelHost (SSR)", () => {
  test("renders open panels as labeled dialogs with per-id content", () => {
    const manager = staticManager();
    const html = renderToStaticMarkup(
      createElement(PanelHost, {
        manager,
        render: (id: string) => `content:${id}`,
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Bags"');
    expect(html).toContain('aria-label="Unit Frames"');
    expect(html).toContain("content:bag");
    expect(html).toContain("content:hud");
  });

  test("closable panels get a close button; pinned ones do not", () => {
    const html = renderToStaticMarkup(
      createElement(PanelHost, { manager: staticManager(), panels: { bag: "b", hud: "h" } }),
    );
    // "bag" is closable -> one close button labeled Close; "hud" (closable:false) has none.
    const closeButtons = html.match(/aria-label="Close"/g) ?? [];
    expect(closeButtons.length).toBe(1);
  });

  test("does not render closed panels", () => {
    const html = renderToStaticMarkup(
      createElement(PanelHost, { manager: staticManager(), render: (id: string) => id }),
    );
    expect(html).not.toContain('aria-label="Character"');
  });
});

describe("Window (SSR)", () => {
  test("renders a standalone dialog with a title and close button", () => {
    const html = renderToStaticMarkup(
      createElement(Window, { title: "Options", children: "body" }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Options"');
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("body");
  });

  test("omits the close button when closable is false", () => {
    const html = renderToStaticMarkup(
      createElement(Window, { title: "Locked", closable: false }),
    );
    expect(html).not.toContain('aria-label="Close"');
  });
});
