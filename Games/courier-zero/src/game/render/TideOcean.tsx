import { Ocean } from "@jgengine/shell/water";
import { useGameStore } from "@jgengine/react/hooks";
import { tideLevelAt } from "../tide/catalog";
import { getRun } from "../run/session";

export function TideOcean() {
  const elapsed = useGameStore((ctx) => getRun(ctx).elapsed);
  const status = useGameStore((ctx) => getRun(ctx).status);
  if (status === "start") return null;
  const level = tideLevelAt(elapsed);

  return (
    <Ocean
      position={[0, level, 0]}
      config={{ size: 480, amplitude: 0.55, speed: 0.5, color: { shallow: "#2a9d8f" } }}
    />
  );
}
