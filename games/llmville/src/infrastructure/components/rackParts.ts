import { BoxGeometry, CylinderGeometry, Mesh, type Material, type Object3D } from "three";

/** Where a rack part sits and whether it takes part in shadows. */
interface PartTransform {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function place(parent: Object3D, mesh: Mesh, transform: PartTransform | undefined): Mesh {
  if (transform?.position !== undefined) mesh.position.set(transform.position[0], transform.position[1], transform.position[2]);
  if (transform?.rotation !== undefined) mesh.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
  if (transform?.castShadow !== undefined) mesh.castShadow = transform.castShadow;
  if (transform?.receiveShadow !== undefined) mesh.receiveShadow = transform.receiveShadow;
  parent.add(mesh);
  return mesh;
}

/** A box part of a procedural rack, added to `parent`. */
export function addBox(parent: Object3D, size: readonly [number, number, number], material: Material, transform?: PartTransform): Mesh {
  return place(parent, new Mesh(new BoxGeometry(size[0], size[1], size[2]), material), transform);
}

/** A cylinder part of a procedural rack (`[radiusTop, radiusBottom, height, segments = 12]`), added to `parent`. */
export function addCylinder(parent: Object3D, args: readonly [number, number, number, number?], material: Material, transform?: PartTransform): Mesh {
  return place(parent, new Mesh(new CylinderGeometry(args[0], args[1], args[2], args[3] ?? 12), material), transform);
}
