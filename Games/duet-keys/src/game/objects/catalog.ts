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

/** Fallback tint per catalog id if a GLB fails; real look comes from KayKit models. */
export const objectStyles: Record<ObjectId, { color: string; opacity?: number }> = {
  wall: { color: "#2b3350" },
  plate: { color: "#5a6685" },
  receiver: { color: "#4a5570" },
  gate: { color: "#e8ecff" },
  spike: { color: "#ff5468" },
  exit_lumen: { color: "#38f0ff" },
  exit_anchor: { color: "#ffb23e" },
  emitter: { color: "#38f0ff" },
};

export const objectCatalog: Record<ObjectId, Record<string, never>> = OBJECT_IDS.reduce(
  (acc, id) => {
    acc[id] = {};
    return acc;
  },
  {} as Record<ObjectId, Record<string, never>>,
);
