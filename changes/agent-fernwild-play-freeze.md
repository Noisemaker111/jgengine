Fernwild no longer freezes for about a second when you press Play: the island's 33k trees and rocks are placed while the title loads (worst click 940 ms -> 510 ms, menu shows ~0.5 s later)

Root cause: the foliage renderer resolved every scatter placement inside the Play click, because the survivor's shared resolve only ran on the first gather tick

Engine seam: none - game content only

### Fixed

- Fernwild no longer freezes for about a second when you press Play: the island's 33k trees and rocks are placed while the title loads (worst click 940 ms -> 510 ms, menu shows ~0.5 s later)
