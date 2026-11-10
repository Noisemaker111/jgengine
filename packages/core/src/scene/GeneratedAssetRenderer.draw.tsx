import { useMemo, useRef } from "react";
import * as THREE from "three";

import { runGenerator } from "@jgengine/core/generator/generator";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { PARTS_OUTPUT, isGeneratedAsset, resolveGeneratorAsset, type GeneratedAsset } from "@jgengine/core/scene/assetGenerator";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { StaticShapeInstances, staticShapeInstancesDraw, type StaticShapeInstance } from "@jgengine/core/instancing/staticShapeInstances.draw";

const NEUTRAL = "#b8b0a4";

function assetInstances(asset: GeneratedAsset): StaticShapeInstance[] {
  return asset.parts.map(part => ({
    shape: "box",
    position: part.position,
    rotation: [0, part.rotationY ?? 0, 0],
    scale: [Math.max(1e-3, part.size[0]), Math.max(1e-3, part.size[1]), Math.max(1e-3, part.size[2])],
    surface: { color: part.color ?? NEUTRAL, roughness: 0.62, metalness: 0.04 },
  }));
}

/** Props for {@link GeneratedAsset}: the placed instance's `meta` (assetId + params + seed) and transform. */
export interface GeneratedAssetProps {
  /** The placed instance meta — `{ assetId, seed, ...params }`. Re-resolved every render, never baked. */
  meta: Record<string, unknown> | undefined;
  position?: readonly [number, number, number];
  rotationY?: number;
}

/**
 * Renders one placed generator-asset instance by re-resolving its `meta` through the registered
 * generator and instancing the parts. Returns null when the meta names no generator. The runtime
 * counterpart to placing a parametric asset — the geometry is data, recomputed from params + seed.
 * @internal — `AuthoredScene` mounts this for generator markers automatically.
 */
export function generatedAssetInstanceDraw(getProps: () => GeneratedAssetProps): EngineDraw {
  const group = new THREE.Group();
  let inner: { draw: EngineDraw; state: EngineFrameState } | null = null;
  let metaFor: Record<string, unknown> | undefined;
  let hasMeta = false;
  let instances: readonly StaticShapeInstance[] = [];
  const sync = (state: EngineFrameState) => {
    const props = getProps();
    const position = props.position ?? [0, 0, 0];
    group.position.set(position[0], position[1], position[2]);
    group.rotation.set(0, props.rotationY ?? 0, 0);
    if (hasMeta && props.meta === metaFor) return;
    hasMeta = true;
    metaFor = props.meta;
    const asset = resolveGeneratorAsset(props.meta);
    instances = asset === null ? [] : assetInstances(asset);
    inner?.draw.dispose?.(inner.state);
    const draw = staticShapeInstancesDraw(() => instances);
    const childState = childFrameState(state, group);
    draw.mount?.(childState);
    inner = { draw, state: childState };
  };
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      sync(state);
    },
    frame: sync,
    update: sync,
    dispose(state: EngineFrameState) {
      inner?.draw.dispose?.(inner.state);
      inner = null;
      state.scene.remove(group);
      group.clear();
    },
  };
}

/**
 * Renders one placed generator-asset instance by re-resolving its `meta` through the registered
 * generator and instancing the parts. Returns null when the meta names no generator. The runtime
 * counterpart to placing a parametric asset — the geometry is data, recomputed from params + seed.
 * @internal — `AuthoredScene` mounts this for generator markers automatically.
 */
export function GeneratedAssetInstance(props: GeneratedAssetProps) {
  const latest = useRef(props);
  latest.current = props;
  const created = useRef<EngineDraw | null>(null);
  if (created.current === null) created.current = generatedAssetInstanceDraw(() => latest.current);
  useEngineDraw(() => created.current as EngineDraw, []);
  return null;
}

/** All parts of one generated asset, batched into one instanced box draw per color. */
function GeneratedParts({ asset }: { asset: GeneratedAsset }) {
  const instances = useMemo<StaticShapeInstance[]>(() => assetInstances(asset), [asset]);
  return <StaticShapeInstances instances={instances} />;
}

function variantAsset({ definition, variant }: GeneratorPreviewProps): GeneratedAsset | null {
  const output = runGenerator(definition, variant.meta);
  return isGeneratedAsset(output) ? output : null;
}

function PartsPreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const asset = useMemo(() => variantAsset({ definition, variant }), [definition, variant]);
  return asset === null ? null : <GeneratedParts asset={asset} />;
}

/** Registers the variant-tile preview for parts generators. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerPartsPreview(): void {
  registerGeneratorPreview(PARTS_OUTPUT, {
    Component: PartsPreview,
    frame: (props) => {
      const asset = variantAsset(props);
      if (asset === null) return { target: [0, 0.5, 0], distance: 3 };
      const { min, max } = asset.bounds;
      const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.1);
      return { target: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], distance: extent * 1.9 };
    },
  });
}
