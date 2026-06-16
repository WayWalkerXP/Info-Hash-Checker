(() => {
  const SITE_NAME = "torrent_site";

  const SESSION_TIMEOUT_MINUTES = 30;
  const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;

  function urlMatchesConfiguredBookUrl(currentUrl, bookUrl) {
    if (!bookUrl) return false;
    return currentUrl.startsWith(bookUrl);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function sessionExpired(lastActivityIso) {
    if (!lastActivityIso) return true;

    const lastActivityTime = new Date(lastActivityIso).getTime();

    if (Number.isNaN(lastActivityTime)) {
      return true;
    }

    return Date.now() - lastActivityTime > SESSION_TIMEOUT_MS;
  }

  async function updateVisitSession() {
    const result = await chrome.storage.local.get({
      [`${SITE_NAME}_current_session_started_at`]: null,
      [`${SITE_NAME}_previous_session_started_at`]: null,
      [`${SITE_NAME}_last_activity_at`]: null
    });

    const currentSessionStartedAt =
      result[`${SITE_NAME}_current_session_started_at`];

    const lastActivityAt =
      result[`${SITE_NAME}_last_activity_at`];

    const updates = {
      [`${SITE_NAME}_last_activity_at`]: nowIso()
    };

    if (!currentSessionStartedAt) {
      updates[`${SITE_NAME}_current_session_started_at`] = nowIso();

      console.log("[InfoHash Tracker] Started first session");
    } else if (sessionExpired(lastActivityAt)) {
      updates[`${SITE_NAME}_previous_session_started_at`] =
        currentSessionStartedAt;

      updates[`${SITE_NAME}_current_session_started_at`] = nowIso();

      console.log("[InfoHash Tracker] Started new session");
    } else {
      console.log("[InfoHash Tracker] Continued current session");
    }

    await chrome.storage.local.set(updates);
  }

  async function saveInfoHash(hash) {
    hash = hash.toLowerCase();

    const result = await chrome.storage.local.get({ infoHashes: [] });
    const hashes = new Set(result.infoHashes.map(h => h.toLowerCase()));

    hashes.add(hash);

    await chrome.storage.local.set({
      infoHashes: Array.from(hashes),
      [`${SITE_NAME}_last_magnet_click`]: nowIso()
    });

    console.log("[InfoHash Tracker] Saved info hash:", hash);
  }

  function extractInfoHashFromMagnet(magnetUrl) {
    const match = magnetUrl.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
    return match ? match[1].toLowerCase() : null;
  }

  async function main() {
    const settings = await chrome.storage.local.get({
      bookUrl: ""
    });

    if (!urlMatchesConfiguredBookUrl(window.location.href, settings.bookUrl)) {
      return;
    }

    console.log("[InfoHash Tracker] capture-magnet.js active");

    await updateVisitSession();

    document.addEventListener("click", async (event) => {
      const link = event.target.closest("a[href^='magnet:']");
      if (!link) return;

      const hash = extractInfoHashFromMagnet(link.href);

      if (!hash) {
        console.log("[InfoHash Tracker] Magnet clicked, but no 40-character hash found");
        return;
      }

      await saveInfoHash(hash);
    });
  }

  main();
})();