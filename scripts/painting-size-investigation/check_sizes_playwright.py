#!/usr/bin/env python3
"""
Investigates WikiArt image URL patterns and size variants using Playwright
for real browser rendering.

Setup (once):
    pip install -r requirements.txt
    playwright install chromium

For each painting:
  - Navigates to the page, waits for full render
  - Grabs the main painting image src from the DOM via itemprop="image"
  - Strips any existing size suffix to get the base URL
  - Tests known variants (original, !Large, !HD)
  - Probes a list of candidates to discover any others
  - Reports pixel dimensions and file size for all working variants
"""

import io
import re
import requests
from PIL import Image
from playwright.sync_api import sync_playwright

SLUGS = [
    "rene-magritte/banquet-1955",
    "kay-sage/tomorrow-is-never-1955",
    "anders-zorn/a-portrait-of-the-daughters-of-ramon-subercasseaux",
    "raphael-kirchner/ziegfeld-beauty",
    "michelangelo-pistoletto/bed-1976",
    "bill-traylor/untitled-two-dogs-fighting-1939",
    "adam-baltatu/sighi-oara",
    "ni-zan/trees-in-a-river-valley-in-y-shan-1371",
    "mustafa-rakim/tekke-levha",
    "james-turrell/sustaining-light-2007",
]

KNOWN_SUFFIXES: list[str | None] = [None, "Large", "HD"]  # None = original (no suffix)
PROBE_SUFFIXES = [
    "Blog", "PinterestSmall", "Square", "Portrait",
    "Big", "Original", "Full", "Max", "Preview",
    "Thumb", "Mini", "200", "Large2",
]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def strip_suffix(src: str) -> str:
    """Strip any !SUFFIX.ext from the end of a WikiArt image URL."""
    return re.sub(r"![^.]+\.[a-z]+$", "", src, flags=re.IGNORECASE)


def make_variant_url(base: str, suffix: str | None) -> str:
    if suffix is None:
        return base
    return f"{base}!{suffix}.jpg"


def probe_url(url: str, session: requests.Session) -> tuple | str:
    """
    Download url and return (width, height, size_kb), or a string describing the failure.
    """
    try:
        resp = session.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        if resp.status_code == 404:
            return "404"
        resp.raise_for_status()
        data = resp.content
        size_kb = len(data) // 1024
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        return (w, h, size_kb)
    except Exception as e:
        return f"error: {e}"


def check_painting(slug: str, session: requests.Session, page) -> None:
    url = f"https://www.wikiart.org/en/{slug}"
    print(f"\n{'=' * 68}")
    print(f"  {slug}")

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_selector('img[itemprop="image"]', timeout=15_000)
    except Exception as e:
        print(f"  ERROR loading page: {e}")
        return

    # Prefer itemprop="image"; fall back to wrapper-based selector
    img_el = page.query_selector('img[itemprop="image"]')
    if not img_el:
        img_el = page.query_selector(".wiki-layout-artist-image-wrapper img")
    if not img_el:
        print("  ERROR: could not locate main painting <img> element")
        return

    src = img_el.get_attribute("src") or ""
    if not src:
        print("  ERROR: <img> has no src attribute")
        return

    print(f"  DOM src : {src}")
    base = strip_suffix(src)
    print(f"  Base URL: {base}")

    print()
    print(f"  {'Variant':<22} {'Dimensions':>14}  {'Size':>8}")
    print(f"  {'-' * 22} {'-' * 14}  {'-' * 8}")

    found_extra: list[str] = []

    for suffix in KNOWN_SUFFIXES + PROBE_SUFFIXES:
        variant_url = make_variant_url(base, suffix)
        label = f"!{suffix}" if suffix is not None else "(original)"
        result = probe_url(variant_url, session)

        if result == "404":
            if suffix in KNOWN_SUFFIXES:
                print(f"  {label:<22} {'404':>14}")
            # silently skip 404 probes
        elif isinstance(result, str):
            print(f"  {label:<22} {result}")
        else:
            w, h, size_kb = result
            dims = f"{w} x {h}"
            print(f"  {label:<22} {dims:>14} {size_kb:>6} KB - AR {w/h}")
            if suffix not in KNOWN_SUFFIXES:
                found_extra.append(label)

    if found_extra:
        print(f"\n  ** Extra working variants found: {', '.join(found_extra)}")


def main() -> None:
    print("WikiArt image size variant investigation (Playwright)")
    print(f"Checking {len(SLUGS)} paintings...\n")

    with sync_playwright() as p:
        # Uses system Edge installation — no separate browser download needed.
        # If Edge isn't found, try Brave: p.chromium.launch(executable_path=r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe")
        browser = p.chromium.launch(channel="msedge", headless=False)
        context = browser.new_context(user_agent=USER_AGENT)
        pw_page = context.new_page()

        with requests.Session() as session:
            for slug in SLUGS:
                check_painting(slug, session, pw_page)

        browser.close()

    print(f"\n{'=' * 68}")
    print("Done.")


if __name__ == "__main__":
    main()
