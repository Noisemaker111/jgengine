// An app-defined kind: a box volume drawn as a gable roof, ridge along x. The viewer loads this
// module only when a document has a `gable-roof`.
import { BufferGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, EdgesGeometry } from "three";

import type { SceneViewKind } from "@jgengine/core/sceneView/mount.draw";

const gableRoof: SceneViewKind = {
  draw(object, context) {
    if (object.type !== "volume") throw new Error(`gable-roof ${object.value.id} must be a volume`);
    const { center, halfExtents, color = "#5a5550" } = object.value;
    const x = halfExtents?.x ?? 1;
    const z = halfExtents?.z ?? 1;
    const low = center.y - (halfExtents?.y ?? 0.5);
    const top = center.y + (halfExtents?.y ?? 0.5);
    const a = [-x, low, z], b = [x, low, z], c = [x, top, 0], d = [-x, top, 0];
    const e = [-x, low, -z], f = [x, low, -z];
    const triangles = [a, b, c, a, c, d, f, e, d, f, d, c, e, a, d, b, f, c];
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(triangles.flat(), 3));
    geometry.computeVertexNormals();
    const group = new Group();
    group.position.set(center.x, 0, center.z);
    group.add(new Mesh(geometry, context.surface(color)), new LineSegments(new EdgesGeometry(geometry), context.line("#2f2b28")));
    return group;
  },
};

export default gableRoof;
