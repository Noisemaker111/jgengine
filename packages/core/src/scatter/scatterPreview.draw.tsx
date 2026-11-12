/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { runGenerator } from "@jgengine/core/generator/generator";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { SCATTER_OUTPUT, type ScatterInstance, type ScatterPlot } from "./scatterRegion";
import { buildScatterProxy } from "./scatterProxies.draw";

function isScatterPlot(value: unknown): value is ScatterPlot {
  return typeof value === "object" && value !== null && "size" in value && typeof value.size === "number" && "instances" in value && Array.isArray(value.instances);
}

/**
 * A scatter variant's sample plot drawn as one instanced proxy mesh per palette item on a ground
 * square, so a tile reads the region's mix, density and scale spread.
 * @internal
 */
export function scatterPreviewDraw({ definition, variant }: GeneratorPreviewProps): EngineDraw {
  const output = runGenerator(definition, variant.meta);
  const plot = isScatterPlot(output) ? output : null;
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  if (plot !== null) {
    const groundGeometry = new THREE.PlaneGeometry(plot.size, plot.size);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: "#5a4b38", roughness: 1 });
    geometries.push(groundGeometry);
    materials.push(groundMaterial);
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);
    const byItem = new Map<string, ScatterInstance[]>();
    for (const instance of plot.instances) {
      const list = byItem.get(instance.item);
      if (list === undefined) byItem.set(instance.item, [instance]);
      else list.push(instance);
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    materials.push(material);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [item, instances] of byItem) {
      const geometry = buildScatterProxy(item);
      geometries.push(geometry);
      const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
      instances.forEach((instance, index) => {
        rotation.setFromAxisAngle(up, instance.rotationY);
        matrix.compose(new THREE.Vector3(instance.x, instance.y, instance.z), rotation, new THREE.Vector3(instance.scale, instance.scale, instance.scale));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

function ScatterPreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => scatterPreviewDraw(latest.current), [definition, variant]);
  return null;
}

/** Registers the scatter variant-tile preview: the sample plot's placements as proxy meshes. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerScatterPreview(): void {
  registerGeneratorPreview(SCATTER_OUTPUT, {
    Component: ScatterPreview,
    frame: (props) => {
      const output = runGenerator(props.definition, props.variant.meta);
      const size = isScatterPlot(output) ? output.size : 24;
      return { target: [0, 0.5, 0], distance: size * 1.3 };
    },
  });
}
