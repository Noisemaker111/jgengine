import * as THREE from "three";
import type { MassingBodyRole } from "@jgengine/core/world/massing";

import { PROGRAMS, TONES, type Building, type Lens } from "../catalog";
import { livedWeathering } from "../city/model";

let concreteTextureCanvas: HTMLCanvasElement | undefined;
let sharedConcreteTexture: THREE.CanvasTexture | undefined;

export function getConcreteTextureCanvas(): HTMLCanvasElement | undefined {
  if (typeof document === "undefined") return undefined;
  if (concreteTextureCanvas) return concreteTextureCanvas;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = Math.sin(x * 0.31 + y * 0.07) * 5 + Math.sin(y * 0.61) * 3 + ((x * 17 + y * 31) % 13) - 6;
      const lift = y % 32 < 1 ? -24 : 0;
      const tie = (x - 21) % 48 < 2 && (y - 15) % 32 < 2 ? -38 : 0;
      const v = Math.max(150, Math.min(235, 218 + grain + lift + tie));
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  context.putImageData(image, 0, 0);
  concreteTextureCanvas = canvas;
  return canvas;
}

export function getConcreteTexture(): THREE.CanvasTexture | undefined {
  if (sharedConcreteTexture) return sharedConcreteTexture;
  const canvas = getConcreteTextureCanvas();
  if (canvas === undefined) return undefined;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  sharedConcreteTexture = texture;
  return texture;
}

export function concreteShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <dithering_fragment>",
    `float concreteGrain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
    gl_FragColor.rgb *= 0.991 + concreteGrain * 0.018;
    #include <dithering_fragment>`,
  );
}

export function weatheredColor(b: Building): string {
  const material = new THREE.Color(TONES[b.tone].color);
  const weather = livedWeathering(b);
  material.offsetHSL(0, -weather * 0.00035, -weather * 0.0007);
  return material.getStyle();
}

export function lensColor(b: Building, lens: Lens): string {
  if (lens === "program") return PROGRAMS[b.program].color;
  if (lens === "structure") return b.structural === "frame" ? "#91a7b8" : b.structural === "walls" ? "#d4ad67" : "#a98ebd";
  if (lens === "carbon") {
    const intensity = Math.min(1, (b.height * b.width * b.depth) / 48000);
    return new THREE.Color().lerpColors(new THREE.Color("#a7c97b"), new THREE.Color("#d64e3a"), intensity).getStyle();
  }
  if (lens === "activity") {
    const energy = b.program === "culture" || b.program === "mixed" ? 0.9 : b.program === "civic" ? 0.62 : 0.28;
    return new THREE.Color().lerpColors(new THREE.Color("#25313c"), new THREE.Color("#e69a37"), energy).getStyle();
  }
  if (lens === "daylight") {
    const access = Math.max(0.12, 1 - b.depth / 38);
    return new THREE.Color().lerpColors(new THREE.Color("#3b4f69"), new THREE.Color("#e8c87b"), access).getStyle();
  }
  return weatheredColor(b);
}

export function roleSurfaceColor(color: string, role: MassingBodyRole | undefined): string {
  if (role === "transfer") return new THREE.Color(color).multiplyScalar(0.72).getStyle();
  if (role === "core") return new THREE.Color(color).multiplyScalar(0.84).getStyle();
  return color;
}
