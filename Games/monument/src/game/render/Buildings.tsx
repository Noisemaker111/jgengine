import type { ReactNode } from "react";
import { memo, useMemo } from "react";
import * as THREE from "three";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { MassingBody } from "@jgengine/core/world/massing";
import { isVillageMassing, massingBase } from "@jgengine/core/world/massing";

import { useGameClock, useGameStore } from "@jgengine/react/hooks";

import { CELL, TONES, type Building, type FacadeStrategy, type Plaza, type Program, type Tone } from "../catalog";
import { buildingBodies, clamp, NEUTRAL_SIGNALS, programOccupancy, solarModel } from "../city/model";
import { cityBuildings, cityPlazas, selectedId } from "../city/state";
import { concreteShader, getConcreteTexture, roleSurfaceColor, weatheredColor } from "./concrete";
import { MONUMENT_SCENE } from "./Environment";
import { MassingGizmo } from "./Gizmos";

const FACADE_FLOORS = 12;
const FACADE_BAYS = 6;

const ACCENT: Record<Program, string> = {
  housing: "#92513f",
  work: "#516975",
  civic: "#aa923e",
  culture: "#a95847",
  mixed: "#697951",
};

const specialLightColor = (seed: number): string => (seed % 2 === 0 ? MONUMENT_SCENE.window : MONUMENT_SCENE.windowAlt);

const bodyWorldPoint = (body: MassingBody, position: [number, number, number]): THREE.Vector3 =>
  new THREE.Vector3(position[0], position[1], position[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), body.ry ?? 0);

function ConcreteBody({ body, color, selected }: { body: MassingBody; color: string; selected: boolean }): ReactNode {
  const texture = getConcreteTexture();
  const surface = roleSurfaceColor(color, body.role);
  return (
    <mesh
      position={[body.x, body.y, body.z]}
      rotation={body.kind === "capsule" ? [0, 0, Math.PI / 2] : [0, 0, 0]}
      scale={body.kind === "capsule" ? [body.h, body.w / 2, body.d] : [1, 1, 1]}
      castShadow
      receiveShadow
    >
      {body.kind === "capsule" ? <capsuleGeometry args={[0.5, 1, 6, 16]} /> : <boxGeometry args={[body.w, body.h, body.d]} />}
      <meshStandardMaterial
        color={surface}
        map={texture}
        bumpMap={texture}
        bumpScale={0.055}
        roughness={0.93}
        metalness={0.015}
        emissive={selected ? "#d7ff43" : "#000000"}
        emissiveIntensity={selected ? 0.055 : 0}
        onBeforeCompile={concreteShader}
      />
    </mesh>
  );
}

function ConstructionJoints({ body, tone }: { body: MassingBody; tone: Tone }): ReactNode {
  if (body.facade !== true) return null;
  const lifts = Math.max(3, Math.min(9, Math.round(body.h / 9)));
  const color = tone === "charcoal" ? "#292d2b" : "#6d6e68";
  return (
    <>
      {Array.from({ length: lifts - 1 }, (_, i) => {
        const y = body.y - body.h / 2 + ((i + 1) * body.h) / lifts;
        return (
          <group key={i}>
            <mesh position={[body.x, y, body.z + body.d / 2 + 0.035]}>
              <boxGeometry args={[body.w * 0.97, 0.045, 0.04]} />
              <meshBasicMaterial color={color} transparent opacity={0.45} />
            </mesh>
            <mesh position={[body.x, y, body.z - body.d / 2 - 0.035]}>
              <boxGeometry args={[body.w * 0.97, 0.045, 0.04]} />
              <meshBasicMaterial color={color} transparent opacity={0.45} />
            </mesh>
            <mesh position={[body.x + body.w / 2 + 0.035, y, body.z]}>
              <boxGeometry args={[0.04, 0.045, body.d * 0.97]} />
              <meshBasicMaterial color={color} transparent opacity={0.38} />
            </mesh>
            <mesh position={[body.x - body.w / 2 - 0.035, y, body.z]}>
              <boxGeometry args={[0.04, 0.045, body.d * 0.97]} />
              <meshBasicMaterial color={color} transparent opacity={0.38} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function BeamBetween({
  from,
  to,
  width = 0.28,
  color = "#6c6f68",
}: {
  from: [number, number, number];
  to: [number, number, number];
  width?: number;
  color?: string;
}): ReactNode {
  const a = new THREE.Vector3(from[0], from[1], from[2]);
  const d = new THREE.Vector3(to[0], to[1], to[2]).sub(a);
  const length = d.length();
  const mid = a.clone().add(d.clone().multiplyScalar(0.5));
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return (
    <mesh position={[mid.x, mid.y, mid.z]} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[width, width, length, 6]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function FacadeLayer({
  b,
  body,
  strategy,
  night,
  occupancy,
}: {
  b: Building;
  body: MassingBody;
  strategy: FacadeStrategy;
  night: boolean;
  occupancy: number;
}): ReactNode {
  if (body.h < b.floorHeight * 1.35 || body.facade !== true || body.kind === "capsule") return null;
  const floors = Math.max(1, Math.min(FACADE_FLOORS, Math.floor(body.h / b.floorHeight)));
  const bays = Math.max(2, Math.min(FACADE_BAYS, Math.round(body.w / b.baySpacing)));
  const sideBays = Math.max(2, Math.min(Math.max(4, FACADE_BAYS - 1), Math.round(body.d / b.baySpacing)));
  const floor = body.h / floors;
  const bay = body.w / bays;
  const sideBay = body.d / sideBays;
  const windowMaterial = (seed: number) => {
    if (!night) return { glass: "#111e26", emissive: "#000000", intensity: 0 };
    const random = Math.abs(Math.sin(seed * 12.9898 + body.x * 0.17 + body.z * 0.11) * 43758.5453) % 1;
    const active = random < clamp(0.16 + occupancy * 0.7, 0.16, 0.88);
    const c = seed % 3 === 0 ? MONUMENT_SCENE.windowAlt : MONUMENT_SCENE.window;
    return {
      glass: new THREE.Color(c).multiplyScalar(active ? 0.52 : 0.2).getStyle(),
      emissive: c,
      intensity: active ? MONUMENT_SCENE.windowIntensity : MONUMENT_SCENE.windowIntensity * 0.18,
    };
  };
  const concrete = TONES[b.tone].color;
  const accent = b.tone === "white" ? "#a95f49" : b.tone === "charcoal" ? "#c1945c" : "#6e5847";
  const elements: ReactNode[] = [];
  const continuous = strategy !== "punched";
  const gridish = strategy === "deep-grid" || strategy === "brise-soleil" || strategy === "exoskeleton";
  const projection =
    strategy === "brise-soleil"
      ? b.facadeDepth
      : strategy === "exoskeleton"
        ? Math.max(1.2, b.facadeDepth)
        : Math.max(0.35, b.facadeDepth * 0.55);

  for (let f = 0; f < floors; f++) {
    const y = body.y - body.h / 2 + floor * (f + 0.53);
    const windowH = Math.max(0.72, floor * (strategy === "ribbon" ? 0.5 : 0.38));
    for (const face of [-1, 1]) {
      const z = body.z + face * (body.d / 2 + 0.022);
      if (continuous) {
        const w = windowMaterial(f * 11 + face + Math.round(body.x));
        elements.push(
          <mesh key={`fz-${f}-${face}`} position={[body.x, y, z]} rotation={[0, face < 0 ? Math.PI : 0, 0]}>
            <planeGeometry args={[body.w * 0.92, windowH]} />
            <meshStandardMaterial color={w.glass} emissive={w.emissive} emissiveIntensity={w.intensity} roughness={0.25} metalness={0.16} />
          </mesh>,
        );
      } else {
        for (let i = 0; i < bays; i++) {
          const x = body.x - body.w / 2 + bay * (i + 0.5);
          const winW = bay * Math.min(0.72, b.porosity / 88);
          const w = windowMaterial(f * 17 + i * 5 + face + Math.round(body.z));
          elements.push(
            <group key={`pz-${f}-${face}-${i}`}>
              <mesh position={[x, y, z]} rotation={[0, face < 0 ? Math.PI : 0, 0]}>
                <planeGeometry args={[winW, windowH]} />
                <meshStandardMaterial color={w.glass} emissive={w.emissive} emissiveIntensity={w.intensity * 0.72} />
              </mesh>
              {f % 2 === 0 && (
                <mesh position={[x, y + windowH / 2 + 0.14, body.z + face * (body.d / 2 + b.facadeDepth * 0.34)]}>
                  <boxGeometry args={[winW + 0.45, 0.25, Math.max(0.35, b.facadeDepth * 0.65)]} />
                  <meshStandardMaterial color={concrete} roughness={0.97} />
                </mesh>
              )}
            </group>,
          );
        }
      }
      if (gridish && (strategy !== "deep-grid" || f % 2 === 0 || f === floors - 1))
        elements.push(
          <mesh key={`bz-${f}-${face}`} position={[body.x, y + windowH / 2 + 0.15, body.z + face * (body.d / 2 + projection * 0.46)]} castShadow>
            <boxGeometry args={[body.w + 0.2, 0.3, projection]} />
            <meshStandardMaterial color={concrete} roughness={0.96} />
          </mesh>,
        );
    }
    for (const face of [-1, 1]) {
      const x = body.x + face * (body.w / 2 + 0.022);
      if (continuous) {
        const w = windowMaterial(f * 13 + face + Math.round(body.z));
        elements.push(
          <mesh key={`fx-${f}-${face}`} position={[x, y, body.z]} rotation={[0, face > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <planeGeometry args={[body.d * 0.92, windowH]} />
            <meshStandardMaterial color={w.glass} emissive={w.emissive} emissiveIntensity={w.intensity} roughness={0.25} metalness={0.16} />
          </mesh>,
        );
      } else {
        for (let i = 0; i < sideBays; i++) {
          const z = body.z - body.d / 2 + sideBay * (i + 0.5);
          const winW = sideBay * Math.min(0.72, b.porosity / 88);
          const w = windowMaterial(f * 19 + i * 3 + face + Math.round(body.x));
          elements.push(
            <group key={`px-${f}-${face}-${i}`}>
              <mesh position={[x, y, z]} rotation={[0, face > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
                <planeGeometry args={[winW, windowH]} />
                <meshStandardMaterial color={w.glass} emissive={w.emissive} emissiveIntensity={w.intensity * 0.72} />
              </mesh>
              {f % 2 === 0 && (
                <mesh position={[body.x + face * (body.w / 2 + b.facadeDepth * 0.34), y + windowH / 2 + 0.14, z]}>
                  <boxGeometry args={[Math.max(0.35, b.facadeDepth * 0.65), 0.25, winW + 0.45]} />
                  <meshStandardMaterial color={concrete} roughness={0.97} />
                </mesh>
              )}
            </group>,
          );
        }
      }
      if (gridish && (strategy !== "deep-grid" || f % 2 === 0 || f === floors - 1))
        elements.push(
          <mesh key={`bx-${f}-${face}`} position={[body.x + face * (body.w / 2 + projection * 0.46), y + windowH / 2 + 0.15, body.z]} castShadow>
            <boxGeometry args={[projection, 0.3, body.d + 0.2]} />
            <meshStandardMaterial color={concrete} roughness={0.96} />
          </mesh>,
        );
    }
  }

  if (gridish) {
    for (let i = 0; i <= bays; i++) {
      const x = body.x - body.w / 2 + bay * i;
      for (const face of [-1, 1])
        elements.push(
          <mesh key={`vz-${i}-${face}`} position={[x, body.y, body.z + face * (body.d / 2 + projection * 0.5)]} castShadow>
            <boxGeometry args={[0.24, body.h * 0.96, projection]} />
            <meshStandardMaterial color={concrete} roughness={0.96} />
          </mesh>,
        );
    }
    for (let i = 0; i <= sideBays; i++) {
      const z = body.z - body.d / 2 + sideBay * i;
      for (const face of [-1, 1])
        elements.push(
          <mesh key={`vx-${i}-${face}`} position={[body.x + face * (body.w / 2 + projection * 0.5), body.y, z]} castShadow>
            <boxGeometry args={[projection, body.h * 0.96, 0.24]} />
            <meshStandardMaterial color={concrete} roughness={0.96} />
          </mesh>,
        );
    }
  } else if (strategy === "ribbon") {
    for (let i = 1; i < bays; i++) {
      const x = body.x - body.w / 2 + bay * i;
      for (const face of [-1, 1])
        elements.push(
          <mesh key={`mz-${i}-${face}`} position={[x, body.y, body.z + face * (body.d / 2 + 0.1)]}>
            <boxGeometry args={[0.12, body.h * 0.95, 0.22]} />
            <meshStandardMaterial color="#383c3a" />
          </mesh>,
        );
    }
    for (let i = 1; i < sideBays; i++) {
      const z = body.z - body.d / 2 + sideBay * i;
      for (const face of [-1, 1])
        elements.push(
          <mesh key={`mx-${i}-${face}`} position={[body.x + face * (body.w / 2 + 0.1), body.y, z]}>
            <boxGeometry args={[0.22, body.h * 0.95, 0.12]} />
            <meshStandardMaterial color="#383c3a" />
          </mesh>,
        );
    }
  }

  if (strategy === "screen") {
    const louverDepth = Math.max(0.65, b.facadeDepth);
    for (let i = 0; i <= bays * 2; i++) {
      const x = body.x - body.w / 2 + (body.w * i) / (bays * 2);
      for (const face of [-1, 1])
        elements.push(
          <mesh key={`sz-${i}-${face}`} position={[x, body.y, body.z + face * (body.d / 2 + louverDepth * 0.46)]} castShadow>
            <boxGeometry args={[0.12, body.h * 0.94, louverDepth]} />
            <meshStandardMaterial color={concrete} />
          </mesh>,
        );
    }
    for (let i = 0; i <= sideBays * 2; i++) {
      const z = body.z - body.d / 2 + (body.d * i) / (sideBays * 2);
      for (const face of [-1, 1])
        elements.push(
          <mesh key={`sx-${i}-${face}`} position={[body.x + face * (body.w / 2 + louverDepth * 0.46), body.y, z]} castShadow>
            <boxGeometry args={[louverDepth, body.h * 0.94, 0.12]} />
            <meshStandardMaterial color={concrete} />
          </mesh>,
        );
    }
  }

  if (strategy === "exoskeleton")
    for (const face of [-1, 1]) {
      const z = body.z + face * (body.d / 2 + projection * 0.58);
      const x = body.x + face * (body.w / 2 + projection * 0.58);
      const width = Math.max(0.25, b.facadeDepth * 0.13);
      elements.push(
        <BeamBetween
          key={`exo-z-a-${face}`}
          from={[body.x - body.w * 0.48, body.y - body.h * 0.48, z]}
          to={[body.x + body.w * 0.48, body.y + body.h * 0.48, z]}
          width={width}
          color={accent}
        />,
        <BeamBetween
          key={`exo-z-b-${face}`}
          from={[body.x + body.w * 0.48, body.y - body.h * 0.48, z]}
          to={[body.x - body.w * 0.48, body.y + body.h * 0.48, z]}
          width={width}
          color={accent}
        />,
        <BeamBetween
          key={`exo-x-a-${face}`}
          from={[x, body.y - body.h * 0.48, body.z - body.d * 0.48]}
          to={[x, body.y + body.h * 0.48, body.z + body.d * 0.48]}
          width={width}
          color={accent}
        />,
        <BeamBetween
          key={`exo-x-b-${face}`}
          from={[x, body.y - body.h * 0.48, body.z + body.d * 0.48]}
          to={[x, body.y + body.h * 0.48, body.z - body.d * 0.48]}
          width={width}
          color={accent}
        />,
      );
    }

  const balconyStep = b.balconies > 66 ? 2 : b.balconies > 28 ? 3 : b.balconies > 5 ? 5 : 99;
  for (let f = 1; f < floors; f += balconyStep) {
    const y = body.y - body.h / 2 + floor * (f + 0.17);
    for (const face of [-1, 1])
      elements.push(
        <group key={`balcony-${f}-${face}`}>
          <mesh position={[body.x, y, body.z + face * (body.d / 2 + 0.55 + b.facadeDepth * 0.34)]} castShadow>
            <boxGeometry args={[body.w * 0.94, 0.2, 1.1 + b.facadeDepth * 0.7]} />
            <meshStandardMaterial color={concrete} roughness={0.96} />
          </mesh>
          <mesh position={[body.x, y + 0.65, body.z + face * (body.d / 2 + 1.05 + b.facadeDepth * 0.68)]}>
            <boxGeometry args={[body.w * 0.94, 0.72, 0.08]} />
            <meshStandardMaterial color={accent} roughness={0.5} />
          </mesh>
        </group>,
      );
  }
  return <>{elements}</>;
}

function Tree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }): ReactNode {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 4.4, 8]} />
        <meshStandardMaterial color="#4a3727" roughness={1} />
      </mesh>
      <mesh position={[0, 4.8, 0]} castShadow>
        <icosahedronGeometry args={[2.25, 2]} />
        <meshStandardMaterial color="#536249" roughness={1} />
      </mesh>
      <mesh position={[0.9, 4.1, 0.2]} castShadow>
        <icosahedronGeometry args={[1.55, 1]} />
        <meshStandardMaterial color="#647054" roughness={1} />
      </mesh>
    </group>
  );
}

function Palm({ x, z, scale = 1 }: { x: number; z: number; scale?: number }): ReactNode {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 2.7, 0]} rotation={[0, 0, -0.06]} castShadow>
        <cylinderGeometry args={[0.13, 0.28, 5.4, 9]} />
        <meshStandardMaterial color="#76523a" roughness={1} />
      </mesh>
      <group position={[0, 5.25, 0]}>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.sin(a) * 1.15, 0.05, Math.cos(a) * 1.15]} rotation={[0.12, a, Math.sin(a) * 0.22]} castShadow>
              <boxGeometry args={[0.36, 0.1, 2.8]} />
              <meshStandardMaterial color={i % 2 ? "#506f4b" : "#617e54"} roughness={1} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function ForumArchitecture({ b, color, selected, active }: { b: Building; color: string; selected: boolean; active: boolean }): ReactNode {
  const base = massingBase({ pilotis: b.pilotis, height: b.height }, 0.24);
  const usable = Math.max(8, b.height - base);
  const tiers = Math.round(clamp(Math.max(2, Math.ceil(usable / (b.floorHeight * 2.4))), 2, 6));
  const tierH = usable / tiers;
  const segments = Math.round(clamp(Math.round((b.width / Math.max(2.5, b.rhythm)) * 3 + b.moduleDensity * 1.5), 12, 38));
  const ringDepth = clamp(Math.min(b.width, b.depth) * (0.18 + (100 - b.voids) * 0.001), 3.2, 8);
  const modules: ReactNode[] = [];
  for (let level = 0; level < tiers; level++) {
    const t = tiers === 1 ? 0.5 : level / (tiers - 1);
    let scale = 1;
    let x = 0;
    let z = 0;
    let turn = 0;
    if (b.profile === "tapered") scale = 1 - t * b.taper * 0.0075;
    if (b.profile === "top-heavy") scale = 0.68 + t * (0.32 + b.taper * 0.004);
    if (b.profile === "stepped") {
      scale = 1 - t * b.taper * 0.0045;
      z = -t * (b.cantilever + b.depth * 0.06);
    }
    if (b.profile === "offset") x = (t - 0.5) * (b.cantilever * 2 + b.voids * 0.08);
    if (b.profile === "twisted") turn = (t - 0.5) * 0.18;
    const radius = Math.max(5, (Math.min(b.width, b.depth) * 0.5 - ringDepth * 0.45) * scale);
    const arc = Math.max(1.7, ((Math.PI * 2 * radius) / segments) * 0.82);
    const skipEvery = Math.max(3, Math.round(12 - b.voids * 0.1));
    for (let i = 0; i < segments; i++) {
      if (b.voids > 18 && (i + level * 2) % skipEvery === 0) continue;
      const a = (i / segments) * Math.PI * 2 + turn;
      const c = specialLightColor(i + level * 11);
      const lit = active && (i + level) % 3 !== 0;
      modules.push(
        <group key={`${level}-${i}`} position={[x + Math.sin(a) * radius, base + tierH * (level + 0.5), z + Math.cos(a) * radius]} rotation={[0, a, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[arc, tierH * 0.9, ringDepth]} />
            <meshStandardMaterial
              color={active && level % 2 ? new THREE.Color(color).lerp(new THREE.Color(c), 0.22).getStyle() : color}
              emissive={lit ? c : "#000000"}
              emissiveIntensity={lit ? 0.32 : 0}
              roughness={0.94}
            />
          </mesh>
          {lit && (
            <mesh position={[0, tierH * 0.18, ringDepth * 0.52]}>
              <boxGeometry args={[Math.max(0.65, arc * 0.5), Math.max(0.09, tierH * 0.045), 0.08]} />
              <meshBasicMaterial color={c} transparent opacity={0.86} toneMapped={false} />
            </mesh>
          )}
        </group>,
      );
    }
    modules.push(
      <group key={`slab-${level}`} position={[x, base + tierH * level + 0.18, z]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry args={[radius, ringDepth * 0.48, 6, Math.max(24, segments * 2)]} />
          <meshStandardMaterial color={TONES[b.tone].color} roughness={0.96} />
        </mesh>
        {active && (
          <mesh position={[0, 0, 0.12]}>
            <torusGeometry args={[radius, Math.max(0.045, ringDepth * 0.035), 5, Math.max(24, segments * 2)]} />
            <meshBasicMaterial color={specialLightColor(level)} transparent opacity={0.38} toneMapped={false} />
          </mesh>
        )}
      </group>,
    );
  }
  const topRadius = Math.max(4, Math.min(b.width, b.depth) * 0.34 * (b.profile === "tapered" ? 1 - b.taper * 0.004 : 1));
  const supportCount = Math.max(8, Math.min(18, segments));
  return (
    <group>
      {base > 0.1 &&
        Array.from({ length: supportCount }, (_, i) => {
          const a = (i / supportCount) * Math.PI * 2;
          const r = Math.min(b.width, b.depth) * 0.34;
          return (
            <mesh key={`support-${i}`} position={[Math.sin(a) * r, base / 2, Math.cos(a) * r]} castShadow>
              <cylinderGeometry args={[0.3, 0.42, base, 10]} />
              <meshStandardMaterial color={TONES[b.tone].color} roughness={0.96} />
            </mesh>
          );
        })}
      {modules}
      {active && (
        <pointLight
          position={[0, base + usable * 0.45, 0]}
          color={MONUMENT_SCENE.lamp}
          intensity={54}
          distance={Math.max(34, b.width * 1.6)}
          decay={1.7}
        />
      )}
      <mesh position={[0, b.height + 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[topRadius, Math.max(0.45, ringDepth * 0.28), 10, 48]} />
        <meshStandardMaterial color={b.vegetation > 35 ? "#697b59" : color} roughness={0.96} />
      </mesh>
      {b.vegetation > 45 && (
        <group position={[0, b.height + 0.45, 0]}>
          {[0, 1, 2, 3].map((i) => {
            const a = (i * Math.PI) / 2 + 0.45;
            return <Tree key={i} x={Math.sin(a) * topRadius * 0.72} z={Math.cos(a) * topRadius * 0.72} scale={0.18} />;
          })}
        </group>
      )}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={`step-${i}`} position={[0, 0.4 + i * 0.36, b.depth * 0.42 + i * 0.6]} castShadow>
          <boxGeometry args={[9 - i * 0.45, 0.36, 2.2]} />
          <meshStandardMaterial color={TONES[b.tone].color} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.5, b.depth * 0.34]}>
        <boxGeometry args={[4.5, 3.8, 0.18]} />
        <meshStandardMaterial color="#b77b3f" emissive="#6d371a" emissiveIntensity={0.1} />
      </mesh>
      {selected && (
        <mesh position={[0, base + usable / 2, 0]}>
          <cylinderGeometry args={[b.width * 0.52, b.width * 0.52, usable, 48, 1, true]} />
          <meshBasicMaterial color="#d7ff43" wireframe transparent opacity={0.2} />
        </mesh>
      )}
    </group>
  );
}

function CapsuleDetails({ b, bodies, active }: { b: Building; bodies: MassingBody[]; active: boolean }): ReactNode {
  const pods = bodies.filter((body) => body.kind === "capsule");
  if (pods.length === 0) return null;
  const cores = bodies.filter((body) => body.role === "core");
  const branchArms = bodies.filter((body) => body.role === "transfer" && body.branch === true);
  const dark = "#13232b";
  const balconyEvery = b.balconies > 72 ? 1 : b.balconies > 38 ? 2 : b.balconies > 12 ? 3 : 999;
  const bandCount = Math.min(5, Math.max(1, b.terraces + 1));
  return (
    <>
      {pods.map((body, i) => (
        <group key={`pod-detail-${i}`} rotation={[0, body.ry ?? 0, 0]}>
          {[-1, 1].map((face) => {
            const c = specialLightColor(i + face * 3);
            const lit = active && (i + face) % 4 !== 0;
            return (
              <group key={face}>
                <mesh
                  position={[body.x + face * body.w * 0.505, body.y, body.z]}
                  rotation={[0, (face * Math.PI) / 2, 0]}
                  scale={[body.d * 0.34, body.h * 0.34, 1]}
                >
                  <circleGeometry args={[1, 20]} />
                  <meshPhysicalMaterial
                    color={lit ? new THREE.Color(c).multiplyScalar(0.54).getStyle() : dark}
                    emissive={lit ? c : "#000000"}
                    emissiveIntensity={lit ? 0.58 : 0}
                    metalness={0.26}
                    roughness={lit ? 0.1 : 0.22}
                  />
                </mesh>
                {(body.branch === true || body.crown === true) && (
                  <mesh
                    position={[body.x + face * body.w * 0.512, body.y, body.z]}
                    rotation={[0, (face * Math.PI) / 2, 0]}
                    scale={[body.d * 0.41, body.h * 0.41, 1]}
                  >
                    <torusGeometry args={[1, 0.08, 7, 20]} />
                    <meshStandardMaterial
                      color={lit ? new THREE.Color(TONES[b.tone].color).lerp(new THREE.Color(c), 0.28).getStyle() : TONES[b.tone].color}
                      emissive={lit ? c : "#000000"}
                      emissiveIntensity={lit ? 0.2 : 0}
                      roughness={0.88}
                    />
                  </mesh>
                )}
              </group>
            );
          })}
          <mesh position={[body.x, body.y - body.h * 0.47, body.z + body.d * 0.54]}>
            <boxGeometry args={[body.w * 0.56, Math.max(0.06, body.h * 0.055), 0.08]} />
            <meshBasicMaterial color={specialLightColor(i + 17)} transparent opacity={active ? 0.5 : 0.1} toneMapped={false} />
          </mesh>
          {i % balconyEvery === 0 && (
            <mesh position={[body.x, body.y - body.h * 0.57, body.z]}>
              <boxGeometry args={[body.w * 0.46, 0.12, body.d * 1.14]} />
              <meshStandardMaterial color={TONES[b.tone].color} roughness={0.92} />
            </mesh>
          )}
        </group>
      ))}
      {cores.map((core, i) => (
        <group key={`service-spine-${i}`} rotation={[0, core.ry ?? 0, 0]}>
          {Array.from({ length: 3 }, (_, pipe) => {
            const offset = (pipe - 1) * core.w * 0.24;
            const c = specialLightColor(i * 7 + pipe);
            return (
              <mesh key={pipe} position={[core.x + offset, core.y, core.z + core.d * 0.52]}>
                <boxGeometry args={[0.14, core.h * 0.9, 0.13]} />
                <meshStandardMaterial color={c} emissive={active ? c : "#000000"} emissiveIntensity={active ? 0.22 : 0} roughness={0.44} metalness={0.52} />
              </mesh>
            );
          })}
          {Array.from({ length: bandCount }, (_, band) => (
            <mesh key={`service-band-${band}`} position={[core.x, (core.h * (band + 1)) / (bandCount + 1), core.z]}>
              <boxGeometry args={[core.w * 1.28, 0.2, core.d * 1.3]} />
              <meshStandardMaterial color="#59605c" roughness={0.84} metalness={0.16} />
            </mesh>
          ))}
        </group>
      ))}
      {branchArms.map((arm, i) => {
        const direction = Math.sign(arm.z) || 1;
        const end = bodyWorldPoint(arm, [arm.x, arm.y + arm.h * 0.55, arm.z + direction * arm.d * 0.5]);
        const startY = Math.min(b.height * 0.92, Math.max(end.y + 5, b.height * (0.58 + i * 0.025)));
        const c = specialLightColor(i + 31);
        return (
          <group key={`branch-rig-${i}`}>
            <BeamBetween from={[0, startY, 0]} to={[end.x, end.y, end.z]} width={0.052} color="#444b49" />
            <mesh position={[end.x, end.y, end.z]} raycast={() => null}>
              <octahedronGeometry args={[0.34, 0]} />
              <meshStandardMaterial color={c} emissive={c} emissiveIntensity={active ? 1.5 : 0.15} metalness={0.5} />
            </mesh>
            {b.vegetation > 55 && (
              <group position={[end.x, arm.y + arm.h * 0.8, end.z - direction * arm.d * 0.28]}>
                <mesh>
                  <boxGeometry args={[Math.max(2.2, arm.w * 2.2), 0.24, Math.max(2.6, arm.d * 0.36)]} />
                  <meshStandardMaterial color="#4f744f" roughness={1} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </>
  );
}

function Pilotis({ b }: { b: Building }): ReactNode {
  const base = massingBase({ pilotis: b.pilotis, height: b.height });
  if (base <= 0.2 || b.composition === "bridge" || b.composition === "ring" || b.composition === "capsule" || b.composition === "megastructure")
    return null;
  const colsX = Math.max(2, Math.min(5, Math.round(b.width / b.baySpacing)));
  const xs = Array.from({ length: colsX }, (_, i) => -b.width * 0.42 + i * ((b.width * 0.84) / (colsX - 1)));
  return (
    <group>
      {xs.flatMap((x, i) =>
        [-1, 1].map((side) => (
          <mesh key={`${i}-${side}`} position={[x, base / 2, side * b.depth * 0.35]} castShadow>
            <cylinderGeometry args={[0.33, 0.43, base, b.structural === "frame" ? 12 : 4]} />
            <meshStandardMaterial color={TONES[b.tone].color} roughness={0.96} />
          </mesh>
        )),
      )}
      <mesh position={[0, base * 0.42, 0]}>
        <boxGeometry args={[b.width * 0.52, base * 0.7, b.depth * 0.58]} />
        <meshPhysicalMaterial color="#28404b" roughness={0.15} metalness={0.1} transmission={0.1} />
      </mesh>
    </group>
  );
}

function SelectionRing({ b }: { b: Building }): ReactNode {
  const halfW = b.width / 2 + 2.5;
  const halfD = b.depth / 2 + 2.5;
  const t = 0.5;
  return (
    <group position={[0, 0.5, 0]}>
      <mesh position={[0, 0, halfD]}>
        <boxGeometry args={[halfW * 2, 0.16, t]} />
        <meshBasicMaterial color="#d7ff43" transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, 0, -halfD]}>
        <boxGeometry args={[halfW * 2, 0.16, t]} />
        <meshBasicMaterial color="#d7ff43" transparent opacity={0.72} />
      </mesh>
      <mesh position={[halfW, 0, 0]}>
        <boxGeometry args={[t, 0.16, halfD * 2]} />
        <meshBasicMaterial color="#d7ff43" transparent opacity={0.72} />
      </mesh>
      <mesh position={[-halfW, 0, 0]}>
        <boxGeometry args={[t, 0.16, halfD * 2]} />
        <meshBasicMaterial color="#d7ff43" transparent opacity={0.72} />
      </mesh>
    </group>
  );
}

const BuildingContent = memo(function BuildingContent({
  b,
  selected,
  night,
  occupancy,
}: {
  b: Building;
  selected: boolean;
  night: boolean;
  occupancy: number;
}): ReactNode {
  const bodies = useMemo(() => buildingBodies(b), [b]);
  const color = useMemo(() => weatheredColor(b), [b]);
  const activeFacade: FacadeStrategy = isVillageMassing(b) ? "punched" : b.facade;
  const active = night && occupancy > 0.18;
  return (
    <group>
      <mesh position={[0, 0.22, 0]} receiveShadow>
        <boxGeometry args={[b.width + 5, 0.44, b.depth + 5]} />
        <meshStandardMaterial color="#77786f" roughness={1} />
      </mesh>
      {b.composition !== "ring" && <Pilotis b={b} />}
      {b.composition === "ring" ? (
        <ForumArchitecture b={b} color={color} selected={selected} active={active} />
      ) : (
        bodies.map((body, i) => (
          <group key={`${b.composition}-${body.kind ?? "box"}-${body.role ?? "mass"}-${i}`} rotation={[0, body.ry ?? 0, 0]}>
            <ConcreteBody body={body} color={color} selected={selected} />
            <ConstructionJoints body={body} tone={b.tone} />
            <FacadeLayer b={b} body={body} strategy={activeFacade} night={night} occupancy={occupancy} />
          </group>
        ))
      )}
      {b.composition === "capsule" && <CapsuleDetails b={b} bodies={bodies} active={active} />}
      {b.composition !== "ring" && (
        <>
          <mesh position={[0, 0.08, b.depth / 2 + 2.1]} castShadow>
            <boxGeometry args={[Math.min(9, b.width * 0.5), 0.16, 3.4]} />
            <meshStandardMaterial color="#aaa69a" roughness={1} />
          </mesh>
          <mesh position={[0, 1.85, b.depth / 2 + 0.13]}>
            <boxGeometry args={[Math.min(5.2, b.width * 0.3), 3.2, 0.22]} />
            <meshStandardMaterial color={ACCENT[b.program]} roughness={0.7} />
          </mesh>
          <mesh position={[0, 3.7, b.depth / 2 + 1.15]} castShadow>
            <boxGeometry args={[Math.min(7, b.width * 0.4), 0.24, 2.25]} />
            <meshStandardMaterial color={TONES[b.tone].color} roughness={0.95} />
          </mesh>
        </>
      )}
    </group>
  );
});

function BuildingNode({ id }: { id: string }): ReactNode {
  const b = useGameStore((ctx) => cityBuildings(ctx).find((entry) => entry.id === id) ?? null);
  const selected = useGameStore((ctx) => selectedId(ctx) === id);
  const clock = useGameClock();
  if (b === null) return null;
  const hour = clock.calendar.dayFraction * 24;
  const solar = solarModel(hour);
  const night = solar.night;
  const occupancy = night ? Math.round(programOccupancy(b, hour, NEUTRAL_SIGNALS) * 12) / 12 : 0;
  return (
    <group rotation={[0, (b.rotation * Math.PI) / 180, 0]}>
      <BuildingContent b={b} selected={selected} night={night} occupancy={occupancy} />
      {selected && <SelectionRing b={b} />}
      {selected && <MassingGizmo building={b} />}
    </group>
  );
}

function PlazaObject({ plaza, selected }: { plaza: Plaza; selected: boolean }): ReactNode {
  const trees = Array.from({ length: plaza.trees }, (_, i) => {
    const a = (i / plaza.trees) * Math.PI * 2;
    return plaza.kind === "water" && i % 2 === 0 ? (
      <Palm key={i} x={Math.cos(a) * 8.2} z={Math.sin(a) * 8.2} scale={0.76 + (i % 3) * 0.06} />
    ) : (
      <Tree key={i} x={Math.cos(a) * 8.2} z={Math.sin(a) * 8.2} scale={0.78 + (i % 3) * 0.08} />
    );
  });
  return (
    <group position={[0, 0.3, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[CELL - 5, 0.6, CELL - 5]} />
        <meshStandardMaterial color={selected ? "#cde83e" : plaza.kind === "garden" ? "#948e78" : "#b4a78f"} roughness={1} />
      </mesh>
      {plaza.kind === "water" && (
        <>
          <mesh position={[0, 0.37, 0]}>
            <boxGeometry args={[20, 0.22, 7.5]} />
            <meshStandardMaterial color="#5b6965" roughness={1} />
          </mesh>
          <mesh position={[0, 0.51, 0]}>
            <boxGeometry args={[18.8, 0.08, 6.4]} />
            <meshPhysicalMaterial color="#77a9b5" roughness={0.08} metalness={0.1} transmission={0.22} transparent opacity={0.9} />
          </mesh>
          {[-7, -3.5, 0, 3.5, 7].map((x, i) => (
            <mesh key={i} position={[x, 0.61, 0]}>
              <boxGeometry args={[1.5, 0.15, 1.5]} />
              <meshStandardMaterial color="#d3c5a6" />
            </mesh>
          ))}
          <mesh position={[0, 3.2, -6]} rotation={[0, 0, 0.16]} castShadow>
            <boxGeometry args={[0.8, 6, 1.3]} />
            <meshStandardMaterial color="#b45739" roughness={0.7} />
          </mesh>
        </>
      )}
      {plaza.kind === "garden" && (
        <>
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[19, 0.25, 17]} />
            <meshStandardMaterial color="#687a55" roughness={1} />
          </mesh>
          <mesh position={[0, 0.58, 0]} rotation={[0, 0.35, 0]}>
            <boxGeometry args={[22, 0.12, 2.2]} />
            <meshStandardMaterial color="#d0bf9d" roughness={1} />
          </mesh>
          <mesh position={[0, 0.58, 0]} rotation={[0, -0.75, 0]}>
            <boxGeometry args={[16, 0.12, 1.5]} />
            <meshStandardMaterial color="#d0bf9d" roughness={1} />
          </mesh>
        </>
      )}
      {plaza.kind === "forum" && (
        <>
          <mesh position={[0, 0.36, 0]}>
            <boxGeometry args={[22, 0.34, 18]} />
            <meshStandardMaterial color="#b4a78f" roughness={1} />
          </mesh>
          <mesh position={[0, 0.62, 0]}>
            <boxGeometry args={[17, 0.34, 13]} />
            <meshStandardMaterial color="#9b8f79" roughness={1} />
          </mesh>
          <mesh position={[0, 0.88, 0]}>
            <boxGeometry args={[11, 0.34, 8]} />
            <meshStandardMaterial color="#b4a78f" roughness={1} />
          </mesh>
          <mesh position={[0, 1.45, -1.4]}>
            <boxGeometry args={[5.8, 1.8, 3.2]} />
            <meshStandardMaterial color="#a56147" roughness={0.8} />
          </mesh>
        </>
      )}
      {trees}
    </group>
  );
}

function PlazaNode({ id }: { id: string }): ReactNode {
  const plaza = useGameStore((ctx) => cityPlazas(ctx).find((entry) => entry.id === id) ?? null);
  const selected = useGameStore((ctx) => selectedId(ctx) === id);
  if (plaza === null) return null;
  return <PlazaObject plaza={plaza} selected={selected} />;
}

export function renderCityObject(object: SceneObject): ReactNode {
  if (object.catalogId === "building") return <BuildingNode id={object.instanceId} />;
  if (object.catalogId === "plaza") return <PlazaNode id={object.instanceId} />;
  return null;
}
