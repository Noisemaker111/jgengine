import type { MissionDef } from "@jgengine/core/mission/mission";
import { calm, defineWorldModel } from "@jgengine/core/worldModel/worldModel";

/**
 * Mainsail as one world for HIGH TIDE PIZZA: who lives here, which rival pizzeria works which end of
 * town, the story of saving Vell's from MegaSlice chapter by chapter, and how a wreck or a reckless
 * rider spreads through the city. Map blips, the phone, dialogue, the pager's "what next", mission facts
 * and resident panic all read this; nothing else keeps its own copy.
 *
 * Every story objective reads a `pizza.*` fact the shift publishes each tick (career deliveries, swaps,
 * hull drops, stacked drops, riders shaken, upstairs drops, money paid off the note, the shop saved, and
 * the score of the set-piece night that is running). The set-piece nights themselves (the Lantern
 * Festival, the storm surge, the blackout) are jobs whose world effects `game/pizza/nights.ts` applies
 * while the job is live and the shop is open.
 */

const PLAYER = "harbor_player";

const mission = (id: string, title: string, objectives: MissionDef["objectives"], cash: number, fail: MissionDef["fail"] = []): MissionDef => ({
  id,
  title,
  objectives,
  fail,
  rewards: { economy: { cash } },
});

/** A story step that waits for a pizza fact to reach a number. */
const reach = (id: string, fact: string, atLeast: number, label: string, next?: string): MissionDef["objectives"][number] => ({
  id,
  kind: "survive",
  until: { fact, atLeast },
  label,
  ...(next === undefined ? {} : { next }),
});

/** A set-piece night: deliver `count` boxes while it runs; the shift closing first rains it out. */
const setPiece = (id: string, title: string, count: number, label: string, cash: number): MissionDef =>
  mission(
    id,
    title,
    [{ ...reach("night", "pizza.night_score", count, label), failOn: [{ kind: "fact", fact: "pizza.night_failed", is: true, to: "rained_out", message: "Midnight came first. Try the night again." }] }],
    cash,
    [{ id: "rained_out", message: "Midnight came first. Try the night again." }],
  );

/** The rival pizzerias; MegaSlice is the chain that holds the family's note. */
export const RIVALS = ["carmine", "riptide", "megaslice"] as const;
export type RivalId = (typeof RIVALS)[number];

/** The set-piece nights, by the job that runs them. */
export const SET_PIECES = { festival_night: "festival", storm_surge: "storm", blackout: "blackout" } as const;
export type SetPieceJob = keyof typeof SET_PIECES;
export type SetPiece = (typeof SET_PIECES)[SetPieceJob];

export const city = defineWorldModel({
  factions: {
    carmine: { label: "Carmine's Crust (rival pizzeria)", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    riptide: { label: "Riptide Slice (rival pizzeria)", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    megaslice: { label: "MegaSlice (the chain)", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    hhpd: { label: "Canal Wardens", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    locals: { label: "Mainsail locals", facts: { mood: calm(0, 0.08, { min: -100, max: 100 }) } },
  },
  places: {
    boulevard: { label: "Mainsail Boulevard", position: [-170, 0], radius: 110, owner: "locals", facts: { fear: calm(0, 1.5) } },
    downtown: { label: "Downtown Vice", position: [40, -60], radius: 120, owner: "megaslice", facts: { fear: calm(0, 1.5) } },
    port: { label: "Port Carmine", marker: "dock_fight", radius: 100, owner: "carmine", facts: { fear: calm(0, 1.5) } },
    heights: { label: "Palm Heights", marker: "kingpin", radius: 90, owner: "locals", facts: { fear: calm(0, 1.5) } },
    canal: { label: "Canal Row", marker: "bounty_canal", radius: 42, owner: "riptide", facts: { fear: calm(0, 1.5) } },
    marina: { label: "the Marina", marker: "bounty_marina", radius: 40, owner: "locals", facts: { fear: calm(0, 1.5) } },
    saltworks: { label: "the Saltworks Yards", marker: "riptide_yards", radius: 50, owner: "riptide", facts: { fear: calm(0, 1.5) } },
    strand: { label: "the East Strand", marker: "riptide_strand", radius: 40, owner: "riptide", facts: { fear: calm(0, 1.5) } },
    flats: { label: "the Low Flats", marker: "riptide_flats", radius: 45, owner: "locals", facts: { fear: calm(0, 1.5) } },
    vells: { label: "Vell's Pizzeria", marker: "nonna", radius: 20, owner: "locals" },
    neon: { label: "the neon strip", marker: "marco", radius: 20, owner: "locals" },
    motors: { label: "Sunset Motors", marker: "garage", radius: 20, owner: "locals" },
    precinct: { label: "the Wardens' post", marker: "hhpd_station", radius: 20, owner: "hhpd" },
  },
  people: {
    nonna: {
      name: "Nonna Rosa Vell",
      faction: "locals",
      at: "vells",
      phone: true,
      blip: { icon: "contact" },
      says: [
        { text: "The Wardens are after you? Slow down, cara. Nobody tips a rider in handcuffs.", when: { "police.stars": { atLeast: 2 } } },
        { text: "Three boxes, three happy people. Then come and see me.", when: { "jobs.welcome": { is: "done", not: true } } },
        { text: "Tonight the water comes up to your knees. Learn the swap docks or swim.", when: { "jobs.learn_water": { is: "done", not: true } } },
        { text: "Tony Carmine's boys are stealing our boxes off the bikes. Stack a run and make them chase you.", when: { "jobs.crust_war": { is: "done", not: true } } },
        { text: "The Lantern Festival! The whole city orders on lantern night. We need every box hot.", when: { "jobs.festival_night": { is: "done", not: true } } },
        { text: "Inez Corvo wants to see you at the Saltworks. Be polite. Be fast.", when: { "jobs.riptide_run": { is: "done", not: true } } },
        { text: "The radio says a surge is coming. Big water. The city will still be hungry.", when: { "jobs.storm_surge": { is: "done", not: true } } },
        { text: "That MegaSlice man came back with his lawyer. Pay down the note, piano piano.", when: { "jobs.megaslice_man": { is: "done", not: true } } },
        { text: "They cut the power on the strip to scare us. We bake by firelight. Ride.", when: { "jobs.blackout": { is: "done", not: true } } },
        { text: "Every tip goes on the note now. One more push and the shop is ours again.", when: { "jobs.save_vells": { is: "done", not: true } } },
        { text: "Vell's is ours. Your nonno would have cried. Now, the Okafor twins are waiting." },
      ],
    },
    rita: {
      name: "Rita Salgado",
      faction: "locals",
      at: "motors",
      phone: true,
      known: false,
      blip: { icon: "contact", when: { "rita.known": true } },
      says: [
        { text: "Pull it into the bay. The Wardens don't look in here, and a respray buys you a new face.", when: { "police.stars": { atLeast: 1 } } },
        { text: "Win me the Ocean Loop Tide Rush and the cargo trike's half price in your heart.", when: { "jobs.ocean_loop": { is: "done", not: true } } },
        { text: "Scooters, trikes, jet-skis, a blimp if you've the cash. Anything that floats or rolls." },
      ],
    },
    tony: {
      name: "Tony Carmine",
      faction: "carmine",
      at: "port",
      phone: true,
      known: false,
      blip: { icon: "contact", when: { "tony.known": true } },
      says: [
        { text: "You shook my riders. Nobody shakes my riders. Enjoy your little festival.", when: { "jobs.festival_night": { is: "done", not: true } } },
        { text: "Fine. You're fast. MegaSlice is coming for my shop too, you know. Think about that." },
      ],
    },
    inez: {
      name: "Inez Corvo",
      faction: "riptide",
      at: "saltworks",
      phone: true,
      known: false,
      blip: { icon: "contact", when: { "inez.known": true } },
      facts: { trust: calm(0, 0.02, { min: -100, max: 100 }) },
      says: [
        { text: "My riders work the balconies when the water's up. Beat them upstairs four times and we'll talk.", when: { "jobs.riptide_run": { is: "done", not: true } } },
        { text: "A surge is coming in off the Gulf. Ride it and I'll tell MegaSlice the canals aren't for sale.", when: { "jobs.storm_surge": { is: "done", not: true } } },
        { text: "The tide comes in, the tide goes out. Riptide Slice stays. So, it seems, does Vell's." },
      ],
    },
    victor: {
      name: "Victor Lux",
      faction: "megaslice",
      at: "downtown",
      phone: true,
      known: false,
      blip: { icon: "contact", when: { "victor.known": true } },
      says: [
        { text: "Mrs Vell owes us twelve thousand. Make a payment, rider, or we make an offer.", when: { "jobs.megaslice_man": { is: "done", not: true } } },
        { text: "Funny thing about the power on your strip. Shame if it went out on a busy night.", when: { "jobs.blackout": { is: "done", not: true } } },
        { text: "MegaSlice always gets its slice. Eventually." },
      ],
    },
    dee: {
      name: "Sgt. Dee Kalani",
      faction: "hhpd",
      at: "precinct",
      phone: true,
      known: false,
      blip: { icon: "contact", when: { "dee.known": true } },
      facts: { trust: calm(20, 0.02, { min: -100, max: 100 }) },
      says: [
        { text: "You hurt one of my wardens. Don't call me again.", when: { "dee.trust": { atMost: -20 } } },
        { text: "I can lose a speeding ticket or two. It'll cost you a pie and some cash. Call me.", when: { "police.stars": { atLeast: 1 } } },
        { text: "Ride slow past the market, rider. Half my calls are about pizza scooters." },
      ],
    },
  },
  jobs: {
    welcome: {
      title: "Chapter 1 · First Night at Vell's",
      act: 1,
      at: "vells",
      pitch: "Three boxes out the door and into three happy hands.",
      mission: mission("welcome", "First Night at Vell's", [reach("deliver", "pizza.delivered", 3, "Deliver three boxes (load them at the oven window)")], 150),
      beat: { "story.act": 1, "rita.known": true, "dee.known": true },
    },
    learn_water: {
      title: "Chapter 1 · Reading the Water",
      act: 1,
      giver: "nonna",
      requires: ["welcome"],
      pitch: "When the streets are canals, the scooter drowns. Swap at a dock and deliver from a hull.",
      mission: mission("learn_water", "Reading the Water", [
        reach("swap", "pizza.swaps", 1, "Swap vehicles at a pink swap dock", "hull"),
        reach("hull", "pizza.hull_drops", 1, "Deliver a box from a jet-ski or gondola"),
      ], 300),
      beat: { "rita.trust": 5 },
    },
    crust_war: {
      title: "Chapter 2 · Carmine's Crust",
      act: 2,
      giver: "nonna",
      requires: ["learn_water"],
      pitch: "Tony Carmine's riders hunt stacked bags. Carry two at once, deliver them, and shake a rider.",
      mission: mission("crust_war", "Carmine's Crust", [
        reach("stack", "pizza.stack_drops", 2, "Deliver two boxes from a stacked bag", "shake"),
        reach("shake", "pizza.shaken", 1, "Lose a Carmine's Crust rider on your tail"),
      ], 500),
      beat: { "tony.known": true, "carmine.mood": -20, "story.act": 1 },
    },
    festival_night: {
      title: "Night of Lanterns",
      act: 2,
      giver: "nonna",
      requires: ["crust_war"],
      pitch: "The Lantern Festival: calls come twice as fast and the crowd tips big. Deliver six boxes before midnight.",
      mission: setPiece("festival_night", "Night of Lanterns", 6, "Deliver six boxes on lantern night", 900),
      beat: { "inez.known": true, "locals.mood": 15 },
    },
    riptide_run: {
      title: "Chapter 3 · Riptide Slice",
      act: 3,
      giver: "inez",
      requires: ["festival_night"],
      pitch: "My riders own the balconies at high water. Beat them upstairs four times.",
      mission: mission("riptide_run", "Riptide Slice", [reach("upstairs", "pizza.upstairs_drops", 4, "Deliver to four balconies or rooftops")], 700),
      beat: { "inez.trust": 20, "story.act": 1 },
    },
    storm_surge: {
      title: "The Storm Surge",
      act: 3,
      giver: "inez",
      requires: ["riptide_run"],
      pitch: "A surge off the Gulf: the water runs half a metre higher all night. Deliver five boxes through it.",
      mission: setPiece("storm_surge", "The Storm Surge", 5, "Deliver five boxes through the storm surge", 1200),
      beat: { "victor.known": true, "inez.trust": 20 },
    },
    megaslice_man: {
      title: "Chapter 4 · The Man from MegaSlice",
      act: 4,
      giver: "victor",
      requires: ["storm_surge"],
      pitch: "Twelve thousand on the note. Pay three of it down and we'll stop calling.",
      mission: mission("megaslice_man", "The Man from MegaSlice", [reach("pay", "pizza.paid", 3000, "Pay $3,000 off the note at the shop's books")], 0),
      beat: { "megaslice.mood": -20, "story.act": 1 },
    },
    blackout: {
      title: "Blackout on the Strip",
      act: 4,
      giver: "nonna",
      requires: ["megaslice_man"],
      pitch: "MegaSlice cut the power. No streetlights, no neon: only the beacons and the oven. Deliver five boxes in the dark.",
      mission: setPiece("blackout", "Blackout on the Strip", 5, "Deliver five boxes in the blackout", 1500),
      beat: { "megaslice.mood": -20 },
    },
    save_vells: {
      title: "Chapter 5 · Save Vell's",
      act: 5,
      giver: "nonna",
      requires: ["blackout"],
      pitch: "Pay off the whole note and the shop is the family's forever.",
      mission: mission("save_vells", "Save Vell's", [reach("saved", "pizza.saved", 1, "Pay the note off at the shop's books")], 2500),
      beat: { "story.act": 1, "megaslice.mood": -50 },
    },
    ocean_loop: {
      title: "Tide Rush: Ocean Loop",
      kind: "side",
      giver: "rita",
      requires: ["welcome"],
      pitch: "Win the Ocean Loop Tide Rush from my start line.",
      mission: mission("ocean_loop", "Tide Rush: Ocean Loop", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "garage", radius: 30, label: "Ride to Sunset Motors", next: "win" },
        { id: "win", kind: "survive", until: { fact: "race_won", is: "race-loop" }, label: "Win the Ocean Loop" },
      ], 800),
      beat: { "rita.trust": 20 },
    },
  },
  ripples: {
    explosion: { place: { fear: 40 }, owner: { mood: -5 }, out: { heat: 70 }, note: "An explosion rocked {place}." },
    killing: { place: { fear: 45 }, owner: { mood: -8 }, out: { heat: 90 }, note: "Someone was killed in {place}." },
    cop_down: { place: { fear: 35 }, faction: { mood: -25 }, world: { "dee.trust": -40 }, out: { heat: 110 }, note: "A warden went down in {place}." },
    wreck: { place: { fear: 15 }, out: { heat: 45 } },
    reckless: { place: { fear: 6 }, owner: { mood: -0.5 }, out: { heat: 6 } },
    carjack: { place: { fear: 10 }, owner: { mood: -1 }, out: { heat: 35 } },
  },
  facts: {
    /** Chapters closed: each main chapter adds one, so 5 is the shop saved. */
    "story.act": 0,
  },
});

/** Mission actor id for the player, whichever body it is in. */
export const CITY_PLAYER = PLAYER;
