import { useSceneEntities } from "@jgengine/react/hooks";

import { session } from "../../session";

const SIZE = 168;
const WORLD = 96; // battlefield is 96×96 centred on the origin
const HALF = WORLD / 2;

function toMap(v: number): number {
  return ((v + HALF) / WORLD) * SIZE;
}

interface Blip {
  key: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  square?: boolean;
}

/** A live top-down radar: own forces blue, Marauders red, keeps as squares, gold seams amber.
 * Reads scene poses each frame; faction/kind come from the session roster. */
export function Minimap() {
  const entities = useSceneEntities();
  const blips: Blip[] = [];
  for (const e of entities) {
    const x = toMap(e.position[0]);
    const y = toMap(e.position[2]);
    const unit = session.units.get(e.id);
    if (unit !== undefined) {
      const building = unit.kind === "building";
      blips.push({
        key: e.id,
        x,
        y,
        r: building ? 4 : unit.catalogId === "hero" ? 3.4 : 2.4,
        fill: unit.faction === "player" ? (unit.catalogId === "hero" ? "#ffd24a" : "#5b9bff") : "#f0603f",
        square: building,
      });
    } else if (e.name === "goldmine") {
      blips.push({ key: e.id, x, y, r: 2.6, fill: "#e8c14a" });
    }
  }

  return (
    <div className="rounded-lg border border-slate-500/40 bg-slate-900/80 p-1 shadow-lg backdrop-blur-sm">
      <svg width={SIZE} height={SIZE} className="block rounded" role="img" aria-label="Battlefield minimap">
        <rect x={0} y={0} width={SIZE} height={SIZE} fill="#25401f" rx={4} />
        <rect x={0} y={0} width={SIZE} height={SIZE / 2} fill="#3a2020" opacity={0.35} />
        {blips.map((b) =>
          b.square === true ? (
            <rect key={b.key} x={b.x - b.r} y={b.y - b.r} width={b.r * 2} height={b.r * 2} fill={b.fill} stroke="#0b1220" strokeWidth={0.6} />
          ) : (
            <circle key={b.key} cx={b.x} cy={b.y} r={b.r} fill={b.fill} />
          ),
        )}
      </svg>
    </div>
  );
}
