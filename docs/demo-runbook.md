# Demo runbook (about 6 minutes)

Every input in this demo is **DEMO DATA**: synthetic text written by the SafeCircle team, with fictional handles and
`.example` domains. Nothing in it is live fraud intelligence, a real victim or a bank connection. Say so on screen.

**What is deterministic.** The engine is rule-based, with no randomness and no network calls, so the same inputs give
the same scores, tactics and alert decisions on every run. `backend/scripts/demo_story_check.py` replays every
step below against a throwaway database and checks the outcome. Run it before you present; it should print
`All demo steps behave as the runbook says.` Timestamps, case IDs and the report fingerprint change on every run.
The network graph layout can shift slightly between page loads.

## Before you start

Use a separate demo database so your real `backend/safecircle.db` is never touched.

```bash
cd ~/Developer/SafeCircle/backend
.venv/bin/python scripts/demo_story_check.py                 # dry run, must pass
export SAFECIRCLE_DATABASE_URL=sqlite:////tmp/safecircle-demo.db
rm -f /tmp/safecircle-demo.db && .venv/bin/alembic upgrade head
```

Then pick one of these:

- **A. Dev server already running on :3000** (the usual setup on this Mac). Start the API with
  `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000` and open **http://localhost:3000**. Use `localhost`,
  not `127.0.0.1`, because the API's CORS allows `http://localhost:3000`.
- **B. One server.** Stop the dev server first, because `next build` shares `frontend/.next` with it. Run
  `cd ../frontend && npm run build`, then `cd ../backend && SAFECIRCLE_STATIC_DIR=../frontend/out .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000`
  and open **http://127.0.0.1:8000**. Use `127.0.0.1`: the build bakes in that API address, and `localhost` is a
  different origin that the CSP blocks.

On the first page that asks, create a profile named e.g. "Demo judge". Profiles live only in the demo database.

## The story

| # | Where | Do | What the audience should see (checked by the dry run) |
|---|---|---|---|
| 1 | **UPI Guard** (`/upi/`) | Click **Shop QR**, then **Check before paying**. | Low, 0/100: "No warning signs found… This does not confirm the payee is genuine." There is no false alarm on an ordinary merchant QR, and the page says it cannot confirm the payee either. |
| 2 | **Scam DNA** (`/cases/`) | Under **Start a case**, name it `DEMO · Refund QR from 'SBI'` and click **Create case**. Add a message: `SBI Refund Desk: your refund of Rs 4,999 has been approved and is waiting to be credited.` | Medium, 36/100. A plausible message that only claims something gets a warning, not an alarm. The uncertainty and the missing evidence are shown. |
| 3 | **UPI Guard** | Click **Refund QR image**. The demo QR is decoded *in the browser*: point out "QR code read on this device. The image was not uploaded." Then click **Check before paying**. | High, 97/100, "Strong warning signs. Do not pay." Each signal is labelled observed or heuristic: the QR is a *payment* while the message promises you will *receive* money, PIN-to-receive, and a refund-style payee. Read out the limitations line: no bank, NPCI or fraud database is consulted. |
| 4 | **UPI Guard** | In **Add to**, choose the case from step 2 and check again. | "Added to case". The case goes from medium 36 to high 97, and the alert decision is **escalated**. |
| 5 | **Scam DNA** | Open the case. Then show alert-fatigue control: add the follow-up `Caller from the SBI refund desk asked me to read out the OTP I just received so he can release the refund.` | "What changed" lists the tactics added by the QR. The follow-up keeps the case high and the alert is **suppressed**: nothing material changed, so there is no second notification. Running the same UPI check again gives "Duplicate suppressed". |
| 6 | **Campaign Radar** (`/campaigns/`) and **Scam Network** (`/network/`) | Create a second case, `DEMO · Same QR, reported by a neighbour`, and attach the same refund QR to it from UPI Guard. Then click **Load demo campaign cases**. Open the network. | The two refund cases are grouped by an **exact** shared indicator ("Same UPI handle: (masked) sb***@ybl"), drawn as **solid** lines to one masked UPI node. The demo campaign cases add **dashed** inferred links, which carry "Similarity only…" uncertainty text. Make the point that solid means observed in the evidence and dashed means similar wording, which is not proof of a connection. |
| 7 | **Evidence report** (case page → **Evidence report**) | Show the timeline, the masked handle and the related case. Try **Download Markdown**: it is disabled until you tick the review box. Tick it and download. | The report repeats the case's own risk (high 97) and lists 3 evidence items and the related neighbour case. It says it **has NOT been submitted** to any authority, how to report (cybercrime.gov.in, 1930), and what is excluded by design (OTPs, PINs, phone numbers, images). The file is created in the browser. |
| 8 | **Guardian Shield** (Chrome extension) | Only if it is loaded and passed [extension-manual-check.md](extension-manual-check.md). Open `e2e/fixtures/guard-test.html` (served on `http://127.0.0.1:8765`) and click **High-risk test link**. | The warning page appears. **Open anyway** stays disabled until the acknowledgement is ticked, and **Go back** returns to the page. The `.example` link cannot reach a real site even if opened. If the extension has not been checked by hand, show the in-app **Browser protection** page and say the real-browser test is still outstanding. |

## Wrap-up lines that stay accurate

- "On a synthetic set of 51 labelled scenarios, frozen before we ran it, the case engine flagged 23 of 24 scams and
  3 of 27 benign messages. Synthetic data does not tell you real-world accuracy." Source:
  `evaluation/holdout_v2/README.md`.
- "The score is a heuristic indicator, not a probability of fraud."
- Avoid saying "detects all UPI fraud", "live threat intelligence", "connected to banks/NPCI", or "blocks payments".
  None of these is true.

## Reset

```bash
rm -f /tmp/safecircle-demo.db        # only the demo database; never backend/safecircle.db
```

Or, in the app, **Remove demo cases** (`/cases/`) removes only cases marked DEMO. Cases you created by hand in
steps 2 and 6 are ordinary cases even though their titles say DEMO, so delete them from their case pages or drop
the demo database.
