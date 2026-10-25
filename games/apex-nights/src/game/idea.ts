import type { Idea } from "./kindShape";

/**
 * Apex Nights: "arcade street racer: win night races, earn cash, upgrade your car"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "kind": "racer",
  "name": "Apex Nights",
  "id": "apex-nights",
  "spec": "apex_nights",
  "pitch": "arcade street racer: win night races, earn cash, upgrade your car",
  "tagline": "Win races. Tune the car. Own the night.",
  "kit": "arcade",
  "look": "cinematic",
  "mood": "dusk",
  "accent": "#ff3d8b",
  "ground": {
    "material": "grass",
    "low": "#2c3a28",
    "high": "#4b5640"
  },
  "world": {
    "relief": 7,
    "frequency": 0.008,
    "waterLevel": -40,
    "scatter": {
      "tree": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_1.glb",
        "height": 10
      },
      "tree2": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_4.glb",
        "height": 12
      },
      "pine": {
        "model": "/models/imported/quaternius-stylized-nature/Pine_2.glb",
        "height": 11
      },
      "bush": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common.glb",
        "height": 1.2
      },
      "grass": {
        "model": "/models/imported/quaternius-stylized-nature/Grass_Common_Tall.glb",
        "height": 0.6
      },
      "rock": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_1.glb",
        "height": 1.6
      }
    },
    "sky": {
      "preset": "dusk",
      "cycle": true,
      "dayLength": 1440,
      "startHour": 18.6,
      "haze": 0.4
    }
  },
  "guide": {
    "name": "Vee",
    "title": "Crew chief"
  },
  "currency": {
    "id": "cash",
    "label": "Cash",
    "start": 200
  },
  "car": {
    "model": "vehicle/sports-car",
    "height": 1.3
  },
  "rivals": [
    {
      "model": "/models/imported/kaykit-city-builder/car_taxi.glb",
      "height": 1.5
    },
    {
      "model": "/models/imported/kaykit-city-builder/car_police.glb",
      "height": 1.5
    },
    {
      "model": "/models/imported/kaykit-city-builder/car_hatchback.glb",
      "height": 1.5
    },
    {
      "model": "/models/imported/kaykit-city-builder/car_stationwagon.glb",
      "height": 1.5
    }
  ],
  "upgrades": [
    {
      "id": "engine",
      "label": "Engine",
      "cost": 150,
      "levels": 5,
      "boost": 0.08
    },
    {
      "id": "grip",
      "label": "Tyres",
      "cost": 120,
      "levels": 5,
      "boost": 0.08
    },
    {
      "id": "nitro",
      "label": "Nitro",
      "cost": 180,
      "levels": 4,
      "boost": 0.2
    }
  ],
  "races": [
    {
      "id": "rookie",
      "title": "Rookie sprint",
      "laps": 2,
      "rivals": 3,
      "pay": 220,
      "pitch": "Three locals, two laps. Show them you're real."
    },
    {
      "id": "docks",
      "title": "Dockside dash",
      "laps": 3,
      "rivals": 4,
      "pay": 380,
      "pitch": "The dock crews race for keeps. Three laps."
    },
    {
      "id": "crown",
      "title": "Crown of the city",
      "laps": 3,
      "rivals": 4,
      "pay": 700,
      "pitch": "The best in the city. Win this and the streets are yours."
    }
  ],
  "scenery": [
    {
      "model": "city/road-barrier",
      "height": 1.1
    },
    {
      "model": "/models/imported/kaykit-city-builder/box_A.glb",
      "height": 1
    },
    {
      "model": "/models/imported/kaykit-city-builder/dumpster.glb",
      "height": 1.4
    },
    {
      "model": "/models/imported/kaykit-city-builder/trafficlight_A.glb",
      "height": 4.5
    },
    {
      "model": "/models/imported/kaykit-city-builder/watertower.glb",
      "height": 9
    }
  ],
  "trackside": {
    "model": "city/street-lamp",
    "height": 6
  }
};
