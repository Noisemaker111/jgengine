import type { Idea } from "./kindShape";

/**
 * Orbit Watch: "orbital tower defense"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "tagline": "Hold the relay. Lasers on the pads, the swarm on the lanes.",
  "kit": "holo",
  "look": "cinematic",
  "mood": "day",
  "accent": "#5fd6e8",
  "ground": {
    "material": "sand",
    "low": "#6b5f55",
    "high": "#a8998a"
  },
  "guide": {
    "name": "Commander Vey",
    "title": "Station command"
  },
  "core": {
    "label": "Orbital relay",
    "model": {
      "model": "/models/imported/kaykit-space-base/basemodule_A.glb",
      "height": 7
    },
    "lives": 20
  },
  "coin": {
    "label": "Credits",
    "start": 220
  },
  "foe": "Aliens",
  "wave": "Wave",
  "waves": 12,
  "calm": {
    "first": 25,
    "between": 12
  },
  "towers": [
    {
      "id": "pulse",
      "label": "Pulse turret",
      "cost": 70,
      "damage": 12,
      "range": 16,
      "rate": 1.4,
      "splash": 0,
      "slow": 1,
      "shot": "laser",
      "from": 1,
      "blurb": "Fast red pulses at whatever is furthest along.",
      "model": {
        "model": "/models/imported/kaykit-space-base/structure_tall.glb",
        "height": 5
      }
    },
    {
      "id": "rail",
      "label": "Rail cannon",
      "cost": 110,
      "damage": 42,
      "range": 21,
      "rate": 0.5,
      "splash": 0,
      "slow": 1,
      "shot": "beam",
      "from": 1,
      "blurb": "Slow, long reach, hits hard.",
      "model": {
        "model": "/models/imported/kaykit-space-base/drill_structure.glb",
        "height": 6.5
      }
    },
    {
      "id": "cryo",
      "label": "Cryo array",
      "cost": 90,
      "damage": 6,
      "range": 14,
      "rate": 1,
      "splash": 0,
      "slow": 0.45,
      "shot": "frostbolt",
      "from": 2,
      "blurb": "Chills what it hits to under half speed.",
      "model": {
        "model": "/models/imported/kaykit-space-base/windturbine_low.glb",
        "height": 5
      }
    },
    {
      "id": "mortar",
      "label": "Plasma mortar",
      "cost": 140,
      "damage": 30,
      "range": 17,
      "rate": 0.6,
      "splash": 4.5,
      "slow": 1,
      "shot": "fireball",
      "from": 3,
      "blurb": "Splashes everything near its target.",
      "model": {
        "model": "/models/imported/kaykit-space-base/lander_A.glb",
        "height": 4
      }
    }
  ],
  "creeps": [
    {
      "id": "skitter",
      "label": "Skitter",
      "health": 30,
      "speed": 4.2,
      "bounty": 4,
      "leak": 1,
      "from": 1,
      "model": {
        "model": "/models/imported/quaternius-modular-scifi/Alien_Oculichrysalis.glb",
        "height": 2.6
      }
    },
    {
      "id": "cyclop",
      "label": "Cyclop",
      "health": 70,
      "speed": 2.8,
      "bounty": 6,
      "leak": 1,
      "from": 1,
      "model": {
        "model": "/models/imported/quaternius-modular-scifi/Alien_Cyclop.glb",
        "height": 3.4
      }
    },
    {
      "id": "warden",
      "label": "Brood warden",
      "health": 170,
      "speed": 2.2,
      "bounty": 10,
      "leak": 2,
      "from": 4,
      "model": {
        "model": "/models/imported/quaternius-modular-scifi/Alien_Cyclop.glb",
        "height": 4.6,
        "tint": "#ff9a8a"
      }
    },
    {
      "id": "scolitex",
      "label": "The Scolitex",
      "health": 900,
      "speed": 1.8,
      "bounty": 60,
      "leak": 5,
      "from": 5,
      "boss": true,
      "model": {
        "model": "/models/imported/quaternius-modular-scifi/Alien_Scolitex.glb",
        "height": 7
      }
    }
  ],
  "pad": {
    "model": "/models/imported/kaykit-space-base/landingpad_small.glb",
    "height": 1
  },
  "scenery": [
    {
      "model": "/models/imported/kaykit-space-base/rock_B.glb",
      "height": 9
    },
    {
      "model": "/models/imported/kaykit-space-base/cargo_A_stacked.glb",
      "height": 2.4
    },
    {
      "model": "/models/imported/kaykit-space-base/containers_A.glb",
      "height": 2.2
    },
    {
      "model": "/models/imported/quaternius-modular-scifi/Prop_Light_Floor.glb",
      "height": 1.5
    },
    {
      "model": "/models/imported/kaykit-space-base/solarpanel.glb",
      "height": 1.6
    },
    {
      "model": "/models/imported/kaykit-space-base/spacetruck.glb",
      "height": 2.4
    }
  ],
  "kind": "defense",
  "name": "Orbit Watch",
  "id": "orbit-watch",
  "spec": "orbit_watch",
  "pitch": "orbital tower defense",
  "beats": [
    {
      "id": "beat1",
      "title": "First line",
      "pitch": "The swarm is inbound. Put a turret on a pad beside the lane.",
      "goal": "Build a tower on a pad",
      "fact": "hold.towers",
      "atLeast": 1
    },
    {
      "id": "beat2",
      "title": "Contact",
      "pitch": "Here they come. Hold the first wave off the relay.",
      "goal": "Hold wave 1",
      "fact": "hold.cleared",
      "atLeast": 1
    },
    {
      "id": "beat3",
      "title": "Dig in",
      "pitch": "Credits from kills buy more guns. Get five towers on the pads.",
      "goal": "Have 5 towers up",
      "fact": "hold.towers",
      "atLeast": 5
    },
    {
      "id": "beat4",
      "title": "Overcharge",
      "pitch": "Upgrade what you have: three upgrades across the line.",
      "goal": "Reach 8 tower levels in all",
      "fact": "hold.levels",
      "atLeast": 8
    },
    {
      "id": "beat5",
      "title": "Hold the relay",
      "pitch": "Twelve waves and the swarm breaks. Keep the relay standing.",
      "goal": "Hold all 12 waves",
      "fact": "hold.cleared",
      "atLeast": 12
    }
  ],
  "world": {
    "relief": 4,
    "frequency": 0.008,
    "waterLevel": -40,
    "scatter": {
      "spire": {
        "model": "/models/imported/kaykit-space-base/rock_A.glb",
        "height": 7
      },
      "spire2": {
        "model": "/models/imported/kaykit-space-base/rock_B.glb",
        "height": 9
      },
      "column": {
        "model": "/models/imported/quaternius-modular-scifi/Column_Astra.glb",
        "height": 8
      },
      "pebbles": {
        "model": "/models/imported/kaykit-space-base/rocks_B.glb",
        "height": 1
      },
      "rubble": {
        "model": "/models/imported/kaykit-space-base/rocks_A.glb",
        "height": 1.6
      },
      "boulder": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_2.glb",
        "height": 2.4,
        "tint": "#8d8f9a"
      },
      "boulder2": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_3.glb",
        "height": 3,
        "tint": "#7b7d88"
      }
    },
    "sky": {
      "preset": "day",
      "cycle": true,
      "dayLength": 900,
      "startHour": 10,
      "haze": 0.5
    }
  }
};
