import { useAutoScroll } from "@jgengine/react/hooks";

import { HudPanel } from "@/components/ui/hud-panel";

export interface CombatLogLine {
  id: string;
  text: string;
  tone?: "normal" | "damage" | "heal" | "system";
}

function combatLogColor(tone: CombatLogLine["tone"]): string {
  switch (tone ?? "normal") {
    case "damage":
      return "var(--jg-danger)";
    case "heal":
      return "var(--jg-success)";
    case "system":
      return "var(--jg-accent)";
    default:
      return "var(--jg-text-dim)";
  }
}

export function CombatLogPanel({
  lines,
  title = "Combat Log",
  width = 320,
  height = 180,
  className,
}: {
  lines: readonly CombatLogLine[];
  title?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const scrollRef = useAutoScroll<HTMLDivElement>(lines.length);
  return (
    <div className={className} data-jg="combat-log-panel">
      <HudPanel title={title} width={width}>
        <div
          ref={scrollRef}
          data-jg="combat-log-scroll"
          className="flex flex-col gap-0.5 overflow-y-auto"
          style={{ height }}
        >
          {lines.map((line, index) => {
            const age = lines.length - 1 - index;
            return (
              <span
                key={line.id}
                className="font-mono text-[10.5px]"
                style={{ color: combatLogColor(line.tone), opacity: Math.max(0.45, 1 - age * 0.05) }}
              >
                {line.text}
              </span>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}
