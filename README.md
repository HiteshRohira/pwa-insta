# Instagram PWA

An independent, mobile-first Instagram reader built with Hitesh’s local pwacn framework. Production: [pwa-insta-pi.vercel.app](https://pwa-insta-pi.vercel.app) · Source: [HiteshRohira/pwa-insta](https://github.com/HiteshRohira/pwa-insta).

Independent project; not affiliated with Instagram or Meta.

Real home feed, photo/video carousels, reels, stories, comments, account profiles and people search. Dark mode is on by default and is applied before first paint; Settings also offers light mode and the device preference. Videos play on demand, pause when hidden or covered by an overlay, and detach inactive sources. Smaller media, lazy images, explicit pagination, no background polling and an idle-loop fix target unnecessary work. Battery savings have not yet been measured on an actual iPhone.

## Smooth reel playback

Hold either edge of a reel for **2× playback with the original voice pitch**; release to return to 1×. Hold the middle to pause. On iPhone, the first audible speed-up prepares in the background while playback continues at 1×, then switches from the current position. Release before preparation finishes to cancel the switch.

The October 16 fix disables native pitch correction on the muted iOS video track, configured once instead of reapplied on every hold. The separate audible soundtrack still preserves pitch. This removed backward jumps and extra soundtrack restarts in six simulator speed transitions (largest post-startup frame gap: 83 ms). Hitesh subsequently confirmed that playback on his iPhone is much smoother. This is device feedback, not a guarantee across all iPhones or a battery benchmark.

See [playback architecture and verification](docs/REEL-PLAYBACK.md) and the [changelog](CHANGELOG.md).

## Use on your iPhone

1. On the Mac, open http://localhost:4310 and connect your existing Instagram session. If using the connector, **first select your signed-in Instagram tab in Helium, then open the connector from that tab**. Its site permission covers `instagram.com` and subdomains.
2. In the local PWA, open **Profile → menu → Sign in on your iPhone**. Scan the QR code or copy the private sign-in link. The link expires after ten minutes; reopen Settings for a fresh one.
3. Open the private link on your iPhone. Use Safari’s **Share → Add to Home Screen**. The hosted reader runs independently of the Mac after sign-in; no iPhone extension is needed. If the installed app has a separate cookie store, paste the private link into its sign-in screen.

The one-time connector lives in `connector/`. Load it from Helium’s `chrome://extensions` using Developer mode → Load unpacked. After updates, reload it there. Never paste Instagram cookies into GitHub, chat messages, or a public issue.

## Local development

Node 24+, npm.

```sh
git clone https://github.com/HiteshRohira/pwa-insta.git
cd pwa-insta
npm ci
npm run dev
```

Open http://localhost:4310, or http://localhost:4310/?demo=1 for sample browsing without connecting an account. A local ignored environment file is generated if missing. The server binds to loopback by default. `npm run build` builds the app and its versioned offline shell. `npm start` serves that build.

`npm test` covers normalization, signed media URL restrictions, session encryption, expiry, tampering, request coalescing, rate limits, challenges and disconnect races. `npm run test:ui` uses explicit sample mode and tests mobile browsing and playback suspension. Install its browser once with `npx playwright install chromium`. `node scripts/check-live-ui.mjs` requires the connected local account and verifies the real content UI.

Proof images/videos are in ignored `proof/`; never commit them. Sample content is available only by explicitly opening `/?demo=1`. Failed live requests display errors rather than substituting samples.

## Vercel deployment

`npm run deploy` runs the existing owner-specific Vercel pipeline. For your own deployment, link your own Vercel project and replace the `--scope` value in `package.json`; set `PUBLIC_ORIGIN` to your deployment URL and configure a strong `SESSION_KEY`. Do not reuse the owner’s deployment or session key. `vercel.json` builds the Vite frontend and routes `/api/*` to the Express serverless handler. Production has `SESSION_KEY` and `PUBLIC_ORIGIN` configured; local `.env.local` must use the same session key for transfer links. The key is never a `VITE_*` variable. Rotate it to invalidate all encrypted sessions and transfer links.

Sessions are encrypted using AES-256-GCM. Transfer links are valid for ten minutes and purpose-separated from seven-day HttpOnly session cookies. Cookies are decrypted per request on Vercel; limited transient caches hold fetched responses. Instagram sessions are not stored in a repository, database or Vercel environment variable. Disconnect signs out the current browser; it does not revoke another already signed-in device. The upstream Instagram session can expire sooner or require a challenge, which must be completed in Instagram before reconnecting.

`server/operations.json` contains public persisted-query IDs discovered from Instagram’s own current JavaScript bundles. Core feed/profile/reel queries use `/graphql/query`; the stories tray uses `/api/graphql` with the web bootstrap tokens. Comments and replies use current persisted GraphQL queries; people search and the friend picker use web REST routes. These private APIs may change. `scripts/discover-operations.mjs` refreshes public query metadata using the local account, without writing cookies or private page HTML to disk.

Publishing is omitted. Post/reel likes, comment hearts, a comment/reply composer, and sending a post to one selected friend are implemented in the PWA. Account writes use current GraphQL mutations from a short-lived server-side Chromium context with Instagram’s own runtime request parameters. Activity and the full message inbox still open Instagram. Saves stay on the device. Explore currently shows recommended reels rather than the complete native photo Explore algorithm.

See [the pwacn field report](docs/PWACN-GAPS.md) for framework defects, consumer patches, custom components and proposed improvements. The original pwacn checkout is unchanged.

Reels now load additional batches automatically while up to eight buffered reels remain, and the next three videos warm in advance. Private video storage is capped at 512 MiB with 30-minute expiry and sign-out cleanup; large videos stream normally. Reel/profile metadata preloads after the feed, with a two-minute in-memory resource cache. Double-tap posts/reels to like (real Instagram write); use the heart button to unlike. Hold the middle of a reel to pause, or either edge for 2×. Captions expand with more/less, and comment replies expand on demand.

On iOS, reels keep their native inline video muted and use a synchronized, decoded Web Audio soundtrack with an ambient audio session. This targets exclusion from Now Playing / the Dynamic Island while preserving reel sound. Ambient sound obeys the iPhone silent switch. Unmuting first downloads and decodes the soundtrack; the local cache is reused when available. To bound phone memory, this path supports files up to 24 MiB and soundtracks up to three minutes. Unsupported or failed soundtracks show a retry control and keep the native video muted. Audio stops on pause, buffering, scrolling, overlays and backgrounding; inactive decoded buffers are released. On the first audible 2× hold, a background worker prepares a pitch-preserving SoundTouch soundtrack in one-second chunks while video and audio continue at 1×. When ready, both switch at the live media position with an 8 ms audio crossfade; the video is never sought. Releasing early cancels preparation. Later holds reuse that soundtrack until the reel becomes inactive. Playback itself uses ordinary buffer sources at their native sample rate, with no live pitch processor. Failed preparation keeps 1× playing. Paused reels keep their sound and play controls visible. Other platforms and non-reel videos retain native playback.

`npm run test:ui:reel-audio` requires ffmpeg and Playwright WebKit. It generates a temporary AAC tone outside the repository and verifies real decoded audio output while the video remains muted, including a frequency check that the 440 Hz tone stays at 440 Hz during 2× playback and after release, normal-speed progress during deliberately delayed preparation, early-release cancellation, forward-only video frames with no seeking or stalls, handoff at the live position, reuse on later holds, double-speed video progression, looping, pause/resume, mute, overlay/scroll cleanup and retry after a failed soundtrack. Set `UI_BASE_URL` to test a production build. iOS Safari simulator playback was also checked. The owner confirmed much smoother speed transitions on a physical iPhone after the October 16 fix; Dynamic Island behavior and battery use are separate checks.

## Phone-only sign-in

Open `https://pwa-insta-pi.vercel.app/?login=1` or Settings → Log in on this phone. Enter your Instagram credentials, then its verification code if requested. The phone encrypts your password using Instagram's public key before sending it; the app does not save your password. A short-lived incognito browser on Vercel performs the current Meta login exchange and closes after each step. This creates a session through the same hosting environment as the reader instead of copying the Mac's Instagram session.

A successful exchange is verified before replacing the current reader cookie. Temporary challenge state is encrypted and expires after ten minutes. Security approvals/CAPTCHAs can still block Instagram's private login flow; the UI reports these instead of bypassing them. The desktop connector/private-link flow remains under “Use an existing session instead.” `node scripts/check-login-ui.mjs` tests encryption-only transport, no password persistence, MFA retry and authenticated transition with synthetic credentials.

Basic mobile regression checks: `npm test`, `npm run test:ui`, `npm run test:ui:login`, `npm run test:ui:preload`, `npm run test:ui:interactions`, and `npm run test:ui:reel-recovery`. Comment and friend-send tests intercept the API; they do not publish real content. Live likes/comment likes and actual reel playback are also checked through the running UI.
