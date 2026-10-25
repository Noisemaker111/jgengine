/** Hardware and cooling units resell for this share of their catalog price. */
export const HARDWARE_RESALE_RATE = 0.6;

export function hardwareResaleValue(buyPrice: number): number {
  return Math.max(1, Math.round(buyPrice * HARDWARE_RESALE_RATE));
}
