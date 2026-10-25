import type { Idea } from "./kindShape";

/**
 * Briarcrown: "medieval castle builder"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "tagline": "Found a hamlet. Feed it, house it, grow it into a castle town.",
  "kit": "parchment",
  "look": "cinematic",
  "mood": "golden",
  "accent": "#d9a441",
  "ground": {
    "material": "grass",
    "low": "#4f6a30",
    "high": "#8b9450"
  },
  "guide": {
    "name": "Steward Aldric",
    "title": "Your steward"
  },
  "seat": {
    "label": "Lord's hall",
    "model": {
      "model": "/models/imported/lantern-reach/settlements/settlement-10.glb",
      "height": 9
    },
    "houses": 6,
    "size": [
      6,
      6
    ]
  },
  "people": {
    "label": "Villagers",
    "walkers": [
      {
        "model": "/models/imported/lantern-reach/players/rogue_hooded.glb",
        "height": 1.75
      },
      {
        "model": "/models/imported/lantern-reach/players/druid.glb",
        "height": 1.75
      },
      {
        "model": "/models/imported/lantern-reach/players/ranger.glb",
        "height": 1.75
      },
      {
        "model": "/models/imported/lantern-reach/players/barbarian.glb",
        "height": 1.8
      }
    ]
  },
  "resources": [
    {
      "id": "food",
      "label": "Food",
      "start": 60
    },
    {
      "id": "wood",
      "label": "Wood",
      "start": 90
    },
    {
      "id": "stone",
      "label": "Stone",
      "start": 0
    },
    {
      "id": "gold",
      "label": "Gold",
      "start": 20
    }
  ],
  "buildings": [
    {
      "id": "house",
      "label": "Cottage",
      "role": "home",
      "key": "1",
      "tier": 1,
      "cost": {
        "wood": 20
      },
      "size": [
        4,
        4
      ],
      "takes": 6,
      "houses": 4,
      "blurb": "Four villagers move in.",
      "model": {
        "model": "/models/imported/lantern-reach/settlements/settlement-1.glb",
        "height": 6.5
      }
    },
    {
      "id": "farm",
      "label": "Farmstead",
      "role": "producer",
      "key": "2",
      "tier": 1,
      "cost": {
        "wood": 25
      },
      "size": [
        5,
        5
      ],
      "takes": 8,
      "staff": 2,
      "makes": "food",
      "rate": 0.8,
      "blurb": "Two farmers grow food.",
      "model": {
        "model": "/models/imported/lantern-reach/settlements/settlement-5.glb",
        "height": 7.5
      }
    },
    {
      "id": "lumber",
      "label": "Lumber camp",
      "role": "producer",
      "key": "3",
      "tier": 1,
      "cost": {
        "wood": 15,
        "food": 10
      },
      "size": [
        3,
        3
      ],
      "takes": 6,
      "staff": 2,
      "makes": "wood",
      "rate": 0.45,
      "blurb": "Two woodcutters haul timber.",
      "model": {
        "model": "/models/imported/quaternius-medieval-village/Prop_Wagon.glb",
        "height": 2.6
      }
    },
    {
      "id": "quarry",
      "label": "Quarry",
      "role": "producer",
      "key": "4",
      "tier": 2,
      "cost": {
        "wood": 40,
        "food": 20
      },
      "size": [
        5,
        3
      ],
      "takes": 10,
      "staff": 3,
      "makes": "stone",
      "rate": 0.35,
      "blurb": "Three masons cut stone.",
      "model": {
        "model": "/models/imported/kaykit-dungeon/rubble_large.glb",
        "height": 3.2
      }
    },
    {
      "id": "manor",
      "label": "Manor",
      "role": "home",
      "key": "5",
      "tier": 2,
      "cost": {
        "wood": 40,
        "stone": 30
      },
      "size": [
        6,
        6
      ],
      "takes": 14,
      "houses": 10,
      "blurb": "Ten villagers move in.",
      "model": {
        "model": "/models/imported/lantern-reach/settlements/settlement-2.glb",
        "height": 10
      }
    },
    {
      "id": "guild",
      "label": "Guildhall",
      "role": "producer",
      "key": "6",
      "tier": 2,
      "cost": {
        "wood": 50,
        "stone": 40
      },
      "size": [
        5,
        5
      ],
      "takes": 14,
      "staff": 4,
      "makes": "gold",
      "rate": 0.3,
      "blurb": "Four merchants trade for gold.",
      "model": {
        "model": "/models/imported/lantern-reach/settlements/settlement-4.glb",
        "height": 8.5
      }
    },
    {
      "id": "keep",
      "label": "Castle keep",
      "role": "crown",
      "key": "7",
      "tier": 3,
      "cost": {
        "wood": 150,
        "stone": 200,
        "gold": 120
      },
      "size": [
        7,
        7
      ],
      "takes": 40,
      "blurb": "The keep crowns the realm.",
      "model": {
        "model": "/models/imported/lantern-reach/settlements/settlement-3.glb",
        "height": 22
      }
    }
  ],
  "tiers": [
    {
      "label": "Hamlet",
      "people": 0,
      "note": "A hamlet takes root."
    },
    {
      "label": "Town",
      "people": 22,
      "note": "The hamlet is a town now: quarries, manors and guilds can be built."
    },
    {
      "label": "Castle town",
      "people": 50,
      "note": "A castle town: the keep can be raised."
    }
  ],
  "eats": 0.05,
  "tax": 0.02,
  "coin": "gold",
  "scenery": [
    {
      "model": "/models/imported/quaternius-medieval-village/Prop_Crate.glb",
      "height": 0.9
    },
    {
      "model": "/models/imported/quaternius-medieval-village/Prop_WoodenFence_Single.glb",
      "height": 1.4
    },
    {
      "model": "/models/imported/kaykit-dungeon/barrel_large.glb",
      "height": 1.2
    },
    {
      "model": "/models/imported/quaternius-medieval-village/Prop_Wagon.glb",
      "height": 1.8
    },
    {
      "model": "/models/imported/kaykit-dungeon/banner_patternA_red.glb",
      "height": 3.2
    },
    {
      "model": "/models/imported/kaykit-dungeon/crates_stacked.glb",
      "height": 1.6
    }
  ],
  "kind": "builder",
  "name": "Briarcrown",
  "id": "briarcrown",
  "spec": "briarcrown",
  "pitch": "medieval castle builder",
  "beats": [
    {
      "id": "beat1",
      "title": "A roof for everyone",
      "pitch": "Your people sleep under carts. Raise cottages around the hall.",
      "goal": "Build 3 cottages",
      "fact": "realm.homes",
      "atLeast": 3
    },
    {
      "id": "beat2",
      "title": "Hands and harvest",
      "pitch": "Idle hands go hungry. Set them to farm and fell trees.",
      "goal": "Get 3 workplaces running",
      "fact": "realm.producers",
      "atLeast": 3
    },
    {
      "id": "beat3",
      "title": "From hamlet to town",
      "pitch": "Grow to twenty-two souls and the hamlet becomes a town.",
      "goal": "Reach 22 villagers",
      "fact": "realm.tier",
      "atLeast": 2
    },
    {
      "id": "beat4",
      "title": "Fill the treasury",
      "pitch": "A keep is paid for in gold. Build a guildhall and let trade flow.",
      "goal": "Save 120 gold",
      "fact": "realm.gold",
      "atLeast": 120
    },
    {
      "id": "beat5",
      "title": "Raise the keep",
      "pitch": "Stone, timber and gold: raise the castle keep and the realm is yours.",
      "goal": "Raise the castle keep",
      "fact": "realm.crowns",
      "atLeast": 1
    }
  ],
  "grid": {
    "cells": 34,
    "cell": 2
  },
  "world": {
    "relief": 6,
    "frequency": 0.009,
    "waterLevel": -40,
    "scatter": {
      "pine": {
        "model": "/models/imported/quaternius-stylized-nature/Pine_1.glb",
        "height": 11
      },
      "pine2": {
        "model": "/models/imported/quaternius-stylized-nature/Pine_4.glb",
        "height": 9
      },
      "tree": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_2.glb",
        "height": 9
      },
      "tree2": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_1.glb",
        "height": 10
      },
      "tree3": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_4.glb",
        "height": 9
      },
      "bush": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common.glb",
        "height": 1.1
      },
      "flower": {
        "model": "/models/imported/quaternius-stylized-nature/Flower_3_Group.glb",
        "height": 0.5
      },
      "fern": {
        "model": "/models/imported/quaternius-stylized-nature/Fern_1.glb",
        "height": 0.9
      },
      "rock": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_2.glb",
        "height": 1.8
      },
      "rock2": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_3.glb",
        "height": 2.4
      }
    },
    "sky": {
      "preset": "day",
      "cycle": true,
      "dayLength": 600,
      "startHour": 8,
      "haze": 0.35
    }
  }
};
