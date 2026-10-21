globalThis.InfohashAbs = (() => {
  const TITLE_STOP_WORDS = new Set([
    "a", "an", "the", "and", "or", "of", "in", "on", "with", "for", "to", "from", "by"
  ]);

  function normalizeServerUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";

    let url;
    try {
      url = new URL(trimmed);
    } catch (error) {
      return null;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  }

  function foldText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeTitle(value) {
    return foldText(value)
      .replace(/\b(the|a|an)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function significantWords(normalizedTitle) {
    return normalizedTitle
      .split(" ")
      .filter(word => word.length > 1 && !TITLE_STOP_WORDS.has(word));
  }

  function titlesLikelyMatch(pageTitle, libraryTitle) {
    const page = normalizeTitle(pageTitle);
    const library = normalizeTitle(libraryTitle);
    if (!page || !library) return false;
    if (page === library) return true;

    const shorter = page.length <= library.length ? page : library;
    const longer = page.length <= library.length ? library : page;
    if (shorter.length >= 12 && longer.includes(shorter)) return true;

    const pageWords = significantWords(page);
    const libraryWords = significantWords(library);
    const [shorterWords, longerWords] = pageWords.length <= libraryWords.length
      ? [pageWords, libraryWords]
      : [libraryWords, pageWords];

    if (shorterWords.length < 3) return false;
    if (longerWords.length - shorterWords.length > 4) return false;

    const longerSet = new Set(longerWords);
    return shorterWords.every(word => longerSet.has(word));
  }

  function authorsLikelyMatch(pageAuthors, libraryAuthorName) {
    const library = foldText(libraryAuthorName);
    if (!library || !Array.isArray(pageAuthors)) return false;

    return pageAuthors.some(author => {
      const name = foldText(author);
      if (!name) return false;
      if (library === name || library.includes(name) || name.includes(library)) {
        return true;
      }

      const parts = name.split(" ").filter(part => part.length > 1);
      if (parts.length < 2) return false;

      const first = parts[0];
      const last = parts[parts.length - 1];
      return last.length > 2 && library.includes(last) && library.includes(first);
    });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function stripTrailingAuthors(title, authors) {
    const candidates = [];

    if (authors.length > 1) {
      candidates.push(authors.join(", "));
      candidates.push(authors.join(" & "));
    }

    if (authors.length) {
      candidates.push(authors[authors.length - 1]);
    }

    for (const candidate of candidates) {
      const pattern = new RegExp(`\\s+-\\s+${escapeRegExp(candidate)}\\s*$`, "i");
      const next = title.replace(pattern, "").trim();
      if (next && next !== title) return next;
    }

    return title;
  }

  function bookFromLibraryItem(item) {
    const title = item?.media?.metadata?.title || "";
    const authorName = item?.media?.metadata?.authorName || "";
    if (!item?.id || !title) return null;

    return {
      id: item.id,
      title,
      authorName
    };
  }

  function selectDuplicateMatches(pageTitle, pageAuthors, items) {
    const matches = [];
    const seen = new Set();

    for (const item of items) {
      const book = bookFromLibraryItem(item);
      if (!book || seen.has(book.id)) continue;
      if (!titlesLikelyMatch(pageTitle, book.title)) continue;

      seen.add(book.id);
      matches.push({
        ...book,
        authorMatches: authorsLikelyMatch(pageAuthors, book.authorName)
      });
    }

    matches.sort((left, right) => {
      if (left.authorMatches !== right.authorMatches) {
        return left.authorMatches ? -1 : 1;
      }
      return left.title.localeCompare(right.title);
    });

    return matches.slice(0, 8);
  }

  return {
    normalizeServerUrl,
    titlesLikelyMatch,
    authorsLikelyMatch,
    stripTrailingAuthors,
    selectDuplicateMatches
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = globalThis.InfohashAbs;
}
