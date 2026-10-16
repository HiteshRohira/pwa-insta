# Changelog

## 2026-10-16

- Preserve voice pitch during audible 2× reel playback on iOS.
- Prepare the accelerated soundtrack in a background worker while 1× playback continues; switch at the live position and reuse the prepared buffer for later holds.
- Cancel pending speed-up on early release and retain 1× if preparation fails.
- Disable native pitch correction on the muted iOS reel video and stop reapplying it during hold/release, eliminating reproduced simulator rewinds and extra audio restarts.
- Verify pitch and playback lifecycle in WebKit, plus six simulator speed transitions. The owner confirmed much smoother playback on iPhone.
- Document setup, deployment, playback architecture and known limits for the public source repository.
