/**
 * Generic named-socket reader for loaded 3D models. Walks a node tree (any object with `.name`,
 * `.position`, and `.children` — structurally satisfied by `THREE.Object3D`) and collects the local
 * offsets of nodes whose name marks an attachment point. Genre-agnostic: wire anchors on a pylon,
 * muzzle/hand mounts on a character, hardpoints on a ship, seat/decal slots on furniture — anything
 * an artist tags with an empty in the GLB. Pure data (no three.js import), so it lives in core.
 *
 * @capability model-sockets named attachment points read from a model
 */

export interface ModelNode {
  name: string;
  position: { x: number; y: number; z: number };
  children?: readonly ModelNode[];
}

/** One resolved socket: its node name and local-space offset from the model origin. */
export interface ModelSocket {
  name: string;
  offset: readonly [number, number, number];
}

export const SOCKET_PATTERN = /socket|wire|attach|anchor|mount|hardpoint/i;

export function readNamedSockets(root: ModelNode, pattern: RegExp = SOCKET_PATTERN): ModelSocket[] {
  const found: ModelSocket[] = [];
  const walk = (node: ModelNode) => {
    if (pattern.test(node.name)) found.push({ name: node.name, offset: [node.position.x, node.position.y, node.position.z] });
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  found.sort((a, b) => b.offset[1] - a.offset[1] || a.offset[0] - b.offset[0]);
  return found;
}
