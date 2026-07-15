const gamePackages = import.meta.glob("../../../../Games/*/package.json");

export const GAME_CATEGORIES = [
  "Action & Arcade",
  "Puzzle",
  "Strategy & Tactics",
  "Sandbox & Simulation",
  "Others",
] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number];

export type GameCredit = {
  name: string;
  label: string;
  handle: string;
  href: string;
  avatar: string;
  source?: { name: string; href: string };
};

export type Game = {
  id: string;
  title: string;
  href: string;
  tagline: string;
  description: string;
  genre: string;
  category: GameCategory;
  controls: string;
  hue: string;
  credit?: GameCredit;
  platforms?: readonly ("web" | "mobile")[];
};

type GameDetails = Omit<Game, "id" | "title" | "href"> & { title?: string };

const GAME_DETAILS: Record<string, GameDetails> = {
  "the-robots": {
    title: "The Robots",
    tagline: "Salvage a bazillion procedurally-forged guns from a dead machine-world.",
    description:
      "A first-person looter-shooter on the scrap-world of Ferralon. Reactivate one of three rogue Reclaimer units — the brawler GUNK, the warden NYX, or the ghost CIPHER, each with a three-branch skill tree — and fight the derelict foundries' war-frames across the wastes to the Colossus. Every gun is procedurally forged (foundry, rarity, element), shields recharge, rounds burn, shock, and corrode, and going down opens a Reboot Window: land a kill for a Power Surge or pay the Rebuild terminal its cut.",
    genre: "First-person looter-shooter",
    category: "Action & Arcade",
    controls: "WASD · mouse fire · R reload · E interact · G grenade · Q heal · K skills · 1-4 weapons",
    hue: "#ff9a00",
  },
  claudecraft: {
    title: "World of ClaudeCraft",
    tagline: "A classic-era MMORPG, ported whole onto the engine.",
    description:
      "Levy Street's WoW-Classic-style MMO reborn as an engine game. Pick one of nine classes, quest through Eastbrook Vale, Mirefen Marsh, and Thornpeak Heights, tab-target your way through wolves, cultists, and murlocs, and follow the Gravecaller storyline down into the Hollow Crypt to face Morthen.",
    genre: "Classic MMORPG",
    category: "Action & Arcade",
    controls: "WASD · Tab target · 1-6 abilities · T attack · E talk · B bags",
    hue: "#f59e0b",
    credit: {
      name: "Levy Street",
      label: "Ported from",
      handle: "levy-street",
      href: "https://github.com/levy-street",
      avatar: "https://unavatar.io/github/levy-street",
      source: {
        name: "world-of-claudecraft",
        href: "https://github.com/levy-street/world-of-claudecraft",
      },
    },
  },
  loopline: {
    title: "Loopline",
    tagline: "Lay the track, price the tickets, keep the crowds grinning.",
    description:
      "A 3D park-builder management tycoon. Lay coaster track piece by piece, drop rides, food stalls, and scenery onto an open plot, then set ticket prices and keep hundreds of guests fed, thrilled, and spending. Revenue funds upkeep and restocks; rising park rating unlocks bigger attractions — let the cash run dry and the gates close for good.",
    genre: "Management tycoon",
    category: "Sandbox & Simulation",
    controls: "Drag/edge-scroll pan · click build · 1-6 quick tools · X cancel · P pause",
    hue: "#33b1c9",
  },
  starhome: {
    title: "Starhome",
    tagline: "Direct a household of alien beings — no fail state, just life.",
    description:
      "An open-ended alien life sim. Guide a household of procedurally shaped beings — each with its own body plan of limbs, size, and form — as they chase hunger, rest, bonds, and play. Furnish the habitat, send them to careers, watch relationships bloom into lifelong bonds, and let free-will behavior play out across a day-night cycle. No fail state, just emergent lives.",
    genre: "Life-sim sandbox",
    category: "Sandbox & Simulation",
    controls: "Drag to pan · click a being to select · 1–6 furnish · Space pause · T speed",
    hue: "#c9a6e0",
  },
  "spire-cards": {
    tagline: "Draft a deck, out-turn escalating enemies.",
    description:
      "A deckbuilder roguelike run of five encounters. Spend three energy a turn on attack, skill, and power cards, play around the enemy's telegraphed move, and pick a new card after every victory to shape the deck.",
    genre: "Deckbuilder roguelike",
    category: "Strategy & Tactics",
    controls: "Click cards · F end turn",
    hue: "#fb7185",
  },
  "tower-guard": {
    tagline: "Hold the keep through six waves of raiders.",
    description:
      "A tower defense stand along a winding mountain road. Spend gold on archer posts, cannon redoubts, and frost spires at the choke points, then upgrade the line to keep six escalating raider waves off your keep.",
    genre: "Tower defense",
    category: "Strategy & Tactics",
    controls: "Click to place · 1–3 pick tower",
    hue: "#c084fc",
  },
  "vice-isle": {
    tagline: "Steal it, drive it, shake the heat.",
    description:
      "An open-world crime sandbox on a cel-shaded resort island. Boost cars off Ocean Drive, run an eight-mission chain for Marco — dock shootouts, a street race, a car heist, and the Palm Heights kingpin — while pursuit cruisers ram you at three stars, day rolls into neon night, and every dollar feeds Ammu-Isle or the Sunset Motors showroom.",
    genre: "Open-world action",
    category: "Action & Arcade",
    controls: "WASD move/drive · Mouse fire · E enter/talk · F exit car · G grenade · Q medkit · 1-4 weapons",
    hue: "#f2599b",
    credit: {
      name: "Rockstar Games & Gearbox",
      label: "Homage to",
      handle: "rockstargames",
      href: "https://www.rockstargames.com/VI",
      avatar: "https://unavatar.io/x/rockstargames",
      source: { name: "Grand Theft Auto × Borderlands", href: "https://www.rockstargames.com/VI" },
    },
  },
  wreckway: {
    tagline: "Bolt on parts, outrun the compactor eating the yard.",
    description:
      "Drive a scrap kart down a junkyard corridor with a car compactor grinding up the road behind you in scheduled speed surges. Scavenge part pickups on the fly to swap engine, tire, plow, and armor upgrades mid-run — armor buys one crush-proof rebound, and lane-gated checkpoints reward a well-built kart.",
    genre: "Compactor-chase driving",
    category: "Action & Arcade",
    controls: "↑/W throttle · ↓/S brake · ←/→ steer · Space hop · Shift plow brace · R restart",
    hue: "#16a34a",
  },
};

const FALLBACK_DETAILS: GameDetails = {
  tagline: "Built by an agent with the JGengine skills.",
  description: "A game built from the JGengine skills — playable right here in the browser.",
  genre: "JGengine game",
  category: "Others",
  controls: "See in-game HUD",
  hue: "#34d399",
};

const titleCase = (id: string) =>
  id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const GAMES: Game[] = Object.keys(gamePackages)
  .map((path) => {
    const id = path.split("/").at(-2) ?? path;
    const details = GAME_DETAILS[id] ?? FALLBACK_DETAILS;
    return {
      id,
      href: `/games/${id}`,
      ...details,
      title: details.title ?? titleCase(id),
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export const GAMES_BY_CATEGORY: { category: GameCategory; games: Game[] }[] = GAME_CATEGORIES.map(
  (category) => ({ category, games: GAMES.filter((game) => game.category === category) }),
).filter((section) => section.games.length > 0);
