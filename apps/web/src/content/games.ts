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
  borderlands2: {
    title: "Borderlands 2 Demake",
    tagline: "Bazillions of procedurally generated guns, one dusty demake of Pandora.",
    description:
      "A fan demake homage to Gearbox's Borderlands 2. Pick one of three Vault Hunters — Salvador, Maya, or Zer0, each with a unique three-branch skill tree — and follow the campaign across six zones of Pandora, from Windshear Waste to The Warrior at Hero's Pass. Every gun is procedurally rolled (manufacturer, rarity, element), shields recharge, elements burn, shock, and corrode, and going down starts Fight For Your Life: get a kill for a Second Wind or pay the New-U station its cut.",
    genre: "First-person looter-shooter",
    category: "Action & Arcade",
    controls: "WASD · mouse fire · R reload · E interact · G grenade · Q heal · K skills · 1-4 weapons",
    hue: "#ff9a00",
    credit: {
      name: "Gearbox Software",
      label: "Original game",
      handle: "GearboxOfficial",
      href: "https://www.borderlands.com",
      avatar: "https://unavatar.io/x/GearboxOfficial",
      source: { name: "Borderlands 2", href: "https://www.borderlands.com" },
    },
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
