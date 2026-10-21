importScripts("abs-match.js");

const InfohashAbs = globalThis.InfohashAbs;

const ABS_SETTINGS_DEFAULTS = {
  absServerUrl: "",
  absApiKey: ""
};

const SEARCH_LIMIT = 15;
const AUTHOR_LOOKUP_LIMIT = 4;
const REQUEST_TIMEOUT_MS = 15000;

function absError(status) {
  if (status === 401 || status === 403) {
    return "Audiobookshelf rejected the API key.";
  }

  return `Audiobookshelf returned ${status}.`;
}

async function absFetch(serverUrl, apiKey, path) {
  let response;

  try {
    response = await fetch(`${serverUrl}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new Error("Could not reach the Audiobookshelf server.");
  }

  if (!response.ok) {
    throw new Error(absError(response.status));
  }

  return response.json();
}

async function readAbsSettings() {
  const stored = await chrome.storage.local.get(ABS_SETTINGS_DEFAULTS);
  const serverUrl = InfohashAbs.normalizeServerUrl(stored.absServerUrl);
  const apiKey = String(stored.absApiKey || "").trim();

  if (serverUrl === null) {
    return { ok: false, error: "The saved Audiobookshelf server URL is not valid." };
  }

  if (!serverUrl || !apiKey) {
    return { ok: false, error: "Save the Audiobookshelf server and API key in the extension popup." };
  }

  return { ok: true, serverUrl, apiKey };
}

async function bookLibraries(serverUrl, apiKey) {
  const payload = await absFetch(serverUrl, apiKey, "/api/libraries");
  const libraries = Array.isArray(payload?.libraries) ? payload.libraries : [];

  return libraries.filter(library => library && library.mediaType === "book" && library.id);
}

async function searchBooks(serverUrl, apiKey, libraryId, query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];

  const payload = await absFetch(
    serverUrl,
    apiKey,
    `/api/libraries/${encodeURIComponent(libraryId)}/search?q=${encodeURIComponent(trimmed)}&limit=${SEARCH_LIMIT}`
  );

  return (payload?.book || [])
    .map(match => match?.libraryItem)
    .filter(Boolean);
}

async function booksForMatchingAuthors(serverUrl, apiKey, libraryId, pageAuthors) {
  const books = [];

  for (const authorName of pageAuthors.slice(0, AUTHOR_LOOKUP_LIMIT)) {
    const payload = await absFetch(
      serverUrl,
      apiKey,
      `/api/libraries/${encodeURIComponent(libraryId)}/search?q=${encodeURIComponent(authorName)}&limit=5`
    );

    const authors = (payload?.authors || []).filter(author =>
      author?.id && InfohashAbs.authorsLikelyMatch([authorName], author.name)
    );

    for (const author of authors.slice(0, 2)) {
      const authorPayload = await absFetch(
        serverUrl,
        apiKey,
        `/api/authors/${encodeURIComponent(author.id)}?include=items`
      );
      const items = Array.isArray(authorPayload?.libraryItems)
        ? authorPayload.libraryItems
        : [];
      books.push(...items);
    }
  }

  return books;
}

async function findDuplicates(title, authors) {
  const settings = await readAbsSettings();
  if (!settings.ok) return settings;

  const pageTitle = String(title || "").trim().slice(0, 300);
  const pageAuthors = (Array.isArray(authors) ? authors : [])
    .filter(author => typeof author === "string")
    .map(author => author.trim())
    .filter(Boolean)
    .slice(0, AUTHOR_LOOKUP_LIMIT);

  if (!pageTitle) {
    return { ok: false, error: "This page has no title to check." };
  }

  const libraries = await bookLibraries(settings.serverUrl, settings.apiKey);
  if (!libraries.length) {
    return { ok: false, error: "No book library was found on that server." };
  }

  const items = [];

  for (const library of libraries) {
    items.push(...await searchBooks(settings.serverUrl, settings.apiKey, library.id, pageTitle));
    items.push(...await booksForMatchingAuthors(
      settings.serverUrl,
      settings.apiKey,
      library.id,
      pageAuthors
    ));
  }

  const matches = InfohashAbs.selectDuplicateMatches(pageTitle, pageAuthors, items)
    .map(match => ({
      ...match,
      itemUrl: `${settings.serverUrl}/item/${encodeURIComponent(match.id)}`
    }));

  return { ok: true, matches };
}

async function testConnection(serverUrlInput, apiKeyInput) {
  const serverUrl = InfohashAbs.normalizeServerUrl(serverUrlInput);
  const apiKey = String(apiKeyInput || "").trim();

  if (serverUrl === null) {
    return { ok: false, error: "Enter a valid http or https server URL." };
  }

  if (!serverUrl || !apiKey) {
    return { ok: false, error: "Enter a server URL and API key." };
  }

  const libraries = await bookLibraries(serverUrl, apiKey);
  if (!libraries.length) {
    return { ok: false, error: "Connected, but no book library was found." };
  }

  const names = libraries.map(library => library.name || library.id);
  return {
    ok: true,
    message: `Connected to ${names.length === 1 ? "book library" : "book libraries"}: ${names.join(", ")}.`
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "abs-check") {
    findDuplicates(message.title, message.authors)
      .then(sendResponse)
      .catch(error => {
        sendResponse({ ok: false, error: error.message || "Lookup failed." });
      });
    return true;
  }

  if (message.type === "abs-test") {
    testConnection(message.serverUrl, message.apiKey)
      .then(sendResponse)
      .catch(error => {
        sendResponse({ ok: false, error: error.message || "Connection test failed." });
      });
    return true;
  }
});
