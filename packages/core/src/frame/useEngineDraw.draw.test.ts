import { expect, spyOn, test } from "bun:test";
import { createElement } from "react";

import { mountTestDraws } from "./testEngineHost.draw";
import { createDrawChurn, noteDrawRebuild, SceneObjectGroup } from "./useEngineDraw.draw";

test("a draw rebuilt on every render warns once; ordinary rebuilds stay quiet", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const create = () => ({});
    const steady = createDrawChurn();
    // A first build, then a rebuild every 200 ms: deps that really change.
    for (let i = 0; i < 100; i += 1) expect(noteDrawRebuild(steady, create, i * 200)).toBe(false);
    const churning = createDrawChurn();
    const warned: boolean[] = [];
    // A rebuild every frame at 60 fps.
    for (let i = 0; i < 120; i += 1) warned.push(noteDrawRebuild(churning, create, i * 16));
    expect(warned.filter(Boolean)).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  } finally {
    warn.mockRestore();
  }
});

test("a scene group keeps one group across renders with inline userData and transforms", async () => {
  const mounted = await mountTestDraws(createElement(SceneObjectGroup, { position: [1, 2, 3], userData: { jgObjectId: "ride" } }));
  try {
    const tagged = () => mounted.scene.children.filter((child) => child.userData["jgObjectId"] !== undefined);
    const first = tagged()[0];
    expect(first?.position.toArray()).toEqual([1, 2, 3]);
    await mounted.render(createElement(SceneObjectGroup, { position: [4, 5, 6], userData: { jgObjectId: "ride" } }));
    expect(tagged()).toHaveLength(1);
    expect(tagged()[0]).toBe(first);
    expect(first?.position.toArray()).toEqual([4, 5, 6]);
  } finally {
    await mounted.unmount();
  }
});
