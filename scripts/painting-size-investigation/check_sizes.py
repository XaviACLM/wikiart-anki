#!/usr/bin/env python3
"""
Investigates WikiArt image size variants for a set of paintings.

For each painting, fetches its detail page, extracts all image size variants
from the image-variants-container, downloads each one, and reports:
  - size suffix (e.g. !Large, !HD)
  - pixel dimensions (W x H)
  - file size in KB

This tells us whether WikiArt's size variants are fixed pixel dimensions or
relative to the original painting size, and what suffixes are consistently available.

If no image-variants-container is found, it likely means the page is client-side
rendered (requests got the pre-JS shell) or the slug is wrong.
"""

import io
import requests
from lxml import html
from PIL import Image

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

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def extract_suffix(url: str) -> str:
    """
    Extract the size suffix from a WikiArt CDN URL.
    e.g. 'https://.../banquet-1955.jpg!Large.jpg' -> '!Large'
         'https://.../banquet-1955.jpg'            -> '(none)'
    """
    if "!" not in url:
        return "(none)"
    after_bang = url.split("!")[-1]
    # Strip trailing extension e.g. 'Large.jpg' -> 'Large'
    suffix = after_bang.split(".")[0]
    return f"!{suffix}"


def get_image_info(url: str, session: requests.Session) -> tuple | None:
    """
    Download image fully and return (width, height, size_kb).
    Returns None on any failure.
    """
    try:
        resp = session.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.content
        size_kb = len(data) // 1024
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        return w, h, size_kb
    except Exception as e:
        return None


def check_painting(slug: str, session: requests.Session) -> None:
    page_url = f"https://www.wikiart.org/en/{slug}"
    print(f"\n{'=' * 64}")
    print(f"  {slug}")
    print(f"  {page_url}")

    try:
        resp = session.get(page_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.HTTPError as e:
        print(f"  ERROR fetching page: HTTP {e.response.status_code}")
        return
    except Exception as e:
        print(f"  ERROR fetching page: {e}")
        return

    tree = html.fromstring(resp.content)

    variant_urls = tree.xpath(
        '//ul[contains(@class,"image-variants-container")]//a/@data-image-url'
    )

    if not variant_urls:
        print("  WARNING: no image-variants-container found in page HTML.")
        print("  This likely means either:")
        print("    (a) the page is fully client-side rendered (requests got the JS shell)")
        print("    (b) the slug is wrong")
        # Diagnostic: count img tags so we can tell (a) from (b)
        img_count = len(tree.xpath("//img/@src"))
        title_text = tree.xpath("//title/text()")
        print(f"  Diagnostic: <img> tags found = {img_count}")
        print(f"  Diagnostic: <title> = {title_text}")
        return

    print(f"  {len(variant_urls)} variant(s) found:\n")
    print(f"  {'Suffix':<20} {'Dimensions':>14}  {'Size':>8}  URL")
    print(f"  {'-'*20} {'-'*14}  {'-'*8}  {'-'*40}")

    for url in variant_urls:
        suffix = extract_suffix(url)
        info = get_image_info(url, session)
        if info:
            w, h, size_kb = info
            dims = f"{w} x {h}"
            print(f"  {suffix:<20} {dims:>14}  {size_kb:>6} KB  {url}")
        else:
            print(f"  {suffix:<20} {'(download failed)':>14}           {url}")


def main() -> None:
    print("WikiArt image size variant investigation")
    print(f"Checking {len(SLUGS)} paintings...\n")

    with requests.Session() as session:
        for slug in SLUGS:
            check_painting(slug, session)

    print(f"\n{'=' * 64}")
    print("Done.")


if __name__ == "__main__":
    main()
