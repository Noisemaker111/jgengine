import type { LibraryMaterial } from "../../materialLibrary";

// Facades: whole building walls with windows, one tile spanning six 3.33 m floors and six bays of
// brick (`facade/brick-*`) or ten floors of curtain-wall glass (`facade/glass-*`). Project them in
// metres (`material.scan`) so floors land where the building's storeys are.
export default { name: "facade/brick-red", title: "Red brick facade", group: "facade", source: "ambientcg-facade018a", surface: "opaque", tileMetres: 20, response: { metalness: 0, roughness: 0.82 } } satisfies LibraryMaterial;
