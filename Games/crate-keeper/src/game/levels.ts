export type LevelDef = {
  readonly id: string;
  readonly name: string;
  readonly grid: readonly string[];
  readonly solution: string;
};

export const LEVELS: readonly LevelDef[] = [
  {
    id: "l01",
    name: "Down the Aisle",
    grid: ["#####", "#@  #", "#$  #", "#   #", "#.  #", "#####"],
    solution: "DD",
  },
  {
    id: "l02",
    name: "First Crate",
    grid: ["#######", "#@$  .#", "#######"],
    solution: "RRR",
  },
  {
    id: "l03",
    name: "Turn the Corner",
    grid: ["#######", "#@    #", "# $   #", "#   . #", "#######"],
    solution: "DRRURD",
  },
  {
    id: "l04",
    name: "Back Around",
    grid: ["#######", "#  .  #", "#  #  #", "# $@  #", "#     #", "#######"],
    solution: "DLUULUR",
  },
  {
    id: "l05",
    name: "Shelf Pair",
    grid: ["#######", "#@    #", "#$$   #", "#.    #", "#.    #", "#######"],
    solution: "DURDDRDL",
  },
  {
    id: "l06",
    name: "Split Delivery",
    grid: ["#######", "#.   .#", "# $$@ #", "#     #", "#######"],
    solution: "DLULDLURURR",
  },
  {
    id: "l07",
    name: "Two Pads",
    grid: ["########", "#@ $  .#", "#      #", "#  $  .#", "########"],
    solution: "RRRRDLLLDRRR",
  },
  {
    id: "l08",
    name: "The Nook",
    grid: ["#######", "#@    #", "#  $  #", "# $$  #", "# ... #", "#     #", "#######"],
    solution: "DRDURDUURDD",
  },
  {
    id: "l09",
    name: "Cross Traffic",
    grid: ["#######", "#. .  #", "# $$  #", "# @$  #", "#  .  #", "#######"],
    solution: "URULDRDRURUL",
  },
  {
    id: "l10",
    name: "Loading Dock",
    grid: ["#########", "#@      #", "# $$$   #", "#       #", "# ...   #", "#########"],
    solution: "RDDUURDDUURDD",
  },
  {
    id: "l11",
    name: "Cluster",
    grid: ["########", "#@     #", "#  $   #", "# $$   #", "#  ... #", "#      #", "########"],
    solution: "DRDLDRURLURRDUURDD",
  },
  {
    id: "l12",
    name: "Zigzag",
    grid: ["#########", "#@ $   .#", "### ##  #", "#   $  .#", "#  ###  #", "#. $    #", "#########"],
    solution: "RRRRRDDDDLLLLUURRRR",
  },
  {
    id: "l13",
    name: "Three Wide",
    grid: ["#########", "#       #", "#@$ $ $ #", "#       #", "#.  .  .#", "#########"],
    solution: "URDDRDLUUURRDDURRURDD",
  },
  {
    id: "l14",
    name: "The Vault",
    grid: ["########", "#  ..  #", "#  ..  #", "# $$$$ #", "#  @   #", "#      #", "########"],
    solution: "UULLDRDRUDRUDRUURUL",
  },
  {
    id: "l15",
    name: "Four Corners",
    grid: ["#######", "#.   .#", "# $ $ #", "#  @  #", "# $ $ #", "#.   .#", "#######"],
    solution: "ULDDULURRRDDLDLRRUURU",
  },
  {
    id: "l16",
    name: "The Depot",
    grid: ["########", "#@     #", "# $ $  #", "#  ..  #", "# $ $  #", "#  ..  #", "#      #", "########"],
    solution: "DRDDLDRUURRDURUULDULD",
  },
  {
    id: "l17",
    name: "The Warehouse",
    grid: ["##########", "#@       #", "# $$$$   #", "#        #", "#  ....  #", "#        #", "##########"],
    solution: "RDDLDRRRRURUULDDUULDDUULDD",
  },
  {
    id: "l18",
    name: "Pillars",
    grid: ["#########", "#. # # .#", "# $ $ $ #", "#@      #", "# $   . #", "#.  #   #", "#########"],
    solution: "RRULULDDDRRRRUURDRULLLLLDLU",
  },
  {
    id: "l19",
    name: "Crossroads",
    grid: ["########", "#.    .#", "#      #", "# $  $ #", "#@ ##  #", "# $  $ #", "#      #", "#.    .#", "########"],
    solution: "RUUDDDDRDLUURRRURDDUULUULURLLL",
  },
  {
    id: "l20",
    name: "Keeper's Trial",
    grid: ["########", "#   . .#", "# $$$  #", "#@  #  #", "# $$   #", "#. ..  #", "########"],
    solution: "RUDRDLDRUULLDUUURRDDDUURRDRU",
  },
];

export function parOf(level: LevelDef): number {
  return level.solution.length;
}

export function levelIndexById(id: string): number {
  return LEVELS.findIndex((level) => level.id === id);
}
