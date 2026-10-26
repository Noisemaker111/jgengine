import { afterEach, expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement } from "react";
import * as THREE from "three";

import { PointerProbe } from "./PointerProbe.draw";
import type { PointerService } from "./pointerService.draw";

type PointerDeps = NonNullable<Parameters<PointerService["bind"]>[0]>;

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; document?: unknown };
const hadDocument = "document" in globalThis;

// R3F's root reaches for `document`; the stand-in must not outlive this file, or a later test in the
// same process that proves it runs with no DOM (the headless runner) sees one.
afterEach(() => {
  if (!hadDocument) delete env.document;
  delete env.IS_REACT_ACT_ENVIRONMENT;
});

async function mount(groundHeightAt?: (x: number, z: number) => number): Promise<{ bound: (PointerDeps | null)[]; unmount: () => Promise<void> }> {
  env.IS_REACT_ACT_ENVIRONMENT = true;
  env.document ??= new EventTarget();
  extend(THREE);
  const bound: (PointerDeps | null)[] = [];
  const service = { bind: (deps: PointerDeps | null) => bound.push(deps), setState() {} } as unknown as PointerService;
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "never",
    size: { width: 800, height: 450, top: 0, left: 0 },
    dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {}, domElement: new EventTarget() }) as unknown as THREE.WebGLRenderer,
  });
  await act(async () => {
    root.render(createElement(PointerProbe, { service, ...(groundHeightAt === undefined ? {} : { groundHeightAt }) }));
  });
  return { bound, unmount: async () => act(async () => root.unmount()) };
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
