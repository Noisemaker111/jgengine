import { PALETTE, RUNNER_BASE_SPEED } from "../tuning";

export interface RunnerDef {
  id: string;
  legIndex: number;
  name: string;
  jersey: string;
  flavor: string;
}

export const RUNNERS: readonly RunnerDef[] = [
  {
    id: "zoe",
    legIndex: 0,
    name: "Zoe Chen",
    jersey: PALETTE.brick,
    flavor: "Fastest off the mark — burns hot on the warehouse flats.",
  },
  {
    id: "mika",
    legIndex: 1,
    name: "Mika Torres",
    jersey: PALETTE.gold,
    flavor: "Steadiest hands — never fumbles a clean snap.",
  },
  {
    id: "jonah",
    legIndex: 2,
    name: "Jonah Okafor",
    jersey: PALETTE.lilac,
    flavor: "Longest stride — clears the widest tower gaps.",
  },
  {
    id: "priya",
    legIndex: 3,
    name: "Priya Anand",
    jersey: PALETTE.concrete,
    flavor: "Nerves of concrete — never flinches on a narrow plank.",
  },
  {
    id: "dex",
    legIndex: 4,
    name: "Dex Silva",
    jersey: PALETTE.ink,
    flavor: "Closes it out cold — brings the baton home under the clock.",
  },
];

export function runnerByLegIndex(legIndex: number): RunnerDef {
  const runner = RUNNERS[legIndex];
  if (runner === undefined) throw new Error(`runnerByLegIndex: no runner for leg ${legIndex}`);
  return runner;
}

export function runnerById(id: string): RunnerDef | undefined {
  return RUNNERS.find((runner) => runner.id === id);
}

export const RUNNER_WALK_SPEED = RUNNER_BASE_SPEED;
