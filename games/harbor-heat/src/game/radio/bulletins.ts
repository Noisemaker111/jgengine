import type { RadioBulletin } from "@jgengine/core/audio/radio";
import type { WorldLogEntry } from "@jgengine/core/worldModel/worldModel";

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The three stations' wording for one story: the news desk reads it straight, Sully rants, Luna keeps it light. */
function story(topic: string, priority: number, news: string[], talk: string[], dj: string[], cooldown = 75): RadioBulletin {
  return { topic, priority, cooldown, lines: news, byStation: { mnn: news, harbor_talk: talk, neon_tide: dj } };
}

/**
 * What the radio says about one line of the city's history, or null for the ones nobody calls in.
 * `place` is the readable place name ("Port Carmine"), or null when it happened nowhere declared.
 */
export function bulletinForLog(entry: Pick<WorldLogEntry, "kind" | "text">, place: string | null): RadioBulletin | null {
  const where = place ?? "Mainsail";
  if (entry.kind === "killing") {
    return story("killing", 2,
      [`MNN has reports of a fatal hit-and-run in ${where}.`, "The Canal Wardens are asking riders to slow down near the markets."],
      [`Somebody got run down in ${where} tonight.`, "Every night, scooters, flooding, scooters in the flooding. Slow down, people!"],
      [`Rough night over in ${where}. Ride gentle out there, lovers.`]);
  }
  if (entry.kind === "cop_down") {
    return story("cop_down", 3,
      [`A Canal Warden is down in ${where}.`, "Sergeant Dee Kalani says every warden boat is responding."],
      [`They knocked down a warden. In ${where}. A warden!`, "Whoever you are, buddy, the whole harbour is coming for you, and so is my opinion."],
      [`Warden down in ${where}. Sirens on the water. Keep your head down.`], 60);
  }
  if (entry.kind === "explosion") {
    return story("explosion", 2,
      [`Witnesses report an explosion in ${where}.`, "Fire boats are on the way. No word yet on the cause."],
      [`Something blew up in ${where}.`, "If that was a pizza oven, I want to know which pizzeria. For reasons."],
      [`Heard a big bang over ${where}? Yeah. That wasn't thunder.`]);
  }
  if (entry.kind === "job-done") {
    return story("story", 1,
      [`The flood desk hears Vell's Pizzeria had a big night: "${entry.text}".`],
      [`Everybody's talking about Vell's and "${entry.text}". A family shop beating MegaSlice? I'm rooting for 'em.`],
      [`"${entry.text}". Vell's rider, this one's for you.`], 30);
  }
  return null;
}

/** What the radio says when the wanted level crosses a line, or null when it stays put. */
export function bulletinForWanted(before: number, after: number, place: string | null): RadioBulletin | null {
  const where = place ?? "Mainsail";
  if (after >= 4 && before < 4) {
    return story("chase_big", 3,
      [`Every Canal Warden boat is chasing a rider around ${where}.`, "Riders and boaters are urged to pull over and let them through."],
      ["There is a full police chase going on right now. Full! Helicopters, SWAT, the works.", "Whoever you are, pal, keep the radio on. You're famous."],
      ["Hear the sirens? Half the city's chasing somebody tonight. This one's for the getaway."], 120);
  }
  if (after >= 2 && before < 2) {
    return story("chase", 2,
      [`Canal Wardens are chasing a reckless rider near ${where}.`],
      [`Cops chasing somebody near ${where}. My money's on the guy running.`],
      [`Sirens near ${where}. Somebody's having an exciting evening.`], 90);
  }
  if (after === 0 && before >= 3) {
    return story("chase_lost", 2,
      ["The Canal Wardens have called off their chase. The rider got away."],
      ["They lost him! Whole department, and they lost him. Your tax dollars, people."],
      ["Looks like whoever the Wardens were chasing just slipped away. Smooth."], 90);
  }
  return null;
}

/** What the radio says about a street race the player won. */
export function bulletinForRace(label: string, timeSec: number): RadioBulletin {
  const time = `${Math.floor(timeSec / 60)} minutes ${Math.round(timeSec % 60)} seconds`;
  return story("race", 1,
    [`Residents near the ${label} route are complaining about illegal street racing again.`, `One witness clocked the winner at ${time}.`],
    [`Street racers on the ${label} again. ${time}! I can't get to the grocery store in ${time}.`],
    [`Somebody just took the ${label} in ${time}. That's the kind of driving this station is for.`], 60);
}

/** What each station says when the tide reaches a new stage of the night. */
export function bulletinForTide(stage: { id: string; index: number; label: string; note: string }): RadioBulletin {
  const lines: Record<string, [string[], string[], string[]]> = {
    wet: [
      ["MNN flood desk: the evening tide is in at the docks. Port Carmine streets are wet."],
      ["Water's at the docks again. Every night! Who designed this city, a fish?"],
      ["Tide's coming in, Mainsail. Roll up your trousers and keep it locked here."],
    ],
    canal: [
      ["The flood desk reports Port Carmine streets closed to cars. Water taxis and boats only."],
      ["Port Carmine is a canal. Again. If you drove down there, you now own a submarine."],
      ["Canal hour, lovers. The docks are a lagoon and the neon's doubled in the water."],
    ],
    high: [
      ["High water warning: Mainsail Boulevard is under. Downtown streets are expected to follow."],
      ["The boulevard is gone. My neighbour is paddling his couch past my window right now."],
      ["High water! Boats out, scooters in, and somebody please bring me a pizza."],
    ],
    king: [
      ["King tide: every district but Palm Heights is flooded. Use bridges, boats, or the air."],
      ["King tide! The whole city's a bathtub. If you can see a pizza blimp up there, wave."],
      ["It's the king tide, Mainsail. The city's a mirror tonight. This one's for the riders."],
    ],
  };
  const [news, talk, dj] = lines[stage.id] ?? [[stage.note], [stage.note], [stage.note]];
  return story(`tide.${stage.id}`, stage.index >= 3 ? 2 : 1, news, talk, dj, 60);
}
