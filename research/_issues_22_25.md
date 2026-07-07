# Issues 22-25 (foundation — camera + pointer)

## #22 [gaps] No screen→world/ground raycast for pointer verbs (click-to-move, click-to-aim, ground-target)
Game code cannot learn where the cursor points. Shell exposes no screen-point→world/ground raycast. FrameDriver drives movement from moveForward/Back/Left/Right only; primary click fires hotbar item; item.use receives aim {yaw,pitch} from camera, never a world point.
Needed for: Sims 4 (click floor tile to walk), Diablo IV (click-to-move/attack), Hades II (twin-stick cursor aim), V Rising (ground-targeted AoE), Helldivers 2 (throw beacon to ground point), Core Keeper (top-down cursor aim).
Shape: shell service pointer.worldHit() → { point, entity, object, normal }, exposed to loop and usable as item.use aim and move-to target. Upstream of click-to-move, click-to-aim, ground-target abilities, tile-select, placement, pings.

## #23 [gaps] No top-down / isometric fixed camera rig
Shell has no fixed-height top-down or isometric camera. Only orbit (third) and first-person, both locked to followed entity.
Needed for: Diablo IV, Last Epoch, PoE 2 (ARPG iso is genre baseline), Hades II (fixed top-down), Core Keeper (top-down), Bloons TD 6 (top-down board).
Shape: topDown/iso camera rig with height/pitch/zoom params and decoupled (not orbit-drag) follow.

## #24 [gaps] Camera hard-requires an avatar entity; no free-pan / edge-scroll RTS camera
No camera pans independently of a followed entity; orbit rig returns early when no follow target — avatar-less games cannot mount a camera. Pan explicitly disabled (enablePan={false}).
Needed for: Sims 4, Manor Lords, Two Point Museum (free-pan world WASD/edge-scroll/middle-drag away from avatar); any city-builder/tower-defense/card/auto-battler (no avatar → today no camera).
Shape: free camera rig with pan/edge-scroll/rotate/zoom, plus allowing followEntityId:null on every rig.

## #25 [gaps] No over-the-shoulder combat camera / shoulder-swap
No offset OTS camera with aim-down-sights and shoulder swap. Orbit rig is a chase camera, not a combat OTS rig.
Needed for: Remnant II, Helldivers 2, The First Descendant.
Shape: shoulder rig with lateral/vertical offset, ADS transition, left/right swap; reticle aim decoupled from camera center.
