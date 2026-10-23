### Fixed

- Load-time shader warmup compiles what the first frame can reach, reveals as soon as those programs are linked, and finishes the rest in background rounds, so a scene no longer holds the loading cover for its whole model stream and no longer drops a compile onto a frame that is already showing. The loading cover names the shader count, the seconds waited and the work left for the background.
