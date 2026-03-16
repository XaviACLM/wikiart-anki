# wikiart-anki Chrome Extension — Project Spec

## Overview

A Chrome extension that adds paintings from WikiArt to Anki with one click.

---

## Tech Stack

- **Language**: TypeScript
- **Build**: esbuild (bundles each entry point into a single JS file — required because Chrome content scripts cannot use ES modules)
- **Typecheck**: tsc --noEmit
- **Lint**: eslint
- **Extension standard**: Chrome Manifest V3
- **Anki integration**: AnkiConnect (local HTTP API on port 8765)
- **No frameworks**: vanilla HTML/CSS/JS for all UI

---

## Extension Structure

```
src/
  content.ts        # Runs on WikiArt pages — extracts painting data, responds to popup messages
  popup/
    popup.html
    popup.ts        # Review UI: requests data from content script, calls AnkiConnect, confirms
  options/
    options.html
    options.ts      # Config UI: deck, notetype, field mapping; calls AnkiConnect
  types.ts          # Shared type definitions
  ankiconnect.ts    # AnkiConnect API wrapper (used by popup.ts and options.ts)
manifest.json
```

No background service worker needed. The popup calls AnkiConnect directly via `fetch` (`http://localhost:8765` covered by `host_permissions`) and messages the content script directly via `chrome.tabs.sendMessage`. All three entry points (`content.ts`, `popup.ts`, `options.ts`) are bundled by esbuild into self-contained JS files, so cross-file imports work freely and content scripts have no ES module issues.

---

## Internal Painting Data Model

```typescript
interface Painting {
  title: string | null;
  artist: string | null;
  originalTitle: string | null;
  displayDate: string | null;   // raw date string as shown on WikiArt, e.g. "c. 1300 BC"
  sortDate: string | null;      // best-effort numeric year offset by +200000 for lex sorting
  location: string | null;
  style: string | null;
  period: string | null;
  genre: string | null;
  medium: string | null;
  imageUrl: string | null;
  copyright: string | null;
  lastEdit: string | null;
}
```

Each field is nullable — extraction failures produce `null`, not crashes or empty strings. The review popup visually flags `null` fields (except soft fields: `originalTitle`, `location`, `medium`, `period`) so the user knows to fill them in manually.

`sortDate` is computed from `displayDate` by stripping circa prefixes, extracting the first 3–4 digit year, negating for BC/BCE, and adding 200000. Fails gracefully to `null` for unparseable dates (e.g. "XIX-XX cent").

---

## WikiArt Data Extraction

**Target pages**: painting detail pages only (e.g. `wikiart.org/en/{artist}/{painting}`). The content script matches all language variants (`/*/*/*`) and extraction is language-agnostic; the popup detects non-English pages and shows a "Switch to English" button that redirects the tab before extraction.
**Extensibility**: extraction logic is isolated in `content.ts` behind a clear interface so artist pages or other page types can be added later without restructuring.

**Method**: DOM scraping. The page is Angular (client-side rendered) but content scripts run after full load, so the DOM is fully populated. See RESEARCH.md for selectors.

The page uses Schema.org microdata (`itemprop` attributes) for several fields, making those selectors more stable than class-based ones. Fields without microdata use the consistent `//li[.//s[contains(.,'FIELDNAME:')]]` pattern. Copyright and lastEdit live in the aside rather than the main article and are extracted via `querySelector`.

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
- `null` fields are visually highlighted (soft fields excepted)
- Image shown as a small preview (from `imageUrl`)
- "Add to Anki" button submits to AnkiConnect
- Clear error messaging if AnkiConnect is unreachable or Anki is not running
- If the active tab is a non-English WikiArt painting page, shows a warning with a "Switch to English" button that redirects the tab to the `/en/` equivalent (extraction requires English labels)

---

## Config (Options Page)

Stored in `chrome.storage.sync`.

**Steps:**
1. AnkiConnect connection check (shown prominently — retry button if error)
2. Deck selection (dropdown, populated via `deckNames`)
3. Notetype selection (dropdown, populated via `modelNames`)
4. Field mapping: for each notetype field, a dropdown mapping to a `Painting` field — includes a "leave empty" option
5. Save button (validates before saving)

**Defaults**: no deck/notetype pre-selected; user must configure before first use.

---

## AnkiConnect Integration

AnkiConnect auto-starts on port 8765 when Anki opens. No special "opening" required.

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
- AnkiConnect wrapper (`ankiconnect.ts`) is isolated and independently testable

---

## Out of Scope

- Automated Anki deck/notetype setup
- Batch adding from artist pages (structure supports it, implementation deferred)
- Syncing or updating existing notes
