import type { ReactNode } from "react";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { isDownbeatOpen } from "../rules/rhythm";
import { useRunnerSnapshot } from "../session/engineStore";
import {
  BEAT_GATED_DOOR,
  NARROW_BARRIER,
  SANCTUM_GATE,
  SWING_CENSER,
  TEMPLE_ARCHWAY,
  TEMPLE_BRAZIER,
  TEMPLE_MANDALA,
  TEMPLE_PILLAR,
  VOID_RIFT,
} from "../objects/catalog";

const VOID_VIOLET = "#241b3a";
const PULSE_GOLD = "#ffd166";
const TEMPLE_STONE = "#6d5f8d";
const EMBER_ROSE = "#ef476f";
const MOON_WHITE = "#f8f4ff";

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function lerpColor(from: string, to: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function Pillar(): ReactNode {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 5, 8]} />
        <meshStandardMaterial color={TEMPLE_STONE} roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <torusGeometry args={[0.46, 0.06, 8, 16]} />
        <meshStandardMaterial color={PULSE_GOLD} emissive={PULSE_GOLD} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Brazier(): ReactNode {
  const snapshot = useRunnerSnapshot();
  const phase = snapshot?.beat.phase ?? 0;
  const flare = Math.max(0, 1 - phase / 0.35);
  const intensity = snapshot?.resonance === true ? 1.4 : 0.4 + flare * 1.6;
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.22, 0.7, 8]} />
        <meshStandardMaterial color={TEMPLE_STONE} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial
          color={EMBER_ROSE}
          emissive={snapshot?.resonance === true ? PULSE_GOLD : EMBER_ROSE}
          emissiveIntensity={intensity}
        />
      </mesh>
    </group>
  );
}

function Mandala(): ReactNode {
  const snapshot = useRunnerSnapshot();
  const rotationY = (snapshot?.beat.beat ?? 0) * 0.35;
  const color = snapshot?.resonance === true ? PULSE_GOLD : MOON_WHITE;
  return (
    <group rotation-y={rotationY}>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[2.2, 0.08, 8, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} rotation-z={Math.PI / 6}>
        <torusGeometry args={[1.5, 0.06, 8, 24]} />
        <meshStandardMaterial color={PULSE_GOLD} emissive={PULSE_GOLD} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Archway({ grand = false }: { grand?: boolean }): ReactNode {
  const height = grand ? 8 : 6.5;
  const width = grand ? 12 : 10;
  const color = grand ? MOON_WHITE : TEMPLE_STONE;
  return (
    <group>
      <mesh position={[-width / 2, 0, 0]}>
        <boxGeometry args={[0.8, height, 0.8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[width / 2, 0, 0]}>
        <boxGeometry args={[0.8, height, 0.8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width + 0.8, 0.8, 0.8]} />
        <meshStandardMaterial color={PULSE_GOLD} emissive={PULSE_GOLD} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function VoidRift(): ReactNode {
  const snapshot = useRunnerSnapshot();
  const resonating = snapshot?.resonance === true;
  return (
    <mesh position={[0, -0.4, 0]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.4, 1.3, 24]} />
      <meshStandardMaterial
        color={resonating ? PULSE_GOLD : VOID_VIOLET}
        emissive={resonating ? PULSE_GOLD : EMBER_ROSE}
        emissiveIntensity={resonating ? 0.9 : 0.5}
        transparent
        opacity={resonating ? 0.35 : 0.9}
      />
    </mesh>
  );
}

function SwingCenser(): ReactNode {
  const snapshot = useRunnerSnapshot();
  const swing = Math.sin((snapshot?.beat.beat ?? 0) * Math.PI) * 0.35;
  return (
    <group rotation-z={swing}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.2, 6]} />
        <meshStandardMaterial color={TEMPLE_STONE} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.32, 12, 12]} />
        <meshStandardMaterial color={EMBER_ROSE} emissive={EMBER_ROSE} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function BeatGatedDoor(): ReactNode {
  const snapshot = useRunnerSnapshot();
  const beatsPerBar = snapshot?.movement.beatsPerBar ?? 4;
  const open = snapshot !== undefined && isDownbeatOpen(snapshot.beat.beat, beatsPerBar);
  const resonating = snapshot?.resonance === true;
  const slide = open || resonating ? 2.6 : 0;
  const color = resonating ? PULSE_GOLD : open ? MOON_WHITE : EMBER_ROSE;
  return (
    <group>
      <mesh position={[-1.4 - slide, 0, 0]}>
        <boxGeometry args={[2.6, 6.4, 0.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[1.4 + slide, 0, 0]}>
        <boxGeometry args={[2.6, 6.4, 0.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function NarrowBarrier(): ReactNode {
  return (
    <mesh position={[0, 0.9, 0]}>
      <boxGeometry args={[0.6, 1.8, 0.6]} />
      <meshStandardMaterial color={EMBER_ROSE} emissive={EMBER_ROSE} emissiveIntensity={0.25} />
    </mesh>
  );
}

export function renderPulseRunnerObject(object: SceneObject): ReactNode {
  switch (object.catalogId) {
    case TEMPLE_PILLAR:
      return <Pillar />;
    case TEMPLE_BRAZIER:
      return <Brazier />;
    case TEMPLE_MANDALA:
      return <Mandala />;
    case TEMPLE_ARCHWAY:
      return <Archway />;
    case SANCTUM_GATE:
      return <Archway grand />;
    case VOID_RIFT:
      return <VoidRift />;
    case SWING_CENSER:
      return <SwingCenser />;
    case BEAT_GATED_DOOR:
      return <BeatGatedDoor />;
    case NARROW_BARRIER:
      return <NarrowBarrier />;
    default:
      return null;
  }
}

function PilgrimShard(): ReactNode {
  const snapshot = useRunnerSnapshot();
  const pulse = snapshot?.pulse ?? 1;
  const resonating = snapshot?.resonance === true;
  const color = resonating ? MOON_WHITE : lerpColor(TEMPLE_STONE, PULSE_GOLD, pulse);
  const scale = 0.55 + pulse * 0.15;
  return (
    <mesh scale={[scale, scale, scale]} rotation-y={(snapshot?.beat.beat ?? 0) * 0.6}>
      <octahedronGeometry args={[0.6, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={resonating ? 1 : 0.5} />
    </mesh>
  );
}

export function renderPulseRunnerEntity(_entity: SceneEntity): ReactNode {
  return <PilgrimShard />;
}
