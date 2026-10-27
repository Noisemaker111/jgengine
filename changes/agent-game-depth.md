drive --playtest judges a softlock only after the player first acts; a quiet title or idle start no longer counts

Engine seam: packages/jgengine/src/templates/captureArgs.ts, packages/jgengine/src/templates/harnessScripts.ts

### Fixed

- drive --playtest judges a softlock only after the player first acts; a quiet title or idle start no longer counts
- the capability boot probe presses Play (the game's capture.play) and gives a system 300 frames from there, not from the menu

### Removed

- the progression-curve seam from games-framework; a game's own level numbers, unlock order and tutorial beats stay in the game at any length (games/AGENTS.md mechanism signal)
- system checkboxes from the game READMEs' progression sections; progression is written as what the player gets over hours
