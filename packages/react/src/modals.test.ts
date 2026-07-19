import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createModalStack } from "@jgengine/core/ui/modalStack";

import { ConfirmDialog, ModalHost, PauseMenu } from "./modals";

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
  test("renders Resume plus the game-filled slot items", () => {
    const html = renderToStaticMarkup(
      createElement(PauseMenu, {
        title: "Paused",
        onResume: () => {},
        items: [
          { id: "settings", label: "Settings", onSelect: () => {} },
          { id: "quit", label: "Quit", danger: true, onSelect: () => {} },
        ],
      }),
    );
    expect(html).toContain("Paused");
    expect(html).toContain('data-pause-resume=""');
    expect(html).toContain('data-pause-item="settings"');
    expect(html).toContain('data-pause-item="quit"');
    expect(html).toContain("Settings");
    expect(html).toContain("Quit");
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
