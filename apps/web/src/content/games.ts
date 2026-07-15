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
  "loot-shooter": {
    tagline: "Ten waves, forty guns, one salvage yard.",
    description:
      "A first-person arena looter. Fight ten escalating waves of scav machines, crack their rarity-beamed weapon drops, swap whatever outguns your kit into a three-slot hotbar, and spend scrap at requisition stations between firefights. Bosses telegraph mortars, challenges pay out, and victory unlocks endless mode.",
    genre: "First-person looter",
    category: "Action & Arcade",
    controls: "WASD · mouse fire · E grab/shop · G frag · Q medkit · 1-3 weapons",
    hue: "#f87171",
  },
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
  monument: {
    title: "Monument",
    tagline: "Sculpt a brutalist district and watch it live.",
    description:
      "A brutalist architecture toy. Cast slabs, towers, megastructures, and capsule spines onto an open site, sculpt each one through nine compositions and six profiles, and watch the concrete district live through day and night — no economy, no fail state, just consequences.",
    genre: "City-building toy",
    category: "Sandbox & Simulation",
    controls: "1–6 build tools · V select · X demolish · Space pause",
    hue: "#d7ff43",
    credit: {
      name: "Ethan Mollick",
      label: "A port of Monument by",
      handle: "@emollick",
      href: "https://x.com/emollick",
      avatar: "https://unavatar.io/x/emollick",
      source: {
        name: "monument-brutalist-city-builder",
        href: "https://github.com/emollick/monument-brutalist-city-builder",
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
  "clockwork-heist": {
    tagline: "Five treasures, one clockwork night, zero mistakes.",
    description:
      "A top-down stealth heist through a mansion patrolled by guards with vision cones and roaming cameras. Sneak between wings to crack five signature treasures and grab bonus loot through timing skill-checks, then slip out before three strikes or the dawn clock ends the job.",
    genre: "Top-down stealth heist",
    category: "Action & Arcade",
    controls: "WASD move · Shift sneak · E interact · Tab schedule",
    hue: "#b45309",
  },
  craterball: {
    tagline: "Arm the charges, blast the ball, bury the pitch in craters.",
    description:
      "A two-team explosive sports match on a crater-scarred pitch: arm timed charges near the ball, detonate them to blast it toward the opposing goal, and dodge-roll clear of the blast radius. Every explosion permanently craters the terrain, and first to five goals wins.",
    genre: "Explosive arena sports",
    category: "Action & Arcade",
    controls: "WASD move · F throw charge · Space detonate · Shift dodge roll",
    hue: "#d946ef",
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
  "drone-derby": {
    tagline: "Thread the rings before the cell runs dry.",
    description:
      "An FPV drone race through a dusk shipping yard, dodging gusts of wind while chasing gold, silver, and bronze splits across three courses. Push the throttle hard and the battery drains faster — land on a charge pad to top up before you're stranded mid-course.",
    genre: "FPV drone racing",
    category: "Action & Arcade",
    controls: "W/S throttle · A/D yaw · Arrows pitch/strafe · Space boost · E charge · 1–3 pick course",
    hue: "#7dd3fc",
  },
  "dune-nomads": {
    tagline: "Lead the caravan across the dunes before the water runs dry.",
    description:
      "A desert caravan trek where you steer a lead camel while four followers trail behind, racing a rival caravan toward the far city of Meridaan. Dock at oases to gamble a quick top-up or a full refill, read the wind before every dune, and keep the water from running out before you reach the gates.",
    genre: "Desert caravan survival trek",
    category: "Sandbox & Simulation",
    controls: "W urge · S ease · A/D steer · E dock · M map",
    hue: "#a16207",
  },
  "magnet-run": {
    tagline: "Flip polarity, stick the wall, don't get thrown.",
    description:
      "An auto-running freight-tunnel dash where flipping magnetic polarity decides whether floor, wall, or train roof holds you or throws you off. Switch lanes, board rolling trains, and boost through all three sectors before three crashes end the run.",
    genre: "Polarity runner",
    category: "Action & Arcade",
    controls: "A/D lanes · Space flip polarity · W boost · S brake",
    hue: "#3b82f6",
  },
  "neon-shepherd": {
    tagline: "Twenty lights follow you home. Lose none.",
    description:
      "A neon night-city herding run where a flock of glowing creatures trails you from the park to the sanctuary. Pulse to gather strays, hold the herd steady at the curb, and time every road crossing between passing traffic.",
    genre: "Night-city herding",
    category: "Action & Arcade",
    controls: "WASD · Space gather-pulse · Shift hold herd",
    hue: "#2dd4bf",
  },
  "pulse-runner": {
    tagline: "Stay on the beat or fall behind.",
    description:
      "A rhythm-driven endless runner through a three-lane cathedral aisle. Tap in time to swap lanes past gaps, swinging censers, and beat-gated doors, chain perfect hits into a resonance streak for a speed bonus, and lean forward to push the pace before your pulse meter runs out of strikes.",
    genre: "Rhythm runner",
    category: "Action & Arcade",
    controls: "Space tap beat · A/D lane · W lean",
    hue: "#f472b6",
  },
  "skyhook-rally": {
    tagline: "Grapple, swing, and release at the apex.",
    description:
      "A grappling-hook flight race over a floating sky archipelago. Fire the hook to swing pendulum-style between brass pylons, release right at the apex for maximum distance, and chain true swings into a streak bonus as you chase gold across looping, climbing, and diving courses.",
    genre: "Grapple-swing racer",
    category: "Action & Arcade",
    controls: "Mouse/Space hook · W/S pitch · A/D steer",
    hue: "#818cf8",
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
  nonogram: {
    title: "Nonogram",
    tagline: "Paint by logic",
    description:
      "Twenty original picture puzzles from 5×5 to 15×15, each provably solvable by pure line logic — reveal the pixel art.",
    genre: "picture/logic",
    category: "Puzzle",
    controls: "Click fill · right-click cross · drag paint · Z undo · C clear",
    hue: "#0d9488",
  },
  "star-invaders": {
    title: "Star Invaders",
    tagline: "The wall descends",
    description:
      "Fifty-five marching aliens, eroding bunkers, a bonus saucer, and one shot on screen — hold the line.",
    genre: "arcade/shooter",
    category: "Action & Arcade",
    controls: "A/D/Arrows or mouse aim · Space/click fire · P pause · R restart",
    hue: "#00ff41",
  },
  pinball: {
    title: "Pinball",
    tagline: "Flippers up, table live",
    description:
      "A golden-age solid-state table with real flipper physics, pop bumpers, drop targets, multipliers, and TILT.",
    genre: "pinball/arcade",
    category: "Others",
    controls: "Z/← left flipper · Slash/→ right flipper · ↓/Enter plunge · Space nudge · N new game",
    hue: "#fb8500",
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
