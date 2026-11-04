import { expect, test } from "bun:test";

import { modelLoadIdleMs, modelLoadStarts } from "@jgengine/core/model/modelLoad.draw";
import { loadOnDemandSceneKinds, onDemandSceneKindReady } from "./builtinSceneKindRenderers.draw";
import type { OnDemandSceneKind } from "./onDemandSceneKinds";

test("a scene system holds loading through registration, releases on failure, and can retry", async () => {
  let reject: ((error: Error) => void) | undefined;
  const failed = new Promise<void>((_resolve, no) => { reject = no; });
  const entry: OnDemandSceneKind = { id: "city", kinds: [], generators: [], load: () => failed };
  const starts = modelLoadStarts();
  const first = loadOnDemandSceneKinds([entry]);
  expect(modelLoadStarts()).toBe(starts + 1);
  expect(modelLoadIdleMs()).toBe(0);
  reject?.(new Error("test load failed"));
  await expect(first).rejects.toThrow("test load failed");
  expect(modelLoadIdleMs()).toBeGreaterThan(0);
  expect(onDemandSceneKindReady(entry)).toBe(false);

  let resolve: (() => void) | undefined;
  const pending = new Promise<void>((yes) => { resolve = yes; });
  const retried = loadOnDemandSceneKinds([{ ...entry, load: () => pending }]);
  expect(modelLoadIdleMs()).toBe(0);
  resolve?.();
  await retried;
  expect(onDemandSceneKindReady(entry)).toBe(true);
  expect(modelLoadIdleMs()).toBeGreaterThan(0);
  const loadedStarts = modelLoadStarts();
  await loadOnDemandSceneKinds([{ ...entry, load: () => { throw new Error("must reuse the registered system"); } }]);
  expect(modelLoadStarts()).toBe(loadedStarts);
});
