import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import type { PlayableGame } from "@jgengine/shell/registry";
import { applyModelWind, resolveModelWind, windClock } from "@jgengine/shell/render/modelWind";

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
  useFrame(() => {
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
  return (
    <group position={[0, 0, 0]}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 8, 6]} intensity={2.2} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#39423a" roughness={1} />
      </mesh>
      {materials.map((entry, index) => (
        <group key={entry.label} position={[(index - 1) * 2.6, 0, 0]}>
          <mesh geometry={trunks} material={entry.material} position={[0, 1.7, 0]} castShadow />
          <mesh geometry={fronds} material={entry.material} position={[0, 3.6, 0]} castShadow />
        </group>
      ))}
    </group>
  );
}

const time = Number(pinnedTime ?? "0.6");

export const foliageWindGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "foliage-wind" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  look: "flat",
  lighting: { ambient: { intensity: 0.5 }, directional: [{ intensity: 2.4, position: [4, 8, 6], color: "#fff3e0" }] },
  backdrop: { background: "#20262b" },
  postProcessing: { enabled: true, toneMapping: "aces", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  environment: () => <Foliage time={time} />,
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
