import type { Config, FieldMapping, ImageSize, Painting } from "../types";
import { AnkiConnectError, getDeckNames, getModelNames, getModelFieldNames, checkVersion } from "../ankiconnect";

// All painting fields available for mapping, including image.
const PAINTING_FIELDS: { key: keyof Painting; label: string }[] = [
  { key: "title",         label: "Title" },
  { key: "artist",        label: "Artist" },
  { key: "originalTitle", label: "Original Title" },
  { key: "displayDate",   label: "Date (display)" },
  { key: "sortDate",      label: "Date (sort)" },
  { key: "location",      label: "Location" },
  { key: "style",         label: "Style" },
  { key: "period",        label: "Period" },
  { key: "genre",         label: "Genre" },
  { key: "medium",        label: "Medium" },
  { key: "currentLocation", label: "Current Location" },
  { key: "imageUrl",        label: "Artwork (image)" },
  { key: "copyright",       label: "Copyright" },
  { key: "lastEdit",        label: "Last Edit" },
  { key: "pageUrl",         label: "Page URL" },
];

// --- DOM refs ---

const elAnkiStatus  = document.getElementById("anki-status")!;
const btnRetry      = document.getElementById("btn-retry")     as HTMLButtonElement;
const selDeck       = document.getElementById("sel-deck")      as HTMLSelectElement;
const selModel      = document.getElementById("sel-model")     as HTMLSelectElement;
const selImageSize  = document.getElementById("sel-image-size") as HTMLSelectElement;
const mappingBody   = document.getElementById("mapping-body")!;
const btnSave       = document.getElementById("btn-save")      as HTMLButtonElement;
const elSaveStatus  = document.getElementById("save-status")!;

// --- Helpers ---

function setAnkiStatus(msg: string, kind: "ok" | "error" | "loading"): void {
  elAnkiStatus.textContent = msg;
  elAnkiStatus.className = kind;
  btnRetry.style.display = kind === "error" ? "block" : "none";
}

function populateSelect(sel: HTMLSelectElement, options: string[], placeholder?: string): void {
  sel.innerHTML = "";
  if (placeholder) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    sel.appendChild(opt);
  }
  for (const name of options) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
}

function buildMappingRows(modelFields: string[], existingMapping: FieldMapping): void {
  mappingBody.innerHTML = "";

  const paintingOptions = PAINTING_FIELDS
    .map(f => `<option value="${f.key}">${f.label}</option>`)
    .join("");

  for (const ankiField of modelFields) {
    const selected = existingMapping[ankiField] ?? "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ankiField}</td>
      <td>
        <select data-anki-field="${ankiField}">
          <option value="">(leave empty)</option>
          ${paintingOptions}
        </select>
      </td>
    `;
    const sel = tr.querySelector("select")!;
    sel.value = selected;
    mappingBody.appendChild(tr);
  }
}

function readMapping(): FieldMapping {
  const mapping: FieldMapping = {};
  for (const sel of mappingBody.querySelectorAll<HTMLSelectElement>("select[data-anki-field]")) {
    if (sel.value) {
      mapping[sel.dataset.ankiField!] = sel.value as keyof Painting;
    }
  }
  return mapping;
}

async function loadConfig(): Promise<Config | null> {
  return new Promise(resolve => {
    chrome.storage.sync.get("config", result => {
      resolve((result.config as Config) ?? null);
    });
  });
}

async function saveConfig(config: Config): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ config }, resolve);
  });
}

// --- Init ---

async function init(): Promise<void> {
  setAnkiStatus("Connecting to AnkiConnect…", "loading");
  selDeck.disabled = true;
  selModel.disabled = true;
  btnSave.disabled = true;

  // 1. Check AnkiConnect
  try {
    await checkVersion();
    setAnkiStatus("AnkiConnect connected.", "ok");
  } catch (err) {
    const msg = err instanceof AnkiConnectError ? err.message : "Cannot reach AnkiConnect.";
    setAnkiStatus(msg, "error");
    return;
  }

  // 2. Load existing config
  const existing = await loadConfig();

  // 3. Populate decks
  let decks: string[];
  try {
    decks = (await getDeckNames()).sort();
  } catch (err) {
    setAnkiStatus(err instanceof AnkiConnectError ? err.message : "Failed to load decks.", "error");
    return;
  }
  populateSelect(selDeck, decks, "— select deck —");
  selDeck.disabled = false;
  if (existing?.deckName) selDeck.value = existing.deckName;

  // 4. Populate models
  let models: string[];
  try {
    models = (await getModelNames()).sort();
  } catch (err) {
    setAnkiStatus(err instanceof AnkiConnectError ? err.message : "Failed to load notetypes.", "error");
    return;
  }
  populateSelect(selModel, models, "— select notetype —");
  selModel.disabled = false;
  if (existing?.modelName) selModel.value = existing.modelName;

  // 5. Restore image size
  if (existing?.imageSize) selImageSize.value = existing.imageSize;

  // 6. Load fields for current model
  async function onModelChange(): Promise<void> {
    const modelName = selModel.value;
    if (!modelName) {
      mappingBody.innerHTML = "<tr><td colspan='2' style='color:#666;padding:8px 0'>Select a notetype to configure mapping.</td></tr>";
      btnSave.disabled = true;
      return;
    }
    let fields: string[];
    try {
      fields = await getModelFieldNames(modelName);
    } catch (err) {
      setAnkiStatus(err instanceof AnkiConnectError ? err.message : "Failed to load fields.", "error");
      return;
    }
    buildMappingRows(fields, existing?.fieldMapping ?? {});
    btnSave.disabled = false;
  }

  selModel.addEventListener("change", onModelChange);
  if (selModel.value) await onModelChange();

  // 7. Save
  btnSave.addEventListener("click", async () => {
    if (!selDeck.value) {
      elSaveStatus.textContent = "Please select a deck.";
      elSaveStatus.className = "error";
      return;
    }
    if (!selModel.value) {
      elSaveStatus.textContent = "Please select a notetype.";
      elSaveStatus.className = "error";
      return;
    }

    const config: Config = {
      deckName:     selDeck.value,
      modelName:    selModel.value,
      fieldMapping: readMapping(),
      imageSize:    selImageSize.value as ImageSize,
    };

    try {
      await saveConfig(config);
      elSaveStatus.textContent = "Saved.";
      elSaveStatus.className = "ok";
    } catch {
      elSaveStatus.textContent = "Failed to save.";
      elSaveStatus.className = "error";
    }
  });
}

btnRetry.addEventListener("click", init);

init();
