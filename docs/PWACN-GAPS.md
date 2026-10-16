# Field report

## Reel playback update — 16 October 2026

The iOS ambient soundtrack now preserves voice pitch at 2×, prepares in a background worker while normal playback continues, and switches at the live position. Native pitch correction is disabled only on the muted video track and is no longer reapplied per hold/release. This fixed reproduced simulator rewinds and extra audio restarts; the owner confirmed much smoother playback on iPhone. These are consumer media integration changes, not pwacn framework patches. See [playback architecture and verification](REEL-PLAYBACK.md).

## Earlier verified status — 13 October 2026

Updated 2026-10-13 after live testing. The app now uses Instagram’s mobile visual layout at every viewport, with dark mode applied before first paint, a persisted dark/light/system preference, and real account data. Both the local server and Vercel returned the `hitesh_rohira` profile, a real home feed, 150 story tray entries and 4 initial recommended reels. Browser checks exercised real feed comments, story media, playing reels, the own profile and theme switching without page errors. Counts are snapshots, not fixed fixtures.

The white-screen failure was an application bug: the avatar attempted `username[0].toUpperCase()` before the account query completed. It now handles empty usernames. Live resources are keyed so sample content cannot briefly appear while real data loads.

The Helium connector initially omitted permission for the apex `instagram.com` host. Its scope now includes the apex and subdomains; the UI explicitly instructs the user to open it from a signed-in Instagram tab. This is a one-time desktop connection, not an iPhone extension requirement. A ten-minute encrypted transfer link/QR signs the iPhone into Vercel; thereafter the browser carries a Secure, HttpOnly, SameSite session cookie, valid for up to seven days. No Instagram password is collected, and neither the Instagram session nor sign-in links are committed.

Phone-only authentication is a deferred request from the user. The current desktop-to-phone flow is accepted. Do not prioritize an independent phone login flow ahead of making the current reader usable.

Battery behavior is implemented and browser-tested; a physical iPhone energy comparison remains outstanding. Native notification, message, like and reply actions open Instagram. Explore currently presents Instagram’s recommended reels grid; a full native photo Explore query remains to be captured. Account saves are local to this device.

---

# pwacn field report — Still

Date: 2026-10-12. Consumer app: `/Users/hitesh/projects/pwa-insta`. Framework checkout: `/Users/hitesh/projects/pwacn`. Snapshot commit: `45a18aa378a76051ecdfb4de879a47e14f22713e`.

This document separates observed source problems from application responsibilities and proposed framework capabilities. The original framework checkout is unchanged; the consumer imports a source snapshot through Vite/TypeScript aliases. Reproduction is in this app rather than an upstream kitchen-sink change. The consumer is deployed to Vercel at https://pwa-insta-pi.vercel.app. The framework checkout and its kitchen sink are unchanged.

## What the framework already supplies

| Primitive | Use in this app | Result |
| --- | --- | --- |
| `Pressable` | Navigation, story avatars, buttons, media controls | Pointer-down feedback, cancellation on scrolling, reduced-motion support and existing feel telemetry. |
| `Carousel` | Multi-photo feed posts | Native horizontal scrolling and scroll snapping; app supplies counters, dots and desktop arrows. |
| `VerticalPager` | Reels | Native vertical snap scrolling, controlled active index and arrow-key navigation. |
| `BottomSheet`, `SheetScrollArea` | Comments, settings and profiles | Drag handle, snap points, focus trap, Escape/backdrop dismissal, keyboard viewport handling. |
| `MobileSwitch` | Quality, autoplay and mute preferences | Semantic switch role and spring-based control feedback. |
| `MobileScreen`, `MobileScrollArea` | App frame and feed | Semantic building blocks; layout and safe-area CSS remain app-owned. |
| `ToastProvider` | Save and copy feedback | Accessible announcements and transient feedback. |

## P0 — idle animation-frame loop in BottomSheet (confirmed source defect)

**Source:** `packages/react/src/sheet.tsx`, the effect containing `sampleAnimationFrame`. It reschedules `requestAnimationFrame` unconditionally and depends on `[snap, y]`; it does not check whether the sheet is open or settling before scheduling its next frame. The state check only suppresses emitted samples, not wakeups. Multiple mounted closed sheets multiply the loops. This directly conflicts with a reader designed to sit idle.

**Consumer fix:** `vendor/pwacn-react/src/sheet.tsx` subscribes to `y.on('change', ...)` and emits existing `BottomSheet/drag-y/settling` telemetry only while the surface actually changes. No application-created animation-frame sampler remains. Subscription cleanup uses the MotionValue unsubscribe callback. Existing contact, drag, release and completion telemetry is retained. Sheets in this consumer are also conditionally mounted.

**Upstream proposal:** replace the perpetual sampler with a motion-driven subscription, reset frame timing on each settle, and clean up active animations/gesture claims on unmount. Add a regression test asserting a closed or fully settled sheet schedules no sampler callbacks after animations finish; assert settling still emits frame timing and motion telemetry. Verify handle drag, snap-to-snap interruption and keyboard viewport changes in the upstream kitchen sink before release.

## P1 — media lifecycle is missing (capability gap)

The framework owns gesture feel but has no coordinated media-visibility primitive. App code in `src/Video.tsx` uses `IntersectionObserver` (60% visibility), document visibility, tab/pager active state, overlay state and explicit play intent. Offscreen/inactive videos lose their `src`; playback pauses under sheets and when the document is hidden. `preload="none"`, muted inline playback, lazy images and lower-resolution selection are app responsibilities. Autoplay is off by default.

**Proposal:** a headless `useVisibleMedia` / `MediaCoordinator` with active item, visibility threshold, app foreground, overlay suspension, user intent and decoder budget. Avoid a timer or per-frame observer. Expose reasons for suspension so it can be inspected. Add feel transitions for play, pause, active-item change and autoplay rejection, plus optional resource telemetry for selected resolution and decoder count.

**Consumer telemetry:** `StillVideo/play/complete` is emitted on actual playback. `StillNavigation/tab/route-commit` reports tab commit. Inspect locally with `window.addEventListener('pwacn:feel', e => console.log(e.detail))`; no samples are uploaded. `StillVideo/pause/complete` reports actual pauses and `StillStoryViewer/page/route-commit` reports story changes. These application events are deliberately sparse and do not provide a complete upstream media API.

## P1 — VerticalPager renders every page (confirmed design limitation)

The pager maps all children into full-height DOM pages. There is no windowing or measured spacer strategy. The consumer removes video sources from inactive pages, but a long browsing session still accumulates DOM pages. Feed items use `content-visibility: auto`; that is not DOM virtualization.

**Proposal:** optional keyed windowing with active item ±1, preserve stable item IDs and scroll height, support loading more without resetting position, and handle viewport rotation/resizing. Add memory/DOM-budget checks against hundreds of reels. Existing small-list behavior should remain available.

## P1 — inactive pages are aria-hidden but still focusable (confirmed source defect)

`VerticalPager` sets `aria-hidden` on inactive page wrappers. Descendant buttons still remain in the keyboard tab sequence. That creates invisible focus targets and controls hidden from accessibility APIs. This app patches the snapshot to set `inert` on inactive wrappers as well.

**Proposal:** use `inert` where supported and provide a documented fallback when targeting older browsers. Test Tab and Shift+Tab after changing the active page and with media controls inside pages. Keep arrow navigation on the pager itself.

## P2 — Carousel reports intermediate scroll indices (source limitation)

`Carousel` computes and reports `Math.round(scrollLeft/clientWidth)` on every scroll event, even when the index is unchanged. The app uses state updates for a lightweight photo counter and supplies arrows by finding the DOM scroll region. There is no controlled index or imperative navigation API; app code reaches through a data attribute.

**Proposal:** report only changed indices, expose controlled `activeIndex` or a typed ref with `next`, `previous` and `scrollToIndex`, and preserve selected page on viewport resize. Add telemetry for start/change/settle. Also expose page keys, rather than relying solely on array position.

## P2 — RefreshControl error recovery and cancellation (source findings; not used)

In `mobile-primitives.tsx`, `RefreshControl.finish()` awaits `onRefresh()` without `try/finally`. A rejected promise leaves `refreshing` true and skips pull reset. `pointercancel` calls the same finish function, so a cancelled pointer can trigger a refresh if the threshold was met. The framework also nests its own scroll container and does not offer a clean existing-scroll-root API.

**Consumer choice:** explicit refresh button and load-more controls. No gesture-triggered network requests, automatic infinite loading or feed polling.

**Proposal:** reset in `finally`, propagate errors to the host, distinguish cancellation from release, and support a supplied scroll-root ref. Verify with a rejected async refresh and a native scroll cancellation trace.

## P2 — story viewer and overlay coordination (capability gap)

App-built `StoryViewer` handles full-screen display, story boundaries, user-to-user advance, manual navigation, optional one-shot advance timers, document-hidden suspension, keyboard focus and safe areas. This app does not mark real stories as seen; that would write account state. The framework lacks a media-oriented full-screen viewer and a shared overlay suspension/context contract.

**Proposal:** a generic timed pager with paused/foreground states, remaining-time semantics, variable video durations, pointer-held pause, accessible progress and swipe dismissal. Use framework navigation if making viewers proper stack routes. The consumer currently uses a full-screen overlay and sheets; browser Back does not navigate these views. Do not infer complete native navigation support from the styling.

## P2 — telemetry coverage is uneven (confirmed source finding)

`Pressable` and `BottomSheet` emit rich feel events. `VerticalPager`, `Carousel` and `DoubleTapSurface` have no equivalent shared telemetry in the inspected snapshot. That makes cross-primitive feel comparisons incomplete. Application events supplement tab/play changes only.

**Proposal:** discrete contact/active-index/settled/cancelled events for native scroll primitives, sampled motion only during actual scrolling. Keep telemetry opt-in and bounded. Never introduce idle loops to sample inactive surfaces.

## P2 — safe areas and visual styling need an integration contract

`MobileScreen` is a div with a data attribute. The app supplies `100dvh`, flex containment, scroll boundaries, opaque fixed bars, safe-area padding, 44px controls, typography, image fit and responsive desktop layout in `src/style.css`. This is expected for headless primitives, but integrating them requires substantial knowledge not encoded in the screen API.

**Proposal:** document a minimal reference shell and viewport/safe-area ownership. Explain how not to double-pad headers, footers and sheets. `NavigationBar` defaults to a translucent blurred surface; expose a consistent low-power/opaque preset across primitives.

## Outside the framework’s responsibility

- Instagram session connector and read-only endpoint adapters, pagination, normalization, challenges and rate-limit backoff.
- Lower-resolution media selection, a signed CDN proxy with byte-range forwarding and private caching.
- Installed-PWA manifest, build-versioned service worker and offline shell. No private Instagram API responses or videos are cached by the service worker.
- Authentication, HTTPS hosting, device pairing and account/session isolation.
- Actual energy measurements. Fewer downloads, decoders and wakeups are implemented mechanisms; they are not a measured battery-saving percentage.

## Mobile evaluation still required

Measure the production build on the same phone, brightness, Wi-Fi, account and 15-minute browsing script as Instagram. Compare tap-to-play and autoplay; include 5 minutes idle/hidden. Record transferred bytes, visible/offscreen decoder counts, Safari/Chrome memory and OS energy/battery readings. Test Safari home-screen safe areas, sheet drag, carousel-vs-vertical-scroll arbitration, keyboard focus, background/foreground playback and rotation. Desktop device emulation cannot certify these behaviors on hardware.

## P2 — reel hold gestures and expandable text (consumer additions, October 2026)

`src/Video.tsx` implements a stationary 250 ms center hold to pause and edge hold to play at 2×. Release restores the user's previous playback intent and rate; pointer cancellation, movement over 12 px, overlays, page changes and document hiding reset the gesture. Vertical movement remains native `pan-y` scrolling in `VerticalPager`. Timers exist only while a pointer is down. `Pressable` provides discrete presses, but no duration/region hold semantics or swipe arbitration; a native button surface handles the gesture and emits discrete `hold-pause` / `hold-2x` telemetry.

**Proposal:** a reusable held-interaction primitive with delay, movement tolerance, cancel/release lifecycle and scroll-friendly pointer ownership. Test on physical iPhone Safari, including OS context menus and background transitions.

`src/ReelCaption.tsx` supplies a two-line clamp, measured overflow with `ResizeObserver`, accessible more/less toggle, bounded scrollable expansion and collapse when leaving a page. pwacn has no expandable-text primitive; it belongs in the consumer today. A reusable disclosure text component would reduce repeated overflow measurement/accessibility work.

Core navigation, social actions and media controls now use local static geometry extracted from Instagram's public IGDS SVG modules, preserving their 24/40/48 coordinate systems. The branded repost bubble contributes only its repost glyph. The home-screen artwork comes from Instagram's official `/data/manifest.json` 192 px asset; larger sizes are resized copies, not newly drawn artwork. These are brand assets, outside pwacn's scope. Account preferences for autoplay/mute remain unchanged.

## P2 — resource reuse, preloading and finite storage (consumer additions)

`src/api.ts` now coalesces in-flight resources and keeps at most 30 JSON entries in memory for two minutes. Feed readiness schedules reel/profile metadata preloads; thumbnail warming is limited to three per resource. Navigation reuses those responses. Session changes clear all resource and private video caches. `VerticalPager` does not supply data loading or a retention window: the consumer requests more reels three pages before the end and drops 16 old records once the window exceeds 40 records and the viewer has advanced sufficiently.

`src/mediaCache.ts` warms the next three reel videos, one download at a time. It owns a separate private Cache API cache with a 512 MiB payload ceiling, 32 MiB per-video ceiling, 30-minute expiry, oldest-first eviction, quota-failure eviction and startup/after-write cleanup. Browser storage can impose a smaller quota. Videos over the per-file limit stream normally. Stale queued downloads are skipped, departed-page downloads are aborted, hidden documents suspend downloads and explicit Save-Data is honored. Object URLs exist only for active videos and are revoked on deactivation/unmount. No cached API JSON or Instagram credentials are written to that cache. This ceiling governs app-controlled media payloads, not the browser's independent network cache. iPhone memory/energy verification remains necessary.

**Proposal:** optional data-loader integration for pagers: approaching-end events, deduped fetch hooks, current/neighbor priority, retention and index-preserving pruning. Keep backend and storage policy consumer-owned.

Double-tap likes are now an explicitly authorized account write via the session adapter, with idempotent client intent, optimistic display and rollback on failure. Like testing uses intercepted transport instead of modifying the real account. Video taps wait 220 ms to distinguish double taps; a like never toggles playback. Native center/edge holds are cancelled by pointer movement and captured until release. Playback controls disappear after 200 ms. Comments load child replies on demand with separate pagination. pwacn's `DoubleTapSurface` is available but does not arbitrate double taps with existing video tap/hold/scroll semantics; this combined recognizer remains consumer code.

## Session recovery correction (outside pwacn, October 2026)

Live testing reproduced Instagram returning a 302 back to its homepage when the exported session had expired. The pre-existing Helium tab still displayed old posts, but navigating afresh showed Meta's saved-profile password prompt; the connector found no `sessionid`. The app previously equated possession of an encrypted cookie with a valid Instagram login, reported a generic 502 and kept trying to load feeds. `/api/status` now verifies the upstream account bootstrap and reports reconnect instructions for expired/challenged sessions. Connector and phone-session imports validate the upstream session before acknowledging success; warmed bootstrap state is retained to avoid repeating startup work. Auth failures are briefly coalesced, and rate limiting stays separate from sign-in failures. A valid Instagram sign-in still requires the user; a seven-day app cookie does not guarantee seven-day upstream validity. Local settings now expose a pairing code while connected so a stale connection can be refreshed without a confusing disconnect step.

## Phone-only login implementation (consumer authentication, October 2026)

`SignInScreen` uses native username/password/OTP inputs and browser autofill attributes. `passwordEncryption.ts` encrypts the password on the phone before any request to our server: a random AES-256-GCM key, timestamp as authenticated data, and libsodium sealed-box key wrapping using Instagram's public key. The envelope matches the current client modules `EnvelopeEncryption` and `FBBrowserPasswordEncryption`. The app server receives only this envelope, never the plaintext password. Secrets are excluded from local/session storage and feel telemetry; input state is cleared after submission.

The old `/accounts/login/ajax/` endpoint returned an upstream 500 in live protocol checks. The current client uses `useCDSWebLoginMutation` / `caa_login_web`. A short-lived incognito Chromium context on Vercel prepares this login and performs its exchange, then closes. At introduction it was used only during sign-in; the later write adapter also uses isolated contexts. Ordinary media browsing uses lightweight HTTP queries. The frontend stays on the phone. No browser survives between serverless requests: a purpose-separated AES-GCM HttpOnly cookie holds anonymous/challenge cookies, public encryption configuration and MFA identifier for at most ten minutes. Successful login is validated against the account bootstrap before a reader session is issued. MFA retry preserves the challenge without storing the password. Cookie cancellation, attempt limits and upstream rate-limit handling are included.

Instagram may still require a security approval or CAPTCHA. The app surfaces that requirement and does not solve or bypass it. Approval on another Instagram session may not complete every server-side challenge; that remains an upstream limitation requiring live evaluation. A same-origin PWA cannot read an Instagram-tab cookie; official professional-account OAuth does not supply the consumer home feed/stories used here. Phone login reduces dependency on the Mac but does not guarantee that Instagram will keep the resulting private session valid.

pwacn supplies the screen/sheet shell. Input types, autofill, one-time-code handling, password encryption, login transport, cookie lifecycle and account-cache isolation are consumer concerns; no new pwacn defect was required for this flow. Do not put password contents into primitive telemetry. Encryption and transport tests use synthetic credentials, and the UI tests cover MFA retry and session transition.

Vercel runtime verification found that Chromium's `--single-process` serverless preset crashes when creating an incognito target. The login worker removes that flag and successfully prepares a real Instagram login on Vercel. A reserved `.invalid` synthetic login returned the expected credential rejection through the deployed adapter. Password-envelope round trips, challenge handling and the two-factor UI flow are automated tests; a successful login/MFA with the user's real account requires the user's own input. Browser dependencies are loaded only when a login endpoint runs, so feed requests do not initialize Chromium.

The SMS verification view now exposes an explicit resend action using Instagram's own `PolarisAPISendTwoFactorLoginSms` endpoint and its existing challenge identifier. Successful requests report that an SMS was requested, without claiming carrier delivery. A 30-second client countdown and server cooldown prevent repeated sends. The verification view resumes from encrypted challenge state after a reload, within the ten-minute login window. Countdown timers exist only while waiting on this authentication screen; no background polling is introduced.

## Writes, sheet footers, and reel recovery (October 2026)

Post/reel like and unlike, comment like and unlike, comment creation/reply, and sharing a media item with one explicitly selected recipient now have current Instagram GraphQL adapters. The older media-like route returned a forbidden response which the app incorrectly classified as expired login. Forbidden actions now remain action errors; expired login and verification messages point to phone login or Instagram approval instead of Helium. A fresh isolated Chromium context executes writes using Instagram's own `getAsyncParams` runtime fields and closes afterward. This adds server latency and compute, rather than work to the phone. Browsing remains lightweight HTTP queries. No action is automatically retried, and comments/sends require a returned comment/message receipt. Rejected comments retain the draft. Per-control locks prevent double submission; optimistic hearts roll back on failure. Real-account testing is limited to likes and comment hearts, per the user's instruction; commenting and friend-send transport/UI are tested with intercepted requests.

**Sheet integration finding:** the sheet lays out to its largest snap and translates down at smaller snaps. A composer placed as the last ordinary flex child can therefore sit below the visible screen. The vendored sheet's `footer` slot compensates for its current translation. Comment and send composers now use that slot. Framework documentation should show this distinction prominently, with a scrolling body plus a persistent composer example; consider preventing or warning about ordinary flex footers. Mobile tests check that the submit control is actually clickable at the initial 74% snap, rather than merely present in the DOM. No additional framework patch was necessary for this correction.

**Reel pagination:** page metadata is fetched while up to eight reels remain, in addition to warming the next three videos. A server error retries automatically with bounded backoff; an exhausted/repeated cursor obtains a fresh recommendation batch and deduplicates against the current window. Failed/empty responses cannot trigger a tight retry loop. No blue load/retry button appears in the reel stream, including initial load failures. Hidden/offline views suppress retry work and resume on foreground/connectivity events. Buffered records and video storage retain the previous 40-record pruning and 512 MiB/30-minute cleanup policies. This is consumer data policy, not a pager responsibility. The framework's native scroll snap intentionally limits an individual wheel gesture to one page; tests should perform multiple gestures to exercise long scrolling.

**Validation:** unit tests cover real mutation shapes, missing acknowledgement, reply targets, explicit single-recipient routing, non-cached writes, and forbidden-vs-expired errors. Mobile UI cases cover rejected drafts, posting/reply display, comment/reply hearts, recipient selection, duplicate-send prevention, transient reel failures, exhausted batches, scrolling beyond the original batch, preload reuse, storage budget and expiry, and sign-out cleanup. Live computer-use checks exercise real playback, cached next-reel playback, suspension of inactive video, disappearing controls, likes/unlikes, comment display and comment hearts. Battery savings still require measurement on a physical iPhone; desktop and emulated mobile checks cannot establish battery consumption.

Production checks exposed intermittent GraphQL read responses with null data. Those errors are no longer stored in the read cache; one bounded retry handles a transient read failure. This retry is separate from account writes, which are never replayed automatically. Existing metadata caches are patched after acknowledged heart actions so closing and reopening the comments sheet does not reset a liked comment to stale state.

## Reel spacing and Explore viewport fill (October 2026)

Reel caption/audio overlays sit 12 px above the content edge; the action stack sits 16 px above it. The navigation already owns its safe-area inset, so the overlays do not add it again. Collapsed captions use one-line CSS ellipsis with an adjacent, nonshrinking “see more” button. Overflow detection now measures horizontal width; expanded text keeps its bounded scroll area and collapses when leaving the reel. These are consumer layout choices, not framework defects.

Explore previously displayed only the initial four-item recommendation batch and exposed no pagination. A consumer `ExploreGrid` observes a sentinel within pwacn's scroll surface, fills the visible screen, and fetches approximately one additional viewport ahead. Requests are sequential, cancel on leaving the view, pause when hidden/offline, deduplicate media, and retry empty/failed batches with bounded backoff. Exhausted/repeated cursors start a fresh recommendation batch. No timer polls an idle background view. pwacn supplies scrolling, but viewport filling and pagination orchestration remain application code; a documented paging/sentinel recipe would help framework consumers. This still uses the existing recommended-media adapter, rather than the complete native Instagram Explore algorithm.

A dedicated mobile regression test at 390×844 and 430×932 starts from a four-item response and verifies viewport filling, advance loading, additional items after scrolling, unique media IDs, one-line captions with inline expansion, and the reduced bottom spacing. The existing playback/gesture tests also remain applicable.

## Native appearance audit — 13 October 2026

The account owner confirmed their navigation is **Home · Reels · Messages · Search · Profile**. The visual reference is Instagram's current official Apple App Store iPhone screenshots (version 451.0.0, published 12 October 2026), downloaded through Apple's lookup API. Meta's September 2025 Reels-first announcement also places DMs in the middle. Marketing screenshots contain different navigation treatments, so the account's confirmed ordering takes precedence; a translucent floating bar is not assumed to exist on every account.

Changes in the consumer app: native ordering and centered Home branding; compact post captions; automatic feed pagination with deduplication and bounded empty-page retry; full-height post/profile views rather than partial bottom sheets; profile statistics, media tabs and profile actions; retained tab scroll; browser Back dismissing the top overlay; lower reel caption/audio and action overlays without redundant Share/Save labels; a reel options sheet; centered comment heading, quick emoji insertion, rounded composer, reply connectors and no repeated full caption; invisible story tap zones, hold-to-pause, downward dismissal and explicit story playback when autoplay is disabled. Creation, profile editing and story replies open Instagram. Local saves remain explicitly local.

`NavigationBar`, `MobileScrollArea`, `BottomSheet`, `Carousel`, `VerticalPager`, switches and pressables come from pwacn. Instagram-specific layout, recognition of combined video taps/holds, pagination, bounded captions and data caching remain consumer concerns. The existing app uses React state for post/profile overlays. Its full-height `DetailScreen` bridges that state to focus isolation, browser history and a left-edge back gesture; it uses pwacn's NavigationBar and scroll area. **pwacn already provides MobileStack with edge-back support**: this is not evidence that the framework lacks a navigation stack. A controlled, declarative entries API would simplify migrating externally managed overlay state without freezing route-node props. That is an integration/API suggestion, not a confirmed framework defect. Consumer navigation emits `InstagramDetailScreen` / push / route-commit telemetry.

Two actual framework accessibility issues surfaced during computer use, and are corrected in the vendored copy:

- BottomSheet previously marked the trigger subtree aria-hidden before a requestAnimationFrame moved focus into the sheet. Chromium reported a focused descendant inside an aria-hidden ancestor. Focus now moves synchronously into the sheet before siblings become inert/hidden; dismissal still restores the trigger's focus and previous sibling state.
- VerticalPager could hide a page containing the focused video button when scrolling to another reel. User-originated index commits now move focus to the pager before committing a page change. Inactive pages remain inert. The caller must still handle focus if replacing/removing the pager itself.

These patches are in `vendor/pwacn-react/src/sheet.tsx` and `vertical-pager.tsx`, not the separate pwacn source project. They should be ported upstream with kitchen-sink reproductions: open a sheet from a focused button and scroll a focused reel to the next page, then inspect console warnings and accessibility focus. The mobile parity suite rejects the specific aria-hidden warning.

Verification: the basic mobile UI suite and dedicated 390×844 / 430×932 parity cases pass in Chromium; the parity cases also pass in WebKit. Checks cover exact nav order, caption expansion, automatic feed pages, scroll preservation, full-height posts, Back closing comments while retaining the post, reaction insertion without publishing, restored background interaction, story navigation, no manual reel pagination and no horizontal overflow. Existing tests cover preloading, optimistic like rollback, replies, mock comments/sends, encrypted login and reel recovery. Evidence media live outside the repository in the ignored proof directory or T3 attachments.

Limitations: T3's device tools continue to return “Agent device access is turned off for this environment” despite the user enabling the setting. The booted iOS simulator has no native Instagram build installed. WebKit checks and official screenshots are useful but do not prove native-app parity, hardware keyboard/safe-area behavior, or iPhone battery savings. The Messages tab presently offers an explicit Instagram inbox handoff; an in-app inbox and encrypted conversations are not implemented. Explore remains a recommendation adapter, and profile reels only filter the currently loaded profile media. Native creation, full repost behavior, complete audio metadata, account-specific Friends surfaces and several profile features remain outside the current implementation. These are Instagram adapter/application gaps, not pwacn defects.

The story regression additionally plays a video with global autoplay disabled, holds to pause, and verifies release resumes from the same playback position. Story pause keeps the video source attached; leaving the viewer/foreground still suspends playback. The reel regression switches tabs and checks that the current reel survives the round trip, rather than restarting the stream.

Live verification on the deployed account loaded feed images, comments and reels. An acknowledged reel heart and comment heart were each restored to their original state (four successful HTTP 200 write responses total). No real comments, replies, reposts or messages were created. The next reel resolved from the private blob cache; offscreen videos were paused and detached. Explore filled the visible screen with 24 tiles plus an advance buffer. The account session remained valid throughout these checks.

Primary visual sources: [Instagram's Apple App Store listing](https://apps.apple.com/us/app/instagram/id389801252), [Apple lookup metadata](https://itunes.apple.com/lookup?id=389801252&country=us), and [Meta's Reels-first navigation announcement](https://about.fb.com/news/2025/09/in-india-instagram-debuts-a-reels-first-experience-for-its-mobile-app/). Reference images and test screenshots are under the ignored `proof/` directory; no evidence media belongs in Git.

The added edge-swipe case initially failed on carousel posts: the browser could start dragging the image, cancelling the pointer sequence. The consumer back recognizer now prevents that default at the left edge and measures final pointer distance directly. Button/input taps are excluded from the recognizer so an ordinary Back-control tap stays clickable. Chromium and WebKit exercise an actual mouse down/move/up sequence against the running mobile view. A separate regression focuses a reel's playback surface, scrolls its pager to the next page, and rejects accessibility warnings; focusing the pager before scrolling would have hidden the original focus bug.
