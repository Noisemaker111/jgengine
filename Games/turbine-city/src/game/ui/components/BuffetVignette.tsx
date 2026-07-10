import type { SessionSnapshot } from "../../race/session";

export function BuffetVignette({ snapshot }: { snapshot: SessionSnapshot }) {
  const intensity = snapshot.flow.buffet;
  if (intensity <= 0.02) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        boxShadow: `inset 0 0 ${80 + intensity * 160}px ${20 + intensity * 40}px rgba(255,159,28,${0.15 + intensity * 0.35})`,
        transition: "box-shadow 80ms linear",
      }}
    />
  );
}
