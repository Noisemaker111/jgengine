export const OBJECT_IDS = [
  "wall",
  "plate",
  "receiver",
  "gate",
  "spike",
  "exit_lumen",
  "exit_anchor",
  "emitter",
] as const;

export type ObjectId = (typeof OBJECT_IDS)[number];

/** Placement geometry for the unit-box render: sitting height + non-uniform scale. */
export interface ObjectShape {
  readonly y: number;
  readonly scale: [number, number, number];
}

export const OBJECT_SHAPES: Record<ObjectId, ObjectShape> = {
  wall: { y: 0.5, scale: [1, 1, 1] },
  plate: { y: 0.06, scale: [0.86, 0.12, 0.86] },
  receiver: { y: 0.5, scale: [0.5, 1, 0.5] },
  gate: { y: 0.7, scale: [0.96, 1.4, 0.96] },
  spike: { y: 0.16, scale: [0.82, 0.32, 0.82] },
  exit_lumen: { y: 0.04, scale: [0.96, 0.08, 0.96] },
  exit_anchor: { y: 0.04, scale: [0.96, 0.08, 0.96] },
  emitter: { y: 0.6, scale: [0.4, 1.2, 0.4] },
};

export const objectStyles: Record<ObjectId, { color: string; opacity?: number }> = {
  wall: { color: "#2b3350" },
  plate: { color: "#5a6685" },
  receiver: { color: "#4a5570" },
  gate: { color: "#e8ecff" },
  spike: { color: "#ff5468" },
  exit_lumen: { color: "#38f0ff" },
  exit_anchor: { color: "#ffb23e" },
  emitter: { color: "#3a4466" },
};

export const objectCatalog: Record<ObjectId, Record<string, never>> = OBJECT_IDS.reduce(
  (acc, id) => {
    acc[id] = {};
    return acc;
  },
  {} as Record<ObjectId, Record<string, never>>,
);
