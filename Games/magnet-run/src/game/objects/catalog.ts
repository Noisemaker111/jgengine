export const objectCatalogIds = [
  "pylon",
  "girder",
  "signal_red",
  "signal_blue",
  "caution_marker",
  "duct_pipe",
  "control_panel",
] as const;

export type DressingObjectId = (typeof objectCatalogIds)[number];

export const objectStyles: Record<DressingObjectId, { color: string; opacity?: number }> = {
  pylon: { color: "#454b56" },
  girder: { color: "#dfe6ee" },
  signal_red: { color: "#ff4b3e" },
  signal_blue: { color: "#3e7bff" },
  caution_marker: { color: "#ffd23f" },
  duct_pipe: { color: "#2b2f36" },
  control_panel: { color: "#8a6a2f" },
};

export const objectCatalog: Record<DressingObjectId, Record<string, never>> = objectCatalogIds.reduce(
  (acc, id) => {
    acc[id] = {};
    return acc;
  },
  {} as Record<DressingObjectId, Record<string, never>>,
);
