The quadruped reference switches from trot to gallop at the measured speed for the animal's mass, and a drop landing now brakes with soft tissue and eccentric leg extensors, so both match published data.

Closes #2787

Root cause: the trot–gallop switch sat at a fixed Froude number, which in a large animal lands past the measured transition speed, so duty factor there was read too late (0.45). The landing body was rigid and its joint servo bounced, so a 1 m drop peaked at 7.8 BW.

### Fixed

- The quadruped reference changes from trot to gallop at 1.54·M^0.216 m/s (Heglund & Taylor 1988), so a horse at the transition now has duty factor 0.43 (Biewener 1983: 0.39–0.43)
- A 1 m drop landing peaks at 5.6 BW (Niu et al.: 4.4–6.1): soft tissue on the trunk, thighs and shanks wobbles on the bone (Gruber 1998), and the legs brake with the ankle extensors fully on and hip and knee extensors at 0.4 (Santello & McDonagh 1998)

### Added

- `trotGallopSpeed(mass)` and `WALK_TROT_FROUDE` in quadrupedGait
- `GRUBER_WOBBLING_MASSES` and `LANDING_ACTIVATION` in humanFall; `simulateFall` takes `landingActivation` and `wobbling` (null for a rigid body)

### Migrate

- `QUADRUPED_GAIT_TRANSITIONS` is gone: use `WALK_TROT_FROUDE` for walk–trot and `trotGallopSpeed(mass)` for trot–gallop
