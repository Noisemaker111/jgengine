export const MAX_ARMED_CHARGES = 2;
export const CHARGE_FUSE_SECONDS = 1.4;

export interface ChargeSlot {
  id: number;
  x: number;
  z: number;
  armedAt: number;
  fuseSeconds: number;
}

export interface ChargeBank {
  slots: readonly (ChargeSlot | null)[];
  nextId: number;
}

export function createChargeBank(): ChargeBank {
  return { slots: [null, null], nextId: 1 };
}

export function armedCount(bank: ChargeBank): number {
  return bank.slots.filter((slot) => slot !== null).length;
}

export interface ArmResult {
  bank: ChargeBank;
  slotIndex: number;
}

export function armCharge(bank: ChargeBank, x: number, z: number, now: number, fuseSeconds = CHARGE_FUSE_SECONDS): ArmResult | null {
  const slotIndex = bank.slots.findIndex((slot) => slot === null);
  if (slotIndex === -1) return null;
  const slot: ChargeSlot = { id: bank.nextId, x, z, armedAt: now, fuseSeconds };
  const slots = bank.slots.slice();
  slots[slotIndex] = slot;
  return { bank: { slots, nextId: bank.nextId + 1 }, slotIndex };
}

export function fuseProgress(slot: ChargeSlot, now: number): number {
  if (slot.fuseSeconds <= 0) return 1;
  return Math.max(0, Math.min(1, (now - slot.armedAt) / slot.fuseSeconds));
}

export function isFuseComplete(slot: ChargeSlot, now: number): boolean {
  return fuseProgress(slot, now) >= 1;
}

export function readyToAutoDetonate(bank: ChargeBank, now: number): ChargeSlot[] {
  const ready: ChargeSlot[] = [];
  for (const slot of bank.slots) {
    if (slot !== null && isFuseComplete(slot, now)) ready.push(slot);
  }
  return ready;
}

export interface DetonateResult {
  bank: ChargeBank;
  detonated: ChargeSlot[];
}

export function detonateAll(bank: ChargeBank): DetonateResult {
  const detonated = bank.slots.filter((slot): slot is ChargeSlot => slot !== null);
  if (detonated.length === 0) return { bank, detonated };
  return { bank: { slots: bank.slots.map(() => null), nextId: bank.nextId }, detonated };
}

export function detonateSlot(bank: ChargeBank, chargeId: number): DetonateResult {
  const index = bank.slots.findIndex((slot) => slot !== null && slot.id === chargeId);
  if (index === -1) return { bank, detonated: [] };
  const slot = bank.slots[index]!;
  const slots = bank.slots.slice();
  slots[index] = null;
  return { bank: { slots, nextId: bank.nextId }, detonated: [slot] };
}
