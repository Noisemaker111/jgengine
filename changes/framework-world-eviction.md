### Fixed

- WebSocket router joins that finish after disconnect now release their memberships through the reconnect grace period, reclaiming capacity without removing a live reconnect waiting on admission.
