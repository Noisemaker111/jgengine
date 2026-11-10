/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { TilemapWorldConfig } from "@jgengine/core/world/features";
import { sortingOrder } from "@jgengine/core/render/sprite2d";

import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

import { resolveTileLayerInstances } from "./tileLayerInstances";

/** Inputs for the instanced textured tile-layer renderer. */
export interface TileLayerRendererProps {
  config: TilemapWorldConfig;
  parallax?: readonly [number, number];
  pixelated?: boolean;
}

const textureLoads = new Map<string, Promise<THREE.Texture>>();

function loadTileTexture(url: string): Promise<THREE.Texture> {
  let pending = textureLoads.get(url);
  if (pending === undefined) {
    pending = new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, resolve, undefined, reject);
    });
    textureLoads.set(url, pending);
    pending.catch(() => textureLoads.delete(url));
  }
  return pending;
}

/** Renders a tilemap as one instanced quad mesh with atlas UV rectangles. */
export function tileLayerRendererDraw({ config, parallax = [1, 1], pixelated = true }: TileLayerRendererProps): EngineDraw {
  const group = new THREE.Group();
  const tileSet = config.tileSet;
  const instances = resolveTileLayerInstances(config);
  let mesh: THREE.InstancedMesh | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.MeshBasicMaterial | null = null;
  let cancelled = false;
  const scratch = { camera: new THREE.Vector3() };

  function build(texture: THREE.Texture, state: EngineFrameState): void {
    if (cancelled) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = pixelated ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;

    const uvOffset = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(instances.length, 1) * 2), 2);
    const uvScale = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(instances.length, 1) * 2), 2);
    geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    geometry.setAttribute("tileUvOffset", uvOffset);
    geometry.setAttribute("tileUvScale", uvScale);

    material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.08, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 tileUvOffset;\nattribute vec2 tileUvScale;").replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * tileUvScale + tileUvOffset;\n#endif");
    };
    material.customProgramCacheKey = () => "jgengine-tile-layer";

    mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.renderOrder = sortingOrder(["ground", "objects", "effects"], config.sortingLayer ?? "ground", 0);
    mesh.frustumCulled = false;
    uploadInstances(mesh, { count: instances.length, at: (i, out) => out.makeTranslation(instances[i]!.x, 0, instances[i]!.z) }, { bounds: "none" });
    const offset = uvOffset.array as Float32Array;
    const scale = uvScale.array as Float32Array;
    for (let i = 0; i < instances.length; i += 1) {
      offset.set(instances[i]!.uvOffset, i * 2);
      scale.set(instances[i]!.uvScale, i * 2);
    }
    uvOffset.needsUpdate = true;
    uvScale.needsUpdate = true;
    group.add(mesh);
    state.invalidate();
  }

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      const url = tileSet?.atlas.image ?? "";
      if (tileSet === undefined || instances.length === 0 || url === "") return;
      void loadTileTexture(url).then((texture) => {
        if (!cancelled) build(texture, state);
      }).catch(() => {});
    },
    frame(state: EngineFrameState) {
      if (mesh === null) return;
      state.camera.getWorldPosition(scratch.camera);
      mesh.position.set(-scratch.camera.x * (1 - parallax[0]), 0, scratch.camera.z * (1 - parallax[1]));
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      state.scene.remove(group);
      group.clear();
      mesh = null;
      geometry?.dispose();
      geometry = null;
      material?.dispose();
      material = null;
    },
  };
}

/** Thin UI bridge: mounts {@link tileLayerRendererDraw} under the JSX parent. */
export function TileLayerRenderer(props: TileLayerRendererProps) {
  const { config, parallax, pixelated } = props;
  return (
    <EngineDrawMount
      create={() => tileLayerRendererDraw(props)}
      deps={[config, parallax, pixelated]}
    />
  );
}
