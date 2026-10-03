### Fixed

- Failed WebRTC host offer acceptance now closes and releases its allocated peer connection immediately, while preserving existing peers and the original negotiation error. Hosts can accept a fresh offer after failure without retaining the failed connection until teardown.
