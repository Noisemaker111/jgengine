import { useGameStore } from "@jgengine/react/hooks";
import { PALETTE } from "../theme";
import { readSnapshot } from "../race/sessionStore";

export function TrajectoryOverlay() {
  const snapshot = useGameStore(readSnapshot);
  if (snapshot === null || snapshot.phase !== "racing") return null;
  const points = snapshot.trajectory;
  return (
    <>
      {points.map((point, index) => {
        if (index === 0) return null;
        const fade = 1 - index / points.length;
        return (
          <mesh key={index} position={[point[0], 1.4, point[1]]}>
            <sphereGeometry args={[0.18 + fade * 0.06, 6, 6]} />
            <meshBasicMaterial color={PALETTE.starlight} transparent opacity={0.25 + fade * 0.55} />
          </mesh>
        );
      })}
    </>
  );
}
