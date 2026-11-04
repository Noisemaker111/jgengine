/**
 * Who races each circuit. A circuit's crew is its own: the Harbor Circuit's dock drivers bring a
 * heavy Vagabond that is slow through the cranes, the Palm Heights Climb belongs to a Cicada GT that
 * flies up the hill. `pace` is the speed a rival holds along the route, in m/s; the first rival is
 * the one a start-line race lines up, a street-race job runs them all.
 */
export interface StreetRival {
  name: string;
  /** Vehicle catalog id of the car they bring. */
  car: string;
  pace: number;
}

export const ROUTE_RIVALS: Readonly<Record<string, readonly StreetRival[]>> = {
  "race-loop": [
    { name: "Tavo Reyes", car: "car_muscle", pace: 15.5 },
    { name: "Nina Sol", car: "car_coupe", pace: 14.2 },
  ],
  "race-harbor": [
    { name: "Dockside Dez", car: "car_suv", pace: 13.2 },
    { name: "Mako Ito", car: "car_muscle", pace: 14.6 },
  ],
  "race-heights": [
    { name: "Lani Park", car: "car_sport", pace: 16.4 },
    { name: "Benny Kalua", car: "car_hatch", pace: 12.8 },
  ],
  "race-coast": [
    { name: "Marisol Vega", car: "car_coupe", pace: 15.2 },
    { name: "Old Iko", car: "car_sedan", pace: 13.6 },
  ],
};

const STREET_REGULARS: readonly StreetRival[] = [
  { name: "A street regular", car: "car_muscle", pace: 15.5 },
  { name: "A weekend racer", car: "car_sport", pace: 13.8 },
];

/** The crew that races a circuit; a circuit nobody has claimed gets the street regulars. */
export function rivalsFor(routeId: string | null): readonly StreetRival[] {
  return (routeId === null ? undefined : ROUTE_RIVALS[routeId]) ?? STREET_REGULARS;
}
