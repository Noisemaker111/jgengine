import type { StatValue } from "@jgengine/core/scene/entityStats";
import { useEntityStat } from "@jgengine/react/hooks";
import { useEffect, useRef, useState } from "react";
import { wowBarTrack } from "../wowStyles";

type BarMode = "health" | "mana";

function poolPercent(stat: StatValue): number {
  const range = stat.max - stat.min;
  if (range <= 0) return 0;
  return ((stat.current - stat.min) / range) * 100;
}

export function AnimatedResourceBar({
  instanceId,
  statId,
  mode,
  fillClassName,
  label,
  textClassName,
}: {
  instanceId: string;
  statId: string;
  mode: BarMode;
  fillClassName: string;
  label: string;
  textClassName: string;
}) {
  const stat = useEntityStat(instanceId, statId);
  const [fillPercent, setFillPercent] = useState(0);
  const [trailPercent, setTrailPercent] = useState(0);
  const [trailVisible, setTrailVisible] = useState(false);
  const prevCurrentRef = useRef<number | null>(null);
  const prevPercentRef = useRef(0);

  useEffect(() => {
    if (stat === null) return;
    const nextPercent = poolPercent(stat);
    const prevCurrent = prevCurrentRef.current;
    prevCurrentRef.current = stat.current;

    if (prevCurrent === null) {
      setFillPercent(nextPercent);
      setTrailPercent(nextPercent);
      prevPercentRef.current = nextPercent;
      return;
    }

    if (stat.current < prevCurrent) {
      const oldPercent = prevPercentRef.current;
      if (mode === "health") {
        setTrailPercent(oldPercent);
        setTrailVisible(true);
        setFillPercent(nextPercent);
        const fadeTimer = window.setTimeout(() => {
          setTrailPercent(nextPercent);
        }, 320);
        const hideTimer = window.setTimeout(() => {
          setTrailVisible(false);
        }, 720);
        return () => {
          window.clearTimeout(fadeTimer);
          window.clearTimeout(hideTimer);
        };
      }
      setFillPercent(nextPercent);
      setTrailPercent(nextPercent);
      setTrailVisible(false);
      prevPercentRef.current = nextPercent;
      return;
    }

    setFillPercent(nextPercent);
    setTrailPercent(nextPercent);
    setTrailVisible(false);
    prevPercentRef.current = nextPercent;
  }, [stat, mode]);

  if (stat === null) return null;

  return (
    <div className="relative">
      <div className={[wowBarTrack, "relative"].join(" ")}>
        {trailVisible && mode === "health" ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-red-950/75 transition-[width,opacity] duration-500 ease-out"
            style={{ width: `${trailPercent}%`, opacity: trailPercent > fillPercent ? 0.9 : 0 }}
          />
        ) : null}
        <div
          className={[
            "absolute inset-y-0 left-0 h-full",
            fillClassName,
            mode === "health" ? "transition-[width] duration-300 ease-out" : "",
          ].join(" ")}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <div
        className={[
          "pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-[11px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]",
          textClassName,
        ].join(" ")}
      >
        <span>{label}</span>
        <span>
          {Math.ceil(stat.current)} / {stat.max}
        </span>
      </div>
    </div>
  );
}