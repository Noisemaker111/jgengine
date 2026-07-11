import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from "react";

import { useGameContext } from "@jgengine/react/provider";

import { COURT_H } from "../rules";
import { clampPaddleY } from "../match/sim";
import { getMatch } from "../match/store";
import { render } from "./render";

export function Court() {
  const ctx = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const g = canvas.getContext("2d");
    if (g === null) return;
    const match = getMatch(ctx);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      render(g, canvas, match);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [ctx]);

  const pointerToCourtY = useCallback((clientY: number, canvas: HTMLCanvasElement): number => {
    const rect = canvas.getBoundingClientRect();
    if (rect.height === 0) return COURT_H / 2;
    return clampPaddleY(((clientY - rect.top) / rect.height) * COURT_H);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      canvas.setPointerCapture(event.pointerId);
      const match = getMatch(ctx);
      match.leftInput.dragActive = true;
      match.leftInput.dragY = pointerToCourtY(event.clientY, canvas);
    },
    [ctx, pointerToCourtY],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const match = getMatch(ctx);
      if (!match.leftInput.dragActive) return;
      const canvas = canvasRef.current;
      if (canvas === null) return;
      match.leftInput.dragY = pointerToCourtY(event.clientY, canvas);
    },
    [ctx, pointerToCourtY],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const match = getMatch(ctx);
      match.leftInput.dragActive = false;
      canvasRef.current?.releasePointerCapture?.(event.pointerId);
    },
    [ctx],
  );

  return (
    <div
      className="relative"
      style={{ width: "min(94vw, calc(84vh * (200 / 120)))", aspectRatio: "200 / 120" }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        className="block h-full w-full rounded-sm"
        style={{ touchAction: "none", background: "#04070a", cursor: "ns-resize" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-sm"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.32) 3px)",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.65), inset 0 0 12px rgba(88,255,150,0.14)",
          mixBlendMode: "multiply",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-sm"
        style={{ boxShadow: "0 0 22px rgba(88,255,150,0.18)", border: "1px solid rgba(88,255,150,0.18)" }}
      />
    </div>
  );
}
