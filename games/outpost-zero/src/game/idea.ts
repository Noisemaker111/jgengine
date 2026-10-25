import type { Idea } from "./kindShape";

/**
 * Outpost Zero: "third person shooter clearing alien outposts"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "tagline": "Push out from the base. Break every hive camp. Get paid.",
  "kit": "holo",
  "look": "cinematic",
  "mood": "dusk",
  "accent": "#4fd8ff",
  "ground": {
    "material": "rock",
    "low": "#6b3f2c",
    "high": "#a8664a"
  },
  "guide": {
    "name": "Command",
    "title": "Forward command"
  },
  "hero": {
    "model": "human/soldier",
    "height": 1.8,
    "health": 150,
    "label": "Trooper"
  },
  "base": {
    "label": "Forward Base",
    "model": {
      "model": "/models/imported/kaykit-space-base/basemodule_A.glb",
      "height": 6
    }
  },
  "foe": "the Hive",
  "currency": {
    "id": "credits",
    "label": "Credits",
    "start": 0
  },
  "guns": [
    {
      "id": "carbine",
      "label": "Carbine",
      "damage": 12,
      "range": 60,
      "spread": 1.2,
      "pellets": 1,
      "rpm": 540,
      "auto": true,
      "mag": 30,
      "reloadMs": 1600,
      "price": 0
    },
    {
      "id": "scatter",
      "label": "Scattergun",
      "damage": 9,
      "range": 22,
      "spread": 6,
      "pellets": 8,
      "rpm": 75,
      "auto": false,
      "mag": 6,
      "reloadMs": 2200,
      "price": 300
    },
    {
      "id": "marksman",
      "label": "Marksman",
      "damage": 55,
      "range": 120,
      "spread": 0.3,
      "pellets": 1,
      "rpm": 90,
      "auto": false,
      "mag": 8,
      "reloadMs": 2000,
      "price": 650
    },
    {
      "id": "pulse",
      "label": "Pulse LMG",
      "damage": 16,
      "range": 70,
      "spread": 2.2,
      "pellets": 1,
      "rpm": 720,
      "auto": true,
      "mag": 80,
      "reloadMs": 3200,
      "price": 1200
    }
  ],
  "enemies": [
    {
      "id": "cyclop",
      "label": "Cyclop gunner",
      "model": {
        "model": "/models/imported/quaternius-modular-scifi/Alien_Cyclop.glb",
        "height": 1.9
      },
      "health": 70,
      "damage": 5,
      "range": 26,
      "every": 1.4,
      "spread": 3.5,
      "speed": 2,
      "bounty": 25
    },
    {
      "id": "scolitex",
      "label": "Scolitex",
      "model": {
        "model": "/models/imported/quaternius-modular-scifi/Alien_Scolitex.glb",
        "height": 1.9
      },
      "health": 50,
      "damage": 4,
      "range": 20,
      "every": 0.9,
      "spread": 4.5,
      "speed": 3.6,
      "bounty": 30
    },
    {
      "id": "brute",
      "label": "Oculichrysalis brute",
      "model": {
        "model": "/models/imported/quaternius-modular-scifi/Alien_Oculichrysalis.glb",
        "height": 2.5
      },
      "health": 260,
      "damage": 14,
      "range": 30,
      "every": 2.2,
      "spread": 2.5,
      "speed": 1.5,
      "bounty": 90
    }
  ],
  "upgrades": [
    {
      "id": "armor",
      "label": "Armor",
      "stat": "armor",
      "step": 0.25,
      "price": 200,
      "stages": 4
    },
    {
      "id": "rounds",
      "label": "Rounds",
      "stat": "damage",
      "step": 0.2,
      "price": 250,
      "stages": 4
    }
  ],
  "cover": [
    {
      "model": "/models/imported/kaykit-space-base/cargo_A.glb",
      "height": 1.6
    },
    {
      "model": "/models/imported/kaykit-space-base/containers_B.glb",
      "height": 2.2
    },
    {
      "model": "/models/imported/quaternius-modular-scifi/Prop_Crate3.glb",
      "height": 1
    },
    {
      "model": "/models/imported/quaternius-modular-scifi/Prop_Barrel_Large.glb",
      "height": 1.3
    },
    {
      "model": "/models/imported/kaykit-space-base/structure_low.glb",
      "height": 3
    }
  ],
  "scenery": [
    {
      "model": "/models/imported/kaykit-space-base/solarpanel.glb",
      "height": 2.2
    },
    {
      "model": "/models/imported/kaykit-space-base/windturbine_low.glb",
      "height": 6
    },
    {
      "model": "/models/imported/kaykit-space-base/lander_A.glb",
      "height": 5
    },
    {
      "model": "/models/imported/kaykit-space-base/cargo_B_stacked.glb",
      "height": 3
    },
    {
      "model": "/models/imported/kaykit-space-base/rocks_A.glb",
      "height": 2
    },
    {
      "model": "/models/imported/kaykit-space-base/spacetruck.glb",
      "height": 2.4
    }
  ],
  "kind": "shooter",
  "name": "Outpost Zero",
  "id": "outpost-zero",
  "spec": "outpost_zero",
  "pitch": "third person shooter clearing alien outposts",
  "outposts": [
    {
      "id": "outpost1",
      "label": "Drill Site",
      "garrison": [
        "cyclop",
        "cyclop",
        "cyclop"
      ],
      "pay": 150
    },
    {
      "id": "outpost2",
      "label": "Crater Nest",
      "garrison": [
        "cyclop",
        "scolitex",
        "scolitex",
        "cyclop"
      ],
      "pay": 250
    },
    {
      "id": "outpost3",
      "label": "Relay Hive",
      "garrison": [
        "cyclop",
        "scolitex",
        "brute",
        "scolitex",
        "cyclop"
      ],
      "pay": 400
    },
    {
      "id": "outpost4",
      "label": "Queen's Spire",
      "garrison": [
        "brute",
        "scolitex",
        "cyclop",
        "brute",
        "scolitex",
        "cyclop"
      ],
      "pay": 700
    }
  ],
  "beats": [
    {
      "id": "beat1",
      "title": "Boots on the dust",
      "pitch": "The Hive dug in at the old drill site. Clear it and the road out is ours.",
      "goal": "Clear Drill Site",
      "fact": "ops.cleared",
      "atLeast": 1
    },
    {
      "id": "beat2",
      "title": "The crater",
      "pitch": "Scolitex swarm the crater nest. Keep moving and keep firing.",
      "goal": "Clear Crater Nest",
      "fact": "ops.cleared",
      "atLeast": 2
    },
    {
      "id": "beat3",
      "title": "Cut the relay",
      "pitch": "The relay hive calls the brutes. Bring something heavier.",
      "goal": "Clear Relay Hive",
      "fact": "ops.cleared",
      "atLeast": 3
    },
    {
      "id": "beat4",
      "title": "Queen's Spire",
      "pitch": "Their last camp. Break it and the planet is clear.",
      "goal": "Clear Queen's Spire",
      "fact": "ops.cleared",
      "atLeast": 4
    }
  ],
  "world": {
    "relief": 6,
    "frequency": 0.009,
    "waterLevel": -40,
    "scatter": {
      "deadtree": {
        "model": "/models/imported/quaternius-stylized-nature/DeadTree_3.glb",
        "height": 6
      },
      "deadtree2": {
        "model": "/models/imported/quaternius-stylized-nature/DeadTree_5.glb",
        "height": 5
      },
      "rock": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_3.glb",
        "height": 2.4
      },
      "rock2": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_1.glb",
        "height": 1.4
      },
      "boulder": {
        "model": "/models/imported/kaykit-space-base/rock_A.glb",
        "height": 3
      },
      "pebble": {
        "model": "/models/imported/quaternius-stylized-nature/Pebble_Round_2.glb",
        "height": 0.4
      }
    },
    "sky": {
      "preset": "dusk",
      "cycle": true,
      "dayLength": 1800,
      "startHour": 17.4,
      "haze": 0.5
    }
  }
};
