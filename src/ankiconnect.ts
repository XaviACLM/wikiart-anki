const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
const ANKI_CONNECT_VERSION = 6;

export class AnkiConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiConnectError";
  }
}

async function invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
    });
  } catch {
    throw new AnkiConnectError("Could not reach AnkiConnect. Is Anki running?");
  }

  const json = await response.json() as { result: T; error: string | null };
  if (json.error) {
    throw new AnkiConnectError(`AnkiConnect error: ${json.error}`);
  }
  return json.result;
}

export async function getDeckNames(): Promise<string[]> {
  return invoke<string[]>("deckNames");
}

export async function getModelNames(): Promise<string[]> {
  return invoke<string[]>("modelNames");
}

export async function getModelFieldNames(modelName: string): Promise<string[]> {
  return invoke<string[]>("modelFieldNames", { modelName });
}

export async function storeMediaFile(url: string, filename: string): Promise<string> {
  return invoke<string>("storeMediaFile", { url, filename });
}

export interface NoteFields {
  [field: string]: string;
}

export async function addNote(
  deckName: string,
  modelName: string,
  fields: NoteFields,
): Promise<number> {
  return invoke<number>("addNote", {
    note: {
      deckName,
      modelName,
      fields,
      options: { allowDuplicate: false },
    },
  });
}

export async function checkVersion(): Promise<number> {
  return invoke<number>("version");
}
