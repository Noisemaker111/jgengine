import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type MeshStandardMaterialParameters } from "three";
import { applyTriplanarProjection } from "@jgengine/core/material/triplanarMaterial.draw";

/**
 * The giant house's surfaces: original canvas-painted detail (wood grain, tile grout, rug weave,
 * carpet pile, cardboard flutes) tinted by each prop's authored colour and projected in world space,
 * so a chair leg and a floorboard share one grain at the same scale. Nothing is downloaded.
 */
export type HouseMaterial = "wood" | "darkwood" | "tile" | "lino" | "stone" | "concrete" | "carpet" | "rug" | "fabric" | "plastic" | "metal" | "chrome" | "ceramic" | "glass" | "paper" | "cardboard" | "plaster" | "paint" | "bread" | "wax" | "rubber" | "dust" | "emissive";

const RESPONSE: Record<HouseMaterial, { roughness: number; metalness: number; tile?: number; pattern?: Pattern; transparent?: number }> = {
  wood: { roughness: 0.62, metalness: 0, tile: 24, pattern: "grain" },
  darkwood: { roughness: 0.7, metalness: 0, tile: 24, pattern: "grain" },
  tile: { roughness: 0.35, metalness: 0, tile: 14, pattern: "tiles" },
  lino: { roughness: 0.55, metalness: 0, tile: 30, pattern: "speckle" },
  stone: { roughness: 0.3, metalness: 0, tile: 20, pattern: "speckle" },
  concrete: { roughness: 0.9, metalness: 0, tile: 26, pattern: "speckle" },
  carpet: { roughness: 1, metalness: 0, tile: 6, pattern: "pile" },
  rug: { roughness: 0.95, metalness: 0, tile: 28, pattern: "weave" },
  fabric: { roughness: 0.95, metalness: 0, tile: 8, pattern: "pile" },
  plastic: { roughness: 0.35, metalness: 0 },
  metal: { roughness: 0.38, metalness: 0.75 },
  chrome: { roughness: 0.16, metalness: 0.95 },
  ceramic: { roughness: 0.18, metalness: 0 },
  glass: { roughness: 0.08, metalness: 0, transparent: 0.42 },
  paper: { roughness: 0.85, metalness: 0, tile: 12, pattern: "speckle" },
  cardboard: { roughness: 0.9, metalness: 0, tile: 6, pattern: "flutes" },
  plaster: { roughness: 0.92, metalness: 0, tile: 40, pattern: "speckle" },
  paint: { roughness: 0.6, metalness: 0 },
  bread: { roughness: 0.9, metalness: 0, tile: 3, pattern: "speckle" },
  wax: { roughness: 0.45, metalness: 0 },
  rubber: { roughness: 0.9, metalness: 0 },
  dust: { roughness: 1, metalness: 0, tile: 4, pattern: "pile" },
  emissive: { roughness: 0.5, metalness: 0 },
};
export function isHouseMaterial(value: unknown): value is HouseMaterial { return typeof value === "string" && Object.hasOwn(RESPONSE, value); }

type Pattern = "grain" | "tiles" | "speckle" | "pile" | "weave" | "flutes";
const textures = new Map<Pattern, CanvasTexture>();
/** A seeded value noise, so every page load paints the same house. */
function noise(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function paint(pattern: Pattern): CanvasTexture {
  const known = textures.get(pattern);
  if (known !== undefined) return known;
  const size = 256, canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const c = canvas.getContext("2d");
  if (c === null) throw new Error("Crumb Run needs a canvas to paint its house");
  const rand = noise(pattern.length * 7919);
  c.fillStyle = "#dcdcdc"; c.fillRect(0, 0, size, size);
  if (pattern === "grain") {
    for (let y = 0; y < size; y++) {
      const wave = Math.sin(y * 0.11 + Math.sin(y * 0.023) * 3) * 0.5 + 0.5;
      c.fillStyle = `rgba(80,60,40,${0.06 + wave * 0.16})`; c.fillRect(0, y, size, 1);
    }
    for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(60,40,25,${0.08 + rand() * 0.12})`; c.lineWidth = 1 + rand() * 2; c.beginPath(); const y = rand() * size; c.moveTo(0, y); c.bezierCurveTo(size * 0.3, y + rand() * 10 - 5, size * 0.6, y + rand() * 10 - 5, size, y); c.stroke(); }
    c.fillStyle = "rgba(40,25,15,0.35)"; for (const y of [0, 64, 128, 192]) c.fillRect(0, y, size, 2);
  } else if (pattern === "tiles") {
    c.fillStyle = "#e8e8e8"; c.fillRect(0, 0, size, size);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { c.fillStyle = `rgba(0,0,0,${rand() * 0.07})`; c.fillRect(x * 64 + 3, y * 64 + 3, 58, 58); }
    c.fillStyle = "rgba(60,50,40,0.55)"; for (let i = 0; i <= 4; i++) { c.fillRect(i * 64 - 2, 0, 4, size); c.fillRect(0, i * 64 - 2, size, 4); }
  } else if (pattern === "speckle") {
    for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${rand() > 0.5 ? "40,30,20" : "255,255,255"},${rand() * 0.12})`; c.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3); }
  } else if (pattern === "pile") {
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${rand() > 0.5 ? "0,0,0" : "255,255,255"},${rand() * 0.14})`; c.fillRect(rand() * size, rand() * size, 1, 2 + rand() * 3); }
  } else if (pattern === "weave") {
    c.fillStyle = "#cfcfcf"; c.fillRect(0, 0, size, size);
    c.strokeStyle = "rgba(255,240,210,0.55)"; c.lineWidth = 6;
    for (let r = 20; r < 180; r += 34) { c.beginPath(); c.arc(128, 128, r, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = "rgba(40,20,10,0.35)"; c.lineWidth = 3;
    for (let a = 0; a < 16; a++) { c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.cos(a / 16 * Math.PI * 2) * 180, 128 + Math.sin(a / 16 * Math.PI * 2) * 180); c.stroke(); }
    for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(0,0,0,${rand() * 0.1})`; c.fillRect(rand() * size, rand() * size, 2, 1); }
  } else {
    for (let x = 0; x < size; x += 8) { c.fillStyle = "rgba(90,60,30,0.18)"; c.fillRect(x, 0, 3, size); }
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(60,40,20,${rand() * 0.1})`; c.fillRect(rand() * size, rand() * size, 2, 2); }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace; texture.wrapS = RepeatWrapping; texture.wrapT = RepeatWrapping;
  textures.set(pattern, texture);
  return texture;
}

/** One material for a surface kind and colour; textured surfaces project their detail in world space. */
export function houseMaterial(material: HouseMaterial, color: string, glow = 0): MeshStandardMaterial {
  const r = RESPONSE[material];
  const params: MeshStandardMaterialParameters = { color, roughness: r.roughness, metalness: r.metalness };
  if (r.transparent !== undefined) Object.assign(params, { transparent: true, opacity: r.transparent, depthWrite: false });
  if (material === "emissive" || glow > 0) Object.assign(params, { emissive: color, emissiveIntensity: glow > 0 ? glow : 0.8 });
  const out = new MeshStandardMaterial(params);
  if (r.pattern !== undefined && r.tile !== undefined && typeof document !== "undefined") {
    out.map = paint(r.pattern);
    applyTriplanarProjection(out, { tileMetres: r.tile, sharpness: 6 });
  }
  return out;
}
