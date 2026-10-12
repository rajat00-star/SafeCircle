import PageHeader from "@/components/PageHeader";

export default function ExtensionPage() {
  return (
    <div className="container stack">
      <PageHeader index="04 / Browser protection" eyebrow="Guardian Shield · Manifest V3 · Chrome, Edge, Brave" title={"Guardian\nshield"}
        lead="Check a link or selected text before you act on it. With the optional link guard, links you click to other sites are checked first, and a risky one opens a warning page with a clear way back." />
      <div className="grid2">
        <div className="card stack">
          <span className="label-caps">What it does</span><h2 style={{ margin: 0 }}>Before you click, pay or share a code</h2>
          <ul className="small arrows">
            <li><strong>Right-click a link</strong> → “Check this link with SafeCircle”. Risky links show the evidence, a <strong>Go back</strong> button and an
              <strong> Open anyway</strong> button. High-risk links need a ticked acknowledgement before they open.</li>
            <li><strong>Select text</strong> → “Check selected text with SafeCircle” for SMS or WhatsApp messages you read on the web.</li>
            <li><strong>Toolbar button</strong> → checks the current tab&apos;s address and shows whether your SafeCircle server is online.</li>
            <li><strong>Link guard (optional, off by default)</strong> → when you click a link to another site, it is checked first. Low risk opens
              normally; warnings replace the navigation with the warning page.</li>
          </ul>
        </div>
        <div className="card stack">
          <span className="label-caps">Honest states</span><h2 style={{ margin: 0 }}>Checked, or not checked</h2>
          <ul className="small arrows">
            <li>Every result says whether it came from a <strong>completed analysis</strong> or whether the service was <strong>unavailable</strong>.</li>
            <li>Timeouts, offline servers, rate limits and unexpected responses are shown as “Not checked”, never as “safe”.</li>
            <li>If the server is down, the link guard lets links open (so browsing never breaks) and the toolbar shows “?” with the reason.</li>
            <li>The extension never fills forms, approves payments, enters credentials or opens anything you didn&apos;t choose.</li>
          </ul>
        </div>
      </div>
      <div className="grid2">
        <div className="card stack">
          <span className="label-caps">Install for the demo</span><h2 style={{ margin: 0 }}>Load it unpacked</h2>
          <ol className="steps">
            <li>Start the SafeCircle server (it listens on <span className="kbd">http://127.0.0.1:8000</span> by default).</li>
            <li>Open <span className="kbd">chrome://extensions</span> and switch on <strong>Developer mode</strong>.</li>
            <li>Click <strong>Load unpacked</strong> and choose the repository&apos;s <span className="kbd">extension</span> folder.</li>
            <li>Open the extension&apos;s Options to change the server address, the timeout, or to turn on the link guard.</li>
          </ol>
          <p className="small muted" style={{ margin: 0 }}>It is not published in the Chrome Web Store.</p>
        </div>
        <div className="card stack">
          <span className="label-caps">Permissions</span><h2 style={{ margin: 0 }}>What it can and can&apos;t see</h2>
          <ul className="small arrows">
            <li>By default: context menus, the active tab&apos;s address when you open the popup, and its own settings. No access to page content.</li>
            <li>Link guard: asks Chrome for access to websites only when you switch it on, and gives it back when you switch it off. It reads the address
              of the link you click, nothing else on the page.</li>
            <li>No browsing history, form contents, passwords, OTPs or payment details are read or collected.</li>
            <li>It cannot see SMS, WhatsApp or banking apps, and it does not monitor UPI or bank transactions.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
