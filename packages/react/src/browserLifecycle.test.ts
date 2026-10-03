import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { observeBrowserSuspension, useBrowserSuspension, type BrowserSuspensionReason, type BrowserSuspensionSources } from "./browserLifecycle";

function browser(initiallyLocked = false, initiallyHidden = false) {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: initiallyHidden, pointerLockElement: initiallyLocked ? {} as Element : null as Element | null });
  const sources: BrowserSuspensionSources = { window: win, document: doc };
  return {
    sources,
    blur() { win.dispatchEvent(new Event("blur")); },
    visibility(hidden: boolean) { doc.hidden = hidden; doc.dispatchEvent(new Event("visibilitychange")); },
    lock(locked: boolean) { doc.pointerLockElement = locked ? {} as Element : null; doc.dispatchEvent(new Event("pointerlockchange")); },
  };
}

describe("browser suspension", () => {
  test("only acquired-to-lost lock edges suspend initially unlocked play", () => {
    const source = browser();
    const reasons: BrowserSuspensionReason[] = [];
    const detach = observeBrowserSuspension(reason => reasons.push(reason), {}, source.sources);
    source.lock(false);
    source.lock(true);
    source.lock(true);
    expect(reasons).toEqual([]);
    source.lock(false);
    source.lock(false);
    expect(reasons).toEqual(["pointer-lock-lost"]);
    source.lock(true);
    source.lock(false);
    expect(reasons).toEqual(["pointer-lock-lost", "pointer-lock-lost"]);
    detach();
  });

  test("attachment is silent, including an existing lock or hidden page", () => {
    const source = browser(true, true);
    const reasons: BrowserSuspensionReason[] = [];
    const detach = observeBrowserSuspension(reason => reasons.push(reason), {}, source.sources);
    expect(reasons).toEqual([]);
    source.lock(false);
    source.visibility(false);
    expect(reasons).toEqual(["pointer-lock-lost"]);
    source.visibility(true);
    source.blur();
    expect(reasons).toEqual(["pointer-lock-lost", "hidden", "blur"]);
    detach();
  });

  test("disabled triggers do not notify", () => {
    const source = browser(true);
    const reasons: BrowserSuspensionReason[] = [];
    const detach = observeBrowserSuspension(reason => reasons.push(reason), { blur: false, pointerLockLost: false }, source.sources);
    source.blur();
    source.lock(false);
    source.visibility(false);
    source.visibility(true);
    expect(reasons).toEqual(["hidden"]);
    detach();
    const disabled = observeBrowserSuspension(reason => reasons.push(reason), { hidden: false }, source.sources);
    source.visibility(true);
    expect(reasons).toEqual(["hidden"]);
    disabled();
  });

  test("cleanup is idempotent and instances own independent listeners", () => {
    const source = browser(true);
    const first: BrowserSuspensionReason[] = [], second: BrowserSuspensionReason[] = [];
    const detachFirst = observeBrowserSuspension(reason => first.push(reason), {}, source.sources);
    const detachSecond = observeBrowserSuspension(reason => second.push(reason), {}, source.sources);
    source.blur();
    detachFirst();
    detachFirst();
    source.lock(false);
    source.visibility(true);
    expect(first).toEqual(["blur"]);
    expect(second).toEqual(["blur", "pointer-lock-lost", "hidden"]);
    detachSecond();
    source.blur();
    source.lock(true);
    source.lock(false);
    source.visibility(true);
    expect(second).toEqual(["blur", "pointer-lock-lost", "hidden"]);
  });

  test("SSR observes nothing and the hook renders without a browser", () => {
    const detach = observeBrowserSuspension(() => { throw new Error("unexpected suspension"); }, {}, null);
    detach();
    function Consumer() {
      useBrowserSuspension(() => { throw new Error("unexpected suspension"); });
      return createElement("span", null, "ready");
    }
    expect(renderToStaticMarkup(createElement(Consumer))).toBe("<span>ready</span>");
  });
});
