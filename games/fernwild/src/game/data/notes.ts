/**
 * Explorer notes, as ARK scatters them: pages left by survivors who came before, one at each of the
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
  { at: "peak_south_haven", title: "Ilse's page, day 1", text: "Woke on the sand with a stone in my fist and nothing else. The little birds don't run. Punch one asleep, feed it berries, and it follows you like a dog." },
  { at: "cave_lower_south_cave", title: "Ilse's page, day 4", text: "There is a cave behind the southern bluffs that breathes cold air. Something glows at the bottom. I heard claws on the stone and came back out." },
  { at: "cave_upper_south_cave", title: "Ilse's page, day 9", text: "Second cave, higher up. Torches help. The spiders inside do not sleep, and they do not miss." },
  { at: "obelisk_green", title: "Ilse's page, day 12", text: "The green pillar hums over the jungle. Its foot has a panel with three empty sockets. It wants the glowing things from the caves." },
  { at: "peak_craggs_island", title: "Bram's log, first entry", text: "Built a thatch hut on the Craggs. The first storm took the roof. Wood walls next, and a door that shuts." },
  { at: "peak_dead_island", title: "Bram's log, the dead island", text: "Nothing grows here and the big ones swim out at night. If you can see this page from the water, turn back." },
  { at: "cave_central_cave", title: "Bram's log, the deep cave", text: "Central cave. It goes down and down. Bring a saddle-broken mount and a lot of meat. Bring friends." },
  { at: "peak_weathertop", title: "Bram's log, Weathertop", text: "From up here you see the whole island: the redwoods, the swamp, the snow. The higher you go, the meaner the animals get." },
  { at: "cave_swamp_cave", title: "Bram's log, the swamp", text: "Leeches in the water, snakes in the roots. The cave under the swamp keeps something the green pillar wants." },
  { at: "peak_red_peak", title: "Nadia's notebook: red rock", text: "Metal glints in the red rock up here. A stone pick barely scratches it, but it is the only metal I have found." },
  { at: "obelisk_red", title: "Nadia's notebook: the red pillar", text: "The red pillar is the coldest of the three. Something big lives where it points. I am not ready." },
  { at: "cave_lava_cave", title: "Nadia's notebook: the lava cave", text: "Heat comes off the walls like an oven. Drink before you go in, and carry more water than you think." },
  { at: "peak_volcano", title: "Nadia's notebook: the volcano", text: "Black glass on the slopes, sharp enough to shave with. The ground shakes when the sky goes orange." },
  { at: "obelisk_blue", title: "Nadia's notebook: the blue pillar", text: "Three pillars, three colours, all humming the same note. Whoever built them built the island too." },
  { at: "cave_north_west_cave", title: "Tomas's diary: the north-west", text: "The north-west cave is a maze. Mark your turns. I lost a raptor in there and nearly lost myself." },
  { at: "peak_whitesky", title: "Tomas's diary: Whitesky", text: "Snow to the knee. Furs or a fire, or the cold will have you before the wolves do." },
  { at: "peak_fars_peak", title: "Tomas's diary: Far's Peak", text: "Crystal grows out of the rock up here like ice that never melts. It rings when you strike it." },
  { at: "cave_north_east_cave", title: "Tomas's diary: the north-east", text: "The north-east cave floods at the back. Hold your breath, swim the dark, and the chamber is dry on the other side." },
  { at: "peak_frozen_fang", title: "Tomas's diary: Frozen Fang", text: "The tallest point I have climbed. Below, a herd of giants walks the shore, and nothing bothers them." },
  { at: "peak_frozen_tooth", title: "Tomas's diary: Frozen Tooth", text: "Oil seeps out of the black rocks on the frozen shore. Somebody once had machines here." },
  { at: "cave_snow_cave", title: "Tomas's diary, last page", text: "The snow cave's artifact is the last I need. If you are reading this, I went to the pillar. Follow if you dare." },
];
