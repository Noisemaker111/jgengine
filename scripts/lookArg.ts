/**
 * `--look` / `--look-from` argument parsing, shared by shoot and drive.
 *
 * The aim point and the vantage are two arguments, not one comma list: the old
 * single-list form made 4- and 5-number inputs ambiguous between `x,z,dist,height`
 * and the documented `x,y,z,dist`, so a capture aimed at the wrong place and still
 * exited 0. Every malformed input throws here, at the CLI, instead of being dropped
 * silently in the browser.
 */

/** A named thing to aim at, resolved by the runner against the live scene. */
export interface LookSubject {
  kind: "marker" | "entity";
  id: string;
}

export interface LookAim {
  /** `[x, z]` — ground height is sampled — or `[x, y, z]` for a point in the air. */
  point?: readonly number[];
  /** `@marker:<id>` / `@entity:<id>` — the id you already have, instead of coordinates. */
  subject?: LookSubject;
  distance?: number;
  height?: number;
  angle?: number;
}

const SUBJECT_KINDS = ["marker", "entity"] as const;

const USAGE =
  "--look takes the aim subject only: x,z (ground height sampled), x,y,z, " +
  "@marker:<id>, or @entity:<id>. " +
  "Distance, height, and orbit angle go in --look-from <dist[,height[,angle]]>";

/**
 * Parse an `@kind:id` subject token. Aiming by id is the form a caller actually has —
 * `editor.scene.json` names its markers — and unlike a coordinate it stays correct when
 * the scene moves.
 */
function parseSubject(raw: string): LookSubject {
  const match = /^@([a-z]+):(.+)$/.exec(raw);
  if (match === null) {
    throw new Error(`--look "${raw}" is not a subject token — use @marker:<id> or @entity:<id>`);
  }
  const [, kind, id] = match;
  if (!SUBJECT_KINDS.includes(kind as (typeof SUBJECT_KINDS)[number])) {
    throw new Error(`--look "${raw}": unknown subject kind "${kind}" — use ${SUBJECT_KINDS.map((k) => `@${k}:`).join(" or ")}`);
  }
  if (id!.trim().length === 0) throw new Error(`--look "${raw}" has an empty id`);
  return { kind: kind as LookSubject["kind"], id: id!.trim() };
}

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
export function parseLookAim(
  look: string | undefined,
  from: string | undefined,
  opts: { withNamedView?: boolean } = {},
): LookAim | undefined {
  if (look === undefined || look.length === 0) {
    if (from === undefined || from.length === 0) return undefined;
    // A `--view` supplies the aim, so a bare vantage is a legal override of the view's own.
    if (opts.withNamedView === true) return parseVantage(from);
    throw new Error(`--look-from needs --look. ${USAGE}`);
  }
  if (look.startsWith("@")) return { subject: parseSubject(look), ...parseVantage(from) };
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
  return { point, ...parseVantage(from) };
}

function parseVantage(from: string | undefined): Omit<LookAim, "point" | "subject"> {
  if (from === undefined || from.length === 0) return {};
  const vantage = parseNumbers("--look-from", from);
  if (vantage.length > 3) {
    throw new Error(`--look-from "${from}" takes at most dist,height,angle (got ${vantage.length} numbers)`);
  }
  const [distance, height, angle] = vantage;
  if (distance !== undefined && distance <= 0) {
    throw new Error(`--look-from distance must be positive (got ${distance}) — the camera would sit on the aim point`);
  }
  return {
    ...(distance === undefined ? {} : { distance }),
    ...(height === undefined ? {} : { height }),
    ...(angle === undefined ? {} : { angle }),
  };
}

/** URL params the dev runner reads for an aim — the canonical, unambiguous encoding. */
export function lookSearchParams(aim: LookAim): Record<string, string> {
  const look = aim.subject !== undefined ? `@${aim.subject.kind}:${aim.subject.id}` : (aim.point ?? []).join(",");
  const params: Record<string, string> = look.length === 0 ? {} : { look };
  const vantage = [aim.distance, aim.height, aim.angle];
  if (vantage.some((value) => value !== undefined)) {
    params.lookFrom = vantage.map((value) => (value === undefined ? "" : String(value))).join(",");
  }
  return params;
}
