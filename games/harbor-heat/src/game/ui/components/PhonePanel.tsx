import { useRef, type ReactNode } from "react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useActionGlyph } from "@jgengine/react/uiKitRoot";
import { cityOf, phoneStore } from "../../cityRuntime";
import { frontViews } from "../../city/fronts";
import { payoffCost, turfViews } from "../../city/street";
import { handrollOf } from "../../handroll";
import { GIG_RACE_STAKE, gigStore } from "../../jobs/gigs";
import { BurnerPhone } from "../fiction/BurnerPhone";

function readPhone(ctx: GameContext) {
  const world = cityOf(ctx);
  const factions = Object.entries(world.def.factions ?? {}).map(([id, faction]) => ({ id, label: faction.label ?? id, mood: Math.round(world.num(`${id}.mood`)) }));
  const stars = handrollOf(ctx).wanted().stars;
  const dee = world.fact("dee.known") === true && world.num("dee.trust") > -20;
  return {
    contacts: world.contacts(),
    news: [...world.log()].reverse().slice(0, 4),
    factions,
    turf: turfViews(ctx),
    fronts: frontViews(ctx).filter((front) => front.owned),
    takings: Math.floor(world.num("fronts.takings")),
    payoff: dee && stars > 0 ? payoffCost(stars) : null,
    gigs: { duty: gigStore.read(ctx).duty, busy: gigStore.read(ctx).view !== null, streak: gigStore.read(ctx).streak, driving: handrollOf(ctx).drivingVehicleId() !== null },
  };
}

const moodWord = (mood: number) => (mood <= -40 ? "furious" : mood <= -10 ? "angry" : mood >= 20 ? "friendly" : "calm");

/**
 * The burner's City app: a read of the town on the same handset as pause and settings. A message from
 * Dee sits on top while she can lose a report for you; then contacts and their jobs, how each crew
 * feels, who holds which block, what your fronts earn, and the news wire. The wheel or the d-pad
 * scrolls it; the right softkey (or T) puts it away.
 */
export function PhonePanel() {
  const open = useStore(phoneStore, (v) => v === true);
  const { commands } = useGame();
  const glyph = useActionGlyph("phone", "T");
  const list = useRef<HTMLDivElement>(null);
  const phone = useGameStore((ctx) => (open ? readPhone(ctx) : null), (a, b) => JSON.stringify(a) === JSON.stringify(b));
  if (phone === null) return null;
  const scroll = (dy: number) => list.current?.scrollBy({ top: dy, behavior: "smooth" });
  const putAway = () => commands.run("phone", {});
  return (
    <BurnerPhone
      label="Phone"
      app="City"
      className="hh-city-phone"
      keypad={false}
      softLeft={phone.payoff === null ? undefined : { label: "Pay Dee", run: () => commands.run("city.payoff", {}) }}
      softRight={{ label: glyph === undefined ? "Put away" : `Put away · ${glyph}`, run: putAway }}
      pad={{ up: () => scroll(-72), down: () => scroll(72) }}
    >
      <div className="hh-city" ref={list}>
        {phone.payoff === null ? null : (
          <div className="hh-city-msg">
            <small>Dee · HHPD records</small>
            <p>&ldquo;Cash and a report goes missing.&rdquo;</p>
            <button type="button" className="hh-city-btn" onClick={() => commands.run("city.payoff", {})}>Pay Dee to lose a report · ${phone.payoff}</button>
          </div>
        )}
        {phone.contacts.map((contact) => (
          <div key={contact.id} className="hh-city-contact">
            <b>{contact.name}</b>
            <q>{contact.line ?? "..."}</q>
            {contact.jobs.filter((job) => job.status !== "done").map((job) => (
              <span key={job.id} className="hh-city-row">
                <span>{job.title}</span>
                <em data-tone={job.status === "failed" ? "bad" : "good"}>{job.status === "active" ? "on it" : job.status === "failed" ? "retry" : "open"}</em>
              </span>
            ))}
          </div>
        ))}
        <h3 className="hh-city-head">Side work</h3>
        <span className="hh-city-row"><span>Taxi light{phone.gigs.streak > 0 ? ` · streak ${phone.gigs.streak}` : ""}</span><em data-tone={phone.gigs.duty ? "good" : "bad"}>{phone.gigs.duty ? "on" : "off"}</em></span>
        <button type="button" className="hh-city-btn" disabled={!phone.gigs.driving && !phone.gigs.duty} onClick={() => commands.run("taxiDuty", {})}>{phone.gigs.duty ? "Switch the taxi light off" : phone.gigs.driving ? "Work fares in this car" : "Get in a car to work fares"}</button>
        <button type="button" className="hh-city-btn" disabled={!phone.gigs.driving || phone.gigs.busy} onClick={() => commands.run("gigs.race", {})}>{`Find a street race · ${GIG_RACE_STAKE} stake`}</button>
        <h3 className="hh-city-head">Street</h3>
        {phone.factions.map((faction) => (
          <span key={faction.id} className="hh-city-row"><span>{faction.label}</span><em data-tone={faction.mood <= -10 ? "bad" : "good"}>{moodWord(faction.mood)} ({faction.mood})</em></span>
        ))}
        <h3 className="hh-city-head">Turf</h3>
        {phone.turf.map((block) => (
          <span key={block.id} className="hh-city-row"><span>{block.label}</span><em data-tone={block.owner === "player" ? "good" : "bad"}>{block.owner === "player" ? "yours" : block.owner === "riptide" ? "Riptide" : "Carmine"} · hold {block.grip}{block.attacker !== "" && block.attacker !== block.owner ? ` · ${block.attacker === "player" ? "you" : block.attacker === "riptide" ? "Riptides" : "Carmines"} pushing` : ""}</em></span>
        ))}
        {phone.fronts.length > 0 ? <h3 className="hh-city-head">{`Fronts · safe $${phone.takings}`}</h3> : null}
        {phone.fronts.map((front) => (
          <span key={front.slot} className="hh-city-row"><span>{front.label}</span><em data-tone={front.status === "open" ? "good" : "bad"}>{front.status === "raid" ? `RAID ${front.raidSeconds}s` : front.status === "wrecked" ? "wrecked" : `$${front.income}/s`}</em></span>
        ))}
        {phone.news.length > 0 ? <h3 className="hh-city-head">News wire</h3> : null}
        {phone.news.map((entry, i) => <p key={`${entry.at}-${i}`} className="hh-city-news">{entry.text}</p>)}
      </div>
    </BurnerPhone>
  );
}

/** A little rubber key on the HUD's top edge: the printed name, the bound key, and a tap target on touch. */
function HudKey({ label, glyph, onClick, children }: { label: string; glyph: string | undefined; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="hh-hudkey" onClick={onClick}>
      <span className="hh-hudkey-icon" aria-hidden="true">{children}</span>
      <span className="hh-hudkey-label">{label}</span>
      {glyph === undefined ? null : <kbd>{glyph}</kbd>}
    </button>
  );
}

/** The phone on the HUD, so a touch screen can reach it too. */
export function PhoneButton() {
  const { commands } = useGame();
  return (
    <HudKey label="Phone" glyph={useActionGlyph("phone", "T")} onClick={() => commands.run("phone", {})}>
      <i className="hh-mini-phone" />
    </HudKey>
  );
}

/** Pause, as the same rubber key. */
export function PauseButton() {
  const { commands } = useGame();
  return (
    <HudKey label="Pause" glyph={useActionGlyph("pause", "P")} onClick={() => commands.run("session.pause", { paused: true })}>
      <GameIcon name="pause" size={14} />
    </HudKey>
  );
}
