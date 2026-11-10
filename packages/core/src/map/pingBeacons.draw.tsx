/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, type ReactNode } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import {
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";
import {
  markerKindStyle,
  type MarkerCollection,
  type MarkerKindStyle,
  type MarkerView,
} from "@jgengine/core/map/markers";
import { useMarkers } from "@jgengine/core/map/map.view";

import { pingBobOffset, pingOpacity } from "./pingPulse";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import type { CSSProperties } from "@jgengine/core/ui/jsx";

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
}

/** Ring + bobbing arrowhead as one draw: per-frame bob and lifetime fade without React. */
function pingDraw(marker: MarkerView, style: MarkerKindStyle, height: number): EngineDraw {
  const [x, , z] = marker.position;
  const baseY = marker.position[1];
  const group = new Group();
  const ringGeometry = new RingGeometry(0.55, 0.85, 28);
  const coneGeometry = new ConeGeometry(0.34, 0.62, 4);
  const ringMaterial = new MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false, toneMapped: false });
  const arrowMaterial = new MeshBasicMaterial({ color: style.color, transparent: true, depthWrite: false, toneMapped: false });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, baseY + 0.06, z);
  ring.renderOrder = 997;
  const arrow = new Group();
  arrow.position.set(x, baseY + height, z);
  const cone = new Mesh(coneGeometry, arrowMaterial);
  cone.rotation.set(Math.PI, Math.PI / 4, 0);
  cone.renderOrder = 998;
  arrow.add(cone);
  group.add(ring, arrow);
  let born: number | null = null;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame(state: EngineFrameState) {
      const now = performance.now();
      born ??= now;
      const expiresAt = (marker as { expiresAt?: number }).expiresAt;
      const remainingMs = expiresAt !== undefined ? expiresAt - Date.now() : undefined;
      const opacity = pingOpacity({ bornMs: born, nowMs: now, remainingMs });
      arrow.position.y = baseY + height + pingBobOffset(state.clock.elapsedTime);
      arrowMaterial.opacity = opacity;
      ringMaterial.opacity = opacity * 0.7;
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      ringGeometry.dispose();
      coneGeometry.dispose();
      ringMaterial.dispose();
      arrowMaterial.dispose();
    },
  };
}

function calloutStyle(style: MarkerKindStyle): CSSProperties {
  return {
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
  };
}

function calloutContent(marker: MarkerView, style: MarkerKindStyle, renderCallout?: ((marker: MarkerView, style: MarkerKindStyle) => ReactNode) | undefined): ReactNode {
  if (renderCallout !== undefined) return renderCallout(marker, style);
  const text = pingText(marker);
  return (
    <div data-world-ping-callout={marker.id} style={calloutStyle(style)}>
      <span style={{ color: style.color }}>{style.glyph}</span>
      {text}
    </div>
  );
}

/** Engine-loop callout layer: projects each ping's anchor to the screen every frame. */
function EnginePingCallouts({ pings, showCallout, renderCallout }: {
  pings: readonly { marker: MarkerView; style: MarkerKindStyle; height: number }[];
  showCallout: boolean;
  renderCallout?: ((marker: MarkerView, style: MarkerKindStyle) => ReactNode) | undefined;
}): ReactNode {
  const host = useEngineHost();
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const scratch = useRef(new THREE.Vector3());
  const ndc = useRef(new THREE.Vector3());
  const visible = showCallout && pings.some((ping) => pingText(ping.marker) !== undefined || renderCallout !== undefined);
  useFrameTask((state) => {
    if (!visible) return;
    const camera = host.frame.camera;
    const size = host.frame.size;
    camera.updateMatrixWorld();
    const fovTan = camera instanceof THREE.PerspectiveCamera ? Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : 0.5;
    for (const { marker, height: pingHeight } of pings) {
      const el = nodes.current.get(marker.id);
      if (el === undefined) continue;
      const [x, baseY, z] = marker.position;
      const anchorY = baseY + pingHeight + pingBobOffset(state.clock.elapsedTime) + 0.85;
      const world = scratch.current.set(x, anchorY, z);
      const distance = camera.position.distanceTo(world);
      const scale = fovTan > 0 ? 11 / (2 * fovTan * Math.max(distance, 0.001)) : 1;
      const behind = ndc.current.copy(world).project(camera);
      const offscreen = behind.z < -1 || behind.z > 1;
      el.style.display = offscreen ? "none" : "";
      if (offscreen) continue;
      const sx = (behind.x * 0.5 + 0.5) * size.width;
      const sy = (-behind.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${scale})`;
    }
  });
  if (!visible) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 28, pointerEvents: "none", overflow: "hidden" }}>
      {pings.map(({ marker, style }) => (
        pingText(marker) === undefined && renderCallout === undefined ? null : (
          <div
            key={marker.id}
            ref={(el) => { if (el === null) nodes.current.delete(marker.id); else nodes.current.set(marker.id, el); }}
            style={{ position: "absolute", top: 0, left: 0, transformOrigin: "center" }}
          >
            {calloutContent(marker, style, renderCallout)}
          </div>
        )
      ))}
    </div>
  );
}

function WorldPing({ marker, style, height }: WorldPingProps): ReactNode {
  return <EngineDrawMount create={() => pingDraw(marker, style, height)} deps={[marker.id, style.color, height]} />;
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
  const styled = pings.map((marker) => ({ marker, style: markerKindStyle(marker.kind, kindStyles), height }));
  return (
    <>
      {styled.map(({ marker, style }) => (
        <WorldPing key={marker.id} marker={marker} style={style} height={height} />
      ))}
      <EnginePingCallouts pings={styled} showCallout={showCallout} renderCallout={renderCallout} />
    </>
  );
}
