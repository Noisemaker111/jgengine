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
import { QUERCUS_ALBA } from "./quercusAlba";
import { QUERCUS_VELUTINA } from "./quercusVelutina";
import { QUERCUS_MONTANA } from "./quercusMontana";
import { QUERCUS_MACROCARPA } from "./quercusMacrocarpa";
import { QUERCUS_COCCINEA } from "./quercusCoccinea";
import { ACER_SACCHARINUM } from "./acerSaccharinum";
import { FAGUS_GRANDIFOLIA } from "./fagusGrandifolia";
import { FRAXINUS_PENNSYLVANICA } from "./fraxinusPennsylvanica";
import { BETULA_ALLEGHANIENSIS } from "./betulaAlleghaniensis";
import { FRAXINUS_AMERICANA } from "./fraxinusAmericana";
import { FRAXINUS_NIGRA } from "./fraxinusNigra";
import { LIRIODENDRON_TULIPIFERA } from "./liriodendronTulipifera";
import { PRUNUS_SEROTINA } from "./prunusSerotina";
import { POPULUS_GRANDIDENTATA } from "./populusGrandidentata";
import { JUGLANS_NIGRA } from "./juglansNigra";
import { CARYA_OVATA } from "./caryaOvata";
import { ULMUS_AMERICANA } from "./ulmusAmericana";
import { LIQUIDAMBAR_STYRACIFLUA } from "./liquidambarStyraciflua";
import { QUERCUS_FALCATA } from "./quercusFalcata";
import { THUJA_OCCIDENTALIS } from "./thujaOccidentalis";
import { PINUS_TAEDA } from "./pinusTaeda";
import { PINUS_PALUSTRIS } from "./pinusPalustris";
import { PINUS_ECHINATA } from "./pinusEchinata";
import { PINUS_ELLIOTTII } from "./pinusElliottii";
import { PINUS_BANKSIANA } from "./pinusBanksiana";
import { PINUS_VIRGINIANA } from "./pinusVirginiana";
import { PINUS_CLAUSA } from "./pinusClausa";
import { PINUS_CONTORTA } from "./pinusContorta";
import { PICEA_MARIANA } from "./piceaMariana";
import { POPULUS_DELTOIDES } from "./populusDeltoides";
import { PICEA_SITCHENSIS } from "./piceaSitchensis";
import { PICEA_ENGELMANNII } from "./piceaEngelmannii";
import { ABIES_GRANDIS } from "./abiesGrandis";
import { ABIES_LASIOCARPA } from "./abiesLasiocarpa";
import { QUERCUS_NIGRA } from "./quercusNigra";
import { PSEUDOTSUGA_MENZIESII } from "./pseudotsugaMenziesii";
import { TSUGA_CANADENSIS } from "./tsugaCanadensis";
import { TSUGA_HETEROPHYLLA } from "./tsugaHeterophylla";
import { THUJA_PLICATA } from "./thujaPlicata";
import { LARIX_LARICINA } from "./larixLaricina";
import { LARIX_OCCIDENTALIS } from "./larixOccidentalis";
import { ROBINIA_PSEUDOACACIA } from "./robiniaPseudoacacia";
import { VACCINIUM_CORYMBOSUM } from "./vacciniumCorymbosum";
import { COCOS_NUCIFERA } from "./cocosNucifera";
import { SABAL_PALMETTO } from "./sabalPalmetto";
import { CIBOTIUM_GLAUCUM } from "./cibotiumGlaucum";
import { PTERIDIUM_AQUILINUM } from "./pteridiumAquilinum";
import { POLYSTICHUM_MUNITUM } from "./polystichumMunitum";

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
  QUERCUS_ALBA,
  QUERCUS_VELUTINA,
  QUERCUS_MONTANA,
  QUERCUS_MACROCARPA,
  QUERCUS_COCCINEA,
  ACER_SACCHARINUM,
  FAGUS_GRANDIFOLIA,
  FRAXINUS_PENNSYLVANICA,
  BETULA_ALLEGHANIENSIS,
  FRAXINUS_AMERICANA,
  FRAXINUS_NIGRA,
  LIRIODENDRON_TULIPIFERA,
  PRUNUS_SEROTINA,
  POPULUS_GRANDIDENTATA,
  JUGLANS_NIGRA,
  CARYA_OVATA,
  ULMUS_AMERICANA,
  LIQUIDAMBAR_STYRACIFLUA,
  QUERCUS_FALCATA,
  THUJA_OCCIDENTALIS,
  PINUS_TAEDA,
  PINUS_PALUSTRIS,
  PINUS_ECHINATA,
  PINUS_ELLIOTTII,
  PINUS_BANKSIANA,
  PINUS_VIRGINIANA,
  PINUS_CLAUSA,
  PINUS_CONTORTA,
  PICEA_MARIANA,
  POPULUS_DELTOIDES,
  PICEA_SITCHENSIS,
  PICEA_ENGELMANNII,
  ABIES_GRANDIS,
  ABIES_LASIOCARPA,
  QUERCUS_NIGRA,
  PSEUDOTSUGA_MENZIESII,
  TSUGA_CANADENSIS,
  TSUGA_HETEROPHYLLA,
  THUJA_PLICATA,
  LARIX_LARICINA,
  LARIX_OCCIDENTALIS,
  ROBINIA_PSEUDOACACIA,
  VACCINIUM_CORYMBOSUM,
  COCOS_NUCIFERA,
  SABAL_PALMETTO,
  CIBOTIUM_GLAUCUM,
  PTERIDIUM_AQUILINUM,
  POLYSTICHUM_MUNITUM,
];
