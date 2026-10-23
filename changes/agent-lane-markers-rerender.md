### Fixed

- `useWorldItems` (`@jgengine/react/hooks`) keeps one list identity until an item spawns, is picked up or is removed. It read `worldItem.list()`, which allocates a new array per call, against a store signal that also fires on every entity pose write, so a HUD re-rendered every dropped-item marker each frame (0.97 ms/frame of React work in Harbor Heat).
- `WorldItems` (`@jgengine/shell`) reads each marker's live pose in `useFrame` instead of taking it as a prop, so a moving item still follows without re-rendering its marker.
