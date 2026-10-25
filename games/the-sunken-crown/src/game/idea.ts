import type { Idea } from "./kindShape";

/**
 * The Sunken Crown: "explore ancient ruins and find relics that let you glide"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "tagline": "Walk the old roads. Wake the ruins. Learn to fly.",
  "kit": "parchment",
  "look": "cinematic",
  "mood": "golden",
  "accent": "#e6b65a",
  "ground": {
    "material": "grass",
    "low": "#4f6b32",
    "high": "#93a05c"
  },
  "guide": {
    "name": "Ysolde",
    "title": "Last of the wardens"
  },
  "hero": {
    "model": "/models/imported/lantern-reach/players/ranger.glb",
    "height": 1.8,
    "health": 120,
    "damage": 30,
    "stamina": 100,
    "label": "Wanderer"
  },
  "pedestal": {
    "model": "/models/imported/kaykit-dungeon/pillar.glb",
    "height": 1.1
  },
  "goal": {
    "label": "the Sky Altar",
    "verb": "Wake",
    "done": "The Sky Altar wakes",
    "model": {
      "model": "/models/imported/kaykit-dungeon/chest_gold.glb",
      "height": 1.4
    }
  },
  "landmarks": [
    {
      "id": "gate",
      "label": "The Broken Gate",
      "role": "relic",
      "centerpiece": {
        "model": "/models/imported/kaykit-dungeon/wall_arched.glb",
        "height": 7
      },
      "ruins": [
        {
          "model": "/models/imported/kaykit-dungeon/rubble_large.glb",
          "height": 1.4
        },
        {
          "model": "/models/imported/kaykit-dungeon/wall_broken.glb",
          "height": 3.6
        },
        {
          "model": "/models/imported/kaykit-dungeon/torch_lit.glb",
          "height": 2.2
        }
      ],
      "relic": {
        "id": "feather",
        "label": "Wing of Aurel",
        "grants": "glide",
        "blurb": "Hold Space in the air to glide.",
        "model": {
          "model": "/models/imported/kaykit-dungeon/key.glb",
          "height": 0.9
        }
      }
    },
    {
      "id": "colonnade",
      "label": "Sunken Colonnade",
      "role": "vista",
      "centerpiece": {
        "model": "/models/imported/kaykit-dungeon/pillar_decorated.glb",
        "height": 9
      },
      "ruins": [
        {
          "model": "/models/imported/kaykit-dungeon/pillar.glb",
          "height": 6
        },
        {
          "model": "/models/imported/kaykit-dungeon/rubble_half.glb",
          "height": 1
        },
        {
          "model": "/models/imported/kaykit-dungeon/column.glb",
          "height": 5
        }
      ]
    },
    {
      "id": "watch",
      "label": "Warden's Watch",
      "role": "relic",
      "centerpiece": {
        "model": "/models/imported/kaykit-dungeon/wall_archedwindow_open.glb",
        "height": 8
      },
      "ruins": [
        {
          "model": "/models/imported/kaykit-dungeon/wall_cracked.glb",
          "height": 4
        },
        {
          "model": "/models/imported/kaykit-dungeon/banner_patternA_red.glb",
          "height": 3
        },
        {
          "model": "/models/imported/kaykit-dungeon/rubble_large.glb",
          "height": 1.4
        }
      ],
      "relic": {
        "id": "heart",
        "label": "Ember Heart",
        "grants": "stamina",
        "blurb": "Your stamina runs much deeper now.",
        "model": {
          "model": "/models/imported/kaykit-dungeon/coin_stack_large.glb",
          "height": 0.7
        }
      },
      "guardian": {
        "id": "skeleton",
        "label": "Bone warden",
        "model": {
          "model": "/models/imported/lantern-reach/enemies/skeleton_warrior.glb",
          "height": 1.9
        },
        "health": 70,
        "damage": 8,
        "speed": 2.6,
        "count": 2
      }
    },
    {
      "id": "hollow",
      "label": "The Moss Hollow",
      "role": "vista",
      "centerpiece": {
        "model": "/models/imported/lantern-reach/settlements/settlement-3.glb",
        "height": 8
      },
      "ruins": [
        {
          "model": "/models/imported/kaykit-dungeon/wall_half.glb",
          "height": 2
        },
        {
          "model": "/models/imported/quaternius-stylized-nature/Mushroom_Laetiporus.glb",
          "height": 1.2
        },
        {
          "model": "/models/imported/kaykit-dungeon/barrel_large.glb",
          "height": 1.1
        }
      ]
    },
    {
      "id": "spire",
      "label": "Thornspire",
      "role": "relic",
      "centerpiece": {
        "model": "/models/imported/kaykit-dungeon/wall_pillar.glb",
        "height": 11
      },
      "ruins": [
        {
          "model": "/models/imported/kaykit-dungeon/stairs.glb",
          "height": 2.5
        },
        {
          "model": "/models/imported/kaykit-dungeon/wall_broken.glb",
          "height": 3.6
        },
        {
          "model": "/models/imported/kaykit-dungeon/torch_lit.glb",
          "height": 2.2
        }
      ],
      "relic": {
        "id": "boots",
        "label": "Stormstep Boots",
        "grants": "doubleJump",
        "blurb": "Press Space again in the air to jump twice.",
        "model": {
          "model": "/models/imported/kaykit-dungeon/chest.glb",
          "height": 0.9
        }
      },
      "guardian": {
        "id": "orc",
        "label": "Thorn brute",
        "model": {
          "model": "/models/imported/lantern-reach/creatures/orc.glb",
          "height": 2.2
        },
        "health": 110,
        "damage": 11,
        "speed": 2.8,
        "count": 3
      }
    },
    {
      "id": "altar",
      "label": "The Sky Altar",
      "role": "final",
      "centerpiece": {
        "model": "/models/imported/lantern-reach/settlements/settlement-7.glb",
        "height": 12
      },
      "ruins": [
        {
          "model": "/models/imported/kaykit-dungeon/pillar_decorated.glb",
          "height": 7
        },
        {
          "model": "/models/imported/kaykit-dungeon/banner_triple_yellow.glb",
          "height": 3.5
        },
        {
          "model": "/models/imported/kaykit-dungeon/torch_lit.glb",
          "height": 2.2
        }
      ],
      "guardian": {
        "id": "golem",
        "label": "Altar golem",
        "model": {
          "model": "/models/imported/lantern-reach/enemies/skeleton_golem.glb",
          "height": 3.4
        },
        "health": 420,
        "damage": 16,
        "speed": 2.2,
        "count": 1
      }
    }
  ],
  "scenery": [
    {
      "model": "/models/imported/kaykit-dungeon/crates_stacked.glb",
      "height": 1.4
    },
    {
      "model": "/models/imported/kaykit-dungeon/barrel_small_stack.glb",
      "height": 1.2
    },
    {
      "model": "/models/imported/kaykit-dungeon/torch_lit.glb",
      "height": 2.2
    },
    {
      "model": "/models/imported/kaykit-dungeon/box_stacked.glb",
      "height": 1.2
    }
  ],
  "kind": "explorer",
  "name": "The Sunken Crown",
  "id": "the-sunken-crown",
  "spec": "the_sunken_crown",
  "pitch": "explore ancient ruins and find relics that let you glide",
  "beats": [
    {
      "id": "beat1",
      "title": "The road out",
      "pitch": "The old gate is just ahead. Something there still remembers how to fly.",
      "goal": "Take Wing of Aurel at The Broken Gate",
      "fact": "journey.relics",
      "atLeast": 1
    },
    {
      "id": "beat2",
      "title": "Warden's Watch",
      "pitch": "Bone wardens keep the watchtower. What they guard will carry you further.",
      "goal": "Take Ember Heart at Warden's Watch",
      "fact": "journey.relics",
      "atLeast": 2
    },
    {
      "id": "beat3",
      "title": "Thornspire",
      "pitch": "The spire stands past the hollow. Brutes nest at its feet.",
      "goal": "Take Stormstep Boots at Thornspire",
      "fact": "journey.relics",
      "atLeast": 3
    },
    {
      "id": "beat4",
      "title": "Wake the altar",
      "pitch": "Three relics, one altar. Its golem has waited a long time for you.",
      "goal": "Wake the Sky Altar",
      "fact": "journey.won",
      "atLeast": 1
    }
  ],
  "world": {
    "relief": 9,
    "frequency": 0.008,
    "waterLevel": -1.2,
    "scatter": {
      "oak": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_1.glb",
        "height": 9
      },
      "oak2": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_3.glb",
        "height": 10
      },
      "pine": {
        "model": "/models/imported/quaternius-stylized-nature/Pine_2.glb",
        "height": 12
      },
      "pine2": {
        "model": "/models/imported/quaternius-stylized-nature/Pine_4.glb",
        "height": 10
      },
      "bush": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common_Flowers.glb",
        "height": 1.2
      },
      "fern": {
        "model": "/models/imported/quaternius-stylized-nature/Fern_1.glb",
        "height": 0.9
      },
      "flowers": {
        "model": "/models/imported/quaternius-stylized-nature/Flower_3_Group.glb",
        "height": 0.5
      },
      "rock": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_1.glb",
        "height": 1.8
      },
      "rock2": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_3.glb",
        "height": 2.6
      }
    },
    "sky": {
      "preset": "day",
      "cycle": true,
      "dayLength": 900,
      "startHour": 9,
      "haze": 0.5
    }
  }
};
