import type { ReactNode } from "react";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";

import type { MedalId } from "../../events/catalog";

const TINT: Record<MedalId, string> = { bronze: "#b8763d", silver: "#c9d0d4", gold: "#f2c230" };

/** A stamped medal: a shield cut in the medal's metal, or an empty socket when it is still to earn. */
export function MedalBadge({ medal, earned = true, size = 26 }: { medal: MedalId; earned?: boolean; size?: number }): ReactNode {
  return (
    <GameFrame
      material={earned ? "brass" : "steel"}
      cut="hex"
      depth={Math.round(size / 3.4)}
      tint={earned ? TINT[medal] : "#3a3f42"}
      edge="none"
      shadow={false}
      padding="0"
      className="fd-medal"
      data-medal={medal}
      data-earned={earned ? "" : undefined}
      aria-label={`${medal}${earned ? "" : " not earned"}`}
      style={{ width: size, height: size }}
    >
      <GameIcon name="star" size={Math.round(size * 0.62)} color={earned ? "#1b1407" : "#6c7175"} />
    </GameFrame>
  );
}

/** Bronze, silver and gold in a row, lit up to the medal held. */
export function MedalRow({ held, size = 22 }: { held: MedalId | null; size?: number }): ReactNode {
  const order: readonly MedalId[] = ["bronze", "silver", "gold"];
  const rank = held === null ? -1 : order.indexOf(held);
  return <span className="fd-medal-row">{order.map((medal, index) => <MedalBadge key={medal} medal={medal} earned={index <= rank} size={size} />)}</span>;
}
