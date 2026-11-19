import type { CreditsSection } from "@jgengine/core/menu/credits";

import { expandLibraryRecord, libraryCreditSections, type LibraryEntry } from "./assetLibrary";
import type { LibraryLicense } from "./libraryLicense";

/**
 * game-icons.net's folder names and the credit each artist asks for ("Icons made by {author}"), from
 * the repository's `license.txt`. Ingest refuses a folder missing here, so every icon has a named artist.
 */
export const GAMEICONS_ARTISTS: Readonly<Record<string, string>> = {
  andymeneely: "Andy Meneely",
  aussiesim: "Aussiesim",
  badges: "Delapouite",
  "carl-olsen": "Carl Olsen",
  "caro-asercion": "Caro Asercion",
  cathelineau: "Cathelineau",
  catsu: "Catsu",
  darkzaitzev: "DarkZaitzev",
  delapouite: "Delapouite",
  faithtoken: "Faithtoken",
  felbrigg: "Felbrigg",
  generalace135: "GeneralAce135",
  guard13007: "Guard13007",
  "heavenly-dog": "HeavenlyDog",
  irongamer: "Irongamer",
  "john-colburn": "John Colburn",
  "john-redman": "John Redman",
  "kier-heyl": "Kier Heyl",
  "lord-berandas": "Lord Berandas",
  lorc: "Lorc",
  lucasms: "Lucas",
  "pepijn-poolman": "Pepijn Poolman",
  "pierre-leducq": "Pierre Leducq",
  priorblue: "PriorBlue",
  quoting: "Quoting",
  rihlsul: "Rihlsul",
  sbed: "Sbed",
  seregacthtuf: "SeregaCthtuf",
  skoll: "Skoll",
  sparker: "Sparker",
  spencerdub: "SpencerDub",
  starseeker: "Starseeker",
  "various-artists": "Various artists",
  "viscious-speed": "Viscious Speed",
  willdabeast: "Willdabeast",
  zajkonur: "Zajkonur",
  zeromancer: "Zeromancer",
};

/** game-icons.net artists who release under CC0 instead of CC BY 3.0 (`license.txt`). */
export const GAMEICONS_CC0_ARTISTS: ReadonlySet<string> = new Set(["viscious-speed", "zeromancer"]);

export const GAMEICONS_PACK = "gameicons-icons";

function titleCase(name: string): string {
  return name
    .split("-")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * The library entry for a game-icons.net key (`gameicons:lorc/broadsword`) built from the key alone,
 * so a game resolves and credits its icons without loading the full library index. Throws for a key
 * that is not a game-icons.net key or names an unknown artist.
 *
 * @internal
 */
export function libraryIconEntry(key: string): LibraryEntry {
  const match = /^gameicons:([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(key);
  const folder = match?.[1];
  const name = match?.[2];
  if (folder === undefined || name === undefined) throw new Error(`not a game-icons.net library key: ${key}`);
  const author = GAMEICONS_ARTISTS[folder];
  if (author === undefined) throw new Error(`${key}: unknown game-icons.net artist folder "${folder}"`);
  const license: LibraryLicense = GAMEICONS_CC0_ARTISTS.has(folder) ? "CC0-1.0" : "CC-BY-3.0";
  return expandLibraryRecord("gameicons", {
    id: `${folder}/${name}`,
    title: titleCase(name),
    kind: "icon",
    tags: name.split("-"),
    author,
    license,
    pack: GAMEICONS_PACK,
    file: `${folder}/${name}.svg`,
  });
}

/** @capability library-icon-url resolve a game-icons.net library key to the icon a game serves */
export function libraryIconUrl(key: string, options: { basePath?: string } = {}): string {
  const entry = libraryIconEntry(key);
  return `${options.basePath ?? "/sprites"}/${GAMEICONS_PACK}/${entry.file ?? ""}`;
}

/** @capability library-icon-credits credit game-icons.net icons per artist from the keys a game ships */
export function libraryIconCredits(keys: Iterable<string>): CreditsSection[] {
  return libraryCreditSections([...new Set(keys)].map(libraryIconEntry));
}
