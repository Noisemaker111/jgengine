### Fixed

- A terrain detail `material` no longer overrides the ground's authored roughness with its roughness map. The map now varies roughness around the authored value, so scanned ground maps (roughness near 0.45) stop giving dry terrain a wet specular sheen; games no longer need to lower `material.strength` to stay matte.
