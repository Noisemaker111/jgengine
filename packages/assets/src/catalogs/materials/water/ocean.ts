import type { LibraryMaterial } from "../../materialLibrary";

// Water: the shell's ocean/puddle shader owns ripples; these entries carry the response and the
// depth tint so a game selects water by name like any other surface.
export default { name: "water/ocean", title: "Ocean water", group: "water", surface: "water", tileMetres: 8, response: { metalness: 0.02, roughness: 0.05, alphaMode: "opaque" } } satisfies LibraryMaterial;
