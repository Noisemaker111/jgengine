import { BoxGeometry, CanvasTexture, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SRGBColorSpace } from "three";
import { createElement, useMemo } from "react";
import { EngineDrawMount, meshDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw } from "@jgengine/core/frame/engineLoop.draw";
import { PALETTE, surfaceMaterialParams, type IndustrialSurface } from "./industrialMaterials";
export { PALETTE } from "./industrialMaterials";
/** Original Deepward signs and surface artwork. No asset fetches or external art. */
export function signTexture(title: string, subtitle: string, color = PALETTE.cyan): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768; canvas.height = 256;
  const c = canvas.getContext("2d");
  if (c === null) throw new Error("Deepward signage needs a canvas context");
  c.fillStyle = PALETTE.black; c.fillRect(0, 0, 768, 256);
  c.strokeStyle = color; c.lineWidth = 5; c.strokeRect(12, 12, 744, 232);
  c.fillStyle = color; c.fillRect(32, 40, 10, 170);
  c.font = "bold 54px monospace";
  if (c.measureText(title).width > 655) c.font = `bold ${Math.floor(54 * 655 / c.measureText(title).width)}px monospace`;
  c.fillText(title, 65, 103);
  c.fillStyle = "#d5d9c9"; c.font = "27px monospace"; c.fillText(subtitle, 65, 169);
  c.fillStyle = color; c.font = "19px monospace"; c.fillText("BW / MAINTENANCE DIVISION", 65, 214);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return texture;
}

export type Triple = [number, number, number];
/** Tray-local geometry: a supported label below the standing interaction sightline. */
export const SALVAGE_PLACARD: {
  face: { at: Triple; width: number };
  backing: { at: Triple; size: Triple };
  supports: { at: Triple; size: Triple }[];
} = {
  face: { at: [0, 1, -0.38], width: 0.92 },
  backing: { at: [0, 1, -0.42], size: [1, 0.36, 0.07] },
  supports: [
    { at: [-0.42, 0.88, -0.42], size: [0.055, 0.24, 0.055] },
    { at: [0.42, 0.88, -0.42], size: [0.055, 0.24, 0.055] },
  ],
};
interface PartProps { at: Triple; turn?: Triple; surface?: IndustrialSurface; color?: string; emission?: number }
/** Original clipped-corner casing profile. Extrusion supplies outward normals and bevels. */
export function casingProfile(width: number, height: number): Shape {
  const x = width / 2, y = height / 2, cut = Math.min(width, height) * 0.16;
  const shape = new Shape();
  shape.moveTo(-x + cut, -y);
  for (const [px, py] of [[x - cut, -y], [x, -y + cut], [x, y - cut], [x - cut, y], [-x + cut, y], [-x, y - cut], [-x, -y + cut]]) shape.lineTo(px!, py!);
  shape.closePath();
  return shape;
}
function material(props: PartProps) {
  return new MeshStandardMaterial(surfaceMaterialParams(props.surface ?? "paint", props.color, props.emission ?? 0));
}
function mount(create: () => EngineDraw, deps: readonly unknown[]) {
  return createElement(EngineDrawMount, { create, deps });
}
export function IndustrialBox(props: PartProps & { size: Triple }) {
  return mount(() => meshDraw({
    geometry: new BoxGeometry(...props.size),
    material: material(props),
    position: props.at,
    rotation: props.turn,
    castShadow: true,
    receiveShadow: true,
  }), [props.at, props.turn, props.surface, props.color, props.emission, props.size]);
}
export function IndustrialCylinder(props: PartProps & { radius: number; length: number; tip?: number }) {
  return mount(() => meshDraw({
    geometry: new CylinderGeometry(props.tip ?? props.radius, props.radius, props.length, 12),
    material: material(props),
    position: props.at,
    rotation: props.turn,
    castShadow: true,
    receiveShadow: true,
  }), [props.at, props.turn, props.surface, props.color, props.emission, props.radius, props.length, props.tip]);
}
export function casingGeometryParameters([w, h, d]: Triple) {
  const bevel = Math.min(w, h, d) * 0.08;
  return {
    shape: casingProfile(w - 2 * bevel, h - 2 * bevel),
    options: { depth: d - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 1 },
    offset: -d / 2 + bevel,
  };
}
export function IndustrialCasing(props: PartProps & { size: Triple }) {
  const [w, h, d] = props.size;
  const { shape, options, offset } = useMemo(() => casingGeometryParameters([w, h, d]), [w, h, d]);
  return mount(() => {
    const group = new Group();
    group.position.set(props.at[0], props.at[1], props.at[2]);
    if (props.turn !== undefined) group.rotation.set(props.turn[0], props.turn[1], props.turn[2]);
    const mat = material(props);
    const mesh = new Mesh(new ExtrudeGeometry(shape, options), mat);
    mesh.position.z = offset;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return {
      mount(state) {
        state.scene.add(group);
      },
      dispose(state) {
        state.scene.remove(group);
        mesh.geometry.dispose();
        mat.dispose();
      },
    };
  }, [props.at, props.turn, props.surface, props.color, props.emission, shape, options, offset]);
}
