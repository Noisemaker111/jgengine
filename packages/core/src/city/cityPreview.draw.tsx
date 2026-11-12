/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { runGenerator } from "@jgengine/core/generator/generator";
import type { EngineDraw } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { streetLayersDraw, type StreetPreviewLayer } from "@jgengine/core/roads/streetNetworkPreview.draw";
import { CITY_OUTPUT, type ResolvedCity } from "./cityKind";

function isResolvedCity(value: unknown): value is ResolvedCity {
  return typeof value === "object" && value !== null && "lots" in value && Array.isArray(value.lots) && "size" in value;
}

/** A district takes a few hundred milliseconds to grow, so a tile's frame and draw share one. */
const grown = new WeakMap<GeneratorPreviewProps["variant"], ResolvedCity | null>();

function variantCity({ definition, variant }: GeneratorPreviewProps): ResolvedCity | null {
  const known = grown.get(variant);
  if (known !== undefined) return known;
  const output = runGenerator(definition, variant.meta);
  const city = isResolvedCity(output) ? output : null;
  grown.set(variant, city);
  return city;
}

/** Every lot as one massing block (footprint × floors), in one instanced draw. */
function lotBlocks(city: ResolvedCity): THREE.InstancedMesh | null {
  if (city.lots.length === 0) return null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshStandardMaterial({ color: "#c9c2b4", roughness: 0.85 });
  const mesh = new THREE.InstancedMesh(geometry, material, city.lots.length);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  city.lots.forEach((lot, index) => {
    const height = Math.max(1, lot.floors * city.rules.floorHeight);
    matrix.compose(
      new THREE.Vector3(lot.center[0] - city.center[0], 0, lot.center[1] - city.center[2]),
      rotation.setFromAxisAngle(up, lot.rotationY),
      new THREE.Vector3(lot.size[0], height, lot.size[1]),
    );
    mesh.setMatrixAt(index, matrix);
  });
  mesh.castShadow = true;
  return mesh;
}

function cityPreviewDraw(props: GeneratorPreviewProps): EngineDraw {
  const city = variantCity(props);
  if (city === null) return streetLayersDraw([], 200, 200);
  const layers: StreetPreviewLayer[] = [
    {
      lines: city.streets.map((street) => ({ points: street.points.map(([x, z]) => [x - city.center[0], z - city.center[2]] as const), width: street.width })),
      color: "#3c4148",
      lift: 0.05,
    },
  ];
  if (city.race !== undefined && city.race.centerline.length > 1) {
    const lap = city.race.centerline.map(([x, z]) => [x - city.center[0], z - city.center[2]] as const);
    layers.push({ lines: [{ points: [...lap, lap[0]!], width: Math.max(2, (city.race.widths[0] ?? 8) * 0.6) }], color: "#d8402f", lift: 0.1 });
  }
  const blocks = lotBlocks(city);
  const draw = streetLayersDraw(layers, city.size[0] / 2, city.size[1] / 2, blocks === null ? [] : [blocks]);
  return {
    ...draw,
    dispose(state) {
      draw.dispose?.(state);
      blocks?.geometry.dispose();
      if (blocks !== null && blocks.material instanceof THREE.Material) blocks.material.dispose();
      blocks?.dispose();
    },
  };
}

function CityPreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => cityPreviewDraw(latest.current), [definition, variant]);
  return null;
}

/** Registers the city variant-tile preview: the district's streets and lot massing blocks from above. Called by `registerCityRenderer`. @internal */
export function registerCityPreview(): void {
  registerGeneratorPreview(CITY_OUTPUT, {
    Component: CityPreview,
    frame: (props) => {
      const city = variantCity(props);
      const extent = city === null ? 200 : Math.max(city.size[0], city.size[1]) / 2;
      return { target: [0, 0, 0], distance: extent * 2.6 };
    },
  });
}
