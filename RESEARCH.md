# Research Notes

## WikiArt Data Extraction

### Method: DOM Scraping

The WikiArt painting detail page is Angular (client-side rendered), but a Chrome content script runs after full page load, so the DOM is fully populated. DOM scraping is the right approach.

The page uses Schema.org microdata (`itemprop` attributes) for several fields, which are more stable than arbitrary class names.

### XPath Selectors (painting detail page)

| Field | XPath |
|---|---|
| title | `//article/h3/text()` |
| originalTitle | `//li[.//s[contains(.,'Original Title:')]]` |
| artist | `//article/h5[@itemprop='creator']//span[@itemprop='name']/a/text()` |
| date | `//li[.//s[contains(.,'Date:')]]/span[@itemprop='dateCreated']/text()` |
| style | `//li[.//s[contains(.,'Style:')]]/span/a` |
| genre | `//li[.//s[contains(.,'Genre:')]]/span/a/span[@itemprop='genre']/text()` |
| medium | `//li[.//s[contains(.,'Media:')]]/span/a/text()` |
| image variants | `//ul[@class='image-variants-container']//a/@data-image-url` |

Fields not in the scrapers found (period, copyright, last-edit) likely follow the same `//li[.//s[contains(.,'FIELDNAME:')]]` pattern and should be verified during implementation.

### Image URLs

The main painting `<img>` has `itemprop="image"` (Schema.org microdata) — use that as the primary selector. Its `src` is the live URL of whichever image is currently displayed.

URL format: `https://uploads{N}.wikiart.org/images/{artist-slug}/{filename}.jpg[!SUFFIX.jpg]`

- The CDN shard number (`uploads6`, etc.) is unpredictable — do not construct URLs, always read `src` directly from the DOM.
- The filename can include suffixes like `(1)` for duplicates — same reason to read from DOM, never construct.
- Strip any existing `!SUFFIX.jpg` from the src to get the base URL, then append the desired suffix.

The `image-variants-container` element exists on some paintings but represents **alternate scans** of the same work, not size variants. Ignore it for our purposes; always use the currently-displayed image src.

### Image Size Variants

Investigated across 10 diverse paintings. All variants preserve aspect ratio.

| WikiArt suffix | Approx. max dimension | Availability |
|---|---|---|
| `!Portrait.jpg` | 400px | Usually present |
| `!Blog.jpg` | 500px | Usually present |
| `!PinterestSmall.jpg` | 210px wide (ignores height) | Usually present |
| `!Large.jpg` | 600px or 750px (varies) | Sometimes 404 |
| `!HD.jpg` | 1200px | Sometimes 404 |
| *(no suffix)* | Original resolution | Always present |

Notes:
- Sizes are relative to original painting dimensions (not fixed pixel targets), which is why `!Large` can be either 600 or 750 depending on the source.
- `!Large` missing implies `!HD` missing. The smaller variants (Portrait, Blog) appear more reliably but cannot be guaranteed.
- Fallback strategy: if the preferred size returns 404, use the original (no suffix) — it always exists and is the highest resolution available.

### Page URL pattern

`wikiart.org/en/{artist-slug}/{painting-slug}`

Artist pages follow: `wikiart.org/en/{artist-slug}/all-works/text-list` (not in scope yet).

---

## WikiArt Official API

- Registration at `wikiart.org/en/App/GetApi`
- Issues `accessCode` / `secretCode` pair
- Read-only; intended for researchers/developers
- `?json=2` appended to URLs returns JSON, but for painting detail pages returns a list (artist's works), not the specific painting's detail data — not useful for our purposes
- Upside over DOM scraping: stability against site redesigns
- Downside: depends on WikiArt's goodwill; registration process poorly documented publicly
- **Not pursued for now; worth revisiting if DOM scraping becomes brittle**

---

## AnkiConnect

- Local HTTP API on port 8765, auto-starts when Anki opens
- All responses: `{ "result": ..., "error": ... }`
- CORS: extension origin must be whitelisted in AnkiConnect config (one-time user setup)

### Relevant actions

| Action | Purpose |
|---|---|
| `deckNames` | List all decks |
| `modelNames` | List all notetypes |
| `modelFieldNames` | Get fields for a notetype |
| `storeMediaFile` | Download image from URL into Anki media folder; accepts `{ url, filename }` — we control the filename |
| `addNote` | Create a note |

`storeMediaFile` does not resize; it stores whatever URL you give it. Image size selection must happen before calling it (i.e. pick the right WikiArt size variant).
