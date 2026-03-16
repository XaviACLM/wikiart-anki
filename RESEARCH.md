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

Images are stored in a `data-image-url` attribute inside an `image-variants-container` list — WikiArt explicitly serves multiple sizes. The URL seen in the browser address bar (e.g. `banquet-1955(1).jpg!Large.jpg`) is a CDN size-suffixed URL; the `data-image-url` values are cleaner.

**TODO: Image size investigation needed before implementing image selection.**
- Grab a sample of ~10 paintings and inspect their `image-variants-container`
- Confirm what size suffixes are consistently available (e.g. `!Large`, `!Blog`, `!PinterestSmall`, `!HD`)
- Determine whether sizes are fixed pixel dimensions or relative to original painting size
- If relative: a painting that's originally tiny will still be tiny at `!Large` — this affects whether a simple "preferred size" config option is sufficient or whether we need a max-dimension cap

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
