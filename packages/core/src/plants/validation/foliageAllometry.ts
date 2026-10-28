/** A species group of Jenkins et al. 2003 (USFS NE-GTR-319), whose equations share one fit. */
export type JenkinsGroup =
  | "cedar-larch"
  | "douglas-fir"
  | "true-fir-hemlock"
  | "pine"
  | "spruce"
  | "aspen-alder-cottonwood-willow"
  | "soft-maple-birch"
  | "mixed-hardwood"
  | "hard-maple-oak-hickory-beech";

/** The Jenkins 2003 group of a species by its scientific name: by genus, and soft maples by species. */
export function jenkinsGroupOf(scientific: string): JenkinsGroup {
  const [genus = "", epithet = ""] = scientific.split(" ");
  if (genus === "Pinus") return "pine";
  if (genus === "Picea") return "spruce";
  if (genus === "Abies" || genus === "Tsuga") return "true-fir-hemlock";
  if (genus === "Pseudotsuga") return "douglas-fir";
  if (["Thuja", "Larix", "Juniperus", "Chamaecyparis", "Sequoia", "Taxodium"].includes(genus)) return "cedar-larch";
  if (["Populus", "Salix", "Alnus"].includes(genus)) return "aspen-alder-cottonwood-willow";
  if (genus === "Betula" || (genus === "Acer" && epithet !== "saccharum" && epithet !== "nigrum")) return "soft-maple-birch";
  if (["Acer", "Quercus", "Carya", "Fagus"].includes(genus)) return "hard-maple-oak-hickory-beech";
  return "mixed-hardwood";
}

const ABOVEGROUND: Readonly<Record<JenkinsGroup, readonly [number, number]>> = {
  "cedar-larch": [-2.0336, 2.2592],
  "douglas-fir": [-2.2304, 2.4435],
  "true-fir-hemlock": [-2.5384, 2.4814],
  pine: [-2.5356, 2.4349],
  spruce: [-2.0773, 2.3323],
  "aspen-alder-cottonwood-willow": [-2.2094, 2.3867],
  "soft-maple-birch": [-1.9123, 2.3651],
  "mixed-hardwood": [-2.48, 2.4835],
  "hard-maple-oak-hickory-beech": [-2.0127, 2.4342],
};

const SOFTWOOD: ReadonlySet<JenkinsGroup> = new Set(["cedar-larch", "douglas-fir", "true-fir-hemlock", "pine", "spruce"]);

/** Aboveground dry mass, kg, of a tree of `dbhCm` in `group` (Jenkins et al. 2003, Table 4). */
export function jenkinsAbovegroundKg(group: JenkinsGroup, dbhCm: number): number {
  const [b0, b1] = ABOVEGROUND[group];
  return Math.exp(b0 + b1 * Math.log(dbhCm));
}

/** Foliage dry mass, kg, of a tree of `dbhCm` in `group`: aboveground mass times the Table 6 foliage share. */
export function jenkinsFoliageKg(group: JenkinsGroup, dbhCm: number): number {
  const share = SOFTWOOD.has(group) ? Math.exp(-2.9584 + 4.4766 / dbhCm) : Math.exp(-4.0813 + 5.8816 / dbhCm);
  return jenkinsAbovegroundKg(group, dbhCm) * share;
}
