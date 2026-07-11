export interface PoseWritable {
  position: { set(x: number, y: number, z: number): void };
  rotation: { y: number };
}

export interface PoseSource {
  position: readonly [number, number, number];
  rotationY: number;
}

export function writeEntityPose(target: PoseWritable, source: PoseSource): void {
  target.position.set(source.position[0], source.position[1], source.position[2]);
  target.rotation.y = source.rotationY;
}

export function posesEqual(a: PoseSource, b: PoseSource): boolean {
  return (
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1] &&
    a.position[2] === b.position[2] &&
    a.rotationY === b.rotationY
  );
}
