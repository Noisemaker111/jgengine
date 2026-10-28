import type { PlantSpecies } from "../plantSpecies";
import { ACER_SACCHARUM } from "./acerSaccharum";
import { PINUS_STROBUS } from "./pinusStrobus";
import { ACER_RUBRUM } from "./acerRubrum";
import { QUERCUS_RUBRA } from "./quercusRubra";
import { BETULA_PAPYRIFERA } from "./betulaPapyrifera";
import { POPULUS_TREMULOIDES } from "./populusTremuloides";
import { PINUS_RESINOSA } from "./pinusResinosa";
import { ABIES_BALSAMEA } from "./abiesBalsamea";
import { TILIA_AMERICANA } from "./tiliaAmericana";
import { PICEA_GLAUCA } from "./piceaGlauca";

/**
 * Every species record the engine ships, registered with the grown-plant generator. Written by
 * `bun run jgengine plants write`.
 * @capability plant-grown place, scatter and preview simulation-grown plants of any species, age and style
 */
export const PLANT_LIBRARY: readonly PlantSpecies[] = [
  ACER_SACCHARUM,
  PINUS_STROBUS,
  ACER_RUBRUM,
  QUERCUS_RUBRA,
  BETULA_PAPYRIFERA,
  POPULUS_TREMULOIDES,
  PINUS_RESINOSA,
  ABIES_BALSAMEA,
  TILIA_AMERICANA,
  PICEA_GLAUCA,
];
