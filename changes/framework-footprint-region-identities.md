### Fixed

- Region split now refuses an output identity retained by the opposite partition, keeping successful split results eligible for the existing merge identity gate. Reusing an identity from the same partition remains valid.
