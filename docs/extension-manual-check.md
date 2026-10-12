# Guardian Shield: manual Chrome check

**Status: NOT VERIFIED in a real Chrome extension runtime.** Chrome 137 and later ignore `--load-extension`, so
the unpacked extension could not be loaded by automation. What *is* automated: `extension/tests` (Node, the
decision logic, the service worker with a mocked `chrome.*`, and three calls to a live server) and
`e2e/extension-pages.mjs` (the extension pages in Chrome with a stubbed `chrome.*`). Neither proves the real
extension works. Work through the steps below once and record the result in the table at the end.

## What the extension can see and send (from the code, `extension/`)

- Permissions: `contextMenus`, `storage`, `activeTab`, `scripting`. Site access (`http://*/*`, `https://*/*`) is
  *optional*. It is requested only when you turn on the link guard in Options, and removed when you turn it off.
- It never reads page content. The link guard content script (`guard.js`) reads only the address of a link you
  click, and only for links leaving the current site.
- It sends a URL or text to **your configured SafeCircle server** in three cases: you use the right-click menu,
  you open the toolbar popup (which checks the current tab's address), or the link guard is on and you click a
  link to another site. Requests use `credentials: "omit"` and no profile token, so nothing is stored
  server-side unless that server is configured to.
- The full link address is sent, **including its query string**. See finding M1 in
  [validation-report.md](validation-report.md).
- Links to the SafeCircle server itself, `localhost`, `127.0.0.1` and `[::1]` are never sent.
- If the server cannot be reached, the link opens anyway, and the toolbar badge shows `?` with the reason. It
  never claims an unchecked link is safe.

## Setup

```bash
# 1. Start the API (scratch database, so your real data is untouched)
cd ~/Developer/SafeCircle/backend
export SAFECIRCLE_DATABASE_URL=sqlite:////tmp/safecircle-extcheck.db
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. In a second terminal, serve the test page (a fixed, local page with DEMO DATA links)
cd ~/Developer/SafeCircle/e2e/fixtures && python3 -m http.server 8765 --bind 127.0.0.1
```

Test page: <http://127.0.0.1:8765/guard-test.html>. Its risky links use the reserved `.example` domain, which can
never resolve, so even "Open anyway" cannot reach a real site.

| Test link | Server verdict (checked by `backend/scripts/demo_story_check.py`) |
|---|---|
| `http://sbi-kyc-verify-login.example/update` | high |
| `http://free-gift-card-winner.example/claim` | medium |
| `https://example.com/` | low |

## Steps

1. **Load unpacked.** Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load
   unpacked** and choose `~/Developer/SafeCircle/extension`. Expect "SafeCircle Guardian Shield 1.1.0" with no
   errors. Click **Details** and check that site access says the extension has no access yet.
2. **Server.** Click the toolbar icon. Expect "Server online (http://127.0.0.1:8000)". If you see offline, open
   the extension's Options, set `http://127.0.0.1:8000` and click Save.
3. **Turn on the link guard.** In Options, tick **Check links before they open**. Chrome asks to allow access to
   all sites: allow it. Expect "Link guard is on…" and an `ON` badge on the toolbar icon.
4. **Trigger a warning.** Open the test page *in a new tab* (the guard only runs on pages loaded after it was
   turned on) and click **High-risk test link**. Expect the tab to switch to the SafeCircle warning page with
   "High risk: this link shows strong scam warning signs", the evidence, and a disabled **Open anyway** button.
5. **Go back.** Click **Go back (recommended)**. Expect to return to the test page with no request to the
   `.example` address.
6. **Acknowledgement.** Click the high-risk link again. Check that **Open anyway** stays disabled until you tick
   "I understand the warning signs…". Tick it and click Open anyway. Expect Chrome to try the `.example` address
   and show "This site can't be reached" (the domain does not exist, by design).
7. **Medium risk.** Click **Medium-risk test link**. Expect the caution page ("Caution: this link shows warning
   signs"), no tick box, and **Open anyway** enabled.
8. **New tab.** Click **High-risk test link, new tab**. Expect the warning to open in a new tab and **Go back**
   to close that tab.
9. **Safe navigation.** Click **Safe link (example.com)**. Expect example.com to open with no warning page and
   no noticeable delay. Click **Same-site link**. Expect it to jump within the page.
10. **No unexpected transmission.** In `chrome://extensions`, open **Inspect views: service worker** and select the
    Network tab. Repeat steps 4 and 9. Expect requests only to `http://127.0.0.1:8000/api/v1/analyze/url`, one per
    new cross-site link (repeats within 10 minutes are cached), carrying only `{"url": …}`. There should be none
    for the same-site link and no request containing page text. In the API terminal, the log lines should show
    the path and status only, not the URL.
11. **Server down.** Stop the API (Ctrl+C) and click **Safe link**. Expect the link to open, with a `?` badge whose
    tooltip says "Not checked: the SafeCircle server could not be reached…".
12. **Turn it off.** In Options, untick the link guard. Expect the `ON` badge to disappear and site access to be
    removed on the extension's Details page.

## Record

| Step | Result (pass / fail / note) | Chrome version | Date |
|---|---|---|---|
| 1 Load unpacked | NOT VERIFIED | | |
| 2 Server online | NOT VERIFIED | | |
| 3 Link guard on | NOT VERIFIED | | |
| 4 High-risk warning | NOT VERIFIED | | |
| 5 Go back | NOT VERIFIED | | |
| 6 Acknowledgement gate | NOT VERIFIED | | |
| 7 Medium risk | NOT VERIFIED | | |
| 8 New tab | NOT VERIFIED | | |
| 9 Safe and same-site navigation | NOT VERIFIED | | |
| 10 Network traffic | NOT VERIFIED | | |
| 11 Server down | NOT VERIFIED | | |
| 12 Turn off | NOT VERIFIED | | |
