/**
 * Nonna Vell's menu and the people of Mainsail who order from it. Data only: each customer names the
 * scene marker they take the box at, so moving a balcony is dragging a marker in the editor.
 */

export interface Pizza {
  id: string;
  label: string;
  /** What the customer pays for the pie itself, before any tip. */
  price: number;
}

export const PIZZAS: readonly Pizza[] = [
  { id: "margherita", label: "Margherita", price: 21 },
  { id: "anchovy_storm", label: "Anchovy Storm", price: 27 },
  { id: "tide_pool", label: "Tide Pool (clams & lemon)", price: 30 },
  { id: "neon_diavola", label: "Neon Diavola", price: 28 },
  { id: "lighthouse_white", label: "Lighthouse White", price: 25 },
  { id: "wedding_cake", label: "Wedding Cake Calzone", price: 38 },
  { id: "pineapple_sub", label: "Pineapple Periscope", price: 29 },
  { id: "nonna_special", label: "Nonna's Sunday Special", price: 34 },
];

export const pizzaById = (id: string): Pizza | undefined => PIZZAS.find((pizza) => pizza.id === id);

/** How a customer behaves: who they are, where, how much they order and what they care about. */
export interface Customer {
  id: string;
  name: string;
  /** Short role line for the order card. */
  role: string;
  /** Scene marker the box is handed over at. */
  marker: string;
  /** Pizzas they order, in the order the oven makes them. */
  pizzas: readonly string[];
  /** Multiplier on the tip they would leave for a perfect box. */
  tipMultiplier: number;
  /** Reputation (stars, 0–5) the shop needs before they will call. */
  minRep: number;
  /** Hour of the shift they start calling from (18–24). */
  fromHour: number;
  /** Heat below which they pay but leave nothing. */
  coldLimit: number;
  /** Only reachable over water: the drop sits in the bay. */
  waterOnly?: boolean;
  /** Line on the order card when the order lands. */
  call: string;
  /** Line on delivery, by how it went. */
  thanks: { great: string; fine: string; bad: string };
}

export const CUSTOMERS: readonly Customer[] = [
  {
    id: "gus",
    name: "Gus Okoro",
    role: "night watchman, dock office",
    marker: "place_docks",
    pizzas: ["margherita"],
    tipMultiplier: 1,
    minRep: 0,
    fromHour: 18,
    coldLimit: 20,
    call: "Gus at the dock office. Margherita. The water's already at my boots, kid.",
    thanks: { great: "Still steaming. You're a lifesaver.", fine: "Thanks, kid.", bad: "It's a sponge, but I'm hungry." },
  },
  {
    id: "okafor_twins",
    name: "The Okafor twins",
    role: "night-market vendors, boardwalk",
    marker: "place_market",
    pizzas: ["neon_diavola", "margherita"],
    tipMultiplier: 1.1,
    minRep: 0,
    fromHour: 18,
    coldLimit: 25,
    call: "Two for the Okafor stall! One spicy, one plain, and don't you dare mix them up.",
    thanks: { great: "Hot! Tell Nonna the market says hi.", fine: "Good, good. Back to the grill.", bad: "Ada says it's cold. Ada is right." },
  },
  {
    id: "lou_houseboat",
    name: "Lou Marsh",
    role: "houseboat at Harbor View",
    marker: "fare_harbor_view",
    pizzas: ["tide_pool"],
    tipMultiplier: 1.2,
    minRep: 0,
    fromHour: 18.5,
    coldLimit: 30,
    call: "Lou on the houseboat. Tide Pool. I'll be on the top deck if the street's gone.",
    thanks: { great: "Perfect. Come for a drink when the water drops.", fine: "Ta.", bad: "Bit soggy, mate. Like everything down here." },
  },
  {
    id: "theo_dj",
    name: "DJ Theo Ash",
    role: "Neon Tide 94.7, the plaza studio",
    marker: "fare_plaza",
    pizzas: ["neon_diavola"],
    tipMultiplier: 1.3,
    minRep: 1,
    fromHour: 19,
    coldLimit: 40,
    call: "Theo at Neon Tide. Diavola, extra chilli. Fast and I'll give the shop a shout on air.",
    thanks: { great: "Mainsail, if you're hungry tonight, call Vell's. Trust me.", fine: "Cheers, rider.", bad: "On air I'll say it was great. Off air: cold." },
  },
  {
    id: "nonna_club",
    name: "Signora Ro's bridge club",
    role: "the villas of Palm Heights",
    marker: "fare_heights",
    pizzas: ["nonna_special", "margherita"],
    tipMultiplier: 1.25,
    minRep: 2,
    fromHour: 19,
    coldLimit: 55,
    call: "The bridge club. Your grandmother's special and a plain. Hot, dear. We will know.",
    thanks: { great: "Tell your nonna it is almost as good as mine.", fine: "Acceptable.", bad: "Lukewarm. I shall be telling everyone at bridge." },
  },
  {
    id: "wedding",
    name: "Priya & Dom's wedding",
    role: "rooftop reception, plaza offices",
    marker: "place_offices",
    pizzas: ["wedding_cake", "margherita", "neon_diavola"],
    tipMultiplier: 2,
    minRep: 2,
    fromHour: 21,
    coldLimit: 45,
    call: "Rooftop wedding! The caterer drowned. Three pies before the first dance, please!",
    thanks: { great: "You saved the reception! Have some cake!", fine: "Thank you! Back to the dance floor!", bad: "The bride is... being brave about it." },
  },
  {
    id: "captain_brine",
    name: "Captain Mireille Brine",
    role: "submarine Sardine, surfaced in the bay",
    marker: "cust_submarine",
    pizzas: ["pineapple_sub"],
    tipMultiplier: 1.8,
    minRep: 3,
    fromHour: 19.5,
    coldLimit: 35,
    waterOnly: true,
    call: "Sardine to shore: one Pineapple Periscope to the conning tower. No, you can't drive here.",
    thanks: { great: "Outstanding. The crew salutes you. Dive, dive!", fine: "Received. Sardine out.", bad: "It tastes like the sea. And not in a good way." },
  },
  {
    id: "ida_faro",
    name: "Ida Faro",
    role: "keeper of the Gull Point lighthouse",
    marker: "cust_lighthouse",
    pizzas: ["lighthouse_white", "anchovy_storm"],
    tipMultiplier: 1.6,
    minRep: 1,
    fromHour: 18,
    coldLimit: 30,
    call: "Faro here, at the lighthouse. Same as always. I watched your light leave the shop.",
    thanks: { great: "Fastest yet. I timed you from the lamp room.", fine: "Ah. There you are.", bad: "Cold as the lamp room. Still, you came all this way." },
  },
  {
    id: "kid_pepper",
    name: "Kid Pepper",
    role: "streamer above the boulevard newsstand",
    marker: "place_newsstand",
    pizzas: ["neon_diavola"],
    tipMultiplier: 0.8,
    minRep: 0,
    fromHour: 21.5,
    coldLimit: 15,
    call: "yo it's Kid Pepper, I'm live, chat says get a Diavola, don't knock, I'm streaming",
    thanks: { great: "CHAT. THE PIZZA RIDER. Clip it.", fine: "thx, ok chat back to it", bad: "chat says it's cold. chat is never wrong." },
  },
  {
    id: "mo_bridge",
    name: "Mo the bridge-keeper",
    role: "keeps the Canal Row lift bridge, Palm Heights side",
    marker: "fare_canal",
    pizzas: ["margherita"],
    tipMultiplier: 1.15,
    minRep: 1,
    fromHour: 18.5,
    coldLimit: 30,
    call: "Mo at the lift bridge. A plain one, and if the water's up I'll lower the basket.",
    thanks: { great: "Thirty years on this bridge and that's the fastest pie I've seen.", fine: "Much obliged.", bad: "The canal could've cooked it hotter." },
  },
  {
    id: "night_nurses",
    name: "The clinic night shift",
    role: "nurses at the downtown clinic",
    marker: "place_flat",
    pizzas: ["margherita", "nonna_special", "tide_pool"],
    tipMultiplier: 1.4,
    minRep: 1,
    fromHour: 22,
    coldLimit: 35,
    call: "Clinic night shift here. Three pies for a twelve-hour shift, please. We'll tip, we promise.",
    thanks: { great: "You're a hero. A real one. We'd know.", fine: "Bless you. Back to the ward.", bad: "Cold, but honestly we'd eat the box." },
  },
  {
    id: "yacht_party",
    name: "The Marina yacht party",
    role: "a very large boat at the Marina",
    marker: "bounty_marina",
    pizzas: ["anchovy_storm", "tide_pool", "wedding_cake", "pineapple_sub"],
    tipMultiplier: 1.5,
    minRep: 3,
    fromHour: 20,
    coldLimit: 40,
    call: "Darling, it's the yacht. Four pies, the expensive ones. Bring them aboard however you can.",
    thanks: { great: "Divine! Someone give the rider champagne.", fine: "Lovely, put them by the hot tub.", bad: "Is it meant to be... damp?" },
  },
];

export const customerById = (id: string): Customer | undefined => CUSTOMERS.find((customer) => customer.id === id);

/** Ida always orders, and always from the far end of the map: the shop's standing long haul. */
export const LIGHTHOUSE_KEEPER = "ida_faro";
