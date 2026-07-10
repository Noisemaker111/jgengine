import { useMemo } from "react";
import * as THREE from "three";

import { EnvironmentScene } from "@jgengine/shell/environment";

import { world } from "../../world";
import {
  applyLateral,
  buildLap,
  lapLength,
  sampleAtDistance,
  zoneRange,
  LANE_HALF_WIDTH,
  MAIN_LANES,
  type TrackSample,
} from "../track/geometry";
import { GRID_VIOLET, LOOP_TEAL, TAPE_MAGENTA, VOID_COLOR } from "../track/palette";

const RIBBON_STEP = 1.4;

function sampleRange(segments: ReturnType<typeof buildLap>, start: number, end: number, step: number): TrackSample[] {
  const samples: TrackSample[] = [];
  for (let d = start; d <= end; d += step) {
    samples.push(applyLateral(sampleAtDistance(segments, d), 0));
  }
  samples.push(applyLateral(sampleAtDistance(segments, end), 0));
  return samples;
}

function buildRibbonGeometry(samples: readonly TrackSample[], width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  samples.forEach((sample, index) => {
    const nx = Math.cos(sample.headingRad);
    const nz = -Math.sin(sample.headingRad);
    const half = width / 2;
    positions.push(sample.x - nx * half, sample.y + 0.02, sample.z - nz * half);
    positions.push(sample.x + nx * half, sample.y + 0.02, sample.z + nz * half);
    uvs.push(0, index);
    uvs.push(1, index);
    if (index > 0) {
      const a = (index - 1) * 2;
      const b = a + 1;
      const c = index * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function TrackRibbon({ samples, color, emissive }: { samples: readonly TrackSample[]; color: string; emissive: number }) {
  const geometry = useMemo(() => buildRibbonGeometry(samples, LANE_HALF_WIDTH * 2), [samples]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

function GridFloor() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        base: { value: new THREE.Color(VOID_COLOR) },
        line: { value: new THREE.Color(GRID_VIOLET) },
        cell: { value: 4 },
      },
      vertexShader: `
        varying vec2 vXz;
        void main() {
          vXz = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 base;
        uniform vec3 line;
        uniform float cell;
        varying vec2 vXz;
        void main() {
          vec2 grid = abs(fract(vXz / cell - 0.5) - 0.5) / fwidth(vXz / cell);
          float lineDist = min(grid.x, grid.y);
          float mask = 1.0 - clamp(lineDist, 0.0, 1.0);
          vec3 color = mix(base, line, mask * 0.85);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
      <planeGeometry args={[220, 220]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export function TrackEnvironment() {
  const mainSegments = useMemo(() => buildLap(MAIN_LANES), []);
  const mainTotal = useMemo(() => lapLength(mainSegments), [mainSegments]);
  const mainSamples = useMemo(() => sampleRange(mainSegments, 0, mainTotal, RIBBON_STEP), [mainSegments, mainTotal]);

  const forkABranchSegments = useMemo(() => buildLap({ forkA: "branch", forkB: "main" }), []);
  const forkAZone = useMemo(() => zoneRange(forkABranchSegments, "forkA")!, [forkABranchSegments]);
  const forkASamples = useMemo(
    () => sampleRange(forkABranchSegments, forkAZone.start, forkAZone.end, RIBBON_STEP),
    [forkABranchSegments, forkAZone],
  );

  const forkBBranchSegments = useMemo(() => buildLap({ forkA: "main", forkB: "branch" }), []);
  const forkBZone = useMemo(() => zoneRange(forkBBranchSegments, "forkB")!, [forkBBranchSegments]);
  const forkBSamples = useMemo(
    () => sampleRange(forkBBranchSegments, forkBZone.start, forkBZone.end, RIBBON_STEP),
    [forkBBranchSegments, forkBZone],
  );

  return (
    <>
      <EnvironmentScene feature={world} />
      <GridFloor />
      <TrackRibbon samples={mainSamples} color={TAPE_MAGENTA} emissive={0.55} />
      <TrackRibbon samples={forkASamples} color={LOOP_TEAL} emissive={0.5} />
      <TrackRibbon samples={forkBSamples} color={LOOP_TEAL} emissive={0.5} />
    </>
  );
}
