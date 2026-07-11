import { C } from "../theme";

const PIP_CELLS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 3, 6, 2, 5, 8],
};

export function Die({
  value,
  held,
  spin,
  size,
  blank,
  disabled,
  onClick,
}: {
  value: number;
  held: boolean;
  spin: number;
  size: number;
  blank: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const cells = blank ? [] : (PIP_CELLS[value] ?? []);
  const animate = spin > 0 && !held && !blank;
  const pip = Math.round(size * 0.15);
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={blank ? "Die, not yet rolled" : `Die showing ${value}${held ? ", held" : ""}`}
      style={{
        position: "relative",
        width: size,
        height: size,
        padding: size * 0.13,
        display: "grid",
        gridTemplate: "repeat(3, 1fr) / repeat(3, 1fr)",
        placeItems: "center",
        borderRadius: size * 0.2,
        border: held ? `2px solid ${C.gold}` : "2px solid #d9caa4",
        background: held
          ? "linear-gradient(180deg,#efe2c1,#ddca9f)"
          : "linear-gradient(180deg,#fbf5e6,#efe6cf)",
        boxShadow: held
          ? `0 0 0 3px rgba(233,196,106,0.28), inset 0 -${size * 0.06}px ${size * 0.1}px rgba(0,0,0,0.14)`
          : `0 ${size * 0.06}px ${size * 0.13}px rgba(0,0,0,0.4), inset 0 -${size * 0.06}px ${size * 0.1}px rgba(0,0,0,0.12)`,
        opacity: blank ? 0.42 : 1,
        transform: held ? "translateY(2px)" : "none",
        transition: "transform .12s ease, box-shadow .18s ease, background .2s ease, opacity .2s ease",
        cursor: disabled ? "default" : "pointer",
        animation: animate ? "yd-tumble .5s cubic-bezier(.2,.85,.28,1) both" : undefined,
      }}
    >
      {Array.from({ length: 9 }, (_, cell) => (
        <span
          key={cell}
          style={{
            width: pip,
            height: pip,
            borderRadius: "50%",
            background: cells.includes(cell) ? C.ink : "transparent",
            boxShadow: cells.includes(cell) ? "inset 0 1px 1px rgba(255,255,255,0.3)" : undefined,
          }}
        />
      ))}
      {held ? (
        <span
          style={{
            position: "absolute",
            bottom: -8,
            left: "50%",
            transform: "translateX(-50%)",
            font: "800 8px/1 system-ui, sans-serif",
            letterSpacing: "0.14em",
            color: C.gold,
            background: C.felt,
            padding: "2px 6px",
            borderRadius: 999,
            border: `1px solid ${C.gold}`,
            whiteSpace: "nowrap",
          }}
        >
          HELD
        </span>
      ) : null}
    </button>
  );
}
