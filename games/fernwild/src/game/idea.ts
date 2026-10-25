import type { Idea } from "./kindShape";

/**
 * Fernwild: "ARK-like dinosaur survival: tame dinos, build a base, craft and survive"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "tagline": "Tame the wild. Raise a camp. Outlast the hunt.",
  "kit": "parchment",
  "look": "cinematic",
  "mood": "golden",
  "accent": "#6fc36a",
  "ground": {
    "material": "grass",
    "low": "#4f6d2f",
    "high": "#8a9a52"
  },
  "home": {
    "label": "Camp",
    "health": 1400,
    "model": {
      "model": "/models/imported/lantern-reach/settlements/settlement-1.glb",
      "height": 7
    }
  },
  "guide": {
    "name": "Ka-Ren",
    "title": "Old tamer"
  },
  "wave": "Hunt",
  "calm": 80,
  "hero": {
    "model": "/models/imported/lantern-reach/players/ranger.glb",
    "height": 1.8,
    "health": 120,
    "damage": 30,
    "label": "Survivor"
  },
  "resources": [
    {
      "id": "wood",
      "label": "Wood",
      "start": 20
    },
    {
      "id": "stone",
      "label": "Stone",
      "start": 10
    },
    {
      "id": "berries",
      "label": "Berries",
      "start": 6
    }
  ],
  "nodes": [
    {
      "id": "tree",
      "label": "Tree",
      "verb": "Chop",
      "gives": "wood",
      "amount": 5,
      "uses": 4,
      "regrow": 0.03,
      "prop": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_1.glb",
        "height": 7
      }
    },
    {
      "id": "pine",
      "label": "Pine",
      "verb": "Chop",
      "gives": "wood",
      "amount": 6,
      "uses": 4,
      "regrow": 0.03,
      "prop": {
        "model": "/models/imported/quaternius-stylized-nature/Pine_2.glb",
        "height": 8
      }
    },
    {
      "id": "rock",
      "label": "Rock",
      "verb": "Mine",
      "gives": "stone",
      "amount": 4,
      "uses": 5,
      "regrow": 0.02,
      "prop": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_1.glb",
        "height": 1.4
      }
    },
    {
      "id": "bush",
      "label": "Berry bush",
      "verb": "Pick",
      "gives": "berries",
      "amount": 3,
      "uses": 3,
      "regrow": 0.05,
      "prop": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common_Flowers.glb",
        "height": 1.1
      }
    }
  ],
  "structures": [
    {
      "id": "palisade",
      "label": "Palisade",
      "role": "wall",
      "key": "1",
      "cost": {
        "wood": 8
      },
      "takes": 2,
      "health": 240,
      "power": 0,
      "prop": {
        "model": "/models/imported/quaternius-medieval-village/Prop_WoodenFence_Single.glb",
        "height": 1.6
      }
    },
    {
      "id": "brazier",
      "label": "Fire ward",
      "role": "turret",
      "key": "2",
      "cost": {
        "wood": 12,
        "stone": 10
      },
      "takes": 4,
      "health": 180,
      "power": 14,
      "prop": {
        "model": "/models/imported/kaykit-dungeon/torch_lit.glb",
        "height": 2.2
      }
    },
    {
      "id": "patch",
      "label": "Berry patch",
      "role": "producer",
      "key": "3",
      "cost": {
        "wood": 10
      },
      "takes": 4,
      "health": 120,
      "power": 0.25,
      "makes": "berries",
      "prop": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common.glb",
        "height": 0.9
      }
    }
  ],
  "threats": [
    {
      "id": "raptor",
      "label": "Raptor",
      "model": {
        "model": "/models/imported/lantern-reach/creatures/velociraptor.glb",
        "height": 1.6
      },
      "health": 50,
      "damage": 8,
      "speed": 3.6,
      "from": 1
    },
    {
      "id": "stalker",
      "label": "Stalker",
      "model": {
        "model": "/models/imported/lantern-reach/creatures/velociraptor.glb",
        "height": 2.4
      },
      "health": 120,
      "damage": 14,
      "speed": 3.2,
      "from": 3
    },
    {
      "id": "rex",
      "label": "Tyrant",
      "model": {
        "model": "/models/imported/lantern-reach/creatures/velociraptor.glb",
        "height": 4.5
      },
      "health": 520,
      "damage": 32,
      "speed": 2.4,
      "from": 5
    }
  ],
  "allies": [
    {
      "id": "stag",
      "label": "Stag",
      "verb": "Tame",
      "model": {
        "model": "/models/imported/lantern-reach/creatures/stag.glb",
        "height": 1.9
      },
      "cost": {
        "berries": 6
      },
      "health": 140,
      "damage": 16,
      "speed": 5
    },
    {
      "id": "boar",
      "label": "Boar",
      "verb": "Tame",
      "model": {
        "model": "/models/imported/lantern-reach/creatures/wild_boar.glb",
        "height": 1.1
      },
      "cost": {
        "berries": 4
      },
      "health": 100,
      "damage": 12,
      "speed": 5
    },
    {
      "id": "bull",
      "label": "Aurochs",
      "verb": "Tame",
      "model": {
        "model": "/models/imported/lantern-reach/creatures/bull.glb",
        "height": 1.8
      },
      "cost": {
        "berries": 10
      },
      "health": 220,
      "damage": 22,
      "speed": 4.2
    }
  ],
  "scenery": [
    {
      "model": "/models/imported/quaternius-stylized-nature/CommonTree_3.glb",
      "height": 8
    },
    {
      "model": "/models/imported/quaternius-stylized-nature/Bush_Common.glb",
      "height": 1.2
    },
    {
      "model": "/models/imported/quaternius-stylized-nature/Fern_1.glb",
      "height": 1.2
    },
    {
      "model": "/models/imported/quaternius-stylized-nature/Fern_1.glb",
      "height": 1.3
    },
    {
      "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_3.glb",
      "height": 2
    },
    {
      "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_2.glb",
      "height": 1.2
    }
  ],
  "winAt": 7,
  "kind": "survival",
  "name": "Fernwild",
  "id": "fernwild",
  "spec": "fernwild",
  "pitch": "ARK-like dinosaur survival: tame dinos, build a base, craft and survive",
  "beats": [
    {
      "id": "beat1",
      "title": "Washed ashore",
      "pitch": "Nothing here is friendly yet. Raise a palisade before the raptors find your smoke.",
      "goal": "Build a palisade and survive the first hunt",
      "fact": "camp.held",
      "atLeast": 1
    },
    {
      "id": "beat2",
      "title": "A pack of your own",
      "pitch": "The beasts that graze here can be won with berries. Tame one to fight beside you.",
      "goal": "Tame a stag",
      "fact": "camp.tamed",
      "atLeast": 1
    },
    {
      "id": "beat3",
      "title": "Stalkers",
      "pitch": "Bigger hunters smell the camp. Fire keeps them back.",
      "goal": "Hold 5 hunts",
      "fact": "camp.held",
      "atLeast": 5
    },
    {
      "id": "beat4",
      "title": "The Tyrant",
      "pitch": "Something huge walks the ferns. Hold the camp through its hunt.",
      "goal": "Survive 7 hunts",
      "fact": "camp.held",
      "atLeast": 7
    }
  ],
  "world": {
    "relief": 5,
    "frequency": 0.01,
    "waterLevel": -40,
    "scatter": {
      "tree": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_3.glb",
        "height": 10
      },
      "tree2": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_1.glb",
        "height": 12
      },
      "tree3": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_2.glb",
        "height": 9
      },
      "fern": {
        "model": "/models/imported/quaternius-stylized-nature/Fern_1.glb",
        "height": 0.9
      },
      "plant": {
        "model": "/models/imported/quaternius-stylized-nature/Plant_1_Big.glb",
        "height": 1.6
      },
      "bush": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common_Flowers.glb",
        "height": 1.2
      },
      "rock": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_3.glb",
        "height": 2.2
      },
      "rock2": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_1.glb",
        "height": 1.4
      }
    },
    "sky": {
      "preset": "day",
      "cycle": true,
      "dayLength": 160,
      "startHour": 7,
      "haze": 0.35
    }
  }
};
