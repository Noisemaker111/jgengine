import { isVillageMassing } from "@jgengine/core/world/massing";

import type { Building } from "../catalog";

export type BuildingControl =
  | "articulation"
  | "branches"
  | "crown"
  | "baySpacing"
  | "terraces"
  | "cantilever"
  | "voids"
  | "taper"
  | "balconies"
  | "rhythm"
  | "porosity"
  | "facadeDepth"
  | "vegetation";

export const isVillageCluster = (building: Building): boolean => isVillageMassing(building);

export function controlDisabledReason(building: Building, control: BuildingControl): string | undefined {
  const { composition, profile } = building;

  switch (control) {
    case "articulation":
      if (composition === "ring") return "The continuous ring has no break-apart grammar.";
      if (composition === "split" || composition === "stack" || composition === "court" || composition === "bridge") {
        return "This composition is articulated by its own void and terrace controls.";
      }
      if (composition === "cluster" && (building.height >= 36 || building.moduleDensity <= 2)) {
        return "Break apart is available for low-rise clusters at density 3 or higher.";
      }
      return undefined;
    case "branches":
      if (composition === "ring") return "A continuous ring cannot grow lateral branches.";
      if (composition === "bridge") return "The bridge already uses its full span grammar.";
      if (composition === "court") return "The inhabited perimeter does not branch.";
      if (isVillageCluster(building)) return "Village clusters grow by aggregation, not branches.";
      return undefined;
    case "crown":
      return composition === "ring" ? "The ring resolves with a fixed roof rim." : undefined;
    case "baySpacing":
      if (composition === "ring") return "Ring modules follow circumference, not structural bays.";
      return undefined;
    case "terraces":
      if (composition === "ring") return "The ring has no terrace-cut grammar.";
      if (isVillageCluster(building)) return "Village clusters use individual roofs rather than terrace cuts.";
      return undefined;
    case "cantilever":
      if (isVillageCluster(building) && building.podiumHeight <= 0) {
        return "Village clusters grow as separate pieces rather than cantilevered tiers.";
      }
      return composition === "ring" && profile !== "stepped" && profile !== "offset"
        ? "Choose a Stepped or Offset profile to cantilever the ring."
        : undefined;
    case "voids":
      return composition === "bar" ? "Choose Split to carve a true opening through a continuous bar." : undefined;
    case "taper":
      if (composition === "capsule") return undefined;
      if (isVillageCluster(building)) return "Village modules keep independent, untapered profiles.";
      if (composition === "megastructure") return "Megaframe modules follow a fixed structural bay grid.";
      if (composition === "ring") {
        return profile === "straight" || profile === "offset" || profile === "twisted"
          ? "Choose Stepped, Tapered, or Top-heavy to taper the ring."
          : undefined;
      }
      return profile === "straight" ? "Choose a growth profile other than Plumb to apply taper." : undefined;
    case "balconies":
      return composition === "ring" ? "The ring envelope has no balcony grammar." : undefined;
    case "rhythm":
      return composition === "ring" ? undefined : "This composition follows structural bays; rhythm is reserved for ring segments.";
    case "porosity":
      return undefined;
    case "facadeDepth":
      if (composition === "ring") return "The ring envelope uses a fixed radial depth.";
      if (composition === "capsule" && building.podiumHeight <= 0) return "Capsule pods use a fixed service-shell depth.";
      if (building.facade === "ribbon" && building.balconies <= 5) {
        return "Ribbon depth becomes visible when balconies are added.";
      }
      return undefined;
    case "vegetation":
      return composition === "capsule" && building.branches < 1 && building.podiumHeight <= 0
        ? "Add a branch or podium to create a place for planting."
        : undefined;
  }
}

export function controlContextNote(building: Building, control: BuildingControl): string | undefined {
  if (control === "baySpacing" && building.composition === "capsule") {
    return "Structure value; visible on the service spine in the Structure lens.";
  }
  if (control !== "porosity") return undefined;
  if (building.composition === "ring" || building.composition === "capsule") {
    return "Fixed apertures; this value still changes daylight and heat performance.";
  }
  if (building.facade !== "punched" && !isVillageCluster(building)) {
    return "Performance value; Punched facades also show the ratio directly.";
  }
  return undefined;
}
