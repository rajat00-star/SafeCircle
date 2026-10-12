# Demo runbook: pitch, 3D walkthrough and live app (about 8 minutes)

All inputs are synthetic **DEMO DATA**. Say so on screen once, at the start.

## 10 minutes before

```bash
cd ~/Developer/SafeCircle
backend/.venv/bin/python backend/scripts/demo_story_check.py        # must end: All demo steps behave as the runbook says.
python3 -m http.server 8090 --bind 127.0.0.1 --directory presentation/site   # terminal 1: the 3D walkthrough
```

Optional live app (terminal 2), on a separate demo database so `backend/safecircle.db` is never touched:

```bash
cd ~/Developer/SafeCircle/backend
export SAFECIRCLE_DATABASE_URL=sqlite:////tmp/safecircle-demo.db
rm -f /tmp/safecircle-demo.db && .venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then open the app as described in [docs/demo-runbook.md](../docs/demo-runbook.md) ("Before you start", option A
with the dev server on :3000, or option B with a fresh build). Note that `frontend/out` is stale until it is rebuilt
with the dev server stopped, so option B needs `npm run build` first.

Open http://127.0.0.1:8090, press `P` for presentation mode, and press `1` to start. Close other heavy tabs; if
the projector machine stutters, reload with `?quality=low`.

## The run

| Time | Where | Do | Say (accurate lines) |
|---|---|---|---|
| 0:00 | Slide 1 | — | "A scam is a pattern over several events, not one message. Everything you see uses synthetic data." |
| 0:40 | Slides 2–3 | `→` | The refund story: medium 36 on the first message, high 97 when the QR contradicts the promise, repeats suppressed. |
| 1:40 | Slide 4 | `→` | Observed (solid) versus inferred (dashed). "The score is a heuristic indicator, not a probability." |
| 2:20 | Slide 5 | click Guardian Shield or UPI Guard card | Real screenshots; Guardian Shield's real-browser run is not verified. |
| 2:50 | Slide 6, then `B` | Scene B: choose **Lone OTP request, then a retraction**, press `Enter` | 59 and review required: one tactic cannot make a case high; the retraction is a conflict and the score does not drop. |
| 3:50 | `A` | Scene A: click **Walk the request path** twice, then Guardian Shield | Every module is a real component; red light means not verified. |
| 4:40 | `C` | Scene C: click **Refund QR from 'SBI'**, then the shared UPI node; untick **Inferred similarity** | Solid = indicator found in both cases' evidence; dashed = similarity, not proof. Organisation names are claims. |
| 5:30 | `7`, `8` | Slides 7–8 | Read the fractions (23/26, 23/24, 3/27) and the four errors aloud. |
| 6:30 | Optional live app | UPI Guard → Refund QR image → Check before paying | Same 97 as the slides, from the live engine. |
| 7:10 | `9`, `0` | Slides 9–10 | No bank, NPCI or live intelligence connection; not production-ready; the 48-hour plan starts with an independent v4 set. |

Avoid: "detects all UPI fraud", "real-time threat intelligence", "connected to banks/NPCI", "blocks payments",
"X% accurate in the real world". None of these is true.

## If something goes wrong

| Problem | Recovery |
|---|---|
| 3D stutters or goes black | Reload with `?quality=low`, or `?gl=0` for the 2D version (same content and controls). |
| Lost your place | `G` opens the index; `Home` returns to slide 1. |
| Live app fails | Stay in the walkthrough: Scene B replays the same engine output. Reset the app with `rm -f /tmp/safecircle-demo.db` and the migration command above. |
| Projector has no browser | Present the PPTX; slide 7 and appendix A1 contain renders of all three scenes. |

## After

`Ctrl+C` both servers. `rm -f /tmp/safecircle-demo.db` (only the demo database, never `backend/safecircle.db`).
