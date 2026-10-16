# Reel playback on iOS

## Playback path

`src/Video.tsx` keeps the native inline reel video muted on iOS. `src/reelAudio.ts` synchronizes a decoded Web Audio soundtrack with that video using an ambient audio session. The intent is to keep reel sound out of Now Playing / the Dynamic Island. Ambient audio obeys the silent switch. Other platforms and non-reel videos use native playback.

The first audible edge hold asks `src/reelSpeed.ts` and `src/reelSpeed.worker.ts` to prepare a pitch-preserving SoundTouch buffer off the playback thread. Normal-speed audio and video continue during preparation. Once ready, the controller switches at the live media position with an 8 ms audio crossfade and no video seek. Releasing early cancels the pending switch. Subsequent holds reuse the prepared buffer until the reel becomes inactive. Preparation failure leaves playback at 1×.

## Why muted video pitch correction is disabled

Even though the native video is muted, enabling its native pitch correction caused backward video-clock jumps during speed changes on the iOS simulator. The soundtrack controller then followed those jumps by restarting audio. `Video.tsx` now sets `preservesPitch = false` for the ambient path in an effect keyed to that path, rather than reapplying pitch configuration for every hold/release. The audible Web Audio soundtrack retains pitch preservation; native playback elsewhere retains native pitch correction.

## Resource and lifecycle limits

The ambient path accepts files up to 24 MiB and soundtracks up to three minutes. Unsupported or failed audio stays muted and offers retry. Audio stops for pause, buffering, overlays, scrolling and backgrounding. Inactive decoded buffers are released. Preparing a second buffer costs memory and CPU; no measured battery-saving claim is made.

## Verification

```sh
npx playwright install webkit
# Install ffmpeg using your system package manager.
npm run dev
# In another terminal:
npm run test:ui:reel-audio
```

The suite creates a temporary AAC tone outside the repository. It measures 440 Hz pitch at 1×, 2× and after release; verifies delayed preparation, early release, live-position handoff, forward video frames, no seeking, reuse, looping and lifecycle cleanup. `UI_BASE_URL` selects another running build.

On October 16, 2026, six iOS simulator speed changes had no backward frames or extra audio restarts; the largest post-startup frame gap was 83 ms. The owner then confirmed much smoother playback on his physical iPhone. Simulator checks do not establish universal device smoothness, Dynamic Island behavior or battery consumption.

For manual regression, repeatedly hold/release both edges, release while preparation is pending, pause with the middle hold, mute/unmute, switch reels, open an overlay and background the app. Listen for original voice pitch and check that the picture does not rewind on entry or exit. Keep recordings in ignored `proof/` or external attachments, never in Git.
