import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { GameContextBridge, useOptionalGameContext } from "./provider";

/** A child that reports whether it can see a GameContext — stands in for `useGameContext`/`useEntityRenderCues`. */
function Probe() {
  const ctx = useOptionalGameContext();
  return createElement("span", null, ctx === null ? "no-ctx" : "has-ctx");
}

describe("GameContextBridge", () => {
  test("re-provides a captured context so descendants resolve it", () => {
    // A bridge stands in for the R3F Canvas boundary: the child sees the context only via the bridge.
    const fakeCtx = {} as GameContext;
    const html = renderToStaticMarkup(
      createElement(GameContextBridge, { context: fakeCtx }, createElement(Probe)),
    );
    expect(html).toContain("has-ctx");
  });

  test("a null context renders children unchanged (showcase / no running game)", () => {
    const html = renderToStaticMarkup(
      createElement(GameContextBridge, { context: null }, createElement(Probe)),
    );
    expect(html).toContain("no-ctx");
  });
});
