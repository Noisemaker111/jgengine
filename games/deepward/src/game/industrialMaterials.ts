import type { ThreeElements } from "@react-three/fiber";

export const PALETTE = {
  wall: "#89918c", panel: "#344344", floor: "#34444b", steel: "#82918b", brass: "#cca46c",
  cyan: "#84e8d0", amber: "#eab379", danger: "#ee7361", ink: "#b69be0", black: "#0b171b",
};

/** Public renderer props keep every surface compatible with the same material element. */
type StandardMaterialProps = ThreeElements["meshStandardMaterial"];
export type IndustrialMaterialProps = Required<Pick<StandardMaterialProps, "color" | "roughness" | "metalness">>
  & Pick<StandardMaterialProps, "emissive" | "emissiveIntensity" | "transparent" | "opacity" | "depthWrite">;

/** Surface recipes, not shared GPU objects: R3F owns each mounted material's disposal. */
export const INDUSTRIAL = {
  // Worn coatings retain a diffuse response under the vault's local fixtures.
  // Pure reflective metal disappears between fixtures without a reflection map.
  steel: { color: PALETTE.steel, roughness: 0.46, metalness: 0.68 },
  brass: { color: PALETTE.brass, roughness: 0.46, metalness: 0.7 },
  paint: { color: PALETTE.wall, roughness: 0.76, metalness: 0 },
  floor: { color: "#4b5c61", roughness: 0.88, metalness: 0 },
  rubber: { color: "#202a2c", roughness: 0.94, metalness: 0 },
  glass: { color: "#193a40", roughness: 0.16, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false },
  printed: { color: "#b9b4a1", roughness: 0.68, metalness: 0 },
  lamp: { color: PALETTE.cyan, roughness: 0.48, metalness: 0, emissive: PALETTE.cyan, emissiveIntensity: 0.8 },
} as const satisfies Record<string, IndustrialMaterialProps>;
export type IndustrialSurface = keyof typeof INDUSTRIAL;

export function surfaceMaterial(surface: IndustrialSurface, color?: string, emission = 0): IndustrialMaterialProps {
  return { ...INDUSTRIAL[surface], ...(color === undefined ? {} : { color }),
    ...(emission > 0 ? { emissive: color ?? INDUSTRIAL[surface].color, emissiveIntensity: emission } : {}) };
}
