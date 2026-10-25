import type { Idea } from "./kindShape";

/**
 * Saltwick: "cozy fishing village"
 *
 * Everything the game says and draws starts here. Change a word, a cost or a model and the game
 * follows; places live in `src/editor.scene.json` (F2+E in the running game).
 */
export const idea: Idea = {
  "tagline": "Grow a garden, cast a line, and settle into the slow life by the sea.",
  "kit": "paper",
  "look": "cinematic",
  "mood": "golden",
  "accent": "#e9a24d",
  "ground": {
    "material": "grass",
    "low": "#5d7a3a",
    "high": "#9aa863"
  },
  "currency": {
    "id": "coins",
    "label": "Coins",
    "start": 30
  },
  "hero": {
    "model": "/models/imported/lantern-reach/players/ranger.glb",
    "height": 1.8,
    "label": "You"
  },
  "home": {
    "label": "Cottage",
    "model": {
      "model": "/models/imported/lantern-reach/settlements/settlement-3.glb",
      "height": 7
    }
  },
  "stall": {
    "label": "Fish cart",
    "model": {
      "model": "/models/imported/quaternius-medieval-village/Prop_Wagon.glb",
      "height": 1.8
    }
  },
  "market": {
    "label": "Harbor market",
    "town": "the harbor",
    "model": {
      "model": "/models/imported/lantern-reach/settlements/market-cobbles.glb"
    },
    "opens": 6,
    "closes": 20
  },
  "water": {
    "label": "Bay",
    "spot": "Fishing rock"
  },
  "crops": [
    {
      "id": "turnip",
      "label": "Turnip",
      "seed": 4,
      "hours": 5,
      "price": 11,
      "yield": 1,
      "unlock": 0,
      "sprout": {
        "model": "/models/imported/quaternius-stylized-nature/Grass_Common_Short.glb",
        "height": 0.35,
        "tint": "#b6e07a"
      },
      "ripe": {
        "model": "/models/imported/quaternius-stylized-nature/Plant_1.glb",
        "height": 0.8
      }
    },
    {
      "id": "cabbage",
      "label": "Cabbage",
      "seed": 8,
      "hours": 9,
      "price": 22,
      "yield": 1,
      "unlock": 40,
      "sprout": {
        "model": "/models/imported/quaternius-stylized-nature/Clover_2.glb",
        "height": 0.35
      },
      "ripe": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common.glb",
        "height": 1
      }
    },
    {
      "id": "sunflower",
      "label": "Sunflower",
      "seed": 14,
      "hours": 14,
      "price": 40,
      "yield": 1,
      "unlock": 90,
      "sprout": {
        "model": "/models/imported/quaternius-stylized-nature/Clover_2.glb",
        "height": 0.35
      },
      "ripe": {
        "model": "/models/imported/quaternius-stylized-nature/Flower_4_Group.glb",
        "height": 1.3
      }
    },
    {
      "id": "berry",
      "label": "Sea berry",
      "seed": 20,
      "hours": 20,
      "price": 30,
      "yield": 3,
      "unlock": 150,
      "sprout": {
        "model": "/models/imported/quaternius-stylized-nature/Grass_Common_Short.glb",
        "height": 0.35,
        "tint": "#b6e07a"
      },
      "ripe": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common_Flowers.glb",
        "height": 0.9
      }
    }
  ],
  "fish": [
    {
      "id": "sardine",
      "label": "Sardine",
      "price": 7,
      "weight": 5,
      "after": 0,
      "drift": 0
    },
    {
      "id": "mackerel",
      "label": "Mackerel",
      "price": 13,
      "weight": 3,
      "after": 1,
      "drift": 0.05
    },
    {
      "id": "seabass",
      "label": "Sea bass",
      "price": 28,
      "weight": 2,
      "after": 3,
      "drift": 0.12
    },
    {
      "id": "whiskers",
      "label": "Old Whiskers",
      "price": 110,
      "weight": 0.4,
      "after": 6,
      "drift": 0.28
    }
  ],
  "upgrades": [
    {
      "id": "rod",
      "label": "Fishing rod",
      "does": "wider green, quicker bites",
      "cost": 60,
      "levels": 3
    },
    {
      "id": "land",
      "label": "More land",
      "does": "clears another row of plots",
      "cost": 80,
      "levels": 3
    }
  ],
  "plots": {
    "start": 6,
    "total": 12,
    "perRow": 3
  },
  "villagers": [
    {
      "id": "nell",
      "name": "Nell",
      "title": "Harbor keeper",
      "line": "Tide's kind today. The bay always gives back what you put into it.",
      "model": {
        "model": "/models/imported/lantern-reach/players/mage_classic.glb",
        "height": 1.75
      }
    },
    {
      "id": "bram",
      "name": "Old Bram",
      "title": "Fisherman",
      "line": "Watch the green, not the float. And never chase Old Whiskers on an empty stomach.",
      "model": {
        "model": "/models/imported/lantern-reach/players/barbarian.glb",
        "height": 1.8
      }
    },
    {
      "id": "ivy",
      "name": "Ivy",
      "title": "Market cook",
      "line": "Bring me anything fresh and I'll find a pot for it.",
      "model": {
        "model": "/models/imported/lantern-reach/players/rogue_hooded.glb",
        "height": 1.7
      }
    }
  ],
  "animals": [
    {
      "model": "/models/imported/lantern-reach/creatures/chicken_cow.glb",
      "height": 0.7
    },
    {
      "model": "/models/imported/lantern-reach/creatures/alpaca.glb",
      "height": 1.5
    }
  ],
  "scenery": [
    {
      "model": "/models/imported/quaternius-medieval-village/Prop_Crate.glb",
      "height": 0.9
    },
    {
      "model": "industrial/barrel",
      "height": 1
    },
    {
      "model": "/models/imported/quaternius-medieval-village/Prop_WoodenFence_Single.glb",
      "height": 1.2
    },
    {
      "model": "industrial/wooden-crate",
      "height": 0.8
    },
    {
      "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_2.glb",
      "height": 0.8
    },
    {
      "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_3.glb",
      "height": 1.2
    }
  ],
  "kind": "farm",
  "name": "Saltwick",
  "id": "saltwick",
  "spec": "saltwick",
  "pitch": "cozy fishing village",
  "guide": {
    "name": "Nell",
    "title": "Harbor keeper"
  },
  "beats": [
    {
      "id": "beat1",
      "title": "A fresh start",
      "pitch": "Your grandmother's cottage is yours now. Nell left turnip seed by the door.",
      "goal": "Plant and harvest turnip",
      "fact": "farm.harvested",
      "atLeast": 1
    },
    {
      "id": "beat2",
      "title": "Something for the pot",
      "pitch": "Old Bram swears the bay is full this season. Try the fishing rocks.",
      "goal": "Catch a fish at the bay",
      "fact": "farm.caught",
      "atLeast": 1
    },
    {
      "id": "beat3",
      "title": "Open for business",
      "pitch": "Ivy wants fresh food for the harbor stalls. Sell at your cart.",
      "goal": "Sell 8 things at the fish cart",
      "fact": "farm.shipped",
      "atLeast": 8
    },
    {
      "id": "beat4",
      "title": "Bigger harvests",
      "pitch": "Nell thinks the old field could grow cabbage again. Seeds are at the market.",
      "goal": "Grow cabbage",
      "fact": "farm.harvested_cabbage",
      "atLeast": 1
    },
    {
      "id": "beat5",
      "title": "The tide festival",
      "pitch": "The village puts on a festival when a farm thrives. Make yours the talk of the harbor.",
      "goal": "Earn 400 coins in all",
      "fact": "farm.earned",
      "atLeast": 400
    }
  ],
  "world": {
    "relief": 2.5,
    "frequency": 0.011,
    "waterLevel": -40,
    "scatter": {
      "tree": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_1.glb",
        "height": 9
      },
      "tree2": {
        "model": "/models/imported/quaternius-stylized-nature/CommonTree_3.glb",
        "height": 8
      },
      "pine": {
        "model": "/models/imported/quaternius-stylized-nature/Pine_2.glb",
        "height": 10
      },
      "bush": {
        "model": "/models/imported/quaternius-stylized-nature/Bush_Common.glb",
        "height": 1.1
      },
      "flower": {
        "model": "/models/imported/quaternius-stylized-nature/Flower_3_Group.glb",
        "height": 0.5
      },
      "grass": {
        "model": "/models/imported/quaternius-stylized-nature/Grass_Common_Tall.glb",
        "height": 0.7
      },
      "rock": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_1.glb",
        "height": 1.5
      },
      "rock2": {
        "model": "/models/imported/quaternius-stylized-nature/Rock_Medium_2.glb",
        "height": 1.1
      }
    },
    "sky": {
      "preset": "day",
      "cycle": true,
      "dayLength": 360,
      "startHour": 6,
      "haze": 0.3
    }
  }
};
