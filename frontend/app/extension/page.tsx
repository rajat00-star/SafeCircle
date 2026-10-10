import PageHeader from "@/components/PageHeader";

export default function ExtensionPage() {
  return (
    <div className="container stack">
      <PageHeader index="06 / Extension" eyebrow="Manifest V3 · Chrome, Edge, Brave" title={"Browser\nextension"}
        lead="Check links and selected text from any web page with a right-click, and check the page you are on with one click. The extension only acts when you ask it to." />
      <div className="grid2">
        <div className="card stack">
          <span className="label-caps">Install</span><h2 style={{ margin: 0 }}>Chrome, Edge, Brave</h2>
          <ol className="steps">
            <li>Download the <span className="kbd">extension</span> folder from the project repository (or the release zip) and unzip it.</li>
            <li>Open <span className="kbd">chrome://extensions</span> and switch on <strong>Developer mode</strong>.</li>
            <li>Click <strong>Load unpacked</strong> and choose the folder.</li>
            <li>Open the extension's options and set the server address to this site's address.</li>
          </ol>
          <p className="small muted" style={{ margin: 0 }}>It is not yet published in the Chrome Web Store.</p>
        </div>
        <div className="card stack">
          <span className="label-caps">Permissions</span><h2 style={{ margin: 0 }}>What it can and can't see</h2>
          <ul className="small arrows">
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
