export interface LeafToSapwoodBand {
  low: number;
  high: number;
}

export const BAAD_LEAF_TO_SAPWOOD: Readonly<Record<"evergreen" | "deciduous", LeafToSapwoodBand>> = {
  evergreen: { low: 701, high: 7189 },
  deciduous: { low: 1787, high: 12572 },
};
