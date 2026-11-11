the engine UI package (packages/ui) publishes as @jgengine/react again. 0.56.0 renamed it @jgengine/ui, a name npm had never seen, so trusted publishing refused it part-way and @jgengine/core@0.56.0 on latest depended on a package that did not exist. Imports, dependencies, jgengine.json engine keys ("react"), scaffold aliases and doctor's @source check all name @jgengine/react; bun run check react-free treats it as the engine's own UI package.

Engine seam: packages/core/src/ai/AuthoredFlocks.draw.tsx, packages/core/src/anim/CharacterCrowd.draw.tsx, packages/core/src/anim/CorpseRagdolls.draw.tsx, packages/core/src/anim/tweenNumber.view.tsx, packages/core/src/anim/useEntityRenderCues.draw.ts, packages/core/src/anim/useModelAnimation.draw.ts, packages/core/src/audio/AudioComponents.draw.tsx, packages/core/src/camera/GameFirstPersonCamera.draw.tsx and 75 more

### Added

- scripts/check-npm-trusted.ts refuses a release unless every package it publishes exists on npm and its latest version came through trusted publishing; bun run release runs it before cutting and the Publish workflow before its first npm publish, so a half-published release cannot happen.

### Fixed

- the engine UI package (packages/ui) publishes as @jgengine/react again. 0.56.0 renamed it @jgengine/ui, a name npm had never seen, so trusted publishing refused it part-way and @jgengine/core@0.56.0 on latest depended on a package that did not exist. Imports, dependencies, jgengine.json engine keys ("react"), scaffold aliases and doctor's @source check all name @jgengine/react; bun run check react-free treats it as the engine's own UI package.
