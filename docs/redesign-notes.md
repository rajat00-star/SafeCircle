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
