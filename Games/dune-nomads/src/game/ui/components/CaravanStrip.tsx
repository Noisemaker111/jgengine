import { HudLabel } from "@/components/ui/hud-label";

export function CaravanStrip({ stragglers }: { stragglers: readonly boolean[] }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <HudLabel>Caravan</HudLabel>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="block h-3.5 w-3.5 rounded-full"
          style={{ background: "var(--jg-accent)", border: "1px solid var(--jg-text)" }}
        />
        {stragglers.map((straggling, index) => (
          <span
            key={index}
            aria-hidden
            className="block h-3 w-3 rounded-full"
            style={{
              background: straggling ? "var(--jg-danger)" : "var(--jg-edge-bright)",
              border: "1px solid var(--jg-text)",
              animation: straggling ? "jg-pulse 0.7s infinite" : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}
