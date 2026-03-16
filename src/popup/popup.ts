import type { Painting, MessageToContent, MessageFromContent, Config, ImageSize } from "../types";
import { AnkiConnectError, storeMediaFile, addNote, checkVersion } from "../ankiconnect";

// --- DOM refs ---

const elLoading          = document.getElementById("loading")!;
const elStatusBar        = document.getElementById("status-bar")!;
const elStatusText       = document.getElementById("status-text")!;
const elFields           = document.getElementById("fields")!;
const elPreview          = document.getElementById("image-preview") as HTMLImageElement;
const btnAdd             = document.getElementById("btn-add") as HTMLButtonElement;
const btnOptions         = document.getElementById("btn-options") as HTMLButtonElement;
const btnSwitchLanguage  = document.getElementById("btn-switch-language") as HTMLButtonElement;

const fieldInputs: Record<keyof Omit<Painting, "imageUrl">, HTMLInputElement> = {
  title:         document.getElementById("f-title")         as HTMLInputElement,
  artist:        document.getElementById("f-artist")        as HTMLInputElement,
  originalTitle: document.getElementById("f-originalTitle") as HTMLInputElement,
  displayDate:   document.getElementById("f-displayDate")   as HTMLInputElement,
  sortDate:      document.getElementById("f-sortDate")      as HTMLInputElement,
  location:      document.getElementById("f-location")      as HTMLInputElement,
  style:         document.getElementById("f-style")         as HTMLInputElement,
  period:        document.getElementById("f-period")        as HTMLInputElement,
  genre:         document.getElementById("f-genre")         as HTMLInputElement,
  medium:        document.getElementById("f-medium")        as HTMLInputElement,
  copyright:     document.getElementById("f-copyright")     as HTMLInputElement,
  lastEdit:      document.getElementById("f-lastEdit")      as HTMLInputElement,
};

// --- Status helpers ---

function setStatus(message: string, kind: "error" | "warning" | "info", showSwitchButton = false): void {
  elStatusText.textContent = message;
  elStatusBar.className = kind;
  btnSwitchLanguage.style.display = showSwitchButton ? "block" : "none";
}

function clearStatus(): void {
  elStatusText.textContent = "";
  elStatusBar.className = "";
  btnSwitchLanguage.style.display = "none";
}

// --- Image URL helpers ---

function stripImageSuffix(url: string): string {
  return url.replace(/![^.]+\.[a-z]+$/i, "");
}

function makeImageUrl(base: string, size: ImageSize): string {
  if (size === "Original") return base;
  const suffixMap: Record<Exclude<ImageSize, "Original">, string> = {
    Portrait: "Portrait",
    Blog:     "Blog",
    Large:    "Large",
    HD:       "HD",
  };
  return `${base}!${suffixMap[size]}.jpg`;
}

async function resolveImageUrl(rawSrc: string, size: ImageSize): Promise<string> {
  const base = stripImageSuffix(rawSrc);
  const preferred = makeImageUrl(base, size);
  if (size === "Original") return preferred;

  const resp = await fetch(preferred, { method: "HEAD" });
  if (resp.ok) return preferred;
  // Fall back to original
  return base;
}

// --- Populate form ---

function populateForm(painting: Painting): void {
  elLoading.style.display = "none";
  elFields.style.display = "";

  const skipHighlight = new Set<keyof Painting>(["originalTitle", "location", "medium", "period", "lastEdit"]);

  for (const [key, input] of Object.entries(fieldInputs) as [keyof Omit<Painting, "imageUrl">, HTMLInputElement][]) {
    const val = painting[key];
    input.value = val ?? "";
    input.classList.toggle("missing", val === null && !skipHighlight.has(key));
  }

  if (painting.imageUrl) {
    elPreview.src = painting.imageUrl;
    elPreview.style.display = "block";
  }

  btnAdd.disabled = false;
}

// --- Load config ---

async function loadConfig(): Promise<Config | null> {
  return new Promise(resolve => {
    chrome.storage.sync.get("config", result => {
      resolve((result.config as Config) ?? null);
    });
  });
}

// --- Add to Anki ---

async function handleAdd(painting: Painting, config: Config): Promise<void> {
  btnAdd.disabled = true;
  clearStatus();

  try {
    // Resolve and store image if it's used in any mapped field
    const imageIsMapped = Object.values(config.fieldMapping).includes("imageUrl");
    let storedFilename: string | null = null;
    if (painting.imageUrl && imageIsMapped) {
      const resolvedUrl = await resolveImageUrl(painting.imageUrl, config.imageSize);
      const artistSlug = (painting.artist ?? "unknown").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const titleSlug  = (painting.title  ?? "unknown").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const filename = `${artistSlug}_${titleSlug}.jpg`;
      storedFilename = await storeMediaFile(resolvedUrl, filename);
    }

    // Build Anki fields from mapping (ankiField → paintingKey)
    const currentValues: Painting = {
      title:         fieldInputs.title.value         || null,
      artist:        fieldInputs.artist.value        || null,
      originalTitle: fieldInputs.originalTitle.value || null,
      displayDate:   fieldInputs.displayDate.value   || null,
      sortDate:      fieldInputs.sortDate.value      || null,
      location:      fieldInputs.location.value      || null,
      style:         fieldInputs.style.value         || null,
      period:        fieldInputs.period.value        || null,
      genre:         fieldInputs.genre.value         || null,
      medium:        fieldInputs.medium.value        || null,
      imageUrl:      painting.imageUrl,
      copyright:     fieldInputs.copyright.value     || null,
      lastEdit:      fieldInputs.lastEdit.value      || null,
    };

    const fields: Record<string, string> = {};
    for (const [ankiField, paintingKey] of Object.entries(config.fieldMapping)) {
      if (paintingKey === "imageUrl") {
        if (storedFilename) fields[ankiField] = `<img src="${storedFilename}">`;
      } else {
        fields[ankiField] = currentValues[paintingKey] ?? "";
      }
    }

    await addNote(config.deckName, config.modelName, fields);
    setStatus("Added to Anki!", "info");
  } catch (err) {
    const msg = err instanceof AnkiConnectError ? err.message : "Unexpected error.";
    setStatus(msg, "error");
    btnAdd.disabled = false;
  }
}

// --- Init ---

async function init(): Promise<void> {
  btnOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Check config first
  const config = await loadConfig();
  if (!config) {
    elLoading.style.display = "none";
    setStatus("Not configured. Click ⚙ to set up.", "warning");
    return;
  }

  // Check AnkiConnect is reachable
  try {
    await checkVersion();
  } catch {
    elLoading.style.display = "none";
    setStatus("Cannot reach AnkiConnect. Is Anki running?", "error");
    return;
  }

  // Ask content script for painting data
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) {
    elLoading.style.display = "none";
    setStatus("Cannot identify active tab.", "error");
    return;
  }

  // Check the page is on wikiart.org in English
  const tabUrl = tab.url ?? "";
  const langMatch = tabUrl.match(/wikiart\.org\/([a-z]{2})\//);
  if (langMatch && langMatch[1] !== "en") {
    elLoading.style.display = "none";
    setStatus("WikiArt is not in English — extraction requires the English version.", "warning", true);
    btnSwitchLanguage.addEventListener("click", () => {
      const englishUrl = tabUrl.replace(/wikiart\.org\/[a-z]{2}\//, "wikiart.org/en/");
      chrome.tabs.update(tab.id!, { url: englishUrl });
      window.close();
    });
    return;
  }

  let response: MessageFromContent;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAINTING_DATA" } satisfies MessageToContent);
  } catch (err) {
    console.error("[wikiart-anki] sendMessage failed (content script not injected?):", err);
    elLoading.style.display = "none";
    setStatus("Failed to connect to page — try refreshing.", "warning");
    return;
  }

  if (response.type === "NOT_A_PAINTING_PAGE") {
    console.warn("[wikiart-anki] Content script says: not a painting page. URL:", tab.url);
    elLoading.style.display = "none";
    setStatus("Failed to recognize as a WikiArt painting page.", "warning");
    return;
  }

  if (response.type === "EXTRACTION_FAILED") {
    elLoading.style.display = "none";
    setStatus(response.reason, "error");
    return;
  }

  // PAINTING_DATA
  populateForm(response.data);
  clearStatus();

  btnAdd.addEventListener("click", () => handleAdd(response.data, config));
}

init();
