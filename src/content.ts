import type { Painting, MessageToContent, MessageFromContent } from "./types";

// --- Page type detection ---

function isPaintingPage(): boolean {
  // Painting pages: wikiart.org/{lang}/{artist}/{painting}
  // Pathname has exactly three non-empty segments: language, artist, painting
  const parts = location.pathname.split("/").filter(Boolean);
  return parts.length === 3;
}

// --- Field extraction helpers ---

function extractText(xpath: string): string | null {
  try {
    const result = document.evaluate(
      xpath, document, null, XPathResult.STRING_TYPE, null
    );
    const val = result.stringValue.trim();
    return val.length > 0 ? val : null;
  } catch {
    return null;
  }
}

function extractMultiText(xpath: string): string | null {
  // Joins multiple matched text values with ", "
  try {
    const result = document.evaluate(
      xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
    );
    const values: string[] = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      const text = (result.snapshotItem(i) as Node).textContent?.trim();
      if (text) values.push(text);
    }
    return values.length > 0 ? values.join(", ") : null;
  } catch {
    return null;
  }
}

function extractCopyright(): string | null {
  // Copyright lives in div.copyright-wrapper in the aside.
  // Two formats observed:
  //   (a) Two <a>s: one with class containing "copyright-author", one "copyright-clear"
  //       e.g. "Rene Magritte" + "Fair Use" → combined as "Rene Magritte / Fair Use"
  //   (b) Single <a class="copyright"> with the full text e.g. "Public Domain"
  // <i> icons inside the <a>s have no text content so textContent naturally skips them.
  try {
    const wrapper = document.querySelector(".copyright-wrapper");
    if (!wrapper) return null;

    const authorEl  = wrapper.querySelector<HTMLElement>("a[class*='copyright-author']");
    const licenseEl = wrapper.querySelector<HTMLElement>("a[class*='copyright-clear']");

    if (authorEl || licenseEl) {
      const parts: string[] = [];
      const authorText  = authorEl?.textContent?.trim();
      const licenseText = licenseEl?.textContent?.trim();
      if (authorText)  parts.push(authorText);
      if (licenseText) parts.push(licenseText);
      return parts.length > 0 ? parts.join(" / ") : null;
    }

    // Fallback: single copyright link
    const singleEl = wrapper.querySelector<HTMLElement>("a[class*='copyright']");
    return singleEl?.textContent?.trim() || null;
  } catch {
    return null;
  }
}

function extractDateLiText(): string | null {
  // Returns the text content of the Date <li>, with the "Date:" label stripped.
  // e.g. "1955; Brussels, Belgium" or "c. 1300 BC"
  try {
    const dateLi = document.evaluate(
      "//li[.//s[contains(.,'Date:')]]",
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue as Element | null;
    if (!dateLi) return null;
    const text = dateLi.textContent ?? "";
return text.replace(/^[\s\S]*?Date:\s*/i, "").trim() || null;
  } catch {
    return null;
  }
}

function extractDisplayDate(): string | null {
  const text = extractDateLiText();
  if (!text) return null;
  const semicolon = text.indexOf(";");
  const part = semicolon === -1 ? text : text.slice(0, semicolon);
  return part.trim() || null;
}

function extractLocation(): string | null {
  const text = extractDateLiText();
  if (!text) return null;
  const semicolon = text.indexOf(";");
  if (semicolon === -1) return null;
  return text.slice(semicolon + 1).trim() || null;
}

// Best-effort extraction of a sort year from a raw date string.
// Strips circa prefixes, finds the first 3-4 digit year, handles BC/BCE,
// then offsets by +20000 so that years sort lexicographically.
// Returns null if no year can be extracted.
function computeSortDate(raw: string | null): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/^(c\.|ca\.|circa|~|\?)\s*/i, "").trim();
  const match = stripped.match(/\b(\d{3,4})\b/);
  if (!match) return null;
  let year = parseInt(match[1], 10);
  if (/\bBC\b|\bBCE\b/i.test(stripped)) year = -year;
  return String(year + 200000);
}

function extractImageUrl(): string | null {
  try {
    const img = document.querySelector<HTMLImageElement>('img[itemprop="image"]')
      ?? document.querySelector<HTMLImageElement>(".wiki-layout-artist-image-wrapper img");
    return img?.src ?? null;
  } catch {
    return null;
  }
}

// --- Main extraction ---

function extractPainting(): Painting {
  const rawDate = extractText(
    "//li[.//s[contains(.,'Date:')]]//span[@itemprop='dateCreated']"
  );

  return {
    title: extractText("//article/h3"),

    artist: extractText(
      "//article/h5[@itemprop='creator']//span[@itemprop='name']/a"
    ),

    // Bare text node in the <li>, after the <s> label element
    originalTitle: extractText(
      "//li[.//s[contains(.,'Original Title:')]]/text()[normalize-space()]"
    ),

    displayDate: extractDisplayDate(),
    sortDate: computeSortDate(rawDate),

    location: extractLocation(),

    // Style <li> has class "dictionary-values": <s/> <span><a>value</a></span> <a/>
    style: extractMultiText(
      "//li[.//s[contains(.,'Style:')]]/span/a"
    ),

    // Period <li>: <s/> <a>value</a>
    period: extractText(
      "//li[.//s[contains(.,'Period:')]]/a"
    ),

    // Genre <li> same layout as Style
    genre: extractMultiText(
      "//li[.//s[contains(.,'Genre:')]]/span/a"
    ),

    // Medium: selector to be verified — may need adjustment based on actual DOM
    medium: extractMultiText(
      "//li[.//s[contains(.,'Media:')]]/span/a"
    ),

    currentLocation: extractText(
      "//li[.//s[contains(.,'Location:')]]/span"
    ),

    imageUrl: extractImageUrl(),

    pageUrl: window.location.href,

    copyright: extractCopyright(),

    // LastEdit is a <span> direct child of div.text-info in the aside
    lastEdit: extractText(
      "//aside//div[contains(@class,'text-info')]/span"
    ),
  };
}

// --- Message listener ---

chrome.runtime.onMessage.addListener(
  (message: MessageToContent, _sender, sendResponse: (r: MessageFromContent) => void) => {
    if (message.type !== "GET_PAINTING_DATA") return;

    if (!isPaintingPage()) {
      console.warn("[wikiart-anki] isPaintingPage() returned false. pathname:", location.pathname);
      sendResponse({ type: "NOT_A_PAINTING_PAGE" });
      return;
    }

    const data = extractPainting();
    const allNull = Object.entries(data)
      .filter(([k]) => !["sortDate", "originalTitle", "location"].includes(k))
      .every(([, v]) => v === null);

    if (allNull) {
      sendResponse({
        type: "EXTRACTION_FAILED",
        reason: "Could not read page data — the site layout may have changed.",
      });
      return;
    }

    sendResponse({ type: "PAINTING_DATA", data });
  }
);
