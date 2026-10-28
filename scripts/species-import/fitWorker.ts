import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import { runTrial } from "./speciesTrial";

/** A worker that grows one species trial per message, for the fit's worker pool. */
declare const self: Worker;

interface Request {
  id: number;
  species: PlantSpecies;
  seeds: string[];
  shade: boolean;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, species, seeds, shade } = event.data;
  try {
    self.postMessage({ id, trial: runTrial(species, seeds, shade) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
