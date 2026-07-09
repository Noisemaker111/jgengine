const gamePackages = import.meta.glob("../../../../Games/*/package.json");

export type Game = {
  id: string;
  title: string;
  href: string;
  tagline: string;
  description: string;
  genre: string;
  controls: string;
  hue: string;
};

type GameDetails = Omit<Game, "id" | "title" | "href"> & { title?: string };

const GAME_DETAILS: Record<string, GameDetails> = {
  annals: {
    tagline: "Watch a kingdom's history write itself.",
    description:
      "Time-scrub through generations as caravans, rulers, and settlements rise and fall — click to possess and follow any caravan.",
    genre: "Generative history sim",
    controls: "Click caravan · Space pause · F speed",
    hue: "#facc15",
  },
  "commit-canopy": {
    tagline: "Your GitHub contributions, grown into a forest.",
    description:
      "Enter any GitHub username to render their yearly contribution graph as a 3D canopy of rising bars you can orbit and inspect.",
    genre: "3D data-viz toy",
    controls: "Type username · Drag orbit · Scroll zoom",
    hue: "#4ade80",
  },
  "grid-tactics": {
    tagline: "Command a squad across a deadly grid.",
    description:
      "Move and attack in turns on a tile grid, positioning your roster to defeat waves of enemies before they overrun you.",
    genre: "Turn-based tactics",
    controls: "Click tile · Enter end turn · Esc cancel",
    hue: "#38bdf8",
  },
  "loot-shooter": {
    tagline: "Gun down drones, grab their loot.",
    description:
      "Mow down waves of drone enemies in first-person, looting the weapons and gear they drop to build up your kit.",
    genre: "First-person shooter",
    controls: "WASD · Mouse aim · Click fire · Shift sprint",
    hue: "#f87171",
  },
  "mine-drop": {
    tagline: "Minesweeper you walk through in 3D.",
    description:
      "Walk a first-person grid of tiles, revealing safe ones and flagging bombs with classic minesweeper number logic in a physical space.",
    genre: "First-person minesweeper",
    controls: "WASD · Space jump · Q flag · R restart",
    hue: "#94a3b8",
  },
  "slingshot-siege": {
    tagline: "Pull back, let fly, topple the fortress.",
    description:
      "Drag back a slingshot to aim a projectile arc and launch it at stacked wood-and-stone structures to knock down enemy dummies.",
    genre: "Physics catapult puzzle",
    controls: "Drag to aim · Release to launch",
    hue: "#fb923c",
  },
  "speed-circuit": {
    tagline: "Race the clock around a tight circuit.",
    description:
      "Drive a chase-cam vehicle through corners at speed, chaining laps as fast as possible while staying on track.",
    genre: "Arcade lap racer",
    controls: "W/S throttle · A/D steer · Space handbrake",
    hue: "#818cf8",
  },
  "swarm-survivor": {
    tagline: "Outlast an ever-growing monster swarm.",
    description:
      "Move through a top-down arena while your weapons auto-fire at the nearest enemy, collecting XP orbs to level up and pick upgrades.",
    genre: "Arena survivor",
    controls: "WASD move · Auto-fire · Pick upgrades",
    hue: "#c084fc",
  },
  "tower-guard": {
    tagline: "Build towers, hold the line, survive waves.",
    description:
      "Place towers along a creep path from a top-down view, spending gold to stop escalating enemy waves before they reach your base.",
    genre: "Tower defense",
    controls: "1–3 select tower · Click to build",
    hue: "#2dd4bf",
  },
  "block-stacker": {
    tagline: "Falling blocks, rising stakes.",
    description:
      "Shift, rotate, and drop seven-piece tetrominoes to clear rows before the stack tops out — played out in a snowy 3D arena.",
    genre: "Falling-block puzzle",
    controls: "Arrows · Z/X rotate · Space drop",
    hue: "#a78bfa",
  },
  "maze-muncher": {
    tagline: "Gobble every pellet, dodge four hunting ghosts.",
    description:
      "Guide the Muncher through a glowing maze eating pellets while four uniquely-behaved ghosts hunt you in scatter-chase cycles.",
    genre: "Arcade maze chase",
    controls: "WASD / Arrows",
    hue: "#fbbf24",
  },
  "platform-hopper": {
    tagline: "Run, jump, stomp enemies, race to the flag.",
    description:
      "A side-scrolling platformer — leap across a linear course, stomp patrolling enemies, dodge spikes, and collect coins to the goal.",
    genre: "Side-scrolling platformer",
    controls: "A/D move · Space jump",
    hue: "#34d399",
  },
  "spire-cards": {
    tagline: "Draft a deck, out-turn escalating enemies.",
    description:
      "A deckbuilder roguelike — play energy-costed attack, skill, and power cards against enemies that telegraph their next move.",
    genre: "Deckbuilder roguelike",
    controls: "Click cards · F end turn",
    hue: "#fb7185",
  },
  "voxel-mine": {
    tagline: "Dig, mine ore, and build in blocky 3D.",
    description:
      "A first-person voxel sandbox — mine ore veins down to bedrock, place blocks from your hotbar, and explore a procedural island.",
    genre: "Voxel sandbox",
    controls: "WASD · Space · 1–7 hotbar",
    hue: "#22d3ee",
  },
};

const FALLBACK_DETAILS: GameDetails = {
  tagline: "Built by an agent with the JGengine skills.",
  description: "A game built from the JGengine skills — playable right here in the browser.",
  genre: "JGengine game",
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
