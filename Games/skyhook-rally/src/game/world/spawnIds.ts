export function spawnPoseId(courseId: string, checkpointIndex: number): string {
  return checkpointIndex < 0 ? `start:${courseId}` : `cp:${courseId}:${checkpointIndex}`;
}

export function headingTo(from: readonly [number, number, number], to: readonly [number, number, number]): number {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}
