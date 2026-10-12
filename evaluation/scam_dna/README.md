# Scam DNA evaluation (synthetic, v1)

`scenarios_v1.json` holds 30 **synthetic DEMO DATA** scenarios written by the SafeCircle team: 12 benign
(including deliberate false-positive traps) and 18 scams, single- and multi-event, covering KYC suspension,
OTP and PIN requests, UPI collect and PIN-to-receive tricks, QR codes, digital arrest, remote access, payment
diversion, task jobs, parcel fees, fake loan APKs, eSIM swaps and one "novel" recruitment hook.
Each scenario has a label, a description, an expected risk outcome and the tactics it is meant to exercise.

```bash
backend/.venv/bin/python evaluation/scam_dna/evaluate_scam_dna.py
```

## Method

- Every scenario's events go through the same code as the API (`detect` → `redact` → `assess_case`), in order.
- **Flagged** = the case reaches medium or high risk, or is marked for review (that is when an alert would be raised).
- Precision, recall and false-positive rate are computed over the 30 scenarios (scenario = unit).
- `expected_level_agreement` compares the risk level with the scenario's expected outcome.
- `expected_tactic_recall` = share of the tactics each scenario was written to exercise that the engine found.

## Results

| Run | TP | FP | TN | FN | Precision | Recall | FPR | Accuracy |
|---|---|---|---|---|---|---|---|---|
| Initial run (`results_v1_initial.json`) | 16 | 4 | 8 | 2 | 0.800 | 0.889 | 0.333 | 0.800 |
| After fixes (`results_v1.json`) | 17 | 1 | 11 | 1 | 0.944 | 0.944 | 0.083 | 0.933 |

The initial run was made once, before any change to the rules. Its errors led to four changes:

1. A model-only signal (the SMS spam model) no longer triggers review on its own. It flagged a plain salary-credit
   SMS (B02); flagging every bank notice the spam model dislikes would cause alert fatigue. It is still shown as
   uncertainty.
2. A message that gives safety advice and asks for nothing has its signal weights halved (B03 OTP notice, B05 KYC
   reminder). Any request (code, link, payment, app) cancels the discount, and negation now only counts inside the
   same sentence, so copied safety advice cannot hide a request that follows it.
3. "KYC update" alone is no longer a suspension threat; expiry, pending or blocking language is required.
4. New rules for "sent you a payment request" and "approve it to return my money" (S16, accidental-credit scam).

**Because these fixes were informed by this set, the "after fixes" row is not an independent measurement.**
It shows the set is now handled, nothing more.

Remaining errors, kept on purpose:
- **B08 (false positive):** a genuine merchant collect request for an order the user placed reads, in text alone,
  exactly like a collect-request scam. The engine cannot know whether the user placed the order. The case view
  tells the user to check that themselves.
- **S18 (false negative):** a recruitment hook with no request yet. No known tactic is present, so it stays low.
  This is the expected weakness of a rules-first engine against new scripts; Scam DNA's mitigation is that the
  case is re-evaluated when the follow-up (fee, deposit, app install) arrives.

## Limitations

- 30 synthetic scenarios written by the same team that wrote the rules. This is a sanity check, not evidence of
  real-world accuracy, and it must not be quoted as production precision or recall.
- English only; no code-mixed Hindi/Hinglish beyond a few words in the base rules.
- Attackers change wording; unseen tactics (S18) are missed until a rule exists or a later event reveals a known stage.
- The risk score is a heuristic from expert-set weights and has not been calibrated against real outcomes.

The message and link detector underneath has its own evaluation on public datasets in `evaluation/README.md` and
`docs/methodology.md`; that detector was not changed by this work, so those numbers still apply to it.
