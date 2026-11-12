/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { runGenerator } from "@jgengine/core/generator/generator";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { buildRoadRibbon, type RoadPoint } from "./roads";
import { mergeRibbonGeometry } from "./RoadRibbons.draw";
import { RACE_CIRCUIT_OUTPUT, type CircuitRoute, type RaceCircuit } from "./raceCircuit";
import { STREET_NETWORK_OUTPUT, type StreetNetwork } from "./streetGenerator";

/** One flat street layer of a top-down preview: polylines at a width, in one colour. */
export interface StreetPreviewLayer {
  lines: readonly { points: readonly RoadPoint[]; width: number }[];
  color: string;
  /** Lift above the ground plane, so later layers draw over earlier ones. */
  lift: number;
}

/** The street layers of a network, and its lap over them when there is one. @internal */
export function streetPreviewLayers(network: StreetNetwork, route: CircuitRoute | null): StreetPreviewLayer[] {
  const layers: StreetPreviewLayer[] = [{ lines: network.streets.map((street) => ({ points: street.points, width: street.width })), color: "#3c4148", lift: 0.05 }];
  if (route !== null && route.centerline.length > 1) {
    const first = route.centerline[0]!;
    layers.push({ lines: [{ points: [...route.centerline, first], width: Math.max(2, (route.widths[0] ?? 8) * 0.6) }], color: "#d8402f", lift: 0.1 });
  }
  return layers;
}

/**
 * A flat top-down draw of street layers over a ground plane of `halfX` × `halfZ` (plus extra meshes
 * the caller owns, such as a city's lot blocks): what the street, race circuit and city variant tiles show.
 * @internal
 */
export function streetLayersDraw(layers: readonly StreetPreviewLayer[], halfX: number, halfZ: number, extras: readonly THREE.Object3D[] = []): EngineDraw {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const groundGeometry = new THREE.PlaneGeometry(halfX * 2, halfZ * 2);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: "#7d8a6a", roughness: 1 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(groundGeometry, groundMaterial);
  for (const layer of layers) {
    const geometry = mergeRibbonGeometry(layer.lines.map((line) => buildRoadRibbon(line.points, line.width, () => 0, { elevation: layer.lift, maxSegmentLength: 16 })));
    if (geometry === null) continue;
    const material = new THREE.MeshStandardMaterial({ color: layer.color, roughness: 0.9 });
    group.add(new THREE.Mesh(geometry, material));
    disposables.push(geometry, material);
  }
  for (const extra of extras) group.add(extra);
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const item of disposables) item.dispose();
    },
  };
}

function footprint(variant: GeneratorPreviewProps["variant"]): [number, number] {
  const halfX = variant.params["halfX"];
  const halfZ = variant.params["halfZ"];
  return [typeof halfX === "number" ? halfX : 200, typeof halfZ === "number" ? halfZ : 200];
}

function isStreetNetwork(value: unknown): value is StreetNetwork {
  return typeof value === "object" && value !== null && "streets" in value && Array.isArray(value.streets) && "edges" in value;
}

function isRaceCircuit(value: unknown): value is RaceCircuit {
  return typeof value === "object" && value !== null && "network" in value && isStreetNetwork(value.network) && "route" in value;
}

function streetsPreviewDraw({ definition, variant }: GeneratorPreviewProps): EngineDraw {
  const output = runGenerator(definition, variant.meta);
  const [halfX, halfZ] = footprint(variant);
  const layers = isRaceCircuit(output) ? streetPreviewLayers(output.network, output.route) : isStreetNetwork(output) ? streetPreviewLayers(output, null) : [];
  return streetLayersDraw(layers, halfX, halfZ);
}

function StreetsPreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => streetsPreviewDraw(latest.current), [definition, variant]);
  return null;
}

/**
 * Registers the variant-tile previews for street networks and race circuits: the streets as flat
 * ribbons seen from above, with the lap drawn over them in red. Called by `registerCityRenderer`. @internal
 */
export function registerStreetNetworkPreviews(): void {
  const preview = {
    Component: StreetsPreview,
    frame: ({ variant }: GeneratorPreviewProps) => {
      const [halfX, halfZ] = footprint(variant);
      return { target: [0, 0, 0] as const, distance: Math.max(halfX, halfZ) * 2.6 };
    },
  };
  registerGeneratorPreview(STREET_NETWORK_OUTPUT, preview);
  registerGeneratorPreview(RACE_CIRCUIT_OUTPUT, preview);
}
