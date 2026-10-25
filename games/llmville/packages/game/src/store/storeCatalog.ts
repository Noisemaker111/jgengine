/**
 * Store-facing catalog for labels, descriptions, and display tags.
 * Simulation stats live in catalogs/racks / rackCoolingCatalog / catalogs/hardware.
 */

import { HARDWARE_CATALOG } from "@llmville/game/infrastructure/catalog";
import { RACK_CATALOG } from "@llmville/game/infrastructure/catalog";
import { RACK_COOLING_CATALOG } from "@llmville/game/infrastructure/catalog";
import { DECOR_CATALOG } from "@llmville/game/store/decorCatalog";

export interface StoreCatalogItem {
  id: string;
  label: string;
  description: string;
  price: number;
  tags: readonly string[];
  stats?: Record<string, string | number>;
}

export const STORE_CATALOG = {
  infrastructure: RACK_CATALOG.map((rack) => ({
    id: rack.id,
    label: rack.label,
    description: rack.description,
    price: rack.buyPrice,
    tags: ["rack", `${rack.slotCapacity}-gpu`, ...rack.allowedCoolantTypes.map((t) => `${t}-cooled`)] as const,
    stats: { slots: rack.slotCapacity, passiveKw: rack.passiveCoolingKw },
  })),

  decor: DECOR_CATALOG,

  hardware: HARDWARE_CATALOG.map((hw) => ({
    id: hw.id,
    label: hw.name,
    description: `${hw.vendor} ${hw.category} accelerator. ${hw.vramGb} GB VRAM. ${hw.trainingPowerFp16} TF FP16. ${hw.tdpWatts}W TDP.`,
    price: hw.buyPrice,
    tags: [
      "gpu",
      hw.vendor.toLowerCase(),
      hw.category,
      hw.kind,
      `${hw.vramGb}gb`,
    ],
    stats: {
      vram: `${hw.vramGb} GB`,
      power: `${hw.tdpWatts} W`,
      speed: `${hw.trainingPowerFp16} TF`,
    },
  })),

  cooling: RACK_COOLING_CATALOG.map((unit) => ({
    id: unit.id,
    label: unit.name,
    description: unit.description,
    price: unit.buyPrice,
    tags: ["cooling", "rack", unit.coolantType],
    stats: {
      capacityKw: unit.capacityKw,
      overheadKw: unit.powerOverheadKw,
      ...(unit.waterConsumption > 0 ? { water: unit.waterConsumption } : {}),
    },
  })),

  operator: [] as const,
} as const;

export type StoreSection = keyof typeof STORE_CATALOG;
export type StoreCatalogSectionItems<S extends StoreSection> = (typeof STORE_CATALOG)[S];
