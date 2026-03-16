# wikiart-anki Chrome Extension — Project Spec

## Overview

A Chrome extension that adds a button to WikiArt painting detail pages. Clicking it extracts the painting's metadata and image, shows a review popup where the user can edit fields before confirming, then creates a note in Anki via AnkiConnect.

---

## Tech Stack

- **Language**: TypeScript
- **Build & typecheck**: tsc (already in project)
- **Lint**: eslint (already in project)
- **Extension standard**: Chrome Manifest V3
- **Anki integration**: AnkiConnect (local HTTP API on port 8765)
- **No frameworks**: vanilla HTML/CSS/JS for all UI

---

## Extension Structure

```
src/
  content.ts        # Runs on WikiArt pages — extracts data, injects button
  background.ts     # Service worker — handles AnkiConnect fetch calls
  popup/
    popup.html
    popup.ts        # Review UI: shows extracted fields, user edits, confirms
  options/
    options.html
    options.ts      # Config UI: deck, notetype, field mapping
  types.ts          # Shared type definitions
  ankiconnect.ts    # AnkiConnect API wrapper (used by background.ts)
manifest.json
```

`content.ts` and `background.ts` are kept self-contained (no cross-file imports) so tsc can compile them without a bundler.

---

## Internal Painting Data Model

```typescript
interface Painting {
  title: string | null;
  artist: string | null;
  originalTitle: string | null;
  date: string | null;
  style: string | null;
  period: string | null;
  genre: string | null;
  medium: string | null;
  imageUrl: string | null;
  // Optional / informational
  copyright: string | null;
  lastEdit: string | null;
  resolution: string | null;
}
```

Each field is nullable — extraction failures produce `null`, not crashes or empty strings. The review popup visually flags `null` fields so the user knows to fill them in manually.

---

## WikiArt Data Extraction

**Target pages**: painting detail pages only (e.g. `wikiart.org/en/{artist}/{painting}`).
**Extensibility**: extraction logic is isolated in `content.ts` behind a clear interface so artist pages or other page types can be added later without restructuring.

**Method**: DOM scraping. The page is Angular (client-side rendered) but content scripts run after full load, so the DOM is fully populated. See RESEARCH.md for XPath selectors.

The page uses Schema.org microdata (`itemprop` attributes) for several fields, making those selectors more stable than class-based ones. Fields without microdata use the consistent `//li[.//s[contains(.,'FIELDNAME:')]]` pattern.

**Circa detection**: light heuristic pass on the `date` field to detect prefixes like "c.", "ca.", "~", "?" and set `circa` accordingly. User can correct in review.

---

## Image Handling

Use AnkiConnect's `storeMediaFile` action, which accepts a URL and downloads the file into Anki's media folder, returning the stored filename. We supply a clean filename derived from `{artist-slug}_{title-slug}.jpg` regardless of the source URL format.

The main painting image is identified in the DOM by `img[itemprop="image"]`. Its `src` is read directly — URLs are never constructed, as the CDN shard number and filename are unpredictable.

WikiArt serves size variants via URL suffixes on the CDN URL. Available options, in ascending size order:

| UI label | WikiArt suffix | Approx. size |
|---|---|---|
| Portrait | `!Portrait.jpg` | max 400px |
| Blog | `!Blog.jpg` | max 500px |
| Large | `!Large.jpg` | max 600–750px |
| HD | `!HD.jpg` | max 1200px |
| Original | *(no suffix)* | full resolution |

The user selects a preferred size in the options page. If the preferred size returns 404, the extension falls back to Original, which always exists.

---

## Review Popup

Triggered by clicking the extension's toolbar button on a WikiArt painting page.

- Shows all `Painting` fields as editable inputs, pre-filled from extraction
- `null` fields are visually highlighted
- Image shown as a small preview (from `imageUrl`)
- "Add to Anki" button submits to AnkiConnect
- Clear error messaging if AnkiConnect is unreachable or Anki is not running

---

## Config (Options Page)

Stored in `chrome.storage.sync`.

**Steps:**
1. AnkiConnect connection check (shown prominently — error if Anki not running)
2. Deck selection (dropdown, populated via `deckNames`)
3. Notetype selection (dropdown, populated via `modelNames`)
4. Field mapping: for each notetype field, a dropdown mapping to a `Painting` field — includes a "leave empty" option
5. Save button (validates before saving)

**Defaults**: no deck/notetype pre-selected; user must configure before first use.

---

## AnkiConnect Integration

AnkiConnect auto-starts on port 8765 when Anki opens. No special "opening" required.

**Required one-time setup by user**: add the extension's origin to AnkiConnect's `webCorsOriginList` in Anki's config. Documented in README.

**Actions used**:
- `deckNames` — populate deck dropdown
- `modelNames` — populate notetype dropdown
- `modelFieldNames` — get fields for selected notetype
- `storeMediaFile` — download and store painting image
- `addNote` — create the note

**Error handling**: all AnkiConnect responses carry an `error` field. Every call checks it and surfaces a human-readable message. Version checked on options page load.

---

## Failure Guards

Guards only at external boundaries:

| Boundary | Guard |
|---|---|
| WikiArt data extraction | Each field extracted independently; `null` on failure; review popup flags missing fields |
| WikiArt page structure change | If extraction yields all-null, show a clear warning: "Could not read page data — the site layout may have changed" |
| AnkiConnect unreachable | Shown in review popup and options page with specific message ("Is Anki running?") |
| AnkiConnect API error | `error` field checked on every response; displayed to user |

---

## Extensibility Notes

- Extraction logic is page-type-aware from the start (`isPaintingPage()`, `isArtistPage()` etc.) even though only painting pages are handled initially
- Field mapping config is generic — adding new internal fields only requires updating the `Painting` type and the options page dropdown
- AnkiConnect wrapper is isolated and independently testable

---

## Out of Scope

- Automated Anki deck/notetype setup
- Batch adding from artist pages (structure supports it, implementation deferred)
- Syncing or updating existing notes

---

## User Setup Requirements (README)

To be written. Will cover:
1. Install AnkiConnect add-on in Anki
2. Add extension origin to AnkiConnect CORS whitelist
3. Create Anki notetype manually (or use an existing one)
4. Configure the extension options page (deck, notetype, field mapping)
