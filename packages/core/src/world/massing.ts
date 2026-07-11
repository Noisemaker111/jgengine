export type MassingComposition =
  | "bar"
  | "split"
  | "cluster"
  | "stack"
  | "court"
  | "bridge"
  | "ring"
  | "capsule"
  | "megastructure";

export const MASSING_COMPOSITIONS: readonly MassingComposition[] = [
  "bar",
  "split",
  "cluster",
  "stack",
  "court",
  "bridge",
  "ring",
  "capsule",
  "megastructure",
];

export type MassingProfile = "straight" | "stepped" | "tapered" | "top-heavy" | "offset" | "twisted";

export const MASSING_PROFILES: readonly MassingProfile[] = [
  "straight",
  "stepped",
  "tapered",
  "top-heavy",
  "offset",
  "twisted",
];

export type MassingSpec = {
  seed: string;
  width: number;
  height: number;
  depth: number;
  floorHeight: number;
  baySpacing: number;
  pilotis: number;
  podiumHeight: number;
  cores: number;
  terraces: number;
  cantilever: number;
  voids: number;
  taper: number;
  articulation: number;
  crown: number;
  moduleDensity: number;
  branches: number;
  composition: MassingComposition;
  profile: MassingProfile;
};

export type MassingBodyRole = "mass" | "core" | "transfer";

export type MassingBody = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  ry?: number;
  facade?: boolean;
  kind?: "box" | "capsule";
  role?: MassingBodyRole;
  branch?: boolean;
  crown?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const hashMassingSeed = (text: string): number =>
  [...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

export const massingBase = (spec: Pick<MassingSpec, "pilotis" | "height">, cap = 0.28): number =>
  Math.min(Math.max(0, spec.pilotis), Math.max(0, spec.height) * cap);

export const isVillageMassing = (
  spec: Pick<MassingSpec, "composition" | "height" | "articulation" | "moduleDensity">,
): boolean =>
  spec.composition === "cluster" && spec.height < 36 && spec.articulation > 56 && spec.moduleDensity > 2;

export function massingFloorCount(spec: Pick<MassingSpec, "pilotis" | "height" | "floorHeight">): number {
  const usable = Math.max(7, spec.height - massingBase(spec));
  return Math.max(1, Math.floor(usable / spec.floorHeight));
}

export function composeMassing(b: MassingSpec): MassingBody[] {
  if (b.composition === "ring") return [];
  const base = massingBase(b);
  const usable = Math.max(7, b.height - base);
  const floorCount = Math.max(1, Math.floor(usable / b.floorHeight));
  const articulationTierBonus =
    b.composition === "bar" || b.composition === "megastructure" ? Math.floor(b.articulation / 45) : 0;
  const requestedTiers = Math.max(
    b.terraces,
    Math.ceil(floorCount / 7) + Math.floor((b.moduleDensity - 3) / 2) + articulationTierBonus,
  );
  const tierCount = Math.round(clamp(requestedTiers, 1, Math.max(1, Math.min(9, floorCount))));
  const tierH = usable / tierCount;
  const bodies: MassingBody[] = [];
  const composition = b.composition;

  const profileAt = (i: number) => {
    const t = tierCount === 1 ? 0.5 : i / (tierCount - 1);
    const amount = b.taper / 100;
    let scaleW = 1;
    let scaleD = 1;
    let x = 0;
    let z = 0;
    let ry = 0;
    if (b.profile === "stepped") {
      scaleW = 1 - t * amount * 0.5;
      scaleD = 1 - t * amount * 0.34;
      z = -t * (b.cantilever + b.depth * 0.08);
    }
    if (b.profile === "tapered") {
      scaleW = 1 - t * amount * 0.78;
      scaleD = 1 - t * amount * 0.58;
    }
    if (b.profile === "top-heavy") {
      scaleW = 0.66 + t * (0.34 + amount * 0.42);
      scaleD = 0.76 + t * (0.24 + amount * 0.25);
    }
    if (b.profile === "offset") {
      x = (t - 0.5) * (b.cantilever * 2 + (composition === "bar" ? 0 : b.voids * 0.1));
      z = Math.sin(t * Math.PI * 2) * b.cantilever * 0.3;
      scaleW = 1 - amount * 0.12 * t;
    }
    if (b.profile === "twisted") {
      ry = (t - 0.5) * (0.16 + (composition === "megastructure" ? 0 : amount * 1.65));
      scaleW = 1 - amount * 0.18 * t;
      scaleD = 1 - amount * 0.12 * t;
    }
    x += t * b.cantilever * 0.42;
    return { t, scaleW: Math.max(0.42, scaleW), scaleD: Math.max(0.46, scaleD), x, z, ry };
  };

  if (b.podiumHeight > 0 && composition !== "bridge")
    bodies.push({
      x: 0,
      y: b.podiumHeight / 2,
      z: 0,
      w: b.width + Math.min(8, b.cantilever),
      h: b.podiumHeight,
      d: b.depth + Math.min(7, b.cantilever),
      facade: true,
    });

  if (composition === "capsule") {
    const seed = hashMassingSeed(b.seed);
    const density = (b.moduleDensity - 1) / 4;
    const desiredRows = Math.round(clamp(5 + Math.min(5, floorCount * 0.18) + density * 5, 5, 14));
    const lanes = 1 + Number(b.moduleDensity >= 3 && b.depth > 18) + Number(b.moduleDensity === 5 && b.depth > 38);
    const spines = Math.round(clamp(Math.max(b.cores, lanes), 1, 3));
    const rows = Math.min(desiredRows, Math.max(4, Math.floor(64 / (spines * 2))));
    const rowH = usable / rows;
    const coreW = clamp(b.width * 0.13, 4.5, 10);
    const coreD = clamp((b.depth / (spines + 1)) * 0.68, 4.5, 8.5);
    const laneZ = Array.from({ length: spines }, (_, lane) => (lane - (spines - 1) / 2) * Math.min(13, b.depth * 0.3));
    const structureH = base + usable;
    for (const z of laneZ) bodies.push({ x: 0, y: structureH / 2, z, w: coreW, h: structureH, d: coreD, facade: false, role: "core" });
    const basePodW = clamp(b.width * (0.22 + b.moduleDensity * 0.012) + b.cantilever * 0.3, 8, 28);
    const basePodD = clamp((b.depth / (spines + 1)) * 0.78, 4.8, 11);
    const taper = clamp(b.taper / 65, 0, 1);
    const articulation = b.articulation / 100;
    const voidBandCount = b.voids < 20 ? 0 : b.voids < 42 ? 1 : b.voids < 60 ? 2 : 3;
    const voidRows = [0.34, 0.61, 0.82].slice(0, voidBandCount).map((t) => Math.round((rows - 1) * t));
    const capsuleProfile = (row: number) => {
      const t = rows === 1 ? 0.5 : row / (rows - 1);
      const smooth = t * t * (3 - 2 * t);
      let reachScale = 1 - taper * 0.48 * smooth;
      let depthScale = 1 - taper * 0.18 * smooth;
      let driftX = t * b.cantilever * 0.08;
      let driftZ = 0;
      let turn = 0;
      if (b.profile === "stepped") {
        const band = Math.min(2, Math.floor(t * 3));
        reachScale *= 1 - band * 0.08;
        depthScale *= 1 - band * 0.05;
        driftZ -= band * (b.depth * 0.035 + b.cantilever * 0.15);
      }
      if (b.profile === "tapered") {
        reachScale *= 1 - smooth * 0.2;
        depthScale *= 1 - smooth * 0.16;
      }
      if (b.profile === "top-heavy") {
        reachScale *= 0.66 + smooth * 0.62;
        depthScale *= 0.76 + smooth * 0.3;
      }
      if (b.profile === "offset") {
        driftX += (t - 0.5) * (b.cantilever * 1.7 + b.width * (0.08 + taper * 0.12));
        driftZ = Math.sin(t * Math.PI * 2) * b.depth * 0.06;
      }
      if (b.profile === "twisted") {
        turn = (t - 0.5) * (0.55 + taper * 1.2);
        driftX += Math.sin(t * Math.PI * 2) * b.cantilever * 0.18;
      }
      return {
        t,
        reachScale: clamp(reachScale, 0.38, 1.28),
        depthScale: clamp(depthScale, 0.52, 1.18),
        driftX,
        driftZ,
        turn,
      };
    };
    for (let i = 0; i < rows; i++) {
      if (voidRows.includes(i)) continue;
      const p = capsuleProfile(i);
      const podH = Math.min(rowH * (0.62 + articulation * 0.12), b.floorHeight * 1.65);
      for (const side of [-1, 1])
        for (let lane = 0; lane < spines; lane++) {
          const rhythm = ((seed + i * 17 + lane * 11 + (side > 0 ? 3 : 0)) % 5) - 2;
          const projection = 1 + rhythm * articulation * 0.045;
          const podW = clamp(basePodW * p.reachScale * projection, 6.2, 28);
          const podD = clamp(basePodD * p.depthScale * (1 + (((rhythm + 2) % 3) - 1) * articulation * 0.035), 4.4, 11);
          const reach = coreW * 0.48 + podW * 0.44 + b.cantilever * 0.07 * (1 - p.t * 0.35);
          const x = p.driftX + side * reach;
          const z = p.driftZ + laneZ[lane] + (i % 2 ? podD * 0.12 : -podD * 0.12) + rhythm * articulation * 0.11;
          const y = base + rowH * (i + 0.5) + rhythm * rowH * articulation * 0.018;
          bodies.push({ x, y, z, w: podW, h: podH, d: podD, ry: p.turn, kind: "capsule", facade: false, role: "mass" });
          bodies.push({
            x: p.driftX + side * reach * 0.48,
            y,
            z: p.driftZ + laneZ[lane],
            w: reach * 0.94,
            h: Math.max(0.48, podH * 0.18),
            d: podD * 0.58,
            ry: p.turn,
            facade: false,
            role: "transfer",
          });
        }
    }
    const deckCount = Math.round(clamp(b.terraces, 0, 6));
    for (let deck = 0; deck < deckCount; deck++) {
      const row = Math.round(((deck + 1) / (deckCount + 1)) * (rows - 1));
      const p = capsuleProfile(row);
      bodies.push({
        x: p.driftX,
        y: base + rowH * (row + 0.12),
        z: p.driftZ,
        w: Math.max(coreW * 2.2, b.width * 0.24),
        h: 0.48,
        d: Math.max(coreD * 1.8, Math.abs(laneZ.at(-1) ?? 0) * 2 + coreD * 1.25),
        ry: p.turn,
        facade: false,
        role: "transfer",
      });
    }
    const occupiedRows = Array.from({ length: rows }, (_, i) => i).filter((i) => !voidRows.includes(i));
    for (let branch = 0; branch < b.branches; branch++) {
      const row =
        occupiedRows[Math.round(((branch + 1) / (b.branches + 1)) * Math.max(0, occupiedRows.length - 1))] ??
        Math.floor(rows / 2);
      const p = capsuleProfile(row);
      const direction = branch % 2 ? 1 : -1;
      const y = base + rowH * (row + 0.5);
      const x = p.driftX + ((branch % 3) - 1) * coreW * 0.42;
      const outerLane = Math.max(coreD * 0.5, ...laneZ.map((z) => Math.abs(z) + coreD * 0.5));
      const armReach = outerLane + 5 + b.cantilever * (0.42 + (branch % 3) * 0.08) + (branch % 2) * 1.5;
      const terminalW = clamp(basePodW * p.reachScale * (0.74 + b.moduleDensity * 0.035), 7, 22);
      const terminalD = clamp(basePodD * (0.9 + (branch % 2) * 0.08), 4.8, 10);
      bodies.push({
        x,
        y,
        z: p.driftZ + direction * armReach * 0.5,
        w: Math.max(1.1, coreW * 0.25 + b.moduleDensity * 0.14),
        h: 0.62,
        d: armReach,
        ry: p.turn,
        facade: false,
        role: "transfer",
        branch: true,
      });
      bodies.push({
        x,
        y: y + rowH * 0.08,
        z: p.driftZ + direction * (armReach + terminalD * 0.46),
        w: terminalW,
        h: Math.min(rowH * 0.82, b.floorHeight * 1.75),
        d: terminalD,
        ry: p.turn,
        kind: "capsule",
        facade: false,
        role: "mass",
        branch: true,
      });
    }
    if (b.crown > 20) {
      const crownY = base + usable - Math.max(0.45, rowH * 0.16);
      const crownReach = clamp(b.width * (0.2 + b.crown * 0.0016), 7, 20);
      bodies.push({
        x: 0,
        y: crownY,
        z: 0,
        w: crownReach * 1.35,
        h: 0.72,
        d: Math.max(coreD * 1.6, b.depth * 0.28),
        facade: false,
        role: "transfer",
        crown: true,
      });
      if (b.crown > 44)
        for (const side of [-1, 1])
          bodies.push({
            x: side * crownReach * 0.44,
            y: crownY + Math.min(rowH * 0.38, 2.4),
            z: 0,
            w: crownReach,
            h: Math.min(rowH * 0.72, b.floorHeight * 1.55),
            d: basePodD * 0.86,
            kind: "capsule",
            facade: false,
            role: "mass",
            crown: true,
          });
      if (b.crown > 76)
        for (const zSide of [-1, 1])
          bodies.push({
            x: 0,
            y: crownY + Math.min(rowH * 0.82, 4.4),
            z: zSide * basePodD * 0.55,
            w: crownReach * 0.76,
            h: Math.min(rowH * 0.64, b.floorHeight * 1.4),
            d: basePodD * 0.74,
            kind: "capsule",
            facade: false,
            role: "mass",
            crown: true,
          });
    }
    return bodies;
  }

  if (composition === "megastructure") {
    const seed = hashMassingSeed(b.seed);
    const bays = Math.round(clamp(Math.round(b.width / Math.max(10, b.baySpacing * 2.25)) + b.moduleDensity - 2, 3, 10));
    const bayW = b.width / bays;
    const levels = Math.round(clamp(tierCount + b.moduleDensity - 2, 3, 9));
    const levelH = usable / levels;
    const frameDepth = Math.max(8, b.depth * 0.68);
    const post = Math.max(0.75, Math.min(1.8, bayW * 0.085));
    const frameXs = Array.from({ length: bays + 1 }, (_, i) => -b.width / 2 + i * bayW);
    const structureH = base + usable;
    for (const x of frameXs)
      for (const z of [-frameDepth / 2, frameDepth / 2])
        bodies.push({ x, y: structureH / 2, z, w: post, h: structureH, d: post, facade: false, role: "core" });
    for (let i = 0; i <= levels; i++) {
      const y = base + Math.min(usable - 0.45, i * levelH) + 0.3;
      bodies.push({ x: 0, y, z: -frameDepth / 2, w: b.width + post, h: 0.72, d: post, facade: false, role: "transfer" });
      bodies.push({ x: 0, y, z: frameDepth / 2, w: b.width + post, h: 0.72, d: post, facade: false, role: "transfer" });
      for (let bay = 0; bay <= bays; bay += 2)
        bodies.push({ x: frameXs[bay], y, z: 0, w: post, h: 0.72, d: frameDepth + post, facade: false, role: "transfer" });
    }
    for (let level = 0; level < levels; level++)
      for (let bay = 0; bay < bays; bay++) {
        const chance = (seed + level * 37 + bay * 61) % 100;
        if (chance < clamp(b.voids * 0.72 - b.moduleDensity * 5, 8, 58)) continue;
        const p = profileAt(Math.round((level / Math.max(1, levels - 1)) * (tierCount - 1)));
        const side = (seed + level + bay) % 2 ? 1 : -1;
        const jitter = (((seed + bay * 17 + level * 13) % 9) - 4) * b.articulation * 0.0028;
        const moduleW = Math.max(4, bayW * (0.7 + b.moduleDensity * 0.035));
        const moduleH = Math.max(b.floorHeight * 1.35, levelH * (0.38 + b.articulation * 0.0022));
        const moduleD = Math.max(5, b.depth * (0.23 + b.moduleDensity * 0.025));
        const x = -b.width / 2 + bayW * (bay + 0.5) + p.x * 0.24;
        const z = side * (frameDepth * 0.23 + moduleD * 0.2 + b.cantilever * 0.1) + jitter * b.depth;
        bodies.push({
          x,
          y: base + levelH * (level + 0.5),
          z,
          w: moduleW,
          h: Math.min(levelH * 0.84, moduleH),
          d: moduleD,
          ry: p.ry,
          facade: true,
          role: "mass",
        });
        if (b.articulation > 64 && chance % 3 === 0)
          bodies.push({
            x: x + side * bayW * 0.12,
            y: base + levelH * (level + 0.72),
            z: -z * 0.76,
            w: moduleW * 0.58,
            h: moduleH * 0.48,
            d: moduleD * 0.78,
            ry: -p.ry,
            facade: true,
            role: "mass",
          });
      }
    for (let branch = 0; branch < b.branches; branch++) {
      const side = branch % 2 ? 1 : -1;
      const level = 1 + ((branch * 2 + seed) % Math.max(2, levels - 1));
      const y = base + levelH * (level + 0.42);
      const x = -b.width * 0.32 + (branch % Math.max(2, bays - 1)) * (b.width / Math.max(2, bays - 1));
      const reach = frameDepth * 0.5 + b.cantilever + 5 + (branch % 3) * 2;
      bodies.push({
        x,
        y: y - levelH * 0.13,
        z: side * reach * 0.52,
        w: Math.max(1.1, bayW * 0.7),
        h: 0.72,
        d: reach,
        facade: false,
        role: "transfer",
      });
      bodies.push({
        x,
        y,
        z: side * (reach + 2 + b.moduleDensity * 0.7),
        w: Math.max(5, bayW * 0.9),
        h: Math.max(b.floorHeight * 1.5, levelH * 0.56),
        d: Math.max(6, b.depth * 0.24),
        facade: true,
        role: "mass",
      });
    }
    return bodies;
  }

  if (isVillageMassing(b)) {
    const seed = hashMassingSeed(b.seed);
    const columns = Math.round(clamp(b.moduleDensity + Math.floor(b.articulation / 42), 4, 7));
    const rows = Math.round(clamp(Math.ceil(b.depth / 9), 2, 6));
    const cellW = b.width / columns;
    const cellD = b.depth / rows;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const chance = (seed + row * 41 + col * 29) % 100;
        if (chance < b.voids * 0.46) continue;
        const laneShift = (row % 2 ? 0.16 : -0.16) * cellW;
        const x = -b.width / 2 + cellW * (col + 0.5) + laneShift;
        const z = -b.depth / 2 + cellD * (row + 0.5);
        const variation = ((seed + row * 13 + col * 17) % 7) / 6;
        const h = clamp(b.height * (0.38 + variation * 0.48), Math.max(5, b.floorHeight * 1.6), b.height * 0.9);
        bodies.push({
          x,
          y: base + h / 2,
          z,
          w: Math.max(3.2, cellW * (0.62 + variation * 0.1)),
          h,
          d: Math.max(3.5, cellD * 0.68),
          facade: true,
          role: "mass",
        });
      }
    if (b.crown > 54)
      bodies.push({
        x: b.width * 0.18,
        y: base + b.height * 0.48,
        z: -b.depth * 0.12,
        w: Math.max(3.8, cellW * 0.7),
        h: b.height * 0.96,
        d: Math.max(4, cellD * 0.72),
        facade: true,
        role: "mass",
      });
    return bodies;
  }

  const needsSpine =
    b.cantilever > 2 ||
    b.profile === "offset" ||
    b.profile === "twisted" ||
    composition === "stack" ||
    composition === "cluster";
  if (needsSpine)
    bodies.push({
      x: 0,
      y: base + usable / 2,
      z: 0,
      w: Math.max(3.8, b.width * 0.14),
      h: usable,
      d: Math.max(4.2, b.depth * 0.22),
      facade: false,
      role: "core",
    });

  if (composition === "bridge") {
    const coreW = Math.max(3.8, b.width * (0.14 + (100 - b.voids) * 0.0011));
    const spread = Math.max(coreW * 0.7, b.width * (0.3 + b.voids * 0.0015));
    const structureH = base + usable;
    bodies.push(
      { x: -spread, y: structureH / 2, z: 0, w: coreW, h: structureH, d: b.depth * 0.72, facade: true, role: "core" },
      { x: spread, y: structureH / 2, z: 0, w: coreW, h: structureH, d: b.depth * 0.72, facade: true, role: "core" },
    );
    for (let i = 0; i < tierCount; i++) {
      const p = profileAt(i);
      const bridgeH = Math.max(b.floorHeight * 1.45, tierH * (0.26 + b.voids * 0.002));
      bodies.push({
        x: p.x,
        y: base + tierH * (i + 0.58),
        z: p.z,
        w: b.width * p.scaleW + Math.min(10, b.cantilever),
        h: bridgeH,
        d: b.depth * p.scaleD,
        ry: p.ry,
        facade: true,
      });
    }
    return bodies;
  }

  for (let i = 0; i < tierCount; i++) {
    const p = profileAt(i);
    const y = base + tierH * (i + 0.5);
    const h = tierH * 1.015;
    const plateW = b.width * p.scaleW;
    const plateD = b.depth * p.scaleD;
    if (i > 0 && (b.cantilever > 1.2 || composition === "stack" || composition === "cluster"))
      bodies.push({
        x: p.x * 0.5,
        y: base + tierH * i + 0.34,
        z: p.z * 0.5,
        w: Math.min(b.width + Math.abs(p.x), plateW + Math.abs(p.x) + 2),
        h: 0.68,
        d: Math.min(b.depth + Math.abs(p.z), plateD + Math.abs(p.z) + 1),
        ry: p.ry * 0.5,
        facade: false,
        role: "transfer",
      });
    if (composition === "split") {
      const gap = clamp(plateW * (0.08 + b.voids * 0.0042), 2, plateW * 0.48);
      const wing = Math.max(2.8, (plateW - gap) / 2);
      bodies.push(
        { x: p.x - (gap + wing) / 2, y, z: p.z, w: wing, h, d: plateD, ry: p.ry, facade: true },
        { x: p.x + (gap + wing) / 2, y, z: p.z, w: wing, h, d: plateD, ry: p.ry, facade: true },
      );
      if (i % 2 === 1 || tierCount === 1)
        bodies.push({
          x: p.x,
          y: y + h * 0.2,
          z: p.z,
          w: gap + 1.2,
          h: Math.min(h * 0.32, b.floorHeight * 1.4),
          d: plateD + Math.min(4, b.cantilever),
          ry: p.ry,
          facade: true,
        });
    } else if (composition === "cluster") {
      const moduleW = Math.max(4.2, plateW * (plateW > 32 ? 0.36 : 0.42));
      const moduleD = Math.max(4.2, plateD * 0.42);
      const drift = (i % 2 ? 1 : -1) * (b.cantilever * 0.28 + b.voids * 0.025);
      bodies.push(
        { x: p.x - plateW * 0.27 + drift, y, z: p.z - plateD * 0.25, w: moduleW, h, d: moduleD, ry: p.ry, facade: true },
        { x: p.x + plateW * 0.27 + drift, y, z: p.z + plateD * 0.25, w: moduleW, h, d: moduleD, ry: p.ry, facade: true },
      );
      if (b.moduleDensity > 3 || plateD > 21 || plateW > 34)
        bodies.push({
          x: p.x,
          y: y - h * 0.1,
          z: p.z + plateD * 0.3,
          w: moduleW * 0.72,
          h: h * 0.8,
          d: moduleD * 0.76,
          ry: p.ry,
          facade: true,
        });
      if (b.moduleDensity === 5 && plateW > 42)
        bodies.push({
          x: p.x - plateW * 0.08,
          y: y + h * 0.12,
          z: p.z - plateD * 0.34,
          w: moduleW * 0.62,
          h: h * 0.76,
          d: moduleD * 0.68,
          ry: p.ry,
          facade: true,
        });
    } else if (composition === "stack") {
      const alternate = i % 2 === 0 ? -1 : 1;
      const drift = alternate * (b.cantilever * 0.42 + b.voids * 0.035);
      bodies.push({
        x: p.x + drift,
        y,
        z: p.z - drift * 0.35,
        w: plateW * (i % 3 === 0 ? 0.92 : 1),
        h,
        d: plateD * (i % 2 === 0 ? 1 : 0.82),
        ry: p.ry,
        facade: true,
      });
      if (i % Math.max(1, 5 - b.moduleDensity) === 0)
        bodies.push({
          x: p.x - drift * 0.7,
          y,
          z: p.z + plateD * 0.28,
          w: plateW * 0.46,
          h: h * 0.72,
          d: plateD * 0.48,
          ry: p.ry,
          facade: true,
        });
    } else if (composition === "court") {
      const edge = clamp(Math.min(plateW, plateD) * (0.13 + (100 - b.voids) * 0.0013), 3.2, 7.5);
      const sideDepth = Math.max(3, plateD - edge * 2);
      bodies.push(
        { x: p.x, y, z: p.z - plateD / 2 + edge / 2, w: plateW, h, d: edge, ry: p.ry, facade: true },
        { x: p.x, y, z: p.z + plateD / 2 - edge / 2, w: plateW, h, d: edge, ry: p.ry, facade: true },
        { x: p.x - plateW / 2 + edge / 2, y, z: p.z, w: edge, h, d: sideDepth, ry: p.ry, facade: true },
        { x: p.x + plateW / 2 - edge / 2, y, z: p.z, w: edge, h, d: sideDepth, ry: p.ry, facade: true },
      );
    } else if (b.articulation > 28 && plateW > 12) {
      const pieces = Math.round(clamp(1 + Math.floor(b.articulation / 20) + Math.max(0, b.moduleDensity - 3), 2, 7));
      const gap = clamp(0.35 + b.articulation * 0.018, 0.7, 2.2);
      const pieceW = Math.max(3, (plateW - gap * (pieces - 1)) / pieces);
      for (let piece = 0; piece < pieces; piece++) {
        const variance = ((piece * 7 + i * 3) % 5) / 4;
        const pieceH = h * (0.78 + variance * 0.22);
        const pieceY = base + tierH * i + pieceH / 2;
        const x = p.x - plateW / 2 + pieceW / 2 + piece * (pieceW + gap);
        const z = p.z + (((piece + i) % 3) - 1) * b.articulation * 0.022;
        bodies.push({
          x: x + b.cantilever * 0.08,
          y: pieceY,
          z,
          w: pieceW,
          h: pieceH,
          d: plateD * (0.8 + ((piece + i) % 2) * 0.2),
          ry: p.ry,
          facade: true,
          role: "mass",
        });
      }
    } else {
      bodies.push({ x: p.x + b.cantilever * 0.08, y, z: p.z, w: plateW, h, d: plateD, ry: p.ry, facade: true, role: "mass" });
    }
  }
  if (b.branches > 0 && composition !== "court")
    for (let branch = 0; branch < b.branches; branch++) {
      const side = branch % 2 ? 1 : -1;
      const y = base + usable * (0.26 + ((branch * 29) % 55) / 100);
      const x = ((branch % 3) - 1) * b.width * 0.24;
      const reach = b.depth * 0.5 + 3 + b.cantilever + (branch % 2) * 2;
      bodies.push({
        x,
        y,
        z: side * reach * 0.52,
        w: Math.max(1.1, b.width * 0.14),
        h: 0.55,
        d: reach,
        facade: false,
        role: "transfer",
      });
      bodies.push({
        x,
        y: y + Math.max(2, b.floorHeight * 0.8),
        z: side * (reach + 2),
        w: Math.max(5, b.width * (0.16 + b.moduleDensity * 0.018)),
        h: Math.max(b.floorHeight * 1.6, usable * 0.12),
        d: Math.max(5, b.depth * 0.34),
        facade: true,
        role: "mass",
      });
    }
  return bodies;
}
