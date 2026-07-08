import { useEffect, useRef, useState } from "react";
import type { StatLevelUpEvent } from "@jgengine/core/game/events";
import { useGame } from "@jgengine/react/hooks";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export function LevelUpSplash({
  stat,
  durationMs = 1800,
  className,
}: {
  stat?: string;
  durationMs?: number;
  className?: string;
}) {
  const { events } = useGame();
  const [flash, setFlash] = useState<StatLevelUpEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = events.on("stat.levelUp", (event) => {
      if (stat !== undefined && event.stat !== stat) return;
      setFlash(event);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlash(null), durationMs);
    });
    return () => {
      unsubscribe();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [events, stat, durationMs]);
  if (flash === null) return null;
  return (
    <div
      className={className}
      data-jg="level-up-splash"
      data-levelup={flash.level}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 300,
          height: 300,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, var(--jg-accent-glow) 0%, transparent 65%)",
          animation: `jg-flash ${durationMs}ms ease-out forwards`,
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "relative",
          fontFamily: "var(--jg-font-display)",
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: "var(--jg-accent)",
          textShadow: "0 2px 8px rgba(0,0,0,0.95), 0 0 22px var(--jg-accent-glow)",
          animation: "jg-pop 0.3s ease-out",
        }}
      >
        Level Up
      </span>
      <span
        style={{
          position: "relative",
          fontFamily: "var(--jg-font-numeric)",
          fontSize: 44,
          fontWeight: 800,
          color: "var(--jg-text)",
          textShadow: HUD_TEXT_SHADOW,
        }}
      >
        {flash.level}
      </span>
    </div>
  );
}
