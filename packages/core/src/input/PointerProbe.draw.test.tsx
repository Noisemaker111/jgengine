import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";

import { mountTestDraws, type MountedTestDraws } from "@jgengine/core/frame/testEngineHost.draw";
import { PointerProbe } from "./PointerProbe.draw";
import type { PointerService } from "./pointerService.draw";

type PointerDeps = NonNullable<Parameters<PointerService["bind"]>[0]>;

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; document?: unknown };
const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

// R3F's root reaches for `document`; the stand-in must not outlive this file, or a later test in the
// same process sees a `document` with no DOM methods (the UI kit's style injection then throws).
// The exact original is put back, so an earlier file's leftover `document: undefined` cannot keep the stub.
afterEach(() => {
  if (savedDocument === undefined) delete env.document;
  else Object.defineProperty(globalThis, "document", savedDocument);
  delete env.IS_REACT_ACT_ENVIRONMENT;
});

async function mount(groundHeightAt?: (x: number, z: number) => number): Promise<{ bound: (PointerDeps | null)[]; unmount: () => Promise<void> }> {
  const bound: (PointerDeps | null)[] = [];
  const service = { bind: (deps: PointerDeps | null) => bound.push(deps), setState() {} } as unknown as PointerService;
  const mounted: MountedTestDraws = await mountTestDraws(
    createElement(PointerProbe, { service, ...(groundHeightAt === undefined ? {} : { groundHeightAt }) }),
    { width: 800, height: 450 },
  );
  return { bound, unmount: () => mounted.unmount() };
}

test("a world with terrain binds its ground height, so clicks can land on the hills", async () => {
  const ground = (x: number, z: number) => x + z;
  const { bound, unmount } = await mount(ground);
  const live = bound.at(-1);
  expect(live?.groundHeightAt).toBe(ground);
  expect(live?.width).toBe(800);
  await unmount();
  expect(bound.at(-1)).toBeNull();
});

test("a flat arena binds no ground height and keeps the y=0 plane", async () => {
  const { bound, unmount } = await mount();
  expect(bound.at(-1)).not.toBeNull();
  expect(bound.at(-1)?.groundHeightAt).toBeUndefined();
  await unmount();
});
