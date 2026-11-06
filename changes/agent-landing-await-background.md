A lane's landing wait runs in the harness background: lane:close, the Stop hook, the Monitor ban and AGENTS.md stop teaching a foreground background await --timeout 540 in slices, and a background await marks itself as the task's awaiter so the Stop hook lets a correctly waiting turn end

Root cause: lane:close's last line told agents to await the queue in the foreground in 540-second slices, and the Stop hook refused every turn end while the queue ran; the pothole audit measured 14.5 hours of agent time inside those waits in 14 days

### Changed

- A lane's landing wait runs in the harness background: lane:close, the Stop hook, the Monitor ban and AGENTS.md stop teaching a foreground background await --timeout 540 in slices, and a background await marks itself as the task's awaiter so the Stop hook lets a correctly waiting turn end
