import { CanvasTexture, SRGBColorSpace } from "three";
import { Shape } from "three";
import { createElement, useMemo } from "react";
import { PALETTE, surfaceMaterial, type IndustrialSurface } from "./industrialMaterials";
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
function material({ surface = "paint", color, emission = 0 }: PartProps) {
  return createElement("meshStandardMaterial", surfaceMaterial(surface, color, emission));
}
export function IndustrialBox(props: PartProps & { size: Triple }) {
  return createElement("mesh", { position: props.at, rotation: props.turn, castShadow: true, receiveShadow: true },
    createElement("boxGeometry", { args: props.size }), material(props));
}
export function IndustrialCylinder(props: PartProps & { radius: number; length: number; tip?: number }) {
  return createElement("mesh", { position: props.at, rotation: props.turn, castShadow: true, receiveShadow: true },
    createElement("cylinderGeometry", { args: [props.tip ?? props.radius, props.radius, props.length, 12] }), material(props));
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
  return createElement("group", { position: props.at, rotation: props.turn },
    createElement("mesh", { position: [0, 0, offset], castShadow: true, receiveShadow: true },
      createElement("extrudeGeometry", { args: [shape, options] }), material(props)));
}
