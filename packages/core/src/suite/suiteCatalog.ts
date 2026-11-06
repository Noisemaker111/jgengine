/**
 * The game suite: every thing a player must be able to do, as data. A game declares its genres in
 * `jgengine.json` (`suite.genres`); every universal entry and every entry of those genres is then required,
 * and counts only when a proof passes (a headless simulation for `sim`, the generic content check for
 * `data`). Adding an entry here raises the bar for every game at once.
 */

/** How an entry is proven: a headless simulation of the real game (`sim`), or the generic check over the game's content (`data`). */
export type SuiteProofBy = "sim" | "data";

/** The depth a core feature needs, beyond existing: how it is found, grows, connects, repeats and fails. */
export interface SuiteDepth {
  /** How a new player finds it without being told the command. */
  find: string;
  /** What gets better about it over the first hours. */
  improves: string;
  /** Two other entries it feeds, by id. */
  feeds: readonly [string, string];
  /** Why a player still does it at hour 5. */
  repeat: string;
  /** How it goes wrong for the player, and what that costs. */
  fails: string;
}

/** One thing a player must be able to do. */
export interface SuiteEntry {
  /** Stable id: `<area>.<verb>`; the area groups the score. */
  id: string;
  /** `universal`, or the genre ids that require it. */
  genres: readonly string[];
  /** What the player does, in one line. */
  does: string;
  /** What proves it, in one line. */
  proof: string;
  by: SuiteProofBy;
  /** Set on core features: the depth the game must design for. */
  depth?: SuiteDepth;
}

/** A genre a game may declare; `includes` pulls in another genre's entries too. */
export interface SuiteGenre {
  id: string;
  label: string;
  includes?: readonly string[];
}

/** The genre tag every game carries. */
export const SUITE_UNIVERSAL = "universal";

/** Every genre a game may declare. */
export const SUITE_GENRES: readonly SuiteGenre[] = [
  { id: "survival", label: "Survival: vitals, gathering, crafting, building" },
  { id: "creature-survival", label: "Creature survival: survival plus taming, riding, breeding and creature work", includes: ["survival"] },
  { id: "shooter", label: "Shooter: aim, fire, ammo, enemies that fight back" },
  { id: "looter", label: "Looter: drops by rarity, gear that changes the build" },
  { id: "extraction", label: "Extraction: go in, carry out, bank or lose it" },
  { id: "tower-defense", label: "Tower defense: place, upgrade, hold escalating waves" },
  { id: "strategy", label: "Strategy: command units, run an economy, win a map" },
  { id: "tycoon", label: "Tycoon: build attractions, serve customers, keep the books" },
  { id: "life-sim", label: "Life sim: needs, work, relationships, a home" },
  { id: "racing", label: "Racing: drive, race opponents, unlock cars and tracks" },
  { id: "open-world", label: "Open world: travel, vehicles, jobs across a map" },
  { id: "online", label: "Online: a shared world other players join" },
];

const U = [SUITE_UNIVERSAL];

/** Every entry, universal first, then by genre. */
export const SUITE_ENTRIES: readonly SuiteEntry[] = [
  // Universal: every game.
  {
    id: "onboarding.first-goal", genres: U, by: "sim",
    does: "A new game shows a first goal, and the first player action toward it advances it.",
    proof: "From a new game with no setup, the goal reading is set and one player action moves it.",
    depth: {
      find: "It is on screen at second 0.",
      improves: "Goals chain into the next system and stop holding the player's hand once each is used.",
      feeds: ["onboarding.find-features", "progression.runway"],
      repeat: "Later goals point at the long loop, not at buttons.",
      fails: "A goal the player cannot reach yet stalls them; it must say what is missing.",
    },
  },
  { id: "onboarding.find-features", genres: U, by: "sim", does: "A player following the game's own guidance reaches the first use of every core feature.", proof: "From a new game, following only the guidance, each core feature's first-use reading turns on." },
  {
    id: "failure.lose-and-recover", genres: U, by: "sim",
    does: "The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost.",
    proof: "Setup puts the player in danger; play loses to it, and the probe shows the recovery and its cost.",
    depth: {
      find: "The first danger is visible before it is lethal.",
      improves: "Recovery options grow (respawn points, insurance, retries) as the player invests.",
      feeds: ["save.continue", "progression.runway"],
      repeat: "Higher stakes later make the same failure cost more.",
      fails: "A failure with no way back softlocks; a failure with no cost teaches nothing.",
    },
  },
  { id: "save.continue", genres: U, by: "sim", does: "Progress made by playing survives saving and continuing.", proof: "Play changes something, the game saves through its own save path, a new session restores it, and the change is still there." },
  { id: "settings.controls", genres: U, by: "sim", does: "The player opens settings and a change (a binding, volume, sensitivity) takes effect.", proof: "Play opens settings through its command and changes one; the probe reads the new value in play." },
  { id: "menu.start-and-credits", genres: U, by: "sim", does: "The main menu starts a game and shows the credits.", proof: "From boot with no setup, the menu's start command enters play; its credits command opens the credits." },
  { id: "progression.runway", genres: U, by: "data", does: "Something new unlocks steadily across the first five hours, up to the progression cap.", proof: "The content check finds no long gap between unlocks and an unlock near the cap." },
  { id: "content.item-source", genres: U, by: "data", does: "Every item can be obtained by playing.", proof: "The content check reaches every item from the start state through the game's sources." },
  { id: "content.item-use", genres: U, by: "data", does: "Every item does something: crafts, equips, eats, places, feeds, sells or summons.", proof: "The content check finds a use for every item." },
  { id: "content.recipes-reachable", genres: U, by: "data", does: "Every recipe and source can actually be used: its inputs, station and unlock are all obtainable.", proof: "The content check finds no blocked source." },
  { id: "content.placeables-place", genres: U, by: "data", does: "Every item that says it can be placed can be placed.", proof: "The content check finds each placeable item in the game's placement catalog." },
  { id: "content.weapons-have-ammo", genres: U, by: "data", does: "Every weapon that fires has obtainable ammo, or needs none.", proof: "The content check finds ammo with a source for each ranged weapon." },

  // Survival.
  {
    id: "survival.vitals-drain", genres: ["survival"], by: "sim",
    does: "Hunger and thirst fall over time and hurt the player at zero.",
    proof: "With no setup beyond a new game, waiting drains food and water, and at zero health falls.",
    depth: {
      find: "The meters are on the HUD and warn before they hurt.",
      improves: "Better food, containers and gear stretch the time between meals.",
      feeds: ["survival.eat-drink", "harvest.tool-bias"],
      repeat: "Travel, cold and work drain faster, so supplies stay a plan at hour 5.",
      fails: "Running dry far from food kills; the cost is the walk back.",
    },
  },
  { id: "survival.eat-drink", genres: ["survival"], by: "sim", does: "Eating and drinking restore the meters.", proof: "Play eats from the hotbar and drinks at water; the meters rise." },
  { id: "survival.temperature", genres: ["survival"], by: "sim", does: "Climate pushes body temperature; clothing, fire or shelter counter it.", proof: "Setup places the player in the cold; play puts on clothing or stands by fire and the harm stops." },
  { id: "survival.oxygen-swim", genres: ["survival"], by: "sim", does: "Swimming under water drains breath; surfacing refills it.", proof: "Play dives; the breath reading falls, then refills at the surface." },
  { id: "survival.food-spoils", genres: ["survival"], by: "sim", does: "Carried food spoils over time into something else.", proof: "Setup gives fresh food; waiting turns it into its spoiled item." },
  { id: "survival.respawn-point", genres: ["survival"], by: "sim", does: "A placed bed or bag becomes where the player wakes after death.", proof: "Play places the respawn item and dies; the player wakes at it, not at the spawn." },
  { id: "survival.storage-place", genres: ["survival"], by: "sim", does: "A storage container can be placed and holds items.", proof: "Play places a container, moves items into it, and they stay there." },
  { id: "survival.encumbrance", genres: ["survival"], by: "sim", does: "Carrying more slows the player, and past the limit they cannot move.", proof: "Setup loads the bag near the limit; play walks and is slower than empty, then adds more and stops moving." },
  {
    id: "survival.farm", genres: ["survival"], by: "sim",
    does: "Plant a seed in a plot; with water and fertilizer it grows a harvest.",
    proof: "Setup gives a plot, a seed and fertilizer; play plants and waits, and the plot yields more than the seed cost; unwatered it does not grow.",
    depth: {
      find: "Seeds drop from the plants the player already picks.",
      improves: "Larger plots, irrigation and better fertilizer.",
      feeds: ["taming.crafted-bait", "survival.eat-drink"],
      repeat: "Crops feed bait recipes and a growing herd.",
      fails: "Dry or unfertilized plots wither.",
    },
  },
  {
    id: "building.place-snap", genres: ["survival"], by: "sim",
    does: "Building pieces place, snap to each other and stand.",
    proof: "Setup gives pieces; play places a floor and a wall and the wall snaps to the floor.",
    depth: {
      find: "The first piece unlocks early and the build mode shows where it will go.",
      improves: "Stronger tiers and more piece shapes arrive with levels.",
      feeds: ["building.shelter", "survival.storage-place"],
      repeat: "A larger base, defenses and stations keep it growing.",
      fails: "Bad placement wastes materials; weak tiers get broken.",
    },
  },
  { id: "building.shelter", genres: ["survival"], by: "sim", does: "A built enclosure shelters the player from weather and cold.", proof: "Play builds an enclosure and stands in it; the shelter reading turns on and the weather harm stops." },
  { id: "building.tiers-durability", genres: ["survival"], by: "sim", does: "Stronger building tiers resist attacks a weaker tier does not.", proof: "Play strikes a weak and a strong piece with the same tool; only the weak one loses health." },
  {
    id: "harvest.tool-bias", genres: ["survival"], by: "sim",
    does: "The tool used changes what a tree, rock or body yields, and how much.",
    proof: "Play hits the same kind of node with two tools; the yields differ as the game says.",
    depth: {
      find: "Bare hands work, and the first tool is the first craft.",
      improves: "Better tools and creatures multiply yield.",
      feeds: ["crafting.station-tiers", "building.place-snap"],
      repeat: "Each new tier needs a new material from a harder place.",
      fails: "The wrong tool wastes stamina and time for little.",
    },
  },
  { id: "harvest.node-respawn", genres: ["survival"], by: "sim", does: "Depleted trees, rocks and bushes come back after a while.", proof: "Play depletes a node; waiting brings it back." },
  { id: "harvest.carcass", genres: ["survival"], by: "sim", does: "A killed creature's body yields meat and hide by tool.", proof: "Setup spawns a weak creature; play kills it and harvests the body." },
  {
    id: "crafting.station-tiers", genres: ["survival"], by: "sim",
    does: "Placed stations craft recipes the bare inventory cannot.",
    proof: "Play fails to craft a station recipe away from it, places the station, and crafts it there.",
    depth: {
      find: "The first station is a step of the guidance.",
      improves: "Each station tier opens a new band of recipes.",
      feeds: ["crafting.unlock-spend", "building.place-snap"],
      repeat: "Late recipes need several stations and rare inputs.",
      fails: "Missing inputs or the wrong station refuse the craft and say why.",
    },
  },
  { id: "crafting.unlock-spend", genres: ["survival"], by: "sim", does: "Level-ups give points the player spends to learn recipes.", proof: "Setup gives a level; play spends its point on a recipe and can now craft it." },
  {
    id: "crafting.refine-tier", genres: ["survival"], by: "sim",
    does: "Raw ore smelts at a fuelled station into a material that opens a stronger tier of tools and building.",
    proof: "Setup gives ore, fuel and the station; play smelts the ore, crafts a next-tier tool from the result, and that tool out-gathers the previous tier on the same node.",
    depth: {
      find: "The ore is visible in the world well before the station unlocks.",
      improves: "Each tier of tools and pieces outlasts and out-gathers the last.",
      feeds: ["harvest.tool-bias", "building.tiers-durability"],
      repeat: "Every late recipe and stronger building needs refined material in bulk.",
      fails: "Without fuel the station stops; ore is heavy to bring home.",
    },
  },
  { id: "crafting.fuel", genres: ["survival"], by: "sim", does: "A station that burns consumes fuel and stops when it runs out.", proof: "Setup gives a lit station with a little fuel and work queued; waiting burns the fuel, and the work stops when it is gone." },
  { id: "crafting.preserve", genres: ["survival"], by: "sim", does: "A preserving container slows spoilage.", proof: "Setup gives two equal food stacks; one goes into the container; after the same wait the stored stack has spoiled less." },
  { id: "crafting.tool-wear", genres: ["survival"], by: "sim", does: "Tools and weapons wear with use, break, and can be repaired with materials.", proof: "Play uses a tool until its durability reading falls, then repairs it and the reading rises while repair materials leave the bag." },

  // Creature survival: taming.
  {
    id: "taming.knockout-melee", genres: ["creature-survival"], by: "sim",
    does: "Knock a creature out by hitting it, feed it, and it becomes yours.",
    proof: "Setup places a creature and food; play strikes it unconscious, feeds it, and the tamed count rises.",
    depth: {
      find: "The first tameable creature lives by the start, and the guidance names the method.",
      improves: "Tools that knock out faster and better food shorten it.",
      feeds: ["creatures.ride.ground", "creatures.work.gather"],
      repeat: "Bigger, more useful creatures need the method again with more care.",
      fails: "Striking too hard kills it; waking up loses the progress.",
    },
  },
  {
    id: "taming.ranged-knockout", genres: ["creature-survival"], by: "sim",
    does: "Knock a creature out from range with sedative ammo, without standing in its reach.",
    proof: "Setup gives the ranged weapon and sedative ammo and places an aggressive creature beyond its attack reach; play fires until it drops unconscious, the player's health unchanged and the ammo count fallen.",
    depth: {
      find: "The ranged weapon unlocks a few levels after the first melee tame, and the sedative ammo soon after.",
      improves: "Stronger weapons and ammo add more torpor per shot, so bigger creatures become possible.",
      feeds: ["taming.keep-under", "creatures.ride.fly"],
      repeat: "Every dangerous or flying creature is tamed this way.",
      fails: "Shots to a weak creature kill it; missed shots waste ammo while it closes in.",
    },
  },
  { id: "taming.keep-under", genres: ["creature-survival"], by: "sim", does: "Keep an unconscious creature under with a sedative while it eats.", proof: "Setup gives a sedative and a downed creature; play feeds the sedative and its torpor rises." },
  { id: "taming.wake-loses", genres: ["creature-survival"], by: "sim", does: "If an unconscious creature's torpor runs out it wakes up wild, and the taming progress is lost.", proof: "Setup gives a downed creature partway tamed with no sedative; waiting, it wakes, its taming progress reads zero and it is wild again." },
  {
    id: "taming.preferred-food", genres: ["creature-survival"], by: "sim",
    does: "Each species ranks its foods; its favourite tames it several times faster and cleaner than ordinary food.",
    proof: "Two downed creatures of one species at one level; play feeds one its favourite and one an ordinary food; the favourite finishes in under half the time with higher effectiveness.",
    depth: {
      find: "Inspecting a downed creature names what it likes best.",
      improves: "Better foods unlock as the player farms, cooks and breeds.",
      feeds: ["taming.crafted-bait", "taming.effectiveness"],
      repeat: "Each new species asks for a different food.",
      fails: "The wrong food takes so long the narcotics run out.",
    },
  },
  {
    id: "taming.crafted-bait", genres: ["creature-survival"], by: "sim",
    does: "A cooked taming food, made from eggs and crops at a station, is the best food for creatures of its tier.",
    proof: "Setup gives the station and inputs; play cooks the bait and feeds it to a downed creature of that tier, and it tames faster than with that creature's best raw food.",
    depth: {
      find: "Eggs drop near the creatures that lay them; the recipe is shown at the station.",
      improves: "Higher tiers of bait, from rarer eggs, tame bigger creatures.",
      feeds: ["taming.preferred-food", "breeding.pair-mate"],
      repeat: "Big tames need bait made from the eggs of other tames.",
      fails: "Bait spoils, and the wrong tier is barely better than nothing.",
    },
  },
  { id: "taming.passive-feed", genres: ["creature-survival"], by: "sim", does: "Some creatures tame awake, by offering food without being hit.", proof: "Setup places a passive tamer and food; play offers the food until it is tamed." },
  { id: "taming.trap", genres: ["creature-survival"], by: "sim", does: "A trap or snare holds a creature still for taming.", proof: "Setup gives the trap; play uses it on a creature and it cannot move." },
  { id: "taming.effectiveness", genres: ["creature-survival"], by: "sim", does: "A cleaner tame gives a better creature.", proof: "Two tames, one hit while eating; play shows the cleaner one has more bonus levels." },

  // Creature survival: what tames do.
  { id: "creatures.follow-stay", genres: ["creature-survival"], by: "sim", does: "Order a tame to follow, stay or guard.", proof: "Play orders follow and walks away; the tame follows; stay holds it." },
  { id: "creatures.fight-alongside", genres: ["creature-survival"], by: "sim", does: "Tames attack what threatens the player.", proof: "Setup spawns a hostile; the following tame damages it." },
  {
    id: "creatures.work.gather", genres: ["creature-survival"], by: "sim",
    does: "Species have gather roles: a tame gathers its specialty resource far faster than the player's best tool.",
    proof: "Setup gives a specialist tame and the player's best tool for that node; play harvests the same node kind both ways for the same time, and the tame's yield of its specialty is at least twice the tool's.",
    depth: {
      find: "The creature's role is shown when it is tamed or inspected.",
      improves: "Specialist creatures gather specific materials far faster.",
      feeds: ["creatures.work.haul", "building.place-snap"],
      repeat: "Big builds and crafts need volumes only creatures gather.",
      fails: "An overloaded or starving creature stops working.",
    },
  },
  { id: "creatures.work.haul", genres: ["creature-survival"], by: "sim", does: "A tame carries weight so the player can haul more.", proof: "Play moves items into a tame's inventory and rides it while over the player's own limit." },
  { id: "creatures.work.lighter-loads", genres: ["creature-survival"], by: "sim", does: "A specialist tame carries its specialty resource at reduced weight.", proof: "Setup gives one stack of a resource; moved from the player's bag into the specialist tame, the same stack weighs less on the tame." },
  { id: "creatures.work.airlift", genres: ["creature-survival"], by: "sim", does: "A flying tame picks up a smaller creature or survivor and carries it.", proof: "Setup gives a ridden flyer over a small tame; play grabs it, flies, and drops it, and the small tame's position moved with the flyer." },
  { id: "creatures.feed-starve", genres: ["creature-survival"], by: "sim", does: "Tames eat from their own inventory or a shared trough; an unfed tame starves and dies.", proof: "Setup gives a tame with food and one without; waiting, the fed one's food meter refills from its inventory while the unfed one's health falls to death." },
  { id: "creatures.guard-base", genres: ["creature-survival"], by: "sim", does: "Tames left at the base defend it.", proof: "Setup leaves a tame guarding and spawns a raider; the tame drives it off." },
  { id: "creatures.behavior-modes", genres: ["creature-survival"], by: "sim", does: "Set a tame passive, neutral or aggressive, and it fights accordingly.", proof: "Setup places a tame by a wild creature; set passive it ignores it, set aggressive it attacks it." },
  { id: "creatures.level-up", genres: ["creature-survival"], by: "sim", does: "Tames gain experience and the player spends their levels on stats.", proof: "Setup gives a tame experience; play spends a point and the stat rises." },
  {
    id: "creatures.ride.ground", genres: ["creature-survival"], by: "sim",
    does: "Saddle a tame and ride it, steering and attacking from its back.",
    proof: "Setup gives a tame and its saddle; play equips the saddle, mounts, and moves faster than on foot.",
    depth: {
      find: "The first saddle unlocks soon after the first tame.",
      improves: "Faster, stronger mounts and better saddles.",
      feeds: ["creatures.work.haul", "spawns.danger-by-distance"],
      repeat: "Far biomes and caves need the right mount.",
      fails: "A tired or hurt mount throws the player into danger.",
    },
  },
  {
    id: "creatures.ride.fly", genres: ["creature-survival"], by: "sim",
    does: "Ride a flying tame: take off, climb, cross terrain that blocks walking, and land.",
    proof: "Setup gives a flyer and saddle at the foot of a cliff; play mounts, climbs well above the ground, crosses to the top, and lands there.",
    depth: {
      find: "Flyers are visible in the sky from the start; the saddle unlocks mid-game.",
      improves: "Bigger flyers carry more, fly further on their stamina, and lift creatures.",
      feeds: ["creatures.work.airlift", "cave.artifact-run"],
      repeat: "The map's far corners and peaks are trips only a flyer makes quickly.",
      fails: "Stamina runs out in the air and the flyer drops.",
    },
  },
  { id: "creatures.ride.swim", genres: ["creature-survival"], by: "sim", does: "Ride a swimming tame through water.", proof: "Setup gives a swimmer and saddle; play rides it across water faster than swimming." },

  // Creature survival: breeding.
  {
    id: "breeding.pair-mate", genres: ["creature-survival"], by: "sim",
    does: "Put a male and a female tame together and they produce an egg or a baby.",
    proof: "Setup gives a pair; play sets them to mate and the egg count rises.",
    depth: {
      find: "The tame's menu offers mating once a pair exists.",
      improves: "Each generation keeps the best stats of its parents.",
      feeds: ["breeding.inherit-mutate", "creatures.work.gather"],
      repeat: "Chasing better lines and mutations runs for hours.",
      fails: "A pair apart or unfed stops mating.",
    },
  },
  { id: "breeding.incubate", genres: ["creature-survival"], by: "sim", does: "An egg hatches only kept at the right temperature.", proof: "Setup gives an egg; play keeps it warm and it hatches; left cold it is lost." },
  { id: "breeding.raise-imprint", genres: ["creature-survival"], by: "sim", does: "Feed and care for a baby; care raises its quality as it grows.", proof: "Setup gives a baby; play answers its wants and its care reading rises." },
  { id: "breeding.inherit-mutate", genres: ["creature-survival"], by: "sim", does: "Offspring inherit their parents' stats, with a chance of mutation.", proof: "Setup gives two parents with different stats; play breeds them and the child takes stats from both." },

  // Creature survival: the world.
  { id: "spawns.biome-weighted", genres: ["creature-survival"], by: "sim", does: "Each region spawns its own creatures in its own mix.", proof: "Setup places the player in two regions; the creature mix read near each differs as the game says." },
  { id: "spawns.danger-by-distance", genres: ["creature-survival"], by: "sim", does: "Danger rises the further the player travels from the start.", proof: "Play travels outward; the wild levels read nearby rise." },
  { id: "spawns.respawn-population", genres: ["creature-survival"], by: "sim", does: "Killed or tamed creatures are replaced over time.", proof: "Play clears an area; waiting brings creatures back." },
  {
    id: "boss.summon-arena-reward", genres: ["creature-survival"], by: "sim",
    does: "Gather the offering, summon the boss at its altar, win the fight, take the reward.",
    proof: "Setup gives the offering and a fighting party; play summons at the altar, wins, and the reward reading rises.",
    depth: {
      find: "The altars are on the map and the guidance names the offering.",
      improves: "Harder difficulties ask more and give more.",
      feeds: ["cave.artifact-run", "breeding.inherit-mutate"],
      repeat: "Higher difficulties and the next boss.",
      fails: "Losing costs the offering and the creatures brought.",
    },
  },
  { id: "boss.phases", genres: ["creature-survival"], by: "sim", does: "A boss changes how it fights as it is hurt.", proof: "Setup starts a fight; play damages the boss and its phase reading advances." },
  { id: "boss.unlocks-progression", genres: ["creature-survival"], by: "sim", does: "Beating a boss unlocks something no other source gives.", proof: "Setup wins a fight; afterwards a recipe, level cap or item reads available that read unavailable before the fight." },
  {
    id: "cave.artifact-run", genres: ["creature-survival"], by: "sim",
    does: "Enter a cave, survive it, and take the artifact from its end.",
    proof: "Setup places the player at a cave mouth; play walks in, takes the artifact, and carries it out.",
    depth: {
      find: "Cave mouths are marked on the map.",
      improves: "Better gear and the right creature make deeper caves possible.",
      feeds: ["boss.summon-arena-reward", "harvest.tool-bias"],
      repeat: "Each boss needs artifacts from several caves.",
      fails: "Cave creatures and hazards kill; the gear stays in the dark.",
    },
  },
  { id: "cave.hazards", genres: ["creature-survival"], by: "sim", does: "Caves hold their own dangers: stronger creatures, cold, poison or dark.", proof: "Play walks into a cave; the danger reading rises over the surface's." },

  // Shooter.
  {
    id: "shooter.aim-fire-hit", genres: ["shooter"], by: "sim",
    does: "Aim, fire, and hurt an enemy.",
    proof: "Setup places an enemy ahead; play fires at it and its health falls.",
    depth: {
      find: "The first weapon is in hand at the start.",
      improves: "Better weapons, aim and upgrades.",
      feeds: ["shooter.reload-ammo", "loot.drops-rarity"],
      repeat: "New enemy types and weapons change how fights play.",
      fails: "Missed shots waste ammo and let enemies close in.",
    },
  },
  { id: "shooter.reload-ammo", genres: ["shooter"], by: "sim", does: "Weapons run dry and reload from carried ammo.", proof: "Play empties a magazine, reloads, and the carried ammo falls." },
  { id: "shooter.enemy-threat", genres: ["shooter"], by: "sim", does: "Enemies find the player and hurt them.", proof: "Setup spawns an enemy nearby; waiting, the player's health falls." },
  { id: "shooter.weapon-swap", genres: ["shooter"], by: "sim", does: "Switch between carried weapons.", proof: "Setup gives two weapons; play switches and the held weapon reading changes." },

  // Looter.
  {
    id: "loot.drops-rarity", genres: ["looter"], by: "sim",
    does: "Defeated enemies and containers drop loot of varied rarity.",
    proof: "Setup spawns enemies; play defeats them and picks up their drops.",
    depth: {
      find: "The first enemy drops something at once.",
      improves: "Rarer drops and better odds as the player levels.",
      feeds: ["loot.gear-upgrade", "loot.vendor-or-salvage"],
      repeat: "The chase for the next tier of rarity.",
      fails: "A full bag or a death loses the drop.",
    },
  },
  { id: "loot.gear-upgrade", genres: ["looter"], by: "sim", does: "Equipping better gear changes the player's numbers.", proof: "Setup gives a better item; play equips it and the stat reading rises." },
  { id: "loot.vendor-or-salvage", genres: ["looter"], by: "sim", does: "Unwanted loot sells or salvages into something useful.", proof: "Setup gives junk; play sells or salvages it and currency or materials rise." },
  { id: "loot.build-choices", genres: ["looter"], by: "sim", does: "Perks or skills let the player shape a build.", proof: "Setup gives a point; play picks a perk and its effect shows in play." },

  // Extraction.
  {
    id: "extraction.enter-run", genres: ["extraction"], by: "sim",
    does: "Go into a run with chosen gear.",
    proof: "Play starts a run from the hub; the in-run reading turns on.",
    depth: {
      find: "The hub's main action is the run.",
      improves: "Better kits and deeper zones.",
      feeds: ["extraction.extract-bank", "extraction.carry-limit"],
      repeat: "Each run's haul funds a riskier next run.",
      fails: "Taking too much in risks too much.",
    },
  },
  { id: "extraction.carry-limit", genres: ["extraction"], by: "sim", does: "What can be carried out is limited by space or weight.", proof: "Play picks up past the limit and is refused or slowed." },
  { id: "extraction.extract-bank", genres: ["extraction"], by: "sim", does: "Reaching an exit banks what was carried.", proof: "Setup gives carried loot near an exit; play walks out and the bank rises." },
  { id: "extraction.die-lose-carried", genres: ["extraction"], by: "sim", does: "Dying in a run loses what was carried.", proof: "Setup gives carried loot and danger; the player dies and the carried loot is gone." },

  // Tower defense.
  {
    id: "td.place-tower", genres: ["tower-defense"], by: "sim",
    does: "Place a defense and it attacks enemies in range.",
    proof: "Play places a defense on the path; a wave comes and enemies take damage.",
    depth: {
      find: "The first defense is affordable at the start and the build spots show.",
      improves: "New defense kinds and upgrades.",
      feeds: ["td.economy", "td.upgrade-tower"],
      repeat: "Each wave mix asks for a different layout.",
      fails: "A bad layout leaks enemies.",
    },
  },
  { id: "td.waves-escalate", genres: ["tower-defense"], by: "sim", does: "Waves grow harder as the game goes on.", proof: "Waiting through waves, the wave number and enemy strength readings rise." },
  { id: "td.upgrade-tower", genres: ["tower-defense"], by: "sim", does: "Upgrade a placed defense.", proof: "Setup gives currency and a defense; play upgrades it and its level rises." },
  { id: "td.leak-lose", genres: ["tower-defense"], by: "sim", does: "Enemies that get through cost lives, and running out loses.", proof: "With no defenses, waiting lets enemies through; lives fall to the loss." },
  { id: "td.economy", genres: ["tower-defense"], by: "sim", does: "Defeating enemies earns currency to build more.", proof: "Play defends a wave; currency rises." },

  // Strategy.
  {
    id: "strategy.select-order", genres: ["strategy"], by: "sim",
    does: "Select units and order them somewhere.",
    proof: "Play selects a unit and orders a move; it arrives.",
    depth: {
      find: "The first units are selectable at the start.",
      improves: "More unit types and abilities.",
      feeds: ["strategy.produce-units", "strategy.win-lose-condition"],
      repeat: "Every engagement is a new set of orders.",
      fails: "Bad orders lose units.",
    },
  },
  { id: "strategy.produce-units", genres: ["strategy"], by: "sim", does: "Spend resources to produce new units.", proof: "Setup gives resources; play queues a unit and it appears." },
  { id: "strategy.gather-economy", genres: ["strategy"], by: "sim", does: "Gather or capture resources over time.", proof: "Play orders gathering; resources rise." },
  { id: "strategy.win-lose-condition", genres: ["strategy"], by: "sim", does: "The match is won or lost by a stated condition.", proof: "Setup brings the condition near; play completes it and the result reading changes." },
  { id: "strategy.fog-scout", genres: ["strategy"], by: "sim", does: "Unexplored areas are hidden until scouted.", proof: "Play moves a unit into fog; the revealed reading rises." },

  // Tycoon.
  {
    id: "tycoon.build-attraction", genres: ["tycoon"], by: "sim",
    does: "Build something customers pay for.",
    proof: "Setup gives money; play builds an attraction and it opens.",
    depth: {
      find: "The build menu opens from the start.",
      improves: "Research and money unlock bigger attractions.",
      feeds: ["tycoon.customers-pay", "tycoon.unlock-research"],
      repeat: "Expansion and replacing old attractions.",
      fails: "Building what nobody wants loses money.",
    },
  },
  { id: "tycoon.customers-pay", genres: ["tycoon"], by: "sim", does: "Customers arrive, use attractions and pay.", proof: "With an attraction open, waiting brings customers and money rises." },
  { id: "tycoon.staff-upkeep", genres: ["tycoon"], by: "sim", does: "Staff and upkeep cost money over time.", proof: "Play hires staff; waiting, wages leave the balance." },
  { id: "tycoon.breakdowns", genres: ["tycoon"], by: "sim", does: "Things break down and need fixing.", proof: "Setup ages an attraction; it breaks, and a staff fix restores it." },
  { id: "tycoon.unlock-research", genres: ["tycoon"], by: "sim", does: "Research or milestones unlock new things to build.", proof: "Play funds research; waiting unlocks a new build option." },
  { id: "tycoon.bankrupt", genres: ["tycoon"], by: "sim", does: "Running out of money has consequences.", proof: "Setup drains money; the game warns and then ends or restricts play." },

  // Life sim.
  {
    id: "life.needs", genres: ["life-sim"], by: "sim",
    does: "A character's needs fall over time and actions refill them.",
    proof: "Waiting drains a need; play does the matching action and it refills.",
    depth: {
      find: "Needs show on the HUD from the start.",
      improves: "Better objects refill faster.",
      feeds: ["life.job-income", "life.home-decor"],
      repeat: "Balancing needs against work and friends.",
      fails: "Neglected needs block other actions.",
    },
  },
  { id: "life.job-income", genres: ["life-sim"], by: "sim", does: "Work earns money.", proof: "Play goes to work; money rises." },
  { id: "life.relationships", genres: ["life-sim"], by: "sim", does: "Talking to others builds relationships.", proof: "Play talks to a character; the relationship reading rises." },
  { id: "life.home-decor", genres: ["life-sim"], by: "sim", does: "Buy and place objects in a home.", proof: "Setup gives money; play buys and places an object." },

  // Racing.
  {
    id: "racing.drive-handling", genres: ["racing"], by: "sim",
    does: "Accelerate, brake and steer a vehicle that handles by its physics.",
    proof: "Play holds throttle and steers; speed and heading change.",
    depth: {
      find: "The first race is one press from the menu.",
      improves: "Faster vehicles and tuning.",
      feeds: ["racing.lap-timing", "racing.opponents"],
      repeat: "Shaving time and beating harder fields.",
      fails: "Overdriving a corner crashes or spins.",
    },
  },
  { id: "racing.lap-timing", genres: ["racing"], by: "sim", does: "Laps and checkpoints are timed.", proof: "Play drives a lap; the lap count and time readings change." },
  { id: "racing.opponents", genres: ["racing"], by: "sim", does: "Opponents race and finish in an order.", proof: "Waiting through a race, opponents progress and a finishing order exists." },
  { id: "racing.unlock-vehicles-tracks", genres: ["racing"], by: "sim", does: "Results unlock new vehicles or tracks.", proof: "Setup brings a race near the finish; play wins and an unlock reading rises." },
  { id: "racing.crash-recover", genres: ["racing"], by: "sim", does: "A crash or wrong way is recoverable.", proof: "Setup flips or strands the car; play resets and drives on." },

  // Open world.
  {
    id: "open-world.vehicle-enter-drive", genres: ["open-world"], by: "sim",
    does: "Walk to a vehicle, get in and drive.",
    proof: "Setup places a vehicle by the player; play enters it and moves.",
    depth: {
      find: "Vehicles stand where the player starts.",
      improves: "Faster vehicles and ones for new terrain.",
      feeds: ["open-world.jobs-pay", "open-world.pursuit"],
      repeat: "Jobs across the map need travel.",
      fails: "Crashes damage the vehicle and cost time.",
    },
  },
  { id: "open-world.jobs-pay", genres: ["open-world"], by: "sim", does: "Take a job, do it, get paid.", proof: "Play takes a job and completes it; money rises." },
  { id: "open-world.pursuit", genres: ["open-world"], by: "sim", does: "Breaking the rules brings pursuit the player can escape.", proof: "Setup raises heat; play escapes and it falls." },

  // Online.
  {
    id: "online.join-shared-world", genres: ["online"], by: "sim",
    does: "A second player joins the same world and each sees the other act.",
    proof: "Two sessions on one host; an action in one shows in the other.",
    depth: {
      find: "Joining is one choice from the menu, with no setup outside the game.",
      improves: "Shared projects and trade grow with the number of players.",
      feeds: ["online.persist-account", "progression.runway"],
      repeat: "Other players change the world between sessions.",
      fails: "A dropped connection must not lose progress or duplicate items.",
    },
  },
  { id: "online.persist-account", genres: ["online"], by: "sim", does: "A player's progress follows their account across sessions.", proof: "One session progresses, a later one as the same account reads it back." },
];
