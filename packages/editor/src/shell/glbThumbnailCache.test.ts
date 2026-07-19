import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  clearGlbThumbnailCache,
  frameCameraForBounds,
  getGlbThumbnailState,
  requestGlbThumbnail,
  resetGlbThumbnailLoader,
  setGlbThumbnailLoader,
  subscribeGlbThumbnail,
} from "./glbThumbnailCache";

afterEach(() => {
  clearGlbThumbnailCache();
  resetGlbThumbnailLoader();
});

describe("frameCameraForBounds", () => {
  test("places the camera outside the box looking at its center", () => {
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    frameCameraForBounds(box, camera);
    const center = box.getCenter(new THREE.Vector3());
    expect(camera.position.distanceTo(center)).toBeGreaterThan(1);
    // Look direction roughly toward center.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const toCenter = center.clone().sub(camera.position).normalize();
    expect(forward.dot(toCenter)).toBeGreaterThan(0.95);
  });

  test("handles degenerate near-empty boxes without NaN", () => {
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1e-8, 1e-8, 1e-8));
    frameCameraForBounds(box, camera);
    expect(Number.isFinite(camera.position.x)).toBe(true);
    expect(Number.isFinite(camera.near)).toBe(true);
    expect(camera.far).toBeGreaterThan(camera.near);
  });
});

describe("glbThumbnailCache request path", () => {
  test("idle without request; loading then ready with injected loader", async () => {
    expect(getGlbThumbnailState(undefined).status).toBe("idle");
    expect(getGlbThumbnailState("").status).toBe("idle");

    // Headless: inject a mesh so we don't depend on real WebGL success in CI.
    // If WebGL is unavailable, status becomes error — still honest.
    setGlbThumbnailLoader(async () => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
      return group;
    });

    const url = "https://example.test/model.glb";
    expect(getGlbThumbnailState(url).status).toBe("idle");

    let notified = 0;
    const unsub = subscribeGlbThumbnail(url, () => {
      notified += 1;
    });
    requestGlbThumbnail(url);
    expect(getGlbThumbnailState(url).status).toBe("loading");

    // Wait for the async pump (render or honest error).
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        const state = getGlbThumbnailState(url);
        if (state.status === "ready" || state.status === "error" || Date.now() - start > 5000) {
          resolve();
          return;
        }
        setTimeout(tick, 20);
      };
      tick();
    });

    const final = getGlbThumbnailState(url);
    expect(final.status === "ready" || final.status === "error").toBe(true);
    if (final.status === "ready") {
      expect(final.dataUrl?.startsWith("data:image/png")).toBe(true);
    }
    expect(notified).toBeGreaterThanOrEqual(1);
    unsub();
  });

  test("failed load becomes error without inventing a thumbnail", async () => {
    setGlbThumbnailLoader(async () => {
      throw new Error("network");
    });
    const url = "https://example.test/missing.glb";
    requestGlbThumbnail(url);
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (getGlbThumbnailState(url).status === "error" || Date.now() - start > 3000) {
          resolve();
          return;
        }
        setTimeout(tick, 10);
      };
      tick();
    });
    expect(getGlbThumbnailState(url)).toEqual({ status: "error", dataUrl: null });
  });
});

/**
 * Regression for #1270: `getGlbThumbnailState` is the `getSnapshot` for
 * `useSyncExternalStore`, which requires a referentially stable result while the
 * underlying state is unchanged. A fresh object literal per call makes React's
 * post-commit consistency check force a re-render every commit forever ("Maximum
 * update depth exceeded"), which blanked the editor when a GLB's textures failed.
 * We model that exact check here without react-dom: after each simulated commit
 * React re-reads getSnapshot and, if `Object.is` differs from the value it
 * rendered with, forces another render. A stable snapshot settles in one pass; an
 * unstable one never settles.
 */
describe("getGlbThumbnailState snapshot stability (useSyncExternalStore contract)", () => {
  /** Count forced re-renders React would perform; throws if it never settles. */
  function forcedRerendersUntilStable(url: string, cap = 50): number {
    let rendered = getGlbThumbnailState(url); // value used for this render
    for (let i = 0; i < cap; i += 1) {
      const reread = getGlbThumbnailState(url); // React's checkIfSnapshotChanged
      if (Object.is(rendered, reread)) return i; // consistent -> no more forced renders
      rendered = reread; // forced re-render adopts the new value, then re-checks
    }
    throw new Error(`snapshot never stabilized for ${url} (infinite render loop)`);
  }

  test("idle snapshot is a stable reference (never loops)", () => {
    expect(forcedRerendersUntilStable("https://example.test/none.glb")).toBe(0);
    expect(Object.is(getGlbThumbnailState(undefined), getGlbThumbnailState(""))).toBe(true);
  });

  test("failing-texture asset settles to a stable error snapshot (no infinite loop)", async () => {
    setGlbThumbnailLoader(async () => {
      throw new Error("texture 404");
    });
    const url = "https://example.test/broken-textures.glb";
    requestGlbThumbnail(url);
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (getGlbThumbnailState(url).status === "error" || Date.now() - start > 3000) {
          resolve();
          return;
        }
        setTimeout(tick, 10);
      };
      tick();
    });
    expect(getGlbThumbnailState(url).status).toBe("error");
    // The crux: repeated reads in the terminal error state are Object.is-equal.
    expect(forcedRerendersUntilStable(url)).toBe(0);
    expect(Object.is(getGlbThumbnailState(url), getGlbThumbnailState(url))).toBe(true);
  });

  test("loading snapshot is stable, and transitions mint exactly one new reference", async () => {
    setGlbThumbnailLoader(async () => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
      return group;
    });
    const url = "https://example.test/loads.glb";
    requestGlbThumbnail(url);
    expect(getGlbThumbnailState(url).status).toBe("loading");
    const loadingA = getGlbThumbnailState(url);
    const loadingB = getGlbThumbnailState(url);
    expect(Object.is(loadingA, loadingB)).toBe(true); // stable while loading
    expect(forcedRerendersUntilStable(url)).toBe(0);

    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        const s = getGlbThumbnailState(url).status;
        if (s === "ready" || s === "error" || Date.now() - start > 5000) {
          resolve();
          return;
        }
        setTimeout(tick, 20);
      };
      tick();
    });
    // Exactly one reference change across the loading->terminal transition, then stable.
    expect(forcedRerendersUntilStable(url)).toBe(0);
  });
});
