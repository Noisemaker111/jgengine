import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { cellKey } from "../../peg/logic";
import type { PegSnapshot } from "../../peg/store";
import { boardStyle, holeStyle, hintRingStyle, landingStyle, pegStyle } from "../theme";

interface DownState {
  readonly from: { r: number; c: number };
  readonly sx: number;
  readonly sy: number;
  readonly hasPeg: boolean;
}

const CELL_INSET = { hole: "16%", peg: "13%", landing: "22%", hint: "7%" } as const;

function cellWrapStyle(r: number, c: number, cellPct: number, inset: string): CSSProperties {
  return {
    position: "absolute",
    width: `${cellPct}%`,
    height: `${cellPct}%`,
    transform: `translate(${c * 100}%, ${r * 100}%)`,
    padding: inset,
  };
}

export function Board({
  snapshot,
  onPick,
}: {
  snapshot: PegSnapshot;
  onPick: (r: number, c: number) => void;
}) {
  const { size, holes, pegs, capturing, landings, movable, hint, nudge, hopping, selected } = snapshot;
  const cellPct = 100 / size;

  const gridRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const downRef = useRef<DownState | null>(null);
  const draggingRef = useRef(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  const movableSet = useMemo(() => new Set(movable), [movable]);
  const pegAt = (r: number, c: number) => pegs.some((p) => p.r === r && p.c === c);
  const selectedKey = selected === null ? null : cellKey(selected.r, selected.c);

  function cellFromPoint(clientX: number, clientY: number): { r: number; c: number } | null {
    const el = gridRef.current;
    if (el === null) return null;
    const rect = el.getBoundingClientRect();
    const lx = (clientX - rect.left) / rect.width;
    const ly = (clientY - rect.top) / rect.height;
    if (lx < 0 || lx >= 1 || ly < 0 || ly >= 1) return null;
    return { r: Math.floor(ly * size), c: Math.floor(lx * size) };
  }

  useEffect(() => {
    function move(e: PointerEvent): void {
      const d = downRef.current;
      if (d === null || !d.hasPeg) return;
      if (!draggingRef.current && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
      draggingRef.current = true;
      setGhost({ x: e.clientX, y: e.clientY });
    }
    function up(e: PointerEvent): void {
      const d = downRef.current;
      if (d !== null && draggingRef.current) {
        const target = cellFromPoint(e.clientX, e.clientY);
        if (target !== null && (target.r !== d.from.r || target.c !== d.from.c)) {
          onPickRef.current(target.r, target.c);
        }
      }
      downRef.current = null;
      draggingRef.current = false;
      setGhost(null);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  function onPointerDown(r: number, c: number, e: ReactPointerEvent): void {
    e.preventDefault();
    onPick(r, c);
    downRef.current = { from: { r, c }, sx: e.clientX, sy: e.clientY, hasPeg: pegAt(r, c) };
    draggingRef.current = false;
  }

  return (
    <div className="relative select-none p-[5%]" style={boardStyle()}>
      <div className="relative h-full w-full" ref={gridRef} style={{ containerType: "inline-size" }}>
      {/* holes */}
      {holes.map((hole) => (
        <div key={`slot-${hole.r}-${hole.c}`} style={cellWrapStyle(hole.r, hole.c, cellPct, CELL_INSET.hole)}>
          <div className="h-full w-full" style={holeStyle()} />
        </div>
      ))}

      {/* legal landings for the selected peg */}
      {landings.map((cell) => (
        <div
          key={`land-${cell.r}-${cell.c}`}
          className="pointer-events-none"
          style={cellWrapStyle(cell.r, cell.c, cellPct, CELL_INSET.landing)}
        >
          <div className="h-full w-full" style={landingStyle()} />
        </div>
      ))}

      {/* hint path */}
      {hint !== null
        ? [hint.from, hint.over, hint.to].map((cell, i) => (
            <div
              key={`hint-${i}`}
              className="pointer-events-none"
              style={cellWrapStyle(cell.r, cell.c, cellPct, CELL_INSET.hint)}
            >
              <div className="h-full w-full" style={hintRingStyle()} />
            </div>
          ))
        : null}

      {/* pegs (stable id keys so a moved peg slides) */}
      {pegs.map((peg) => {
        const key = cellKey(peg.r, peg.c);
        const isSelected = selectedKey === key;
        const isMover = movableSet.has(key);
        const isDragSource = ghost !== null && downRef.current?.from.r === peg.r && downRef.current?.from.c === peg.c;
        return (
          <div
            key={`peg-${peg.id}`}
            className="pointer-events-none"
            style={{
              position: "absolute",
              width: `${cellPct}%`,
              height: `${cellPct}%`,
              transform: `translate(${peg.c * 100}%, ${peg.r * 100}%)`,
              transition: "transform 240ms cubic-bezier(0.34, 0.72, 0.3, 1)",
              zIndex: isSelected ? 3 : 2,
            }}
          >
            <div className="h-full w-full" style={{ padding: CELL_INSET.peg }}>
              <div
                className="h-full w-full"
                style={{ animation: hopping === peg.id ? "peg-hop 240ms ease" : undefined }}
              >
                <div
                  className="h-full w-full"
                  style={{ animation: nudge === key ? "peg-nudge 360ms ease" : undefined }}
                >
                  <div
                    className="h-full w-full"
                    style={{ ...pegStyle(isSelected, isMover), opacity: isDragSource ? 0.4 : 1 }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* captured pegs popping out */}
      {capturing.map((cap) => (
        <div
          key={`cap-${cap.id}`}
          className="pointer-events-none"
          style={{ ...cellWrapStyle(cap.r, cap.c, cellPct, CELL_INSET.peg), zIndex: 4 }}
        >
          <div className="h-full w-full" style={{ ...pegStyle(false, false), animation: "peg-pop 300ms ease forwards" }} />
        </div>
      ))}

      {/* transparent hit layer — taps and drag starts */}
      {holes.map((hole) => (
        <button
          key={`hit-${hole.r}-${hole.c}`}
          type="button"
          aria-label={`Hole ${hole.r},${hole.c}`}
          onPointerDown={(e) => onPointerDown(hole.r, hole.c, e)}
          className="absolute cursor-pointer bg-transparent"
          style={{
            width: `${cellPct}%`,
            height: `${cellPct}%`,
            transform: `translate(${hole.c * 100}%, ${hole.r * 100}%)`,
            touchAction: "none",
            zIndex: 5,
          }}
        />
      ))}

      {ghost !== null ? (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: "clamp(2rem, 8vmin, 3.4rem)",
            height: "clamp(2rem, 8vmin, 3.4rem)",
            transform: "translate(-50%, -55%)",
            ...pegStyle(true, false),
          }}
        />
      ) : null}
      </div>
    </div>
  );
}
