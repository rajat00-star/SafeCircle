# API reference

Base path: `/api/v1`. Interactive docs: `/api/docs`. Machine-readable spec: [openapi.json](openapi.json).

Authentication: `Authorization: Bearer <profile token>` (from `POST /profiles`) where marked 🔒. Contact endpoints use `X-Guardian-Token: <token from the invite link fragment>`.

Errors are JSON: `{"detail": "..."}`; validation errors add `errors: [{field, message}]` (HTTP 422). Rate-limited calls return 429 with `Retry-After`.

| Method | Path | Summary |
|---|---|---|
| GET | `/api/v1/health` | Health |
| GET | `/api/v1/meta/model-card` | How the detector works and how it was evaluated |
| POST | `/api/v1/analyze/message` | Check a message, email or chat for scam and phishing signals |
| POST | `/api/v1/analyze/url` | Check a single link without opening it |
| POST | `/api/v1/profiles` | Create an anonymous profile. No email or phone number is required. |
| GET | `/api/v1/profiles/me` 🔒 | Me |
| PATCH | `/api/v1/profiles/me` 🔒 | Update privacy settings |
| DELETE | `/api/v1/profiles/me` 🔒 | Delete the profile and all data, including contacts and alerts |
| GET | `/api/v1/profiles/me/export` 🔒 | Download everything stored about this profile |
| GET | `/api/v1/analyses` 🔒 | History (only if history is enabled) |
| DELETE | `/api/v1/analyses` 🔒 | Clear all history |
| DELETE | `/api/v1/analyses/{analysis_id}` 🔒 | Delete Analysis |
| POST | `/api/v1/contacts` 🔒 | Add Contact |
| GET | `/api/v1/contacts` 🔒 | List Contacts |
| DELETE | `/api/v1/contacts/{contact_id}` 🔒 | Revoke a contact (ends the link immediately) |
| POST | `/api/v1/alerts` 🔒 | Send an alert to consenting trusted contacts |
| GET | `/api/v1/guardian/invite` | Invite Info |
| POST | `/api/v1/guardian/accept` | Accept |
| POST | `/api/v1/guardian/decline` | Decline |
| GET | `/api/v1/guardian/alerts` | Inbox |
| POST | `/api/v1/guardian/alerts/{alert_id}/ack` | Acknowledge |

## Example

```bash
curl -s -X POST http://localhost:8000/api/v1/analyze/message \
  -H 'Content-Type: application/json' \
  -d '{"text": "Your account will be blocked. Share the OTP you received now."}'
```

Response (abridged):

```json
{
  "kind": "message",
  "risk_score": 76,
  "risk_level": "high",
  "verdict": "High risk: this looks like a scam.",
  "categories": [
    {
      "code": "otp_request",
      "title": "Asks for a one-time code, PIN or CVV",
      "explanation": "Legitimate banks and services never ask you to share a one-time password, PIN or CVV. Anyone who asks for one can use it to take over your account or approve a payment.",
      "weight": 0.55,
      "evidence": [
        {
          "text": "Share the OTP",
          "start": 30,
          "end": 43,
          "rule": "otp_share"
        },
        {
          "text": "the OTP you received",
          "start": 36,
          "end": 56,
          "rule": "otp_received"
        }
      ]
    },
    {
      "code": "threat",
      "title": "Threats or penalties",
      "explanation": "Threats of arrest, account blocking, fines or disconnection are used to scare people into acting.",
      "weight": 0.3,
      "evidence": [
        {
          "text": "account will be blocked",
          "start": 5,
          "end": 28,
          "rule": "thr_account"
        }
      ]
    }
  ],
  "combinations": [],
  "urls": [],
  "ml": {
    "probability": 0.4179,
    "top_terms": [
      "your",
      "will be",
      "now",
      "account",
      "received"
    ],
    "model_version": "sms-tfidf-lr-1.0"
  },
  "recommendations": [
    "Never share a one-time code, PIN or CVV with anyone, even someone claiming to be your bank. If you already shared one, call your bank on the number printed on your card now.",
    "Government agencies and banks don't threaten arrest or account closure by text or chat. Don't respond to threats.",
    "India: report at cybercrime.gov.in or call 1930 (National Cyber Crime Helpline).",
    "US: report at reportfraud.ftc.gov. UK: forward scam texts to 7726 and emails to report@phishing.gov.uk."
  ],
  "redacted_excerpt": "Your account will be blocked. Share the OTP you received now.",
  "engine_version": "1.0.0",
  "processing_ms": 1158.57,
  "ai_summary": null,
  "ai_status": "disabled",
  "stored": false,
  "analysis_id": null,
  "alert_ticket": "eyJjIjpbIm90cF9yZXF1ZXN0…"
}
```
