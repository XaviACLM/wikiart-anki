# Research Notes

## WikiArt Data Extraction

### Method: DOM Scraping

The WikiArt painting detail page is Angular (client-side rendered), but a Chrome content script runs after full page load, so the DOM is fully populated. DOM scraping is the right approach.

The page uses Schema.org microdata (`itemprop` attributes) for several fields, which are more stable than arbitrary class names.

### DOM Structure (painting detail page)

All painting metadata lives inside `div.wiki-layout-artwork-info[itemscope][itemtype="https://schema.org/Painting"]`.

**Main article** (`article[ng-init]` inside the above div) contains an `<h3>` (title), an `<h5 itemprop="creator">` (artist), and a `<ul>` of metadata `<li>`s. Each `<li>` has an `<s>` label element followed by the value. Labels found: "Original Title:", "Date:", "Style:", "Period:", "Genre:", "Media:". Order varies between paintings.

**Aside** (also inside the wrapper div) contains copyright (`div.copyright-wrapper`) and last-edit (`div.text-info > span`).

### Selectors

| Field | Method | Selector / notes |
|---|---|---|
| title | XPath | `//article/h3` |
| artist | XPath | `//article/h5[@itemprop='creator']//span[@itemprop='name']/a` |
| originalTitle | XPath | `//li[.//s[contains(.,'Original Title:')]]/text()[normalize-space()]` — bare text node after the `<s>` |
| displayDate | XPath | `//li[.//s[contains(.,'Date:')]]//span[@itemprop='dateCreated']` |
| location | querySelector | First `<span>` child of date `<li>`; get full `textContent`, split on first `";"`, take remainder. Two formats observed: explicit `span[itemprop="locationCreated"]` (with nested name span + bare text node), or bare text node with no itemprop. |
| style | XPath | `//li[.//s[contains(.,'Style:')]]/span/a` (li has class `dictionary-values`) |
| period | XPath | `//li[.//s[contains(.,'Period:')]]/a` |
| genre | XPath | `//li[.//s[contains(.,'Genre:')]]/span/a` |
| medium | XPath | `//li[.//s[contains(.,'Media:')]]/span/a` |
| copyright | querySelector | `div.copyright-wrapper`. Two formats: (a) two `<a>`s with classes `copyright-author` + `copyright-clear`, combined as "Author / License"; (b) single `<a class="copyright">` with full text (e.g. "Public Domain") |
| lastEdit | XPath | `//aside//div[contains(@class,'text-info')]/span` |
| image | querySelector | `img[itemprop="image"]`, fallback `.wiki-layout-artist-image-wrapper img` |

The `image-variants-container` element (present on some paintings) represents alternate scans of the same work, not size variants — ignore it.

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
- CORS: in testing, no CORS whitelist change was required — AnkiConnect's default config accepted requests from the extension origin

### Relevant actions

| Action | Purpose |
|---|---|
| `deckNames` | List all decks |
| `modelNames` | List all notetypes |
| `modelFieldNames` | Get fields for a notetype |
| `storeMediaFile` | Download image from URL into Anki media folder; accepts `{ url, filename }` — we control the filename |
| `addNote` | Create a note |

`storeMediaFile` does not resize; it stores whatever URL you give it. Image size selection must happen before calling it (i.e. pick the right WikiArt size variant).
