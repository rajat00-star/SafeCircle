export default function ExtensionPage() {
  return (
    <div className="stack">
      <div>
        <h1>Browser extension</h1>
        <p className="lead">Check links and selected text from any web page with a right-click, and check the page you are on with one click. The extension only acts when you ask it to.</p>
      </div>
      <div className="grid2">
        <div className="card stack">
          <h2>Install (Chrome, Edge, Brave)</h2>
          <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Download the <span className="kbd">extension</span> folder from the project repository (or the release zip) and unzip it.</li>
            <li>Open <span className="kbd">chrome://extensions</span> and switch on <strong>Developer mode</strong>.</li>
            <li>Click <strong>Load unpacked</strong> and choose the folder.</li>
            <li>Open the extension's options and set the server address to this site's address.</li>
          </ol>
          <p className="small muted" style={{ margin: 0 }}>It is not yet published in the Chrome Web Store.</p>
        </div>
        <div className="card stack">
          <h2>What it can and can't see</h2>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            <li><strong>Right-click a link</strong> → “Check this link with SafeCircle”.</li>
            <li><strong>Select text</strong> → “Check selected text with SafeCircle”.</li>
            <li><strong>Toolbar button</strong> → checks the address of the current tab.</li>
            <li>It requests no access to your pages' content and does not run in the background on sites you visit.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
