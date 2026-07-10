import radiumcodersAvatar from "../assets/credits/radiumcoders.jpg";

const gamePackages = import.meta.glob("../../../../Games/*/package.json");

const shotUrls = import.meta.glob<string>("../assets/screens/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

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
  shot?: string;
  credit?: GameCredit;
};

type GameDetails = Omit<Game, "id" | "title" | "href" | "shot"> & { title?: string };

const GAME_DETAILS: Record<string, GameDetails> = {
  "maze-muncher": {
    tagline: "Devour every soul before the hunt begins.",
    description:
      "A first-person spin on the maze chase, played in near-total darkness. Creep through five ever-deeper mazes gathering the souls scattered along the corridors, and keep moving when the hunt timer hits zero — you only get three lives.",
    genre: "First-person maze chase",
    category: "Action & Arcade",
    controls: "WASD move · mouse look",
    hue: "#e11d48",
  },
  "platform-hopper": {
    tagline: "Run right, stomp the stompers, reach the flag.",
    description:
      "A side-scrolling platformer through a low-poly city block. Sprint across rooftops and alleys, bounce off patrolling stompers, dodge spikes, and rack up score on the way to the goal flag with three hearts to spare.",
    genre: "Side-scrolling platformer",
    category: "Action & Arcade",
    controls: "A/D move · Space jump",
    hue: "#34d399",
  },
  "speed-circuit": {
    tagline: "Three laps, one racing line, no brakes for the brave.",
    description:
      "An arcade racer with a chase camera that widens as you speed up. Beat the countdown, hug the red-and-white kerbs through the forest circuit, and chase your best lap time across three laps.",
    genre: "Arcade racing",
    category: "Action & Arcade",
    controls: "W accelerate · S brake · A/D steer · Space handbrake",
    hue: "#ef4444",
  },
  "swarm-survivor": {
    tagline: "Outlive the swarm, level up, repeat.",
    description:
      "A top-down horde survival run. Kite growing waves of creatures around an abandoned village while your weapons fire on their own, scoop up the XP gems they drop, and survive until the timer runs out.",
    genre: "Horde survival",
    category: "Action & Arcade",
    controls: "WASD move · weapons auto-fire",
    hue: "#a3e635",
  },
  "loot-shooter": {
    tagline: "Shoot, loot, and upgrade your arsenal.",
    description:
      "A first-person arena looter. Drop targets to make them spill rarity-tiered weapons, grab whatever outguns your current kit into a three-slot hotbar, and keep levelling your operative between firefights.",
    genre: "First-person looter",
    category: "Action & Arcade",
    controls: "WASD · mouse shoot · E pick up",
    hue: "#f87171",
  },
  "block-stacker": {
    tagline: "Falling blocks, rising stakes.",
    description:
      "The classic falling-block puzzle staged over a low-poly night city. Shift, rotate, and hard-drop seven-piece tetrominoes to clear lines, bank a hold piece, and read the five-piece preview as the levels speed up.",
    genre: "Falling-block puzzle",
    category: "Puzzle",
    controls: "←/→ move · ↑/Z rotate · Space drop · C hold",
    hue: "#a78bfa",
  },
  "mine-drop": {
    tagline: "Giant minesweeper you walk on — with friends.",
    description:
      "Minesweeper turned into a shared 3D world. You and your crew stand on a giant covered board at sunset, jump to dig the tile under your feet, flag suspected bombs, and drop deeper together with every cleared layer.",
    genre: "Co-op minesweeper",
    category: "Puzzle",
    controls: "WASD · Space dig · Q flag · R restart",
    hue: "#fb923c",
  },
  "grid-tactics": {
    tagline: "Deploy the squad, breach the outpost.",
    description:
      "Turn-based tactics on a gridded battlefield. Deploy your squad, spend each unit's actions on movement, attacks, and ability plays around cover, then end the turn and weather the enemy's counterattack.",
    genre: "Turn-based tactics",
    category: "Strategy & Tactics",
    controls: "Click units & tiles · Enter end turn · Esc cancel",
    hue: "#fbbf24",
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
  "slingshot-siege": {
    tagline: "Pull back, let fly, level the outpost.",
    description:
      "A physics siege in the grass. Drag the sling pouch to aim, release to hurl shots at the defenders' towers, and topple every dummy across three escalating waves with a limited stock of ammunition.",
    genre: "Physics siege",
    category: "Strategy & Tactics",
    controls: "Drag to aim · release to fire",
    hue: "#60a5fa",
  },
  "voxel-mine": {
    tagline: "Dig, mine ore, and build in blocky 3D.",
    description:
      "A first-person voxel sandbox on a procedural island. Work through the prospecting quest by mining coal and iron veins, hotbar-swap between pickaxe and blocks, and reshape the terrain one cube at a time.",
    genre: "Voxel sandbox",
    category: "Sandbox & Simulation",
    controls: "WASD · Space · 1–7 hotbar",
    hue: "#22d3ee",
  },
  annals: {
    title: "The Annals",
    tagline: "Watch a kingdom write its own history.",
    description:
      "An ambient history simulator. Monarchs reign and die, caravans thread between island settlements, and every event lands in a running chronicle — pause, speed time up to 8×, and click anywhere to follow the story.",
    genre: "Ambient history sim",
    category: "Sandbox & Simulation",
    controls: "Space pause · F cycle speed · click to focus",
    hue: "#eab308",
    credit: {
      name: "Ethan Mollick",
      label: "From a prompt by",
      handle: "@emollick",
      href: "https://x.com/emollick",
      avatar: "https://unavatar.io/x/emollick",
      source: { name: "annals-kingdom", href: "https://github.com/emollick/annals-kingdom" },
    },
  },
  "commit-canopy": {
    tagline: "Your GitHub year as a 3D landscape.",
    description:
      "Not a game — a data toy built on the same engine. Paste any GitHub username and its contribution graph rises into an isometric block landscape you can orbit, pan, and export as a shareable image.",
    genre: "Data-art toy",
    category: "Others",
    controls: "Drag to rotate · scroll to zoom",
    hue: "#6ee7b7",
    credit: {
      name: "Jay Sharma",
      label: "Inspired by",
      handle: "radiumcoders",
      href: "https://github.com/radiumcoders",
      avatar: radiumcodersAvatar,
      source: {
        name: "Isometric GitHub Contributions",
        href: "https://github.com/radiumcoders/Isometric-Github-Contributions",
      },
    },
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
      shot: shotUrls[`../assets/screens/${id}.png`],
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export const GAMES_BY_CATEGORY: { category: GameCategory; games: Game[] }[] = GAME_CATEGORIES.map(
  (category) => ({ category, games: GAMES.filter((game) => game.category === category) }),
).filter((section) => section.games.length > 0);
