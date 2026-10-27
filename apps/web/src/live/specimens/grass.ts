/**
 * Live demo: the engine's own grass, the same `GrassStream` and material every game draws with, over a
 * small field. Every knob a game or the editor sets (`readGrassLook`) rebuilds the patch, so a preset or
 * slider change is the real renderer's answer, not a website stand-in.
 */
import * as THREE from "three";

import { readGrassLook } from "@jgengine/core/grass/grassKind";
import { resolveGrassBake } from "@jgengine/core/grass/grassBake.draw";
import { createGrassMaterial, type GrassMaterialHandle } from "@jgengine/core/grass/grassMaterial.draw";
import { GrassStream } from "@jgengine/core/grass/grassStream.draw";

import { mountLive } from "../mount";
import type { Trace } from "../trace";

export interface GrassSpecimen {
  setDials(dials: Readonly<Record<string, unknown>>): void;
  dispose(): void;
}

const AREA = 80;
const SKY = 0xbfd6ea;

export function createGrassSpecimen(container: HTMLElement, trace: Trace): GrassSpecimen {
  let patch: { stream: GrassStream; handle: GrassMaterialHandle } | null = null;
  let ground: THREE.Mesh | null = null;
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  let viewHeight = container.clientHeight || 400;

  const live = mountLive(container, {
    fov: 45,
    near: 0.05,
    far: 200,
    frame(_dt, elapsed) {
      const a = elapsed * 0.06;
      live.camera.position.set(Math.sin(a) * 11, 3.2 + Math.sin(elapsed * 0.2) * 0.3, Math.cos(a) * 11);
      live.camera.lookAt(0, 0, 0);
      if (patch !== null) {
        patch.handle.uniforms.uTime.value = elapsed;
        patch.stream.update(live.camera, viewHeight, 4);
        trace.hit("wind");
      }
    },
    onDispose() {
      if (rebuildTimer !== null) clearTimeout(rebuildTimer);
      dropPatch();
      ground?.geometry.dispose();
      (ground?.material as THREE.Material | undefined)?.dispose();
    },
  });
  live.scene.background = new THREE.Color(SKY);
  live.scene.fog = new THREE.Fog(SKY, 14, 36);
  live.scene.add(new THREE.HemisphereLight(0xdcefff, 0x3a4a22, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
  sun.position.set(-8, 10, 4);
  live.scene.add(sun);
  const resize = new ResizeObserver(() => (viewHeight = container.clientHeight || viewHeight));
  resize.observe(container);

  function dropPatch() {
    if (patch === null) return;
    live.scene.remove(patch.stream.group);
    patch.stream.dispose();
    patch.handle.material.dispose();
    patch = null;
  }

  function build(dials: Readonly<Record<string, unknown>>) {
    const look = readGrassLook({ ...dials, seed: "site-meadow" });
    const groundColor = new THREE.Color(look.baseColor).multiplyScalar(0.55);
    if (ground === null) {
      ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 1 }));
      live.scene.add(ground);
    }
    (ground.material as THREE.MeshStandardMaterial).color.copy(groundColor);
    dropPatch();
    const bake = resolveGrassBake({ look, area: [AREA, AREA], seed: "site-meadow" });
    const handle = createGrassMaterial(look, groundColor);
    const stream = new GrassStream(bake, handle, { receiveShadow: false, frustumCulled: true });
    stream.update(live.camera, viewHeight, 40);
    live.scene.add(stream.group);
    patch = { stream, handle };
  }

  return {
    setDials(dials) {
      if (rebuildTimer !== null) clearTimeout(rebuildTimer);
      // A slider fires many changes per second; rebuild once it rests briefly.
      rebuildTimer = setTimeout(() => build(dials), patch === null ? 0 : 120);
    },
    dispose() {
      resize.disconnect();
      live.dispose();
    },
  };
}
