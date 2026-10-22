"""Get photographs ready for the site.

Drop originals (any size) into /images, then run from the project folder:

    python tools/prepare_photos.py
    python tools/prepare_photos.py --cover IMG_5778     # also choose the cover

For every original it makes two web copies (originals are never changed):

    images/web/NAME.jpg         2400px long edge, for the full-screen viewer
    images/web/thumb/NAME.jpg   1200px long edge, for the grid and the cover

Camera data, including any GPS location, is left out of the copies.

It then rewrites js/photos.js: new photos are added as "Untitled" with the
date the camera recorded, photos whose original is gone are dropped (with
their web copies), and titles you have already written are kept.

Needs Pillow:  python -m pip install Pillow
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ORIGINALS = ROOT / "images"
WEB = ORIGINALS / "web"
THUMBS = WEB / "thumb"
DATA = ROOT / "js" / "photos.js"

SIZES = (            # folder, long edge in px, JPEG quality
    (WEB, 2400, 82),
    (THUMBS, 1200, 80),
)
EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}

HEADER = """/*
 * Portfolio contents. Written by tools/prepare_photos.py, and safe to edit
 * by hand (rerunning the tool keeps your titles).
 *
 *   artist  Name on the viewer's wall label.
 *   cover   File name (no extension) of the photograph on the opening screen.
 *   photos  One entry per photograph. The site always shows them newest
 *           first, so their order here doesn't matter.
 *
 *     file    The original's name in /images, without the extension.
 *     title   Shown in italics.
 *     date    When it was taken, as YYYY-MM-DDTHH:MM:SS (from the camera).
 *     width, height   Pixel size. Only the ratio is used.
 *
 * This is JSON inside JavaScript: keep the double quotes, and no comma after
 * the last item of a list.
 */
"""


def load():
    """The current photos.js data, or a fresh start if it isn't JSON yet."""
    try:
        text = DATA.read_text(encoding="utf-8")
        body = text.split("window.PORTFOLIO =", 1)[1].strip().rstrip(";")
        return json.loads(body)
    except (FileNotFoundError, IndexError, ValueError):
        return {"artist": "Ben Nguyen", "cover": None, "photos": []}


def capture_date(image):
    """The camera's DateTimeOriginal as YYYY-MM-DDTHH:MM:SS, or None."""
    exif = image.getexif()
    stamp = exif.get_ifd(0x8769).get(36867) or exif.get(306)
    if not stamp:
        return None
    day, time = str(stamp).strip().split(" ")[:2]
    return f"{day.replace(':', '-')}T{time[:8]}"


def export(image, icc, target, long_edge, quality):
    copy = image.copy()
    copy.thumbnail((long_edge, long_edge), Image.LANCZOS)
    copy.save(target, "JPEG", quality=quality, optimize=True, progressive=True, icc_profile=icc)


def write(data):
    photos = ",\n".join("    " + json.dumps(p, ensure_ascii=False) for p in data["photos"])
    DATA.write_text(
        HEADER
        + "\nwindow.PORTFOLIO = {\n"
        + f'  "artist": {json.dumps(data["artist"], ensure_ascii=False)},\n'
        + f'  "cover": {json.dumps(data["cover"])},\n'
        + f'  "photos": [\n{photos}\n  ]\n'
        + "};\n",
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cover", help="file name (no extension) of the opening photograph")
    args = parser.parse_args()

    data = load()
    known = {p["file"]: p for p in data["photos"] if "file" in p}
    for folder, _, _ in SIZES:
        folder.mkdir(parents=True, exist_ok=True)

    originals = sorted(p for p in ORIGINALS.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS)
    names = {p.stem for p in originals}
    photos, made, undated = [], 0, []

    for original in originals:
        name = original.stem
        entry = known.get(name, {})
        targets = [(folder / f"{name}.jpg", edge, quality) for folder, edge, quality in SIZES]
        stale = any(not t.exists() or t.stat().st_mtime < original.stat().st_mtime for t, _, _ in targets)

        if stale or not entry:
            with Image.open(original) as image:
                date = capture_date(image)
                icc = image.info.get("icc_profile")
                upright = ImageOps.exif_transpose(image).convert("RGB")
            if stale:
                for target, edge, quality in targets:
                    export(upright, icc, target, edge, quality)
                made += 1
            width, height = upright.size
        else:
            date, width, height = entry.get("date"), entry["width"], entry["height"]

        date = entry.get("date") or date
        if not date:
            undated.append(name)
        photos.append({
            "file": name,
            "title": entry.get("title", "Untitled"),
            "date": date or "",
            "width": width,
            "height": height,
        })

    # Web copies whose original has been deleted go too.
    removed = []
    for folder, _, _ in SIZES:
        for copy in folder.glob("*.jpg"):
            if copy.stem not in names:
                copy.unlink()
                removed.append(copy.name)

    photos.sort(key=lambda p: p["date"], reverse=True)
    data["photos"] = photos
    if args.cover:
        data["cover"] = args.cover
    write(data)

    size = sum(f.stat().st_size for folder, _, _ in SIZES for f in folder.glob("*.jpg")) / 1e6
    print(f"{len(photos)} photographs, {made} new or updated, web copies {size:.1f} MB in total.")
    if removed:
        print(f"Removed web copies with no original: {', '.join(sorted(set(removed)))}")
    if data.get("cover") and data["cover"] not in names:
        print(f"Warning: cover '{data['cover']}' has no original in /images; the newest photo is used instead.")
    if undated:
        print(f"No camera date found for: {', '.join(undated)}. Add a date to these in js/photos.js.")


if __name__ == "__main__":
    main()
