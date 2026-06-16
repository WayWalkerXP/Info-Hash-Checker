(() => {
  const SITE_NAME = "torrent_site";

  function urlMatchesConfiguredBookUrl(currentUrl, bookUrl) {
    if (!bookUrl) return false;
    return currentUrl.startsWith(bookUrl);
  }

  function findInfoHashOnPage() {
    const cells = Array.from(document.querySelectorAll("td"));

    for (let i = 0; i < cells.length - 1; i++) {
      const label = cells[i].textContent.trim().toLowerCase();

      if (label === "info hash:") {
        const possibleHash = cells[i + 1].textContent.trim().toLowerCase();

        if (/^[a-f0-9]{40}$/.test(possibleHash)) {
          return possibleHash;
        }
      }
    }

    return null;
  }

  function addDownloadedMarker(pageHash) {
    if (!document.getElementById("infohash-tracker-banner")) {
      const banner = document.createElement("div");
      banner.id = "infohash-tracker-banner";
      banner.textContent = `✓ Previously Downloaded: ${pageHash}`;

      banner.style.backgroundColor = "gold";
      banner.style.color = "black";
      banner.style.padding = "12px";
      banner.style.fontSize = "20px";
      banner.style.fontWeight = "bold";
      banner.style.textAlign = "center";
      banner.style.borderBottom = "2px solid black";

      document.body.insertBefore(banner, document.body.firstChild);
    }

    if (!document.getElementById("infohash-tracker-border")) {
      const border = document.createElement("div");
      border.id = "infohash-tracker-border";

      border.style.position = "fixed";
      border.style.top = "0";
      border.style.left = "0";
      border.style.width = "100vw";
      border.style.height = "100vh";
      border.style.border = "8px solid gold";
      border.style.boxSizing = "border-box";
      border.style.pointerEvents = "none";
      border.style.zIndex = "2147483647";
      border.style.boxShadow = "0 0 20px gold, 0 0 40px gold";

      document.body.appendChild(border);
    }
  }

  function formatDateTime(isoString) {
    if (!isoString) return "Never";

    const date = new Date(isoString);

    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    return date.toLocaleString();
  }

  async function addLastVisitPanel() {
    if (document.getElementById("infohash-tracker-last-visit")) return;

    const result = await chrome.storage.local.get({
      [`${SITE_NAME}_previous_session_started_at`]: null,
      [`${SITE_NAME}_current_session_started_at`]: null,
      [`${SITE_NAME}_last_magnet_click`]: null
    });

    const previousSession =
      result[`${SITE_NAME}_previous_session_started_at`];

    const currentSession =
      result[`${SITE_NAME}_current_session_started_at`];

    const lastMagnetClick =
      result[`${SITE_NAME}_last_magnet_click`];

    const panel = document.createElement("div");
    panel.id = "infohash-tracker-last-visit";

    panel.innerHTML = `
      <div style="font-weight:bold;margin-bottom:6px;color:gold;">
        InfoHash Tracker
      </div>
      <div>
        <strong>Last site visit:</strong><br>
        ${formatDateTime(previousSession)}
      </div>
      <div style="margin-top:8px;">
        <strong>Current session:</strong><br>
        ${formatDateTime(currentSession)}
      </div>
      <div style="margin-top:8px;">
        <strong>Last magnet click:</strong><br>
        ${formatDateTime(lastMagnetClick)}
      </div>
    `;

    panel.style.position = "fixed";
    panel.style.bottom = "20px";
    panel.style.right = "20px";
    panel.style.background = "#222";
    panel.style.color = "#fff";
    panel.style.padding = "10px 14px";
    panel.style.border = "2px solid gold";
    panel.style.borderRadius = "8px";
    panel.style.fontSize = "12px";
    panel.style.fontFamily = "Arial, sans-serif";
    panel.style.zIndex = "2147483647";
    panel.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
    panel.style.maxWidth = "260px";
    panel.style.lineHeight = "1.35";

    document.body.appendChild(panel);
  }

  async function main() {
    const settings = await chrome.storage.local.get({
      bookUrl: "",
      showLastVisitBox: true,
      infoHashes: []
    });

    if (!urlMatchesConfiguredBookUrl(window.location.href, settings.bookUrl)) {
      return;
    }

    console.log("[InfoHash Tracker] check-infohash.js active");

    if (settings.showLastVisitBox) {
      await addLastVisitPanel();
    }

    const pageHash = findInfoHashOnPage();

    if (!pageHash) {
      console.log("[InfoHash Tracker] No info hash found on this page.");
      return;
    }

    console.log("[InfoHash Tracker] Page hash found:", pageHash);

    const hashes = new Set(
      settings.infoHashes.map(h => h.toLowerCase())
    );

    if (hashes.has(pageHash)) {
      addDownloadedMarker(pageHash);
      console.log("[InfoHash Tracker] Previously downloaded:", pageHash);
    } else {
      console.log("[InfoHash Tracker] Not found in stored hashes:", pageHash);
    }
  }

  main();
})();