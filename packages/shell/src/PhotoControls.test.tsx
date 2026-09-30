import { describe, expect, test } from "bun:test";
import { playControlsActive, suspendPlayControls } from "@jgengine/core/game/controlGate";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { attachPhotoControls } from "./PhotoControls";
import { createSceneCapture } from "./render/sceneCaptureRuntime";

function context() {
  return createGameContext({ definition: defineGameDefinition({ name: "photo-controls", assets: createAssetCatalog() }), content: {}, player: { userId: "courier", isNew: true } });
}

describe("photo controls ownership", () => {
  test("explicit close cancels the pending read, restores the overlay and releases only its own control lease once", async () => {
    const ctx = context();
    const releaseMenu = suspendPlayControls(ctx);
    let frame = () => {};
    let cancelled = 0;
    let downloads = 0;
    let focused = 0;
    let visibility = "collapse";
    let priority = "important";
    const overlay = { style: {
      getPropertyValue: () => visibility, getPropertyPriority: () => priority,
      setProperty: (_name: string, value: string, nextPriority: string) => { visibility = value; priority = nextPriority; },
      removeProperty: () => { visibility = ""; priority = ""; },
    } as unknown as CSSStyleDeclaration };
    const photograph = createSceneCapture({ requestFrame: (run) => { frame = run; return () => { cancelled++; }; }, download: () => { downloads++; } });
    photograph.bind(() => "data:image/png;base64,AAAA");
    photograph.photoMode.enter();
    const detach = attachPhotoControls(ctx, photograph, { eligible: () => true, restore: () => { focused++; } });
    const pending = photograph.capture({ overlay });
    expect(visibility).toBe("hidden");
    photograph.photoMode.exit();
    detach();
    detach();
    frame();
    expect(await pending).toMatchObject({ ok: false, reason: "unmounted" });
    expect([visibility, priority]).toEqual(["collapse", "important"]);
    expect([cancelled, downloads, focused]).toEqual([1, 0, 1]);
    expect(playControlsActive(ctx)).toBe(false);
    releaseMenu();
    expect(playControlsActive(ctx)).toBe(true);
  });

  test("active unmount releases its old context without focusing or changing a replacement game's lease", () => {
    const previous = context();
    const next = context();
    const photograph = createSceneCapture();
    photograph.photoMode.enter();
    let focused = 0;
    const detach = attachPhotoControls(previous, photograph, { eligible: () => true, restore: () => { focused++; } });
    const releaseNext = suspendPlayControls(next);
    detach();
    expect(focused).toBe(0);
    expect(playControlsActive(previous)).toBe(true);
    expect(playControlsActive(next)).toBe(false);
    releaseNext();
  });

  test("closed stale context, disconnected surface or deliberate outside focus cannot restore gameplay focus", () => {
    for (const boundary of ["context-replaced", "surface-detached", "outside-control"] as const) {
      const ctx = context();
      const photograph = createSceneCapture();
      photograph.photoMode.enter();
      let current = true;
      let connected = true;
      let ownedFocus = true;
      let focused = 0;
      const detach = attachPhotoControls(ctx, photograph, { eligible: () => current && connected && ownedFocus, restore: () => { focused++; } });
      if (boundary === "context-replaced") current = false;
      if (boundary === "surface-detached") connected = false;
      if (boundary === "outside-control") ownedFocus = false;
      photograph.photoMode.exit();
      detach();
      expect(focused).toBe(0);
      expect(playControlsActive(ctx)).toBe(true);
    }
  });
});
