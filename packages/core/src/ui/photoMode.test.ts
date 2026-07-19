import { describe, expect, test } from "bun:test";

import { createPhotoModeStore, DEFAULT_PHOTO_MODE } from "./photoMode";

describe("createPhotoModeStore", () => {
  test("defaults, enter/exit/toggle, and hide-HUD", () => {
    const store = createPhotoModeStore();
    expect(store.get()).toEqual(DEFAULT_PHOTO_MODE);
    store.enter();
    expect(store.get().active).toBe(true);
    store.toggle();
    expect(store.get().active).toBe(false);
    store.setHideHud(false);
    expect(store.get().hideHud).toBe(false);
  });

  test("notifies only on an actual change", () => {
    const store = createPhotoModeStore();
    let hits = 0;
    const off = store.subscribe(() => { hits += 1; });
    store.enter();
    store.enter(); // no-op
    off();
    store.exit();
    expect(hits).toBe(1);
  });

  test("snapshot/restore round-trips", () => {
    const store = createPhotoModeStore({ active: true, hideHud: false });
    const snap = JSON.parse(JSON.stringify(store.snapshot()));
    const restored = createPhotoModeStore();
    restored.restore(snap);
    expect(restored.get()).toEqual({ active: true, hideHud: false });
  });
});
