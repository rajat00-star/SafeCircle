// Runs before the module graph: explains the two ways the walkthrough can fail to start.
(function () {
  var text = document.getElementById("loader-text");
  if (location.protocol === "file:") {
    text.textContent = "Open this through a local web server: python3 -m http.server 8090 --bind 127.0.0.1 --directory presentation/site, then visit http://127.0.0.1:8090";
    return;
  }
  window.__bootTimer = setTimeout(function () {
    if (!window.__appReady) text.textContent = "The walkthrough did not start. Reload the page; if it persists, check the browser console and presentation/README.md (Troubleshooting).";
  }, 10000);
  window.addEventListener("error", function (e) {
    if (!window.__appReady) text.textContent = "Could not start: " + (e.message || "script error") + ". See presentation/README.md (Troubleshooting).";
  });
})();
