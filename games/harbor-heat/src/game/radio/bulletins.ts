import type { RadioBulletin } from "@jgengine/core/audio/radio";
import type { WorldLogEntry } from "@jgengine/core/worldModel/worldModel";
import { turfWar } from "../city";

/** How the radio names each crew; the player is nobody's crew. */
const CREW: Record<string, string> = { carmine: "the Carmines", riptide: "the Riptides" };
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
      [`MNN has reports of a fatal shooting in ${where}.`, "HHPD is asking anyone who saw anything to come forward."],
      [`Somebody got killed in ${where} tonight.`, "Folks, I've lived here forty years and I have never once felt safe. I love it."],
      [`Rough night over in ${where}. Maybe take the long way round.`]);
  }
  if (entry.kind === "ganger_down") {
    return story("gang", 1,
      [`Police say another member of the Carmine crew was shot in ${where}, in what they call an ongoing gang dispute.`],
      ["Another Carmine guy down.", "Am I crying? No. Is anybody crying? Call in if you're crying."],
      [`Somebody is having a very bad week to be Carmine crew in ${where}.`], 90);
  }
  if (entry.kind === "cop_down") {
    return story("cop_down", 3,
      [`An HHPD officer is down in ${where}.`, "Sergeant Dee Kalani says every available unit is responding, and the department is asking the public to stay clear."],
      [`They shot a cop. In ${where}. A cop!`,"Whoever you are, buddy, the whole department is coming for you, and so is my opinion."],
      [`Officer down in ${where}. Sirens everywhere. Keep your head down out there.`], 60);
  }
  if (entry.kind === "explosion") {
    return story("explosion", 2,
      [`Witnesses report an explosion in ${where}.`, "Fire crews are on the way. No word yet on the cause."],
      [`Something blew up in ${where}.`, "In my day we blew things up on the Fourth of July, like Americans."],
      [`Heard a big bang over ${where}? Yeah. That wasn't thunder.`]);
  }
  if (entry.kind === "riptide_down") {
    return story("gang", 1,
      [`A man police describe as a Riptide smuggler was shot in ${where}.`],
      ["The Riptides lost another one. Who are these guys? Boat people? Call in if you're a boat person."],
      [`Bad night to be Riptide crew around ${where}.`], 90);
  }
  const handover = turfWar.handover(entry.kind);
  if (handover !== null) {
    const loser = CREW[handover.from] ?? "the old crew";
    const taker = CREW[handover.to];
    if (taker === undefined) {
      return story(`turf.${handover.block}`, 2,
        [`Sources say ${loser} have lost control of ${where}.`, "Residents report new faces on the corners."],
        [`${cap(loser)} just lost ${where}!`, "Somebody new runs that block now, and honestly, they can't be worse. Can they? Don't answer that."],
        [`Word is ${where} changed hands tonight. New management, same sunset.`], 120);
    }
    return story(`turf.${handover.block}`, 2,
      [`${cap(taker)} appear to be in control of ${where}, taking it from ${loser}.`],
      [`${cap(taker)} took ${where}. Of course they did. Nothing changes in this town but the paint.`],
      [`Looks like ${taker} run ${where} now. Lock your doors, lovers.`], 120);
  }
  if (entry.kind.startsWith("turf_push:")) {
    if (entry.kind.endsWith("_war")) {
      return story("crew_war", 2,
        [`Gunfire in ${where} as the Carmine and Riptide crews fight over the block.`],
        [`The Carmines and the Riptides are shooting each other in ${where}. Folks, grab popcorn. From a distance.`],
        [`Two crews going at it in ${where}. Whoever wins, steer clear tonight.`], 120);
    }
    const crew = entry.kind.includes("riptide") ? "Riptide" : "Carmine";
    return story("turf_push", 1,
      [`Residents of ${where} report ${crew} crews moving into the neighbourhood.`],
      [`${crew} boys pushing into ${where}. It's like a tide, folks, a tide of guys in tracksuits.`],
      [`${crew} crews rolling into ${where}. Just so you know.`], 120);
  }
  if (entry.kind === "raid") {
    return story("raid", 2,
      [`Breaking: armed men are reported smashing up a business in ${where}.`],
      [`They're hitting a business in ${where} right now. Right now! Somebody do something. Not me. Somebody.`],
      [`Somebody's place is getting wrecked in ${where}. If it's yours, go.`], 45);
  }
  if (entry.kind === "raid_repelled") {
    return story("raid_end", 1,
      [`Owners in ${where} say a local ran off the armed crew that hit their business.`],
      ["Some hero ran the Carmines off a business. A hero! Or a competitor. In this town, same thing."],
      [`Somebody stood up for a business in ${where} tonight. Respect.`], 45);
  }
  if (entry.kind === "raid_lost") {
    return story("raid_end", 1,
      [`A business in ${where} was wrecked by a Carmine crew. Damage is still being counted.`],
      ["They wrecked the place. Smashed it. And the insurance? Mainsail Mutual. So, nothing."],
      [`${where} lost a good spot tonight. Pour one out.`], 45);
  }
  if (entry.kind === "job-done") {
    return story("story", 1,
      [`Police are still piecing together tonight's events, which insiders are calling "${entry.text}".`],
      [`Everybody's whispering about "${entry.text}". Nobody will tell me what it is. Call me. Tell me.`],
      [`The street's calling tonight "${entry.text}". Whatever it was, I hope it had a soundtrack.`], 30);
  }
  return null;
}

/** What the radio says when the wanted level crosses a line, or null when it stays put. */
export function bulletinForWanted(before: number, after: number, place: string | null): RadioBulletin | null {
  const where = place ?? "Mainsail";
  if (after >= 4 && before < 4) {
    return story("chase_big", 3,
      [`Every HHPD unit is now in pursuit of a suspect around ${where}.`, "The department has called in heavy units. Drivers are urged to pull over and let them through."],
      ["There is a full police chase going on right now. Full! Helicopters, SWAT, the works.", "Whoever you are, pal, keep the radio on. You're famous."],
      ["Hear the sirens? Half the city's chasing somebody tonight. This one's for the getaway."], 120);
  }
  if (after >= 2 && before < 2) {
    return story("chase", 2,
      [`HHPD units are in pursuit of a suspect near ${where}.`],
      [`Cops chasing somebody near ${where}. My money's on the guy running.`],
      [`Sirens near ${where}. Somebody's having an exciting evening.`], 90);
  }
  if (after === 0 && before >= 3) {
    return story("chase_lost", 2,
      ["HHPD has called off its search. The suspect remains at large."],
      ["They lost him! Whole department, and they lost him. Your tax dollars, people."],
      ["Looks like whoever HHPD was chasing just slipped away. Smooth."], 90);
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
