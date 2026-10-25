import type { MissionDef } from "@jgengine/core/mission/mission";
import { defineTurfWar } from "@jgengine/core/worldModel/turfWar";
import { calm, defineWorldModel, type WorldFactSpec } from "@jgengine/core/worldModel/worldModel";

/**
 * Mainsail as one world: who lives here, who holds which block, what each job is and what it leaves
 * behind, and how a gunshot or a body spreads through the city. Map blips, the phone, dialogue,
 * "what next", mission facts and resident panic all read this; nothing else keeps its own copy.
 */

const PLAYER = "harbor_player";

const mission = (id: string, title: string, objectives: MissionDef["objectives"], cash: number, fail: MissionDef["fail"] = []): MissionDef => ({
  id,
  title,
  objectives,
  fail,
  rewards: { economy: { cash } },
});

const killed = (target: string) => ({ kind: "kill" as const, target });

/**
 * Blocks the two crews hold at the start and the player can take: the Carmines run the docks, the
 * heights, Canal Row and the Marina; the Riptides, a smuggling crew out of the east side, run the
 * Saltworks Yards, the East Strand and the Low Flats airstrip. Each block has a grip: soldiers dying
 * there wear it down, and at zero it goes to whoever was pushing. The same fact then measures the new
 * owner's hold, which the other crews' pushes and lost raids wear down again.
 */
export const TURF = ["port", "heights", "canal", "marina", "saltworks", "strand", "flats"] as const;
export type TurfId = (typeof TURF)[number];
/** The crews that hold turf, beside the player. */
export const GANGS = ["carmine", "riptide"] as const;
export type GangId = (typeof GANGS)[number];

/** A block's hold drifts back toward 60 when nobody is fighting over it, whoever owns it. */
const grip = (value: number): WorldFactSpec => calm(value, 0.08, { rest: 60, min: 0, max: 100 });

/**
 * Who pushes where. The Carmines hit any block the player took (from anywhere: it was theirs). Once
 * Rising Tide starts the war, the Riptides push out from their corners into the Carmines' blocks and
 * the Carmines push back the same way; angry Riptides also push into the player's blocks next door.
 */
export const turfWar = defineTurfWar({
  blocks: {
    port: { borders: ["strand", "flats"] },
    strand: { borders: ["port", "canal"] },
    canal: { borders: ["strand", "saltworks", "heights"] },
    saltworks: { borders: ["canal", "heights"] },
    heights: { borders: ["saltworks", "canal"] },
    marina: { borders: ["flats"] },
    flats: { borders: ["marina", "port"] },
  },
  sides: ["player", "carmine", "riptide"],
  labels: { player: "you", carmine: "the Carmines", riptide: "the Riptides" },
  onTake: { player: { "locals.mood": 5 } },
  onLose: { carmine: { "carmine.mood": -10 }, riptide: { "riptide.mood": -10 } },
  fronts: {
    carmine_pushback: {
      by: "carmine",
      into: ["player"],
      fromBorders: false,
      every: 83,
      chance: 0.7,
      when: { "carmine.mood": { atMost: -20 } },
      note: "Carmine crews are pushing back into {place}.",
      hook: "crewPush",
    },
    riptide_pushback: {
      by: "riptide",
      into: ["player"],
      every: 91,
      chance: 0.6,
      when: { "riptide.mood": { atMost: -20 } },
      note: "Riptide crews are moving in on {place}.",
      hook: "crewPush",
    },
    carmine_war: {
      by: "carmine",
      into: ["riptide"],
      every: 117,
      chance: 0.5,
      hit: 12,
      when: { "war.on": true },
      note: "Carmine and Riptide crews are shooting it out in {place}.",
      world: { "war.tension": 12 },
      hook: "gangClash",
    },
    riptide_war: {
      by: "riptide",
      into: ["carmine"],
      every: 109,
      chance: 0.5,
      hit: 12,
      when: { "war.on": true },
      note: "Riptide and Carmine crews are shooting it out in {place}.",
      world: { "war.tension": 12 },
      hook: "gangClash",
    },
  },
});

/** A front's facts: what it earns by day and on top at night, and whether a raid is on or has wrecked it. */
const front = (label: string, income: number, night: number) => ({
  label,
  slot: "fronts",
  tags: ["front"],
  facts: {
    income,
    night,
    hit: false,
    raid: false,
    /** Seconds left to break a raid before the crew wrecks the place. */
    raid_clock: { value: 0, decay: 1, min: 0 },
  },
});

export const city = defineWorldModel({
  factions: {
    carmine: { label: "Carmine crew", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    riptide: { label: "Riptide crew", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    hhpd: { label: "HHPD", facts: { mood: calm(0, 0.05, { min: -100, max: 100 }) } },
    locals: { label: "Mainsail locals", facts: { mood: calm(0, 0.08, { min: -100, max: 100 }) } },
  },
  places: {
    boulevard: { label: "Mainsail Boulevard", position: [-170, 0], radius: 110, owner: "locals", facts: { fear: calm(0, 1.5) } },
    downtown: { label: "Downtown Vice", position: [40, -60], radius: 120, owner: "locals", facts: { fear: calm(0, 1.5) } },
    port: { label: "Port Carmine", marker: "dock_fight", radius: 100, owner: "carmine", facts: { fear: calm(0, 1.5), grip: grip(60) } },
    heights: { label: "Palm Heights", marker: "kingpin", radius: 90, owner: "carmine", facts: { fear: calm(0, 1.5), grip: grip(80) } },
    canal: { label: "Canal Row", marker: "bounty_canal", radius: 42, owner: "carmine", facts: { fear: calm(0, 1.5), grip: grip(50) } },
    marina: { label: "the Marina", marker: "bounty_marina", radius: 40, owner: "carmine", facts: { fear: calm(0, 1.5), grip: grip(40) } },
    saltworks: { label: "the Saltworks Yards", marker: "riptide_yards", radius: 50, owner: "riptide", facts: { fear: calm(0, 1.5), grip: grip(70) } },
    strand: { label: "the East Strand", marker: "riptide_strand", radius: 40, owner: "riptide", facts: { fear: calm(0, 1.5), grip: grip(50) } },
    flats: { label: "the Low Flats", marker: "riptide_flats", radius: 45, owner: "riptide", facts: { fear: calm(0, 1.5), grip: grip(45) } },
    neon: { label: "the neon strip", marker: "marco", radius: 20, owner: "locals" },
    motors: { label: "Sunset Motors", marker: "garage", radius: 20, owner: "locals" },
    precinct: { label: "HHPD precinct", marker: "hhpd_station", radius: 20, owner: "hhpd" },
  },
  people: {
    marco: {
      name: "Marco Vance",
      faction: "locals",
      at: "neon",
      phone: true,
      blip: { icon: "contact" },
      facts: { trust: 0 },
      says: [
        { text: "Not with sirens on you. Lose them, then come see me.", when: { "police.stars": { atLeast: 2 } } },
        { text: "Not here, not now. The block's crawling with sirens.", when: { "neon.fear": { atLeast: 30 } } },
        { text: "The Carmines took my docks. Sweep them out and the money's yours.", when: { "port.owner": "carmine", "jobs.dock_sweep": { is: "done", not: true } } },
        { text: "Dirty money needs a clean front. The Neon Lounge is for sale. Buy it.", when: { "jobs.front_money": { is: "done", not: true } } },
        { text: "You're hot property now. Make the cops forget your face.", when: { "jobs.shake_heat": { is: "done", not: true } } },
        { text: "Go see Rita at Sunset Motors. She owes me.", when: { "jobs.hot_wheels": { is: "done", not: true } } },
        { text: "Sal knows the lounge is yours. His crew will hit it. Be there.", when: { "jobs.protection": { is: "done", not: true } } },
        { text: "Sal's re-arming the docks. Break his convoy before it lands.", when: { "jobs.convoy": { is: "done", not: true } } },
        { text: "Sal's alone up in Palm Heights. End it.", when: { "jobs.kingpin": { is: "done", not: true } } },
        { text: "There's a second crew on the east side, the Riptides. They smuggle through the Strand. Go introduce yourself.", when: { "jobs.riptide_intro": { is: "done", not: true } } },
        { text: "The Riptides and Sal's people are at war now. Let them bleed each other, then take what's left.", when: { "war.tension": { atLeast: 30 } } },
        { text: "Every block a crew loses pays you protection. Keep taking them.", when: { "turf.held": { atMost: 3 } } },
        { text: "This town runs on sunshine and dirty cash, and now it runs on you." },
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
        { text: "Pull it into the bay. HHPD doesn't look in here, and a respray buys you a new face.", when: { "police.stars": { atLeast: 1 } } },
        { text: "Sal's Cicada GT sits in Palm Heights. Bring it to my lot in one piece.", when: { "jobs.hot_wheels": { is: "done", not: true } } },
        { text: "Win me the Ocean Loop and I'll know you can drive.", when: { "jobs.ocean_loop": { is: "done", not: true } } },
        { text: "Anything with wheels, I can store, fix or sell. Anything with sirens, keep it in the bay." },
      ],
    },
    sal: {
      name: "Sal Carmine",
      faction: "carmine",
      at: "heights",
      phone: true,
      known: false,
      says: [
        { text: "You took my docks. I take everything else.", when: { "jobs.kingpin": { is: "done", not: true } } },
        { text: "..." },
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
        { text: "You put my boat crew in the water. Come back when you want to talk business instead.", when: { "riptide.mood": { atMost: -40 } } },
        { text: "Sal's boys still sit on Canal Row. Clear them off and my crews leave your corners alone.", when: { "jobs.corvo_offer": { is: "done", not: true } } },
        { text: "Every block Sal loses is a block I can move product through. Keep going.", when: { "carmine.mood": { atMost: -30 } } },
        { text: "The tide comes in, the tide goes out. The Riptides stay." },
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
        { text: "You shot a cop. Don't call me again.", when: { "dee.trust": { atMost: -20 } } },
        { text: "I can lose a report or two. It'll cost you. Call me.", when: { "police.stars": { atLeast: 1 } } },
        { text: "Port Carmine's quiet for once. I'll pretend I didn't see how.", when: { "port.owner": "player" } },
        { text: "Carmine runners are fencing guns on my beat. Take one down and I'll look the other way." },
      ],
    },
  },
  jobs: {
    welcome: {
      title: "Welcome to the Isle",
      act: 1,
      at: "neon",
      pitch: "Find Marco under the downtown neon.",
      mission: mission("welcome", "Welcome to the Isle", [
        { id: "meet", kind: "reach", actor: PLAYER, marker: "marco", radius: 5, label: "Find Marco under the downtown neon" },
      ], 200),
      beat: { "story.act": 1 },
    },
    dock_sweep: {
      title: "Dock Sweep",
      act: 1,
      giver: "marco",
      requires: ["welcome"],
      pitch: "Five Carmine gangers hold my docks. Clear them.",
      mission: mission("dock_sweep", "Dock Sweep", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "dock_fight", radius: 30, label: "Drive to Port Carmine", next: "clear" },
        { id: "clear", kind: "kill", count: 5, match: killed("ganger_dock"), label: "Clear the Carmine gangers" },
      ], 900),
      beat: { "port.owner": "player", "carmine.mood": -30, "marco.trust": 20, "dee.known": true },
    },
    ledger: {
      title: "The Ledger",
      kind: "side",
      giver: "marco",
      requires: ["dock_sweep"],
      pitch: "Sal's enforcer carries a ledger. Take it off him.",
      mission: mission("ledger", "The Ledger", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "briefcase", radius: 25, label: "Find the enforcer by the warehouse", next: "drop" },
        { id: "drop", kind: "kill", count: 1, match: killed("ganger_enforcer"), label: "Drop the enforcer", next: "grab" },
        { id: "grab", kind: "collect", count: 1, match: { kind: "collect", target: "briefcase_carmine" }, label: "Grab the ledger" },
      ], 2000),
      beat: { "sal.known": true, "carmine.mood": -20, "marco.trust": 20 },
    },
    front_money: {
      title: "Front Money",
      act: 1,
      giver: "marco",
      requires: ["dock_sweep"],
      pitch: "Dirty money needs a clean front. Buy the Neon Lounge across from me.",
      mission: mission("front_money", "Front Money", [
        { id: "buy", kind: "survive", until: { fact: "fronts.count", atLeast: 1 }, label: "Buy a front: the Neon Lounge is on the strip" },
      ], 600),
      beat: { "marco.trust": 10, "sal.known": true },
    },
    shake_heat: {
      title: "Shake the Heat",
      act: 2,
      giver: "marco",
      requires: ["front_money"],
      pitch: "Get the city's attention, three stars of it, then lose them. Rita's bay hides a car.",
      mission: mission("shake_heat", "Shake the Heat", [
        { id: "raise", kind: "survive", until: { fact: "police_tier", atLeast: 3 }, label: "Raise three stars of heat", next: "lose" },
        { id: "lose", kind: "survive", until: { fact: "police_tier", atMost: 0 }, label: "Lose the cops: outrun them or hide in Sunset Motors' bay" },
      ], 3500),
      beat: { "rita.known": true, "marco.trust": 10 },
    },
    ocean_loop: {
      title: "The Ocean Loop",
      kind: "side",
      giver: "rita",
      requires: ["shake_heat"],
      pitch: "Win the Ocean Loop from my start line.",
      mission: mission("ocean_loop", "The Ocean Loop", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "garage", radius: 30, label: "Get a car to Sunset Motors", next: "win" },
        { id: "win", kind: "survive", until: { fact: "race_won", is: "race-loop" }, label: "Win the Ocean Loop" },
      ], 4000),
      beat: { "rita.trust": 20 },
    },
    hot_wheels: {
      title: "Hot Wheels",
      act: 2,
      giver: "rita",
      requires: ["shake_heat"],
      pitch: "Steal Sal's Cicada GT and bring it to my lot.",
      mission: mission("hot_wheels", "Hot Wheels", [
        { id: "find", kind: "reach", actor: PLAYER, marker: "cicada_stage", radius: 15, label: "Find the Cicada GT in Palm Heights", next: "steal" },
        { id: "steal", kind: "survive", until: { fact: "driving", is: "car_sport" }, label: "Get in the Cicada", next: "deliver" },
        {
          id: "deliver",
          kind: "reach",
          actor: PLAYER,
          marker: "garage",
          radius: 9,
          label: "Deliver the Cicada to Sunset Motors",
          failOn: [{ kind: "fact", fact: "cicada_wrecked", is: true, to: "wrecked", message: "The Cicada burned." }],
        },
      ], 5000, [{ id: "wrecked", message: "The Cicada burned." }]),
      beat: { "carmine.mood": -15, "rita.trust": 20 },
    },
    protection: {
      title: "Protection",
      act: 3,
      giver: "marco",
      requires: ["hot_wheels"],
      pitch: "Sal's crew is on its way to your lounge. Break the raid before they wreck it.",
      mission: mission("protection", "Protection", [
        { id: "hold", kind: "survive", until: { fact: "fronts.repelled", atLeast: 1 }, label: "Get to your front and drop the raiders" },
      ], 4500),
      beat: { "marco.trust": 10, "carmine.mood": -10 },
    },
    convoy: {
      title: "Carmine Convoy",
      act: 3,
      giver: "marco",
      requires: ["protection"],
      pitch: "Sal's re-arming the docks. Break the convoy.",
      mission: mission("convoy", "Carmine Convoy", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "dock_fight", radius: 30, label: "Get to the docks", next: "break" },
        { id: "break", kind: "kill", count: 8, match: killed("ganger_dock"), label: "Break the convoy" },
      ], 6500),
      beat: { "carmine.mood": -30, "port.owner": "player" },
    },
    kingpin: {
      title: "Kingpin of Palm Heights",
      act: 3,
      giver: "marco",
      requires: ["convoy"],
      pitch: "Sal runs it all from his villa. End it.",
      mission: mission("kingpin", "Kingpin of Palm Heights", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "kingpin", radius: 30, label: "Storm Sal's villa", next: "drop" },
        { id: "drop", kind: "kill", count: 1, match: killed("kingpin_sal"), label: "Drop Sal" },
      ], 25000),
      beat: { "heights.owner": "player", "carmine.mood": -50, "story.act": 4 },
    },
    marina_turf: {
      title: "Take the Marina",
      kind: "side",
      giver: "marco",
      requires: ["dock_sweep"],
      when: { "marina.owner": "carmine" },
      pitch: "The Carmines run the marina off the boulevard. Thin their crew until the block is ours.",
      mission: mission("marina_turf", "Take the Marina", [
        { id: "take", kind: "survive", until: { fact: "marina.owner", is: "player" }, label: "Drop Carmine crew in the Marina until it changes hands" },
      ], 1500),
      beat: { "marco.trust": 5 },
    },
    riptide_intro: {
      title: "Rising Tide",
      kind: "side",
      giver: "marco",
      requires: ["dock_sweep"],
      pitch: "A crew called the Riptides is running guns through the East Strand. Sink their boat crew and Sal will think it was the other guys.",
      mission: mission("riptide_intro", "Rising Tide", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "riptide_strand", radius: 30, label: "Find the Riptide boat crew on the East Strand", next: "drop" },
        { id: "drop", kind: "kill", count: 4, match: killed("riptide_soldier"), label: "Drop the Riptide crew" },
      ], 1800),
      beat: { "riptide.mood": -25, "inez.known": true, "war.on": true, "war.tension": 20, "marco.trust": 5 },
    },
    corvo_offer: {
      title: "Corvo's Offer",
      kind: "side",
      giver: "inez",
      requires: ["riptide_intro"],
      when: { "riptide.mood": { atLeast: -40 } },
      pitch: "Sal's boys sit on Canal Row. Clear them out and my crews stay off your corners.",
      mission: mission("corvo_offer", "Corvo's Offer", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "bounty_canal", radius: 30, label: "Get to Canal Row", next: "clear" },
        { id: "clear", kind: "kill", count: 4, match: killed("ganger_dock"), label: "Clear the Carmine crew off Canal Row" },
      ], 2400),
      beat: { "riptide.mood": 45, "inez.trust": 25, "carmine.mood": -15, "war.tension": 15 },
    },
    low_flats: {
      title: "Take the Low Flats",
      kind: "side",
      giver: "marco",
      requires: ["riptide_intro"],
      when: { "flats.owner": "riptide" },
      pitch: "The Riptides land their planes on the Low Flats. Thin their crew until the airstrip is ours.",
      mission: mission("low_flats", "Take the Low Flats", [
        { id: "take", kind: "survive", until: { fact: "flats.owner", is: "player" }, label: "Drop Riptide crew on the Low Flats until it changes hands" },
      ], 2000),
      beat: { "marco.trust": 5 },
    },
    clean_hands: {
      title: "Clean Hands",
      kind: "side",
      giver: "dee",
      requires: ["dock_sweep"],
      when: { "dee.trust": { atLeast: 0 } },
      repeatable: true,
      pitch: "A Carmine runner is fencing guns at the docks. Put him down.",
      mission: mission("clean_hands", "Clean Hands", [
        { id: "go", kind: "reach", actor: PLAYER, marker: "dock_fight", radius: 40, label: "Find the runner at the docks", next: "drop" },
        { id: "drop", kind: "kill", count: 1, match: killed("ganger_dock"), label: "Drop the gun runner" },
      ], 400),
      beat: { "dee.trust": 10, "carmine.mood": -5 },
    },
  },
  slots: {
    fronts: {
      front_lounge: { marker: "front_lounge", label: "the Neon Lounge" },
      front_arcade: { marker: "front_arcade", label: "the Boardwalk Arcade" },
      front_carwash: { marker: "front_carwash", label: "the Pier Three car wash" },
      front_motel: { marker: "front_motel", label: "the Villa Row motel" },
    },
  },
  kinds: {
    lounge: front("Neon Lounge", 3, 3),
    arcade: front("Boardwalk Arcade", 2, 1),
    carwash: front("Pier Three car wash", 4, 0),
    motel: front("Villa Row motel", 5, 2),
  },
  totals: {
    "fronts.count": { of: "front" },
    "fronts.income": { of: "front", sum: "income", where: { hit: false, raid: false } },
    "fronts.night": { of: "front", sum: "night", where: { hit: false, raid: false } },
  },
  flows: {
    takings: { to: "fronts.takings", from: "fronts.income", when: { "police.stars": { atMost: 2 } } },
    nightlife: { to: "fronts.takings", from: "fronts.night", when: { "clock.night": true, "police.stars": { atMost: 2 } } },
    protection: { to: "fronts.takings", from: "turf.held", rate: 0.5 },
  },
  ripples: {
    gunfire: { place: { fear: 18 }, owner: { mood: -1 } },
    assault: { place: { fear: 30 }, owner: { mood: -4 }, out: { heat: 55 } },
    cop_shot: { place: { fear: 25 }, world: { "hhpd.mood": -10, "dee.trust": -10 }, out: { heat: 90 } },
    explosion: { place: { fear: 40 }, owner: { mood: -5 }, out: { heat: 70 }, note: "An explosion rocked {place}." },
    killing: { place: { fear: 45 }, owner: { mood: -8 }, out: { heat: 60 }, note: "Someone was killed in {place}." },
    ganger_down: [
      { place: { fear: 20 }, faction: { mood: -6 }, note: "A Carmine soldier went down in {place}." },
      // On their own corner somebody calls it in; on yours, nobody saw a thing.
      { whenPlace: { owner: "carmine" }, place: { grip: -25, attacker: "player" }, out: { heat: 30 } },
      { whenPlace: { owner: "riptide" }, out: { heat: 30 } },
      { whenPlace: { owner: "locals" }, out: { heat: 30 } },
      { whenPlace: { owner: "player" }, place: { grip: 6 } },
    ],
    riptide_down: [
      { place: { fear: 20 }, faction: { mood: -6 }, note: "A Riptide soldier went down in {place}." },
      { whenPlace: { owner: "riptide" }, place: { grip: -25, attacker: "player" }, out: { heat: 30 } },
      { whenPlace: { owner: "carmine" }, out: { heat: 30 } },
      { whenPlace: { owner: "locals" }, out: { heat: 30 } },
      { whenPlace: { owner: "player" }, place: { grip: 6 } },
    ],
    ...turfWar.ripples,
    cop_down: { place: { fear: 35 }, faction: { mood: -25 }, world: { "dee.trust": -40 }, out: { heat: 110 }, note: "Officer down in {place}." },
    wreck: { place: { fear: 15 }, out: { heat: 45 } },
    reckless: { place: { fear: 6 }, owner: { mood: -0.5 }, out: { heat: 6 } },
    carjack: { place: { fear: 10 }, owner: { mood: -1 }, out: { heat: 35 } },
    raid: { whenTarget: { hit: false, raid: false }, target: { raid: true, raid_clock: 60 }, note: "Carmines are hitting {target}!", hook: "raidStarted" },
    raid_repelled: {
      target: { raid: false, raid_clock: -999 },
      place: { grip: 10 },
      world: { "carmine.mood": -4, "fronts.repelled": 1, "locals.mood": 3 },
      note: "You ran the Carmines off {target}.",
    },
    raid_lost: { target: { raid: false, hit: true }, place: { grip: -10, attacker: "carmine" }, world: { "locals.mood": -3 }, note: "The Carmines wrecked {target}.", hook: "raidLost" },
    repaired: { target: { hit: false }, note: "{target} is open again." },
  },
  schedule: {
    raids: {
      every: 60,
      ripple: "raid",
      on: "front",
      chance: 0.6,
      whenTarget: { hit: false, raid: false },
      when: { "carmine.mood": { atMost: -20 }, "jobs.protection": { is: "active", not: true } },
    },
    ...turfWar.schedule,
  },
  triggers: turfWar.triggers,
  facts: {
    ...turfWar.facts,
    "story.act": 0,
    "fronts.takings": { value: 0, min: 0 },
    "fronts.repelled": 0,
    /** Whether the two crews are at war; Rising Tide starts it. */
    "war.on": false,
    /** How hot the crew war runs: every clash adds to it, and it cools off between them. */
    "war.tension": calm(0, 0.1, { min: 0, max: 100 }),
  },
});

/** Mission actor id for the player, whichever body it is in. */
export const CITY_PLAYER = PLAYER;
