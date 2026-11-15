import type * as THREE from "three";

/** The share of a scene's exposure and image-based light the lighting zone around the camera asks for. */
export interface LightingZoneFactors {
  exposure: number;
  environment: number;
}

const factors = new WeakMap<THREE.Scene, LightingZoneFactors>();

/** Publishes the camera's current lighting-zone factors on the rendered scene; the post chain and environment light read them. @internal */
export function publishLightingZoneFactors(scene: THREE.Scene, value: LightingZoneFactors | undefined): void {
  if (value === undefined) factors.delete(scene);
  else factors.set(scene, value);
}

/** The lighting-zone factors published on `scene`, or `undefined` when no zoned rig is mounted. @internal */
export function readLightingZoneFactors(scene: THREE.Scene): LightingZoneFactors | undefined {
  return factors.get(scene);
}

type GlowMaterial = THREE.Material & { emissiveIntensity: number };

/**
 * Dims emissive materials per light group (`userData.lightGroup`) for the lighting zone around the
 * camera. It finds the scene's grouped materials by walking the scene every `rescanEvery` frames
 * (so props that stream in later join), remembers each one's authored glow, and writes the scaled
 * glow only when it changes.
 * @internal
 */
export interface LightGroupDimmer {
  apply(scene: THREE.Object3D, scales: Readonly<Record<string, number>>): void;
  /** Puts every touched material back to its authored glow. */
  restore(): void;
}

/** @internal */
export function createLightGroupDimmer(groupKey: string, rescanEvery = 30): LightGroupDimmer {
  const entries: { material: GlowMaterial; group: string; base: number }[] = [];
  const known = new WeakSet<THREE.Material>();
  let frames = 0;
  const collect = (material: THREE.Material) => {
    if (known.has(material)) return;
    known.add(material);
    const group: unknown = material.userData?.[groupKey];
    if (typeof group !== "string" || typeof (material as Partial<GlowMaterial>).emissiveIntensity !== "number") return;
    entries.push({ material: material as GlowMaterial, group, base: (material as GlowMaterial).emissiveIntensity });
  };
  return {
    apply(scene, scales) {
      if (frames % rescanEvery === 0) {
        scene.traverse((object) => {
          const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (material === undefined) return;
          if (Array.isArray(material)) material.forEach(collect);
          else collect(material);
        });
      }
      frames += 1;
      for (const entry of entries) {
        const next = entry.base * (scales[entry.group] ?? 1);
        if (entry.material.emissiveIntensity !== next) entry.material.emissiveIntensity = next;
      }
    },
    restore() {
      for (const entry of entries) entry.material.emissiveIntensity = entry.base;
    },
  };
}
