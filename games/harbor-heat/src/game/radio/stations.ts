import type { RadioDef, RadioSegmentDef } from "@jgengine/core/audio/radio";
import type { RadioVoice } from "@jgengine/core/audio/radioPlayback";

/** Ads every station sells airtime for; each station reads them in its own voice. */
const ADS: readonly RadioSegmentDef[] = [
  {
    id: "ad.sunset_motors",
    kind: "ad",
    title: "Sunset Motors",
    artist: "Paid spot",
    voice: "ad",
    lines: [
      "Sunset Motors! Rita's got wheels for every budget and a paint booth for every mistake.",
      "Dented? Wanted? Just bored of blue? Drive in, drive out different.",
      "Sunset Motors. We don't ask, so you don't have to tell.",
    ],
  },
  {
    id: "ad.neon_lounge",
    kind: "ad",
    title: "The Neon Lounge",
    artist: "Paid spot",
    voice: "ad",
    lines: [
      "Two-for-one daiquiris at the Neon Lounge, every night the sun goes down. Which is every night.",
      "Live music, cold drinks, and absolutely no questions about the back room.",
    ],
  },
  {
    id: "ad.mainsail_mutual",
    kind: "ad",
    title: "Mainsail Mutual",
    artist: "Paid spot",
    voice: "ad",
    lines: [
      "Mainsail Mutual car insurance. Because in this town, the other guy is always armed.",
      "Ask about our explosion rider. Terms, conditions and a waiting period of most of your life apply.",
    ],
  },
  {
    id: "ad.golden_anchor",
    kind: "ad",
    title: "Golden Anchor Pawn",
    artist: "Paid spot",
    voice: "ad",
    lines: [
      "Golden Anchor Pawn on Canal Row. Watches, chains, stereos, briefcases.",
      "Cash today. Receipts, never. Golden Anchor. Where things end up.",
    ],
  },
];

const NEON_TIDE: RadioDef["stations"][number] = {
  id: "neon_tide",
  name: "Neon Tide",
  frequency: "94.7 FM",
  kind: "music",
  voice: "luna",
  bed: "bed.tide",
  pattern: ["song", "dj", "song", "ad", "song", "jingle", "song", "dj"],
  bulletins: {
    title: "Luna's street report",
    intro: ["Quick word from the street before the next one.", "Luna here with what the scanner's saying.", "Hold that groove, there's news."],
    outro: ["Okay. Back to the music.", "Drive safe, or at least drive fast."],
  },
  segments: [
    { id: "neon_tidewater", kind: "song", title: "Neon Tidewater", artist: "Coral Static", theme: "song.neon_tidewater", seconds: 128 },
    { id: "palm_heights", kind: "song", title: "Palm Heights After Dark", artist: "Velvet Cruiser", theme: "song.palm_heights", seconds: 140 },
    { id: "marina_sunrise", kind: "song", title: "Marina Sunrise", artist: "Lia & the Breakwater", theme: "song.marina_sunrise", seconds: 115 },
    { id: "canal_row_chase", kind: "song", title: "Canal Row Chase", artist: "Midnight Overdrive", theme: "song.canal_row_chase", seconds: 104 },
    { id: "ocean_drive", kind: "song", title: "Slow Burn on Ocean Drive", artist: "Saint Avalon", theme: "song.ocean_drive", seconds: 150 },
    {
      id: "dj.welcome",
      kind: "dj",
      title: "Luna Vega",
      artist: "Neon Tide 94.7",
      lines: ["You're riding the tide on ninety-four seven, I'm Luna Vega.", "Windows down, Mainsail. The sun's going and the city's waking up."],
    },
    {
      id: "dj.traffic",
      kind: "dj",
      title: "Luna Vega",
      artist: "Neon Tide 94.7",
      lines: ["Traffic on the boulevard is moving, mostly because nobody here believes in brakes.", "Here's something to drive to."],
    },
    {
      id: "dj.dedication",
      kind: "dj",
      title: "Luna Vega",
      artist: "Neon Tide 94.7",
      lines: [
        "Got a dedication here from a caller down at the Marina.",
        "It says, to whoever keeps stealing my boat: please stop. Love you, though.",
        "That's Mainsail romance, baby.",
      ],
    },
    {
      id: "dj.weather",
      kind: "dj",
      title: "Luna Vega",
      artist: "Neon Tide 94.7",
      lines: ["Eighty-one degrees on the waterfront and the humidity says hi.", "Neon Tide. The only cool thing left in this town."],
    },
    {
      id: "dj.sunset",
      kind: "dj",
      title: "Luna Vega",
      artist: "Neon Tide 94.7",
      lines: ["If you're on the coast road right now, look left. That sky? Free of charge.", "Everything else in Mainsail costs extra."],
    },
    { id: "jingle.tide", kind: "jingle", title: "Neon Tide 94.7", artist: "Station ID", seconds: 4, lines: ["Neon Tide. Ninety-four seven."] },
    { id: "jingle.coast", kind: "jingle", title: "Neon Tide 94.7", artist: "Station ID", seconds: 4, lines: [{ text: "The sound of the coast after dark.", voice: "ad" }] },
    ...ADS,
  ],
};

const HARBOR_TALK: RadioDef["stations"][number] = {
  id: "harbor_talk",
  name: "Harbor Talk",
  frequency: "1040 AM",
  kind: "talk",
  voice: "sully",
  bed: "bed.harbor_talk",
  pattern: ["talk", "talk", "ad", "talk", "jingle", "talk", "ad"],
  bulletins: {
    title: "Sully's hot take",
    intro: ["Hold on, hold on, this just came over the wire.", "Folks, you are not going to believe this one."],
    outro: ["Lines are open. Call me.", "That's this town. That's Mainsail."],
  },
  segments: [
    {
      id: "talk.open",
      kind: "talk",
      title: "The Sully Hour",
      artist: "Big Sully Marchetti",
      lines: [
        "You're listening to The Sully Hour on Harbor Talk ten-forty, and I am Big Sully.",
        "Tonight's topic: is it still jaywalking if every car on the street is stolen? Lines are open.",
      ],
    },
    {
      id: "talk.caller_parking",
      kind: "talk",
      title: "The Sully Hour - caller",
      artist: "Big Sully Marchetti",
      lines: [
        "Line two, you're on the air.",
        { text: "Sully, somebody parked a sports car in my pool. In the pool, Sully.", voice: "caller_a" },
        "Was it a nice car?",
        { text: "It was a Cicada GT.", voice: "caller_a" },
        "Then frankly, ma'am, your pool got an upgrade. Next caller.",
      ],
    },
    {
      id: "talk.caller_carmine",
      kind: "talk",
      title: "The Sully Hour - caller",
      artist: "Big Sully Marchetti",
      lines: [
        "Line four, go.",
        { text: "Yeah, the Carmine crew runs my whole block in Port Carmine. Who do I complain to?", voice: "caller_b" },
        "You complain to me, my friend, and I complain to nobody, because I like my kneecaps.",
      ],
    },
    {
      id: "talk.hhpd",
      kind: "talk",
      title: "The Sully Hour",
      artist: "Big Sully Marchetti",
      lines: [
        "HHPD says response times are down twelve percent.",
        "Down from what? From never? I called them in nineteen ninety-eight, they still haven't shown up.",
        "Sergeant Kalani, if you're listening, my door is open. Literally. Somebody took it.",
      ],
    },
    {
      id: "talk.caller_ufo",
      kind: "talk",
      title: "The Sully Hour - caller",
      artist: "Big Sully Marchetti",
      lines: [
        "Line one, you're on the air.",
        { text: "Sully, I saw a plane land on the boulevard and a guy just got out and walked off.", voice: "caller_b" },
        "That's not a UFO, pal, that's a Tuesday. Next.",
      ],
    },
    {
      id: "talk.money",
      kind: "talk",
      title: "Sully's money minute",
      artist: "Big Sully Marchetti",
      lines: [
        "Money minute. People ask me, Sully, where should I put my savings?",
        "In this town? Under the mattress. Then put the mattress in a boat. Then sink the boat.",
      ],
    },
    { id: "jingle.talk", kind: "jingle", title: "Harbor Talk 1040", artist: "Station ID", seconds: 4, lines: [{ text: "Harbor Talk ten-forty. Opinions you didn't ask for.", voice: "ad" }] },
    ...ADS,
  ],
};

const MNN: RadioDef["stations"][number] = {
  id: "mnn",
  name: "Mainsail News Network",
  frequency: "88.3 FM",
  kind: "news",
  voice: "anchor",
  bed: "bed.mnn",
  pattern: ["news", "news", "jingle", "news", "ad", "news", "news", "jingle"],
  bulletins: {
    title: "MNN breaking",
    intro: ["This is MNN with breaking news.", "We interrupt with this from our newsroom."],
    outro: ["MNN will bring you more as it develops.", "Stay with MNN, eighty-eight three."],
    breakIn: 3,
  },
  segments: [
    {
      id: "news.weather",
      kind: "news",
      title: "Weather on the 8s",
      artist: "Dana Okafor",
      lines: ["Weather on the eights. Clear skies over Mainsail tonight, a light breeze off the harbor.", "Low of seventy-four. Ocean temperature, perfect. Crime temperature, also high."],
    },
    {
      id: "news.traffic",
      kind: "news",
      title: "Traffic",
      artist: "Dana Okafor",
      lines: ["In traffic, the coast road is clear, Canal Row is slow near the bridges, and someone has abandoned a forklift on the boulevard.", "Again."],
    },
    {
      id: "news.council",
      kind: "news",
      title: "City Hall",
      artist: "Dana Okafor",
      lines: ["City council voted tonight to add more neon to the downtown strip.", "The mayor called it an investment in character. Critics called it an investment in his brother-in-law's sign company."],
    },
    {
      id: "news.sports",
      kind: "news",
      title: "Sports",
      artist: "Dana Okafor",
      lines: ["In sports, the Mainsail Marlins lost again, nine to two.", "Their coach says the team is rebuilding. Fans say the team is a crime scene."],
    },
    {
      id: "news.hhpd",
      kind: "news",
      title: "HHPD briefing",
      artist: "Dana Okafor",
      lines: [
        "Sergeant Dee Kalani of the Harbor Heat Police Department says patrols in Palm Heights will double this week.",
        "She asked residents to report suspicious vehicles, and reminded drivers that a car with no doors is a suspicious vehicle.",
      ],
    },
    {
      id: "news.port",
      kind: "news",
      title: "Business",
      artist: "Dana Okafor",
      lines: ["Shipping volume at Port Carmine is up, though inspectors say they were asked very politely not to look in container nine."],
    },
    { id: "jingle.mnn", kind: "jingle", title: "MNN 88.3", artist: "Station ID", seconds: 4, lines: ["MNN. Eighty-eight three. Mainsail's news, first."] },
    ...ADS,
  ],
};

/** Harbor Heat's dial: a synthwave music station, a call-in talk show and a news station. */
export const HARBOR_RADIO: RadioDef = {
  seed: "mainsail-radio",
  initial: "neon_tide",
  stations: [NEON_TIDE, HARBOR_TALK, MNN],
};

/** How each voice id sounds: name hints pick a system voice when one matches, pitch and rate give each speaker a shape. */
export const RADIO_VOICES: Readonly<Record<string, RadioVoice>> = {
  luna: { name: "Female", pitch: 1.12, rate: 1.02 },
  sully: { name: "David", pitch: 0.78, rate: 1.04 },
  anchor: { name: "Zira", pitch: 1, rate: 1 },
  ad: { pitch: 1.18, rate: 1.16 },
  caller_a: { pitch: 1.35, rate: 1.1 },
  caller_b: { pitch: 0.9, rate: 0.96 },
};
