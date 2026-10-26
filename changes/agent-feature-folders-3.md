### Fixed

- `jgengine find <feature>` answers by folder and file names once a folder is named for the query: an export that only mentions the word (`MAX_OCEAN_WAVES` for "waves") no longer shows `shell/water` as a home for waves.
- `shoot` and `drive` `--size half` keep the page's full CSS viewport and halve only the pixel ratio, so a half-size shot lays out exactly like a full one. Before, the 800x450 viewport switched games into their compact HUD and the layout-collision check failed the run (Scrap Signal, Beacon Bastion).
