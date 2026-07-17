import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  extractContours,
  sampleElevation,
  summarizeElevation,
  surfaceGridLines,
  surfaceRing,
  chooseContourInterval,
  type GuideRegion,
} from "@jgengine/core/world/terrainGuides";

import type { TerrainReadoutStore } from "./terrainReadoutStore";

/** How often (seconds) the cursor readout re-samples — a bounded per-frame cost, not every frame. */
const CURSOR_SAMPLE_INTERVAL = 1 / 20;
/** Cap on marching-squares samples per axis — the overlay's explicit performance budget. */
const READOUT_MAX_SAMPLES = 200;
/** Small lift keeping guide lines off the surface so they never z-fight the terrain mesh. */
const DEPTH_BIAS = 0.08;

const MAJOR_CONTOUR_COLOR = "#f2c14e";
const MINOR_CONTOUR_COLOR = "#8aa0b8";
const MAJOR_GRID_COLOR = "#5b6b7d";
const MINOR_GRID_COLOR = "#39434f";
const CURSOR_RING_COLOR = "#ffd479";

/** Expands a flat `[x,y,z,...]` polyline into consecutive `LineSegments` vertex pairs. */
function polylineToSegments(points: readonly number[], into: number[]): void {
  const vertexCount = Math.floor(points.length / 3);
  for (let i = 0; i < vertexCount - 1; i += 1) {
    const a = i * 3;
    const b = (i + 1) * 3;
    into.push(points[a]!, points[a + 1]!, points[a + 2]!);
    into.push(points[b]!, points[b + 1]!, points[b + 2]!);
  }
}

function lineSegments(positions: number[], color: string, opacity: number): THREE.LineSegments | null {
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: true });
  return new THREE.LineSegments(geometry, material);
}

/**
 * Surface-following terrain-readability overlay: draws iso-elevation contour lines and an optional
 * terrain-draped reference grid from the live ground field, and tracks the cursor's elevation. All
 * geometry comes from headless `@jgengine/core/world/terrainGuides` math; this component only turns it
 * into three.js lines and publishes the measured feedback to the readout store.
 */
export function TerrainReadout({
  groundHeightAt,
  region,
  showContours,
  showSurfaceGrid,
  version,
  readout,
}: {
  groundHeightAt: (x: number, z: number) => number;
  region: GuideRegion;
  showContours: boolean;
  showSurfaceGrid: boolean;
  /** Bumped by the host when the terrain changes, so the overlay rebuilds off the fresh field. */
  version: number;
  readout: TerrainReadoutStore;
}) {
  const regionKey = `${region.minX},${region.minZ},${region.maxX},${region.maxZ}`;

  const guides = useMemo(() => {
    const summary = summarizeElevation(groundHeightAt, region, 96, READOUT_MAX_SAMPLES);
    const interval = chooseContourInterval(summary.range);
    const objects: THREE.Object3D[] = [];

    if (showContours && interval > 0) {
      const contours = extractContours(groundHeightAt, {
        region,
        interval,
        resolution: 128,
        maxSamples: READOUT_MAX_SAMPLES,
      });
      const major: number[] = [];
      const minor: number[] = [];
      for (const line of contours) {
        const target = line.major ? major : minor;
        for (let i = 0; i < line.segments.length; i += 2) {
          target.push(line.segments[i]!, line.level + DEPTH_BIAS, line.segments[i + 1]!);
        }
      }
      const majorObj = lineSegments(major, MAJOR_CONTOUR_COLOR, 0.9);
      const minorObj = lineSegments(minor, MINOR_CONTOUR_COLOR, 0.5);
      if (majorObj !== null) objects.push(majorObj);
      if (minorObj !== null) objects.push(minorObj);
    }

    if (showSurfaceGrid) {
      const spacing = interval > 0 ? Math.max(region.maxX - region.minX, region.maxZ - region.minZ) / 16 : 8;
      const lines = surfaceGridLines(groundHeightAt, {
        region,
        spacing,
        drape: { spacing: Math.max(1, spacing / 8), offset: DEPTH_BIAS },
      });
      const major: number[] = [];
      const minor: number[] = [];
      for (const line of lines) polylineToSegments(line.points, line.major ? major : minor);
      const majorObj = lineSegments(major, MAJOR_GRID_COLOR, 0.7);
      const minorObj = lineSegments(minor, MINOR_GRID_COLOR, 0.4);
      if (majorObj !== null) objects.push(majorObj);
      if (minorObj !== null) objects.push(minorObj);
    }

    return { summary, interval, objects };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundHeightAt, regionKey, showContours, showSurfaceGrid, version]);

  useEffect(() => {
    readout.setSummary(guides.summary, guides.interval);
  }, [guides, readout]);

  useEffect(
    () => () => {
      for (const object of guides.objects) {
        if (object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      }
    },
    [guides],
  );

  // Cursor ring — a surface-following placement guide draped under the pointer.
  const ring = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(48 * 2 * 3), 3));
    const material = new THREE.LineBasicMaterial({ color: CURSOR_RING_COLOR, transparent: true, opacity: 0.85 });
    const segments = new THREE.LineSegments(geometry, material);
    segments.visible = false;
    return segments;
  }, []);
  useEffect(
    () => () => {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    },
    [ring],
  );

  const { camera, pointer, raycaster } = useThree();
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const hitRef = useRef(new THREE.Vector3());
  const accum = useRef(0);
  useEffect(() => {
    planeRef.current.constant = -(guides.summary.mean ?? 0);
  }, [guides.summary]);

  useFrame((_, delta) => {
    accum.current += delta;
    if (accum.current < CURSOR_SAMPLE_INTERVAL) return;
    accum.current = 0;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.ray.intersectPlane(planeRef.current, hitRef.current);
    if (
      hit === null ||
      hit.x < region.minX ||
      hit.x > region.maxX ||
      hit.z < region.minZ ||
      hit.z > region.maxZ
    ) {
      readout.setCursor(null);
      if (ring.visible) ring.visible = false;
      return;
    }
    const elevation = sampleElevation(groundHeightAt, hit.x, hit.z);
    readout.setCursor(elevation);
    const radius = Math.max(1.5, (region.maxX - region.minX) / 48);
    const ringPoints = surfaceRing(groundHeightAt, [hit.x, hit.z], radius, 48, { offset: DEPTH_BIAS });
    const attribute = ring.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    let w = 0;
    const vertexCount = Math.floor(ringPoints.length / 3);
    for (let i = 0; i < vertexCount - 1 && w + 6 <= array.length; i += 1) {
      const a = i * 3;
      const b = (i + 1) * 3;
      array[w++] = ringPoints[a]!;
      array[w++] = ringPoints[a + 1]!;
      array[w++] = ringPoints[a + 2]!;
      array[w++] = ringPoints[b]!;
      array[w++] = ringPoints[b + 1]!;
      array[w++] = ringPoints[b + 2]!;
    }
    while (w < array.length) array[w++] = 0;
    attribute.needsUpdate = true;
    ring.geometry.setDrawRange(0, Math.max(0, (vertexCount - 1) * 2));
    ring.visible = true;
  });

  return (
    <group>
      {guides.objects.map((object, index) => (
        <primitive key={index} object={object} />
      ))}
      <primitive object={ring} />
    </group>
  );
}
