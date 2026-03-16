export interface Painting {
  title: string | null;
  artist: string | null;
  originalTitle: string | null;
  displayDate: string | null;
  sortDate: string | null;
  location: string | null;
  style: string | null;
  period: string | null;
  genre: string | null;
  medium: string | null;
  imageUrl: string | null;
  copyright: string | null;
  lastEdit: string | null;
}

// Maps an Anki notetype field name → a Painting field key.
// Anki fields absent from this map are left empty.
export type FieldMapping = Record<string, keyof Painting>;

export type ImageSize = "Portrait" | "Blog" | "Large" | "HD" | "Original";

export interface Config {
  deckName: string;
  modelName: string;
  fieldMapping: FieldMapping;
  imageSize: ImageSize;
}

// Messages between popup and content script
export type MessageToContent = { type: "GET_PAINTING_DATA" };
export type MessageFromContent =
  | { type: "PAINTING_DATA"; data: Painting }
  | { type: "NOT_A_PAINTING_PAGE" }
  | { type: "EXTRACTION_FAILED"; reason: string };
