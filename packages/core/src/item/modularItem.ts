export interface MountSlotDef {
  id: string;
  accepts: string | readonly string[];
  required?: boolean;
}

export interface ModularItemDef {
  id: string;
  baseStats: Record<string, number>;
  slots: readonly MountSlotDef[];
}

export interface PartDef {
  id: string;
  category: string;
  stats?: Record<string, number>;
  multipliers?: Record<string, number>;
}

export interface InstalledPart {
  slotId: string;
  part: PartDef;
}

export type InstallResult =
  | { status: "ok"; installed: readonly InstalledPart[] }
  | { status: "rejected"; reason: "unknown-slot" | "wrong-category" | "slot-occupied" };

export function slotById(def: ModularItemDef, slotId: string): MountSlotDef | null {
  return def.slots.find((s) => s.id === slotId) ?? null;
}

export function slotAccepts(slot: MountSlotDef, category: string): boolean {
  return typeof slot.accepts === "string" ? slot.accepts === category : slot.accepts.includes(category);
}

export function install(
  def: ModularItemDef,
  installed: readonly InstalledPart[],
  slotId: string,
  part: PartDef,
): InstallResult {
  const slot = slotById(def, slotId);
  if (slot === null) return { status: "rejected", reason: "unknown-slot" };
  if (!slotAccepts(slot, part.category)) return { status: "rejected", reason: "wrong-category" };
  if (installed.some((i) => i.slotId === slotId)) return { status: "rejected", reason: "slot-occupied" };
  return { status: "ok", installed: [...installed, { slotId, part }] };
}

export function uninstall(installed: readonly InstalledPart[], slotId: string): readonly InstalledPart[] {
  return installed.filter((i) => i.slotId !== slotId);
}

export function partInSlot(installed: readonly InstalledPart[], slotId: string): PartDef | null {
  return installed.find((i) => i.slotId === slotId)?.part ?? null;
}

export function computeEffectiveStats(def: ModularItemDef, installed: readonly InstalledPart[]): Record<string, number> {
  const stats: Record<string, number> = { ...def.baseStats };
  for (const { part } of installed) {
    if (part.stats === undefined) continue;
    for (const [key, value] of Object.entries(part.stats)) stats[key] = (stats[key] ?? 0) + value;
  }
  for (const { part } of installed) {
    if (part.multipliers === undefined) continue;
    for (const [key, factor] of Object.entries(part.multipliers)) stats[key] = (stats[key] ?? 0) * factor;
  }
  return stats;
}

export function missingRequiredSlots(def: ModularItemDef, installed: readonly InstalledPart[]): string[] {
  return def.slots.filter((s) => s.required === true && !installed.some((i) => i.slotId === s.id)).map((s) => s.id);
}

export function isComplete(def: ModularItemDef, installed: readonly InstalledPart[]): boolean {
  return missingRequiredSlots(def, installed).length === 0;
}

export interface ModularItem {
  readonly def: ModularItemDef;
  parts(): readonly InstalledPart[];
  install(slotId: string, part: PartDef): InstallResult;
  uninstall(slotId: string): readonly InstalledPart[];
  partInSlot(slotId: string): PartDef | null;
  effectiveStats(): Record<string, number>;
  missingRequired(): string[];
  isComplete(): boolean;
}

export function createModularItem(def: ModularItemDef, initial: readonly InstalledPart[] = []): ModularItem {
  let installed: readonly InstalledPart[] = initial;
  return {
    def,
    parts() {
      return installed;
    },
    install(slotId, part) {
      const result = install(def, installed, slotId, part);
      if (result.status === "ok") installed = result.installed;
      return result;
    },
    uninstall(slotId) {
      installed = uninstall(installed, slotId);
      return installed;
    },
    partInSlot(slotId) {
      return partInSlot(installed, slotId);
    },
    effectiveStats() {
      return computeEffectiveStats(def, installed);
    },
    missingRequired() {
      return missingRequiredSlots(def, installed);
    },
    isComplete() {
      return isComplete(def, installed);
    },
  };
}
