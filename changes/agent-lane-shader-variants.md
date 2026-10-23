### Fixed

- Load-time shader warmup compiles against the render state the first frame actually draws with. A scene whose post chain renders into its own buffer was linking two programs per material, one linear untone-mapped set the frame draws and one canvas set nothing ever drew; the cover no longer waits for the second set. Harbor Heat links 84 programs to 58 and Scrap Signal 124 to 83 before the cover lifts, with no visual change.
