import type { GrassLook } from "../../grass/grassKind";
import { dailyTemperatureC, solarDay } from "../growth/phenology";
import { OPEN_TEMPERATE_SITE, siteModifier, type PlantEnvironment } from "../growth/plantEnvironment";
import { plantExp, plantPow } from "../growth/plantMath";
import type { GroundCoverSpecies } from "./groundCoverSpecies";

/**
 * Ground cover as a field of tillers: every cell holds, per species, its tillers per m² (grass tillers,
 * herb rosettes or moss shoots), the height of its leaf canopy, the share flowering and their stem
 * height. A week at a time tillers make leaves on thermal time, make daughters while light reaches
 * their base (site filling, cut off by a closing canopy), thin to the size/density line, flower after
 * winter cold and long days, set seed, and spread by rhizomes, stolons or seed into neighbouring cells.
 * Grass tillers die when they seed; herb rosettes live on. Moss fills the ground the sward leaves bare
 * on the light that passes its leaves. Mowing, trampling and grazing act on it, so a lawn, a flowering
 * meadow, a worn path and a mossy shaded lawn all come out of the same field.
 */
export interface TillerFieldOptions {
  species: readonly GroundCoverSpecies[];
  cols: number;
  rows: number;
  /** Cell side, metres. Default 0.5. */
  cellM?: number;
  site?: PlantEnvironment;
  /** Starting share of each species' tillers in every cell; defaults to an even mix. */
  sown?: readonly number[];
}

/** A rectangle of cells: its first column and row and its size in cells (1 × 1 when absent). */
export interface CellArea {
  col: number;
  row: number;
  cols?: number;
  rows?: number;
}

/** One species in one cell. */
export interface TillerCohort {
  tillersPerM2: number;
  /** 0..1: tillers against the most the cohort's leaf height allows, the share of ground it holds. */
  cover: number;
  leafHeightM: number;
  /** Share of tillers on flowering stems, and the stems' height. */
  floweringShare: number;
  stemHeightM: number;
  /** The flowering stems have headed and show flowers. */
  inFlower: boolean;
  /** The season's seed has ripened and the flowering tillers died. */
  seeded: boolean;
}

/** One cell: its cohorts in species order, plus totals. */
export interface TillerCell {
  cohorts: TillerCohort[];
  /** Tillers of every species summed; a moss's many small shoots dwarf a grass's count, so compare `cover`. */
  tillersPerM2: number;
  /** Tallest of the leaf canopy and any flowering stems, metres. */
  heightM: number;
  /** Open-sky share reaching the cell. */
  light: number;
  /** 0..1 soil compaction from trampling. */
  compaction: number;
}

/** A tiller field's whole state as JSON-safe values. */
export interface TillerFieldSnapshot {
  week: number;
  coldWeeks: number;
  values: number[];
  light: number[];
  compaction: number[];
}

/** A stateful grass field: step it by weeks, act on it, read it, snapshot and restore it. */
export interface TillerField {
  step(weeks?: number): void;
  /** Weeks since the field started on 1 January. */
  week(): number;
  dayOfYear(): number;
  /** Cut every cohort's leaves and stems in the area down to `heightM`; flowering stems cut below their head die. */
  mow(area: CellArea, heightM: number): void;
  /** Feet over the area this week, 0..1 (1 is a busy path): kills tillers, flattens leaves, packs the soil. */
  trample(area: CellArea, intensity: number): void;
  /** Animals eat `share` of the leaf height over the area, flowering stems too. */
  graze(area: CellArea, share: number): void;
  /** Open-sky share reaching the ground over the area, from trees or buildings above. */
  setLight(area: CellArea, light: number): void;
  cell(col: number, row: number): TillerCell;
  snapshot(): TillerFieldSnapshot;
  restore(snapshot: TillerFieldSnapshot): void;
  reset(): void;
  retune(site: Partial<PlantEnvironment>): void;
}

/** Values per cohort: tillers, leaf height, flowering share, stem height, thermal time since flowering began, phase. */
/** Narrowest blade the look draws: a moss shoot with its spreading leaves is about this wide. */
const MIN_BLADE_WIDTH_M = 0.004;
const STRIDE = 6;
const TILLERS = 0;
const LEAF = 1;
const SHARE = 2;
const STEM = 3;
const FLOWER_TT = 4;
const PHASE = 5;
const VEGETATIVE = 0;
const FLOWERING = 1;
const DONE = 2;
/** The flowering stems were cut, broken or eaten before seed ripened. */
const CUT = 3;
/** Thermal time from a flowering stem's start to heading, and to ripe seed (°C·d above base). */
const HEADING_TT = 450;
const SEED_TT = 900;
const START_LEAF_M = 0.08;
/** Tiller deaths per new leaf in deep shade, scaled by how far light falls short of the species' tolerance. */
const SHADE_DEATH = 0.15;
/** A tiller's youngest leaf: the shortest a sward gets cut, eaten or worn down to. */
const MIN_LEAF_M = 0.01;
/** How much longer each successive leaf is than the last while the sheath tube lengthens. */
const LEAF_STEP = 0.3;

function weekTemperatureC(site: PlantEnvironment, week: number): number {
  const day = ((week * 7) % 364) + 4;
  return dailyTemperatureC(site, day);
}

/** Most tillers per m² at a leaf height (Matthew et al. 1995: tiller size ∝ density^-3/2), levelling off in a close-cut turf. */
function maxTillers(species: GroundCoverSpecies, leafM: number): number {
  return species.densityConstant * plantPow(Math.max(0.03, leafM), -2 / 3);
}

/**
 * Create a grass field of tiller cohorts, sown on 1 January with every species' tillers at a short,
 * half-full sward.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export function createTillerField(options: TillerFieldOptions): TillerField {
  const { species, cols, rows } = options;
  const speciesCount = species.length;
  const cellCount = cols * rows;
  const values = new Float64Array(cellCount * speciesCount * STRIDE);
  const inflow = new Float64Array(cellCount * speciesCount);
  const ceilings = new Float64Array(cellCount * speciesCount);
  const light = new Float64Array(cellCount);
  const compaction = new Float64Array(cellCount);
  let site: PlantEnvironment = { ...(options.site ?? OPEN_TEMPERATE_SITE) };
  let siteRate = siteModifier(site) / siteModifier(OPEN_TEMPERATE_SITE);
  let week = 0;
  let coldWeeks = 0;

  function sow(): void {
    week = 0;
    coldWeeks = 0;
    light.fill(1);
    compaction.fill(0);
    values.fill(0);
    const total = (options.sown ?? species.map(() => 1)).reduce((a, b) => a + b, 0) || 1;
    for (let c = 0; c < cellCount; c += 1) {
      species.forEach((grass, s) => {
        const base = (c * speciesCount + s) * STRIDE;
        const share = (options.sown?.[s] ?? 1) / total;
        values[base + TILLERS] = 0.5 * share * maxTillers(grass, START_LEAF_M);
        values[base + LEAF] = START_LEAF_M;
      });
    }
  }

  function eachCell(area: CellArea, visit: (c: number) => void): void {
    const c0 = Math.max(0, area.col);
    const r0 = Math.max(0, area.row);
    const c1 = Math.min(cols, area.col + (area.cols ?? 1));
    const r1 = Math.min(rows, area.row + (area.rows ?? 1));
    for (let r = r0; r < r1; r += 1) for (let c = c0; c < c1; c += 1) visit(r * cols + c);
  }

  /** Take a cohort's flowering stems: cut below the head, broken or eaten. A grass tiller dies with its head. */
  function behead(base: number, kind: GroundCoverSpecies | undefined): void {
    if ((values[base + PHASE] ?? 0) !== FLOWERING) return;
    if (kind?.habit === "graminoid") values[base + TILLERS] = (values[base + TILLERS] ?? 0) * (1 - (values[base + SHARE] ?? 0));
    values[base + SHARE] = 0;
    values[base + STEM] = 0;
    values[base + PHASE] = CUT;
  }

  function stepWeek(): void {
    const day = ((week * 7) % 364) + 4;
    if (day < 7) {
      // A new year: every cohort may flower again.
      for (let k = 0; k < cellCount * speciesCount; k += 1) values[k * STRIDE + PHASE] = VEGETATIVE;
    }
    const temperature = weekTemperatureC(site, week);
    const daylength = solarDay(site.latitude, day).daylengthH;
    if (temperature < 5) coldWeeks += 1;
    else if (day > 200) coldWeeks = 0;
    inflow.fill(0);
    for (let c = 0; c < cellCount; c += 1) {
      const lit = light[c] ?? 1;
      const packed = compaction[c] ?? 0;
      // Leaf area above the tiller bases sets how much red light reaches them (Evers et al. 2007).
      let cellLai = 0;
      let swardLai = 0;
      let swardCover = 0;
      for (let s = 0; s < speciesCount; s += 1) {
        const grass = species[s];
        if (grass === undefined) continue;
        const base = (c * speciesCount + s) * STRIDE;
        const lai = (values[base + TILLERS] ?? 0) * grass.liveLeaves * (values[base + LEAF] ?? 0) * grass.leafWidthM * 0.5;
        cellLai += lai;
        if (grass.habit === "moss") continue;
        swardLai += lai;
        swardCover += (values[base + TILLERS] ?? 0) / maxTillers(grass, values[base + LEAF] ?? 0);
      }
      // A moss mat lies under the sward: it gets the light the sward's leaves pass and the ground they leave bare.
      const underSward = lit * plantExp(-0.5 * swardLai);
      const bareGround = 1 - 0.9 * Math.min(1, swardCover);
      const redFarRed = plantExp(-0.5 * cellLai);
      const tilleringLight = Math.min(1, Math.max(0, (redFarRed - 0.3) / 0.7));
      for (let s = 0; s < speciesCount; s += 1) {
        const grass = species[s];
        if (grass === undefined) continue;
        const base = (c * speciesCount + s) * STRIDE;
        const moss = grass.habit === "moss";
        const groundLight = moss ? underSward : lit;
        let tillers = values[base + TILLERS] ?? 0;
        let leaf = values[base + LEAF] ?? 0;
        const thermal = 7 * Math.max(0, temperature - grass.baseTemperatureC) * siteRate;
        const leaves = thermal / grass.phyllochronCd;
        if (thermal > 0) {
          // Each new leaf grows out of the sheath tube of the last, so it is a fixed step longer: a cut
          // sward regrows from its cut height, not straight back to full length (Davies 1988).
          const reach = grass.maxLeafLengthM * siteRate;
          if (leaf < reach) leaf = Math.min(reach, leaf * plantPow(1 + LEAF_STEP, leaves));
          const shaded = Math.min(1, groundLight / grass.shadeTolerance);
          const tillering = moss ? bareGround : tilleringLight * (1 - packed);
          tillers += tillers * grass.siteFilling * leaves * tillering * shaded;
          // Below its shade tolerance a tiller cannot pay for its leaves and dies back.
          tillers *= plantExp(-SHADE_DEATH * leaves * (1 - shaded));
        } else if (temperature < 0) {
          // Frost browns the leaf tips back.
          leaf = Math.max(MIN_LEAF_M, leaf * 0.97);
        }
        // Shade lowers the size/density line: under a closed canopy the sward thins.
        const shade = Math.min(1, groundLight / grass.shadeTolerance);
        const ceiling = maxTillers(grass, leaf) * shade * (moss ? bareGround : 1);
        ceilings[c * speciesCount + s] = ceiling;
        if (tillers > ceiling) tillers -= (tillers - ceiling) * 0.25;
        const phase = values[base + PHASE] ?? 0;
        const vernalized = coldWeeks >= grass.vernalizationWeeks;
        if (phase === VEGETATIVE && thermal > 0 && day < 200 && daylength >= grass.criticalDaylengthH && vernalized) {
          values[base + PHASE] = FLOWERING;
          values[base + SHARE] = grass.reproductiveShare;
          values[base + STEM] = leaf;
          values[base + FLOWER_TT] = 0;
        } else if (phase === FLOWERING) {
          const flowerTt = (values[base + FLOWER_TT] ?? 0) + thermal;
          values[base + FLOWER_TT] = flowerTt;
          const stem = values[base + STEM] ?? 0;
          values[base + STEM] = stem + (grass.culmHeightM * siteRate - stem) * (1 - plantExp(-thermal / 250));
          if (flowerTt >= SEED_TT) {
            // Seed ripens and a grass's flowering tillers die; seed lands in the cell and its neighbours.
            const seeding = tillers * (values[base + SHARE] ?? 0);
            if (grass.habit === "graminoid") tillers -= seeding;
            spread(c, s, seeding * grass.seedEstablishment, true);
            values[base + SHARE] = 0;
            values[base + PHASE] = DONE;
          }
        }
        if (grass.rhizomeRate > 0 && leaves > 0) spread(c, s, tillers * grass.rhizomeRate * leaves, false);
        values[base + TILLERS] = tillers;
        values[base + LEAF] = leaf;
      }
      compaction[c] = packed * 0.96;
    }
    // Rhizomes and seed arrive after every cell has stepped, so the result never depends on cell order.
    for (let k = 0; k < cellCount * speciesCount; k += 1) {
      const add = inflow[k] ?? 0;
      if (add <= 0) continue;
      const base = k * STRIDE;
      // New tillers root only where the cell's own light and bare ground would let them grow.
      const room = (ceilings[k] ?? 0) - (values[base + TILLERS] ?? 0);
      if (room > 0) values[base + TILLERS] = (values[base + TILLERS] ?? 0) + Math.min(room, add);
    }
    week += 1;
  }

  /** New tillers per m² that root in each of cell c's four neighbours, and in c itself when `home`. */
  function spread(c: number, s: number, amount: number, home: boolean): void {
    if (amount <= 0) return;
    const col = c % cols;
    const row = Math.floor(c / cols);
    const targets = [col > 0 ? c - 1 : -1, col < cols - 1 ? c + 1 : -1, row > 0 ? c - cols : -1, row < rows - 1 ? c + cols : -1, home ? c : -1];
    for (const n of targets) if (n >= 0) inflow[n * speciesCount + s] = (inflow[n * speciesCount + s] ?? 0) + amount;
  }

  sow();

  return {
    step(weeks = 1) {
      for (let k = 0; k < weeks; k += 1) stepWeek();
    },
    week: () => week,
    dayOfYear: () => ((week * 7) % 364) + 4,
    mow(area, heightM) {
      eachCell(area, (c) => {
        for (let s = 0; s < speciesCount; s += 1) {
          const base = (c * speciesCount + s) * STRIDE;
          values[base + LEAF] = Math.max(MIN_LEAF_M, Math.min(values[base + LEAF] ?? 0, heightM));
          if ((values[base + STEM] ?? 0) > heightM) behead(base, species[s]);
        }
      });
    },
    trample(area, intensity) {
      const hit = Math.min(1, Math.max(0, intensity));
      eachCell(area, (c) => {
        for (let s = 0; s < speciesCount; s += 1) {
          const base = (c * speciesCount + s) * STRIDE;
          values[base + TILLERS] = (values[base + TILLERS] ?? 0) * (1 - 0.3 * hit);
          values[base + LEAF] = Math.max(MIN_LEAF_M, (values[base + LEAF] ?? 0) * (1 - 0.4 * hit));
          if (hit > 0.5) behead(base, species[s]);
        }
        compaction[c] = Math.min(1, (compaction[c] ?? 0) + 0.2 * hit);
      });
    },
    graze(area, share) {
      const bite = Math.min(1, Math.max(0, share));
      eachCell(area, (c) => {
        for (let s = 0; s < speciesCount; s += 1) {
          const base = (c * speciesCount + s) * STRIDE;
          values[base + LEAF] = Math.max(MIN_LEAF_M, (values[base + LEAF] ?? 0) * (1 - bite));
          if (bite > 0.3) behead(base, species[s]);
        }
      });
    },
    setLight(area, open) {
      eachCell(area, (c) => {
        light[c] = Math.min(1, Math.max(0, open));
      });
    },
    cell(col, row) {
      const c = row * cols + col;
      const cohorts: TillerCohort[] = [];
      let tillers = 0;
      let height = 0;
      for (let s = 0; s < speciesCount; s += 1) {
        const base = (c * speciesCount + s) * STRIDE;
        const phase = values[base + PHASE] ?? 0;
        const stem = phase === FLOWERING ? values[base + STEM] ?? 0 : 0;
        const kind = species[s];
        const cohort: TillerCohort = {
          tillersPerM2: values[base + TILLERS] ?? 0,
          cover: kind === undefined ? 0 : Math.min(1, (values[base + TILLERS] ?? 0) / maxTillers(kind, values[base + LEAF] ?? 0)),
          leafHeightM: values[base + LEAF] ?? 0,
          floweringShare: phase === FLOWERING ? values[base + SHARE] ?? 0 : 0,
          stemHeightM: stem,
          inFlower: phase === FLOWERING && (values[base + FLOWER_TT] ?? 0) >= HEADING_TT,
          seeded: phase === DONE,
        };
        cohorts.push(cohort);
        tillers += cohort.tillersPerM2;
        if (cohort.tillersPerM2 > 1) height = Math.max(height, cohort.leafHeightM, stem);
      }
      return { cohorts, tillersPerM2: tillers, heightM: height, light: light[c] ?? 1, compaction: compaction[c] ?? 0 };
    },
    snapshot() {
      return { week, coldWeeks, values: Array.from(values), light: Array.from(light), compaction: Array.from(compaction) };
    },
    restore(snapshot) {
      week = snapshot.week;
      coldWeeks = snapshot.coldWeeks;
      values.set(snapshot.values.slice(0, values.length));
      light.set(snapshot.light.slice(0, light.length));
      compaction.set(snapshot.compaction.slice(0, compaction.length));
    },
    reset: sow,
    retune(partial) {
      site = { ...site, ...partial };
      siteRate = siteModifier(site) / siteModifier(OPEN_TEMPERATE_SITE);
    },
  };
}

/**
 * The look of one ground-cover cell for the `grass/` renderer: density from each cohort's cover, blade
 * height and width from the species holding the most ground (the next drawn at its own height and
 * width), colours from the species holding the most ground and the
 * next, flowers in the colours of the two species most in flower (herbs before grasses), gold once a
 * grass has seeded and through autumn. Every other field keeps `base`.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export function tillerCellLook(field: TillerField, species: readonly GroundCoverSpecies[], col: number, row: number, base: GrassLook): GrassLook {
  const cell = field.cell(col, row);
  const cohorts = cell.cohorts;
  const lead = ranked(cohorts.map((c) => c.cover));
  // A herb's petals show over grass heads, so any herb in flower outranks the grasses.
  const bloom = ranked(cohorts.map((c, s) => (c.inFlower ? c.cover * c.floweringShare + (species[s]?.habit === "forb" ? 1 : 0) : 0)));
  const grass = species[lead[0]];
  const cohort = cohorts[lead[0]];
  if (grass === undefined || cohort === undefined) return base;
  let fullness = 0;
  let flowering = 0;
  let seeded = 0;
  for (const c of cohorts) fullness += c.cover;
  cohorts.forEach((c, s) => {
    const share = fullness > 0 ? c.cover / fullness : 0;
    if (c.inFlower) flowering += share * c.floweringShare;
    if (c.seeded && species[s]?.habit === "graminoid") seeded += share;
  });
  const day = field.dayOfYear();
  const autumn = day > 260 ? Math.min(1, (day - 260) / 60) : day < 90 ? 1 : 0;
  const second = species[lead[1]];
  const leadHeight = cohortHeight(cohort);
  const leadWidth = Math.max(MIN_BLADE_WIDTH_M, grass.leafWidthM * 1.5);
  const secondShare = second !== undefined && fullness > 0 ? (cohorts[lead[1]]?.cover ?? 0) / fullness : 0;
  const bloomFirst = (bloom[0] >= 0 ? species[bloom[0]] : undefined) ?? grass;
  const bloomSecond = (bloom[1] >= 0 && (cohorts[bloom[1]]?.inFlower ?? false) ? species[bloom[1]] : undefined) ?? bloomFirst;
  return {
    ...base,
    blade: {
      ...base.blade,
      density: Math.min(1, fullness),
      bladeHeight: leadHeight,
      heightVariation: Math.min(0.8, 0.1 + 0.6 * (cohort.leafHeightM / grass.maxLeafLengthM)),
      bladeWidth: leadWidth,
    },
    colour: { ...base.colour, baseColor: grass.colors.leaf, tipColor: grass.colors.tip },
    season: { ...base.season, season: autumn > 0 ? 0.5 + 0.5 * autumn : 0.5 * Math.min(1, seeded * 2) },
    species: {
      ...base.species,
      mixHeight: second === undefined ? base.species.mixHeight : Math.min(30, Math.max(0.1, cohortHeight(cohorts[lead[1]]) / leadHeight)),
      mixWidth: second === undefined ? base.species.mixWidth : Math.max(MIN_BLADE_WIDTH_M, second.leafWidthM * 1.5) / leadWidth,
      mixShare: secondShare,
      mixColor: second?.colors.tip ?? grass.colors.tip,
    },
    flowers: {
      ...base.flowers,
      flowerShare: Math.min(1, flowering),
      flowerColor: bloomFirst.colors.flower,
      flowerColor2: bloomSecond.colors.flower,
    },
    growth: { ...base.growth, groundCover: Math.min(1, 0.2 + fullness) },
  };
}

/** Height of a cohort's leaves, or its flowering stems while it has them. */
function cohortHeight(cohort: TillerCohort | undefined): number {
  return Math.max(0.01, cohort?.leafHeightM ?? 0, cohort?.stemHeightM ?? 0);
}

/** Indices of the largest and second-largest values (-1 when there is none). */
function ranked(values: readonly number[]): [number, number] {
  let first = -1;
  let second = -1;
  values.forEach((value, i) => {
    if (first < 0 || value > (values[first] ?? 0)) {
      second = first;
      first = i;
    } else if (second < 0 || value > (values[second] ?? 0)) second = i;
  });
  return [first, second];
}
