/**
 * The cast is the engine library's rigged Microsoft Rocketbox people (MIT): real 1.7-1.85 m adults
 * with idle, walk and run clips, drawn at their own size and in their own clothes. Roles pick the
 * outfit that says who they are (uniforms for police, a suit for the kingpin) instead of tinting a
 * fantasy body.
 */
export const CAST: Record<string, string> = {
  street_runner: "human/man-casual-2",
  ped_beach: "human/woman-casual-2",
  ped_city: "human/woman-casual",
  ped_docks: "human/construction-worker",
  // The story's people: Nonna Vell at the oven, Tony Carmine at the docks, Inez Corvo at the
  // Saltworks and MegaSlice's Victor Lux in a suit downtown.
  contact_nonna: "human/nurse",
  contact_tony: "human/man-casual",
  contact_inez: "human/businesswoman",
  contact_victor: "human/businessman",
  // The Canal Wardens, on foot and in the heavy boats.
  cop_patrol: "human/police-officer",
  cop_swat: "human/police-officer-female",
};

/** Every library person the city casts, so `provision` pulls them and the credits list them. */
export const CAST_MODEL_NAMES: readonly string[] = [...new Set(Object.values(CAST))];

/** The library car traffic is drawn with (Khronos CarConcept, CC-BY 4.0: credited in the menu). */
export const CAR_MODEL_NAME = "vehicle/sports-car";
