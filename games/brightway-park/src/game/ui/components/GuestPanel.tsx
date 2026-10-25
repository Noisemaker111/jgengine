import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { parkObject } from "../../park";
import { session } from "../../session";
import { liveAgent } from "../../agents";
import { guestRidePreference } from "../../sim/rideExperience";
import { CloseButton, Rows } from "./Inspector";

/** What a guest is doing, read from its own phase/target - the "thought" the window shows. */
function activity(name: string | null, phase: string): string {
  if (phase === "leaving") return "Leaving the park";
  if (phase === "riding") return name === null ? "On a ride" : `Riding the ${name}`;
  if (phase === "queued") return name === null ? "In line" : `Waiting in line for the ${name}`;
  if (phase === "busy") return name === null ? "Enjoying the midway" : `On the ${name}`;
  if (name !== null) return `Heading for the ${name}`;
  return "Looking for something to do";
}

/** The guest window: the mood the shared agent loop holds, what it is thinking, its needs, and what it is doing. */
export function GuestPanel({ id }: { id: string }) {
  const ctx = useGameContext();
  const view = useGameStore(() => {
    const guest = session.guests.get(id);
    if (guest === undefined) return null;
    const agent = liveAgent(id);
    const mood = agent?.mood();
    const fullness = (need: string) => Math.round((agent?.needs.fraction(need) ?? 0) * 100);
    return [guest.kind, mood?.label ?? "", Math.round(mood?.score ?? 0), Math.round(guest.money), fullness("hunger"), fullness("thirst"), guest.visits, guest.phase, guest.targetId ?? "",
      fullness("toilet"), fullness("nausea"), fullness("energy"), fullness("info"), (guest.thoughts ?? []).map((thought) => thought.text).join("~")].join("|");
  });
  if (view === null) return null;
  const [kind, moodLabel, moodScore, money, fullness, thirst, visits, phase, targetId, toilet, stomach, energy, bearings, thoughts] = view.split("|");
  const score = Number(moodScore);
  return (
    <KitPanel variant="card" aria-label="Guest details" eyebrow="🎟️ Guest" title={guestRidePreference(kind!).label} aside={<CloseButton label="Close guest window" />}>
      <p className="bw-blurb">{activity(parkObject(ctx, targetId === "" ? null : targetId!)?.def.label ?? null, phase!)}</p>
      <KitMeter size="sm" label={`Mood · ${moodLabel}`} value={score} max={100} readout={`${score}%`} tone={score >= 50 ? "good" : score >= 35 ? "warn" : "bad"} />
      {thoughts ? <ul className="bw-thoughts" aria-label="Guest thoughts">
        {thoughts.split("~").map((text, i) => <li key={i} data-latest={i === 0 ? "" : undefined}>“{text}”</li>)}
      </ul> : null}
      <Rows rows={[["Money", `$${money}`], ["Hungry", `${100 - Number(fullness)}%`], ["Thirsty", `${100 - Number(thirst)}%`],
        ["Needs the toilet", `${100 - Number(toilet)}%`], ["Queasy", `${100 - Number(stomach)}%`], ["Tired", `${100 - Number(energy)}%`], ["Lost", `${100 - Number(bearings)}%`], ["Stops made", visits]]} />
    </KitPanel>
  );
}
