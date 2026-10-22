import { afterAll, beforeAll, expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement } from "react";
import * as THREE from "three";
import { EffectComposer } from "three-stdlib";

import { createSettingsStore } from "@jgengine/core/settings/settingsModel";
import { resolveTerrainDetail } from "@jgengine/core/world/terrain";
import type { GameLookInput, ResolvedGameLook } from "@jgengine/core/render/lookPreset";
import type { GraphicsProfile } from "@jgengine/core/settings/graphicsProfile";
import type { PostProcessingConfig } from "@jgengine/core/render/postProcessing";
import type { SettingsStore } from "@jgengine/core/settings/settingsModel";

import { useGraphicsSettings, type AppliedGraphicsSettings } from "../settings/appliedSettings";
import { createTerrainDetailMaterial } from "../terrain/terrainDetailMaterial";
import { PostProcessing } from "../postfx/PostProcessing";
import { usePresentationLook } from "./presentationLook";
import { useStableTextureSet } from "./stableTextureSet";
import { useDisposable } from "./useDisposable";

/**
 * Renders the shell's presentation seams twice with unchanged authored values and fails when the
 * second render hands a new identity to the post chain, graphics profile, resolved look or
 * texture set. #2037 shipped because those four rebuilt on every render: the composer relinked
 * shaders each frame and textured terrain rebuilt its material.
 */

interface Captured {
  graphics: AppliedGraphicsSettings;
  profile: GraphicsProfile;
  postStages: GraphicsProfile["postStages"];
  look: ResolvedGameLook;
  post: PostProcessingConfig | undefined;
  textures: object;
  material: THREE.Material;
}

interface Harness {
  render(input: GameLookInput): Promise<void>;
  capture(index: number): Captured;
  count(): number;
  pixelRatioReads(): number;
  composerDisposals(): number;
  retire(): Promise<void>;
}

const textures = { color: new THREE.Texture(), normal: new THREE.Texture() };
const detail = resolveTerrainDetail({ material: { maps: { color: "terrain-color.png", normal: "terrain-normal.png" } } });
const baseLook: GameLookInput = { look: "cinematic" };

/** SMAAPass builds its lookup textures from `Image`; only construction matters here, nothing draws. */
class HeadlessImage {
  width = 1;
  height = 1;
  onload: (() => void) | null = null;
  set src(_value: string) {}
  get src(): string {
    return "";
  }
}

beforeAll(() => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; Image?: unknown };
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  environment.Image ??= HeadlessImage;
  extend(THREE);
});

afterAll(() => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  environment.IS_REACT_ACT_ENVIRONMENT = undefined;
});

async function mount(textureSource: readonly [THREE.Texture, THREE.Texture]): Promise<Harness> {
  let composerDisposals = 0;
  const dispose = EffectComposer.prototype.dispose;
  EffectComposer.prototype.dispose = function patchedDispose(this: EffectComposer) {
    composerDisposals += 1;
    dispose.call(this);
  };

  let pixelRatioReads = 0;
  const renderer = {
    getPixelRatio: () => {
      pixelRatioReads += 1;
      return 1;
    },
    getSize: (target: THREE.Vector2) => target.set(800, 450),
    render() {},
    setSize() {},
    setPixelRatio() {},
    getContext: () => ({}),
  } as unknown as THREE.WebGLRenderer;

  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "never",
    camera: new THREE.PerspectiveCamera(55, 800 / 450, 0.1, 1000),
    size: { width: 800, height: 450, top: 0, left: 0 },
    dpr: 1,
    gl: () => renderer,
  });

  const store: SettingsStore = createSettingsStore(null);
  const captures: Captured[] = [];
  const [color, normal] = textureSource;

  function Scene({ input }: { input: GameLookInput }) {
    const graphics = useGraphicsSettings(store, true);
    const { look } = usePresentationLook(input, undefined);
    const maps = useStableTextureSet({ color, normal });
    const material = useDisposable(
      () => createTerrainDetailMaterial(detail, maps as never, { quality: graphics.quality }).material,
      [detail, maps, graphics.quality],
    );
    captures.push({
      graphics,
      profile: graphics.profile,
      postStages: graphics.profile.postStages,
      look,
      post: look.postProcessing,
      textures: maps,
      material,
    });
    return createElement(
      "group",
      null,
      createElement("mesh", { material }),
      look.postProcessing === undefined
        ? null
        : createElement(PostProcessing, {
            config: look.postProcessing,
            quality: graphics.quality,
            stages: graphics.profile.postStages,
          }),
    );
  }

  return {
    render: async (input) => {
      await act(async () => {
        root.render(createElement(Scene, { input }));
      });
    },
    capture: (index) => captures[index]!,
    count: () => captures.length,
    pixelRatioReads: () => pixelRatioReads,
    composerDisposals: () => composerDisposals,
    retire: async () => {
      await act(async () => root.unmount());
      EffectComposer.prototype.dispose = dispose;
    },
  };
}

function expectHeld(harness: Harness, pick: (captured: Captured) => unknown, what: string): void {
  expect(harness.count()).toBeGreaterThanOrEqual(2);
  expect(pick(harness.capture(1)), `${what} was rebuilt on the second render`).toBe(pick(harness.capture(0)));
}

test("rendering the same scene twice keeps the post chain, graphics profile, look and textures", async () => {
  const harness = await mount([textures.color, textures.normal]);
  try {
    await harness.render(baseLook);
    expect(harness.capture(0).post).toBeDefined();
    const readsAfterFirst = harness.pixelRatioReads();

    await harness.render(baseLook);

    expectHeld(harness, (captured) => captured.graphics, "the graphics settings object");
    expectHeld(harness, (captured) => captured.profile, "the graphics profile");
    expectHeld(harness, (captured) => captured.postStages, "the post stages");
    expectHeld(harness, (captured) => captured.look, "the resolved look");
    expectHeld(harness, (captured) => captured.post, "the post chain config");
    expectHeld(harness, (captured) => captured.textures, "the texture set");
    expectHeld(harness, (captured) => captured.material, "the textured material");
    expect(harness.composerDisposals(), "the effect composer was rebuilt on the second render").toBe(0);
    expect(harness.pixelRatioReads(), "the post chain resized on the second render").toBe(readsAfterFirst);
  } finally {
    await harness.retire();
  }
});

test("a changed authored look still rebuilds the chain, so the guard is not blind", async () => {
  const harness = await mount([textures.color, textures.normal]);
  try {
    await harness.render(baseLook);
    await harness.render({ look: "neutral" });
    expect(harness.capture(1).look).not.toBe(harness.capture(0).look);
    expect(harness.capture(1).post).not.toBe(harness.capture(0).post);
    expect(harness.composerDisposals(), "a changed look should rebuild the effect composer").toBe(1);
  } finally {
    await harness.retire();
  }
});
