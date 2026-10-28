a realistic rigged human (Rocketbox, MIT) is the default body, with engine-authored jump, swim, tread, punch, swing, gather, hurt and death clips built on any mapped humanoid rig

Closes #2685

Engine seam: packages/assets/src/aliases.ts, packages/assets/src/catalogs/modelLibrary.ts, packages/assets/src/catalogs/modelLibraryRiggedEntries.ts, packages/assets/src/catalogs/starter.ts, packages/assets/src/cli/pull.ts, packages/assets/src/index.ts, packages/assets/src/modelLibraryAuthored.ts, packages/assets/src/packs/starter.ts and 18 more

### Migrate

- asset:person_* and character/* references become libraryModel("human/..."); every game moved off the cartoon figure, and Fernwild no longer shows a bow or sword the player does not have

### Added

- a realistic rigged human (Rocketbox, MIT) is the default body, with engine-authored jump, swim, tread, punch, swing, gather, hurt and death clips built on any mapped humanoid rig
- humanoid hand sockets and ModelConfig.held, so an entity holds only what it has in hand; five engine-built survival tools share one grip frame
- first-person body option (firstPerson.body) that keeps the player's arms and held item in view
- `STARTER_PEOPLE` (`@jgengine/assets`): The model-library people a fresh game pulls with the starter packs: realistic rigged humans, a man and a woman, that `libraryModel(name)` animates with the full humanoid clip set.
- `STARTER_PEOPLE` (`@jgengine/assets/packs/starter`): The model-library people a fresh game pulls with the starter packs: realistic rigged humans, a man and a woman, that `libraryModel(name)` animates with the full humanoid clip set.
- `HUMANOID_SOCKETS` (`@jgengine/core/anim/humanoidActionClips.draw`): Standard slots that get a socket; each socket node takes its slot's name. Also `addHumanoidSockets`, `buildHumanoidActionClips`, `firstPersonArms`, `withHumanoidActionClips`.
- `HUMANOID_ACTIONS` (`@jgengine/core/anim/humanoidActions`): The authored action set. Also `HUMANOID_ACTION_NAMES`, `HUMANOID_ACTION_SLOTS`, `HUMANOID_FIRST_PERSON_CARRY`, `HumanoidActionClip`, `HumanoidActionName`, `HumanoidAnimationInput`, `HumanoidPoseKey`, `HumanoidRotation` and 1 more.
- `LOCOMOTION_AIRBORNE_PARAM` (`@jgengine/core/anim/locomotionGraph`): Off the ground, as the shared player motor reports it: `true` in a jump or a fall. Also `LOCOMOTION_AIRBORNE_STATE`, `LOCOMOTION_SWIMMING_PARAM`, `LOCOMOTION_SWIM_STATE`.
- `BIPED_SCHEME` (`@jgengine/core/anim/skeletonStandard`): 3ds Max Biped rigs (`Bip01 Pelvis`, `Bip01 L UpperArm`), which every Microsoft Rocketbox human shares: the engine's realistic default body. Also `HUMANOID_BODY_SLOTS`, `detectHumanoidRig`.
- `FirstPersonBodyContext` (`@jgengine/core/camera/firstPersonBody.draw`): The entity whose own body the first-person camera looks out of, or `null` when no body is drawn in first person. Also `collapseHead`, `humanoidHead`, `useFirstPersonBody`.

### Removed

- the KayKit people starter theme and the character/* aliases
- `@jgengine/core/physics/reference/compareHandling` no longer exports `ComparableHandlingMetrics`, `ComparableHandlingOptions`, `HandlingComparisonRow`, `PUBLISHED_TOLERANCES`, `PublishedCheck`, `VehicleHandlingComparison`, `checkReferenceAgainstPublished`, `compareHandlingMetrics` and 5 more.
- `@jgengine/core/physics/reference/magicFormulaTire` no longer exports `MagicFormulaContactState`, `magicFormulaContact`.
- `@jgengine/core/physics/reference/realCars` no longer exports `MAZDA_MX5_ND`, `REAL_CARS`, `RealCar`, `RealCarTestData`, `SCION_FRS_2013`.
- `@jgengine/core/physics/reference/referenceCar` no longer exports `ReferenceAero`, `ReferenceAxle`, `ReferenceBrakes`, `ReferenceCar`, `ReferenceCarOptions`, `ReferenceCarSpec`, `ReferenceCarState`, `ReferenceCarStep` and 7 more.
- `@jgengine/core/physics/reference/standardManeuvers` no longer exports `StandardManeuver`, `StandardManeuverOptions`, `StandardManeuverReport`, `measureStandardManeuvers`.
- `@jgengine/core/physics/reference/suspensionKinematics` no longer exports `DoubleWishboneGeometry`, `MacPhersonGeometry`, `SuspensionGeometry`, `SuspensionPoint`, `SuspensionPose`, `SuspensionSample`, `SuspensionTable`, `createSuspensionSample` and 2 more.
