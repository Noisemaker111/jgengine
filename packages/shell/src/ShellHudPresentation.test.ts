import { describe, expect, test } from "bun:test";

import { markHudCaptureReady } from "./ShellHudPresentation";

describe("markHudCaptureReady", () => {
  test("marks a page with no capture host ready", () => {
    const root = { dataset: {} as DOMStringMap };
    markHudCaptureReady(root);
    expect(root.dataset.jgCapture).toBe("ready");
  });

  test("leaves a host-managed handshake alone", () => {
    for (const status of ["preparing", "pending", "error"]) {
      const root = { dataset: { jgCapture: status } as DOMStringMap };
      markHudCaptureReady(root);
      expect(root.dataset.jgCapture).toBe(status);
    }
  });
});
