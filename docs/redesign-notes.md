# Cinematic redesign: notes and verification (2026-10-10)

## Visual direction
"Cinematic Digital Trust", translated from the two reference videos (via a written frame-by-frame breakdown; the
videos and keyframe images themselves were not available on this machine).

- Near-black graphite base, violet bloom and teal fog, silver and glass surfaces, film grain.
- Colour carries meaning only: mint = no warning signs found, amber = caution, red = high risk.
- Type: Chakra Petch (squared, techy display caps with a soft glow), Inter for interface text, JetBrains Mono for
  small caps labels and `->` lists. Fonts are self-hosted at build time, so the backend CSP (`font-src 'self'`) still holds.
- Hero: real-time three.js scene. An iridescent transmission-glass ring with a chrome gyroscope inside, hanging on a
  figure-8 thread of light, with a dotted light strand and a particle cloud that bursts gold on load and then drifts.
  Pointer-responsive, scroll-driven camera dolly, overlaps the end of the headline like the reference.
- Headline and card titles decode in with scrambling characters. Floating glass threat cards at different depths with
  scroll parallax. Pill nav with hairline separators, fixed scan rail bottom-left, thin scroll indicator right.

## Files
Changed: `frontend/app/{layout,page,globals.css}`, all pages under `frontend/app/*/page.tsx`,
`frontend/components/{Nav,ProfileGate,ResultView,Gauge,AlertPanel}.tsx`, `frontend/lib/api.ts` (one additive method),
`e2e/e2e.mjs` (button label "Check now" -> "Analyze now", nav "Check" -> "Analyze").

New: `HeroScene` (WebGL), `HeroLoader` (lazy client loader), `Analyzer` (workspace, logic moved from the old home page
unchanged), `LiveDemo`, `ThreatField`, `ScanRail`, `Scramble`, `Reveal`, `ScrollIndicator`, `PageHeader`,
`SiteHeader`, `BrandMark`, `app/icon.svg`.

Not changed: backend, browser extension, `.env` files, database, `next.config.mjs` (static export kept).

## Dependencies
- `three@0.186.0` and `@types/three@0.186.0` (dev), pinned. three.js loads only in the browser as a lazy chunk after the
  page is interactive; the home page first-load JS is 114 kB.
- Nothing removed. No GSAP / Framer Motion / React Three Fiber: CSS and IntersectionObserver cover the motion.

## Behaviour preserved
- Same API client, endpoints, `safecircle.profileToken` local-storage key, history/profile/contacts/alerts flows.
- `/?text=` and `/?url=` prefill for the extension still work (verified) and now scroll to the workspace.
- The landing-page live demo calls the real detector with `auth: false` (new `api.analyzeMessageAnonymous`), so it
  never writes into anyone's history. If the API is down it says so; nothing is canned.
- Threat cards are loaded from the live `/meta/model-card`.
- History adds client-side search, risk and type filters, and a details row over data already returned by the API.
- Results now separate detected evidence from uncertain signals, and say plainly that low risk is not proof of safety.

## Performance and accessibility
- Tiers: high (transmission glass, bloom, ~1800 particles, DPR <= 2), low (few cores / little memory / narrow
  screen: no transmission, no bloom, fewer particles, DPR <= 1.25), CSS fallback (no WebGL, Save-Data, lost context).
- Frame-time watchdog drops bloom and resolution if frames are slow. All GPU resources are disposed on unmount.
- Measured: 60 animation frames/s with the hero visible, 0 when scrolled away; with `prefers-reduced-motion` the scene
  renders a still frame, 0 rAF calls and no running CSS animations.
- Canvas is `pointer-events: none` and `aria-hidden`; headline has a real `aria-label`; analysis results are announced
  through a polite live region; visible focus rings; no horizontal scroll at phone width (verified at 375 px and 390 px).

## Verified
- `npm run typecheck`: passes.
- `npm run build` (static export): passes, 10 routes.
- Backend `pytest`: 63 passed.
- `e2e/e2e.mjs` against the built site served by FastAPI on port 8000: all 18 checks pass (analysis, URL analysis,
  profile, trusted-contact invite/consent/alert/inbox, privacy toggles, history save/view, data export, delete
  everything, mobile overflow, no console errors).
- Dev mode (frontend on 3000, API on 8000): URL analysis, profile creation and deletion checked with no console errors.

## Not done / known limitations
- `npm run lint`: not configured in this project (no ESLint config or packages); left as is rather than adding dependencies.
- `e2e/extension.mjs` could not run: branded Google Chrome no longer loads unpacked extensions from the command line.
  The extension and backend were not modified.
- `npm audit` reports a PostCSS advisory inside Next 15's build tooling (pre-existing; the fix is a Next 16 upgrade).
- In split dev mode, trusted-contact invite links point at the API origin unless the backend is started with
  `SAFECIRCLE_PUBLIC_BASE_URL=http://localhost:3000` (pre-existing behaviour).
- Not reproduced from the reference: route change to `/work` during the card carousel, card dissolve-into-particles,
  caustics and the full lab stage with volumetric light.

---

# V2: immersive 3D (2026-10-10)

Motion and composition came from a written frame-by-frame breakdown of the reference clip, not from
watching it: the media files were uploaded to the cloud project and are not on this machine. Per that
breakdown, neither reference shows a globe (one is the agency site, the other a scroll-through of this
site), so the Earth was designed from the written brief.

## Data integrity
- Backend audit: no model, table, router or dataset records geography or a timestamped threat feed
  (`backend/app/models.py`, `routers/*`, `evaluation/data/*`). Request IPs are only used for rate limiting.
- The globe therefore runs a **DEMO DATA** provider (`frontend/lib/threatData.ts`): synthetic, seeded counts
  at real city coordinates. The panel shows a "Demo data" badge, says it is illustrative and not a live
  threat map, labels counts as "sample reports", and shows "Last updated: n/a" instead of inventing times.
- Confirmed vs unverified: solid vs dashed markers, explained in the legend (in demo mode both are synthetic).
- A verified feed can be connected by setting `NEXT_PUBLIC_THREAT_FEED_URL` to a same-origin JSON endpoint
  returning the `ThreatSnapshot` shape (`LiveFeedProvider`). Nothing about user checks is sent anywhere.

## What changed
- `GlobeScene` (three.js, custom shaders): dark planet with a fixed sun and visible terminator, fresnel rim,
  atmosphere shell, land as ~11k dots with day/night shading and restrained city lights, coastlines and
  borders, scanning arc, instanced spikes / pulsing rings / hit proxies, animated arcs, raycast hover and
  click, drag-to-spin with inertia, the globe turns to face a selection, scroll dolly, staged reveal.
- `GlobeHero`: new headline and copy, activity panel with time-range and tactic filters, a location list
  (keyboard and no-WebGL path), details (location, tactics, count, last-updated), legend, demo badge.
- `TacticSection` + `TacticScene`: one WebGL canvas, scroll-driven. Six frosted-glass panels travel a curved
  path (enter deep right, turn to face the camera, hold, exit left), pass in front of and behind a column of
  iridescent glass rings with coral particles, resolve out of particles, tint the scene, decode their titles,
  and use BokehPass depth of field on capable devices. Click a panel or a numbered button to focus it.
  Phones, reduced motion and no-WebGL get a readable stacked list. The other six categories are listed as "Also checked".
- `SpatialBackdrop` (one component, one canvas per page): scanner chamber (sweeping light plane while
  analysing, ambient colour follows the result), history plates (one per saved check, max 8), trusted circle
  (active contacts glow and link, pending are hollow, free slots faint), privacy shells (browser / server /
  opt-in storage, matching the data-flow cards). `RiskSculpture`: three glass tiers lit up to the result
  level, plus a core that rises to the score. `lib/stage.ts` and `lib/gfx.ts` share setup, tiers and disposal.
- Removed (superseded): `HeroScene`, `HeroLoader`, `ThreatField`.

## Assets and licences
- Land mask, coastlines and borders: Natural Earth 1:50m land and 1:110m land/countries (public domain), via
  the `world-atlas@2.0.2` package (ISC). Converted offline by `frontend/scripts/build-globe-data.mjs`
  (`npm run globe:data`) into `frontend/public/globe/*.bin` (74 KB total). Antarctica is omitted.
- City-light anchors and demo locations: coordinates of large cities (factual), no imagery.
- No textures or third-party requests at runtime. New dev dependencies: `world-atlas`, `topojson-client`,
  `@types/topojson-client` (build script only, nothing shipped to the browser).

## Verified (V2)
- `npm run typecheck` passes; `npm run build` (static export) passes; home first-load JS 123 kB
  (three.js and the scenes load lazily).
- Backend `pytest`: 63 passed. `e2e/e2e.mjs` on the built site served by FastAPI (port 8000): 18/18 passed.
- Globe: choosing a location turns the globe and fills the panel; 7d -> 30d and tactic filters change
  counts; mouse hover over a marker shows a tooltip via raycasting; clicking selects it.
- Performance (Apple M4 Pro, Chrome, 1440x900): globe canvas ready ~0.6 s after navigation; 60 fps at the
  hero and inside the tactic scene; 0 animation frames per second once every scene is off-screen; JS heap ~13 MB.
- Reduced motion: 0 animation frames per second after settling; globe drawn as a still frame; tactics shown
  as a flat list. No WebGL (`--disable-webgl`): CSS globe fallback, panel and location list still work,
  tactics shown as a list, no console errors. Phone (390 px): no horizontal scroll, 60 fps, stacked tactics.

## Limitations (V2)
- The globe data is synthetic until a verified feed exists; that is the main remaining gap for a "live" map.
- Depth of field is BokehPass on the high tier only; the low tier fades out-of-focus panels instead.
- No card-to-particle route change (`/work`) or lab stage from the reference; scroll stays on one page.
- Performance was measured on a fast laptop; low-tier behaviour was checked by forcing narrow viewports,
  not on a real low-end phone.
