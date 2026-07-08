const gamePackages = import.meta.glob<{ name: string }>("../../../../Games/*/package.json", {
  eager: true,
  import: "default",
});

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
      href: `/play/?game=${id}`,
      ...details,
      title: details.title ?? titleCase(id),
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));
