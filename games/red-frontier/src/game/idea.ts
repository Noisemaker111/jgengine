import type { Idea } from "./kindShape";

/**
 * Red Frontier: "frontier colony on mars"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "tagline": "A crew, a lander and red dust to the horizon. Mine it, grow food, hold off what comes out of the craters.",
  "kit": "holo",
  "look": "cinematic",
  "mood": "day",
  "accent": "#ff8a4c",
  "ground": {
    "material": "sand",
    "low": "#7a3e2a",
    "high": "#b86e4a"
  },
  "guide": {
    "name": "Director Okafor",
    "title": "Mission control"
  },
  "hq": {
    "label": "Landing base",
    "model": {
      "model": "/models/imported/kaykit-space-base/basemodule_A.glb",
      "height": 7
    },
    "beds": 4,
    "size": [
      5,
      5
    ]
  },
  "colonists": {
    "label": "Crew",
    "one": "Crewmate",
    "start": 4,
    "health": 100,
    "speed": 5,
    "damage": 14,
    "models": [
      {
        "model": "human/construction-worker",
        "height": 2.3
      },
      {
        "model": "human/soldier",
        "height": 2.3
      },
      {
        "model": "human/nurse",
        "height": 2.3
      },
      {
        "model": "human/man-casual",
        "height": 2.3,
        "tint": "#d8c8b8"
      }
    ]
  },
  "resources": [
    {
      "id": "food",
      "label": "Rations",
      "start": 60
    },
    {
      "id": "ore",
      "label": "Ore",
      "start": 40
    },
    {
      "id": "ice",
      "label": "Ice",
      "start": 20
    }
  ],
  "nodes": [
    {
      "id": "ore_vein",
      "label": "Ore vein",
      "resource": "ore",
      "carry": 6,
      "work": 3,
      "model": {
        "model": "/models/imported/kaykit-space-base/rock_A.glb",
        "height": 6,
        "tint": "#c98a5a"
      }
    },
    {
      "id": "ice_field",
      "label": "Ice field",
      "resource": "ice",
      "carry": 5,
      "work": 3,
      "model": {
        "model": "/models/imported/kaykit-space-base/rocks_B.glb",
        "height": 3,
        "tint": "#cfe8ff"
      }
    },
    {
      "id": "supply_pod",
      "label": "Supply pod",
      "resource": "food",
      "carry": 5,
      "work": 2.5,
      "model": {
        "model": "/models/imported/kaykit-space-base/cargo_A_stacked.glb",
        "height": 2.6
      }
    }
  ],
  "structures": [
    {
      "id": "habitat",
      "label": "Habitat",
      "role": "house",
      "cost": {
        "ore": 30
      },
      "size": [
        4,
        4
      ],
      "takes": 8,
      "beds": 4,
      "blurb": "Sleeps four more crew.",
      "model": {
        "model": "/models/imported/kaykit-space-base/basemodule_B.glb",
        "height": 5.5
      }
    },
    {
      "id": "greenhouse",
      "label": "Greenhouse",
      "role": "farm",
      "cost": {
        "ore": 25,
        "ice": 15
      },
      "size": [
        4,
        4
      ],
      "takes": 10,
      "rate": 0.45,
      "blurb": "Grows rations from ice and light.",
      "model": {
        "model": "/models/imported/kaykit-space-base/basemodule_E.glb",
        "height": 5,
        "tint": "#a8e6a0"
      }
    },
    {
      "id": "depot",
      "label": "Cargo depot",
      "role": "store",
      "cost": {
        "ore": 20
      },
      "size": [
        3,
        3
      ],
      "takes": 6,
      "blurb": "A closer drop-off for gatherers.",
      "model": {
        "model": "/models/imported/kaykit-space-base/cargodepot_A.glb",
        "height": 4
      }
    },
    {
      "id": "turret",
      "label": "Defense turret",
      "role": "tower",
      "cost": {
        "ore": 45,
        "ice": 10
      },
      "size": [
        2,
        2
      ],
      "takes": 9,
      "damage": 16,
      "range": 20,
      "shot": "laser",
      "blurb": "Shoots raiders in reach.",
      "model": {
        "model": "/models/imported/kaykit-space-base/structure_low.glb",
        "height": 4.5
      }
    },
    {
      "id": "terraformer",
      "label": "Terraformer",
      "role": "crown",
      "cost": {
        "ore": 220,
        "ice": 160,
        "food": 80
      },
      "size": [
        6,
        6
      ],
      "takes": 40,
      "blurb": "Starts turning Mars green. Wins the game.",
      "model": {
        "model": "/models/imported/kaykit-space-base/drill_structure.glb",
        "height": 13
      }
    }
  ],
  "raiders": {
    "label": "Crater things",
    "first": 60,
    "every": 75,
    "kinds": [
      {
        "id": "skitter",
        "label": "Skitter",
        "health": 40,
        "speed": 4,
        "damage": 6,
        "from": 1,
        "model": {
          "model": "/models/imported/quaternius-modular-scifi/Alien_Oculichrysalis.glb",
          "height": 3
        }
      },
      {
        "id": "cyclop",
        "label": "Cyclop",
        "health": 90,
        "speed": 3.2,
        "damage": 9,
        "from": 2,
        "model": {
          "model": "/models/imported/quaternius-modular-scifi/Alien_Cyclop.glb",
          "height": 3.8
        }
      },
      {
        "id": "scolitex",
        "label": "Scolitex",
        "health": 320,
        "speed": 2.6,
        "damage": 16,
        "from": 4,
        "model": {
          "model": "/models/imported/quaternius-modular-scifi/Alien_Scolitex.glb",
          "height": 6.5
        }
      }
    ]
  },
  "eats": 0.05,
  "arrive": 25,
  "scenery": [
    {
      "model": "/models/imported/kaykit-space-base/containers_A.glb",
      "height": 2.2
    },
    {
      "model": "/models/imported/kaykit-space-base/solarpanel.glb",
      "height": 1.6
    },
    {
      "model": "/models/imported/kaykit-space-base/spacetruck.glb",
      "height": 2.4
    },
    {
      "model": "/models/imported/kaykit-space-base/cargo_B_stacked.glb",
      "height": 2.4
    },
    {
      "model": "/models/imported/quaternius-modular-scifi/Prop_Light_Floor.glb",
      "height": 1.5
    },
    {
      "model": "/models/imported/kaykit-space-base/lander_B.glb",
      "height": 4
    }
  ],
  "kind": "colony",
  "name": "Red Frontier",
  "id": "red-frontier",
  "spec": "red_frontier",
  "pitch": "frontier colony on mars",
  "beats": [
    {
      "id": "beat1",
      "title": "Boots on the dust",
      "pitch": "Select your crew and set them to gathering: ore, ice and the supply pods.",
      "goal": "Gather 20 of anything",
      "fact": "colony.gathered",
      "atLeast": 20
    },
    {
      "id": "beat2",
      "title": "Room to grow",
      "pitch": "Build a habitat so more crew can come down.",
      "goal": "Build a habitat",
      "fact": "colony.homes",
      "atLeast": 2
    },
    {
      "id": "beat3",
      "title": "Something in the craters",
      "pitch": "They are coming. Hold the base through the first raid.",
      "goal": "Beat off the first raid",
      "fact": "colony.raids",
      "atLeast": 1
    },
    {
      "id": "beat4",
      "title": "A real colony",
      "pitch": "Grow the crew to eight.",
      "goal": "Have 8 crew",
      "fact": "colony.people",
      "atLeast": 8
    },
    {
      "id": "beat5",
      "title": "Make it green",
      "pitch": "Build the terraformer and Mars is ours.",
      "goal": "Build the terraformer",
      "fact": "colony.crowns",
      "atLeast": 1
    }
  ],
  "grid": {
    "cells": 30,
    "cell": 2
  },
  "world": {
    "relief": 6,
    "frequency": 0.008,
    "waterLevel": -40,
    "scatter": {
      "spire": {
        "model": "/models/imported/kaykit-space-base/rock_A.glb",
        "height": 8,
        "tint": "#b0654a"
      },
      "spire2": {
        "model": "/models/imported/kaykit-space-base/rock_B.glb",
        "height": 10,
        "tint": "#9a5540"
      },
      "pebbles": {
        "model": "/models/imported/kaykit-space-base/rocks_B.glb",
        "height": 1,
        "tint": "#a86448"
      },
      "rubble": {
        "model": "/models/imported/kaykit-space-base/rocks_A.glb",
        "height": 1.6,
        "tint": "#9a5a44"
      },
      "boulder": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_2.glb",
        "height": 2.4,
        "tint": "#a0604a"
      },
      "boulder2": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_3.glb",
        "height": 3,
        "tint": "#8a5040"
      }
    },
    "sky": {
      "preset": "day",
      "cycle": true,
      "dayLength": 900,
      "startHour": 9,
      "haze": 0.55
    }
  }
};
