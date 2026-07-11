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
  platforms?: readonly ("web" | "mobile")[];
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
    tagline: "Ten waves, forty guns, one salvage yard.",
    description:
      "A first-person arena looter. Fight ten escalating waves of scav machines, crack their rarity-beamed weapon drops, swap whatever outguns your kit into a three-slot hotbar, and spend scrap at requisition stations between firefights. Bosses telegraph mortars, challenges pay out, and victory unlocks endless mode.",
    genre: "First-person looter",
    category: "Action & Arcade",
    controls: "WASD · mouse fire · E grab/shop · G frag · Q medkit · 1-3 weapons",
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
  "canyon-chase": {
    tagline: "Run the smuggler down before the border opens.",
    description:
      "A high-speed canyon pursuit: close the gap on a smuggler's truck and hold within striking range long enough to force a capture before it crosses the border. Feints, deceptive shortcuts, and dead-end forks split off the main road, while adrenaline surges and radio chatter keep the chase razor-tight.",
    genre: "Canyon pursuit racer",
    category: "Action & Arcade",
    controls: "WASD/Arrows drive · Space handbrake · M survey map",
    hue: "#c2410c",
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
  "courier-zero": {
    tagline: "Outrun the tide, deliver before it swallows the road.",
    description:
      "A tide-timed delivery run across a flooding island archipelago. Sprint parcels between villages before each deadline expires, timing crossings against a rising tide that drowns roads, causeways, and wards in stages — drown three times and the run is over.",
    genre: "Tide-timed delivery adventure",
    category: "Action & Arcade",
    controls: "WASD move · Shift sprint · E interact · M map",
    hue: "#14b8a6",
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
  "drift-district": {
    tagline: "Drift the neon districts, bank boost, beat two rivals to the line.",
    description:
      "A night-lit street racer where drifting through style gates charges a boost meter and can permanently shift open new district shortcuts. Chain slides through Harbor, Downtown, and Heights across laps while rivals Ronin and Vega fight to hold their line.",
    genre: "Arcade drift racing",
    category: "Action & Arcade",
    controls: "W accelerate · S brake · A/D steer · Space handbrake · Shift boost",
    hue: "#e879f9",
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
  "frostbite-circuit": {
    tagline: "Five laps, ice that remembers every line you've cut.",
    description:
      "An arctic sled race around a frozen lake circuit where each pass cracks the ice under your favorite line, forcing you to hunt new corridors as inner, mid, and outer routes weaken and open into black water. Sink through four times and you're done — outlast Borealis and Polaris across five laps to take the circuit.",
    genre: "Arctic ice racing",
    category: "Action & Arcade",
    controls: "W accelerate · S brake · A/D steer · Space handbrake",
    hue: "#67e8f9",
  },
  "loop-station": {
    tagline: "Race your own ghost. Every lap is watching.",
    description:
      "A synthwave tape-loop speedrunner where every clean lap is recorded and replayed as a solid ghost you must dodge next time around. Steer, brake-drift, and jump-hop the over/under gaps to desync from your own history before the tape catches you.",
    genre: "Ghost-loop racer",
    category: "Action & Arcade",
    controls: "WASD · Shift brake-drift · Space jump-hop",
    hue: "#f0abfc",
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
  "orbit-kart": {
    tagline: "Slingshot through gravity wells to the checkered line.",
    description:
      "A zero-gravity kart race through six checkpoint rings and seven gravity wells across three laps. Ride the predicted trajectory into a planetoid, charge the slingshot meter, and discharge inside the clean window to fling out faster than you flew in.",
    genre: "Orbital slingshot racer",
    category: "Action & Arcade",
    controls: "W/S thrust · A/D rotate · Space discharge sling",
    hue: "#ff7f11",
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
  "rail-rushers": {
    tagline: "Pump the handcar, beat the express, don't get wrecked.",
    description:
      "A branching-network handcar race against the clock. Pump the throttle in rhythm for a speed bonus, throw junctions ahead of you to route around oncoming scheduled trains, and ride the rails to the summit terminus before the express catches up.",
    genre: "Rail dispatcher racer",
    category: "Action & Arcade",
    controls: "W pump · S brake · Space throw junction · M diagram",
    hue: "#38bdf8",
  },
  "rooftop-relay": {
    tagline: "Sprint the rooftops and pass the baton clean.",
    description:
      "A parkour relay race across city rooftops. Sprint and vault between runners on your crew, hand off the baton in stride to shave time off the clock, and keep the baton warm — fall off pace too long and the cold-baton penalty starts eating your lead.",
    genre: "Parkour relay racer",
    category: "Action & Arcade",
    controls: "WASD move · Space jump · Shift sprint · E handoff",
    hue: "#facc15",
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
  stormline: {
    tagline: "Outrun the storm chasing you down the highway.",
    description:
      "A supercell tracks your farm-highway drive in real time, its pace swinging between eerie lulls and screaming squall lines. Hold your lead to keep the exposure meter down, or cut into the low-grip storm-band shoulder at forks for banked distance — and the risk of a telegraphed lightning strike.",
    genre: "Storm-chase driving",
    category: "Action & Arcade",
    controls: "↑/W throttle · ↓/S brake · ←/→ steer · Space handbrake drift · R restart",
    hue: "#6366f1",
  },
  tideway: {
    tagline: "Read the swinging tide, ride the surf.",
    description:
      "Race a harbor speedboat against a rival through gated laps while a three-zone current field swings its direction and strength on a 25-second clock. Angle with the current to surf its push or fight straight through it, threading rudder and throttle around harbor buildings and islets.",
    genre: "Current-racing arcade",
    category: "Action & Arcade",
    controls: "W throttle · S reverse · A/D rudder · Space brace · Enter start",
    hue: "#0ea5e9",
  },
  "turbine-city": {
    tagline: "Thread the fan-driven wind tunnels, out-glide the pacer.",
    description:
      "Pilot a glider through a skyline of scheduled fans that spool up, hold, reverse, and cut out, riding their flow tubes for speed while a rival pacer keeps its own route. Stay centered in a tube's laminar core to build a streak multiplier — stray to the buffeting edge and control degrades, so dodge-burst clear of the turbulence.",
    genre: "Aerial flow-racing",
    category: "Action & Arcade",
    controls: "↑/↓ pitch · ←/→ yaw · W thrust · S airbrake · Space dodge · Mouse steer",
    hue: "#ec4899",
    platforms: ["web", "mobile"],
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
  klondike: {
    title: "Klondike Solitaire",
    tagline: "The classic patience deal",
    description:
      "Seven fanned piles, four foundations, draw-1 or draw-3 with unlimited redeals, undo, auto-complete, and a shareable daily deal.",
    genre: "card/solitaire",
    category: "Puzzle",
    controls: "Drag cards to move · click stock to draw · U undo",
    hue: "#22c55e",
  },
  freecell: {
    title: "FreeCell",
    tagline: "Every deal winnable, every move visible",
    description:
      "Eight open cascades, four free cells, numbered seeded deals with supermoves, safe auto-play, and win-streak stats.",
    genre: "card/solitaire",
    category: "Puzzle",
    controls: "Click a card, then destination · dbl-click auto-play",
    hue: "#2563eb",
  },
  "flag-sweep": {
    title: "Flag Sweep",
    tagline: "Read the numbers, trust the flags",
    description:
      "Classic minesweeping across beginner-to-expert boards with chording, first-click safety, a daily board, and best times per difficulty.",
    genre: "logic/puzzle",
    category: "Puzzle",
    controls: "Click reveal · right-click flag · double-click chord",
    hue: "#dc2626",
  },
  "slide-2048": {
    title: "2048",
    tagline: "Slide, merge, double",
    description:
      "The modern classic: merge ember tiles to 2048 and beyond with one-step undo, shareable seeds, and a persistent best score.",
    genre: "sliding/puzzle",
    category: "Puzzle",
    controls: "Arrows/WASD slide tiles · U undo · N new game",
    hue: "#d97706",
    credit: {
      name: "Gabriele Cirulli",
      label: "Inspired by",
      handle: "gabrielecirulli",
      href: "https://github.com/gabrielecirulli",
      avatar: "https://unavatar.io/github/gabrielecirulli",
      source: { name: "2048", href: "https://github.com/gabrielecirulli/2048" },
    },
  },
  "fifteen-slide": {
    title: "15 Puzzle",
    tagline: "The original sliding puzzle",
    description:
      "Walnut-and-brass tiles in 3×3 to 5×5, provably solvable shuffles, segment slides, and per-size records.",
    genre: "sliding/puzzle",
    category: "Puzzle",
    controls: "Click or Arrows/WASD slide tile · N new shuffle",
    hue: "#f97316",
  },
  "crate-keeper": {
    title: "Crate Keeper",
    tagline: "Push, never pull",
    description:
      "Twenty original warehouse puzzles with par times, three-star ratings, full undo, and a campaign that proves every level solvable.",
    genre: "logic/puzzle",
    category: "Puzzle",
    controls: "Arrows/WASD push crates · Z undo · R restart",
    hue: "#ca8a04",
  },
  "memory-match": {
    title: "Memory Match",
    tagline: "Two flips, one pair",
    description:
      "Concentration on lacquered navy cards — 4×4 and 6×6 boards, distinct glyph faces, and best moves and time per size.",
    genre: "card/memory",
    category: "Puzzle",
    controls: "Click cards to flip and match · R new deal",
    hue: "#fde047",
  },
  "video-poker": {
    title: "Video Poker",
    tagline: "Jacks or Better, 9/6 full pay",
    description:
      "The casino cabinet classic: bet, hold, draw against the full paytable with a persistent credit bank and max-bet royal bonus.",
    genre: "card/casino",
    category: "Others",
    controls: "Click cards or 1-5 hold · Space deal/draw",
    hue: "#f43f5e",
  },
  blackjack: {
    title: "Blackjack",
    tagline: "Twenty-one against the house",
    description:
      "Six-deck shoe with splits, doubles, insurance, dealer stands soft 17, blackjack pays 3:2, and a basic-strategy hint.",
    genre: "card/casino",
    category: "Others",
    controls: "Click chips to bet · H hit · S stand · D double",
    hue: "#10b981",
  },
  snake: {
    title: "Snake",
    tagline: "Don't bite yourself",
    description:
      "Phosphor-green CRT snake with walls or wrap, buffered turns, ramping speed, and a high score that remembers.",
    genre: "arcade",
    category: "Action & Arcade",
    controls: "Arrows/WASD or swipe steer · tap/Space confirm",
    hue: "#39ff14",
  },
  "gem-cascade": {
    title: "Gem Cascade",
    tagline: "Match three, chain the rest",
    description:
      "Jewel-toned match-3 with cascading multipliers, hints, endless and timed sprints — every gem readable by shape.",
    genre: "arcade/puzzle",
    category: "Puzzle",
    controls: "Click or drag-swap gems · H hint",
    hue: "#c026d3",
  },
  "brick-breaker": {
    title: "Brick Breaker",
    tagline: "Angle the rebound, rake the wall",
    description:
      "Twelve neon brick layouts, tiered bricks, multiball and paddle power-ups, and a combo-hungry score chase.",
    genre: "arcade",
    category: "Action & Arcade",
    controls: "Mouse/touch drag paddle · click/Space launch",
    hue: "#06b6d4",
  },
  "paddle-duel": {
    title: "Paddle Duel",
    tagline: "First to eleven, win by two",
    description:
      "CRT-minimal table tennis against three AI tiers or a friend on one keyboard, with volley speed-ups and deuce rules.",
    genre: "arcade",
    category: "Action & Arcade",
    controls: "Drag paddle or W/S · Arrows P2 · Space serve",
    hue: "#0284c7",
  },
  "pachinko-parlor": {
    title: "Pachinko Parlor",
    tagline: "Set the power, ride the pegs",
    description:
      "A Shōwa-era pachinko board with 168 brass pegs, deterministic physics, fever mode, and a ball bank to grow or bust.",
    genre: "arcade/parlor",
    category: "Others",
    controls: "Hold to charge · release launch · F auto-fire",
    hue: "#ea580c",
  },
  spider: {
    title: "Spider Solitaire",
    tagline: "Two decks, ten piles, five deals",
    description:
      "The patience epic: build same-suit runs to clear eight foundations at one, two, or four suits.",
    genre: "card/solitaire",
    category: "Puzzle",
    controls: "Drag cards to move · Space deal stock · U undo · N new deal · D daily",
    hue: "#881337",
  },
  sudoku: {
    title: "Sudoku",
    tagline: "Nine rows, no guessing",
    description:
      "Unique-solution puzzles at four difficulties with pencil marks, conflict highlighting, counted hints, and a daily board.",
    genre: "logic/puzzle",
    category: "Puzzle",
    controls: "Click cell · 1-9 digit · N notes · H hint · U undo · D daily",
    hue: "#4f46e5",
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
  reversi: {
    title: "Reversi",
    tagline: "Corners win games",
    description:
      "The disc-flipping duel with three AI strengths, legal-move dots, flip animations, and hotseat play.",
    genre: "board/strategy",
    category: "Strategy & Tactics",
    controls: "Click to place · U undo · R rematch",
    hue: "#15803d",
  },
  "four-in-a-row": {
    title: "Four in a Row",
    tagline: "Drop, stack, connect",
    description:
      "The vertical connection classic against three AI tiers or a friend — watch the center, count the threats.",
    genre: "board/strategy",
    category: "Strategy & Tactics",
    controls: "Click or 1-7 drop column · U undo · R rematch",
    hue: "#1d4ed8",
  },
  "echo-lights": {
    title: "Echo Lights",
    tagline: "Watch, then repeat",
    description:
      "The growing-sequence memory console: four jewel pads, ramping speed, one mistake ends the run.",
    genre: "memory/arcade",
    category: "Puzzle",
    controls: "Click pad or 1-4/Arrows · R new game · D daily",
    hue: "#7c3aed",
  },
  "lights-out": {
    title: "Lights Out",
    tagline: "Five by five, all dark",
    description:
      "A 30-level campaign of solver-verified switch puzzles with honest pars, stars, and optimal hints.",
    genre: "logic/puzzle",
    category: "Puzzle",
    controls: "Click cell to toggle · H hint · U undo · R restart · N new board",
    hue: "#92400e",
  },
  "peg-solitaire": {
    title: "Peg Solitaire",
    tagline: "Jump to one",
    description:
      "The court classic on English and European boards — land the last peg in the center for brilliance.",
    genre: "board/logic",
    category: "Puzzle",
    controls: "Click peg, then landing hole · U undo · H hint · R restart",
    hue: "#78350f",
  },
  codebreaker: {
    title: "Codebreaker",
    tagline: "Crack the code in ten",
    description:
      "Deduce the secret pegs from black-and-white key feedback — duplicates, hard mode, and a daily code.",
    genre: "logic/deduction",
    category: "Puzzle",
    controls: "Click or 1-8 pick color · Enter submit · Backspace delete · R new game · D daily",
    hue: "#be123c",
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
  "rock-blaster": {
    title: "Rock Blaster",
    tagline: "Thrust, drift, split",
    description:
      "Vector asteroid blasting with true inertia, splitting rocks, aiming saucers, and risky hyperspace.",
    genre: "arcade/shooter",
    category: "Action & Arcade",
    controls: "A/D rotate · W/↑ thrust · Space fire · Shift hyperspace · R restart",
    hue: "#cbd5e1",
  },
  "road-hopper": {
    title: "Road Hopper",
    tagline: "Traffic, river, home",
    description:
      "Hop five lanes of traffic and a river of logs and diving turtles to fill five home bays against the clock.",
    genre: "arcade",
    category: "Action & Arcade",
    controls: "WASD/Arrows hop · P pause · R restart",
    hue: "#4338ca",
  },
  "yacht-dice": {
    title: "Yacht Dice",
    tagline: "Three rolls, thirteen boxes",
    description:
      "The dice-and-scoresheet classic: hold, reroll, and bank categories with live ghost scores.",
    genre: "dice/casino",
    category: "Others",
    controls: "R roll · 1-5 hold dice · click category to bank",
    hue: "#047857",
  },
  "mahjong-solitaire": {
    title: "Mahjong Solitaire",
    tagline: "Free the turtle",
    description:
      "144 tiles in the classic turtle layout, guaranteed-solvable deals, hints, and hand-drawn glyphs.",
    genre: "tile/solitaire",
    category: "Puzzle",
    controls: "Click matching tiles · H hint · U undo · S reshuffle · N new deal · D daily",
    hue: "#00a86b",
  },
  "bubble-burst": {
    title: "Bubble Burst",
    tagline: "Three of a kind pops",
    description:
      "Hex-grid bubble shooting with wall bounces, dropping clusters, and a compressor that never stops.",
    genre: "arcade/puzzle",
    category: "Puzzle",
    controls: "Mouse aim & click fire · A/D aim · X swap · R restart",
    hue: "#db2777",
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
      shot: shotUrls[`../assets/screens/${id}.png`],
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export const GAMES_BY_CATEGORY: { category: GameCategory; games: Game[] }[] = GAME_CATEGORIES.map(
  (category) => ({ category, games: GAMES.filter((game) => game.category === category) }),
).filter((section) => section.games.length > 0);
