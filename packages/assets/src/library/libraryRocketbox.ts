import type { RocketboxClip } from "../catalogs/modelLibrary";
import type { LibraryRecord } from "./assetLibrary";
import { ROCKETBOX_REVISION } from "./librarySources";

/** Rocketbox's three animation folders: in place (`static`), travelling on the ground (`xy`) and in 3D (`xyz`). */
export const ROCKETBOX_CLIP_FOLDERS = {
  static: "all_animations_max_motextr_static",
  xy: "all_animations_max_motextr_xy",
  xyz: "all_animations_max_motextr_xyz",
} as const satisfies Record<RocketboxClip["folder"], string>;

const CLIP_ID = /^Animations\/(static|xy|xyz)\/([a-z0-9_-]+)$/;
const CLIP_PATH = /^Assets\/Animations\/(all_animations_max_motextr_(?:static|xy|xyz))\/([^/]+)\.max\.fbx$/i;

function folderOf(name: string): RocketboxClip["folder"] | undefined {
  if (name === "static" || name === "xy" || name === "xyz") return name;
  return undefined;
}

/**
 * The Rocketbox clip a library animation id names (`Animations/static/m_walk_neutral_01`): its FBX
 * file and folder, named by its stem so the engine's clip roles classify it. Travelling clips are
 * made in place when baked onto a character, so the game's movement carries the body.
 *
 * @internal
 */
export function rocketboxClipOf(entry: { id: string; key?: string; file?: string }): RocketboxClip {
  const match = CLIP_ID.exec(entry.id);
  const folder = folderOf(match?.[1] ?? "");
  const stem = match?.[2];
  if (folder === undefined || stem === undefined) throw new Error(`${entry.key ?? entry.id} is not a Rocketbox animation id (Animations/<static|xy|xyz>/<name>)`);
  return { name: stem, file: entry.file ?? `${stem}.max.fbx`, folder, ...(folder === "static" ? {} : { inPlace: true }) };
}

const WORDS: Readonly<Record<string, string>> = { f: "female", m: "male", gestic: "gesture", textmessage: "texting" };

/**
 * Library records for every animation FBX in a Rocketbox git tree listing (MIT, one skeleton family,
 * so each clip plays on any Rocketbox human): tagged by body (female/male), motion words and whether
 * it travels.
 *
 * @internal
 */
export function rocketboxAnimationRecords(paths: readonly string[]): LibraryRecord[] {
  const records: LibraryRecord[] = [];
  const short = Object.fromEntries(Object.entries(ROCKETBOX_CLIP_FOLDERS).map(([key, folder]) => [folder, key]));
  for (const path of [...paths].sort()) {
    const match = CLIP_PATH.exec(path);
    const folder = folderOf(short[match?.[1] ?? ""] ?? "");
    const original = match?.[2];
    if (folder === undefined || original === undefined) continue;
    const stem = original.toLowerCase().replace(/[^a-z0-9_]+/g, "-");
    const words = stem.split(/[_-]/).filter((word) => word.length > 0 && !/^\d+$/.test(word));
    const named = words.map((word) => WORDS[word] ?? word);
    const travel = folder === "static" ? "in-place" : "root-motion";
    const tags = [...new Set(["animation", "human", travel, ...named])];
    const number = /_(\d+)$/.exec(stem)?.[1];
    const title = named.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") + (number === undefined ? "" : ` ${number}`);
    records.push({
      id: `Animations/${folder}/${stem}`,
      title: folder === "static" ? title : `${title} (${folder === "xy" ? "travelling" : "3D travel"})`,
      kind: "animation",
      tags,
      rigged: true,
      ...(stem === original ? {} : { file: `${original}.max.fbx` }),
      page: `https://github.com/microsoft/Microsoft-Rocketbox/blob/${ROCKETBOX_REVISION}/${path.split("/").map(encodeURIComponent).join("/")}`,
    });
  }
  return records;
}
