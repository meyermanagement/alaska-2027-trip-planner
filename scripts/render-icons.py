# Rasterizes the marks in logo/ into the files public/ actually serves.
#
# The five sources in logo/ are the truth; these outputs are that truth at the
# sizes each surface asks for. Chromium does the drawing rather than a library,
# because the tab SVG is read by a browser and the PNGs should agree with it.
#
#   python scripts/render-icons.py
#
# Writes: public/alyeska-icon.png, public/alyeska-icon-maskable.png,
# public/alyeska-touch.png, public/alyeska-tab-<hash>.svg,
# public/alyeska-tab-<hash>.ico and public/favicon.ico.
#
# The two tab files carry the first six characters of the SVG's own SHA-256 in
# their names, because Safari files an icon under its address and will not look
# again at one it already knows. After running this, the printed hashes have to
# be pasted into the two `icons` lines in app/layout.js, and the old tab files
# deleted. The script does not edit the layout for you: the rename is the whole
# point of the hash and should be a visible change in the diff.
#
# The email mark (logo/email-mark.svg -> public/alyeska-mark.png) is deliberately
# not in this list. It is Daybreak, it sits on a pale email card with no tile
# behind it, and mail already sent keeps the mark it was sent with -- so it is
# re-rendered only when that source itself changes, by adding it back here with
# transparent=True.

import hashlib
import pathlib
import struct
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGO = ROOT / "logo"
PUB = ROOT / "public"

# source, output, rendered size, transparent
PNGS = [
    ("app-icon.svg", "alyeska-icon.png", 512, False),
    ("app-icon-maskable.svg", "alyeska-icon-maskable.png", 512, False),
    ("apple-touch-icon.svg", "alyeska-touch.png", 180, False),
]

# The frames a browser asking for favicon.ico expects to find in it.
ICO_SIZES = [16, 32, 48]


def shoot(page, svg_path, px, transparent):
    """Render one SVG at px square and return the PNG bytes."""
    svg = svg_path.read_text()
    page.set_content(
        "<style>html,body{margin:0;padding:0;background:"
        f"{'transparent' if transparent else '#0b1322'}"
        "}svg{display:block}</style>"
        # The declared width/height in the source is overridden here so one
        # source can be rendered at several sizes for the .ico.
        + svg.replace("<svg ", f'<svg width="{px}" height="{px}" ', 1)
    )
    page.wait_for_timeout(120)
    # Clipped out of a larger viewport rather than shot at its own size, because
    # Chromium refuses to capture a 16-pixel page at all.
    return page.screenshot(
        omit_background=transparent,
        clip={"x": 0, "y": 0, "width": px, "height": px},
    )


def ico(frames):
    """Pack {size: png bytes} into an .ico container.

    Assembled by hand because Pillow's append_images quietly redrew every frame
    from the largest one, and a 48-pixel drawing shrunk to 16 turns this needle's
    arms into a smudge. Each frame here is its own render at its own size.
    """
    head = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries = b""
    data = b""
    for px, png in sorted(frames.items()):
        entries += struct.pack(
            "<BBBBHHII", px % 256, px % 256, 0, 0, 1, 32, len(png), offset
        )
        data += png
        offset += len(png)
    return head + entries + data


def main():
    if not (LOGO / "favicon.svg").exists():
        sys.exit("logo/ sources not found")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # A viewport large enough for every size asked for below; each render is
        # clipped out of its top-left corner.
        page = browser.new_page(
            viewport={"width": 640, "height": 640}, device_scale_factor=1
        )

        for src, out, px, transparent in PNGS:
            (PUB / out).write_bytes(shoot(page, LOGO / src, px, transparent))
            print(f"public/{out}  {px}px")

        # The tab, twice: the SVG a modern browser reads, and an .ico for the
        # ones that ask for that file by name.
        tab_svg = (LOGO / "favicon.svg").read_text()
        digest = hashlib.sha256(tab_svg.encode()).hexdigest()[:6]
        (PUB / f"alyeska-tab-{digest}.svg").write_text(tab_svg)

        blob = ico(
            {px: shoot(page, LOGO / "favicon.svg", px, True) for px in ICO_SIZES}
        )
        for name in (f"alyeska-tab-{digest}.ico", "favicon.ico"):
            (PUB / name).write_bytes(blob)
            print(f"public/{name}  {', '.join(str(p) for p in ICO_SIZES)}px")
        print(f"public/alyeska-tab-{digest}.svg")
        browser.close()

    print(f"\ntab hash: {digest}")
    print("Paste it into both icons lines in app/layout.js and delete the old")
    print("public/alyeska-tab-* files, or browsers that know the old address")
    print("will go on showing the old mark.")


if __name__ == "__main__":
    main()
