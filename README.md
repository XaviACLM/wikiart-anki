# wikiart-anki

A Chrome extension that adds paintings from WikiArt to Anki with one click.

## Requirements

- Anki must be running with the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on installed.
- You need an existing Anki notetype for art. The extension does not create one for you.

## Setup

1. Install the extension.
2. Open its settings page and configure: which deck to add to, which notetype to use, and which notetype fields should receive which painting data.
3. Make sure Anki is running whenever you want to use it.

## Usage

Navigate to any painting page on WikiArt (e.g. `wikiart.org/en/artist/painting-name`). Click the extension icon. A popup appears with the extracted data pre-filled and editable — review it, adjust anything that looks wrong, then click Add. The card is added to your Anki deck immediately.

If a field is highlighted, it means the extension couldn't extract a value for it. Some fields are inconsistently present on WikiArt (original title, medium, location, period), so occasional blanks are expected.

## Supported fields

The extension extracts the following painting data from WikiArt:

- Title, Artist, Original Title
- Date (display) — the raw date string as shown on the page
- Date (sort) — a derived numeric value for lexicographic sorting (year offset by +200,000 so BC years sort correctly)
- Location created, Current location (museum or collection)
- Style, Period, Genre, Medium
- Image (downloaded into Anki's media folder via AnkiConnect)
- Copyright, Last edited
- Page URL

WikiArt's painting schema has many more fields than this. The extension only covers a curated subset — the ones that are reliably present in the DOM and likely to be useful in an Anki card. Adding support for every possible field would require a lot of fragile scraping for diminishing returns, so that's a deliberate non-goal.

## Notes

- The extension only works on English WikiArt pages. If you're on a non-English version, the popup will offer to redirect you.
- WikiArt is client-side rendered. The extension reads the live DOM, so it requires the page to be fully loaded before clicking.
- If WikiArt changes its page layout, some fields may stop extracting correctly. The extension will flag missing data but won't crash.

## Possible future extensions

The architecture is set up to support other art websites (ArtStation, museum collection pages, etc.) without major restructuring — the extraction logic is isolated per page type. This isn't implemented yet.

## Source

[github.com/XaviACLM/wikiart-anki](https://github.com/XaviACLM/wikiart-anki)
