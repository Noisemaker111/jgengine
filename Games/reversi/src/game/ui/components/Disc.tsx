import { DARK } from "../../board";
import type { Player } from "../../board";
import { COLORS, FLIP_MS, discGradient } from "../theme";

const faceBase: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "9999px",
  backfaceVisibility: "hidden",
  boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.5), inset 0 3px 5px rgba(255,255,255,0.28), 0 4px 6px rgba(0,0,0,0.45)",
};

export function Disc({
  owner,
  isLast,
  flipDelayMs,
}: {
  owner: Player;
  isLast: boolean;
  flipDelayMs: number;
}): React.ReactElement {
  const rotate = owner === DARK ? 0 : 180;
  return (
    <div
      style={{
        width: "82%",
        height: "82%",
        position: "relative",
        transformStyle: "preserve-3d",
        transform: `rotateY(${rotate}deg)`,
        transition: `transform ${FLIP_MS}ms cubic-bezier(0.4, 0.1, 0.2, 1)`,
        transitionDelay: `${flipDelayMs}ms`,
        animation: isLast ? "reversiDrop 260ms ease-out" : undefined,
      }}
    >
      <div style={{ ...faceBase, background: discGradient(DARK), transform: "rotateY(0deg)" }} />
      <div style={{ ...faceBase, background: discGradient(2), transform: "rotateY(180deg)" }} />
      {isLast ? (
        <div
          style={{
            position: "absolute",
            inset: "34%",
            borderRadius: "9999px",
            transform: `rotateY(${rotate}deg)`,
            background: owner === DARK ? "rgba(230,200,120,0.55)" : "rgba(60,80,50,0.5)",
            boxShadow: `0 0 6px ${COLORS.brassHi}`,
          }}
        />
      ) : null}
    </div>
  );
}
