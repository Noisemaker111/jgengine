export interface BoatLivery {
  id: string;
  name: string;
  hullColor: string;
  trimColor: string;
  sailColor: string;
}

export interface RivalDef {
  id: string;
  name: string;
  livery: BoatLivery;
  skill: number;
}

export const PLAYER_LIVERY: BoatLivery = {
  id: "player",
  name: "Skipper",
  hullColor: "#c74a34",
  trimColor: "#e6f2ef",
  sailColor: "#f2c14e",
};

export const RIVALS: readonly RivalDef[] = [
  {
    id: "rival-brigand",
    name: "Brigand's Wake",
    livery: {
      id: "rival-brigand",
      name: "Brigand's Wake",
      hullColor: "#0e2a30",
      trimColor: "#f2c14e",
      sailColor: "#e6f2ef",
    },
    skill: 0.94,
  },
  {
    id: "rival-halyard",
    name: "Halyard's Due",
    livery: {
      id: "rival-halyard",
      name: "Halyard's Due",
      hullColor: "#f2c14e",
      trimColor: "#14505c",
      sailColor: "#c74a34",
    },
    skill: 0.87,
  },
];

export function racerIds(playerId: string): readonly string[] {
  return [playerId, ...RIVALS.map((rival) => rival.id)];
}

export function liveryFor(racerId: string, playerId: string): BoatLivery {
  if (racerId === playerId) return PLAYER_LIVERY;
  return RIVALS.find((rival) => rival.id === racerId)?.livery ?? PLAYER_LIVERY;
}

export function racerNameFor(racerId: string, playerId: string): string {
  if (racerId === playerId) return PLAYER_LIVERY.name;
  return RIVALS.find((rival) => rival.id === racerId)?.name ?? racerId;
}
