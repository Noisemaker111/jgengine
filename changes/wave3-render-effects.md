screen-space reflections, soft shadows, volumetric fog and motion blur, each behind its own toggle and quality tier; rigged characters get foot IK, locomotion and glance by default

### Added

- screen-space reflections, soft shadows, volumetric fog and motion blur, each behind its own toggle and quality tier; rigged characters get foot IK, locomotion and glance by default
- `GLTF_MATERIAL_EXTENSIONS` (`@jgengine/assets/gltfMaterials`): Native material/texture extensions the pinned Three.js GLTFLoader implements.
- `CHARACTER_MOTION_ON` (`@jgengine/core/anim/characterMotion`): Every part on: what a rigged entity gets when nothing switches a part off. Also `CharacterMotionConfig`, `CharacterMotionParts`, `CharacterMotionPlan`, `planCharacterMotion`, `resolveCharacterMotion`.
- `CharacterMotionContext` (`@jgengine/core/anim/characterMotion.draw`): The game's own character-motion layer (`scene.characterMotion`); the shell provides it. Also `useCharacterMotion`.
- `idleOnlyAnimation` (`@jgengine/core/game/clipRoles`): The rig's idle clip alone, looping: what a rigged entity plays when its locomotion is switched off (`characterMotion.locomotion: false`).
- `DEFAULT_OCCLUDER_DISTANCE` (`@jgengine/core/lighting/softShadows`): Metres between a typical caster and the ground it shadows, used when a light leaves it unset. Also `DEFAULT_SHADOW_RADIUS`, `SUN_ANGULAR_DIAMETER_DEG`, `ShadowFilter`, `SoftShadowInput`, `lightingHasSoftShadows`, `softShadowRadius`.
- `registerMotionBlurBody` (`@jgengine/core/postfx/motionBlurPass.draw`): Let motion blur follow a moving body (a character, a car, a thrown crate) along its own screen motion.
- `MAX_GLOSSY_SURFACES` (`@jgengine/core/postfx/ssrPass.draw`): Most glossy surfaces one frame masks; the nearest scan order keeps the first ones found.
- `LOOK_SUN_SIZE` (`@jgengine/core/render/lookPreset`): The key light's angular size each look gives a sun that leaves `lightSize` unset, so its shadows soften like daylight while the player's soft-shadows setting is on.
- `DEFAULT_MOTION_BLUR` (`@jgengine/core/render/postProcessing`): Motion blur used for the fields a `motionBlur` config leaves unset. Also `DEFAULT_SSR`, `MotionBlurConfig`, `SsrConfig`.
- `GraphicsPostStages` (`@jgengine/core/settings/graphicsProfile`): One switch per post stage a tier or the player can turn off.

### Changed

- Part of #2837

### Removed

- `@jgengine/assets/gltfMaterials` no longer exports `GLTF_MATERIAL_EXTENSIONS_R182`.
