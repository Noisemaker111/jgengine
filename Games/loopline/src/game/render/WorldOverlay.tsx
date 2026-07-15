import { useGameStore } from "@jgengine/react/hooks";

import { session } from "../session";

export function LooplineWorldOverlay() {
  const selected = useGameStore(() => session.selectedObject);
  if (selected === null) return null;
  const obj = session.placed.get(selected);
  if (obj === undefined) return null;
  return (
    <mesh position={[obj.x, 0.12, obj.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.6, 3.2, 28]} />
      <meshBasicMaterial color="#ffd24a" transparent opacity={0.85} />
    </mesh>
  );
}
