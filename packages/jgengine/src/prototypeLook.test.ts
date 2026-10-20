import { describe, expect, test } from "bun:test";

import { assessPrototypeLook } from "./prototypeLook";

describe("assessPrototypeLook", () => {
  test("flags flat look without graphics as prototype", () => {
    const verdict = assessPrototypeLook([
      `export const game = defineGame({
        name: "Box World",
        look: "flat",
        world,
        entityModels: { player: "asset:person_casual" },
      });`,
    ]);
    expect(verdict.isPrototype).toBe(true);
    expect(verdict.reasons.some((r) => r.includes("flat"))).toBe(true);
  });

  test("flags 3D game with no model seams as prototype", () => {
    const verdict = assessPrototypeLook([
      `export const game = defineGame({
        name: "Box World",
        world,
        physics,
        camera: { perspective: "third" },
      });`,
    ]);
    expect(verdict.isPrototype).toBe(true);
    expect(verdict.reasons.some((r) => r.includes("model"))).toBe(true);
  });

  test("passes cinematic + entityModels scaffold", () => {
    const verdict = assessPrototypeLook([
      `import { createStarterCatalog } from "@jgengine/assets";
      export const game = defineGame({
        name: "Shipped",
        look: "cinematic",
        assets: createStarterCatalog(),
        world,
        entityModels: { player: "asset:person_casual" },
        objectModels: { crate: "asset:prop_crate" },
        camera: { perspective: "third" },
      });`,
    ]);
    expect(verdict.isPrototype).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });

  test("passes custom renderEntity without entityModels", () => {
    const verdict = assessPrototypeLook([
      `export const game = defineGame({
        name: "Duet",
        look: "toon",
        world,
        renderEntity: renderHero,
        renderObject: renderDuetObject,
        camera: { rig: "topDown" },
      });`,
    ]);
    expect(verdict.isPrototype).toBe(false);
  });

  test("passes an authored scene without model seams (shell auto-mounts AuthoredScene)", () => {
    const verdict = assessPrototypeLook([
      `export const game = defineGame({
        name: "Thin",
        look: "photoreal",
        systems,
        loop: { onNewPlayer },
        GameUI,
        editorLayers,
      });`,
    ]);
    expect(verdict.isPrototype).toBe(false);
    expect(verdict.signals.hasAuthoredScene).toBe(true);
  });

  test("skips HUD-only presentation", () => {
    const verdict = assessPrototypeLook([
      `export const game = defineGame({
        name: "Cards",
        presentation: "hud",
        look: "flat",
      });`,
    ]);
    expect(verdict.isPrototype).toBe(false);
  });

  test("passes WorldOverlay studio without entityModels", () => {
    const verdict = assessPrototypeLook([
      `export const game = defineGame({
        name: "Studio",
        world,
        WorldOverlay: StudioShowcaseOverlay,
        postProcessing: STUDIO_STAGE_POST,
      });`,
    ]);
    expect(verdict.isPrototype).toBe(false);
  });

  test("flags a 3D game that never chooses a look or post stack", () => {
    const verdict = assessPrototypeLook([
      `export const game = defineGame({
        name: "Unstyled",
        world,
        entityModels: { player: "asset:person_casual" },
        camera: { perspective: "third", look: "@marker:player_spawn" },
      });`,
    ]);
    expect(verdict.isPrototype).toBe(true);
    expect(verdict.signals.lookUnset).toBe(true);
    expect(verdict.reasons.some((r) => r.includes("neutral"))).toBe(true);
  });

  test("passes a deliberate neutral look", () => {
    const verdict = assessPrototypeLook([
      `export const game = defineGame({ name: "Plain", look: "neutral", world, entityModels });`,
    ]);
    expect(verdict.isPrototype).toBe(false);
  });
});
