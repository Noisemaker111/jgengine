Fernwild now has The Island's eight artifact caves, dug where ARK's map puts them. Each is a winding tunnel into a hillside, with glowing crystals along the walls, a rock floor and a domed chamber at the end. In the chamber a gold artifact turns on a pedestal (Clever, Skylord, Hunter, Devourer, Pack, Massive, Immune, Strong). Walk up and press E to take it: it goes into the bag and grants XP, and a new one returns half an hour later. The rock is solid, so you walk in through the mouth, not through the hill. Cave dwellers spawn inside: three per cave, five in the hard ones. Which artifacts have been taken is saved with the game. A new proof flow, fernwild-cave, teleports to the lower south cave's mouth, walks down the tunnel to the pedestal and takes the artifact, with a shot at each stage.

Engine seam: packages/core/src/cave/ (new: a cave's layout from a centreline path, its solids and inside/depth tests, its rock and floor meshes, and a draw component), packages/core/src/runtime/cameraDirector.ts with packages/core/src/camera/ (camera.turnTo: swing any rig to face a heading on its next frame)

Prevention: cave layout tests (a point in front of the mouth is outside, depth grows down the tunnel, the rock closes over the tunnel, the floor covers tunnel and chamber and nothing outside), Fernwild's cave tests walk a cave through the real collision and take the artifact, and check that its three dwellers wake in the chamber as the survivor approaches and keep to the cave, the camera tests cover turnTo on the director and the orbit rig, and the fernwild-cave flow drives it in the browser.

### Added

- `caveLayout`, `caveMesh` and `<Cave>` in `@jgengine/core/cave`: describe a cave by its path, width, height, chamber and cover and get its collision, inside/depth queries, rock and floor.
- `ctx.camera.turnTo(yaw)`: the orbit, first-person, chase and shoulder rigs turn to face that heading on their next frame, e.g. after a teleport or a respawn.
