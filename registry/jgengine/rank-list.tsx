import { HudPanel } from "@/components/ui/hud-panel";

export interface RankEntry {
  id: string;
  rank: number;
  name: string;
  value: string | number;
  highlight?: boolean;
}

function RankStar() {
  return (
    <svg viewBox="0 0 24 24" width={10} height={10} fill="var(--jg-accent)" aria-hidden>
      <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" />
    </svg>
  );
}

export function RankList({
  entries,
  title,
  width = 300,
  className,
}: {
  entries: readonly RankEntry[];
  title?: string;
  width?: number;
  className?: string;
}) {
  return (
    <div className={className} data-jg="rank-list">
      <HudPanel title={title} width={width}>
        <div className="flex flex-col">
          {entries.map((entry, index) => {
            const rankColor =
              entry.rank === 1
                ? "var(--jg-accent)"
                : entry.rank === 2 || entry.rank === 3
                  ? "var(--jg-text)"
                  : "var(--jg-text-dim)";
            return (
              <div
                key={entry.id}
                data-jg="rank-row"
                className="flex items-center gap-2 px-0.5 py-1.5"
                style={{
                  background:
                    entry.highlight === true
                      ? "color-mix(in srgb, var(--jg-accent) 10%, transparent)"
                      : index % 2 === 1
                        ? "rgba(255,255,255,0.025)"
                        : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span
                  className="flex w-[26px] shrink-0 items-center gap-[3px] font-mono text-xs font-bold"
                  style={{ color: rankColor }}
                >
                  {entry.rank === 1 && <RankStar />}
                  {entry.rank}
                </span>
                <span
                  className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs"
                  style={{ color: "var(--jg-text)" }}
                >
                  {entry.name}
                </span>
                <span
                  className="shrink-0 text-right font-mono text-xs"
                  style={{ color: "var(--jg-text)" }}
                >
                  {entry.value}
                </span>
              </div>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}
