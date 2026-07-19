import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import * as THREE from "three";
import {
  markerKindStyle,
  type MarkerCollection,
  type MarkerKindStyle,
  type MarkerView,
} from "@jgengine/core/world/markers";
import { useMarkers } from "@jgengine/react/map";

import { pingBobOffset, pingOpacity } from "./pingPulse";

function pingText(marker: MarkerView): string | undefined {
  const meta = marker.meta as { callout?: string } | undefined;
  return meta?.callout ?? marker.label;
}

function isPingMarker(marker: MarkerView): boolean {
  return (marker.meta as { ping?: boolean } | undefined)?.ping === true;
}

interface WorldPingProps {
  marker: MarkerView;
  style: MarkerKindStyle;
  height: number;
  showCallout: boolean;
  renderCallout?: (marker: MarkerView, style: MarkerKindStyle) => ReactNode;
}

function WorldPing({ marker, style, height, showCallout, renderCallout }: WorldPingProps): ReactNode {
  const floatRef = useRef<THREE.Group>(null);
  const arrowMat = useRef<THREE.MeshBasicMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const bornRef = useRef<number | null>(null);
  const baseY = marker.position[1];
  const text = pingText(marker);

  useFrame((state) => {
    const now = performance.now();
    if (bornRef.current === null) bornRef.current = now;
    // `expiresAt` is a MarkerSet lifecycle field (MapMarker), absent on plain display views.
    const expiresAt = (marker as { expiresAt?: number }).expiresAt;
    const remainingMs = expiresAt !== undefined ? expiresAt - Date.now() : undefined;
    const opacity = pingOpacity({ bornMs: bornRef.current, nowMs: now, remainingMs });
    const bob = pingBobOffset(state.clock.elapsedTime);
    if (floatRef.current !== null) floatRef.current.position.y = baseY + height + bob;
    if (arrowMat.current !== null) arrowMat.current.opacity = opacity;
    if (ringMat.current !== null) ringMat.current.opacity = opacity * 0.7;
  });

  return (
    <group data-world-ping={marker.id}>
      {/* Ground ring at the pinged spot. */}
      <mesh position={[marker.position[0], baseY + 0.06, marker.position[2]]} rotation-x={-Math.PI / 2} renderOrder={997}>
        <ringGeometry args={[0.55, 0.85, 28]} />
        <meshBasicMaterial ref={ringMat} color={style.color} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Floating downward arrowhead pointing at the spot, plus an optional callout. */}
      <group ref={floatRef} position={[marker.position[0], baseY + height, marker.position[2]]}>
        <mesh rotation={[Math.PI, Math.PI / 4, 0]} renderOrder={998}>
          <coneGeometry args={[0.34, 0.62, 4]} />
          <meshBasicMaterial ref={arrowMat} color={style.color} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        {showCallout && text !== undefined ? (
          <Html center position={[0, 0.85, 0]} distanceFactor={11} zIndexRange={[28, 0]} style={{ pointerEvents: "none" }}>
            {renderCallout !== undefined ? (
              renderCallout(marker, style)
            ) : (
              <div
                data-world-ping-callout={marker.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  whiteSpace: "nowrap",
                  padding: "3px 9px",
                  borderRadius: 9999,
                  background: "rgba(8,11,16,0.82)",
                  border: `1px solid ${style.color}`,
                  color: "#f1f5f9",
                  fontFamily: "ui-sans-serif, system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                }}
              >
                <span style={{ color: style.color }}>{style.glyph}</span>
                {text}
              </div>
            )}
          </Html>
        ) : null}
      </group>
    </group>
  );
}

/** Props for {@link WorldPings}. */
export interface WorldPingsProps {
  /** Static views, an external marker source, or a native `MarkerSet` (e.g. the one a `createPingSystem` writes to). */
  markers: MarkerCollection;
  kindStyles?: Record<string, MarkerKindStyle>;
  /** Only render markers whose `meta.ping === true`. Default true; false renders every marker as a ping. */
  pingsOnly?: boolean;
  /** Height above the ground the arrowhead floats. Default 2.4. */
  height?: number;
  /** Draw a billboarded callout chip (glyph + `meta.callout`/`label`). Default true. */
  showCallout?: boolean;
  /** Full override for a ping's callout markup. */
  renderCallout?: (marker: MarkerView, style: MarkerKindStyle) => ReactNode;
}

/**
 * World-space pings — the in-scene side of a ping/marker: a bobbing downward
 * arrowhead pointing at the spot, a ground ring, and a billboarded callout,
 * colored by marker kind and fading in/out over the marker's lifetime. Reads a
 * `MarkerSet` (typically the one a `createPingSystem` writes to), a marker
 * source, or a static array; mount through `PlayableGame.WorldOverlay`.
 *
 * @capability world-pings in-scene ping markers — a bobbing downward arrowhead, ground ring, and billboarded callout per marker, colored by kind and fading over the marker's lifetime
 */
export function WorldPings({
  markers,
  kindStyles,
  pingsOnly = true,
  height = 2.4,
  showCallout = true,
  renderCallout,
}: WorldPingsProps): ReactNode {
  const list = useMarkers(markers);
  const pings = pingsOnly ? list.filter(isPingMarker) : list;
  return (
    <>
      {pings.map((marker) => (
        <WorldPing
          key={marker.id}
          marker={marker}
          style={markerKindStyle(marker.kind, kindStyles)}
          height={height}
          showCallout={showCallout}
          renderCallout={renderCallout}
        />
      ))}
    </>
  );
}
