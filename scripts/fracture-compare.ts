// `bun run perf fracture`: break a granite block with every engine fracture path and score each against the comminution laws.
import { compareFracture, formatFractureComparison } from "../packages/core/src/fracture/fractureComparison";
import { printHelpIfAsked } from "./script-help";

if (
  printHelpIfAsked("fracture-compare", {
    summary: "break a 0.5 m granite block at 0.01, 0.1 and 1 kWh/t with fractureRock, StructureGraph.toDebris and toDebrisBodies; print pieces, largest piece, t10 and the energy share into motion beside the JKMRC law",
    usage: "bun run perf fracture",
    flags: [],
    example: "bun run perf fracture",
  })
) {
  process.exit(0);
}

console.log(formatFractureComparison(compareFracture()));
