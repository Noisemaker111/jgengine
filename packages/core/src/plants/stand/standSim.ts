import { seededRng } from "../../random/rng";
import { siteModifier, OPEN_TEMPERATE_SITE, type PlantEnvironment } from "../growth/plantEnvironment";
import { PLANT_PI, plantCos, plantExp, plantLog, plantPow, plantSin } from "../growth/plantMath";
import type { PlantSpecies } from "../species/plantSpecies";
import { crownWidthBandM, standDbhAtCm, standHeightAtM, type SpeciesReference } from "../species/speciesReference";
import { SPECIES_REFERENCE } from "../species/speciesReferenceTable";

/**
 * A forest plot of individual trees competing for light, stepped a year at a time (Tier A of the
 * plant simulator: SORTIE-style stems and crowns, Pacala et al. 1996, not grown skeletons). Each tree
 * advances along its species' dominant-tree curves (FIA site trees, Carmean) by the light it gets, so
 * a tree in full sun grows like a site tree and a suppressed one waits. Seeds fall from mature trees
 * into a seedling bank per cell, and saplings that reach breast height join the plot as trees.
 */
export interface StandOptions {
  /** Species that may grow on the plot; their order is the species index. */
  species: readonly PlantSpecies[];
  /** Plot side, metres; the plot wraps at its edges so no tree sits at a border. */
  sizeM: number;
  site?: PlantEnvironment;
  seed: string;
  /** Seeds that drift in from outside the plot, per hectare per species per year. Default 200. */
  immigrationPerHa?: number;
  /** Seeds fall and seedlings recruit; false for an even-aged plantation that only thins. Default true. */
  recruitment?: boolean;
  /** Most live trees the plot holds; recruits beyond it wait in the seedling bank. Default 20 000. */
  maxTrees?: number;
  /** Reference curves by species id; defaults to the imported table. */
  references?: Readonly<Record<string, SpeciesReference>>;
  /**
   * Strength of self-thinning, the suppression mortality that thins a crowded stand along Reineke's line: `0` no tree
   * dies of shade, `1` as measured (Kobe et al. 1995), past `1` a stand thins harder. A tree's yearly risk is
   * 1 − (1 − p)^strength, so it stays a probability and is monotone over the sane range `0..4`. Default 1.
   */
  selfThinning?: number;
}

/** One tree to plant: species index, position on the plot and its age in years (0 for a seedling at breast height). */
export interface StandPlanting {
  species: number;
  x: number;
  z: number;
  ageYears?: number;
}

/** A live tree on the plot. */
export interface StandTree {
  /** Stable id: `${seed}:${serial}` is its own growth seed. */
  serial: number;
  species: number;
  x: number;
  z: number;
  ageYears: number;
  dbhCm: number;
  heightM: number;
  crownRadiusM: number;
  /** Crown length over height. */
  crownRatio: number;
  /** Open-sky share reaching its crown this year, and its mean over its life. */
  light: number;
  meanLight: number;
}

/** Plot totals per hectare. */
export interface StandStats {
  year: number;
  /** Live trees per hectare at or above 1 cm DBH. */
  treesPerHa: number;
  /** Quadratic mean DBH, cm. */
  quadraticMeanDbhCm: number;
  /** Basal area per species, m²/ha, in species order. */
  basalAreaM2PerHa: number[];
  /** Seedlings below breast height per hectare, per species. */
  seedlingsPerHa: number[];
}

/** One tree's state in a {@link StandSnapshot}. */
export interface StandTreeState {
  serial: number;
  species: number;
  x: number;
  z: number;
  ageYears: number;
  /** Years advanced along the species' dominant-tree height and DBH curves. */
  progressYears: number;
  girthYears: number;
  crownRatio: number;
  light: number;
  lightSum: number;
}

/** A stand's whole state as JSON-safe values. */
export interface StandSnapshot {
  year: number;
  serial: number;
  rng: number;
  trees: StandTreeState[];
  bankCount: number[];
  bankProgress: number[];
}

/** A stateful forest plot: step it, read its trees, snapshot and restore it. */
export interface Stand {
  step(years?: number): void;
  year(): number;
  trees(): StandTree[];
  stats(): StandStats;
  plant(plantings: readonly StandPlanting[]): void;
  snapshot(): StandSnapshot;
  restore(snapshot: StandSnapshot): void;
  reset(): void;
  retune(site: Partial<PlantEnvironment>): void;
}

/** What a single tree of a stand would be grown from at full detail (Tier B). */
export interface StandTreeGrowth {
  species: PlantSpecies;
  env: PlantEnvironment;
  seed: string;
  ageYears: number;
}

const BREAST_HEIGHT_M = 1.3;
const CELL_M = 5;
/** Shadow cones widen by this many metres per metre of drop: sky light comes from within about 30° of the zenith. */
const CONE = 0.6;
const MAX_BANK_PER_M2 = 10;
/** Saplings a cell can send up to the tree layer in one year. */
const RECRUITS_PER_CELL = 2;

interface SpeciesModel {
  species: PlantSpecies;
  reference: SpeciesReference;
  /** Leaf area per m² of crown projection. */
  crownLai: number;
  /** Light at which growth runs at half its full-sun rate relative to the hyperbola's ceiling. */
  halfLight: number;
  backgroundMortality: number;
  breastHeightYears: number;
  dispersalM: number;
  fecundity: number;
  extinction: number;
}

function speciesModel(species: PlantSpecies, references: Readonly<Record<string, SpeciesReference>>): SpeciesModel {
  const reference = references[species.id];
  if (reference === undefined) throw new Error(`no reference curves for ${species.id}`);
  const shade = species.tolerance.shade;
  const seedMass = Math.max(0.01, species.reproduction.seedMassMg);
  return {
    species,
    reference,
    // Shade-tolerant crowns hold more leaf layers (Niinemets 2010): about 7 for sugar maple, 3.5 for aspen.
    crownLai: 3 + 4 * shade,
    // Shade-tolerant saplings keep growing at a few percent of full sun; intolerant ones need gaps
    // (Pacala et al. 1994: sugar maple's light half-saturation is about a tenth of aspen's).
    halfLight: 0.03 + 0.9 * plantPow(1 - shade, 2),
    // About 13% of trees that escape suppression live to the species' maximum age (Botkin et al. 1972
    // use 1%, but their rate also stands in for the suppression deaths counted separately here).
    backgroundMortality: 2 / species.limits.maxAgeYears,
    breastHeightYears: reference.yearsToBreastHeight,
    // Light seeds travel further (Greene & Johnson 1993): ~10 m for a 50 mg seed, ~40 m for 0.2 mg.
    dispersalM: 8 * plantPow(50 / seedMass, 0.25),
    // Seed output per m² of basal area falls with seed mass (Greene & Johnson 1994: count ∝ mass^-0.5),
    // scaled to the seedlings that establish.
    fecundity: 400 * plantPow(1 / seedMass, 0.5),
    extinction: species.growth.extinction,
  };
}

/** Growth share of the full-sun rate at `light` (a rectangular hyperbola reaching 1 in full sun). */
function lightResponse(model: SpeciesModel, light: number): number {
  const h = model.halfLight;
  return (light * (1 + h)) / (light + h);
}

/**
 * Create a forest plot. Trees advance along their species' dominant-tree curves by
 * `site × lightResponse(light)` years per year; mortality follows suppression and age; seeds fall
 * from trees past first flowering into 5 m seedling-bank cells.
 * @capability plant-stand grow a forest plot of competing trees over centuries: succession, self-thinning and each tree's light history
 */
export function createStand(options: StandOptions): Stand {
  const references = options.references ?? SPECIES_REFERENCE;
  const selfThinning = options.selfThinning ?? 1;
  if (!Number.isFinite(selfThinning) || selfThinning < 0) throw new Error(`stand selfThinning must be finite and >= 0 (got ${selfThinning})`);
  const models = options.species.map((species) => speciesModel(species, references));
  const speciesCount = models.length;
  const size = options.sizeM;
  const cells = Math.max(1, Math.round(size / CELL_M));
  const cellM = size / cells;
  const cellCount = cells * cells;
  const hectares = (size * size) / 10_000;
  const maxTrees = options.maxTrees ?? 20_000;
  const immigration = (options.immigrationPerHa ?? 200) * hectares;
  const recruitment = options.recruitment ?? true;
  const bankCap = MAX_BANK_PER_M2 * cellM * cellM;
  let site: PlantEnvironment = { ...(options.site ?? OPEN_TEMPERATE_SITE) };
  let siteRate = siteModifier(site) / siteModifier(OPEN_TEMPERATE_SITE);

  const rng = seededRng(`stand:${options.seed}`);
  let year = 0;
  let serial = 0;
  let count = 0;
  // Struct of arrays, one slot per live tree, compacted after mortality.
  const tSerial = new Uint32Array(maxTrees);
  const tSpecies = new Uint8Array(maxTrees);
  const tX = new Float64Array(maxTrees);
  const tZ = new Float64Array(maxTrees);
  const tAge = new Float64Array(maxTrees);
  /** Progress along the species' dominant-tree height and DBH curves, years. */
  const tProgress = new Float64Array(maxTrees);
  const tGirth = new Float64Array(maxTrees);
  const tDbh = new Float64Array(maxTrees);
  const tHeight = new Float64Array(maxTrees);
  const tRadius = new Float64Array(maxTrees);
  const tCrownRatio = new Float64Array(maxTrees);
  const tLeafArea = new Float64Array(maxTrees);
  const tLight = new Float64Array(maxTrees);
  const tLightSum = new Float64Array(maxTrees);
  const bankCount = new Float64Array(cellCount * speciesCount);
  const bankProgress = new Float64Array(cellCount * speciesCount);
  const groundLight = new Float64Array(cellCount);
  // Grid buckets rebuilt each year by counting sort.
  const cellStart = new Int32Array(cellCount + 1);
  const cellTrees = new Int32Array(maxTrees);
  const treeCell = new Int32Array(maxTrees);

  const wrap = (d: number): number => (d > size / 2 ? d - size : d < -size / 2 ? d + size : d);
  const cellOf = (x: number, z: number): number => {
    const cx = Math.min(cells - 1, Math.max(0, Math.floor(x / cellM)));
    const cz = Math.min(cells - 1, Math.max(0, Math.floor(z / cellM)));
    return cz * cells + cx;
  };

  function setSize(i: number): void {
    const model = models[tSpecies[i] ?? 0];
    if (model === undefined) return;
    const height = Math.max(BREAST_HEIGHT_M, standHeightAtM(model.reference, tProgress[i] ?? 0));
    const dbh = Math.max(0.5, standDbhAtCm(model.reference, tGirth[i] ?? 0));
    tHeight[i] = height;
    tDbh[i] = dbh;
    const band = crownWidthBandM(model.reference, dbh);
    tRadius[i] = band === null ? 0.1 * height : Math.max(0.3, 0.25 * (band.lowM + band.highM));
    const radius = tRadius[i] ?? 0;
    tLeafArea[i] = model.crownLai * PLANT_PI * radius * radius;
  }

  function addTree(species: number, x: number, z: number, progress: number, age: number): void {
    if (count >= maxTrees) return;
    const i = count;
    count += 1;
    tSerial[i] = serial;
    serial += 1;
    tSpecies[i] = species;
    tX[i] = ((x % size) + size) % size;
    tZ[i] = ((z % size) + size) % size;
    tAge[i] = age;
    tProgress[i] = progress;
    tGirth[i] = progress;
    tCrownRatio[i] = 0.6;
    tLight[i] = 1;
    tLightSum[i] = 0;
    setSize(i);
  }

  function buildGrid(): void {
    cellStart.fill(0);
    for (let i = 0; i < count; i += 1) {
      const c = cellOf(tX[i] ?? 0, tZ[i] ?? 0);
      treeCell[i] = c;
      cellStart[c + 1] = (cellStart[c + 1] ?? 0) + 1;
    }
    for (let c = 0; c < cellCount; c += 1) cellStart[c + 1] = (cellStart[c + 1] ?? 0) + (cellStart[c] ?? 0);
    const fill = new Int32Array(cellCount);
    for (let i = 0; i < count; i += 1) {
      const c = treeCell[i] ?? 0;
      cellTrees[(cellStart[c] ?? 0) + (fill[c] ?? 0)] = i;
      fill[c] = (fill[c] ?? 0) + 1;
    }
  }

  /**
   * Open-sky share at (x, y, z): each taller crown spreads its leaf area over a disc that widens by
   * {@link CONE} per metre below its crown centre, and the light passes Beer–Lambert through the sum.
   */
  function lightAt(x: number, y: number, z: number, self: number, reachM: number): number {
    const span = Math.min(cells, 2 * Math.ceil(reachM / cellM) + 1);
    const cx0 = Math.floor(x / cellM) - Math.floor(span / 2);
    const cz0 = Math.floor(z / cellM) - Math.floor(span / 2);
    let optical = 0;
    for (let dz = 0; dz < span; dz += 1) {
      const cz = (((cz0 + dz) % cells) + cells) % cells;
      for (let dx = 0; dx < span; dx += 1) {
        const cx = (((cx0 + dx) % cells) + cells) % cells;
        const c = cz * cells + cx;
        for (let k = cellStart[c] ?? 0, end = cellStart[c + 1] ?? 0; k < end; k += 1) {
          const j = cellTrees[k] ?? 0;
          if (j === self) continue;
          const top = tHeight[j] ?? 0;
          if (top <= y) continue;
          // Leaves fill the crown evenly from its base to its top; only the part above y shades it.
          const depth = Math.max(0.1, top * (tCrownRatio[j] ?? 0.5));
          const base = top - depth;
          const above = top - (y > base ? y : base);
          const share = above / depth;
          const radius = (tRadius[j] ?? 0) + CONE * (top - 0.5 * above - y);
          const ox = wrap((tX[j] ?? 0) - x);
          const oz = wrap((tZ[j] ?? 0) - z);
          if (ox * ox + oz * oz > radius * radius) continue;
          optical += ((models[tSpecies[j] ?? 0]?.extinction ?? 0.5) * share * (tLeafArea[j] ?? 0)) / (PLANT_PI * radius * radius);
        }
      }
    }
    return plantExp(-optical);
  }

  function computeLight(): void {
    let tallest = 0;
    let widest = 0;
    for (let i = 0; i < count; i += 1) {
      if ((tHeight[i] ?? 0) > tallest) tallest = tHeight[i] ?? 0;
      if ((tRadius[i] ?? 0) > widest) widest = tRadius[i] ?? 0;
    }
    const reach = widest + CONE * tallest;
    for (let i = 0; i < count; i += 1) {
      const height = tHeight[i] ?? 0;
      // Read at the crown midpoint, as LIGNUM reads a crown's mean light.
      const y = height * (1 - 0.5 * (tCrownRatio[i] ?? 0.5));
      tLight[i] = site.light * lightAt(tX[i] ?? 0, y, tZ[i] ?? 0, i, reach);
    }
    for (let c = 0; c < cellCount; c += 1) {
      const x = ((c % cells) + 0.5) * cellM;
      const z = (Math.floor(c / cells) + 0.5) * cellM;
      groundLight[c] = site.light * lightAt(x, 0.5, z, -1, reach);
    }
  }

  function grow(): void {
    for (let i = 0; i < count; i += 1) {
      const model = models[tSpecies[i] ?? 0];
      if (model === undefined) continue;
      const light = tLight[i] ?? 0;
      // A shaded tree keeps reaching for light and lets its stem thin out: height holds up in shade
      // far better than diameter (Oliver & Larson 1996).
      const response = lightResponse(model, light);
      tProgress[i] = (tProgress[i] ?? 0) + siteRate * Math.sqrt(response);
      tGirth[i] = (tGirth[i] ?? 0) + siteRate * response;
      tAge[i] = (tAge[i] ?? 0) + 1;
      tLightSum[i] = (tLightSum[i] ?? 0) + light;
      // A shaded crown's lower branches die back, so crown ratio follows the light it gets.
      const target = 0.15 + 0.6 * Math.min(1, light);
      tCrownRatio[i] = (tCrownRatio[i] ?? 0.6) + 0.2 * (target - (tCrownRatio[i] ?? 0.6));
      setSize(i);
    }
  }

  function mortality(): void {
    let kept = 0;
    for (let i = 0; i < count; i += 1) {
      const model = models[tSpecies[i] ?? 0];
      const response = model === undefined ? 0 : lightResponse(model, tLight[i] ?? 0);
      // Suppressed trees die as their growth stalls (Kobe et al. 1995, growth-dependent mortality).
      const shade = 0.3 * plantExp(-response / 0.12);
      const suppression = selfThinning === 1 ? shade : 1 - (1 - shade) ** selfThinning;
      const age = (tAge[i] ?? 0) / (model?.species.limits.maxAgeYears ?? 100);
      const senescence = age > 1 ? 0.1 * (age - 1) : 0;
      const p = (model?.backgroundMortality ?? 0) + suppression + senescence;
      if (rng() < p) continue;
      if (kept !== i) moveTree(i, kept);
      kept += 1;
    }
    count = kept;
  }

  function moveTree(from: number, to: number): void {
    tSerial[to] = tSerial[from] ?? 0;
    tSpecies[to] = tSpecies[from] ?? 0;
    tX[to] = tX[from] ?? 0;
    tZ[to] = tZ[from] ?? 0;
    tAge[to] = tAge[from] ?? 0;
    tProgress[to] = tProgress[from] ?? 0;
    tGirth[to] = tGirth[from] ?? 0;
    tDbh[to] = tDbh[from] ?? 0;
    tHeight[to] = tHeight[from] ?? 0;
    tRadius[to] = tRadius[from] ?? 0;
    tCrownRatio[to] = tCrownRatio[from] ?? 0;
    tLeafArea[to] = tLeafArea[from] ?? 0;
    tLight[to] = tLight[from] ?? 0;
    tLightSum[to] = tLightSum[from] ?? 0;
  }

  function addSeeds(c: number, s: number, seeds: number): void {
    const k = c * speciesCount + s;
    const before = bankCount[k] ?? 0;
    bankCount[k] = Math.min(bankCap, before + seeds);
  }

  function seedRain(): void {
    for (let i = 0; i < count; i += 1) {
      const s = tSpecies[i] ?? 0;
      const model = models[s];
      if (model === undefined || (tAge[i] ?? 0) < model.species.reproduction.firstFlowerYears) continue;
      const basalM2 = PLANT_PI * ((tDbh[i] ?? 0) / 200) ** 2;
      const seeds = model.fecundity * basalM2 * Math.min(1, 2 * (tLight[i] ?? 0));
      if (seeds <= 0) continue;
      // Four packets per tree, each thrown an exponential distance in a random direction.
      for (let packet = 0; packet < 4; packet += 1) {
        const distance = -model.dispersalM * plantLog(1 - rng() * 0.999);
        const angle = 2 * PLANT_PI * rng();
        const x = (tX[i] ?? 0) + distance * plantCos(angle);
        const z = (tZ[i] ?? 0) + distance * plantSin(angle);
        addSeeds(cellOf(((x % size) + size) % size, ((z % size) + size) % size), s, seeds / 4);
      }
    }
    for (let s = 0; s < speciesCount; s += 1) {
      for (let packet = 0; packet < 4; packet += 1) addSeeds(Math.floor(rng() * cellCount) % cellCount, s, immigration / 4);
    }
  }

  function seedlingBank(): void {
    for (let c = 0; c < cellCount; c += 1) {
      const light = groundLight[c] ?? 0;
      let room = RECRUITS_PER_CELL;
      for (let s = 0; s < speciesCount; s += 1) {
        const model = models[s];
        const k = c * speciesCount + s;
        const n = bankCount[k] ?? 0;
        if (model === undefined || n <= 0) continue;
        const response = lightResponse(model, light);
        // Seedlings die fast in deep shade; the leading ones climb towards breast height.
        const survival = 0.85 * (1 - plantExp(-response / 0.05));
        const left = n * survival;
        bankCount[k] = left < 0.5 ? 0 : left;
        bankProgress[k] = left < 0.5 ? 0 : (bankProgress[k] ?? 0) + siteRate * response;
        if ((bankProgress[k] ?? 0) < model.breastHeightYears || room <= 0 || count >= maxTrees) continue;
        const recruits = Math.min(room, Math.floor(bankCount[k] ?? 0));
        for (let r = 0; r < recruits; r += 1) {
          const x = ((c % cells) + rng()) * cellM;
          const z = (Math.floor(c / cells) + rng()) * cellM;
          addTree(s, x, z, bankProgress[k] ?? 0, bankProgress[k] ?? 0);
        }
        room -= recruits;
        bankCount[k] = (bankCount[k] ?? 0) - recruits;
        if ((bankCount[k] ?? 0) < 0.5) {
          bankCount[k] = 0;
          bankProgress[k] = 0;
        }
      }
    }
  }

  function stepYear(): void {
    buildGrid();
    computeLight();
    grow();
    mortality();
    if (recruitment) {
      seedRain();
      seedlingBank();
    }
    year += 1;
  }

  function treeAt(i: number): StandTree {
    const age = tAge[i] ?? 0;
    return {
      serial: tSerial[i] ?? 0,
      species: tSpecies[i] ?? 0,
      x: tX[i] ?? 0,
      z: tZ[i] ?? 0,
      ageYears: age,
      dbhCm: tDbh[i] ?? 0,
      heightM: tHeight[i] ?? 0,
      crownRadiusM: tRadius[i] ?? 0,
      crownRatio: tCrownRatio[i] ?? 0,
      light: tLight[i] ?? 0,
      meanLight: age > 0 ? (tLightSum[i] ?? 0) / age : tLight[i] ?? 0,
    };
  }

  function clear(): void {
    year = 0;
    serial = 0;
    count = 0;
    bankCount.fill(0);
    bankProgress.fill(0);
    rng.restore(seededRng(`stand:${options.seed}`).state());
  }

  return {
    step(years = 1) {
      for (let k = 0; k < years; k += 1) stepYear();
    },
    year: () => year,
    trees() {
      const out: StandTree[] = [];
      for (let i = 0; i < count; i += 1) out.push(treeAt(i));
      return out;
    },
    stats() {
      let trees = 0;
      let squares = 0;
      const basal = new Array<number>(speciesCount).fill(0);
      const seedlings = new Array<number>(speciesCount).fill(0);
      for (let i = 0; i < count; i += 1) {
        const dbh = tDbh[i] ?? 0;
        if (dbh < 1) continue;
        trees += 1;
        squares += dbh * dbh;
        const s = tSpecies[i] ?? 0;
        basal[s] = (basal[s] ?? 0) + (PLANT_PI * (dbh / 200) ** 2) / hectares;
      }
      for (let k = 0; k < bankCount.length; k += 1) seedlings[k % speciesCount] = (seedlings[k % speciesCount] ?? 0) + (bankCount[k] ?? 0) / hectares;
      return {
        year,
        treesPerHa: trees / hectares,
        quadraticMeanDbhCm: trees > 0 ? Math.sqrt(squares / trees) : 0,
        basalAreaM2PerHa: basal,
        seedlingsPerHa: seedlings,
      };
    },
    plant(plantings) {
      for (const planting of plantings) {
        const model = models[planting.species];
        if (model === undefined) throw new Error(`no species at index ${planting.species}`);
        const age = Math.max(model.breastHeightYears, planting.ageYears ?? model.breastHeightYears);
        addTree(planting.species, planting.x, planting.z, age, age);
      }
    },
    snapshot() {
      const trees: StandTreeState[] = [];
      for (let i = 0; i < count; i += 1) {
        trees.push({
          serial: tSerial[i] ?? 0,
          species: tSpecies[i] ?? 0,
          x: tX[i] ?? 0,
          z: tZ[i] ?? 0,
          ageYears: tAge[i] ?? 0,
          progressYears: tProgress[i] ?? 0,
          girthYears: tGirth[i] ?? 0,
          crownRatio: tCrownRatio[i] ?? 0,
          light: tLight[i] ?? 0,
          lightSum: tLightSum[i] ?? 0,
        });
      }
      return { year, serial, rng: rng.state(), trees, bankCount: Array.from(bankCount), bankProgress: Array.from(bankProgress) };
    },
    restore(snapshot) {
      year = snapshot.year;
      serial = snapshot.serial;
      rng.restore(snapshot.rng);
      count = 0;
      for (const tree of snapshot.trees) {
        if (count >= maxTrees) break;
        const i = count;
        count += 1;
        tSerial[i] = tree.serial;
        tSpecies[i] = tree.species;
        tX[i] = tree.x;
        tZ[i] = tree.z;
        tAge[i] = tree.ageYears;
        tProgress[i] = tree.progressYears;
        tGirth[i] = tree.girthYears;
        tCrownRatio[i] = tree.crownRatio;
        tLight[i] = tree.light;
        tLightSum[i] = tree.lightSum;
        setSize(i);
      }
      bankCount.set(snapshot.bankCount.slice(0, bankCount.length));
      bankProgress.set(snapshot.bankProgress.slice(0, bankProgress.length));
    },
    reset: clear,
    retune(partial) {
      site = { ...site, ...partial };
      siteRate = siteModifier(site) / siteModifier(OPEN_TEMPERATE_SITE);
    },
  };
}

/**
 * The full-detail growth inputs of one stand tree (Tier B): its species, its own seed, its age, and
 * a site whose open sky is the light it got over its life and whose spacing is its neighbours'.
 * @capability plant-stand grow a forest plot of competing trees over centuries: succession, self-thinning and each tree's light history
 */
export function standTreeGrowth(options: Pick<StandOptions, "species" | "seed" | "site">, tree: StandTree, treesPerHa: number): StandTreeGrowth {
  const species = options.species[tree.species];
  if (species === undefined) throw new Error(`no species at index ${tree.species}`);
  const spacingM = Math.sqrt(10_000 / Math.max(1, treesPerHa));
  const spacingIndex = spacingM / Math.max(BREAST_HEIGHT_M, tree.heightM);
  const base = options.site ?? OPEN_TEMPERATE_SITE;
  const env: PlantEnvironment = { ...base, light: Math.max(0.05, Math.min(1, tree.meanLight)) };
  if (spacingIndex < 1) env.stand = { spacingIndex: Math.max(0.15, spacingIndex) };
  return { species, env, seed: `${options.seed}:${tree.serial}`, ageYears: Math.round(tree.ageYears) };
}
