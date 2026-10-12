# SafeCircle Guardian · PS02 presentation

Two deliverables with one visual identity (near-black navy, electric cyan, restrained red, violet for inference):

| Deliverable | Path |
|---|---|
| Editable pitch deck: 10 pitch slides, then a separate 4-slide appendix | [`SafeCircle-Guardian-PS02.pptx`](SafeCircle-Guardian-PS02.pptx) |
| Interactive 3D walkthrough: the same 10-slide narrative plus three architecture scenes | [`site/`](site) |
| Demo runbook (about 8 minutes) | [`DEMO-RUNBOOK.md`](DEMO-RUNBOOK.md) |
| Report: tests, results, changed files, limitations | [`REPORT.md`](REPORT.md) |

Every example is synthetic **DEMO DATA**. Scores are heuristic indicators from transparent rules, not
probabilities of fraud. Synthetic benchmark results do not establish real-world accuracy.

## Launch the 3D walkthrough

Prerequisites: Python 3 (any recent version, only for the static file server) and a current Chrome, Edge,
Safari or Firefox with WebGL. Nothing to install: three.js 0.186.0 (the frontend's version) and the fonts are
vendored in `site/vendor/`, so the site also works offline. It needs **no backend**: it replays a recorded
snapshot of real API output (`site/data/`).

```bash
cd ~/Developer/SafeCircle
python3 -m http.server 8090 --bind 127.0.0.1 --directory presentation/site
```

Open **http://127.0.0.1:8090**. Port 8090 avoids the app's dev server (:3000), the API (:8000) and the extension
test page (:8765). If 8090 is busy, use any free port. Opening `index.html` directly from disk does not work
(browsers block ES modules on `file://`); the page says so.

| Route | Content |
|---|---|
| `#/pitch/1` … `#/pitch/10` | The pitch narrative, same order as the deck |
| `#/arch/a` | Scene A · end-to-end system by layer; click a module for purpose, inputs, outputs, status and source files |
| `#/arch/b` | Scene B · detection pipeline; play three recorded scenarios (multi-stage scam, refund QR story, lone OTP request then retraction) |
| `#/arch/c` | Scene C · scam intelligence network; inspect nodes, follow links, filter relationship types |

Options: `?gl=0` forces the 2D fallback, `?quality=low` turns off bloom and lowers resolution.

### Controls

`→` `Space` `PgDn` next · `←` `PgUp` previous · `Home` `End` · `1`–`9`, `0` jump to pitch slide 1–10 · `A` `B` `C`
scenes · `P` presentation mode (full screen, chrome fades) · `G` index · `M` reduce motion · `R` reset the 3D view ·
`Esc` close · Scene B: `Enter` play/pause, `[` `]` step. Drag to rotate and scroll to zoom in the scenes.

Reduced motion follows the operating-system setting and can be toggled with `M`; the scenes then render only on
demand and camera moves become cuts. Without WebGL (or if the graphics context is lost) every scene switches to a
2D version with the same inspector, playback and filters.

## Open or rebuild the deck

Open `SafeCircle-Guardian-PS02.pptx` in PowerPoint, Keynote or Google Slides. It uses Arial and Calibri, a theme with
the site's colours, real section breaks (Pitch / Appendix), native charts and tables, and speaker notes on every
slide. Fill in team member names for the owner roles on slide 10 (they are roles, not people).

Rebuild after any data change (Node 20+; `pptxgenjs` is installed only inside `presentation/deck`):

```bash
cd ~/Developer/SafeCircle
backend/.venv/bin/python presentation/scripts/snapshot.py      # real API output on a throwaway SQLite database
python3 presentation/scripts/build_facts.py                     # every quoted number, from committed result files
presentation/scripts/prepare-deck-images.sh                     # PNG captures -> JPEG for the deck (macOS sips)
cd presentation/deck && npm ci && node build_deck.js            # writes presentation/SafeCircle-Guardian-PS02.pptx
```

Screenshots: `capture-app.mjs` needs the app running on a scratch database (see REPORT.md §3 for the exact
commands); `capture-site.mjs` needs the site server above. Both use the Playwright copy in `e2e/node_modules`.

## Automated checks

```bash
SITE_URL=http://127.0.0.1:8090 CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node presentation/scripts/check-site.mjs            # 69 checks: every slide and scene, interactions, keyboard,
                                                      # reduced motion, 2D fallback, phone width, console errors
```

`presentation/scripts/preview_deck.py` draws approximate slide previews and flags likely text overflow when no
office suite is installed. It is not a faithful renderer.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Loader says to use a web server | You opened the file directly. Start the server above. |
| `Address already in use` | Pick another port, for example `8091`, and open that port. |
| Blank or black 3D area | Add `?gl=0` for the 2D view, or `?quality=low`. Check that hardware acceleration is on in the browser settings. |
| Old content after an update | Hard-reload (`Cmd+Shift+R`); `http.server` does not send cache headers. |
| Motion is distracting on a projector | Press `M` (reduced motion). |
| Deck fonts look different | The deck uses Arial and Calibri only; Keynote substitutes Calibri if it is missing, which can shift line breaks slightly. |

Recovery: nothing here touches the product, the database or the extension. Stop the server with `Ctrl+C`. The
state before this work is tagged `checkpoint/pre-presentation`.

## Submission format

The hackathon brief asks for **one PDF** with the pitch deck and the architecture overview. This work deliberately
produced an editable PPTX and a separate interactive site, and **no PDF**. Before uploading, export the deck to PDF
from PowerPoint or Keynote (File → Export) and decide how the architecture overview is included (the appendix slide
A1 and slide 7 carry renders of all three scenes).
