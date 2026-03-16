import type { Painting, MessageToContent, MessageFromContent, Config, ImageSize } from "../types";
import { AnkiConnectError, storeMediaFile, addNote, checkVersion } from "../ankiconnect";

// --- DOM refs ---

const elLoading         = document.getElementById("loading")!;
const elStatusBar       = document.getElementById("status-bar")!;
const elStatusText      = document.getElementById("status-text")!;
const elFields          = document.getElementById("fields")!;
const elPreview         = document.getElementById("image-preview") as HTMLImageElement;
const btnAdd            = document.getElementById("btn-add") as HTMLButtonElement;
const btnOptions        = document.getElementById("btn-options") as HTMLButtonElement;
const btnSwitchLanguage = document.getElementById("btn-switch-language") as HTMLButtonElement;

// Inputs keyed by Anki field name, populated dynamically from config.fieldMapping
const dynamicInputs = new Map<string, HTMLInputElement>();

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

// --- Build fields ---

function buildFields(painting: Painting, config: Config): void {
  elFields.innerHTML = "";
  dynamicInputs.clear();

  for (const [ankiField, paintingKey] of Object.entries(config.fieldMapping)) {
    if (paintingKey === "imageUrl") continue; // shown via image preview, not a text input

    const val = painting[paintingKey];

    const row = document.createElement("div");
    row.className = "field-row";

    const label = document.createElement("label");
    label.textContent = ankiField;

    const input = document.createElement("input");
    input.type = "text";
    input.value = val ?? "";
    input.classList.toggle("missing", val === null);

    row.appendChild(label);
    row.appendChild(input);
    elFields.appendChild(row);
    dynamicInputs.set(ankiField, input);
  }

  elLoading.style.display = "none";
  elFields.style.display = "";

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

    // Build Anki fields from dynamic inputs and image mapping
    const fields: Record<string, string> = {};
    for (const [ankiField, paintingKey] of Object.entries(config.fieldMapping)) {
      if (paintingKey === "imageUrl") {
        if (storedFilename) fields[ankiField] = `<img src="${storedFilename}">`;
      } else {
        fields[ankiField] = dynamicInputs.get(ankiField)?.value ?? "";
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
  buildFields(response.data, config);
  clearStatus();

  btnAdd.addEventListener("click", () => handleAdd(response.data, config));
}

init();
