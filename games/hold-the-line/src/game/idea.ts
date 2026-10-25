import type { Idea } from "./kindShape";

/**
 * Hold the Line: "zombie survival: scavenge by day, fortify your safehouse, nights get harder"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "tagline": "Scavenge by day. Fortify by dusk. Live through the night.",
  "kit": "terminal",
  "look": "cinematic",
  "mood": "overcast",
  "accent": "#e8a33c",
  "ground": {
    "material": "ash",
    "low": "#4a4a3f",
    "high": "#77705c"
  },
  "home": {
    "label": "Safehouse",
    "health": 1500,
    "model": {
      "model": "/models/imported/kaykit-city-builder/building_B.glb",
      "height": 9
    }
  },
  "guide": {
    "name": "Mara",
    "title": "Radio voice"
  },
  "wave": "Night",
  "calm": 75,
  "hero": {
    "model": "human/soldier",
    "height": 1.8,
    "health": 120,
    "damage": 34,
    "label": "You"
  },
  "resources": [
    {
      "id": "scrap",
      "label": "Scrap",
      "start": 30
    },
    {
      "id": "food",
      "label": "Food",
      "start": 10
    }
  ],
  "nodes": [
    {
      "id": "crate",
      "label": "Supply crate",
      "verb": "Search",
      "gives": "scrap",
      "amount": 6,
      "uses": 3,
      "regrow": 0.02,
      "prop": {
        "model": "industrial/wooden-crate",
        "height": 0.9
      }
    },
    {
      "id": "wreck",
      "label": "Wrecked car",
      "verb": "Strip",
      "gives": "scrap",
      "amount": 10,
      "uses": 4,
      "regrow": 0.015,
      "prop": {
        "model": "/models/imported/kaykit-city-builder/car_sedan.glb",
        "height": 1.5
      }
    },
    {
      "id": "bin",
      "label": "Trash can",
      "verb": "Rummage",
      "gives": "food",
      "amount": 4,
      "uses": 2,
      "regrow": 0.02,
      "prop": {
        "model": "city/trash-can",
        "height": 1.1
      }
    },
    {
      "id": "drum",
      "label": "Oil drum",
      "verb": "Siphon",
      "gives": "scrap",
      "amount": 4,
      "uses": 2,
      "regrow": 0.03,
      "prop": {
        "model": "industrial/barrel",
        "height": 1
      }
    }
  ],
  "structures": [
    {
      "id": "barricade",
      "label": "Barricade",
      "role": "wall",
      "key": "1",
      "cost": {
        "scrap": 8
      },
      "takes": 2,
      "health": 260,
      "power": 0,
      "prop": {
        "model": "city/road-barrier",
        "height": 1.1
      }
    },
    {
      "id": "lookout",
      "label": "Lookout",
      "role": "turret",
      "key": "2",
      "cost": {
        "scrap": 30
      },
      "takes": 5,
      "health": 200,
      "power": 16,
      "prop": {
        "model": "/models/imported/kaykit-city-builder/watertower.glb",
        "height": 5
      }
    },
    {
      "id": "garden",
      "label": "Garden bed",
      "role": "producer",
      "key": "3",
      "cost": {
        "scrap": 14
      },
      "takes": 4,
      "health": 120,
      "power": 0.25,
      "makes": "food",
      "prop": {
        "model": "park/planter-box",
        "height": 0.8
      }
    }
  ],
  "threats": [
    {
      "id": "shambler",
      "label": "Shambler",
      "model": {
        "model": "human/man-casual",
        "height": 1.8,
        "tint": "#7c9468"
      },
      "health": 60,
      "damage": 8,
      "speed": 1.6,
      "from": 1
    },
    {
      "id": "biter",
      "label": "Biter",
      "model": {
        "model": "human/woman-casual",
        "height": 1.7,
        "tint": "#7c9468"
      },
      "health": 45,
      "damage": 7,
      "speed": 2.2,
      "from": 1
    },
    {
      "id": "runner",
      "label": "Runner",
      "model": {
        "model": "human/jogger",
        "height": 1.8,
        "tint": "#7c9468"
      },
      "health": 40,
      "damage": 6,
      "speed": 4.2,
      "from": 3
    },
    {
      "id": "brute",
      "label": "Brute",
      "model": {
        "model": "human/construction-worker",
        "height": 2.3,
        "tint": "#7c9468"
      },
      "health": 260,
      "damage": 22,
      "speed": 1.4,
      "from": 5
    }
  ],
  "allies": [
    {
      "id": "dog",
      "label": "Stray dog",
      "verb": "Feed",
      "model": {
        "model": "creature/dog-shepherd",
        "height": 0.8
      },
      "cost": {
        "food": 6
      },
      "health": 90,
      "damage": 14,
      "speed": 5.5
    }
  ],
  "scenery": [
    {
      "model": "/models/imported/kaykit-city-builder/car_sedan.glb",
      "height": 1.5
    },
    {
      "model": "industrial/barrel",
      "height": 1
    },
    {
      "model": "/models/imported/kaykit-city-builder/car_hatchback.glb",
      "height": 1.5
    },
    {
      "model": "city/street-lamp",
      "height": 5
    },
    {
      "model": "/models/imported/kaykit-city-builder/dumpster.glb",
      "height": 1.4
    },
    {
      "model": "city/fire-hydrant",
      "height": 0.8
    },
    {
      "model": "/models/imported/quaternius-stylized-nature/DeadTree_1.glb",
      "height": 6
    }
  ],
  "winAt": 7,
  "kind": "survival",
  "name": "Hold the Line",
  "id": "hold-the-line",
  "spec": "hold_the_line",
  "pitch": "zombie survival: scavenge by day, fortify your safehouse, nights get harder",
  "beats": [
    {
      "id": "beat1",
      "title": "First night",
      "pitch": "The radio crackles: the dead walk after dark. Board up before the sun goes.",
      "goal": "Build a barricade and survive the first night",
      "fact": "camp.held",
      "atLeast": 1
    },
    {
      "id": "beat2",
      "title": "Hold out",
      "pitch": "They came back, and more of them. Keep the walls standing.",
      "goal": "Feed a stray dog",
      "fact": "camp.tamed",
      "atLeast": 1
    },
    {
      "id": "beat3",
      "title": "The long dark",
      "pitch": "Brutes are in the horde now. Build up and hold.",
      "goal": "Hold 5 nights",
      "fact": "camp.held",
      "atLeast": 5
    },
    {
      "id": "beat4",
      "title": "Dawn of rescue",
      "pitch": "A convoy is coming. Survive until they reach you.",
      "goal": "Survive 7 nights",
      "fact": "camp.held",
      "atLeast": 7
    }
  ],
  "world": {
    "relief": 3,
    "frequency": 0.012,
    "waterLevel": -40,
    "scatter": {
      "deadtree": {
        "model": "/models/imported/quaternius-stylized-nature/DeadTree_2.glb",
        "height": 8
      },
      "deadtree2": {
        "model": "/models/imported/quaternius-stylized-nature/DeadTree_4.glb",
        "height": 7
      },
      "pine": {
        "model": "/models/imported/quaternius-stylized-nature/Pine_3.glb",
        "height": 10
      },
      "bush": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common.glb",
        "height": 1.1
      },
      "grass": {
        "model": "/models/imported/quaternius-stylized-nature/Grass_Wispy_Tall.glb",
        "height": 0.7
      },
      "rock": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_2.glb",
        "height": 1.6
      }
    },
    "sky": {
      "preset": "day",
      "cycle": true,
      "dayLength": 150,
      "startHour": 7,
      "haze": 0.55
    }
  }
};
