const DEFAULT_SETTINGS = {
  bookUrl: "",
  showLastVisitBox: true
};

const INFO_HASH_KEY = "infoHashes";
const SESSION_KEYS = {
  previousSessionStartedAt: "torrent_site_previous_session_started_at",
  currentSessionStartedAt: "torrent_site_current_session_started_at",
  lastActivityAt: "torrent_site_last_activity_at",
  lastMagnetClick: "torrent_site_last_magnet_click"
};
const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/;

function showStatus(message, isError = false, clearAfterMs = 0) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.classList.toggle("error", isError);

  if (clearAfterMs > 0) {
    setTimeout(() => {
      status.textContent = "";
      status.classList.remove("error");
    }, clearAfterMs);
  }
}

function normalizeInfoHashes(hashes) {
  if (!Array.isArray(hashes)) {
    return [];
  }

  return Array.from(new Set(
    hashes
      .filter(hash => typeof hash === "string")
      .map(hash => hash.trim().toLowerCase())
      .filter(hash => INFO_HASH_PATTERN.test(hash))
  )).sort();
}

function isValidTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

function getSelectedRestoreMode() {
  const selectedMode = document.querySelector("input[name='restoreMode']:checked");
  return selectedMode ? selectedMode.value : "append";
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

  document.getElementById("bookUrl").value = settings.bookUrl || "";
  document.getElementById("showLastVisitBox").checked =
    Boolean(settings.showLastVisitBox);
}

async function saveSettings() {
  const bookUrl = document.getElementById("bookUrl").value.trim();
  const showLastVisitBox =
    document.getElementById("showLastVisitBox").checked;

  await chrome.storage.local.set({
    bookUrl,
    showLastVisitBox
  });

  showStatus("Saved.", false, 1500);
}

async function exportBackup() {
  try {
    const storedData = await chrome.storage.local.get({
      [INFO_HASH_KEY]: [],
      [SESSION_KEYS.previousSessionStartedAt]: null,
      [SESSION_KEYS.currentSessionStartedAt]: null,
      [SESSION_KEYS.lastActivityAt]: null,
      [SESSION_KEYS.lastMagnetClick]: null
    });

    const exportedAt = new Date();
    const datePart = exportedAt.toISOString().slice(0, 10);
    const backup = {
      schemaVersion: 1,
      exportedAt: exportedAt.toISOString(),
      previousSessionStartedAt: storedData[SESSION_KEYS.previousSessionStartedAt],
      currentSessionStartedAt: storedData[SESSION_KEYS.currentSessionStartedAt],
      lastActivityAt: storedData[SESSION_KEYS.lastActivityAt],
      lastMagnetClick: storedData[SESSION_KEYS.lastMagnetClick],
      infoHashes: normalizeInfoHashes(storedData[INFO_HASH_KEY])
    };

    downloadJsonFile(`infohash-tracker-backup-${datePart}.json`, backup);
    showStatus(`Exported ${backup.infoHashes.length} info hashes.`);
  } catch (error) {
    console.error("[InfoHash Tracker] Backup export failed:", error);
    showStatus("Export failed. Please try again.", true);
  }
}

function parseBackupJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Invalid JSON file.");
  }
}

async function importBackup() {
  const fileInput = document.getElementById("importBackupFile");
  const file = fileInput.files[0];

  if (!file) {
    showStatus("Please choose a backup JSON file to import.", true);
    return;
  }

  try {
    const backup = parseBackupJson(await file.text());

    if (!backup || !Array.isArray(backup.infoHashes)) {
      showStatus("Invalid backup: missing infoHashes array.", true);
      return;
    }

    const importedHashes = normalizeInfoHashes(backup.infoHashes);

    if (importedHashes.length === 0) {
      showStatus("Import failed: no valid 40-character info hashes found.", true);
      return;
    }

    const mode = getSelectedRestoreMode();
    const currentData = await chrome.storage.local.get({ [INFO_HASH_KEY]: [] });
    const currentHashes = normalizeInfoHashes(currentData[INFO_HASH_KEY]);
    const currentHashSet = new Set(currentHashes);
    const newHashesAdded = importedHashes.filter(hash => !currentHashSet.has(hash)).length;
    let finalHashes = importedHashes;

    if (mode === "append") {
      finalHashes = normalizeInfoHashes([...currentHashes, ...importedHashes]);
      await chrome.storage.local.set({ [INFO_HASH_KEY]: finalHashes });
    } else {
      const updates = { [INFO_HASH_KEY]: finalHashes };

      for (const [backupKey, storageKey] of Object.entries(SESSION_KEYS)) {
        if (isValidTimestamp(backup[backupKey])) {
          updates[storageKey] = backup[backupKey];
        }
      }

      await chrome.storage.local.set(updates);
    }

    fileInput.value = "";
    showStatus(
      `Import complete (${mode === "replace" ? "replace" : "append"} mode).\n` +
      `Imported from file: ${importedHashes.length}\n` +
      `New hashes added: ${newHashesAdded}\n` +
      `Final total hashes: ${finalHashes.length}`
    );
  } catch (error) {
    console.error("[InfoHash Tracker] Backup import failed:", error);
    showStatus(error.message || "Import failed. Please try again.", true);
  }
}

document.getElementById("save").addEventListener("click", saveSettings);
document.getElementById("exportBackup").addEventListener("click", exportBackup);
document.getElementById("importBackup").addEventListener("click", importBackup);

loadSettings();
