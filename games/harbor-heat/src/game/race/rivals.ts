/**
 * Who rides each Tide Rush. Every rival pizzeria sends its fastest rider: Carmine's Crust brings their
 * black scooters, Riptide Slice their cargo trikes, and MegaSlice a corporate coupe that never gets wet.
 * `pace` is the speed a rival holds along the route, in m/s; the first rival is the one a start-line
 * race lines up, a street-race job runs them all.
 */
export interface StreetRival {
  name: string;
  /** Vehicle catalog id of the ride they bring. */
  car: string;
  pace: number;
}

export const ROUTE_RIVALS: Readonly<Record<string, readonly StreetRival[]>> = {
  "race-loop": [
    { name: "Tony Carmine (Carmine's Crust)", car: "car_rival", pace: 15.5 },
    { name: "Nina Sol (MegaSlice)", car: "car_coupe", pace: 14.2 },
  ],
  "race-harbor": [
    { name: "Dockside Dez (Riptide Slice)", car: "car_muscle", pace: 13.2 },
    { name: "Mako Ito (Carmine's Crust)", car: "car_rival", pace: 14.6 },
  ],
  "race-heights": [
    { name: "Lani Park (MegaSlice)", car: "car_coupe", pace: 16.4 },
    { name: "Benny Kalua (Riptide Slice)", car: "car_hatch", pace: 12.8 },
  ],
  "race-coast": [
    { name: "Marisol Vega (Riptide Slice)", car: "car_coupe", pace: 15.2 },
    { name: "Old Iko (Carmine's Crust)", car: "car_sedan", pace: 13.6 },
  ],
};

const STREET_REGULARS: readonly StreetRival[] = [
  { name: "A Carmine's Crust rider", car: "car_rival", pace: 15.5 },
  { name: "A MegaSlice courier", car: "car_coupe", pace: 13.8 },
];

/** The crew that races a circuit; a circuit nobody has claimed gets the street regulars. */
export function rivalsFor(routeId: string | null): readonly StreetRival[] {
  return (routeId === null ? undefined : ROUTE_RIVALS[routeId]) ?? STREET_REGULARS;
}
