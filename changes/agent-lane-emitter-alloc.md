### Fixed

- Positional loops declared through `entitySounds`/`objectSounds` are tracked instead of rebuilt: spawn, despawn and a moved emitter update one retained loop each, and a frame where nothing moved reads only the emitters that already sound. On scrap-signal's 560 placed props (69 sounding), the tracking path drops from 16.7 µs to 1.2 µs per frame and a steady frame allocates no Set, array or record.
