# The Sunken Crown

Walk the old roads. Wake the ruins. Learn to fly. First generated from the idea: "explore ancient ruins and find relics that let you glide". Start it with `bun --cwd=games/the-sunken-crown run dev` from the repository root.

## Design checklist

Every word, stat and model below lives in `src/game/idea.ts`; places live in `src/editor.scene.json`.

- **Core loop.** Follow the compass to the next landmark; reaching one puts it on your map and opens it for
  fast travel (T); take the relic on its shrine (E) once its guardians fall; a new ability opens new ground.
- **Progression.**
  - [x] 6 landmarks, 3 with relics: Wing of Aurel (glide) at The Broken Gate, Ember Heart (stamina) at Warden's Watch, Stormstep Boots (doubleJump) at Thornspire.
  - [x] Glide runs the engine glide model while you hold Space in the air; the double jump and deeper stamina change how far you get.
  - [x] Guardians: 2 bone wardens at Warden's Watch, 3 thorn brutes at Thornspire, 1 altar golem at The Sky Altar.
  - [x] A 4-beat story from Ysolde ends when you wake the Sky Altar.
- **Failure states.** Guardians hit back; at 0 health you are back at the last place you found 4 seconds later. Sprinting empties stamina and leaves you winded.
- **Minute 5 -> hour 5.** At 5:00 you have found two places and glide. Later places are farther, higher and guarded, so stamina, the second jump and fast travel decide how you get there.
- **References it is chasing.**
  - *Zelda: Breath of the Wild* - feel: a landmark on the horizon pulling you across open ground; a glider that changes the map.
  - *Shadow of the Colossus* - density: few places, each one big and worth the walk.
  - *Outer Wilds* - feel: knowing more, not levels, is what opens the world.
- **Gap to target.** No climbing, no map screen yet (only the compass), guardians only chase and swing.

Loop proof: the-sunken-crown-loop
