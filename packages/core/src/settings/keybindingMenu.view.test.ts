import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createRebindSession } from "../input/rebindSession";
import { KeybindingMenu } from "./keybindingMenu.view";

describe("KeybindingMenu", () => {
  test("a locked action shows a lock mark and no capture button", () => {
    const session = createRebindSession({
      input: { jump: ["Space"], fire: { hold: ["mouse0"], locked: true } },
    });
    const html = renderToStaticMarkup(createElement(KeybindingMenu, { session }));
    const fireRow = html.slice(html.indexOf('data-keybinding-row="fire"'));
    const jumpRow = html.slice(html.indexOf('data-keybinding-row="jump"'), html.indexOf('data-keybinding-row="fire"'));
    expect(fireRow).toContain("data-keybinding-locked");
    expect(fireRow).toContain("🔒");
    expect(fireRow).not.toContain("data-keybinding-capture");
    expect(jumpRow).toContain("data-keybinding-capture");
    expect(jumpRow).not.toContain("data-keybinding-locked");
  });
});
