const DEFAULT_SETTINGS = {
  bookUrl: "",
  showLastVisitBox: true
};

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

  const status = document.getElementById("status");
  status.textContent = "Saved.";

  setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

document.getElementById("save").addEventListener("click", saveSettings);

loadSettings();