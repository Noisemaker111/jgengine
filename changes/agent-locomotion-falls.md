simulateFall drops a planar human with real segment masses and floor contact (limp, braced or landing on bent legs) and reports impact speeds, peak pelvis, head and foot forces, HIC15 and femur load; validateHumanFall checks it against published falls and drop landings.

Closes #2767

### Added

- simulateFall drops a planar human with real segment masses and floor contact (limp, braced or landing on bent legs) and reports impact speeds, peak pelvis, head and foot forces, HIC15 and femur load; validateHumanFall checks it against published falls and drop landings.
- compareRagdollFall falls a createRagdoll body and the human reference the same ways and tables them against injury limits (HIC15 700, femur 10 kN, hip fracture 7 kN); humanRagdollConfig builds a ragdoll with real human proportions and masses.
- bun run games:capabilities locomotion --falls prints the stock humanoid ragdoll against a real fall; --validate also checks the fall reference.
- `INJURY_LIMITS` (`@jgengine/core/movement/reference/compareRagdollFall`): Injury assessment reference values for a mid-size adult man: HIC15 700 and femur axial force 10 kN (US FMVSS 208, 49 CFR 571.208), and a proximal femur breaking at about 7 kN when struck on the hip in a fall (A. Also `RagdollFallOptions`, `RagdollFallRow`, `compareRagdollFall`, `formatRagdollFall`, `humanRagdollConfig`, `measureRagdollFall`, `stockHumanoidRagdoll`.
- `HEAD_ON_FLOOR` (`@jgengine/core/movement/reference/humanFall`): Scalp and skull on a hard floor: about 4 kN at 4 mm of compression, nearly elastic. Also `FallOptions`, `FallReport`, `FallTone`, `PELVIS_ON_FLOOR`, `simulateFall`, `validateHumanFall`.
