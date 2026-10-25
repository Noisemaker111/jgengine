import { expect, test } from "bun:test";
import { BoxGeometry, Color, ExtrudeGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from "three";
import { casingGeometryParameters, SALVAGE_PLACARD } from "./art";
import { INDUSTRIAL } from "./industrialMaterials";
import { serviceWeaponPose, WEAPON_MUZZLE } from "./weaponArt";
import { newDive } from "./state";

test("industrial coatings and exposed metals have finite, distinct physical responses", () => {
  for (const material of Object.values(INDUSTRIAL)) {
    for (const value of [material.roughness, material.metalness]) {
      expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
    }
    if ("emissiveIntensity" in material) { expect(Number.isFinite(material.emissiveIntensity)).toBe(true); expect(material.emissiveIntensity).toBeLessThanOrEqual(1); }
  }
  for (const surface of ["paint", "printed", "rubber", "glass", "floor"] as const) expect(INDUSTRIAL[surface].metalness).toBe(0);
  expect(INDUSTRIAL.steel.metalness).toBeGreaterThan(0.6);
  expect(INDUSTRIAL.brass.color).not.toBe(INDUSTRIAL.steel.color);
});
test("vault working surfaces retain diffuse detail between local fixtures", () => {
  const diffuseLuminance = (color: string, metalness: number) => {
    const linear = new Color(color);
    return (linear.r * 0.2126 + linear.g * 0.7152 + linear.b * 0.0722) * (1 - metalness);
  };
  // Bright labels cannot compensate for a floor or a tray that absorbs almost
  // all diffuse fill. Measure linear response, not the encoded hex brightness.
  for (const surface of ["floor", "paint", "steel", "brass"] as const) {
    const material = INDUSTRIAL[surface];
    expect(diffuseLuminance(material.color, material.metalness)).toBeGreaterThan(0.08);
  }
});
test("original casing extrusion has finite normals and occupies its specified envelope", () => {
  const { shape, options, offset } = casingGeometryParameters([0.58, 0.4, 0.3]);
  const geometry = new ExtrudeGeometry(shape, options);
  try {
    geometry.translate(0, 0, offset);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.x - geometry.boundingBox!.min.x).toBeCloseTo(0.58);
    expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeCloseTo(0.4);
    expect(geometry.boundingBox!.min.z).toBeCloseTo(-0.15);
    expect(geometry.boundingBox!.max.z).toBeCloseTo(0.15);
    const normals = geometry.getAttribute("normal");
    for (let i = 0; i < normals.count; i++) {
      const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
      expect(Number.isFinite(length)).toBe(true); expect(length).toBeCloseTo(1);
    }
  } finally { geometry.dispose(); }
});
test("tray placard clears close standing sightlines and keeps an exposed face on physical supports", () => {
  const { face, backing, supports } = SALVAGE_PLACARD;
  const material = new MeshBasicMaterial();
  const label = new Mesh(new PlaneGeometry(face.width, face.width / 3), material);
  label.position.set(...face.at);
  const solids = [backing, ...supports].map(part => {
    const mesh = new Mesh(new BoxGeometry(...part.size), material);
    mesh.position.set(...part.at);
    return mesh;
  });
  const meshes = [label, ...solids];
  try {
    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
      mesh.geometry.computeBoundingBox();
      expect(mesh.position.y + mesh.geometry.boundingBox!.max.y).toBeLessThan(1.62 - 0.3);
    }
    // The observed close plane distance and ordinary approach distances; only
    // local prop space is used, never a second set of authored world positions.
    for (const distance of [0.316, 1, 2.1]) for (const x of [-0.3, 0, 0.3]) {
      const ray = new Raycaster(new Vector3(x, 1.62, face.at[2] + distance), new Vector3(0, 0, -1));
      expect(ray.intersectObjects(meshes).length).toBe(0);
    }
    const eye = new Vector3(0, 1.62, face.at[2] + 1);
    const towardLabel = new Vector3(...face.at).sub(eye).normalize();
    expect(new Raycaster(eye, towardLabel).intersectObjects(meshes)[0]!.object).toBe(label);
    expect(face.at[2] - (backing.at[2] + backing.size[2] / 2)).toBeGreaterThan(0);
    for (const support of supports) {
      // Posts penetrate the existing tray lid (top 0.78), and reach the plate.
      expect(support.at[1] - support.size[1] / 2).toBeLessThan(0.78);
      expect(support.at[1] + support.size[1] / 2).toBeGreaterThan(backing.at[1] - backing.size[1] / 2);
    }
  } finally {
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
  }
});
test("weapon presentation settles with accepted state and preserves the original muzzle anchors", () => {
  const idle = { hand: "sidearm" as const, reload: 0, hurt: 0, flash: 0 };
  const pose = serviceWeaponPose(idle);
  for (const value of [...pose.at, ...pose.turn]) expect(Math.abs(value)).toBe(0);
  expect(pose.flash).toBe(false);
  expect(serviceWeaponPose({ ...idle, flash: 0.12 }).kick).toBe(1);
  expect(serviceWeaponPose({ ...idle, hand: "service-rifle", flash: 0 }).kick).toBe(0);
  expect(serviceWeaponPose({ ...idle, reload: 0.5 }).magazineOffset).toBeGreaterThan(0);
  expect(WEAPON_MUZZLE.sidearm).toEqual([0, 0, -0.22]); expect(WEAPON_MUZZLE["service-rifle"]).toEqual([0, 0, -0.5]);
});
