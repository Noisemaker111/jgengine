/**
 * Swimming in Fernwild. Anything in deep water swims at a share of its walking speed: the survivor, and any
 * mount, which floats with its rider at the surface. ARK's water-going tames instead cut through it, faster
 * than they walk: ridden in water, each of these swims at its own speed (metres a second, approximate).
 */
export const SWIMMERS: Readonly<Record<string, { speed: number }>> = {
  sarco: { speed: 10 },
  baryonyx: { speed: 11 },
  kaprosuchus: { speed: 9 },
  diplocaulus: { speed: 8 },
  beelzebufo: { speed: 7 },
};

/** The share of its walking speed anything else keeps in water. */
export const SWIM_SLOW = 0.6;

/** Water deeper than this under a mount, metres, and it swims. */
export const SWIM_DEPTH = 0.5;
