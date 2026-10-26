import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createModalStack } from "@jgengine/core/dialog/modalStack";

import { PauseMenu } from "../menu/pauseMenu.view";
import { ConfirmDialog, ModalHost } from "./modals.view";

describe("ConfirmDialog", () => {
  test("renders title, body, and both buttons", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        title: "Quit to menu?",
        body: "Progress will be lost.",
        confirmLabel: "Quit",
        cancelLabel: "Stay",
        onConfirm: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain("Quit to menu?");
    expect(html).toContain("Progress will be lost.");
    expect(html).toContain('data-confirm-accept=""');
    expect(html).toContain('data-confirm-cancel=""');
    expect(html).toContain("Quit");
    expect(html).toContain("Stay");
  });
});

describe("PauseMenu", () => {
  test("renders the game-filled verbs on the pause-scale game menu", () => {
    const html = renderToStaticMarkup(
      createElement(PauseMenu, {
        onResume: () => {},
        sound: false,
        items: [
          { id: "resume", label: "Resume" },
          { id: "settings", label: "Settings" },
          { id: "quit", label: "Quit" },
        ],
        onSelect: () => {},
      }),
    );
    expect(html).toContain('aria-label="Paused"');
    expect(html).toContain('data-jg-game-menu-item="resume"');
    expect(html).toContain('data-jg-game-menu-item="settings"');
    expect(html).toContain('data-jg-game-menu-item="quit"');
    expect(html).toContain('data-variant="pause"');
  });
});

describe("ModalHost", () => {
  test("renders nothing when the stack is empty", () => {
    const stack = createModalStack();
    const html = renderToStaticMarkup(
      createElement(ModalHost, { stack, children: () => null }),
    );
    expect(html).toBe("");
  });

  test("renders the top modal's content as an aria-modal dialog", () => {
    const stack = createModalStack();
    stack.push({ id: "pause", kind: "pause" });
    const html = renderToStaticMarkup(
      createElement(ModalHost, {
        stack,
        children: (record) => createElement("span", null, `kind:${record.kind}`),
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("aria-modal");
    expect(html).toContain('data-modal="pause"');
    expect(html).toContain("kind:pause");
  });
});
