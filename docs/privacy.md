# Privacy

## Principles
Data minimisation, user control, consent on both sides of the trusted-contact link, and honesty about limits.

## What is processed and stored

| Data | Processed | Stored | Shared |
|---|---|---|---|
| Text or link you check | In memory, on the server, to compute the result | **No**, unless you enable history. Then only: time, score, level, warning-sign codes, SHA-256 of the content. A redacted excerpt only if you enable excerpts too | Only with contacts you alert, and only as a summary (excerpt per alert, opt-in) |
| Display name | Yes | Yes | Shown to contacts you invite |
| Profile token | Kept in your browser | SHA-256 hash only | Never |
| Trusted contact name | Yes | Yes, until you or they end the link, or you delete your profile | No |
| Consent decisions | Yes | Append-only audit (event, actor, time) | Included in your export |
| IP address | For rate limiting, in memory | No | No |
| Request logs | Method, path, status, duration, request id | Per hosting provider's log retention | No |

Redaction removes numeric codes (4–8 digits), card/account-like numbers, phone numbers and email addresses.

## Your controls
History on/off, excerpts on/off, retention (1, 7, 30, 90, 365 days; expired rows are purged when history is read),
delete single entries or all history, **download my data** (JSON), **delete everything** (profile, contacts, alerts,
audit trail; contact links stop working immediately).

## Optional AI explanations
Disabled unless the operator configures `SAFECIRCLE_LLM_PROVIDER=anthropic` and a key, **and** you tick the box for a
specific check. Only the detector's findings and the redacted excerpt are sent. The AI text never changes the score.

## Platform limits we respect
SafeCircle does not read SMS, calls, WhatsApp or email. Android restricts SMS/Call Log permissions to default handler
apps ([Google Play policy](https://support.google.com/googleplay/android-developer/answer/10208820)); iOS offers a
privacy-preserving [message filter extension](https://developer.apple.com/documentation/identitylookup/sms-and-mms-message-filtering)
model instead of inbox access. The browser extension requests no host permissions and runs only on your click.
