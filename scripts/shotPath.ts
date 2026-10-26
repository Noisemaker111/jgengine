// Where capture output lands. Every screenshot and its `.shot.json` sidecar goes in the checkout's
// ignored `shots/` folder: builders' shots used to pile up as untracked files in `docs/` and
// `games/<id>/docs/` (25 Oct). A picture a page links is copied into a docs folder by hand.
import { basename, isAbsolute, join, resolve, sep } from "node:path";

/** The one ignored folder captures write to. */
export function shotsDir(repoRoot: string): string {
  return resolve(repoRoot, "shots");
}

/** A drive `shot` step's file: `shots/<game>/<name>.png`. */
export function driveShotPath(dir: string, game: string, name: string): string {
  return join(dir, game, `${basename(name)}.png`);
}

/**
 * A shoot `--out`: a bare name lands in `shots/`; a path into a `docs` folder is refused, since
 * that is where untracked screenshots piled up; any other path is taken as given.
 */
export function shootOutPath(out: string, dir: string): string {
  const bare = !out.includes("/") && !out.includes("\\") && !isAbsolute(out);
  if (bare) return join(dir, /\.png$/i.test(out) ? out : `${out}.png`);
  const resolved = resolve(out);
  if (resolved.split(/[\\/]/).includes("docs")) {
    throw new Error(
      `shoot: --out ${out} writes into a docs folder; screenshots go in the ignored shots/ folder. Pass a bare name (--out ${basename(resolved)} lands in ${dir}${sep}) and copy a picture into docs by hand only when a page links it.`,
    );
  }
  return resolved;
}
