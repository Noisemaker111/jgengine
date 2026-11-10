import { useEffect, useMemo } from "react";
import { disposeObjectTree, SceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { StageDraw } from "@jgengine/core/stage/stageDraw.draw";
import * as THREE from "three";

import type { PlayableGame } from "@jgengine/shell/registry";
import { applyModelWind, resolveModelWind, windClock } from "@jgengine/core/model/modelWind.draw";

import { demoGame } from "./demoGame";

const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
/** `?t=0.6` pins the shared gust clock so two captures are the same scene in two wind states. */
const pinnedTime = params.get("t");

/**
 * Foliage wind evidence: three authored sway settings on the same plant, with the shared gust clock
 * pinned by `?t=` so two shots differ only by wind. The right-hand plant is rigid (`wind: false`),
 * which is what "per-material" means — a sapling and a palm need not move alike, and a rock never moves.
 */
function Foliage({ time }: { time: number }) {
  // Runs after the world's own `WindClock` (default priority 0), so the pinned clock wins per frame.
  useFrameTask(() => {
    windClock.value = time;
  }, 1);
  const materials = useMemo(() => {
    const settings = [
      { color: "#4d7a3a", wind: { strength: 0.3, speed: 0.8, height: 5 }, label: "palm · 0.3 m" },
      { color: "#6f8f43", wind: { strength: 0.75, speed: 1.5, height: 3.2 }, label: "sapling · 0.75 m" },
      { color: "#7d7f70", wind: false as const, label: "rigid" },
    ];
    return settings.map((entry) => {
      const material = new THREE.MeshStandardMaterial({ color: entry.color, roughness: 0.8, metalness: 0 });
      const wind = resolveModelWind(entry.wind, 4);
      if (wind !== null) applyModelWind(material, wind);
      return { material, label: entry.label };
    });
  }, []);
  const trunks = useMemo(() => new THREE.CylinderGeometry(0.09, 0.14, 3.4, 8), []);
  const fronds = useMemo(() => new THREE.ConeGeometry(1.15, 1.6, 7, 1), []);
  const rig = useMemo(() => {
    const root = new THREE.Group();
    const groundGeo = new THREE.PlaneGeometry(24, 24);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: "#39423a", roughness: 1 }));
    ground.receiveShadow = true;
    root.add(ground);
    materials.forEach((entry, index) => {
      const holder = new THREE.Group();
      holder.position.set((index - 1) * 2.6, 0, 0);
      const trunk = new THREE.Mesh(trunks, entry.material);
      trunk.position.set(0, 1.7, 0);
      trunk.castShadow = true;
      const crown = new THREE.Mesh(fronds, entry.material);
      crown.position.set(0, 3.6, 0);
      crown.castShadow = true;
      holder.add(trunk, crown);
      root.add(holder);
    });
    return root;
  }, [materials, trunks, fronds]);
  useEffect(() => () => disposeObjectTree(rig), [rig]);
  return (
    <>
      <StageDraw spec={{ lights: [{ kind: "ambient", intensity: 0.7 }, { kind: "directional", position: [4, 8, 6], intensity: 2.2 }] }} />
      <SceneObjectAttach object={rig} />
    </>
  );
}

const time = Number(pinnedTime ?? "0.6");

export const foliageWindGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "foliage-wind" },
  scene: {
    renderEntity: () => null,
    renderObject: () => null,
    environment: () => <Foliage time={time} />,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: {
    look: "flat",
    lighting: { ambient: { intensity: 0.5 }, directional: [{ intensity: 2.4, position: [4, 8, 6], color: "#fff3e0" }] },
    backdrop: { background: "#20262b" },
    postProcessing: { enabled: true, toneMapping: "aces", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  },
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#f2f3f0", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
      <div style={{ position: "absolute", top: 14, left: 18, fontSize: 15, fontWeight: 600 }}>
        Model wind · same gust clock at t={time.toFixed(2)}s · per-model sway: {time % 2 < 1 ? "gust peak" : "lull"}
      </div>
      <div style={{ position: "absolute", bottom: 14, left: 18, fontSize: 11, opacity: 0.85 }}>
        palm 0.3 m travel · sapling 0.75 m · rigid material never moves
      </div>
    </div>
  ),
  capture: {
    views: {
      state: { look: "0,3.1,0", lookFrom: "5.5,2.9,0.12" },
    },
  },
};
