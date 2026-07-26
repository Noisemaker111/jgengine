/**
 * `--look` / `--look-from` argument parsing, shared by shoot and drive.
 *
 * The aim point and the vantage are two arguments, not one comma list: the old
 * single-list form made 4- and 5-number inputs ambiguous between `x,z,dist,height`
 * and the documented `x,y,z,dist`, so a capture aimed at the wrong place and still
 * exited 0. Every malformed input throws here, at the CLI, instead of being dropped
 * silently in the browser.
 */

export interface LookAim {
  /** `[x, z]` — ground height is sampled — or `[x, y, z]` for a point in the air. */
  point: readonly number[];
  distance?: number;
  height?: number;
  angle?: number;
}

const USAGE =
  "--look takes the aim point only: x,z (ground height sampled) or x,y,z. " +
  "Distance, height, and orbit angle go in --look-from <dist[,height[,angle]]>";

function parseNumbers(flag: string, raw: string): number[] {
  const fields = raw.split(",").map((part) => part.trim());
  return fields.map((field, index) => {
    const value = Number(field);
    if (field.length === 0 || !Number.isFinite(value)) {
      throw new Error(`${flag}: field ${index + 1} of "${raw}" is not a number ("${field}")`);
    }
    return value;
  });
}

/**
 * Validate `--look` / `--look-from` into a normalized aim, or `undefined` when
 * neither was given. Throws a usage error naming the offending field — including
 * for the retired positional forms, whose message spells out the rewrite.
 */
export function parseLookAim(look: string | undefined, from: string | undefined): LookAim | undefined {
  if (look === undefined || look.length === 0) {
    if (from !== undefined && from.length > 0) throw new Error(`--look-from needs --look. ${USAGE}`);
    return undefined;
  }
  const point = parseNumbers("--look", look);
  if (point.length < 2) {
    throw new Error(`--look "${look}" has ${point.length} number(s). ${USAGE}`);
  }
  if (point.length > 3) {
    const [x, , z] = point;
    throw new Error(
      `--look "${look}" has ${point.length} numbers, which used to mean two different framings. ${USAGE} — ` +
        `here that is probably --look ${x},${z ?? 0} --look-from ${point.slice(3).join(",") || "12,5"}`,
    );
  }
  const aim: LookAim = { point };
  if (from === undefined || from.length === 0) return aim;
  const vantage = parseNumbers("--look-from", from);
  if (vantage.length > 3) {
    throw new Error(`--look-from "${from}" takes at most dist,height,angle (got ${vantage.length} numbers)`);
  }
  const [distance, height, angle] = vantage;
  if (distance !== undefined && distance <= 0) {
    throw new Error(`--look-from distance must be positive (got ${distance}) — the camera would sit on the aim point`);
  }
  return {
    ...aim,
    ...(distance === undefined ? {} : { distance }),
    ...(height === undefined ? {} : { height }),
    ...(angle === undefined ? {} : { angle }),
  };
}

/** URL params the dev runner reads for an aim — the canonical, unambiguous encoding. */
export function lookSearchParams(aim: LookAim): Record<string, string> {
  const params: Record<string, string> = { look: aim.point.join(",") };
  const vantage = [aim.distance, aim.height, aim.angle];
  if (vantage.some((value) => value !== undefined)) {
    params.lookFrom = vantage.map((value) => (value === undefined ? "" : String(value))).join(",");
  }
  return params;
}
