/**
 * Explorer notes, as the genre scatters them: pages left by technicians who came before, one at each of the
 * Island's landmarks (an `obelisk`, `cave` or `peak` in editor.scene.json, keyed by its id). Reading one
 * gives experience and a line in the dossier. The writers and their words are ours, not ARK's.
 */
export interface NoteDef {
  /** The landmark it lies at. */
  at: string;
  title: string;
  text: string;
}

/** Experience for reading a note the first time (ARK gives a few hundred at its scale; ours is levelled to the first hours). */
export const NOTE_XP = 30;

export const NOTES: readonly NoteDef[] = [
  { at: "peak_south_haven", title: "Ilse's page, day 1", text: "Washed up with a multitool and a pocket of fuses. The little lawnmower things don't run. Punch one until its lights go out, jack in, feed it berries, and it trundles after you like a dog." },
  { at: "cave_lower_south_cave", title: "Ilse's page, day 4", text: "A cave behind the southern bluffs breathes cold air. Something glows at the bottom: a colony data shard on a pedestal. I heard servos on the stone and came back out." },
  { at: "cave_upper_south_cave", title: "Ilse's page, day 9", text: "Second cave, higher up. Torches help, but the light-seekers come for them. The hive drones inside do not sleep, and they do not miss." },
  { at: "obelisk_green", title: "Ilse's page, day 12", text: "The green pylon hums over the jungle. Its terminal has three empty slots for data shards. Behind the hum there is a voice that is many voices: the Hivemind." },
  { at: "peak_craggs_island", title: "Bram's log, first entry", text: "Built a thatch hut on the Craggs. The sixth night the sky crackled, every eye in the jungle turned red, and my Craneback walked off into the trees. Roof your bots before a Signal Storm." },
  { at: "peak_dead_island", title: "Bram's log, the dead island", text: "Nothing grows here. The big vacuum leviathans hoover the shallows at night and leave you alone unless you poke them. Don't poke them." },
  { at: "cave_central_cave", title: "Bram's log, the deep cave", text: "Central cave. It goes down and down. Bring a rigged mount, drain spikes and a lot of biogel. Bring friends." },
  { at: "peak_weathertop", title: "Bram's log, Weathertop", text: "From up here you see the whole island: the redwoods, the swamp, the snow. Watch the eyes: green grazes, yellow runs, orange guards, red hunts, magenta comes in packs, violet waits for you." },
  { at: "cave_swamp_cave", title: "Bram's log, the swamp", text: "Siphon drones in the water, cable snakes in the roots, Arcwires that turn the whole river into a live wire. Stay out of the water when one bites." },
  { at: "peak_red_peak", title: "Nadia's notebook: red rock", text: "Metal glints in the red rock. A Thermite Beetle cuts it like butter; my stone pick barely scratches it. Upload a beetle." },
  { at: "obelisk_red", title: "Nadia's notebook: the red pylon", text: "The red pylon is the coldest of the three. The Scrapper Rex hunts below it, tearing other machines apart and bolting their parts on. It was bigger every time I saw it." },
  { at: "cave_lava_cave", title: "Nadia's notebook: the lava cave", text: "Heat comes off the walls like an oven, and at the bottom the racks are still running: the Root Server. Every storm starts down there. Bring water, bring a crew, and pull its plug." },
  { at: "peak_volcano", title: "Nadia's notebook: the volcano", text: "Black glass on the slopes, sharp enough to shave with. In hard sun my bots overheat and run down twice as fast. Shade, or a roof." },
  { at: "obelisk_blue", title: "Nadia's notebook: the blue pylon", text: "Three pylons, three colours, all humming the same carrier wave. The colony built them to talk to its machines. The machines are still listening." },
  { at: "cave_north_west_cave", title: "Tomas's diary: the north-west", text: "The north-west cave is a maze. Mark your turns. A Klepto blinked out of the dark, took my ingots and vanished. Knock one down and its nest of stolen goods is yours." },
  { at: "peak_whitesky", title: "Tomas's diary: Whitesky", text: "Snow to the knee. Furs or a fire, or the cold will have you before the Frostbyte packs do." },
  { at: "peak_fars_peak", title: "Tomas's diary: Far's Peak", text: "Crystal grows out of the rock up here like ice that never melts. The Watchwing I parked by my camp pinged three hunters before I ever saw them." },
  { at: "cave_north_east_cave", title: "Tomas's diary: the north-east", text: "The north-east cave floods at the back. Hold your breath, swim the dark, and the chamber is dry on the other side. Something there glows like loot. It is not loot. It is a Lampjaw." },
  { at: "peak_frozen_fang", title: "Tomas's diary: Frozen Fang", text: "The tallest point I have climbed. Below, Pylon Walkers stride the shore, and nothing bothers them. The trees near my camp moved last night. Don't chop where the forest stands too straight." },
  { at: "peak_frozen_tooth", title: "Tomas's diary: Frozen Tooth", text: "Oil seeps out of the black rocks on the frozen shore. Rain rusts a bot's joints, oil keeps them moving. The colony's machines were built to be cared for." },
  { at: "cave_snow_cave", title: "Tomas's diary, last page", text: "The snow cave's shard is the last I need. If you are reading this, I went to the pylon. The Hivemind reaches into your bots when she is hurt. Follow if you dare." },
];
