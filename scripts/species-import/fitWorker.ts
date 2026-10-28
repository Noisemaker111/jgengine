import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import { runHabitTrial, runTrial } from "./speciesTrial";

/** A worker that grows one species trial per message, for the fit's worker pool. */
declare const self: Worker;

interface Request {
  id: number;
  species: PlantSpecies;
  seeds: string[];
  shade: boolean;
  habit?: boolean;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, species, seeds, shade, habit } = event.data;
  try {
    self.postMessage({ id, trial: habit === true ? runHabitTrial(species, seeds) : runTrial(species, seeds, shade) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
