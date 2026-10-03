### Fixed

- Restoring an earlier living entity into the same context clears its stale death marker, allowing future lethal effects to despawn it and resolve rewards once. Transient depleted victims captured during `entity.died` retain the duplicate-death guard.
