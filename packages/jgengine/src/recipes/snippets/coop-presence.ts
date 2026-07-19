import {
  DEFAULT_POSE_SYNC_RULES,
  decidePoseSync,
  spawnPresenceState,
  type IncomingPose,
} from "@jgengine/core/multiplayer/presenceModel";

// The joint: remote presence is host-authoritative and pure. Spawn a serializable
// state per teammate, then reconcile each incoming pose against the shared rules
// (speed clamp, jump band, staleness) before moving their avatar. No transport
// coupling — feed it whatever your session channel delivers.
let mate = spawnPresenceState({ x: 0, y: 0, z: 0 }, 0, DEFAULT_POSE_SYNC_RULES);

export function onRemotePose(incoming: IncomingPose, nowMs: number): void {
  const decision = decidePoseSync(mate, incoming, DEFAULT_POSE_SYNC_RULES, nowMs);
  if (decision.changed) {
    mate = { ...mate, position: decision.position, rotationY: decision.rotationY, lastSeenAtMs: nowMs };
    // apply decision.position / decision.rotationY to the rendered avatar
  }
}
